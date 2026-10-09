import { z } from 'zod';

export const listTransactionsQuerySchema = z.object({
  type: z.enum(['credit', 'debit']).optional(),
  category: z.enum(['airtime', 'data', 'electricity', 'tv', 'wallet_funding', 'withdrawal']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const spendingSummaryQuerySchema = z.object({
  /** YYYY-MM; defaults to the current month in Lagos. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must look like 2026-10').optional(),
});
