import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { mockVasProvider } from '../../providers/vas/mockProvider.ts';
import { serializeTransaction } from '../transactions/transactions.controller.ts';
import { purchaseService } from './services.service.ts';
import {
  AIRTIME_DATA_MARGIN_RATE,
  DATA_PLANS,
  DISCOS,
  ELECTRICITY_CONVENIENCE_FEE_NAIRA,
  NETWORKS,
  TV_PACKAGES,
  TV_PROVIDERS,
  findDataPlan,
  findDisco,
  findTvPackage,
  networkLabel,
  tvProviderLabel,
} from './services.catalog.ts';

export const listCatalog = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    networks: NETWORKS.map((id) => ({ id, name: networkLabel(id) })),
    dataPlans: DATA_PLANS,
    discos: DISCOS,
    electricityFee: ELECTRICITY_CONVENIENCE_FEE_NAIRA,
    tvProviders: TV_PROVIDERS.map((id) => ({ id, name: tvProviderLabel(id) })),
    tvPackages: TV_PACKAGES,
  });
});

export const buyAirtime = asyncHandler(async (req: Request, res: Response) => {
  const { network, phone, amount, pin, idempotencyKey } = req.body;
  const tx = await purchaseService({
    user: req.user!,
    pin,
    idempotencyKey,
    category: 'airtime',
    title: `${networkLabel(network)} Airtime`,
    subtitle: phone,
    amountNaira: amount,
    feeNaira: amount * AIRTIME_DATA_MARGIN_RATE,
    callProvider: (reference) => mockVasProvider.buyAirtime({ network, phone, amountKobo: Math.round(amount * 100), reference }),
  });
  res.status(201).json({ transaction: serializeTransaction(tx) });
});

export const buyData = asyncHandler(async (req: Request, res: Response) => {
  const { network, phone, planId, pin, idempotencyKey } = req.body;
  const plan = findDataPlan(planId);
  if (!plan || plan.network !== network) throw AppError.badRequest('Unknown data plan for this network');

  const tx = await purchaseService({
    user: req.user!,
    pin,
    idempotencyKey,
    category: 'data',
    title: `${networkLabel(network)} Data - ${plan.size}`,
    subtitle: phone,
    amountNaira: plan.priceNaira,
    feeNaira: plan.priceNaira * AIRTIME_DATA_MARGIN_RATE,
    callProvider: (reference) =>
      mockVasProvider.buyData({ network, phone, planId, amountKobo: Math.round(plan.priceNaira * 100), reference }),
  });
  res.status(201).json({ transaction: serializeTransaction(tx) });
});

export const payElectricity = asyncHandler(async (req: Request, res: Response) => {
  const { discoId, meterNumber, meterType, amount, pin, idempotencyKey } = req.body;
  const disco = findDisco(discoId);
  if (!disco) throw AppError.badRequest('Unknown distribution company');

  const total = amount + ELECTRICITY_CONVENIENCE_FEE_NAIRA;

  const tx = await purchaseService({
    user: req.user!,
    pin,
    idempotencyKey,
    category: 'electricity',
    title: disco.name,
    subtitle: `${meterType === 'prepaid' ? 'Prepaid' : 'Postpaid'} • ${meterNumber}`,
    amountNaira: total,
    feeNaira: ELECTRICITY_CONVENIENCE_FEE_NAIRA,
    callProvider: (reference) =>
      mockVasProvider.payElectricity({ discoId, meterNumber, meterType, amountKobo: Math.round(total * 100), reference }),
  });
  res.status(201).json({ transaction: serializeTransaction(tx) });
});

export const payTv = asyncHandler(async (req: Request, res: Response) => {
  const { provider, smartCardNumber, packageId, pin, idempotencyKey } = req.body;
  const pkg = findTvPackage(packageId);
  if (!pkg || pkg.provider !== provider) throw AppError.badRequest('Unknown package for this provider');

  const tx = await purchaseService({
    user: req.user!,
    pin,
    idempotencyKey,
    category: 'tv',
    title: `${tvProviderLabel(provider)} - ${pkg.name}`,
    subtitle: smartCardNumber,
    amountNaira: pkg.priceNaira,
    feeNaira: pkg.priceNaira * AIRTIME_DATA_MARGIN_RATE,
    callProvider: (reference) =>
      mockVasProvider.payTv({ provider, smartCardNumber, packageId, amountKobo: Math.round(pkg.priceNaira * 100), reference }),
  });
  res.status(201).json({ transaction: serializeTransaction(tx) });
});
