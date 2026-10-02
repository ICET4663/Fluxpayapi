import { query, queryOne, type Queryable } from '../../db/pool.ts';
import {
  mapTransaction,
  type Transaction,
  type TransactionCategory,
  type TransactionRow,
  type TransactionStatus,
  type TransactionType,
} from './transactions.types.ts';

export interface CreateTransactionInput {
  userId: string;
  walletId: string;
  reference: string;
  idempotencyKey?: string | null;
  type: TransactionType;
  category: TransactionCategory;
  title: string;
  subtitle?: string | null;
  amountKobo: number;
  feeKobo?: number;
  status: 'pending' | 'processing' | 'successful' | 'failed';
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createTransaction(input: CreateTransactionInput, client?: Queryable): Promise<Transaction> {
  const row = await queryOne<TransactionRow>(
    `insert into transactions
       (user_id, wallet_id, reference, idempotency_key, type, category, title, subtitle, amount_kobo, fee_kobo, status, provider, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning *`,
    [
      input.userId,
      input.walletId,
      input.reference,
      input.idempotencyKey ?? null,
      input.type,
      input.category,
      input.title,
      input.subtitle ?? null,
      input.amountKobo,
      input.feeKobo ?? 0,
      input.status,
      input.provider ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
    client,
  );
  return mapTransaction(row!);
}

export async function getTransactionByReference(reference: string, client?: Queryable): Promise<Transaction | null> {
  const row = await queryOne<TransactionRow>(`select * from transactions where reference = $1`, [reference], client);
  return row ? mapTransaction(row) : null;
}

export async function getUserTransactionByReference(userId: string, reference: string): Promise<Transaction | null> {
  const row = await queryOne<TransactionRow>(`select * from transactions where user_id = $1 and reference = $2`, [userId, reference]);
  return row ? mapTransaction(row) : null;
}

export async function getTransactionByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Transaction | null> {
  const row = await queryOne<TransactionRow>(
    `select * from transactions where user_id = $1 and idempotency_key = $2`,
    [userId, idempotencyKey],
  );
  return row ? mapTransaction(row) : null;
}

/**
 * Compare-and-set: moves a transaction to `to` only if it is currently in one of the `from` states.
 * Returns null when it was not (someone else already settled it). Every money-moving transition goes through
 * here, so a webhook retry or a reconciliation race can never credit or refund the same transaction twice.
 */
export async function transitionTransaction(
  id: string,
  from: TransactionStatus[],
  to: TransactionStatus,
  extra: { providerReference?: string | null; metadata?: Record<string, unknown> | null } = {},
  client?: Queryable,
): Promise<Transaction | null> {
  const row = await queryOne<TransactionRow>(
    `update transactions
        set status = $3,
            provider_reference = coalesce($4, provider_reference),
            metadata = case when $5::jsonb is null then metadata else coalesce(metadata, '{}'::jsonb) || $5::jsonb end
      where id = $1 and status = any($2::text[])
      returning *`,
    [id, from, to, extra.providerReference ?? null, extra.metadata ? JSON.stringify(extra.metadata) : null],
    client,
  );
  return row ? mapTransaction(row) : null;
}

export interface ListTransactionsOptions {
  userId: string;
  type?: TransactionType;
  category?: TransactionCategory;
  limit: number;
  offset: number;
}

export async function listTransactions(options: ListTransactionsOptions): Promise<{ items: Transaction[]; total: number }> {
  const params: unknown[] = [options.userId];
  let where = 'user_id = $1';
  if (options.type) {
    params.push(options.type);
    where += ` and type = $${params.length}`;
  }
  if (options.category) {
    params.push(options.category);
    where += ` and category = $${params.length}`;
  }

  const totalRow = await queryOne<{ count: number }>(`select count(*)::int as count from transactions where ${where}`, params);
  const rows = await query<TransactionRow>(
    `select * from transactions where ${where} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, options.limit, options.offset],
  );
  return { items: rows.map(mapTransaction), total: totalRow?.count ?? 0 };
}
