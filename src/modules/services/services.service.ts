import { isUniqueViolation, withTransaction } from '../../db/pool.ts';
import { generateReference, koboToNaira, nairaToKobo } from '../../utils/money.ts';
import { recordAudit } from '../../lib/audit.ts';
import { creditWallet, debitWallet, getWalletByUserIdOrThrow } from '../wallet/wallet.repository.ts';
import {
  createTransaction,
  getTransactionByIdempotencyKey,
  transitionTransaction,
} from '../transactions/transactions.repository.ts';
import type { Transaction, TransactionCategory } from '../transactions/transactions.types.ts';
import { createNotification } from '../notifications/notifications.repository.ts';
import { assertPinCorrect } from '../users/pin.service.ts';
import type { ProviderResult } from '../../providers/vas/types.ts';
import type { User } from '../users/users.types.ts';

const PROVIDER_TIMEOUT_MS = 25_000;

class ProviderTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface PurchaseInput {
  user: User;
  pin: string;
  ip?: string;
  idempotencyKey?: string;
  category: TransactionCategory;
  title: string;
  subtitle: string;
  amountNaira: number;
  /** Portion of amountNaira that is FluxPay's convenience fee, tracked separately for revenue reporting. */
  feeNaira?: number;
  callProvider: (reference: string) => Promise<ProviderResult>;
}

/** Returns the settled transaction to the user and tells them what happened. */
async function notifyOutcome(tx: Transaction) {
  const amount = `₦${koboToNaira(tx.amountKobo).toLocaleString('en-NG')}`;
  if (tx.status === 'successful') {
    await createNotification(tx.userId, 'transaction', `${tx.title} successful`, `${amount} paid for ${tx.title}.`, { reference: tx.reference });
  } else if (tx.status === 'failed') {
    await createNotification(tx.userId, 'transaction', `${tx.title} failed`, `${amount} was refunded to your wallet.`, { reference: tx.reference });
  }
}

/**
 * Shared transaction engine for every outbound service purchase (airtime, data, electricity, tv).
 *
 *   1. PIN check (with lockout)
 *   2. Atomically debit the wallet and record a `processing` transaction — one database transaction
 *   3. Call the provider (outside any database transaction, so a slow provider never holds a connection)
 *   4. Settle: `successful`, or `failed` + refund. Compare-and-set on the status guarantees a refund
 *      happens at most once even if the reconciler and this request race.
 *
 * Idempotency keys make client retries safe: the same key never charges twice.
 */
export async function purchaseService(input: PurchaseInput): Promise<Transaction> {
  if (input.idempotencyKey) {
    const existing = await getTransactionByIdempotencyKey(input.user.id, input.idempotencyKey);
    if (existing) return existing;
  }

  await assertPinCorrect(input.user, input.pin, input.ip);

  const wallet = await getWalletByUserIdOrThrow(input.user.id);
  const amountKobo = nairaToKobo(input.amountNaira);
  const feeKobo = nairaToKobo(input.feeNaira ?? 0);
  const reference = generateReference('FLX');

  let pending: Transaction;
  try {
    pending = await withTransaction(async (client) => {
      await debitWallet(wallet.id, amountKobo, client);
      return createTransaction(
        {
          userId: input.user.id,
          walletId: wallet.id,
          reference,
          idempotencyKey: input.idempotencyKey ?? null,
          type: 'debit',
          category: input.category,
          title: input.title,
          subtitle: input.subtitle,
          amountKobo,
          feeKobo,
          status: 'processing',
        },
        client,
      );
    });
  } catch (err) {
    // Two concurrent requests with the same idempotency key: the loser's debit rolled back; return the winner's result.
    if (isUniqueViolation(err) && input.idempotencyKey) {
      const existing = await getTransactionByIdempotencyKey(input.user.id, input.idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }

  recordAudit('transaction_initiated', input.user.id, input.ip, { reference, category: input.category, amountKobo });

  let result: ProviderResult;
  try {
    result = await withTimeout(input.callProvider(reference), PROVIDER_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof ProviderTimeout) {
      // Outcome unknown — the provider may still complete it. Leave it `processing`; the reconciler resolves it.
      recordAudit('transaction_provider_timeout', input.user.id, input.ip, { reference });
      return pending;
    }
    result = { success: false, providerReference: reference, message: err instanceof Error ? err.message : 'Provider error' };
  }

  if (result.success) {
    const settled = await transitionTransaction(pending.id, ['processing'], 'successful', {
      providerReference: result.providerReference,
      metadata: { providerMessage: result.message },
    });
    recordAudit('transaction_successful', input.user.id, input.ip, { reference });
    if (settled) await notifyOutcome(settled);
    return settled ?? pending;
  }

  const failed = await refundFailedTransaction(pending, result.message, result.providerReference);
  recordAudit('transaction_failed_reversed', input.user.id, input.ip, { reference, reason: result.message });
  if (failed) await notifyOutcome(failed);
  return failed ?? pending;
}

/** Marks a processing debit as failed and returns the money — together, or not at all. */
export async function refundFailedTransaction(tx: Transaction, reason: string, providerReference?: string): Promise<Transaction | null> {
  return withTransaction(async (client) => {
    const failed = await transitionTransaction(
      tx.id,
      ['processing'],
      'failed',
      { providerReference: providerReference ?? null, metadata: { providerMessage: reason, refundedAt: new Date().toISOString() } },
      client,
    );
    if (!failed) return null; // already settled elsewhere; do not refund twice
    await creditWallet(tx.walletId, tx.amountKobo, client);
    return failed;
  });
}
