export interface InitializeFundingInput {
  amountKobo: number;
  email: string;
  reference: string;
}

export interface InitializeFundingResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface WebhookEvent {
  reference: string;
  status: 'success' | 'failed';
  amountKobo: number;
}

export interface PaymentGateway {
  name: string;
  /** Lower-case name of the HTTP header that carries the webhook signature. */
  signatureHeader: string;
  initialize(input: InitializeFundingInput): Promise<InitializeFundingResult>;
  verifySignature(rawBody: string, signature: string | undefined): boolean;
  /** Returns null for events we do not act on (the webhook endpoint still answers 200 so the gateway stops retrying). */
  parseWebhookEvent(rawBody: string): WebhookEvent | null;
  /** Asks the gateway directly for a payment's final state. Null while it is still pending/abandoned. */
  verifyTransaction?(reference: string): Promise<WebhookEvent | null>;
}
