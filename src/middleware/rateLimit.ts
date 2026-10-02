import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env.ts';

// Only ever true outside production (env.ts refuses to boot otherwise); lets the e2e script re-run without waiting.
const skip: Options['skip'] = () => env.disableRateLimits;

const tooMany = (message: string) => ({ error: { code: 'too_many_requests', message } });

/** Broad per-IP ceiling for the whole auth surface. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many attempts. Try again later.'),
});

function emailAndIp(req: Request): string {
  if (req.user) return `user:${req.user.id}`;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${req.ip}|${email}`;
}

/**
 * Per email+IP limiter for anything that sends an email or checks a one-time code.
 * Keeps one attacker from guessing a victim's 6-digit code or flooding their inbox.
 */
export function otpRateLimiter(limit: number, windowMinutes = 15) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    keyGenerator: emailAndIp,
    skip,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany('Too many attempts for this email. Please wait a few minutes and try again.'),
  });
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: emailAndIp,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many login attempts. Please wait a few minutes and try again.'),
});

export const transactionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many transaction requests. Slow down.'),
});
