import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt.ts';
import { AppError } from '../utils/AppError.ts';
import { findUserById } from '../modules/users/users.repository.ts';
import type { User } from '../modules/users/users.types.ts';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      rawBody?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Missing bearer token'));
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    const user = findUserById(payload.sub);
    if (!user) return next(AppError.unauthorized('User no longer exists'));
    req.user = user;
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired access token'));
  }
}

export function requireRole(role: 'admin') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return next(AppError.forbidden());
    next();
  };
}
