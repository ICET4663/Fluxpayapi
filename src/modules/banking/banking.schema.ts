import { z } from 'zod';

const bankCode = z.string().trim().regex(/^[A-Za-z0-9-]{2,12}$/, 'Choose a bank');
const accountNumber = z.string().trim().regex(/^\d{10}$/, 'Account number must be 10 digits');

export const resolveAccountSchema = z.object({ bankCode, accountNumber });

export const withdrawSchema = z.object({
  bankCode,
  accountNumber,
  amount: z.number().positive('Enter an amount'),
  pin: z.string().regex(/^\d{4}$/, 'Enter your 4-digit transaction PIN'),
  idempotencyKey: z.string().min(6).optional(),
});
