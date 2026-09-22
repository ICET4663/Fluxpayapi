import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';
import { initializeFundingSchema, mockCompleteSchema } from './wallet.schema.ts';
import { getWallet, initializeFunding, mockCheckoutInfo, mockComplete, webhook } from './wallet.controller.ts';

export const walletRouter = Router();

// Public: real payment gateways call this without our JWT, authenticity comes from the signature instead.
walletRouter.post('/fund/webhook', webhook);
walletRouter.get('/fund/mock-checkout', mockCheckoutInfo);
walletRouter.post('/fund/mock-complete', validateBody(mockCompleteSchema), mockComplete);

walletRouter.use(requireAuth);
walletRouter.get('/', getWallet);
walletRouter.post('/fund/initialize', validateBody(initializeFundingSchema), initializeFunding);
