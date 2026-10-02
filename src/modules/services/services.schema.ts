import { z } from 'zod';
import { NETWORKS, TV_PROVIDERS } from './services.catalog.ts';

const phoneSchema = z.string().trim().regex(/^(\+234|0)\d{10}$/, 'Enter a valid Nigerian phone number');
const pinSchema = z.string().regex(/^\d{4}$/, 'Enter your 4-digit transaction PIN');

export const buyAirtimeSchema = z.object({
  network: z.enum(NETWORKS),
  phone: phoneSchema,
  amount: z.number().min(50, 'Minimum airtime purchase is ₦50').max(50_000, 'Maximum airtime purchase is ₦50,000'),
  pin: pinSchema,
  idempotencyKey: z.string().min(6).optional(),
});

export const buyDataSchema = z.object({
  network: z.enum(NETWORKS),
  phone: phoneSchema,
  planId: z.string().min(1),
  pin: pinSchema,
  idempotencyKey: z.string().min(6).optional(),
});

export const payElectricitySchema = z.object({
  discoId: z.string().min(1),
  meterNumber: z.string().trim().min(6, 'Enter a valid meter number'),
  meterType: z.enum(['prepaid', 'postpaid']),
  amount: z.number().min(1000, 'Minimum payment is ₦1,000').max(500_000, 'Maximum payment is ₦500,000'),
  pin: pinSchema,
  idempotencyKey: z.string().min(6).optional(),
});

export const payTvSchema = z.object({
  provider: z.enum(TV_PROVIDERS),
  smartCardNumber: z.string().trim().min(6, 'Enter a valid smart card / IUC number'),
  packageId: z.string().min(1),
  pin: pinSchema,
  idempotencyKey: z.string().min(6).optional(),
});

export const validateMeterSchema = z.object({
  discoId: z.string().min(1),
  meterNumber: z.string().trim().min(6, 'Enter a valid meter number'),
  meterType: z.enum(['prepaid', 'postpaid']),
});

export const validateSmartCardSchema = z.object({
  provider: z.enum(TV_PROVIDERS),
  smartCardNumber: z.string().trim().min(6, 'Enter a valid smart card / IUC number'),
});
