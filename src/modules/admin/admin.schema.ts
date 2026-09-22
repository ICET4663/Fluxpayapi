import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().min(1).optional(),
});

export const listTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'processing', 'successful', 'failed', 'reversed']).optional(),
  category: z.enum(['airtime', 'data', 'electricity', 'tv', 'wallet_funding', 'withdrawal']).optional(),
  search: z.string().trim().min(1).optional(),
});

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});
