import { withTransaction } from '../../db/pool.ts';
import { AppError } from '../../utils/AppError.ts';
import { generateReference, koboToNaira, nairaToKobo } from '../../utils/money.ts';
import { recordAudit } from '../../lib/audit.ts';
import { signWebhookPayload } from '../../providers/payment/mockGateway.ts';
import { paymentGateway } from '../../providers/payment/index.ts';
import type { WebhookEvent } from '../../providers/payment/types.ts';
import { creditWallet, getWalletByUserIdOrThrow } from './wallet.repository.ts';
import {
  createTransaction,
  getTransactionByReference,
  getUserTransactionByReference,
  transitionTransaction,
} from '../transactions/transactions.repository.ts';
import { createNotification } from '../notifications/notifications.repository.ts';
import { findUserById } from '../users/users.repository.ts';

export async function initializeWalletFunding(userId: string, amountNaira: number) {
  const wallet = await getWalletByUserIdOrThrow(userId);
  const user = await findUserById(userId);
  if (!user) throw AppError.notFound('User not found');

  const reference = generateReference('FUND');
  const amountKobo = nairaToKobo(amountNaira);

  const pending = await createTransaction({
    userId,
    walletId: wallet.id,
    reference,
    type: 'credit',
    category: 'wallet_funding',
    title: 'Wallet Funding',
    subtitle: 'Awaiting payment confirmation',
    amountKobo,
    status: 'pending',
    provider: paymentGateway.name,
  });

  try {
    return await paymentGateway.initialize({ amountKobo, email: user.email, reference });
  } catch (err) {
    // Do not leave a pending ledger row behind for a checkout that never opened.
    await transitionTransaction(pending.id, ['pending'], 'failed', { metadata: { reason: 'gateway_unavailable' } });
    console.error('payment gateway initialize failed:', err instanceof Error ? err.message : err);
    throw new AppError(502, 'payment_gateway_error', 'We could not start the payment. Please try again.');
  }
}

/**
 * Shared by the signed webhook endpoint and the dev-only mock-complete helper so both exercise the same
 * settlement logic. Safe to call repeatedly for the same event: only the first call moves money.
 */
export async function settleWalletFunding(event: WebhookEvent) {
  const tx = await getTransactionByReference(event.reference);
  if (!tx) throw AppError.notFound('Unknown transaction reference');
  if (tx.category !== 'wallet_funding') throw AppError.badRequest('Reference is not a wallet funding transaction');

  if (event.amountKobo !== tx.amountKobo) {
    recordAudit('wallet_funding_amount_mismatch', tx.userId, undefined, {
      reference: tx.reference,
      expectedKobo: tx.amountKobo,
      receivedKobo: event.amountKobo,
    });
    throw AppError.badRequest('Webhook amount does not match the transaction');
  }

  return withTransaction(async (client) => {
    if (event.status === 'success') {
      const settled = await transitionTransaction(
        tx.id,
        ['pending'],
        'successful',
        { metadata: { settledAt: new Date().toISOString() } },
        client,
      );
      if (!settled) return (await getTransactionByReference(tx.reference, client))!; // already settled by an earlier delivery

      await creditWallet(tx.walletId, tx.amountKobo, client);
      recordAudit('wallet_funded', tx.userId, undefined, { reference: tx.reference, amountKobo: tx.amountKobo });
      await createNotification(
        tx.userId,
        'wallet_funded',
        'Wallet funded',
        `₦${koboToNaira(tx.amountKobo).toLocaleString('en-NG')} has been added to your wallet.`,
        { reference: tx.reference },
        client,
      );
      return settled;
    }

    const failed = await transitionTransaction(tx.id, ['pending'], 'failed', {}, client);
    if (failed) recordAudit('wallet_funding_failed', tx.userId, undefined, { reference: tx.reference });
    return failed ?? (await getTransactionByReference(tx.reference, client))!;
  });
}

/**
 * Asks the gateway for the payment's final state and settles it. Covers a webhook that is late or never arrives
 * (the user returns from checkout before Paystack calls us). Safe to call repeatedly.
 */
export async function verifyWalletFunding(userId: string, reference: string) {
  const tx = await getUserTransactionByReference(userId, reference);
  if (!tx || tx.category !== 'wallet_funding') throw AppError.notFound('Unknown transaction reference');
  if (tx.status !== 'pending' || !paymentGateway.verifyTransaction) return tx;

  const event = await paymentGateway.verifyTransaction(reference);
  return event ? settleWalletFunding(event) : tx;
}

export function buildMockWebhookCall(reference: string, outcome: 'success' | 'failed', amountKobo: number) {
  const payload: WebhookEvent = { reference, status: outcome, amountKobo };
  const rawBody = JSON.stringify(payload);
  const signature = signWebhookPayload(rawBody);
  return { rawBody, signature };
}
