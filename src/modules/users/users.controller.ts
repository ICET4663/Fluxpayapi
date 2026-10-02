import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { recordAudit } from '../../lib/audit.ts';
import { adminClient } from '../../lib/supabase.ts';
import { assertPasswordCorrect } from '../auth/auth.service.ts';
import { createNotification } from '../notifications/notifications.repository.ts';
import { assertPinCorrect, hashPin } from './pin.service.ts';
import { setBiometricEnabled, setPinHash, updateProfile } from './users.repository.ts';
import { publicUser } from './users.types.ts';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json({ user: publicUser(req.user!) });
});

export const patchMe = asyncHandler(async (req: Request, res: Response) => {
  const updated = await updateProfile(req.user!.id, req.body);
  res.json({ user: publicUser(updated) });
});

export const setPin = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.pinHash) {
    // Changing an existing PIN requires knowing the current one (with the same lockout as payments).
    if (!req.body.currentPin) throw AppError.badRequest('Enter your current PIN to change it');
    await assertPinCorrect(user, req.body.currentPin, req.ip);
  }
  await setPinHash(user.id, await hashPin(req.body.pin));
  recordAudit(user.pinHash ? 'pin_changed' : 'pin_set', user.id, req.ip);
  if (user.pinHash) await createNotification(user.id, 'security', 'Transaction PIN changed', 'Your transaction PIN was changed.');
  res.json({ message: user.pinHash ? 'Transaction PIN changed' : 'Transaction PIN set' });
});

export const verifyPin = asyncHandler(async (req: Request, res: Response) => {
  await assertPinCorrect(req.user!, req.body.pin, req.ip);
  res.json({ valid: true });
});

/** Forgot-PIN: the account password (not just a bearer token) is required, so a stolen session cannot reset it. */
export const resetPin = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  await assertPasswordCorrect(user.email, req.body.password);
  await setPinHash(user.id, await hashPin(req.body.pin));
  recordAudit('pin_reset', user.id, req.ip);
  await createNotification(user.id, 'security', 'Transaction PIN reset', 'Your transaction PIN was reset using your account password.');
  res.json({ message: 'Transaction PIN reset' });
});

export const setBiometric = asyncHandler(async (req: Request, res: Response) => {
  await setBiometricEnabled(req.user!.id, req.body.enabled);
  res.json({ message: 'Preference updated' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  await assertPasswordCorrect(user.email, req.body.currentPassword);

  const { error } = await adminClient.auth.admin.updateUserById(user.id, { password: req.body.newPassword });
  if (error) {
    if (error.code === 'same_password') throw AppError.badRequest('New password must be different from your current password');
    if (error.code === 'weak_password') throw AppError.badRequest('Password is too weak. Use at least 8 characters with letters and numbers.');
    console.error('Password change failed:', error.message);
    throw new AppError(502, 'auth_provider_error', 'We could not change your password right now.');
  }

  // Keep this device signed in, end every other one — a leaked session should not survive a password change.
  await adminClient.auth.admin.signOut(req.accessToken!, 'others').catch(() => {});
  recordAudit('password_changed', user.id, req.ip);
  await createNotification(user.id, 'security', 'Password changed', 'Your password was changed. If this was not you, contact support immediately.');
  res.json({ message: 'Password updated' });
});
