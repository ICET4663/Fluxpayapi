import { queryOne, type Queryable } from '../../db/pool.ts';
import { AppError } from '../../utils/AppError.ts';
import { mapWallet, type Wallet, type WalletRow } from './wallet.types.ts';

export async function getWalletByUserId(userId: string, client?: Queryable): Promise<Wallet | null> {
  const row = await queryOne<WalletRow>(`select * from wallets where user_id = $1`, [userId], client);
  return row ? mapWallet(row) : null;
}

export async function getWalletByUserIdOrThrow(userId: string, client?: Queryable): Promise<Wallet> {
  const wallet = await getWalletByUserId(userId, client);
  if (!wallet) throw AppError.notFound('Wallet not found');
  return wallet;
}

export async function creditWallet(walletId: string, amountKobo: number, client: Queryable): Promise<Wallet> {
  if (amountKobo <= 0) throw AppError.badRequest('Credit amount must be positive');
  const row = await queryOne<WalletRow>(
    `update wallets set balance_kobo = balance_kobo + $1 where id = $2 returning *`,
    [amountKobo, walletId],
    client,
  );
  if (!row) throw AppError.notFound('Wallet not found');
  return mapWallet(row);
}

/**
 * Atomic check-and-debit in a single statement: the balance condition and the subtraction cannot be
 * separated by a concurrent request, so two simultaneous purchases can never overdraw the wallet.
 */
export async function debitWallet(walletId: string, amountKobo: number, client: Queryable): Promise<Wallet> {
  if (amountKobo <= 0) throw AppError.badRequest('Debit amount must be positive');
  const row = await queryOne<WalletRow>(
    `update wallets set balance_kobo = balance_kobo - $1 where id = $2 and balance_kobo >= $1 returning *`,
    [amountKobo, walletId],
    client,
  );
  if (!row) throw new AppError(400, 'insufficient_funds', 'Insufficient wallet balance');
  return mapWallet(row);
}
