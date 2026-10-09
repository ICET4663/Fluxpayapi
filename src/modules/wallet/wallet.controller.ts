import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { koboToNaira } from '../../utils/money.ts';
import { mockPaymentGateway } from '../../providers/payment/mockGateway.ts';
import { paymentGateway } from '../../providers/payment/index.ts';
import { recordAudit } from '../../lib/audit.ts';
import { settleWithdrawal } from '../banking/banking.service.ts';
import { getWalletByUserIdOrThrow } from './wallet.repository.ts';
import { buildMockWebhookCall, initializeWalletFunding, settleWalletFunding, verifyWalletFunding } from './wallet.service.ts';
import { getUserTransactionByReference } from '../transactions/transactions.repository.ts';
import { serializeTransaction } from '../transactions/transactions.controller.ts';

export const getWallet = asyncHandler(async (req: Request, res: Response) => {
  const wallet = await getWalletByUserIdOrThrow(req.user!.id);
  res.json({ wallet: { balance: koboToNaira(wallet.balanceKobo), currency: wallet.currency } });
});

export const initializeFunding = asyncHandler(async (req: Request, res: Response) => {
  const init = await initializeWalletFunding(req.user!.id, req.body.amount);
  res.status(201).json({ funding: init });
});

/** The mock checkout endpoints only exist while ENABLE_MOCK_PAYMENTS is on; production answers 404. */
export function requireMockPayments(_req: Request, _res: Response, next: NextFunction) {
  if (!env.enableMockPayments) return next(AppError.notFound('Not found'));
  next();
}

export const mockCheckoutInfo = asyncHandler(async (req: Request, res: Response) => {
  const reference = String(req.query.reference ?? '');
  const tx = await getUserTransactionByReference(req.user!.id, reference);
  if (!tx) throw AppError.notFound('Unknown transaction reference');
  res.json({
    message: 'This stands in for a hosted payment page. No real gateway is wired up yet.',
    reference,
    amount: koboToNaira(tx.amountKobo),
    status: tx.status,
    completeWith: 'POST /api/wallet/fund/mock-complete { reference, outcome: "success" | "failed" }',
  });
});

// Dev-only convenience: simulates the gateway calling our webhook, signature included,
// so the funding flow can be exercised end to end without a real payment provider.
// Requires the caller's own session and only works on the caller's own transaction.
export const mockComplete = asyncHandler(async (req: Request, res: Response) => {
  const tx = await getUserTransactionByReference(req.user!.id, req.body.reference);
  if (!tx) throw AppError.notFound('Unknown transaction reference');
  // A top-up that went to a real gateway must never be completable through the fake checkout.
  if (tx.provider !== mockPaymentGateway.name) throw AppError.badRequest('This payment was not made through the mock gateway');

  const { rawBody, signature } = buildMockWebhookCall(tx.reference, req.body.outcome, tx.amountKobo);
  if (!mockPaymentGateway.verifySignature(rawBody, signature)) {
    throw AppError.badRequest('Signature verification failed');
  }
  const event = mockPaymentGateway.parseWebhookEvent(rawBody);
  if (!event) throw AppError.badRequest('Unreadable mock event');
  const settled = await settleWalletFunding(event);
  res.json({ transaction: serializeTransaction(settled) });
});

/** Called by the frontend when the user returns from checkout, in case the webhook has not landed yet. */
export const verifyFunding = asyncHandler(async (req: Request, res: Response) => {
  const settled = await verifyWalletFunding(req.user!.id, req.body.reference);
  res.json({ transaction: serializeTransaction(settled) });
});

export const webhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers[paymentGateway.signatureHeader] as string | undefined;
  const rawBody = req.rawBody ?? JSON.stringify(req.body);

  if (!paymentGateway.verifySignature(rawBody, signature)) {
    throw AppError.unauthorized('Invalid webhook signature');
  }

  const event = paymentGateway.parseWebhookEvent(rawBody);
  if (event) {
    try {
      if (event.kind === 'transfer') await settleWithdrawal(event);
      else await settleWalletFunding(event);
    } catch (err) {
      // An unknown reference (e.g. a charge from another product on the same Paystack account) is not ours to settle.
      // Answer 200 anyway so the gateway does not retry it forever; real failures still surface as errors.
      if (!(err instanceof AppError && err.statusCode === 404)) throw err;
      recordAudit('webhook_unknown_reference', null, req.ip, { reference: event.reference });
    }
  }
  res.status(200).json({ received: true });
});
