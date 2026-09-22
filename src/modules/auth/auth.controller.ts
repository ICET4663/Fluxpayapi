import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { publicUser } from '../users/users.types.ts';
import {
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resendPhoneOtp,
  resetPassword,
  rotateRefreshToken,
  verifyPhoneOtp,
} from './auth.service.ts';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { user, devOtp } = await registerUser(req.body);
  res.status(201).json({ user: publicUser(user), devOtp });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await verifyPhoneOtp(req.body.phone, req.body.code);
  res.json({ tokens });
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  const devOtp = await resendPhoneOtp(req.body.phone);
  res.json({ message: 'Verification code sent', devOtp });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await loginUser(req.body.identifier, req.body.password);
  res.json({ user: publicUser(user), tokens });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await rotateRefreshToken(req.body.refreshToken);
  res.json({ tokens });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  logoutUser(req.body.refreshToken);
  res.status(204).send();
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const devOtp = await requestPasswordReset(req.body.email);
  res.json({ message: 'If that email exists, a reset code has been sent', devOtp });
});

export const doResetPassword = asyncHandler(async (req: Request, res: Response) => {
  await resetPassword(req.body.email, req.body.code, req.body.newPassword);
  res.json({ message: 'Password has been reset' });
});
