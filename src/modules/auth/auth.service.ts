import type { AuthError, Session } from '@supabase/supabase-js';
import { query } from '../../db/pool.ts';
import { adminClient, authClient } from '../../lib/supabase.ts';
import { recordAudit } from '../../lib/audit.ts';
import { consumeResetToken, signResetToken } from '../../lib/resetToken.ts';
import { AppError } from '../../utils/AppError.ts';
import { forgetAccessToken } from '../../middleware/auth.ts';
import { createNotification } from '../notifications/notifications.repository.ts';
import { findAuthAccountByEmail, findUserById, isPhoneTaken } from '../users/users.repository.ts';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds at which the access token expires. */
  expiresAt: number;
  expiresIn: number;
}

function toTokens(session: Session): SessionTokens {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    expiresIn: session.expires_in,
  };
}

export function normalizePhone(phone: string): string {
  return phone.startsWith('0') ? `+234${phone.slice(1)}` : phone;
}

/** Translates Supabase Auth failures into API errors without leaking provider internals to clients. */
function fromAuthError(error: AuthError, fallback: string): AppError {
  switch (error.code) {
    case 'weak_password':
      return AppError.badRequest('Password is too weak. Use at least 8 characters with letters and numbers.');
    case 'same_password':
      return AppError.badRequest('New password must be different from your current password.');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return AppError.tooManyRequests('Too many requests. Please wait a minute and try again.');
    case 'otp_expired':
    case 'otp_disabled':
      return new AppError(400, 'invalid_code', 'That code is incorrect or has expired. Request a new one.');
    case 'email_address_invalid':
      return AppError.badRequest('That email address is not accepted.');
    case 'email_address_not_authorized':
      return new AppError(
        502,
        'email_not_deliverable',
        'Email could not be sent: the project is still on Supabase default SMTP, which only delivers to team members. Configure custom SMTP.',
      );
    default:
      console.error(`Supabase Auth error (${error.code ?? error.status}): ${error.message}`);
      return new AppError(502, 'auth_provider_error', fallback);
  }
}

// ---------------------------------------------------------------------------
// Registration + email verification
// ---------------------------------------------------------------------------

export async function registerUser(input: { fullName: string; email: string; phone: string; password: string }, ip?: string) {
  const phone = normalizePhone(input.phone);
  const existing = await findAuthAccountByEmail(input.email);

  if (existing?.confirmed) {
    throw AppError.conflict('An account with this email already exists. Log in instead.');
  }

  if (existing) {
    // Never touch the credentials of an unverified account: whoever holds the mailbox proves ownership with the
    // emailed code. Overwriting here would let a stranger pre-register an email and hijack the real owner's signup.
    await resendSignupCode(input.email);
    return { email: input.email, resent: true };
  }

  if (await isPhoneTaken(phone)) {
    throw AppError.conflict('An account with this phone number already exists.');
  }

  const { data, error } = await authClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName, phone } },
  });
  if (error) throw fromAuthError(error, 'We could not create your account right now. Please try again.');

  recordAudit('user_registered', data.user?.id ?? null, ip);
  return { email: input.email, resent: false };
}

export async function resendSignupCode(email: string) {
  const account = await findAuthAccountByEmail(email);
  // Unknown or already-verified emails get the same silent success so this endpoint cannot be used to probe accounts.
  if (!account || account.confirmed) return;

  const { error } = await authClient().auth.resend({ type: 'signup', email });
  if (error) throw fromAuthError(error, 'We could not send the code right now. Please try again.');
}

