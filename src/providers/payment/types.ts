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
  initialize(input: InitializeFundingInput): Promise<InitializeFundingResult>;
  verifySignature(rawBody: string, signature: string | undefined): boolean;
  parseWebhookEvent(rawBody: string): WebhookEvent;
}
