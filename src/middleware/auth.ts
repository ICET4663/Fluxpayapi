import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { adminClient } from '../lib/supabase.ts';
import { AppError } from '../utils/AppError.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { findUserById } from '../modules/users/users.repository.ts';
import type { User } from '../modules/users/users.types.ts';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      accessToken?: string;
      rawBody?: string;
    }
  }
}

// Token validation is a network call to Supabase Auth, so successful lookups are remembered briefly.
// The window is kept short because it is also the longest a revoked session (logout, password reset) can linger.
const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 5_000;
const validated = new Map<string, { userId: string; expiresAt: number }>();

function cacheKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function forgetAccessToken(token: string) {
  validated.delete(cacheKey(token));
}

async function resolveUserId(token: string): Promise<string | null> {
  const key = cacheKey(token);
  const hit = validated.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.userId;

  // getUser asks Supabase Auth to verify the signature, expiry AND that the session still exists.
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data.user) return null;

  if (validated.size >= CACHE_MAX_ENTRIES) validated.clear();
  validated.set(key, { userId: data.user.id, expiresAt: Date.now() + CACHE_TTL_MS });
  return data.user.id;
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw AppError.unauthorized('Missing bearer token');
  const token = header.slice('Bearer '.length).trim();

  const userId = await resolveUserId(token);
  if (!userId) throw AppError.unauthorized('Invalid or expired access token');

  const user = await findUserById(userId);
  if (!user) throw AppError.unauthorized('Account profile not found');

  req.user = user;
  req.accessToken = token;
  next();
});

export function requireRole(role: 'admin') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return next(AppError.forbidden());
    next();
  };
}
