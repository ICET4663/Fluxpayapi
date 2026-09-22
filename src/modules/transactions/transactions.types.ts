export type TransactionType = 'credit' | 'debit';
export type TransactionCategory = 'airtime' | 'data' | 'electricity' | 'tv' | 'wallet_funding' | 'withdrawal';
export type TransactionStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'reversed';

export interface Transaction {
  id: string;
  userId: string;
  walletId: string;
  reference: string;
  idempotencyKey: string | null;
  type: TransactionType;
  category: TransactionCategory;
  title: string;
  subtitle: string | null;
  amountKobo: number;
  feeKobo: number;
  status: TransactionStatus;
  provider: string | null;
  providerReference: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  wallet_id: string;
  reference: string;
  idempotency_key: string | null;
  type: string;
  category: string;
  title: string;
  subtitle: string | null;
  amount_kobo: number;
  fee_kobo: number;
  status: string;
  provider: string | null;
  provider_reference: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    reference: row.reference,
    idempotencyKey: row.idempotency_key,
    type: row.type as TransactionType,
    category: row.category as TransactionCategory,
    title: row.title,
    subtitle: row.subtitle,
    amountKobo: row.amount_kobo,
    feeKobo: row.fee_kobo,
    status: row.status as TransactionStatus,
    provider: row.provider,
    providerReference: row.provider_reference,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
