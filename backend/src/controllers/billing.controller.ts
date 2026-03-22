import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { BillingType, ProductCategory } from '@prisma/client';
import { DEFAULT_DEV_CUT_RATE } from '../config/constants';

// SUPER_ADMIN+ — basic store list (no billing info)
export async function getStores(_req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, city: true, state: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stores });
}

// DevAdmin only — change billing type for a store
const billingSchema = z.object({
  billingType: z.nativeEnum(BillingType),
  subscriptionPrice: z.coerce.number().positive().optional(),
  transactionFeeRate: z.coerce.number().min(0).max(1).optional(),
});

export async function updateStoreBilling(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = billingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const store = await prisma.store.update({
    where: { id: storeId },
    data: parsed.data,
    select: { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true },
  });
  res.json({ success: true, data: store });
}

export async function getAllStoresBilling(_req: AuthRequest, res: Response) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [stores, txStats30, txStats90, redemptionStats] = await Promise.all([
    prisma.store.findMany({
      select: {
        id: true, name: true, city: true, billingType: true,
        subscriptionPrice: true, transactionFeeRate: true, isActive: true,
        billing: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    }),
    // Per-store transaction totals — last 30 days
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED', createdAt: { gte: thirtyDaysAgo } },
      _sum: { purchaseAmount: true, pointsAwarded: true },
      _count: true,
    }),
    // Per-store transaction totals — last 90 days
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED', createdAt: { gte: ninetyDaysAgo } },
      _sum: { purchaseAmount: true },
      _count: true,
    }),
    // Per-store credit redemptions (all time)
    prisma.creditRedemption.groupBy({
      by: ['storeId'],
      _sum: { amount: true, devCut: true },
      _count: true,
    }),
  ]);

  // Build lookup maps
  const tx30Map = Object.fromEntries(txStats30.map((r) => [r.storeId, r]));
  const tx90Map = Object.fromEntries(txStats90.map((r) => [r.storeId, r]));
  const redemptionMap = Object.fromEntries(redemptionStats.map((r) => [r.storeId, r]));

  const enriched = stores.map((store) => {
    const t30 = tx30Map[store.id];
    const t90 = tx90Map[store.id];
    const r   = redemptionMap[store.id];
    return {
      ...store,
      revenue: {
        last30Days: {
          transactions: t30?._count ?? 0,
          purchaseVolume: parseFloat((t30?._sum?.purchaseAmount ?? 0).toFixed(2)),
          pointsAwarded:  parseFloat((t30?._sum?.pointsAwarded  ?? 0).toFixed(2)),
        },
        last90Days: {
          transactions:   t90?._count ?? 0,
          purchaseVolume: parseFloat((t90?._sum?.purchaseAmount ?? 0).toFixed(2)),
          // Monthly average from 90-day window
          avgMonthlyVolume: parseFloat(((t90?._sum?.purchaseAmount ?? 0) / 3).toFixed(2)),
        },
        allTime: {
          redemptions:   r?._count ?? 0,
          redeemedAmount: parseFloat((r?._sum?.amount  ?? 0).toFixed(2)),
          devCut:         parseFloat((r?._sum?.devCut  ?? 0).toFixed(2)),
        },
      },
    };
  });

  res.json({ success: true, data: enriched });
}

export async function createBillingRecord(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { amount, period, billingType } = req.body as { amount: number; period: string; billingType: BillingType };
  const record = await prisma.billingRecord.create({ data: { storeId, amount, period, billingType } });
  res.status(201).json({ success: true, data: record });
}

export async function markBillingPaid(req: AuthRequest, res: Response) {
  const record = await prisma.billingRecord.update({
    where: { id: req.params.recordId },
    data: { isPaid: true, paidAt: new Date() },
  });
  res.json({ success: true, data: record });
}

// ─── Category Rates ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  GROCERIES: 'Groceries',
  FROZEN_FOODS: 'Frozen Foods',
  FRESH_FOODS: 'Fresh Foods',
  GAS: 'Gas',
  DIESEL: 'Diesel',
  TOBACCO_VAPES: 'Tobacco / Vapes',
  HOT_FOODS: 'Hot Foods',
  OTHER: 'Other',
};

