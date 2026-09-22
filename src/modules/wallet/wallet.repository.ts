import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.ts';
import { AppError } from '../../utils/AppError.ts';
import { mapWallet, type Wallet, type WalletRow } from './wallet.types.ts';

export function createWalletForUser(userId: string): Wallet {
  const id = randomUUID();
  db.prepare(`INSERT INTO wallets (id, user_id, balance_kobo) VALUES (?, ?, 0)`).run(id, userId);
  return getWalletByUserIdOrThrow(userId);
}

export function getWalletByUserId(userId: string): Wallet | null {
  const row = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(userId) as WalletRow | undefined;
  return row ? mapWallet(row) : null;
}

export function getWalletByUserIdOrThrow(userId: string): Wallet {
  const wallet = getWalletByUserId(userId);
  if (!wallet) throw AppError.notFound('Wallet not found');
  return wallet;
}

export function creditWallet(walletId: string, amountKobo: number): Wallet {
  if (amountKobo <= 0) throw AppError.badRequest('Credit amount must be positive');
  db.prepare(
    `UPDATE wallets SET balance_kobo = balance_kobo + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).run(amountKobo, walletId);
  const row = db.prepare(`SELECT * FROM wallets WHERE id = ?`).get(walletId) as unknown as WalletRow;
  return mapWallet(row);
}

export function debitWallet(walletId: string, amountKobo: number): Wallet {
  if (amountKobo <= 0) throw AppError.badRequest('Debit amount must be positive');
  const row = db.prepare(`SELECT * FROM wallets WHERE id = ?`).get(walletId) as WalletRow | undefined;
  if (!row) throw AppError.notFound('Wallet not found');
  if (row.balance_kobo < amountKobo) throw AppError.badRequest('Insufficient wallet balance');
  db.prepare(
    `UPDATE wallets SET balance_kobo = balance_kobo - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).run(amountKobo, walletId);
  const updated = db.prepare(`SELECT * FROM wallets WHERE id = ?`).get(walletId) as unknown as WalletRow;
  return mapWallet(updated);
}
