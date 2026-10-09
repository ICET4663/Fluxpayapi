import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { koboToNaira } from '../../utils/money.ts';
import { getSpendingBreakdown, getUserTransactionByReference, listTransactions } from './transactions.repository.ts';
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

/** Current date in Lagos as { year, month (1-12), day }. */
function lagosToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export const getSpendingSummary = asyncHandler(async (req: Request, res: Response) => {
  const today = lagosToday();
  const requested = (req.query as { month?: string }).month;
  const [year, month] = requested ? requested.split('-').map(Number) : [today.year, today.month];
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;

  const b = await getSpendingBreakdown(req.user!.id, monthStart);

  const isCurrent = year === today.year && month === today.month;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = isCurrent ? today.day : daysInMonth;
  const changePercent = b.previousMonthKobo > 0 ? Math.round(((b.totalKobo - b.previousMonthKobo) / b.previousMonthKobo) * 1000) / 10 : null;

  res.json({
    summary: {
      month: monthStart.slice(0, 7),
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      totalSpent: koboToNaira(b.totalKobo),
      previousMonthSpent: koboToNaira(b.previousMonthKobo),
      /** Positive = spent more than last month, negative = less, null = no spending last month to compare with. */
      changePercent,
      dailyAverage: koboToNaira(Math.round(b.totalKobo / daysElapsed)),
      weeks: b.weeks.map((kobo, i) => ({ label: `W${i + 1}`, amount: koboToNaira(kobo) })),
      byCategory: Object.entries(b.byCategory).map(([category, kobo]) => ({ category, amount: koboToNaira(kobo) })),
    },
  });
});
