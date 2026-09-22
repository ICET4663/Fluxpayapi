function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  webhookSecret: required('PAYMENT_WEBHOOK_SECRET', 'dev-webhook-secret-change-me'),
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 30,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
};
