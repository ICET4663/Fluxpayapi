import { AppError } from '../../utils/AppError.ts';
import { generateReference, nairaToKobo } from '../../utils/money.ts';
import { recordAudit } from '../../lib/audit.ts';
import { withTransaction } from '../../db/client.ts';
import { mockPaymentGateway, signWebhookPayload } from '../../providers/payment/mockGateway.ts';
import type { WebhookEvent } from '../../providers/payment/types.ts';
import { creditWallet, getWalletByUserIdOrThrow } from './wallet.repository.ts';
import {
  createTransaction,
  getTransactionByReference,
  updateTransactionStatus,
} from '../transactions/transactions.repository.ts';
import { findUserByIdOrThrow } from '../users/users.repository.ts';

export async function initializeWalletFunding(userId: string, amountNaira: number) {
  const wallet = getWalletByUserIdOrThrow(userId);
  const user = findUserByIdOrThrow(userId);
  const reference = generateReference('FUND');

  createTransaction({
    userId,
    walletId: wallet.id,
    reference,
    type: 'credit',
    category: 'wallet_funding',
    title: 'Wallet Funding',
    subtitle: 'Awaiting payment confirmation',
    amountKobo: nairaToKobo(amountNaira),
    status: 'pending',
    provider: mockPaymentGateway.name,
  });

  const init = await mockPaymentGateway.initialize({
    amountKobo: nairaToKobo(amountNaira),
    email: user.email,
    reference,
  });

  return init;
}

/** Shared by the signed webhook endpoint and the dev-only mock-complete helper so both exercise the same settlement logic. */
export function settleWalletFunding(event: WebhookEvent) {
  const tx = getTransactionByReference(event.reference);
  if (!tx) throw AppError.notFound('Unknown transaction reference');
  if (tx.category !== 'wallet_funding') throw AppError.badRequest('Reference is not a wallet funding transaction');

  // Webhooks can be delivered more than once — only settle a still-pending transaction.
  if (tx.status !== 'pending') {
    return tx;
  }

  return withTransaction(() => {
    if (event.status === 'success') {
      creditWallet(tx.walletId, tx.amountKobo);
      const settled = updateTransactionStatus(tx.id, 'successful', { metadata: { settledAt: new Date().toISOString() } });
      recordAudit('wallet_funded', tx.userId, undefined, { reference: tx.reference, amountKobo: tx.amountKobo });
      return settled;
    }
    const failed = updateTransactionStatus(tx.id, 'failed');
    recordAudit('wallet_funding_failed', tx.userId, undefined, { reference: tx.reference });
    return failed;
  });
}

export function buildMockWebhookCall(reference: string, outcome: 'success' | 'failed', amountKobo: number) {
  const payload: WebhookEvent = { reference, status: outcome, amountKobo };
  const rawBody = JSON.stringify(payload);
  const signature = signWebhookPayload(rawBody);
  return { rawBody, signature };
}
