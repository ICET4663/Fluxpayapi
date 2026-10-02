import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { publicUser } from '../users/users.types.ts';
import {
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
  requestPasswordReset,
  resendSignupCode,
  resetPassword,
  verifyEmailCode,
  verifyResetCode,
} from './auth.service.ts';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body, req.ip);
  res.status(201).json({
    message: 'We sent a 6-digit verification code to your email.',
    email: result.email,
    verificationRequired: true,
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await verifyEmailCode(req.body.email, req.body.code, req.ip);
  res.json({ user: publicUser(user), tokens });
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  await resendSignupCode(req.body.email);
  res.json({ message: 'If that account is waiting for verification, a new code is on its way.' });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await loginUser(req.body.email, req.body.password, req.ip);
  res.json({ user: publicUser(user), tokens });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await refreshSession(req.body.refreshToken);
  res.json({ tokens });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await logoutUser(req.accessToken!);
  res.status(204).send();
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await requestPasswordReset(req.body.email);
  res.json({ message: 'If that email belongs to an account, a reset code has been sent.' });
});

export const verifyResetCodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const resetToken = await verifyResetCode(req.body.email, req.body.code, req.ip);
  res.json({ resetToken });
});

export const doResetPassword = asyncHandler(async (req: Request, res: Response) => {
  await resetPassword(req.body.resetToken, req.body.newPassword, req.ip);
  res.json({ message: 'Password has been reset. Log in with your new password.' });
});
