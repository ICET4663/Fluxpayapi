// End-to-end check of the whole API against a REAL Supabase project.
//
//   1. start the API:        npm run dev
//   2. in another terminal:  npm run test:e2e
//
// Email delivery itself (your SMTP provider) cannot be asserted from code, so the 6-digit codes are obtained from
// Supabase's admin generateLink API, which returns the same OTP a real email would carry without sending anything.
// Everything after that (verify-email, verify-reset-code, tokens, sessions) goes through the real HTTP API.
//
// Test users are created with throwaway emails and fully deleted at the end.
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db/pool.ts';
import { adminClient } from '../src/lib/supabase.ts';

const API = (process.env.E2E_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? 'example.com';

let passed = 0;
let failed = 0;
const createdUserIds: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail === undefined ? '' : `  -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
}

interface Res {
  status: number;
  body: any;
}

async function call(method: string, path: string, opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function section(title: string) {
  console.log(`\n${title}`);
}

const PASSWORD = 'Sup3r-Secret-pw';
const NEW_PASSWORD = 'An0ther-Secret-pw';

function uniquePhone() {
  const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return `+23480${digits}`;
}

/** Creates an unverified account and returns the OTP a signup email would contain (no email is sent). */
async function createUnverified(email: string, phone: string) {
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'signup',
    email,
    password: PASSWORD,
    options: { data: { full_name: 'E2E Tester', phone } },
  });
  if (error || !data.properties?.email_otp) throw new Error(`generateLink(signup) failed: ${error?.message ?? 'no otp returned'}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, code: data.properties.email_otp };
}

async function recoveryCode(email: string) {
  const { data, error } = await adminClient.auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data.properties?.email_otp) throw new Error(`generateLink(recovery) failed: ${error?.message ?? 'no otp returned'}`);
  return data.properties.email_otp;
}

async function verifiedUser(label: string) {
  const email = `e2e-${label}-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  const phone = uniquePhone();
  const { code } = await createUnverified(email, phone);
  const res = await call('POST', '/api/auth/verify-email', { body: { email, code } });
  if (res.status !== 200) throw new Error(`could not verify test user: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, phone, token: res.body.tokens.accessToken as string, refreshToken: res.body.tokens.refreshToken as string, id: res.body.user.id as string };
}