export async function getCategoryRates(_req: AuthRequest, res: Response) {
  const stored = await prisma.categoryRate.findMany();
  const storedMap = Object.fromEntries(stored.map((r) => [r.category, r.cashbackRate]));

  // Return all categories — use stored rate or default 5%
  const rates = (Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    cashbackRate: storedMap[cat] ?? 0.05,
  }));

  res.json({ success: true, data: rates });
}

export async function updateCategoryRate(req: AuthRequest, res: Response) {
  const { category } = req.params;
  const parsed = z.object({ cashbackRate: z.number().min(0).max(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  if (!Object.values(ProductCategory).includes(category as ProductCategory)) {
    res.status(400).json({ success: false, error: 'Invalid category' });
    return;
  }
  const rate = await prisma.categoryRate.upsert({
    where: { category: category as ProductCategory },
    update: { cashbackRate: parsed.data.cashbackRate },
    create: { category: category as ProductCategory, cashbackRate: parsed.data.cashbackRate },
  });
  res.json({ success: true, data: rate });
}

// ─── Dev Cut Rate Config ──────────────────────────────────────────────────────

export async function getDevCutRate(_req: AuthRequest, res: Response) {
  const config = await prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } });
  const rate = parseFloat(config?.value ?? String(DEFAULT_DEV_CUT_RATE));
  res.json({ success: true, data: { rate } });
}

export async function updateDevCutRate(req: AuthRequest, res: Response) {
  const parsed = z.object({ rate: z.number().min(0).max(0.5) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  await prisma.appConfig.upsert({
    where: { key: 'DEV_CUT_RATE' },
    update: { value: String(parsed.data.rate) },
    create: { key: 'DEV_CUT_RATE', value: String(parsed.data.rate) },
  });
  res.json({ success: true, data: { rate: parsed.data.rate } });
}

// ─── Billing helpers ──────────────────────────────────────────────────────────

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end:   new Date(y, m, 0, 23, 59, 59, 999),
  };
}

function toPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** All month periods from storeCreated up to and including upTo, oldest first. */
function allPeriodsSince(storeCreated: Date, upTo: string): string[] {
  const periods: string[] = [];
  const cur = new Date(storeCreated.getFullYear(), storeCreated.getMonth(), 1);
  const [uy, um] = upTo.split('-').map(Number);
  const endMonth = new Date(uy, um - 1, 1);
  while (cur <= endMonth) {
    periods.push(toPeriod(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return periods;
}

interface CategoryRow {
  category: string;
  txCount: number;
  purchaseVolume: number;
  cashbackIssued: number;
  devCutEarned: number;
  customerCashback: number;
}

interface BillNotes {
  txCount: number;
  purchaseVolume: number;
  cashbackIssued: number;
  devCutEarned: number;
  customerCashback: number;
  effectiveCashbackRate: number; // cashbackIssued / purchaseVolume
  effectiveDevCutRate: number;   // devCutEarned / cashbackIssued
  categories: CategoryRow[];
  subscriptionFee: number;
  transactionFeeRate: number;
  transactionFee: number;
  totalAmountOwed: number;
  periodStart: string;
  periodEnd: string;
}

async function buildBillForPeriod(
  store: { id: string; billingType: string; subscriptionPrice: number; transactionFeeRate: number },
  period: string,
): Promise<{ amount: number; notes: BillNotes } | null> {
  const { start, end } = periodBounds(period);

  // Use actual per-transaction data — rates are already baked in at grant time,
  // so changing rates later doesn't retroactively alter historical bills.
  const txRows = await prisma.pointsTransaction.groupBy({
    by: ['category'],
    where: { storeId: store.id, status: 'APPROVED', createdAt: { gte: start, lte: end } },
    _count: { id: true },
    _sum: { purchaseAmount: true, storeCost: true, devCut: true, pointsAwarded: true },
  });

  const txCount          = txRows.reduce((s, r) => s + (r._count.id         ?? 0), 0);
  const purchaseVolume   = parseFloat(txRows.reduce((s, r) => s + (r._sum?.purchaseAmount ?? 0), 0).toFixed(2));
  const cashbackIssued   = parseFloat(txRows.reduce((s, r) => s + (r._sum?.storeCost      ?? 0), 0).toFixed(2));
  const devCutEarned     = parseFloat(txRows.reduce((s, r) => s + (r._sum?.devCut         ?? 0), 0).toFixed(2));
  const customerCashback = parseFloat(txRows.reduce((s, r) => s + (r._sum?.pointsAwarded  ?? 0), 0).toFixed(2));

  const categories: CategoryRow[] = txRows.map((r) => ({
    category:        String(r.category),
    txCount:         r._count.id ?? 0,
    purchaseVolume:  parseFloat((r._sum?.purchaseAmount ?? 0).toFixed(2)),
    cashbackIssued:  parseFloat((r._sum?.storeCost      ?? 0).toFixed(2)),
    devCutEarned:    parseFloat((r._sum?.devCut         ?? 0).toFixed(2)),
    customerCashback:parseFloat((r._sum?.pointsAwarded  ?? 0).toFixed(2)),
  })).sort((a, b) => b.purchaseVolume - a.purchaseVolume);

  const needsSub        = store.billingType === 'MONTHLY_SUBSCRIPTION' || store.billingType === 'HYBRID';
  const needsTx         = store.billingType === 'PER_TRANSACTION'      || store.billingType === 'HYBRID';
  const subscriptionFee = needsSub ? store.subscriptionPrice : 0;
  const transactionFee  = needsTx  ? parseFloat((purchaseVolume * store.transactionFeeRate).toFixed(2)) : 0;
  const totalAmountOwed = parseFloat((subscriptionFee + transactionFee).toFixed(2));

  // Don't generate a bill if there's nothing to charge and no activity
  if (totalAmountOwed === 0 && txCount === 0) return null;

  const notes: BillNotes = {
    txCount, purchaseVolume,
    cashbackIssued, devCutEarned, customerCashback,
    effectiveCashbackRate: purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0,
    effectiveDevCutRate:   cashbackIssued > 0 ? parseFloat((devCutEarned / cashbackIssued).toFixed(4)) : 0,
    categories,
    subscriptionFee, transactionFeeRate: store.transactionFeeRate,
    transactionFee, totalAmountOwed,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd:   end.toISOString().slice(0, 10),
  };

  return { amount: totalAmountOwed, notes };
}

// ─── Generate compound bill for one period (default = current month) ──────────

export async function generateMonthlyBilling(req: AuthRequest, res: Response) {
  const period = (req.query.period as string) || toPeriod(new Date());

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true },
  });
  if (stores.length === 0) {
    res.json({ success: true, message: 'No active stores', data: { created: 0, skipped: 0, period } });
    return;
  }

  // One compound record per store per period — skip if already billed
  const existingIds = new Set(
    (await prisma.billingRecord.findMany({
      where: { period, storeId: { in: stores.map((s) => s.id) } },
      select: { storeId: true },
    })).map((r) => r.storeId),
  );

  let created = 0; let skipped = 0;
  for (const store of stores) {
    if (existingIds.has(store.id)) { skipped++; continue; }
    const bill = await buildBillForPeriod(store, period);
    if (!bill) { skipped++; continue; }
    await (prisma.billingRecord as any).create({
      data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify(bill.notes) },
    });
    created++;
  }

  res.json({
    success: true,
    message: created ? `Generated ${created} compound bill(s) for ${period}` : `All stores already billed for ${period}`,
    data: { created, skipped, period },
  });
}

// ─── Backfill: generate all missing bills since each store's creation date ────

