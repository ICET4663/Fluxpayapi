import { query } from '../db/pool.ts';
import { recordAudit } from '../lib/audit.ts';
import { purgeExpiredResetTokens } from '../lib/resetToken.ts';
import { paymentGateway } from '../providers/payment/index.ts';
import { settleWithdrawal } from '../modules/banking/banking.service.ts';
import { mockVasProvider } from '../providers/vas/mockProvider.ts';
import { createNotification } from '../modules/notifications/notifications.repository.ts';
import { refundFailedTransaction } from '../modules/services/services.service.ts';
import { transitionTransaction } from '../modules/transactions/transactions.repository.ts';
import { mapTransaction, type TransactionRow } from '../modules/transactions/transactions.types.ts';

const STALE_PROCESSING_MINUTES = 5;
const STALE_FUNDING_HOURS = 24;
const UNVERIFIED_ACCOUNT_HOURS = 24;

/**
 * Cleans up work that a crash, a provider timeout or an abandoned flow left half-finished.
 * Every step is idempotent and safe to run concurrently on several instances.
 */
export async function reconcile() {
  // 1. Debits stuck in `processing`: the server died, or the provider never answered, between debit and settle.
  const stuck = await query<TransactionRow>(
    `select * from transactions
      where status = 'processing' and type = 'debit' and category <> 'withdrawal' and updated_at < now() - make_interval(mins => $1)
      order by updated_at limit 50`,
    [STALE_PROCESSING_MINUTES],
  );
  for (const row of stuck) {
    const tx = mapTransaction(row);
    try {
      const remote = mockVasProvider.queryTransaction
        ? await mockVasProvider.queryTransaction(tx.reference)
        : { status: 'unknown' as const };
      if (remote.status === 'successful') {
        await transitionTransaction(tx.id, ['processing'], 'successful', { metadata: { reconciled: true } });
        recordAudit('transaction_reconciled_successful', tx.userId, undefined, { reference: tx.reference });
      } else {
        // Failed or unknowable: refund the customer. (A real provider integration should return a definite answer above.)
        const failed = await refundFailedTransaction(tx, 'Timed out waiting for provider; refunded automatically');
        if (failed) {
          recordAudit('transaction_reconciled_refunded', tx.userId, undefined, { reference: tx.reference });
          await createNotification(
            tx.userId,
            'transaction',
            `${tx.title} failed`,
            'We could not complete this payment. Your wallet has been refunded.',
            { reference: tx.reference },
          );
        }
      }
    } catch (err) {
      console.error(`reconcile: ${tx.reference} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // 1b. Withdrawals stuck in `processing`. Unlike a bill payment these are NEVER refunded on a guess: the bank
  //     transfer may already have left. Ask the gateway; if it cannot give a final answer, leave it alone.
  const stuckWithdrawals = await query<TransactionRow>(
    `select * from transactions
      where status = 'processing' and category = 'withdrawal' and updated_at < now() - make_interval(mins => $1)
      order by updated_at limit 50`,
    [STALE_PROCESSING_MINUTES],
  );
  for (const row of stuckWithdrawals) {
    const tx = mapTransaction(row);
    try {
      if (!paymentGateway.verifyTransfer) continue;
      const state = await paymentGateway.verifyTransfer(tx.reference);
      if (state === 'pending') continue;
      await settleWithdrawal({ kind: 'transfer', reference: tx.reference, status: state, amountKobo: tx.amountKobo - tx.feeKobo });
    } catch (err) {
      console.error(`reconcile: withdrawal ${tx.reference} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // 2. Wallet funding the customer never completed.
  await query(
    `update transactions
        set status = 'failed', metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'expired')
      where status = 'pending' and category = 'wallet_funding' and created_at < now() - make_interval(hours => $1)`,
    [STALE_FUNDING_HOURS],
  );

  // 3. Signups that never verified their email. Deleting frees the email/phone for the real owner
  //    (cascades to the profile and empty wallet; an account that never signed in cannot have transactions).
  const removed = await query<{ id: string }>(
    `delete from auth.users u
      where u.email_confirmed_at is null
        and u.created_at < now() - make_interval(hours => $1)
        and not exists (select 1 from public.transactions t where t.user_id = u.id)
      returning u.id`,
    [UNVERIFIED_ACCOUNT_HOURS],
  );
  if (removed.length) console.log(`reconcile: removed ${removed.length} unverified account(s)`);

  // 4. Housekeeping.
  await purgeExpiredResetTokens();
}
