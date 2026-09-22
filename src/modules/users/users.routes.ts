import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';
import { changePasswordSchema, setBiometricSchema, setPinSchema, updateProfileSchema } from './users.schema.ts';
import { changePassword, getMe, patchMe, setBiometric, setPin } from './users.controller.ts';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', getMe);
usersRouter.patch('/me', validateBody(updateProfileSchema), patchMe);
usersRouter.post('/me/pin', validateBody(setPinSchema), setPin);
usersRouter.post('/me/biometric', validateBody(setBiometricSchema), setBiometric);
usersRouter.post('/me/password', validateBody(changePasswordSchema), changePassword);
