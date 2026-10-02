import { query, queryOne } from '../../db/pool.ts';

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  created_at: string;
  balance_kobo: number;
}

export interface ListUsersOptions {
  limit: number;
  offset: number;
  search?: string;
}

/** Escape LIKE wildcards so a search for "50%" matches literally. */
function likeTerm(search: string) {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listUsersAdmin(options: ListUsersOptions): Promise<{ items: AdminUserRow[]; total: number }> {
  const params: unknown[] = [];
  let where = '';
  if (options.search) {
    params.push(likeTerm(options.search));
    where = `where (p.full_name ilike $1 or p.email ilike $1 or p.phone ilike $1)`;
  }

  const totalRow = await queryOne<{ count: number }>(`select count(*)::int as count from profiles p ${where}`, params);
  const rows = await query<AdminUserRow>(
    `select p.id, p.full_name, p.email, p.phone, p.role, p.created_at, coalesce(w.balance_kobo, 0) as balance_kobo
       from profiles p
       left join wallets w on w.user_id = p.id
       ${where}
      order by p.created_at desc
      limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, options.limit, options.offset],
  );
  return { items: rows, total: totalRow?.count ?? 0 };
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

export async function listTransactionsAdmin(
  options: ListTransactionsAdminOptions,
): Promise<{ items: AdminTransactionRow[]; total: number }> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (options.status) {
    params.push(options.status);
    clauses.push(`t.status = $${params.length}`);
  }
  if (options.category) {
    params.push(options.category);
    clauses.push(`t.category = $${params.length}`);
  }
  if (options.search) {
    params.push(likeTerm(options.search));
    clauses.push(`(t.reference ilike $${params.length} or u.full_name ilike $${params.length} or u.email ilike $${params.length})`);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';

  const totalRow = await queryOne<{ count: number }>(
    `select count(*)::int as count from transactions t join profiles u on u.id = t.user_id ${where}`,
    params,
  );
  const rows = await query<AdminTransactionRow>(
    `select t.id, t.reference, t.title, t.subtitle, t.amount_kobo, t.fee_kobo, t.type, t.category, t.status,
            t.provider, t.created_at, u.id as user_id, u.full_name as user_full_name, u.email as user_email
       from transactions t
       join profiles u on u.id = t.user_id
       ${where}
      order by t.created_at desc
      limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, options.limit, options.offset],
  );
  return { items: rows, total: totalRow?.count ?? 0 };
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const row = await queryOne<{
    total_users: number;
    total_wallet_balance_kobo: number;
    today_count: number;
    today_value_kobo: number;
    today_successful: number;
    today_failed: number;
    today_pending: number;
    all_time_revenue_kobo: number;
    today_revenue_kobo: number;
  }>(
    `select
       (select count(*)::int from profiles)                                         as total_users,
       (select coalesce(sum(balance_kobo), 0)::bigint from wallets)                     as total_wallet_balance_kobo,
       count(*) filter (where created_at >= date_trunc('day', now()))::int          as today_count,
       coalesce(sum(amount_kobo) filter (where created_at >= date_trunc('day', now())), 0)::bigint                         as today_value_kobo,
       count(*) filter (where created_at >= date_trunc('day', now()) and status = 'successful')::int                as today_successful,
       count(*) filter (where created_at >= date_trunc('day', now()) and status = 'failed')::int                    as today_failed,
       count(*) filter (where created_at >= date_trunc('day', now()) and status in ('pending', 'processing'))::int  as today_pending,
       coalesce(sum(fee_kobo) filter (where status = 'successful'), 0)::bigint                                              as all_time_revenue_kobo,
       coalesce(sum(fee_kobo) filter (where status = 'successful' and created_at >= date_trunc('day', now())), 0)::bigint   as today_revenue_kobo
     from transactions`,
  );

  return {
    totalUsers: row?.total_users ?? 0,
    totalWalletBalanceKobo: row?.total_wallet_balance_kobo ?? 0,
    todayCount: row?.today_count ?? 0,
    todayValueKobo: row?.today_value_kobo ?? 0,
    todaySuccessful: row?.today_successful ?? 0,
    todayFailed: row?.today_failed ?? 0,
    todayPending: row?.today_pending ?? 0,
    allTimeRevenueKobo: row?.all_time_revenue_kobo ?? 0,
    todayRevenueKobo: row?.today_revenue_kobo ?? 0,
  };
}

export interface AdminAuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_full_name: string | null;
  user_email: string | null;
}

export async function listAuditLogsAdmin(options: { limit: number; offset: number }): Promise<{
  items: AdminAuditLogRow[];
  total: number;
}> {
  const totalRow = await queryOne<{ count: number }>(`select count(*)::int as count from audit_logs`);
  const rows = await query<AdminAuditLogRow>(
    `select a.id, a.user_id, a.action, a.ip, a.metadata, a.created_at,
            u.full_name as user_full_name, u.email as user_email
       from audit_logs a
       left join profiles u on u.id = a.user_id
      order by a.created_at desc
      limit $1 offset $2`,
    [options.limit, options.offset],
  );
  return { items: rows, total: totalRow?.count ?? 0 };
}
