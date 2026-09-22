import { hashSecret, verifySecret } from '../../lib/password.ts';
import { signAccessToken } from '../../lib/jwt.ts';
import { generateOpaqueToken, sha256 } from '../../lib/tokens.ts';
import { generateOtpCode } from '../../utils/money.ts';
import { AppError } from '../../utils/AppError.ts';
import { recordAudit } from '../../lib/audit.ts';
import {
  createUser,
  findUserByEmail,
  findUserByPhone,
  markPhoneVerified,
  setPasswordHash,
} from '../users/users.repository.ts';
import { createWalletForUser } from '../wallet/wallet.repository.ts';
import { createOtp, consumeOtp, getLatestActiveOtp, incrementOtpAttempts, type OtpPurpose } from './otp.repository.ts';
import {
  findRefreshTokenByHash,
  revokeRefreshToken,
  storeRefreshToken,
} from './refreshToken.repository.ts';
import { env } from '../../config/env.ts';

const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

function normalizePhone(phone: string): string {
  return phone.startsWith('0') ? `+234${phone.slice(1)}` : phone;
}

async function issueOtp(userId: string, purpose: OtpPurpose, channel: string) {
  const code = generateOtpCode();
  const codeHash = await hashSecret(code);
  createOtp(userId, purpose, codeHash, OTP_TTL_MINUTES);
  // No real SMS/email provider is wired up yet, so the OTP is logged here the way a provider
  // webhook or delivery log would surface it. Also echoed back to the caller outside production
  // so the flow is testable end-to-end without needing a live provider.
  console.log(`[MOCK OTP] ${purpose} code for ${channel}: ${code}`);
  return env.isProd ? undefined : code;
}

export async function registerUser(input: { fullName: string; email: string; phone: string; password: string }) {
  const phone = normalizePhone(input.phone);
  if (findUserByEmail(input.email)) throw AppError.conflict('An account with this email already exists');
  if (findUserByPhone(phone)) throw AppError.conflict('An account with this phone number already exists');

  const passwordHash = await hashSecret(input.password);
  const user = createUser({ fullName: input.fullName, email: input.email, phone, passwordHash });
  createWalletForUser(user.id);

  const devOtp = await issueOtp(user.id, 'verify_phone', user.phone);
  recordAudit('user_registered', user.id, undefined);

  return { user, devOtp };
}

export async function verifyPhoneOtp(phone: string, code: string) {
  const user = findUserByPhone(normalizePhone(phone));
  if (!user) throw AppError.notFound('No account found for this phone number');

  const otp = getLatestActiveOtp(user.id, 'verify_phone');
  if (!otp) throw AppError.badRequest('No active verification code. Please request a new one.');
  if (new Date(otp.expires_at).getTime() < Date.now()) throw AppError.badRequest('Code has expired. Please request a new one.');
  if (otp.attempts >= MAX_OTP_ATTEMPTS) throw AppError.tooManyRequests('Too many incorrect attempts. Request a new code.');

  const ok = await verifySecret(code, otp.code_hash);
  if (!ok) {
    incrementOtpAttempts(otp.id);
    throw AppError.badRequest('Incorrect verification code');
  }

  consumeOtp(otp.id);
  markPhoneVerified(user.id);
  recordAudit('phone_verified', user.id, undefined);

  return issueSessionTokens(user.id, user.role);
}

export async function resendPhoneOtp(phone: string) {
  const user = findUserByPhone(normalizePhone(phone));
  if (!user) throw AppError.notFound('No account found for this phone number');
  if (user.phoneVerifiedAt) throw AppError.conflict('Phone number is already verified');
  return issueOtp(user.id, 'verify_phone', user.phone);
}

export async function loginUser(identifier: string, password: string) {
  const user = identifier.includes('@') ? findUserByEmail(identifier) : findUserByPhone(normalizePhone(identifier));
  if (!user) {
    recordAudit('login_failed', null, undefined, { identifier });
    throw AppError.unauthorized('Incorrect email/phone or password');
  }

  const ok = await verifySecret(password, user.passwordHash);
  if (!ok) {
    recordAudit('login_failed', user.id, undefined);
    throw AppError.unauthorized('Incorrect email/phone or password');
  }

  recordAudit('login_succeeded', user.id, undefined);
  return { user, tokens: await issueSessionTokens(user.id, user.role) };
}

export async function issueSessionTokens(userId: string, role: string) {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = generateOpaqueToken();
  const { expiresAt } = storeRefreshToken(userId, sha256(refreshToken));
  return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt };
}

export async function rotateRefreshToken(refreshToken: string) {
  const hash = sha256(refreshToken);
  const stored = findRefreshTokenByHash(hash);
  if (!stored || stored.revoked_at || new Date(stored.expires_at).getTime() < Date.now()) {
    throw AppError.unauthorized('Refresh token is invalid or expired');
  }

  revokeRefreshToken(stored.id);

  const accessToken = signAccessToken({ sub: stored.user_id, role: 'user' });
  const nextRefreshToken = generateOpaqueToken();
  const { expiresAt } = storeRefreshToken(stored.user_id, sha256(nextRefreshToken));

  return { accessToken, refreshToken: nextRefreshToken, refreshTokenExpiresAt: expiresAt, userId: stored.user_id };
}

export function logoutUser(refreshToken: string) {
  const stored = findRefreshTokenByHash(sha256(refreshToken));
  if (stored && !stored.revoked_at) revokeRefreshToken(stored.id);
}

export async function requestPasswordReset(email: string) {
  const user = findUserByEmail(email);
  if (!user) return undefined; // do not reveal whether the email exists
  return issueOtp(user.id, 'reset_password', user.email);
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const user = findUserByEmail(email);
  if (!user) throw AppError.badRequest('Invalid code or email');

  const otp = getLatestActiveOtp(user.id, 'reset_password');
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) {
    throw AppError.badRequest('Code is invalid or has expired');
  }
  const ok = await verifySecret(code, otp.code_hash);
  if (!ok) {
    incrementOtpAttempts(otp.id);
    throw AppError.badRequest('Invalid code or email');
  }

  consumeOtp(otp.id);
  setPasswordHash(user.id, await hashSecret(newPassword));
  recordAudit('password_reset', user.id, undefined);
}
