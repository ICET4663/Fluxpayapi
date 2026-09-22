import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { koboToNaira } from '../../utils/money.ts';
import { mockPaymentGateway } from '../../providers/payment/mockGateway.ts';
import { getWalletByUserIdOrThrow } from './wallet.repository.ts';
import { buildMockWebhookCall, initializeWalletFunding, settleWalletFunding } from './wallet.service.ts';
import { getTransactionByReference } from '../transactions/transactions.repository.ts';
import { serializeTransaction } from '../transactions/transactions.controller.ts';

export const getWallet = asyncHandler(async (req: Request, res: Response) => {
  const wallet = getWalletByUserIdOrThrow(req.user!.id);
  res.json({ wallet: { balance: koboToNaira(wallet.balanceKobo), currency: wallet.currency } });
});

export const initializeFunding = asyncHandler(async (req: Request, res: Response) => {
  const init = await initializeWalletFunding(req.user!.id, req.body.amount);
  res.status(201).json({ funding: init });
});

export const mockCheckoutInfo = asyncHandler(async (req: Request, res: Response) => {
  const reference = String(req.query.reference ?? '');
  const tx = getTransactionByReference(reference);
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
export const mockComplete = asyncHandler(async (req: Request, res: Response) => {
  const tx = getTransactionByReference(req.body.reference);
  if (!tx) throw AppError.notFound('Unknown transaction reference');

  const { rawBody, signature } = buildMockWebhookCall(req.body.reference, req.body.outcome, tx.amountKobo);
  if (!mockPaymentGateway.verifySignature(rawBody, signature)) {
    throw AppError.badRequest('Signature verification failed');
  }
  const event = mockPaymentGateway.parseWebhookEvent(rawBody);
  const settled = settleWalletFunding(event);
  res.json({ transaction: serializeTransaction(settled) });
});

export const webhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['x-webhook-signature'] as string | undefined;
  const rawBody = req.rawBody ?? JSON.stringify(req.body);

  if (!mockPaymentGateway.verifySignature(rawBody, signature)) {
    throw AppError.unauthorized('Invalid webhook signature');
  }

  const event = mockPaymentGateway.parseWebhookEvent(rawBody);
  settleWalletFunding(event);
  res.status(200).json({ received: true });
});