async function main() {
  const health = await call('GET', '/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.error(`API is not reachable at ${API} (or its database is down). Start it with: npm run dev`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------------------------------------------
  section('Signup, email verification, login');
  const email = `e2e-main-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  const phone = uniquePhone();
  const { id: mainId, code } = await createUnverified(email, phone);

  const earlyLogin = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  check('login blocked before email is verified', earlyLogin.status === 403 && earlyLogin.body?.error?.code === 'email_not_verified', earlyLogin.body);

  const profileRow = await pool.query('select p.id, w.balance_kobo from profiles p join wallets w on w.user_id = p.id where p.id = $1', [mainId]);
  check('database trigger created profile + wallet on signup', profileRow.rowCount === 1 && Number(profileRow.rows[0].balance_kobo) === 0);

  const wrongCode = await call('POST', '/api/auth/verify-email', { body: { email, code: code === '000000' ? '111111' : '000000' } });
  check('wrong verification code is rejected', wrongCode.status === 400, wrongCode.body);

  const verified = await call('POST', '/api/auth/verify-email', { body: { email, code } });
  check('correct code verifies the email and returns a session', verified.status === 200 && !!verified.body?.tokens?.accessToken, verified.body);
  check('verified user payload has no secrets', verified.body?.user && !('pinHash' in verified.body.user) && verified.body.user.emailVerified === true);

  const login = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  check('login works after verification', login.status === 200 && !!login.body?.tokens?.refreshToken, login.body);
  const badLogin = await call('POST', '/api/auth/login', { body: { email, password: 'wrong-password-123' } });
  check('wrong password -> 401', badLogin.status === 401, badLogin.body);

  let { accessToken: token, refreshToken } = login.body.tokens as { accessToken: string; refreshToken: string };

  const me = await call('GET', '/api/users/me', { token });
  check('GET /users/me with token', me.status === 200 && me.body.user.email === email && me.body.user.hasPin === false, me.body);
  check('GET /users/me without token -> 401', (await call('GET', '/api/users/me')).status === 401);
  check('garbage token -> 401', (await call('GET', '/api/users/me', { token: 'not.a.token' })).status === 401);

  const dupe = await call('POST', '/api/auth/register', { body: { fullName: 'Dupe', email, phone: uniquePhone(), password: PASSWORD } });
  check('registering an already-verified email -> 409', dupe.status === 409, dupe.body);

  const refreshed = await call('POST', '/api/auth/refresh', { body: { refreshToken } });
  check('refresh token yields a new session', refreshed.status === 200 && !!refreshed.body?.tokens?.accessToken, refreshed.body);
  if (refreshed.status === 200) {
    token = refreshed.body.tokens.accessToken;
    refreshToken = refreshed.body.tokens.refreshToken;
  }

  // Replay protection, on a separate session so a detected replay can't disturb the main one. Supabase tolerates
  // reuse of a rotated token (a) within the reuse interval (Auth > Sessions, default 10s) and (b) while its successor is
  // still unused, by handing back that successor; that covers clients that lost a refresh response. A real replay is
  // reusing a token after its successor has itself been rotated, past the interval: that must fail.
  const replayLogin = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  const t0 = replayLogin.body?.tokens?.refreshToken as string;
  const r1 = await call('POST', '/api/auth/refresh', { body: { refreshToken: t0 } });
  const r2 = await call('POST', '/api/auth/refresh', { body: { refreshToken: r1.body?.tokens?.refreshToken } });
  const reuseIntervalSec = Number(process.env.E2E_REFRESH_REUSE_INTERVAL ?? 10);
  console.log(`  … waiting ${reuseIntervalSec + 1}s for the refresh-token reuse interval`);
  await new Promise((r) => setTimeout(r, (reuseIntervalSec + 1) * 1000));
  const tokenReplay = await call('POST', '/api/auth/refresh', { body: { refreshToken: t0 } });
  check('replayed refresh token is rejected', r1.status === 200 && r2.status === 200 && tokenReplay.status === 401, { r1: r1.status, r2: r2.status, replay: tokenReplay.status });

  // -------------------------------------------------------------------------------------------------------------
  section('Password recovery');
  const forgot = await call('POST', '/api/auth/forgot-password', { body: { email: `nobody-${randomUUID().slice(0, 6)}@${DOMAIN}` } });
  check('forgot-password gives the same answer for unknown emails', forgot.status === 200, forgot.body);

  const rc = await recoveryCode(email);
  const badReset = await call('POST', '/api/auth/verify-reset-code', { body: { email, code: rc === '000000' ? '111111' : '000000' } });
  check('wrong recovery code rejected', badReset.status === 400, badReset.body);

  const goodReset = await call('POST', '/api/auth/verify-reset-code', { body: { email, code: rc } });
  check('right recovery code returns a reset token', goodReset.status === 200 && typeof goodReset.body?.resetToken === 'string', goodReset.body);
  const resetToken: string = goodReset.body?.resetToken;

  const noSession = await call('GET', '/api/users/me');
  check('recovery did not leave a usable session behind', noSession.status === 401);

  const weak = await call('POST', '/api/auth/reset-password', { body: { resetToken, newPassword: 'short' } });
  check('weak new password rejected by validation', weak.status === 400, weak.body);

  const doReset = await call('POST', '/api/auth/reset-password', { body: { resetToken, newPassword: NEW_PASSWORD } });
  check('reset-password succeeds', doReset.status === 200, doReset.body);
  const replay = await call('POST', '/api/auth/reset-password', { body: { resetToken, newPassword: 'Third-Secret-pw1' } });
  check('reset token is single-use', replay.status === 400, replay.body);
  check('forged reset token rejected', (await call('POST', '/api/auth/reset-password', { body: { resetToken: 'x'.repeat(40), newPassword: NEW_PASSWORD } })).status === 400);

  const oldPw = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  check('old password no longer works', oldPw.status === 401, oldPw.body);
  const stale = await call('GET', '/api/users/me', { token });
  const staleRefresh = await call('POST', '/api/auth/refresh', { body: { refreshToken } });
  check('reset signed out existing sessions', stale.status === 401 || staleRefresh.status === 401, { stale: stale.status, refresh: staleRefresh.status });

  const newLogin = await call('POST', '/api/auth/login', { body: { email, password: NEW_PASSWORD } });
  check('login with the new password', newLogin.status === 200, newLogin.body);
  token = newLogin.body.tokens.accessToken;

  // -------------------------------------------------------------------------------------------------------------
  section('Change password + logout');
  const wrongCurrent = await call('POST', '/api/users/me/password', { token, body: { currentPassword: 'nope-nope-nope', newPassword: PASSWORD } });
  check('change password needs the correct current password', wrongCurrent.status === 401, wrongCurrent.body);
  const change = await call('POST', '/api/users/me/password', { token, body: { currentPassword: NEW_PASSWORD, newPassword: PASSWORD } });
  check('change password succeeds', change.status === 200, change.body);
  check('current session survives a password change', (await call('GET', '/api/users/me', { token })).status === 200);

  const relog = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  token = relog.body.tokens.accessToken;
  const out = await call('POST', '/api/auth/logout', { token });
  check('logout -> 204', out.status === 204, out.body);
  await new Promise((r) => setTimeout(r, 10_500)); // outlast the 10s token-validation cache
  check('token is rejected after logout', (await call('GET', '/api/users/me', { token })).status === 401);

  const again = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  token = again.body.tokens.accessToken;

  // -------------------------------------------------------------------------------------------------------------
  section('Transaction PIN');
  const buyNoPin = await call('POST', '/api/services/airtime', { token, body: { network: 'mtn', phone: '08031234567', amount: 100, pin: '1234' } });
  check('purchase without a PIN set is refused', buyNoPin.status === 403, buyNoPin.body);

  check('PIN must be 4 digits', (await call('POST', '/api/users/me/pin', { token, body: { pin: '12' } })).status === 400);
  const setPin = await call('POST', '/api/users/me/pin', { token, body: { pin: '1234' } });
  check('set PIN', setPin.status === 200, setPin.body);
  check('changing PIN requires the current one', (await call('POST', '/api/users/me/pin', { token, body: { pin: '4321' } })).status === 400);
  const changePin = await call('POST', '/api/users/me/pin', { token, body: { pin: '4321', currentPin: '1234' } });
  check('change PIN with current PIN', changePin.status === 200, changePin.body);
  check('old PIN no longer valid', (await call('POST', '/api/users/me/pin/verify', { token, body: { pin: '1234' } })).status === 401);
  check('new PIN valid', (await call('POST', '/api/users/me/pin/verify', { token, body: { pin: '4321' } })).status === 200);
  const resetPinBad = await call('POST', '/api/users/me/pin/reset', { token, body: { password: 'wrong-pass-123', pin: '1234' } });
  check('PIN reset needs the account password', resetPinBad.status === 401, resetPinBad.body);
  const resetPinOk = await call('POST', '/api/users/me/pin/reset', { token, body: { password: PASSWORD, pin: '1234' } });
  check('PIN reset with account password', resetPinOk.status === 200, resetPinOk.body);
  const PIN = '1234';

  // -------------------------------------------------------------------------------------------------------------
  section('Wallet funding (mock gateway)');
  const w0 = await call('GET', '/api/wallet', { token });
  check('new wallet starts at 0', w0.status === 200 && w0.body.wallet.balance === 0, w0.body);

  const init = await call('POST', '/api/wallet/fund/initialize', { token, body: { amount: 10_000 } });
  check('initialize funding', init.status === 201 && !!init.body?.funding?.reference, init.body);
  const reference: string = init.body?.funding?.reference;

  check('mock-complete without auth -> 401 (was an open hole)', (await call('POST', '/api/wallet/fund/mock-complete', { body: { reference, outcome: 'success' } })).status === 401);

  const stranger = await verifiedUser('stranger');
  check("another user cannot settle someone else's funding", (await call('POST', '/api/wallet/fund/mock-complete', { token: stranger.token, body: { reference, outcome: 'success' } })).status === 404);
  check('webhook without signature -> 401', (await call('POST', '/api/wallet/fund/webhook', { body: { reference, status: 'success', amountKobo: 1_000_000 } })).status === 401);

  const done = await call('POST', '/api/wallet/fund/mock-complete', { token, body: { reference, outcome: 'success' } });
  check('mock-complete credits the wallet', done.status === 200 && done.body.transaction.status === 'successful', done.body);
  const done2 = await call('POST', '/api/wallet/fund/mock-complete', { token, body: { reference, outcome: 'success' } });
  check('settling twice does not double-credit', done2.status === 200);
  const w1 = await call('GET', '/api/wallet', { token });
  check('balance is exactly 10,000', w1.body?.wallet?.balance === 10_000, w1.body);

  // -------------------------------------------------------------------------------------------------------------
  section('Purchases');
  const ok = await call('POST', '/api/services/airtime', { token, body: { network: 'mtn', phone: '08031234567', amount: 500, pin: PIN, idempotencyKey: 'idem-airtime-1' } });
  check('airtime purchase succeeds', ok.status === 201 && ok.body.transaction.status === 'successful', ok.body);
  const idem = await call('POST', '/api/services/airtime', { token, body: { network: 'mtn', phone: '08031234567', amount: 500, pin: PIN, idempotencyKey: 'idem-airtime-1' } });
  check('same idempotency key returns the same transaction', idem.body?.transaction?.reference === ok.body?.transaction?.reference, idem.body);
  const w2 = await call('GET', '/api/wallet', { token });
  check('...and charged only once (9,500 left)', w2.body.wallet.balance === 9_500, w2.body);

  const fail = await call('POST', '/api/services/airtime', { token, body: { network: 'mtn', phone: '08030000000', amount: 300, pin: PIN } });
  check('provider failure -> transaction failed', fail.status === 201 && fail.body.transaction.status === 'failed', fail.body);
  const w3 = await call('GET', '/api/wallet', { token });
  check('...and the money was refunded', w3.body.wallet.balance === 9_500, w3.body);

  const data = await call('POST', '/api/services/data', { token, body: { network: 'mtn', phone: '08031234567', planId: 'mtn-1gb', pin: PIN } });
  check('data purchase', data.status === 201 && data.body.transaction.status === 'successful', data.body);
  const elec = await call('POST', '/api/services/electricity', { token, body: { discoId: 'ikeja', meterNumber: '12345678901', meterType: 'prepaid', amount: 2000, pin: PIN } });
  check('electricity purchase (amount + fee)', elec.status === 201 && elec.body.transaction.amount === 2100, elec.body);
  const tv = await call('POST', '/api/services/tv', { token, body: { provider: 'gotv', smartCardNumber: '1234567890', packageId: 'gotv-smallie', pin: PIN } });
  check('tv purchase', tv.status === 201 && tv.body.transaction.status === 'successful', tv.body);

  const meter = await call('POST', '/api/services/electricity/validate', { token, body: { discoId: 'ikeja', meterNumber: '12345678901', meterType: 'prepaid' } });
  check('meter validation returns a customer name', meter.status === 200 && meter.body.lookup.valid === true, meter.body);
  const badMeter = await call('POST', '/api/services/electricity/validate', { token, body: { discoId: 'ikeja', meterNumber: '12345670000', meterType: 'prepaid' } });
  check('invalid meter is reported', badMeter.body?.lookup?.valid === false, badMeter.body);

  const tooMuch = await call('POST', '/api/services/airtime', { token, body: { network: 'mtn', phone: '08031234567', amount: 40_000, pin: PIN } });
  check('insufficient balance -> 400 and nothing charged', tooMuch.status === 400 && tooMuch.body.error.code === 'insufficient_funds', tooMuch.body);

  const before = (await call('GET', '/api/wallet', { token })).body.wallet.balance as number;
  const burst = await Promise.all(
    Array.from({ length: 6 }, () => call('POST', '/api/services/airtime', { token, body: { network: 'glo', phone: '08051234567', amount: before / 2 > 1000 ? Math.floor(before / 2) - 1 : 1000, pin: PIN } })),
  );
  const succeeded = burst.filter((r) => r.status === 201).length;
  const after = (await call('GET', '/api/wallet', { token })).body.wallet.balance as number;
  check('concurrent purchases can never overdraw the wallet', after >= 0, { before, after, succeeded });

  section('History + notifications');
  const list = await call('GET', '/api/transactions?limit=50', { token });
  check('transaction history lists purchases', list.status === 200 && list.body.total >= 6, list.body?.total);
  const one = await call('GET', `/api/transactions/${ok.body.transaction.reference}`, { token });
  check('transaction detail by reference', one.status === 200, one.body);
  check("cannot read another user's transaction", (await call('GET', `/api/transactions/${ok.body.transaction.reference}`, { token: stranger.token })).status === 404);
  const notes = await call('GET', '/api/notifications', { token });
  check('notifications feed has entries', notes.status === 200 && notes.body.total > 0, notes.body);
  const readAll = await call('POST', '/api/notifications/read-all', { token });
  check('mark all read', readAll.status === 200);
  check('unread count is zero afterwards', (await call('GET', '/api/notifications', { token })).body.unread === 0);

  // -------------------------------------------------------------------------------------------------------------
  section('PIN brute-force lockout');
  const victim = stranger;
  await call('POST', '/api/users/me/pin', { token: victim.token, body: { pin: '5555' } });
  const attempts: number[] = [];
  for (let i = 0; i < 5; i++) {
    attempts.push((await call('POST', '/api/users/me/pin/verify', { token: victim.token, body: { pin: '0000' } })).status);
  }
  check('4 wrong guesses -> 401, 5th locks -> 423', attempts.slice(0, 4).every((s) => s === 401) && attempts[4] === 423, attempts);
  const locked = await call('POST', '/api/users/me/pin/verify', { token: victim.token, body: { pin: '5555' } });
  check('even the CORRECT pin is refused while locked', locked.status === 423, locked.body);

  // -------------------------------------------------------------------------------------------------------------
  section('Authorization');
  check('non-admin cannot read admin stats', (await call('GET', '/api/admin/stats', { token })).status === 403);
  check('admin routes need auth', (await call('GET', '/api/admin/users')).status === 401);
  const catalog = await call('GET', '/api/services/catalog');
  check('catalog is public', catalog.status === 200 && Array.isArray(catalog.body.dataPlans));

  const adminEmail = `e2e-admin-${randomUUID().slice(0, 8)}@${DOMAIN}`;
  const adminAcc = await createUnverified(adminEmail, uniquePhone());
  const adminVerify = await call('POST', '/api/auth/verify-email', { body: { email: adminEmail, code: adminAcc.code } });
  await pool.query(`update profiles set role = 'admin' where id = $1`, [adminAcc.id]);
  const adminToken = adminVerify.body.tokens.accessToken as string;
  const stats = await call('GET', '/api/admin/stats', { token: adminToken });
  check('admin can read stats', stats.status === 200 && typeof stats.body.stats.totalUsers === 'number', stats.body);
  const users = await call('GET', '/api/admin/users?search=e2e-main', { token: adminToken });
  check('admin user search', users.status === 200 && users.body.total >= 1, users.body);
  const txs = await call('GET', '/api/admin/transactions?status=successful', { token: adminToken });
  check('admin transaction list', txs.status === 200, txs.body);
  const recon = await call('GET', '/api/admin/reconciliation', { token: adminToken });
  check('ledger reconciles: every wallet balance equals its transaction history', recon.status === 200 && recon.body.reconciliation.balanced === true, recon.body?.reconciliation?.mismatches);
  check('reconciliation is admin-only', (await call('GET', '/api/admin/reconciliation', { token })).status === 403);
  const logs = await call('GET', '/api/admin/audit-logs', { token: adminToken });
  check('admin audit log has entries', logs.status === 200 && logs.body.total > 0, logs.body);

  console.log(`\n${passed} passed, ${failed} failed`);
}

async function cleanup() {
  for (const id of createdUserIds) {
    try {
      await pool.query('delete from notifications where user_id = $1', [id]);
      await pool.query('delete from transactions where user_id = $1', [id]);
      await adminClient.auth.admin.deleteUser(id);
    } catch (err) {
      console.log(`cleanup of ${id} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

try {
  await main();
} catch (err) {
  failed++;
  console.error('\nE2E aborted:', err instanceof Error ? err.message : err);
} finally {
  await cleanup();
  await pool.end();
}
process.exit(failed === 0 ? 0 : 1);
