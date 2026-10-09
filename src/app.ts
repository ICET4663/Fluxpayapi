import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.ts';
import { pool } from './db/pool.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { usersRouter } from './modules/users/users.routes.ts';
import { walletRouter } from './modules/wallet/wallet.routes.ts';
import { transactionsRouter } from './modules/transactions/transactions.routes.ts';
import { servicesRouter } from './modules/services/services.routes.ts';
import { bankingRouter } from './modules/banking/banking.routes.ts';
import { notificationsRouter } from './modules/notifications/notifications.routes.ts';
import { adminRouter } from './modules/admin/admin.routes.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';

export const app = express();

app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = not a browser (curl, server-to-server webhooks): CORS does not apply.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(
  express.json({
    limit: '100kb',
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf.toString('utf-8');
    },
  }),
);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down', time: new Date().toISOString() });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/banking', bankingRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);
