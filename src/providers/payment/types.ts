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
  /** What the event is about. Absent means a wallet top-up (charge). */
  kind?: 'funding' | 'transfer';
  reference: string;
  status: 'success' | 'failed';
  amountKobo: number;
}

export interface Bank {
  code: string;
  name: string;
}

export interface TransferInput {
  reference: string;
  amountKobo: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  reason: string;
}

export interface TransferResult {
  /** success: money has left. pending: accepted, final answer comes by webhook. failed: definitively rejected, nothing moved. */
  status: 'success' | 'pending' | 'failed';
  gatewayReference?: string;
  message: string;
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

  listBanks(): Promise<Bank[]>;
  /** Returns the account holder's name, or null when the account does not exist. */
  resolveAccount(bankCode: string, accountNumber: string): Promise<{ accountName: string } | null>;
  /** Throws when the outcome is UNKNOWN (network error/timeout/5xx): the money may or may not have moved. */
  transfer(input: TransferInput): Promise<TransferResult>;
  /** Final state of a transfer, for reconciling ones whose webhook never arrived. */
  verifyTransfer?(reference: string): Promise<'success' | 'failed' | 'pending'>;
}
