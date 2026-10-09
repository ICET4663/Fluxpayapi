import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';
import { transactionRateLimiter } from '../../middleware/rateLimit.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { serializeTransaction } from '../transactions/transactions.controller.ts';
import { resolveAccountSchema, withdrawSchema } from './banking.schema.ts';
import {
  WITHDRAWAL_FEE_NAIRA,
  WITHDRAWAL_MAX_NAIRA,
  WITHDRAWAL_MIN_NAIRA,
  listBanks,
  resolveAccount,
  withdraw,
} from './banking.service.ts';

export const bankingRouter = Router();

bankingRouter.use(requireAuth);

bankingRouter.get(
  '/banks',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      banks: await listBanks(),
      fee: WITHDRAWAL_FEE_NAIRA,
      min: WITHDRAWAL_MIN_NAIRA,
      max: WITHDRAWAL_MAX_NAIRA,
    });
  }),
);

/** Look up the account holder before sending, so the user can confirm the name. */
bankingRouter.post(
  '/resolve',
  transactionRateLimiter,
  validateBody(resolveAccountSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await resolveAccount(req.body.bankCode, req.body.accountNumber));
  }),
);

bankingRouter.post(
  '/withdraw',
  transactionRateLimiter,
  validateBody(withdrawSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { bankCode, accountNumber, amount, pin, idempotencyKey } = req.body;
    const transaction = await withdraw({ user: req.user!, ip: req.ip, bankCode, accountNumber, amountNaira: amount, pin, idempotencyKey });
    res.status(201).json({ transaction: serializeTransaction(transaction) });
  }),
);
