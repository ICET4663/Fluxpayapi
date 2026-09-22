import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { koboToNaira } from '../../utils/money.ts';
import {
  getDashboardStats,
  listAuditLogsAdmin,
  listTransactionsAdmin,
  listUsersAdmin,
  type AdminTransactionRow,
  type AdminUserRow,
} from './admin.repository.ts';

function serializeUser(row: AdminUserRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
    phoneVerified: row.phone_verified_at !== null,
    walletBalance: koboToNaira(row.balance_kobo),
    createdAt: row.created_at,
  };
}

function serializeTransaction(row: AdminTransactionRow) {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    subtitle: row.subtitle,
    amount: koboToNaira(row.amount_kobo),
    fee: koboToNaira(row.fee_kobo),
    type: row.type,
    category: row.category,
    status: row.status,
    provider: row.provider,
    createdAt: row.created_at,
    user: { id: row.user_id, fullName: row.user_full_name, email: row.user_email },
  };
}

export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = getDashboardStats();
  const successRate = stats.todayCount > 0 ? (stats.todaySuccessful / stats.todayCount) * 100 : 0;
  const failedRate = stats.todayCount > 0 ? (stats.todayFailed / stats.todayCount) * 100 : 0;
  const pendingRate = stats.todayCount > 0 ? (stats.todayPending / stats.todayCount) * 100 : 0;

  res.json({
    stats: {
      totalUsers: stats.totalUsers,
      totalWalletBalance: koboToNaira(stats.totalWalletBalanceKobo),
      today: {
        count: stats.todayCount,
        value: koboToNaira(stats.todayValueKobo),
        successRate: Math.round(successRate * 10) / 10,
        failedRate: Math.round(failedRate * 10) / 10,
        pendingRate: Math.round(pendingRate * 10) / 10,
        revenue: koboToNaira(stats.todayRevenueKobo),
      },
      allTimeRevenue: koboToNaira(stats.allTimeRevenueKobo),
    },
  });
});

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { limit, offset, search } = req.query as unknown as { limit: number; offset: number; search?: string };
  const { items, total } = listUsersAdmin({ limit, offset, search });
  res.json({ users: items.map(serializeUser), total, limit, offset });
});

export const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  const { limit, offset, status, category, search } = req.query as unknown as {
    limit: number;
    offset: number;
    status?: string;
    category?: string;
    search?: string;
  };
  const { items, total } = listTransactionsAdmin({ limit, offset, status, category, search });
  res.json({ transactions: items.map(serializeTransaction), total, limit, offset });
});

export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { limit, offset } = req.query as unknown as { limit: number; offset: number };
  const { items, total } = listAuditLogsAdmin({ limit, offset });
  res.json({
    logs: items.map((row) => ({
      id: row.id,
      action: row.action,
      ip: row.ip,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
      user: row.user_id ? { id: row.user_id, fullName: row.user_full_name, email: row.user_email } : null,
    })),
    total,
    limit,
    offset,
  });
});
