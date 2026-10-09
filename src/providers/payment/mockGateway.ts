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

const MOCK_BANKS: Bank[] = [
  { code: '044', name: 'Access Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '50211', name: 'Kuda Microfinance Bank' },
  { code: '999992', name: 'OPay' },
];

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

  async listBanks(): Promise<Bank[]> {
    return MOCK_BANKS;
  },

  // Test hook, same convention as the VAS mock: an account number ending in 0000 does not exist / is rejected.
  async resolveAccount(_bankCode: string, accountNumber: string) {
    return accountNumber.endsWith('0000') ? null : { accountName: 'JOHN ADEBAYO' };
  },

  async transfer(input: TransferInput): Promise<TransferResult> {
    if (input.accountNumber.endsWith('0000')) return { status: 'failed', message: 'Transfer rejected by the receiving bank' };
    return { status: 'success', gatewayReference: `mock_${input.reference.toLowerCase()}`, message: 'Transfer completed' };
  },

  async verifyTransfer() {
    return 'pending' as const;
  },
};
