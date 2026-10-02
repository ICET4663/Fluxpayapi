import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { query, queryOne } from '../db/pool.ts';
import { AppError } from '../utils/AppError.ts';

const TTL_SECONDS = 10 * 60;
const AUDIENCE = 'fluxpay:password-reset';

/** Issued after the emailed recovery code is verified; the only thing that can authorise a password reset. */
export function signResetToken(userId: string): string {
  return jwt.sign({}, env.appSecret, {
    subject: userId,
    audience: AUDIENCE,
    expiresIn: TTL_SECONDS,
    jwtid: randomUUID(),
  });
}

/**
 * Verifies the token and burns it, so each token resets a password at most once.
 * `release` un-burns it, for when the reset fails for a reason the user can fix (e.g. a weak password).
 */
export async function consumeResetToken(token: string): Promise<{ userId: string; release: () => Promise<void> }> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.appSecret, { audience: AUDIENCE }) as jwt.JwtPayload;
  } catch {
    throw AppError.badRequest('Reset session is invalid or has expired. Start again.');
  }
  const { sub, jti, exp } = payload;
  if (!sub || !jti || !exp) throw AppError.badRequest('Reset session is invalid or has expired. Start again.');

  const burned = await queryOne(
    `insert into consumed_tokens (jti, expires_at) values ($1, to_timestamp($2))
     on conflict (jti) do nothing returning jti`,
    [jti, exp],
  );
  if (!burned) throw AppError.badRequest('Reset session has already been used. Start again.');

  return {
    userId: sub,
    release: async () => {
      await query(`delete from consumed_tokens where jti = $1`, [jti]);
    },
  };
}

export async function purgeExpiredResetTokens() {
  await query(`delete from consumed_tokens where expires_at < now()`);
}
