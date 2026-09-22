import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { hashSecret, verifySecret } from '../../lib/password.ts';
import { recordAudit } from '../../lib/audit.ts';
import { revokeAllRefreshTokensForUser } from '../auth/refreshToken.repository.ts';
import { setBiometricEnabled, setPasswordHash, setPinHash, updateProfile } from './users.repository.ts';
import { publicUser } from './users.types.ts';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json({ user: publicUser(req.user!) });
});

export const patchMe = asyncHandler(async (req: Request, res: Response) => {
  const updated = updateProfile(req.user!.id, req.body);
  res.json({ user: publicUser(updated) });
});

export const setPin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user!.phoneVerifiedAt) throw AppError.forbidden('Verify your phone number before setting a transaction PIN');
  const pinHash = await hashSecret(req.body.pin);
  setPinHash(req.user!.id, pinHash);
  recordAudit('pin_set', req.user!.id, undefined);
  res.json({ message: 'Transaction PIN set' });
});

export const setBiometric = asyncHandler(async (req: Request, res: Response) => {
  setBiometricEnabled(req.user!.id, req.body.enabled);
  res.json({ message: 'Preference updated' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const ok = await verifySecret(req.body.currentPassword, req.user!.passwordHash);
  if (!ok) throw AppError.unauthorized('Current password is incorrect');

  setPasswordHash(req.user!.id, await hashSecret(req.body.newPassword));
  // Force re-authentication everywhere else — a leaked session shouldn't survive a password change.
  revokeAllRefreshTokensForUser(req.user!.id);
  recordAudit('password_changed', req.user!.id, undefined);
  res.json({ message: 'Password updated' });
});