export async function verifyEmailCode(email: string, code: string, ip?: string) {
  const client = authClient();
  let result = await client.auth.verifyOtp({ email, token: code, type: 'signup' });
  if (result.error && result.error.code === 'otp_expired') {
    // Projects differ on whether the confirmation OTP is typed 'signup' or 'email'; accept either.
    result = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  }
  const { data, error } = result;
  if (error) throw fromAuthError(error, 'We could not verify your code right now. Please try again.');
  if (!data.session || !data.user) throw new AppError(400, 'invalid_code', 'That code is incorrect or has expired. Request a new one.');

  const user = await findUserById(data.user.id);
  if (!user) throw new AppError(500, 'profile_missing', 'Your account is missing its profile. Contact support.');

  recordAudit('email_verified', user.id, ip);
  await createNotification(user.id, 'welcome', 'Welcome to FluxPay', 'Your email is verified. Set up your transaction PIN to start paying bills.');

  return { user, tokens: toTokens(data.session) };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function loginUser(email: string, password: string, ip?: string) {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === 'email_not_confirmed') {
      throw new AppError(403, 'email_not_verified', 'Verify your email before logging in. We can send you a new code.');
    }
    if (error.code === 'invalid_credentials') {
      recordAudit('login_failed', null, ip, { email });
      throw AppError.unauthorized('Incorrect email or password');
    }
    throw fromAuthError(error, 'We could not log you in right now. Please try again.');
  }

  const user = await findUserById(data.user.id);
  if (!user) throw new AppError(500, 'profile_missing', 'Your account is missing its profile. Contact support.');

  recordAudit('login_succeeded', user.id, ip);
  return { user, tokens: toTokens(data.session) };
}

/** Re-authentication check for sensitive actions (change password, reset PIN). Leaves no session behind. */
export async function assertPasswordCorrect(email: string, password: string) {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    if (error && error.code !== 'invalid_credentials') throw fromAuthError(error, 'We could not check your password right now.');
    throw AppError.unauthorized('Incorrect password');
  }
  await adminClient.auth.admin.signOut(data.session.access_token, 'local').catch(() => {});
}

export async function refreshSession(refreshToken: string) {
  const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) throw AppError.unauthorized('Session expired. Please log in again.');
  return toTokens(data.session);
}

export async function logoutUser(accessToken: string) {
  forgetAccessToken(accessToken);
  // 'local' ends only this device's session. A failure (e.g. already expired) is not worth surfacing.
  await adminClient.auth.admin.signOut(accessToken, 'local').catch(() => {});
}

// ---------------------------------------------------------------------------
// Password recovery: email -> 6-digit code -> short-lived reset token -> new password
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email: string) {
  const account = await findAuthAccountByEmail(email);
  // Identical response whether or not the account exists (and only real, verified accounts get an email).
  if (!account?.confirmed) return;

  const { error } = await authClient().auth.resetPasswordForEmail(email);
  if (error) console.error(`resetPasswordForEmail failed (${error.code ?? error.status}): ${error.message}`);
}

export async function verifyResetCode(email: string, code: string, ip?: string) {
  const { data, error } = await authClient().auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (error || !data.session || !data.user) {
    recordAudit('password_reset_code_failed', null, ip, { email });
    throw error ? fromAuthError(error, 'We could not verify your code right now. Please try again.') : AppError.badRequest('Invalid code');
  }

  // Verifying a recovery code signs the user in. A forgotten-password flow must not leave a live session
  // behind, so end it immediately and hand back a narrow single-purpose token instead.
  await adminClient.auth.admin.signOut(data.session.access_token, 'local').catch(() => {});

  recordAudit('password_reset_code_verified', data.user.id, ip);
  return signResetToken(data.user.id);
}

export async function resetPassword(resetToken: string, newPassword: string, ip?: string) {
  const { userId, release } = await consumeResetToken(resetToken);

  const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    if (error.code === 'weak_password' || error.code === 'same_password') await release();
    throw fromAuthError(error, 'We could not reset your password right now. Please try again.');
  }

  // A reset means "I lost control of this account": end every existing session on every device.
  await query(`delete from auth.sessions where user_id = $1`, [userId]);

  recordAudit('password_reset', userId, ip);
  await createNotification(userId, 'security', 'Password changed', 'Your password was reset. If this was not you, contact support immediately.');
}
