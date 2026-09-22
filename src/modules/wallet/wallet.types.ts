export interface Wallet {
  id: string;
  userId: string;
  balanceKobo: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletRow {
  id: string;
  user_id: string;
  balance_kobo: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export function mapWallet(row: WalletRow): Wallet {
  return {
    id: row.id,
    userId: row.user_id,
    balanceKobo: row.balance_kobo,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
