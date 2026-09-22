import { generateReference } from '../../utils/money.ts';
import type { BuyAirtimeInput, BuyDataInput, PayElectricityInput, ProviderResult, VasProvider } from './types.ts';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Deterministic test hook: any phone/meter number ending in 0000 simulates a provider failure,
// so the failure/reversal path can be exercised on demand without relying on randomness.
function shouldSimulateFailure(identifier: string): boolean {
  return identifier.endsWith('0000');
}

export const mockVasProvider: VasProvider = {
  name: 'mock-vas',

  async buyAirtime(input: BuyAirtimeInput): Promise<ProviderResult> {
    await delay(400 + Math.random() * 400);
    if (shouldSimulateFailure(input.phone)) {
      return { success: false, providerReference: generateReference('MVAS'), message: 'Network provider declined the request' };
    }
    return { success: true, providerReference: generateReference('MVAS'), message: `Airtime delivered to ${input.phone}` };
  },

  async buyData(input: BuyDataInput): Promise<ProviderResult> {
    await delay(400 + Math.random() * 400);
    if (shouldSimulateFailure(input.phone)) {
      return { success: false, providerReference: generateReference('MVAS'), message: 'Network provider declined the request' };
    }
    return { success: true, providerReference: generateReference('MVAS'), message: `Data plan activated for ${input.phone}` };
  },

  async payElectricity(input: PayElectricityInput): Promise<ProviderResult> {
    await delay(500 + Math.random() * 500);
    if (shouldSimulateFailure(input.meterNumber)) {
      return { success: false, providerReference: generateReference('MVAS'), message: 'Disco provider declined the request' };
    }
    return { success: true, providerReference: generateReference('MVAS'), message: `Meter ${input.meterNumber} recharged` };
  },
};
