import { z } from 'zod';
import { passwordSchema } from '../auth/auth.schema.ts';

const pin = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits');

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
});

/** First-time PIN setup (no PIN yet) or a PIN change (requires the current PIN). */
export const setPinSchema = z.object({
  pin,
  currentPin: pin.optional(),
});

/** Forgot-PIN recovery: prove account ownership with the account password. */
export const resetPinSchema = z.object({
  password: z.string().min(1, 'Enter your account password'),
  pin,
});

export const verifyPinSchema = z.object({ pin });

export const setBiometricSchema = z.object({
  enabled: z.boolean(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});