export async function generateAllMissingBills(_req: AuthRequest, res: Response) {
  const currentPeriod = toPeriod(new Date());

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true, createdAt: true },
  });

  // Load existing bills — separate fully-billed (has notes) from legacy (no notes, old subscription-only)
  const existingBills = await (prisma.billingRecord as any).findMany({
    select: { id: true, storeId: true, period: true, notes: true, isPaid: true, paidAt: true },
  });
  const billedSet = new Set<string>();   // storeId:period that already have compound notes — skip
  const legacyMap = new Map<string, { id: string; isPaid: boolean; paidAt: Date | null }>();

  for (const r of existingBills) {
    if (r.notes) {
      billedSet.add(`${r.storeId}:${r.period}`);
    } else {
      legacyMap.set(`${r.storeId}:${r.period}`, { id: r.id, isPaid: r.isPaid, paidAt: r.paidAt });
    }
  }

  let created = 0; let replaced = 0; let skipped = 0;
  const results: { store: string; period: string; amount: number; action: string }[] = [];

  for (const store of stores) {
    for (const period of allPeriodsSince(store.createdAt, currentPeriod)) {
      const key = `${store.id}:${period}`;

      // Already has compound notes → skip
      if (billedSet.has(key)) { skipped++; continue; }

      const bill = await buildBillForPeriod(store, period);

      // Legacy record exists (no notes) → delete it and recreate with compound notes, preserving payment status
      const legacy = legacyMap.get(key);
      if (legacy) {
        if (!bill) { skipped++; continue; }
        await prisma.billingRecord.delete({ where: { id: legacy.id } });
        await (prisma.billingRecord as any).create({
          data: {
            storeId: store.id, billingType: store.billingType as BillingType,
            amount: bill.amount, period, notes: JSON.stringify(bill.notes),
            isPaid: legacy.isPaid, paidAt: legacy.paidAt,
          },
        });
        results.push({ store: store.name, period, amount: bill.amount, action: 'replaced' });
        replaced++;
        continue;
      }

      // No bill at all → create new
      if (!bill) { skipped++; continue; }
      await (prisma.billingRecord as any).create({
        data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify(bill.notes) },
      });
      results.push({ store: store.name, period, amount: bill.amount, action: 'created' });
      created++;
    }
  }

  res.json({
    success: true,
    message: `Created ${created}, replaced ${replaced} legacy bill(s) (${skipped} already up-to-date or no activity)`,
    data: { created, replaced, skipped, bills: results },
  });
}

export async function getMonthlyRecords(req: AuthRequest, res: Response) {
  const { period, storeId, isPaid } = req.query as { period?: string; storeId?: string; isPaid?: string };

  const rawRecords = await (prisma.billingRecord as any).findMany({
    where: {
      ...(period  && { period }),
      ...(storeId && { storeId }),
      ...(isPaid !== undefined && { isPaid: isPaid === 'true' }),
    },
    include: { store: { select: { id: true, name: true, city: true } } },
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
  });

  // Parse notes JSON
  const records = rawRecords.map((r: any) => ({ ...r, notes: r.notes ? JSON.parse(r.notes) : null }));

  const grouped: Record<string, typeof records> = {};
  for (const r of records) {
    if (!grouped[r.period]) grouped[r.period] = [];
    grouped[r.period].push(r);
  }

  res.json({ success: true, data: { records, grouped } });
}

// ─── Revenue & Analytics ──────────────────────────────────────────────────────

// DevAdmin: total revenue summary
export async function getDevRevenue(_req: AuthRequest, res: Response) {
  const [transactionStats, txDevCut, redemptionStats, subscriptionStats, devCutConfig] = await Promise.all([
    prisma.pointsTransaction.aggregate({
      _sum: { purchaseAmount: true, pointsAwarded: true },
      _count: true,
      where: { status: 'APPROVED' },
    }),
    // Dev cut earned at grant time (new model)
    prisma.pointsTransaction.aggregate({
      _sum: { devCut: true },
      where: { status: 'APPROVED' },
    }),
    prisma.creditRedemption.aggregate({
      _sum: { amount: true },
      _count: true,
    }),
    prisma.billingRecord.aggregate({
      _sum: { amount: true },
      where: { isPaid: true },
    }),
    prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } }),
  ]);

  const devCutRate = parseFloat(devCutConfig?.value ?? String(DEFAULT_DEV_CUT_RATE));

  res.json({
    success: true,
    data: {
      devCutRate,
      totalTransactions: transactionStats._count,
      totalPurchaseVolume: transactionStats._sum.purchaseAmount ?? 0,
      totalPointsAwarded: transactionStats._sum.pointsAwarded ?? 0,
      totalDevCut: txDevCut._sum.devCut ?? 0,               // 4% of cashback issued (at grant time)
      totalRedemptions: redemptionStats._count,
      totalRedeemedAmount: redemptionStats._sum.amount ?? 0,
      totalSubscriptionRevenue: subscriptionStats._sum.amount ?? 0,
    },
  });
}

