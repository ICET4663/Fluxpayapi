import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';
import { otpRateLimiter } from '../../middleware/rateLimit.ts';
import {
  changePasswordSchema,
  resetPinSchema,
  setBiometricSchema,
  setPinSchema,
  updateProfileSchema,
  verifyPinSchema,
} from './users.schema.ts';
import { changePassword, getMe, patchMe, resetPin, setBiometric, setPin, verifyPin } from './users.controller.ts';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', getMe);
usersRouter.patch('/me', validateBody(updateProfileSchema), patchMe);
usersRouter.post('/me/pin', validateBody(setPinSchema), setPin);
usersRouter.post('/me/pin/verify', validateBody(verifyPinSchema), verifyPin);
usersRouter.post('/me/pin/reset', otpRateLimiter(5), validateBody(resetPinSchema), resetPin);
usersRouter.post('/me/biometric', validateBody(setBiometricSchema), setBiometric);
usersRouter.post('/me/password', otpRateLimiter(5), validateBody(changePasswordSchema), changePassword);
