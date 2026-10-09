import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.ts';
import type { InitializeFundingInput, InitializeFundingResult, PaymentGateway, WebhookEvent } from './types.ts';

export function signWebhookPayload(rawBody: string): string {
  return createHmac('sha256', env.webhookSecret).update(rawBody).digest('hex');
}

export const mockPaymentGateway: PaymentGateway = {
  name: 'mock-gateway',
  signatureHeader: 'x-webhook-signature',

  async initialize(input: InitializeFundingInput): Promise<InitializeFundingResult> {
    const accessCode = `ac_${input.reference.toLowerCase()}`;
    return {
      authorizationUrl: `/api/wallet/fund/mock-checkout?reference=${encodeURIComponent(input.reference)}`,
      accessCode,
      reference: input.reference,
    };
  },

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = signWebhookPayload(rawBody);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },

  parseWebhookEvent(rawBody: string): WebhookEvent | null {
    const payload = JSON.parse(rawBody) as { reference: string; status: 'success' | 'failed'; amountKobo: number };
    return payload;
  },
};
