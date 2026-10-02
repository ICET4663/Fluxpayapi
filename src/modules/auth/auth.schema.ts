import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+234|0)\d{10}$/, 'Enter a valid Nigerian phone number');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(100),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const verifyEmailSchema = z.object({ email: emailSchema, code: codeSchema });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const verifyResetCodeSchema = z.object({ email: emailSchema, code: codeSchema });

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(20),
  newPassword: passwordSchema,
});
