import { env } from '../../config/env.ts';
import { mockPaymentGateway } from './mockGateway.ts';
import { paystackGateway } from './paystackGateway.ts';
import type { PaymentGateway } from './types.ts';

/** The gateway selected by PAYMENT_PROVIDER. Everything outside this folder talks to this, never to a vendor directly. */
export const paymentGateway: PaymentGateway = env.paymentProvider === 'paystack' ? paystackGateway : mockPaymentGateway;
