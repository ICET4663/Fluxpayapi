export interface ProviderResult {
  success: boolean;
  /** Accepted but not final (e.g. a bank transfer awaiting its webhook): keep the transaction `processing`, do not refund. */
  pending?: boolean;
  providerReference: string;
  message: string;
}

export interface BuyAirtimeInput {
  network: string;
  phone: string;
  amountKobo: number;
  reference: string;
}

export interface BuyDataInput {
  network: string;
  phone: string;
  planId: string;
  amountKobo: number;
  reference: string;
}

export interface PayElectricityInput {
  discoId: string;
  meterNumber: string;
  meterType: 'prepaid' | 'postpaid';
  amountKobo: number;
  reference: string;
}

export interface PayTvInput {
  provider: string;
  smartCardNumber: string;
  packageId: string;
  amountKobo: number;
  reference: string;
}

export interface CustomerLookup {
  valid: boolean;
  customerName?: string;
  message?: string;
}

export interface VasProvider {
  name: string;
  buyAirtime(input: BuyAirtimeInput): Promise<ProviderResult>;
  buyData(input: BuyDataInput): Promise<ProviderResult>;
  payElectricity(input: PayElectricityInput): Promise<ProviderResult>;
  payTv(input: PayTvInput): Promise<ProviderResult>;
  validateMeter(input: { discoId: string; meterNumber: string; meterType: 'prepaid' | 'postpaid' }): Promise<CustomerLookup>;
  validateSmartCard(input: { provider: string; smartCardNumber: string }): Promise<CustomerLookup>;
  /** Optional: real providers can report the final state of a reference, which the reconciler uses before refunding. */
  queryTransaction?(reference: string): Promise<{ status: 'successful' | 'failed' | 'unknown' }>;
}
