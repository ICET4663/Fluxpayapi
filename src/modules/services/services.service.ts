import { AppError } from '../../utils/AppError.ts';
import { generateReference, nairaToKobo } from '../../utils/money.ts';
import { verifySecret } from '../../lib/password.ts';
import { recordAudit } from '../../lib/audit.ts';
import { withTransaction } from '../../db/client.ts';
import { debitWallet, creditWallet, getWalletByUserIdOrThrow } from '../wallet/wallet.repository.ts';
import {
  createTransaction,
  getTransactionByIdempotencyKey,
  updateTransactionStatus,
} from '../transactions/transactions.repository.ts';
import type { TransactionCategory } from '../transactions/transactions.types.ts';
import type { ProviderResult } from '../../providers/vas/types.ts';
import type { User } from '../users/users.types.ts';

async function assertPinCorrect(user: User, pin: string) {
  if (!user.pinHash) throw AppError.forbidden('Set a transaction PIN before making payments');
  const ok = await verifySecret(pin, user.pinHash);
  if (!ok) throw AppError.unauthorized('Incorrect transaction PIN');
}

export interface PurchaseInput {
  user: User;
  pin: string;
  idempotencyKey?: string;
  category: TransactionCategory;
  title: string;
  subtitle: string;
  amountNaira: number;
  /** Portion of amountNaira that is FluxPay's convenience fee, tracked separately for revenue reporting. */
  feeNaira?: number;
  callProvider: (reference: string) => Promise<ProviderResult>;
}

/**
 * Shared transaction engine for every outbound service purchase (airtime, data, electricity, ...).
 * Debit-then-call-provider-then-settle, with idempotency so a client retry never double-charges,
 * and an automatic reversal (refund) if the upstream provider declines the request.
 */
export async function purchaseService(input: PurchaseInput) {
  if (input.idempotencyKey) {
    const existing = getTransactionByIdempotencyKey(input.user.id, input.idempotencyKey);
    if (existing) return existing;
  }

  await assertPinCorrect(input.user, input.pin);

  const wallet = getWalletByUserIdOrThrow(input.user.id);
  const amountKobo = nairaToKobo(input.amountNaira);
  const feeKobo = nairaToKobo(input.feeNaira ?? 0);
  const reference = generateReference('FLX');

  const pending = withTransaction(() => {
    debitWallet(wallet.id, amountKobo);
    return createTransaction({
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
    });
  });

  recordAudit('transaction_initiated', input.user.id, undefined, { reference, category: input.category, amountKobo });

  let result: ProviderResult;
  try {
    result = await input.callProvider(reference);
  } catch (err) {
    result = { success: false, providerReference: reference, message: err instanceof Error ? err.message : 'Provider error' };
  }

  if (result.success) {
    const settled = updateTransactionStatus(pending.id, 'successful', {
      providerReference: result.providerReference,
      metadata: { providerMessage: result.message },
    });
    recordAudit('transaction_successful', input.user.id, undefined, { reference });
    return settled;
  }

  // Provider declined — reverse the debit so the customer is never charged for a failed service.
  return withTransaction(() => {
    creditWallet(wallet.id, amountKobo);
    const failed = updateTransactionStatus(pending.id, 'failed', {
      providerReference: result.providerReference,
      metadata: { providerMessage: result.message },
    });
    recordAudit('transaction_failed_reversed', input.user.id, undefined, { reference, reason: result.message });
    return failed;
  });
}
