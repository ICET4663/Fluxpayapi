import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

// Supabase renamed its keys (anon -> publishable, service_role -> secret). Both spellings work.
// A blank value in .env (KEY=) counts as unset, so optional keys fall back to their defaults.
const present = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ''));

const raw = {
  ...present,
  SUPABASE_PUBLISHABLE_KEY: present.SUPABASE_PUBLISHABLE_KEY ?? present.SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY: present.SUPABASE_SECRET_KEY ?? present.SUPABASE_SERVICE_ROLE_KEY,
};

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required (Supabase > Connect > Session pooler connection string)' })
    .startsWith('postgres', 'DATABASE_URL must be a postgres:// connection string'),
  SUPABASE_URL: z
    .string({ required_error: 'SUPABASE_URL is required (Supabase > Project Settings > API)' })
    .url(),
  SUPABASE_PUBLISHABLE_KEY: z.string({ required_error: 'SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) is required' }).min(20),
  SUPABASE_SECRET_KEY: z.string({ required_error: 'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required' }).min(20),
  APP_SECRET: isProd
    ? z.string().min(32, 'APP_SECRET must be at least 32 characters in production')
    : z.string().min(16).default(() => randomBytes(32).toString('hex')),
  PAYMENT_WEBHOOK_SECRET: isProd
    ? z.string().min(32, 'PAYMENT_WEBHOOK_SECRET must be at least 32 characters in production')
    : z.string().min(16).default(() => randomBytes(32).toString('hex')),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  ENABLE_MOCK_PAYMENTS: bool.default(isProd ? 'false' : 'true'),
  DATABASE_SSL: bool.default('true'),
  DISABLE_RATE_LIMITS: bool.default('false'),
  PAYMENT_PROVIDER: z.enum(['mock', 'paystack']).default('mock'),
  PAYSTACK_SECRET_KEY: z.string().min(20).optional(),
  // Where Paystack sends the user after paying. Defaults to the wallet page of the first allowed frontend origin.
  PAYSTACK_CALLBACK_URL: z.string().url().optional(),
});

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n\nSee .env.example for the full list.\n`);
  process.exit(1);
}

const e = parsed.data;

if (e.PAYMENT_PROVIDER === 'paystack' && !e.PAYSTACK_SECRET_KEY) {
  console.error('PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER=paystack.');
  process.exit(1);
}

if (isProd && e.PAYMENT_PROVIDER === 'mock') {
  console.error('PAYMENT_PROVIDER=mock must not be used in production. Set PAYMENT_PROVIDER=paystack.');
  process.exit(1);
}

if (isProd && (e.ENABLE_MOCK_PAYMENTS || e.DISABLE_RATE_LIMITS)) {
  console.error('ENABLE_MOCK_PAYMENTS and DISABLE_RATE_LIMITS must not be true in production.');
  process.exit(1);
}

export const env = {
  nodeEnv,
  isProd,
  port: e.PORT,
  databaseUrl: e.DATABASE_URL,
  databaseSsl: e.DATABASE_SSL,
  supabaseUrl: e.SUPABASE_URL,
  supabasePublishableKey: e.SUPABASE_PUBLISHABLE_KEY,
  supabaseSecretKey: e.SUPABASE_SECRET_KEY,
  appSecret: e.APP_SECRET,
  webhookSecret: e.PAYMENT_WEBHOOK_SECRET,
  corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: e.TRUST_PROXY,
  enableMockPayments: e.ENABLE_MOCK_PAYMENTS,
  disableRateLimits: e.DISABLE_RATE_LIMITS,
  paymentProvider: e.PAYMENT_PROVIDER,
  paystackSecretKey: e.PAYSTACK_SECRET_KEY,
  paystackCallbackUrl: e.PAYSTACK_CALLBACK_URL,
};
