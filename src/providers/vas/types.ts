export interface ProviderResult {
  success: boolean;
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

export interface VasProvider {
  name: string;
  buyAirtime(input: BuyAirtimeInput): Promise<ProviderResult>;
  buyData(input: BuyDataInput): Promise<ProviderResult>;
  payElectricity(input: PayElectricityInput): Promise<ProviderResult>;
}
