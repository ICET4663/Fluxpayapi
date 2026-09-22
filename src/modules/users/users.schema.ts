import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
});

export const setPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

export const setBiometricSchema = z.object({
  enabled: z.boolean(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});
