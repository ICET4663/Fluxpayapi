import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { koboToNaira } from '../../utils/money.ts';
import { listTransactions } from './transactions.repository.ts';
import type { Transaction } from './transactions.types.ts';

export function serializeTransaction(tx: Transaction) {
  return {
    id: tx.id,
    reference: tx.reference,
    title: tx.title,
    subtitle: tx.subtitle,
    amount: koboToNaira(tx.amountKobo),
    fee: koboToNaira(tx.feeKobo),
    type: tx.type,
    category: tx.category,
    status: tx.status,
    createdAt: tx.createdAt,
  };
}

export const getTransactions = asyncHandler(async (req: Request, res: Response) => {
  const { type, limit, offset } = req.query as unknown as { type?: 'credit' | 'debit'; limit: number; offset: number };
  const { items, total } = listTransactions({ userId: req.user!.id, type, limit, offset });
  res.json({ transactions: items.map(serializeTransaction), total, limit, offset });
});
