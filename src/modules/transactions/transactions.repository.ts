import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.ts';
import { mapTransaction, type Transaction, type TransactionCategory, type TransactionRow, type TransactionType } from './transactions.types.ts';

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

export function createTransaction(input: CreateTransactionInput): Transaction {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO transactions
      (id, user_id, wallet_id, reference, idempotency_key, type, category, title, subtitle, amount_kobo, fee_kobo, status, provider, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
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
  );
  return getTransactionByIdOrThrow(id);
}

export function getTransactionById(id: string): Transaction | null {
  const row = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id) as TransactionRow | undefined;
  return row ? mapTransaction(row) : null;
}

export function getTransactionByIdOrThrow(id: string): Transaction {
  const tx = getTransactionById(id);
  if (!tx) throw new Error(`Transaction ${id} not found`);
  return tx;
}

export function getTransactionByReference(reference: string): Transaction | null {
  const row = db.prepare(`SELECT * FROM transactions WHERE reference = ?`).get(reference) as TransactionRow | undefined;
  return row ? mapTransaction(row) : null;
}

export function getTransactionByIdempotencyKey(userId: string, idempotencyKey: string): Transaction | null {
  const row = db
    .prepare(`SELECT * FROM transactions WHERE user_id = ? AND idempotency_key = ?`)
    .get(userId, idempotencyKey) as TransactionRow | undefined;
  return row ? mapTransaction(row) : null;
}

export function updateTransactionStatus(
  id: string,
  status: 'pending' | 'processing' | 'successful' | 'failed' | 'reversed',
  extra?: { providerReference?: string | null; metadata?: Record<string, unknown> | null },
): Transaction {
  db.prepare(
    `UPDATE transactions
     SET status = ?,
         provider_reference = COALESCE(?, provider_reference),
         metadata = COALESCE(?, metadata),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(status, extra?.providerReference ?? null, extra?.metadata ? JSON.stringify(extra.metadata) : null, id);
  return getTransactionByIdOrThrow(id);
}

export interface ListTransactionsOptions {
  userId: string;
  type?: TransactionType;
  limit: number;
  offset: number;
}

export function listTransactions(options: ListTransactionsOptions): { items: Transaction[]; total: number } {
  const whereParts = ['user_id = ?'];
  const params: string[] = [options.userId];
  if (options.type) {
    whereParts.push('type = ?');
    params.push(options.type);
  }
  const where = whereParts.join(' AND ');

  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${where}`).get(...params) as {
    count: number;
  };

  const rows = db
    .prepare(`SELECT * FROM transactions WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, options.limit, options.offset) as unknown as TransactionRow[];

  return { items: rows.map(mapTransaction), total: totalRow.count };
}
