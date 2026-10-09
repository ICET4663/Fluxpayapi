import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';
import { initializeFundingSchema, mockCompleteSchema, verifyFundingSchema } from './wallet.schema.ts';
import {
  getWallet,
  initializeFunding,
  mockCheckoutInfo,
  mockComplete,
  requireMockPayments,
  verifyFunding,
  webhook,
} from './wallet.controller.ts';

export const walletRouter = Router();

// Public: real payment gateways call this without a user session; authenticity comes from the HMAC signature.
walletRouter.post('/fund/webhook', webhook);

walletRouter.use(requireAuth);
walletRouter.get('/', getWallet);
walletRouter.post('/fund/initialize', validateBody(initializeFundingSchema), initializeFunding);
walletRouter.post('/fund/verify', validateBody(verifyFundingSchema), verifyFunding);

// Dev/test stand-ins for the hosted checkout page. Authenticated, owner-only, and disabled in production.
walletRouter.get('/fund/mock-checkout', requireMockPayments, mockCheckoutInfo);
walletRouter.post('/fund/mock-complete', requireMockPayments, validateBody(mockCompleteSchema), mockComplete);
