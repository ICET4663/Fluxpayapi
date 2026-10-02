import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { koboToNaira } from '../../utils/money.ts';
import { getUserTransactionByReference, listTransactions } from './transactions.repository.ts';
import type { Transaction, TransactionCategory, TransactionType } from './transactions.types.ts';

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
  const { type, category, limit, offset } = req.query as unknown as {
    type?: TransactionType;
    category?: TransactionCategory;
    limit: number;
    offset: number;
  };
  const { items, total } = await listTransactions({ userId: req.user!.id, type, category, limit, offset });
  res.json({ transactions: items.map(serializeTransaction), total, limit, offset });
});

export const getTransaction = asyncHandler(async (req: Request, res: Response) => {
  const tx = await getUserTransactionByReference(req.user!.id, String(req.params.reference));
  if (!tx) throw AppError.notFound('Transaction not found');
  res.json({ transaction: serializeTransaction(tx) });
});
