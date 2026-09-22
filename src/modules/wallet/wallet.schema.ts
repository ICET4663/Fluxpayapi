import { z } from 'zod';

export const initializeFundingSchema = z.object({
  amount: z.number().positive('Amount must be greater than zero').max(1_000_000, 'Amount is too large'),
});

export const mockCompleteSchema = z.object({
  reference: z.string().min(3),
  outcome: z.enum(['success', 'failed']).default('success'),
});
