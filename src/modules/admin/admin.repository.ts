import { db } from '../../db/client.ts';

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  created_at: string;
  balance_kobo: number;
}

export interface ListUsersOptions {
  limit: number;
  offset: number;
  search?: string;
}

export function listUsersAdmin(options: ListUsersOptions): { items: AdminUserRow[]; total: number } {
  const where: string[] = [];
  const params: string[] = [];
  if (options.search) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM users u ${whereClause}`).get(...params) as {
    count: number;
  };

  const rows = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.email_verified_at, u.phone_verified_at, u.created_at,
              COALESCE(w.balance_kobo, 0) as balance_kobo
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, options.limit, options.offset) as unknown as AdminUserRow[];

  return { items: rows, total: totalRow.count };
}

export interface AdminTransactionRow {
  id: string;
  reference: string;
  title: string;
  subtitle: string | null;
  amount_kobo: number;
  fee_kobo: number;
  type: string;
  category: string;
  status: string;
  provider: string | null;
  created_at: string;
  user_id: string;
  user_full_name: string;
  user_email: string;
}

export interface ListTransactionsAdminOptions {
  limit: number;
  offset: number;
  status?: string;
  category?: string;
  search?: string;
}

export function listTransactionsAdmin(
  options: ListTransactionsAdminOptions,
): { items: AdminTransactionRow[]; total: number } {
  const where: string[] = [];
  const params: string[] = [];
  if (options.status) {
    where.push('t.status = ?');
    params.push(options.status);
  }
  if (options.category) {
    where.push('t.category = ?');
    params.push(options.category);
  }
  if (options.search) {
    where.push('(t.reference LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM transactions t JOIN users u ON u.id = t.user_id ${whereClause}`)
    .get(...params) as { count: number };

  const rows = db
    .prepare(
      `SELECT t.id, t.reference, t.title, t.subtitle, t.amount_kobo, t.fee_kobo, t.type, t.category, t.status,
              t.provider, t.created_at, u.id as user_id, u.full_name as user_full_name, u.email as user_email
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, options.limit, options.offset) as unknown as AdminTransactionRow[];

  return { items: rows, total: totalRow.count };
}

export interface DashboardStats {
  totalUsers: number;
  totalWalletBalanceKobo: number;
  todayCount: number;
  todayValueKobo: number;
  todaySuccessful: number;
  todayFailed: number;
  todayPending: number;
  allTimeRevenueKobo: number;
  todayRevenueKobo: number;
}

export function getDashboardStats(): DashboardStats {
  const totalUsers = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number }).count;

  const totalWalletBalanceKobo = (
    db.prepare(`SELECT COALESCE(SUM(balance_kobo), 0) as total FROM wallets`).get() as { total: number }
  ).total;

  const today = db
    .prepare(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(amount_kobo), 0) as value,
         SUM(CASE WHEN status = 'successful' THEN 1 ELSE 0 END) as successful,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status IN ('pending', 'processing') THEN 1 ELSE 0 END) as pending
       FROM transactions
       WHERE date(created_at) = date('now')`,
    )
    .get() as { count: number; value: number; successful: number; failed: number; pending: number };

  const allTimeRevenueKobo = (
    db.prepare(`SELECT COALESCE(SUM(fee_kobo), 0) as total FROM transactions WHERE status = 'successful'`).get() as {
      total: number;
    }
  ).total;

  const todayRevenueKobo = (
    db
      .prepare(
        `SELECT COALESCE(SUM(fee_kobo), 0) as total FROM transactions WHERE status = 'successful' AND date(created_at) = date('now')`,
      )
      .get() as { total: number }
  ).total;

  return {
    totalUsers,
    totalWalletBalanceKobo,
    todayCount: today.count,
    todayValueKobo: today.value,
    todaySuccessful: today.successful ?? 0,
    todayFailed: today.failed ?? 0,
    todayPending: today.pending ?? 0,
    allTimeRevenueKobo,
    todayRevenueKobo,
  };
}

export interface AdminAuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  ip: string | null;
  metadata: string | null;
  created_at: string;
  user_full_name: string | null;
  user_email: string | null;
}

export function listAuditLogsAdmin(options: { limit: number; offset: number }): {
  items: AdminAuditLogRow[];
  total: number;
} {
  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM audit_logs`).get() as { count: number };
  const rows = db
    .prepare(
      `SELECT a.id, a.user_id, a.action, a.ip, a.metadata, a.created_at,
              u.full_name as user_full_name, u.email as user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(options.limit, options.offset) as unknown as AdminAuditLogRow[];
  return { items: rows, total: totalRow.count };
}
