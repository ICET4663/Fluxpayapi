import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { usersRouter } from './modules/users/users.routes.ts';
import { walletRouter } from './modules/wallet/wallet.routes.ts';
import { transactionsRouter } from './modules/transactions/transactions.routes.ts';
import { servicesRouter } from './modules/services/services.routes.ts';
import { adminRouter } from './modules/admin/admin.routes.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf.toString('utf-8');
    },
  }),
);

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);
