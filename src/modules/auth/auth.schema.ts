import { z } from 'zod';

const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+234|0)\d{10}$/, 'Enter a valid Nigerian phone number');

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: phoneSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6, 'Enter the 6-digit code'),
});

export const resendOtpSchema = z.object({
  phone: phoneSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().length(6),
  newPassword: passwordSchema,
});
