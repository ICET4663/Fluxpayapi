import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.ts';
import type {
  Bank,
  InitializeFundingInput,
  InitializeFundingResult,
  PaymentGateway,
  TransferInput,
  TransferResult,
  WebhookEvent,
} from './types.ts';

const API = 'https://api.paystack.co';
const REQUEST_TIMEOUT_MS = 15_000;
const BANK_CACHE_MS = 60 * 60 * 1000;

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

interface RawResponse<T> {
  httpStatus: number;
  body: PaystackEnvelope<T> | null;
}

/** Network errors and timeouts propagate as exceptions (outcome unknown); HTTP answers are returned for the caller to judge. */
async function paystackRaw<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<RawResponse<T>> {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  return { httpStatus: res.status, body };
}

async function paystack<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<PaystackEnvelope<T>> {
  const { httpStatus, body } = await paystackRaw<T>(path, init);
  if (httpStatus < 200 || httpStatus >= 300 || !body?.status) {
    throw new Error(`Paystack ${init.method} ${path} failed (${httpStatus}): ${body?.message ?? 'no response body'}`);
  }
  return body;
}

function callbackUrl(): string | undefined {
  if (env.paystackCallbackUrl) return env.paystackCallbackUrl;
  const origin = env.corsOrigins[0];
  return origin ? `${origin.replace(/\/$/, '')}/dashboard/wallet` : undefined;
}

/** Lets tests (and the signature check) compute the signature Paystack would send for a body. */
export function signPaystackPayload(rawBody: string, secret: string): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

// Paystack requires transfer references to be lowercase (a-z, 0-9, - and _). Ours are uppercase, so they are
// lowercased on the way out and upper-cased again when a transfer webhook comes back.
const toTransferRef = (reference: string) => reference.toLowerCase();
const fromTransferRef = (reference: string) => reference.toUpperCase();

let bankCache: { at: number; banks: Bank[] } | null = null;

/**
 * Paystack (https://paystack.com/docs/api). All customers pay into the ONE merchant account behind the secret key;
 * which user a payment belongs to is decided only by our own `reference`, which we create per top-up.
 *
 * Amounts: Paystack uses the lowest currency unit (kobo for NGN), same as our ledger.
 */
export const paystackGateway: PaymentGateway = {
  name: 'paystack',
  signatureHeader: 'x-paystack-signature',

  async initialize(input: InitializeFundingInput): Promise<InitializeFundingResult> {
    const { data } = await paystack<{ authorization_url: string; access_code: string; reference: string }>(
      '/transaction/initialize',
      {
        method: 'POST',
        body: {
          email: input.email,
          amount: input.amountKobo,
          reference: input.reference,
          currency: 'NGN',
          callback_url: callbackUrl(),
        },
      },
    );
    return { authorizationUrl: data.authorization_url, accessCode: data.access_code, reference: data.reference };
  },

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature || !env.paystackSecretKey) return false;
    const expected = Buffer.from(signPaystackPayload(rawBody, env.paystackSecretKey));
    const actual = Buffer.from(signature);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  },

  parseWebhookEvent(rawBody: string): WebhookEvent | null {
    const payload = JSON.parse(rawBody) as { event?: string; data?: { reference?: string; amount?: number } };
    const reference = payload.data?.reference;
    const amount = payload.data?.amount;
    if (!reference || typeof amount !== 'number') return null;

    switch (payload.event) {
      case 'charge.success':
        // Paystack does not send a dependable "failed" webhook for abandoned checkouts, so unfinished top-ups
        // simply expire (see jobs/reconcile.ts).
        return { kind: 'funding', reference, status: 'success', amountKobo: amount };
      case 'transfer.success':
        return { kind: 'transfer', reference: fromTransferRef(reference), status: 'success', amountKobo: amount };
      case 'transfer.failed':
      case 'transfer.reversed':
        return { kind: 'transfer', reference: fromTransferRef(reference), status: 'failed', amountKobo: amount };
      default:
        return null;
    }
  },

  async verifyTransaction(reference: string): Promise<WebhookEvent | null> {
    const { data } = await paystack<{ status: string; reference: string; amount: number }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      { method: 'GET' },
    );
    if (data.status === 'success') return { kind: 'funding', reference: data.reference, status: 'success', amountKobo: data.amount };
    if (data.status === 'failed') return { kind: 'funding', reference: data.reference, status: 'failed', amountKobo: data.amount };
    return null; // abandoned / ongoing: not final yet
  },

  async listBanks(): Promise<Bank[]> {
    if (bankCache && Date.now() - bankCache.at < BANK_CACHE_MS) return bankCache.banks;
    const { data } = await paystack<{ name: string; code: string; active: boolean }[]>(
      '/bank?country=nigeria&currency=NGN&perPage=200',
      { method: 'GET' },
    );
    const banks = data.filter((b) => b.active !== false).map((b) => ({ code: b.code, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
    bankCache = { at: Date.now(), banks };
    return banks;
  },

  async resolveAccount(bankCode: string, accountNumber: string) {
    const { httpStatus, body } = await paystackRaw<{ account_name: string }>(
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { method: 'GET' },
    );
    if (httpStatus >= 500) throw new Error(`Paystack account resolve failed (${httpStatus})`);
    if (!body?.status || !body.data?.account_name) return null; // 4xx: account not found / bad bank code
    return { accountName: body.data.account_name };
  },

  async transfer(input: TransferInput): Promise<TransferResult> {
    // A network error/timeout in either call propagates as an exception on purpose: the caller must treat the
    // outcome as unknown (leave the withdrawal `processing`) rather than refund money that may have been sent.
    const recipient = await paystackRaw<{ recipient_code: string }>('/transferrecipient', {
      method: 'POST',
      body: { type: 'nuban', name: input.accountName, account_number: input.accountNumber, bank_code: input.bankCode, currency: 'NGN' },
    });
    if (recipient.httpStatus >= 500) throw new Error(`Paystack recipient creation failed (${recipient.httpStatus})`);
    if (!recipient.body?.status) return { status: 'failed', message: recipient.body?.message ?? 'Could not set up the recipient' };

    const sent = await paystackRaw<{ status: string; transfer_code: string; reference: string }>('/transfer', {
      method: 'POST',
      body: {
        source: 'balance',
        amount: input.amountKobo,
        recipient: recipient.body.data.recipient_code,
        reference: toTransferRef(input.reference),
        reason: input.reason,
        currency: 'NGN',
      },
    });
    if (sent.httpStatus >= 500) throw new Error(`Paystack transfer failed (${sent.httpStatus})`);
    // A 4xx means Paystack refused it outright (invalid account, insufficient Paystack balance, ...): nothing moved.
    if (!sent.body?.status) return { status: 'failed', message: sent.body?.message ?? 'Transfer rejected' };

    const state = sent.body.data.status;
    const gatewayReference = sent.body.data.transfer_code;
    if (state === 'success') return { status: 'success', gatewayReference, message: sent.body.message };
    if (state === 'failed' || state === 'reversed') return { status: 'failed', gatewayReference, message: sent.body.message };
    // 'pending', 'received', and 'otp' (transfer OTP must be disabled in the dashboard for API payouts): await the webhook.
    return { status: 'pending', gatewayReference, message: sent.body.message };
  },

  async verifyTransfer(reference: string) {
    const { data } = await paystack<{ status: string }>(`/transfer/verify/${encodeURIComponent(toTransferRef(reference))}`, { method: 'GET' });
    if (data.status === 'success') return 'success';
    if (data.status === 'failed' || data.status === 'reversed') return 'failed';
    return 'pending';
  },
};
