import { Router } from 'express';
import { validateBody } from '../../middleware/validate.ts';
import { authRateLimiter } from '../../middleware/rateLimit.ts';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from './auth.schema.ts';
import {
  doResetPassword,
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resendOtp,
  verifyOtp,
} from './auth.controller.ts';

export const authRouter = Router();

authRouter.use(authRateLimiter);

authRouter.post('/register', validateBody(registerSchema), register);
authRouter.post('/verify-otp', validateBody(verifyOtpSchema), verifyOtp);
authRouter.post('/resend-otp', validateBody(resendOtpSchema), resendOtp);
authRouter.post('/login', validateBody(loginSchema), login);
authRouter.post('/refresh', validateBody(refreshSchema), refresh);
authRouter.post('/logout', validateBody(refreshSchema), logout);
authRouter.post('/forgot-password', validateBody(forgotPasswordSchema), forgotPassword);
authRouter.post('/reset-password', validateBody(resetPasswordSchema), doResetPassword);
