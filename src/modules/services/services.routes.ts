import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';
import { transactionRateLimiter } from '../../middleware/rateLimit.ts';
import { buyAirtimeSchema, buyDataSchema, payElectricitySchema, payTvSchema } from './services.schema.ts';
import { buyAirtime, buyData, listCatalog, payElectricity, payTv } from './services.controller.ts';

export const servicesRouter = Router();

servicesRouter.get('/catalog', listCatalog);

servicesRouter.use(requireAuth);
servicesRouter.post('/airtime', transactionRateLimiter, validateBody(buyAirtimeSchema), buyAirtime);
servicesRouter.post('/data', transactionRateLimiter, validateBody(buyDataSchema), buyData);
servicesRouter.post('/electricity', transactionRateLimiter, validateBody(payElectricitySchema), payElectricity);
servicesRouter.post('/tv', transactionRateLimiter, validateBody(payTvSchema), payTv);
