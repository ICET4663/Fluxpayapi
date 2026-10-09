import { recordAudit } from '../../lib/audit.ts';
import { paymentGateway } from '../../providers/payment/index.ts';
import type { WebhookEvent } from '../../providers/payment/types.ts';
import { AppError } from '../../utils/AppError.ts';
import { koboToNaira } from '../../utils/money.ts';
import { createNotification } from '../notifications/notifications.repository.ts';
import { purchaseService, refundFailedTransaction } from '../services/services.service.ts';
import { getTransactionByReference, transitionTransaction } from '../transactions/transactions.repository.ts';
import type { Transaction } from '../transactions/transactions.types.ts';
import type { User } from '../users/users.types.ts';

/** Flat fee FluxPay charges per withdrawal, in naira. Shown to the user before they confirm (see GET /api/banking/info). */
export const WITHDRAWAL_FEE_NAIRA = 50;
export const WITHDRAWAL_MIN_NAIRA = 100;
export const WITHDRAWAL_MAX_NAIRA = 500_000;

export async function listBanks() {
  return paymentGateway.listBanks();
}

export async function resolveAccount(bankCode: string, accountNumber: string) {
  const resolved = await paymentGateway.resolveAccount(bankCode, accountNumber);
  if (!resolved) throw AppError.badRequest('We could not find that account. Check the bank and account number.');
  return resolved;
}

export interface WithdrawInput {
  user: User;
  ip?: string;
  bankCode: string;
  accountNumber: string;
  amountNaira: number;
  pin: string;
  idempotencyKey?: string;
}

/**
 * Moves money from the user's wallet to their bank account.
 *
 * Reuses the purchase engine: PIN check (with lockout) -> atomic debit of amount + fee -> gateway transfer ->
 * settle. A transfer the gateway accepts but has not finished stays `processing` until its webhook arrives; a
 * definite rejection is refunded immediately; an UNKNOWN outcome (timeout) also stays `processing` and is resolved by
 * the reconciler against the gateway, never refunded blindly (the money may already have left).
 */
export async function withdraw(input: WithdrawInput): Promise<Transaction> {
  if (input.amountNaira < WITHDRAWAL_MIN_NAIRA) throw AppError.badRequest(`Minimum withdrawal is ₦${WITHDRAWAL_MIN_NAIRA}`);
  if (input.amountNaira > WITHDRAWAL_MAX_NAIRA) throw AppError.badRequest(`Maximum withdrawal is ₦${WITHDRAWAL_MAX_NAIRA.toLocaleString('en-NG')}`);

  const { accountName } = await resolveAccount(input.bankCode, input.accountNumber);
  const banks = await listBanks();
  const bankName = banks.find((b) => b.code === input.bankCode)?.name ?? input.bankCode;
  const masked = `${'*'.repeat(6)}${input.accountNumber.slice(-4)}`;

  return purchaseService({
    user: input.user,
    pin: input.pin,
    ip: input.ip,
    idempotencyKey: input.idempotencyKey,
    category: 'withdrawal',
    title: `Withdrawal to ${bankName}`,
    subtitle: `${accountName} • ${masked}`,
    amountNaira: input.amountNaira + WITHDRAWAL_FEE_NAIRA,
    feeNaira: WITHDRAWAL_FEE_NAIRA,
    callProvider: async (reference) => {
      const result = await paymentGateway.transfer({
        reference,
        amountKobo: Math.round(input.amountNaira * 100),
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        accountName,
        reason: 'FluxPay wallet withdrawal',
      });
      return {
        success: result.status === 'success',
        pending: result.status === 'pending',
        providerReference: result.gatewayReference ?? reference,
        message: result.message,
      };
    },
  });
}

/**
 * Applies a transfer webhook (Paystack transfer.success / transfer.failed / transfer.reversed).
 * Idempotent: only a `processing` withdrawal can change state.
 */
export async function settleWithdrawal(event: WebhookEvent) {
  const tx = await getTransactionByReference(event.reference);
  if (!tx || tx.category !== 'withdrawal') throw AppError.notFound('Unknown withdrawal reference');

  const requestedKobo = tx.amountKobo - tx.feeKobo;
  if (event.amountKobo !== requestedKobo) {
    recordAudit('withdrawal_amount_mismatch', tx.userId, undefined, { reference: tx.reference, expectedKobo: requestedKobo, receivedKobo: event.amountKobo });
    throw AppError.badRequest('Webhook amount does not match the withdrawal');
  }

  if (event.status === 'success') {
    const done = await transitionTransaction(tx.id, ['processing'], 'successful', { metadata: { settledAt: new Date().toISOString() } });
    if (done) {
      recordAudit('withdrawal_successful', tx.userId, undefined, { reference: tx.reference });
      await createNotification(tx.userId, 'transaction', 'Withdrawal successful', `₦${koboToNaira(requestedKobo).toLocaleString('en-NG')} was sent to your bank account.`, { reference: tx.reference });
    }
    return done ?? tx;
  }

  const refunded = await refundFailedTransaction(tx, 'Bank transfer failed or was reversed');
  if (refunded) {
    recordAudit('withdrawal_failed_refunded', tx.userId, undefined, { reference: tx.reference });
    await createNotification(tx.userId, 'transaction', 'Withdrawal failed', 'The transfer did not go through. Your wallet has been refunded.', { reference: tx.reference });
    return refunded;
  }
  // Already successful but now reported reversed: money left and came back to US, not the wallet. Needs a human.
  if (tx.status === 'successful') recordAudit('withdrawal_reversed_after_success', tx.userId, undefined, { reference: tx.reference });
  return tx;
}
