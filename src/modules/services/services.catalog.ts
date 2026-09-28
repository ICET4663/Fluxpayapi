export const NETWORKS = ['mtn', 'airtel', 'glo', '9mobile'] as const;
export type NetworkId = (typeof NETWORKS)[number];

const NETWORK_LABELS: Record<NetworkId, string> = {
  mtn: 'MTN',
  airtel: 'Airtel',
  glo: 'Glo',
  '9mobile': '9mobile',
};

export function networkLabel(id: NetworkId): string {
  return NETWORK_LABELS[id];
}

export interface DataPlan {
  id: string;
  network: NetworkId;
  size: string;
  validity: string;
  priceNaira: number;
}

export const DATA_PLANS: DataPlan[] = [
  { id: 'mtn-1gb', network: 'mtn', size: '1 GB', validity: '30 days', priceNaira: 350 },
  { id: 'mtn-2gb', network: 'mtn', size: '2 GB', validity: '30 days', priceNaira: 700 },
  { id: 'mtn-5gb', network: 'mtn', size: '5 GB', validity: '30 days', priceNaira: 1500 },
  { id: 'mtn-10gb', network: 'mtn', size: '10 GB', validity: '30 days', priceNaira: 3500 },
  { id: 'air-1.5gb', network: 'airtel', size: '1.5 GB', validity: '30 days', priceNaira: 350 },
  { id: 'air-3gb', network: 'airtel', size: '3 GB', validity: '30 days', priceNaira: 750 },
  { id: 'air-6gb', network: 'airtel', size: '6 GB', validity: '30 days', priceNaira: 1500 },
  { id: 'air-10gb', network: 'airtel', size: '10 GB', validity: '30 days', priceNaira: 3000 },
  { id: 'glo-1.2gb', network: 'glo', size: '1.2 GB', validity: '30 days', priceNaira: 300 },
  { id: 'glo-2.9gb', network: 'glo', size: '2.9 GB', validity: '30 days', priceNaira: 700 },
  { id: 'glo-5.8gb', network: 'glo', size: '5.8 GB', validity: '30 days', priceNaira: 1500 },
  { id: 'glo-11.5gb', network: 'glo', size: '11.5 GB', validity: '30 days', priceNaira: 3000 },
  { id: '9m-1gb', network: '9mobile', size: '1 GB', validity: '30 days', priceNaira: 350 },
  { id: '9m-2gb', network: '9mobile', size: '2 GB', validity: '30 days', priceNaira: 700 },
  { id: '9m-4.5gb', network: '9mobile', size: '4.5 GB', validity: '30 days', priceNaira: 1500 },
  { id: '9m-11gb', network: '9mobile', size: '11 GB', validity: '30 days', priceNaira: 3500 },
];

export const DISCOS = [
  { id: 'ikeja', name: 'Ikeja Electric' },
  { id: 'eko', name: 'Eko Electric' },
  { id: 'abuja', name: 'Abuja Electric' },
  { id: 'ibadan', name: 'Ibadan Electric' },
  { id: 'ph', name: 'Port Harcourt Electric' },
] as const;

export const ELECTRICITY_CONVENIENCE_FEE_NAIRA = 100;
export const ELECTRICITY_MIN_AMOUNT_NAIRA = 1000;

/** FluxPay's margin on airtime/data — what the provider charges us is a bit less than face value. */
export const AIRTIME_DATA_MARGIN_RATE = 0.03;

export function findDataPlan(id: string): DataPlan | undefined {
  return DATA_PLANS.find((p) => p.id === id);
}

export function findDisco(id: string) {
  return DISCOS.find((d) => d.id === id);
}

export const TV_PROVIDERS = ['dstv', 'gotv', 'startimes'] as const;
export type TvProviderId = (typeof TV_PROVIDERS)[number];

const TV_PROVIDER_LABELS: Record<TvProviderId, string> = {
  dstv: 'DStv',
  gotv: 'GOtv',
  startimes: 'StarTimes',
};

export function tvProviderLabel(id: TvProviderId): string {
  return TV_PROVIDER_LABELS[id];
}

export interface TvPackage {
  id: string;
  provider: TvProviderId;
  name: string;
  validity: string;
  priceNaira: number;
}

export const TV_PACKAGES: TvPackage[] = [
  { id: 'dstv-padi', provider: 'dstv', name: 'DStv Padi', validity: '30 days', priceNaira: 4400 },
  { id: 'dstv-yanga', provider: 'dstv', name: 'DStv Yanga', validity: '30 days', priceNaira: 6000 },
  { id: 'dstv-confam', provider: 'dstv', name: 'DStv Confam', validity: '30 days', priceNaira: 11000 },
  { id: 'dstv-compact', provider: 'dstv', name: 'DStv Compact', validity: '30 days', priceNaira: 19000 },
  { id: 'gotv-smallie', provider: 'gotv', name: 'GOtv Smallie', validity: '30 days', priceNaira: 1900 },
  { id: 'gotv-jinja', provider: 'gotv', name: 'GOtv Jinja', validity: '30 days', priceNaira: 3900 },
  { id: 'gotv-max', provider: 'gotv', name: 'GOtv Max', validity: '30 days', priceNaira: 6200 },
  { id: 'startimes-nova', provider: 'startimes', name: 'StarTimes Nova', validity: '30 days', priceNaira: 1900 },
  { id: 'startimes-basic', provider: 'startimes', name: 'StarTimes Basic', validity: '30 days', priceNaira: 3700 },
  { id: 'startimes-smart', provider: 'startimes', name: 'StarTimes Smart', validity: '30 days', priceNaira: 4900 },
];

export function findTvPackage(id: string): TvPackage | undefined {
  return TV_PACKAGES.find((p) => p.id === id);
}