// DevAdmin: date-ranged analytics for charts
export async function getAnalytics(req: AuthRequest, res: Response) {
  const { from, to } = req.query as { from?: string; to?: string };

  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to + 'T23:59:59') : new Date();

  if (fromDate >= toDate) {
    res.status(400).json({ success: false, error: '"from" date must be before "to" date' });
    return;
  }

  const [transactions, redemptions] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where: { status: 'APPROVED', createdAt: { gte: fromDate, lte: toDate } },
      select: {
        createdAt: true, purchaseAmount: true, pointsAwarded: true, cashbackRate: true, category: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.creditRedemption.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate } },
      select: { createdAt: true, amount: true, devCut: true, store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Daily grouping: combine transactions + redemptions by date
  const byDate: Record<string, {
    date: string; transactions: number; purchaseVolume: number;
    pointsAwarded: number; redemptions: number; redeemedAmount: number; devCut: number;
  }> = {};

  for (const tx of transactions) {
    const date = tx.createdAt.toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, redeemedAmount: 0, devCut: 0 };
    byDate[date].transactions++;
    byDate[date].purchaseVolume = parseFloat((byDate[date].purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
    byDate[date].pointsAwarded = parseFloat((byDate[date].pointsAwarded + Number(tx.pointsAwarded)).toFixed(2));
  }
  for (const r of redemptions) {
    const date = r.createdAt.toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, redeemedAmount: 0, devCut: 0 };
    byDate[date].redemptions++;
    byDate[date].redeemedAmount = parseFloat((byDate[date].redeemedAmount + Number(r.amount)).toFixed(2));
    byDate[date].devCut = parseFloat((byDate[date].devCut + Number(r.devCut)).toFixed(2));
  }

  // Per-store grouping
  const byStore: Record<string, {
    storeId: string; storeName: string; transactions: number;
    purchaseVolume: number; pointsAwarded: number; redemptions: number; devCut: number;
  }> = {};
  for (const tx of transactions) {
    const id = tx.store.id;
    if (!byStore[id]) byStore[id] = { storeId: id, storeName: tx.store.name, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, devCut: 0 };
    byStore[id].transactions++;
    byStore[id].purchaseVolume = parseFloat((byStore[id].purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
    byStore[id].pointsAwarded = parseFloat((byStore[id].pointsAwarded + Number(tx.pointsAwarded)).toFixed(2));
  }
  for (const r of redemptions) {
    const id = r.store.id;
    if (!byStore[id]) byStore[id] = { storeId: id, storeName: r.store.name, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, devCut: 0 };
    byStore[id].redemptions++;
    byStore[id].devCut = parseFloat((byStore[id].devCut + Number(r.devCut)).toFixed(2));
  }

  // Per-category breakdown
  const byCategory: Record<string, { category: string; transactions: number; purchaseVolume: number; pointsAwarded: number }> = {};
  for (const tx of transactions) {
    const cat = tx.category as string;
    if (!byCategory[cat]) byCategory[cat] = { category: cat, transactions: 0, purchaseVolume: 0, pointsAwarded: 0 };
    byCategory[cat].transactions++;
    byCategory[cat].purchaseVolume = parseFloat((byCategory[cat].purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
    byCategory[cat].pointsAwarded = parseFloat((byCategory[cat].pointsAwarded + Number(tx.pointsAwarded)).toFixed(2));
  }

  const totals = {
    transactions: transactions.length,
    purchaseVolume: transactions.reduce((s, t) => parseFloat((s + Number(t.purchaseAmount)).toFixed(2)), 0),
    pointsAwarded: transactions.reduce((s, t) => parseFloat((s + Number(t.pointsAwarded)).toFixed(2)), 0),
    redemptions: redemptions.length,
    redeemedAmount: redemptions.reduce((s, r) => parseFloat((s + Number(r.amount)).toFixed(2)), 0),
    devCut: redemptions.reduce((s, r) => parseFloat((s + Number(r.devCut)).toFixed(2)), 0),
  };

  res.json({
    success: true,
    data: {
      daily: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
      byStore: Object.values(byStore).sort((a, b) => b.purchaseVolume - a.purchaseVolume),
      byCategory: Object.values(byCategory).sort((a, b) => b.purchaseVolume - a.purchaseVolume),
      totals,
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
    },
  });
}
