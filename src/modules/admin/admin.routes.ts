import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.ts';
import { validateQuery } from '../../middleware/validate.ts';
import { listAuditLogsQuerySchema, listTransactionsQuerySchema, listUsersQuerySchema } from './admin.schema.ts';
import { getAuditLogs, getStats, getTransactions, getUsers } from './admin.controller.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/stats', getStats);
adminRouter.get('/users', validateQuery(listUsersQuerySchema), getUsers);
adminRouter.get('/transactions', validateQuery(listTransactionsQuerySchema), getTransactions);
adminRouter.get('/audit-logs', validateQuery(listAuditLogsQuerySchema), getAuditLogs);
