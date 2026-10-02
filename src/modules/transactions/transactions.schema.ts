import { z } from 'zod';

export const listTransactionsQuerySchema = z.object({
  type: z.enum(['credit', 'debit']).optional(),
  category: z.enum(['airtime', 'data', 'electricity', 'tv', 'wallet_funding', 'withdrawal']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
