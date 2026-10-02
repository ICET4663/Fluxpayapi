import { Router } from 'express';
import { validateBody } from '../../middleware/validate.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { authRateLimiter, loginRateLimiter, otpRateLimiter } from '../../middleware/rateLimit.ts';
import {
  emailOnlySchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyResetCodeSchema,
} from './auth.schema.ts';
import {
  doResetPassword,
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  verifyEmail,
  verifyResetCodeHandler,
} from './auth.controller.ts';

export const authRouter = Router();

authRouter.use(authRateLimiter);

// Signup + email verification
authRouter.post('/register', otpRateLimiter(5), validateBody(registerSchema), register);
authRouter.post('/verify-email', otpRateLimiter(10), validateBody(verifyEmailSchema), verifyEmail);
authRouter.post('/resend-verification', otpRateLimiter(5), validateBody(emailOnlySchema), resendVerification);

// Sessions
authRouter.post('/login', loginRateLimiter, validateBody(loginSchema), login);
authRouter.post('/refresh', validateBody(refreshSchema), refresh);
authRouter.post('/logout', requireAuth, logout);

// Password recovery
authRouter.post('/forgot-password', otpRateLimiter(5), validateBody(emailOnlySchema), forgotPassword);
authRouter.post('/verify-reset-code', otpRateLimiter(10), validateBody(verifyResetCodeSchema), verifyResetCodeHandler);
authRouter.post('/reset-password', validateBody(resetPasswordSchema), doResetPassword);
