import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.ts';
import type { InitializeFundingInput, InitializeFundingResult, PaymentGateway, WebhookEvent } from './types.ts';

const API = 'https://api.paystack.co';
const REQUEST_TIMEOUT_MS = 15_000;

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

async function paystack<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<PaystackEnvelope<T>> {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack ${init.method} ${path} failed (${res.status}): ${json?.message ?? 'no response body'}`);
  }
  return json;
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
    const payload = JSON.parse(rawBody) as { event?: string; data?: { reference?: string; amount?: number; status?: string } };
    // Only successful charges are acted on. Paystack does not send a dependable "failed" webhook for abandoned
    // checkouts, so unfinished top-ups simply expire (see jobs/reconcile.ts).
    if (payload.event !== 'charge.success' || !payload.data?.reference || typeof payload.data.amount !== 'number') return null;
    return { reference: payload.data.reference, status: 'success', amountKobo: payload.data.amount };
  },

  async verifyTransaction(reference: string): Promise<WebhookEvent | null> {
    const { data } = await paystack<{ status: string; reference: string; amount: number }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      { method: 'GET' },
    );
    if (data.status === 'success') return { reference: data.reference, status: 'success', amountKobo: data.amount };
    if (data.status === 'failed') return { reference: data.reference, status: 'failed', amountKobo: data.amount };
    return null; // abandoned / ongoing: not final yet
  },
};
