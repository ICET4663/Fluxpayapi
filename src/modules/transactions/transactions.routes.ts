import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateQuery } from '../../middleware/validate.ts';
import { listTransactionsQuerySchema, spendingSummaryQuerySchema } from './transactions.schema.ts';
import { getSpendingSummary, getTransaction, getTransactions } from './transactions.controller.ts';

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);
transactionsRouter.get('/', validateQuery(listTransactionsQuerySchema), getTransactions);
transactionsRouter.get('/summary', validateQuery(spendingSummaryQuerySchema), getSpendingSummary);
transactionsRouter.get('/:reference', getTransaction);
