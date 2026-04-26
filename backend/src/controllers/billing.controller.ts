import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { BillingType, ProductCategory, Tier } from '@prisma/client';
import { DEFAULT_DEV_CUT_RATE, DEFAULT_TIER_RATES } from '../config/constants';
import { TIER_THRESHOLDS } from '../utils/tier';
import { sendPushToUser, sendPushToStoreStaff, saveNotificationMany } from '../utils/push';

// SUPER_ADMIN+ — basic store list (no billing info)
export async function getStores(_req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, address: true, city: true, state: true, zipCode: true,
      phone: true, latitude: true, longitude: true, shiftsPerDay: true,
      gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true,
      enabledCategories: true,
    },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stores });
}

// DevAdmin only — update store details (name, address, lat/lng, etc.)
const updateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  phone: z.string().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  shiftsPerDay: z.number().int().min(2).max(3).optional(),
  enabledCategories: z.array(z.nativeEnum(ProductCategory)).optional(),
});

export async function updateStore(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = updateStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  const store = await prisma.store.update({
    where: { id: storeId },
    data: parsed.data,
    select: { id: true, name: true, address: true, city: true, state: true, zipCode: true, phone: true, latitude: true, longitude: true, shiftsPerDay: true, enabledCategories: true },
  });
  res.json({ success: true, data: store });
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
  const { amount, period, billingType, description } = req.body as { amount: number; period: string; billingType: BillingType; description?: string };
  const notes = billingType === 'CUSTOM' && description ? JSON.stringify({ description }) : undefined;
  const record = await prisma.billingRecord.create({ data: { storeId, amount, period, billingType, ...(notes ? { notes } : {}) } });
  res.status(201).json({ success: true, data: record });
}

export async function markBillingPaid(req: AuthRequest, res: Response) {
  const record = await prisma.billingRecord.update({
    where: { id: req.params.recordId },
    data: { isPaid: true, paidAt: new Date() },
  });
  res.json({ success: true, data: record });
}

// Mark all billing records for a period as paid (consolidated invoice)
export async function markPeriodPaid(req: AuthRequest, res: Response) {
  const { period } = req.params;
  const now = new Date();
  const result = await prisma.billingRecord.updateMany({
    where: { period, isPaid: false },
    data: { isPaid: true, paidAt: now },
  });
  res.json({ success: true, data: { period, updated: result.count } });
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
  ALCOHOL: 'Alcohol',
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

// ─── Tier Cashback Rates (DevAdmin configurable) ─────────────────────────────

const TIER_ORDER: Tier[] = [Tier.BRONZE, Tier.SILVER, Tier.GOLD, Tier.DIAMOND, Tier.PLATINUM];

export async function getTierRates(_req: AuthRequest, res: Response) {
  const stored = await prisma.tierCashbackRate.findMany();
  const fullMap = Object.fromEntries(stored.map((r) => [r.tier, r]));
  const rates = TIER_ORDER.map((tier) => ({
    tier,
    cashbackRate:      fullMap[tier]?.cashbackRate      ?? DEFAULT_TIER_RATES[tier],
    gasCentsPerGallon: fullMap[tier]?.gasCentsPerGallon ?? null,
    // pointsThreshold stored in dollars internally; return as pts (× 100) for display
    pointsThreshold:   fullMap[tier]?.pointsThreshold != null
      ? Math.round(fullMap[tier].pointsThreshold * 100)
      : (TIER_THRESHOLDS[tier] != null ? Math.round(TIER_THRESHOLDS[tier] * 100) : 0),
  }));

  res.json({ success: true, data: rates });
}

export async function updateTierRate(req: AuthRequest, res: Response) {
  const { tier } = req.params;
  if (!Object.values(Tier).includes(tier as Tier)) {
    res.status(400).json({ success: false, error: 'Invalid tier' });
    return;
  }
  const parsed = z.object({
    cashbackRate:      z.number().min(0).max(1).optional(),
    gasCentsPerGallon: z.number().min(0).nullable().optional(),
    pointsThreshold:   z.number().int().min(0).optional(), // in pts; stored as dollars (÷ 100) internally
  }).refine(d => d.cashbackRate !== undefined || d.gasCentsPerGallon !== undefined || d.pointsThreshold !== undefined, {
    message: 'Provide at least one field to update',
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const defaultRate = DEFAULT_TIER_RATES[tier] ?? 0.01;
  const updateData: Record<string, unknown> = {};
  if (parsed.data.cashbackRate !== undefined)      updateData.cashbackRate      = parsed.data.cashbackRate;
  if (parsed.data.gasCentsPerGallon !== undefined) updateData.gasCentsPerGallon = parsed.data.gasCentsPerGallon;
  if (parsed.data.pointsThreshold !== undefined)   updateData.pointsThreshold   = parsed.data.pointsThreshold / 100;
  const rate = await prisma.tierCashbackRate.upsert({
    where:  { tier: tier as Tier },
    update: updateData,
    create: {
      tier: tier as Tier,
      cashbackRate:      (updateData.cashbackRate      as number) ?? defaultRate,
      gasCentsPerGallon: (updateData.gasCentsPerGallon as number | null) ?? null,
      pointsThreshold:   (updateData.pointsThreshold   as number) ?? null,
    },
  });
  res.json({ success: true, data: { ...rate, pointsThreshold: rate.pointsThreshold != null ? Math.round(rate.pointsThreshold * 100) : null } });
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
  cashbackFee: number;      // cashback the store must fund (= cashbackIssued)
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
  // cashbackIssued = actual credits given to customers (pointsAwarded); storeCost = devCut only now
  const cashbackIssued   = parseFloat(txRows.reduce((s, r) => s + (r._sum?.pointsAwarded  ?? 0), 0).toFixed(2));
  const devCutEarned     = parseFloat(txRows.reduce((s, r) => s + (r._sum?.devCut         ?? 0), 0).toFixed(2));
  const customerCashback = cashbackIssued;

  const categories: CategoryRow[] = txRows.map((r) => ({
    category:        String(r.category),
    txCount:         r._count.id ?? 0,
    purchaseVolume:  parseFloat((r._sum?.purchaseAmount ?? 0).toFixed(2)),
    cashbackIssued:  parseFloat((r._sum?.pointsAwarded  ?? 0).toFixed(2)),  // actual cashback to customers
    devCutEarned:    parseFloat((r._sum?.devCut         ?? 0).toFixed(2)),
    customerCashback:parseFloat((r._sum?.pointsAwarded  ?? 0).toFixed(2)),
  })).sort((a, b) => b.purchaseVolume - a.purchaseVolume);

  const needsSub        = store.billingType === 'MONTHLY_SUBSCRIPTION' || store.billingType === 'HYBRID';
  const subscriptionFee = needsSub ? store.subscriptionPrice : 0;
  // Cashback info — informational only (shows store's loyalty program spend)
  const cashbackFee     = cashbackIssued;

  // Total owed to developer = subscription fee (if any) + dev cut earned from cashback pool
  // Transaction fees are not charged — dev cut is the only per-transaction revenue
  const totalAmountOwed = parseFloat((subscriptionFee + devCutEarned).toFixed(2));

  // Skip stores with nothing to bill
  if (subscriptionFee === 0 && txCount === 0) return null;

  const notes: BillNotes = {
    txCount, purchaseVolume,
    cashbackIssued, devCutEarned, customerCashback,
    effectiveCashbackRate: purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0,
    effectiveDevCutRate:   cashbackIssued > 0 ? parseFloat((devCutEarned / cashbackIssued).toFixed(4)) : 0, // devCut / cashback = configured devCutRate
    categories,
    subscriptionFee, transactionFeeRate: store.transactionFeeRate,
    transactionFee: 0, cashbackFee, totalAmountOwed,
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

  // Load ALL existing bills into a map so we can preserve isPaid/paidAt when regenerating
  const existingBills = await (prisma.billingRecord as any).findMany({
    select: { id: true, storeId: true, period: true, isPaid: true, paidAt: true },
  });
  const existingMap = new Map<string, { id: string; isPaid: boolean; paidAt: Date | null }>(
    existingBills.map((r: any) => [`${r.storeId}:${r.period}`, { id: r.id, isPaid: r.isPaid, paidAt: r.paidAt }]),
  );

  let created = 0; let replaced = 0; let skipped = 0;
  const results: { store: string; period: string; amount: number; action: string }[] = [];

  for (const store of stores) {
    for (const period of allPeriodsSince(store.createdAt, currentPeriod)) {
      const key = `${store.id}:${period}`;
      const bill = await buildBillForPeriod(store, period);
      const existing = existingMap.get(key);

      if (existing) {
        // Always regenerate — delete old record and recreate with latest calculation, preserving payment status
        if (!bill) { skipped++; continue; }
        await prisma.billingRecord.delete({ where: { id: existing.id } });
        await (prisma.billingRecord as any).create({
          data: {
            storeId: store.id, billingType: store.billingType as BillingType,
            amount: bill.amount, period, notes: JSON.stringify(bill.notes),
            isPaid: existing.isPaid, paidAt: existing.paidAt,
          },
        });
        results.push({ store: store.name, period, amount: bill.amount, action: 'replaced' });
        replaced++;
      } else {
        if (!bill) { skipped++; continue; }
        await (prisma.billingRecord as any).create({
          data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify(bill.notes) },
        });
        results.push({ store: store.name, period, amount: bill.amount, action: 'created' });
        created++;
      }
    }
  }

  res.json({
    success: true,
    message: `Generated ${created + replaced} bill(s) — ${created} new, ${replaced} recalculated (${skipped} skipped — no activity)`,
    data: { created, replaced, skipped, bills: results },
  });
}

// ─── Seed test transactions (DevAdmin only — for demo/testing) ────────────────

const WEIGHTED_CATEGORIES = [
  ...Array(12).fill('GAS'),   ...Array(8).fill('GROCERIES'),
  ...Array(6).fill('DIESEL'), ...Array(5).fill('HOT_FOODS'),
  ...Array(4).fill('TOBACCO_VAPES'), ...Array(3).fill('FRESH_FOODS'),
  ...Array(3).fill('FROZEN_FOODS'),  ...Array(2).fill('OTHER'),
] as ProductCategory[];

const AMOUNT_RANGES: Record<string, [number, number]> = {
  GAS: [25, 110], DIESEL: [60, 200], GROCERIES: [8, 65], HOT_FOODS: [4, 18],
  FROZEN_FOODS: [3, 22], FRESH_FOODS: [5, 30], TOBACCO_VAPES: [10, 45], OTHER: [2, 40],
};

export async function seedTestTransactions(_req: AuthRequest, res: Response) {
  const [stores, employees, customers] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, transactionFeeRate: true } }),
    prisma.user.findMany({ where: { role: { in: ['EMPLOYEE', 'STORE_MANAGER', 'DEV_ADMIN'] as any } } }),
    prisma.user.findMany({ where: { role: 'CUSTOMER' as any } }),
  ]);

  if (!stores.length || !employees.length || !customers.length) {
    res.status(400).json({ success: false, error: 'No stores/employees/customers found. Run user reset first.' });
    return;
  }

  function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
  function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

  const txRows: any[] = [];
  const balanceMap: Record<string, number> = {};

  for (let day = 90; day >= 0; day--) {
    const txDate = new Date();
    txDate.setDate(txDate.getDate() - day);
    txDate.setHours(Math.floor(rand(7, 21)), Math.floor(rand(0, 59)), Math.floor(rand(0, 59)));
    const isWeekend = txDate.getDay() === 0 || txDate.getDay() === 6;
    const count = Math.floor(rand(isWeekend ? 12 : 8, isWeekend ? 20 : 16));

    for (let i = 0; i < count; i++) {
      const customer = pick(customers);
      const employee = pick(employees);
      const store    = pick(stores);
      const category = pick(WEIGHTED_CATEGORIES);
      const [min, max] = AMOUNT_RANGES[category as string] ?? [5, 50];
      const purchaseAmount = parseFloat(rand(min, max).toFixed(2));
      const cashbackRate   = DEFAULT_TIER_RATES[customer.tier as string] ?? 0.01;
      const cashbackIssued = parseFloat((purchaseAmount * cashbackRate).toFixed(4));
      const devCutRate     = store.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
      const devCut         = parseFloat((purchaseAmount * devCutRate).toFixed(4));
      const pointsAwarded  = cashbackIssued; // customer gets full cashback
      const createdAt      = new Date(txDate);
      createdAt.setMinutes(Math.floor(rand(0, 59)));

      balanceMap[customer.id] = (balanceMap[customer.id] ?? 0) + pointsAwarded;
      txRows.push({
        customerId: customer.id, grantedById: employee.id, storeId: store.id,
        purchaseAmount, pointsAwarded, devCut, storeCost: parseFloat((cashbackIssued + devCut).toFixed(2)),
        cashbackRate, category, status: 'APPROVED',
        receiptImageUrl: 'https://placehold.co/400x600/png?text=Receipt',
        isTestData: true,
        createdAt, updatedAt: createdAt,
      });
    }
  }

  await prisma.pointsTransaction.createMany({ data: txRows });

  for (const [id, balance] of Object.entries(balanceMap)) {
    await prisma.user.update({ where: { id }, data: { pointsBalance: { increment: parseFloat(balance.toFixed(2)) } } });
  }

  res.json({
    success: true,
    message: `Seeded ${txRows.length} transactions across ${stores.length} stores (90-day history). Now run "Backfill All Missing" to generate compound bills.`,
    data: { txCount: txRows.length, stores: stores.length, customers: customers.length },
  });
}

// ─── Send monthly billing report to all SuperAdmins via push notification ─────

export async function sendBillingReport(req: AuthRequest, res: Response) {
  const period = (req.query.period as string) || toPeriod(new Date());

  const [records, superAdmins] = await Promise.all([
    (prisma.billingRecord as any).findMany({
      where: { period },
      include: { store: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN' as any, isActive: true } }),
  ]);

  if (!records.length) {
    res.status(404).json({ success: false, error: `No billing records found for ${period}. Generate bills first.` });
    return;
  }

  const totalOwed = records.reduce((s: number, r: any) => s + r.amount, 0);
  const totalPaid = records.filter((r: any) => r.isPaid).reduce((s: number, r: any) => s + r.amount, 0);
  const unpaid = records.filter((r: any) => !r.isPaid).length;

  const title = `📋 Billing Report — ${period}`;
  const body  = `${records.length} stores · Total owed: $${totalOwed.toFixed(2)} · Collected: $${totalPaid.toFixed(2)} · ${unpaid} unpaid`;

  let sent = 0;
  for (const admin of superAdmins) {
    try { await sendPushToUser(admin.id, title, body); sent++; } catch { /* skip if no push token */ }
  }

  res.json({
    success: true,
    message: `Report sent to ${sent} super admin(s)`,
    data: { period, storeCount: records.length, totalOwed, totalPaid, unpaidCount: unpaid, notified: sent },
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

// SuperAdmin — same invoice data, read-only, no management fields
export async function getSuperAdminInvoices(_req: AuthRequest, res: Response) {
  const rawRecords = await (prisma.billingRecord as any).findMany({
    include: { store: { select: { id: true, name: true, city: true } } },
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
  });

  const records = rawRecords.map((r: any) => ({ ...r, notes: r.notes ? JSON.parse(r.notes) : null }));

  // Consolidate by period
  const byPeriod: Record<string, any> = {};
  for (const r of records) {
    if (!byPeriod[r.period]) {
      byPeriod[r.period] = { period: r.period, totalDevCut: 0, totalCashback: 0, totalTxns: 0, totalVolume: 0, stores: [], isPaid: true, paidAt: null, createdAt: r.createdAt };
    }
    const n = r.notes;
    const amt = parseFloat(String(r.amount));
    byPeriod[r.period].totalDevCut   += amt;
    byPeriod[r.period].totalCashback += n?.cashbackIssued ?? 0;
    byPeriod[r.period].totalTxns     += n?.txCount ?? 0;
    byPeriod[r.period].totalVolume   += n?.purchaseVolume ?? 0;
    byPeriod[r.period].stores.push({ store: r.store, amount: amt, billingType: r.billingType, txCount: n?.txCount ?? 0, cashbackIssued: n?.cashbackIssued ?? 0, description: n?.description ?? null });
    if (!r.isPaid) byPeriod[r.period].isPaid = false;
    if (r.isPaid && r.paidAt && !byPeriod[r.period].paidAt) byPeriod[r.period].paidAt = r.paidAt;
  }

  const invoices = Object.values(byPeriod)
    .map((inv: any) => ({
      ...inv,
      totalDevCut:   parseFloat(inv.totalDevCut.toFixed(2)),
      totalCashback: parseFloat(inv.totalCashback.toFixed(2)),
      totalVolume:   parseFloat(inv.totalVolume.toFixed(2)),
    }))
    .sort((a: any, b: any) => b.period.localeCompare(a.period));

  res.json({ success: true, data: invoices });
}

// SuperAdmin — derived notification feed (no DB table needed)
export async function getSuperAdminNotifications(_req: AuthRequest, res: Response) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const [allBills, rejectedTx, devCutConfig] = await Promise.all([
    (prisma.billingRecord as any).findMany({
      where: {
        OR: [
          { isPaid: false },
          { isPaid: true, paidAt: { gte: sixMonthsAgo } },
        ],
      },
      include: { store: { select: { id: true, name: true, city: true } } },
      orderBy: { period: 'desc' },
    }),
    prisma.pointsTransaction.count({
      where: { status: 'REJECTED', updatedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } }),
  ]);

  // Fetch pending shift requests separately so a failure here never breaks billing notifications
  let pendingShiftRequests: any[] = [];
  try {
    pendingShiftRequests = await prisma.shiftRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        employee: { select: { name: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch {
    // Gracefully degrade — schedule notifications simply won't appear
  }

  const devCutRate = parseFloat(devCutConfig?.value ?? '0.04');

  // Group bills by period
  const byPeriod: Record<string, { total: number; storeCount: number; isPaid: boolean; paidAt: string | null; stores: { name: string; city: string; amount: number }[] }> = {};
  for (const bill of allBills) {
    const amt = parseFloat(String(bill.amount));
    if (!byPeriod[bill.period]) {
      byPeriod[bill.period] = { total: 0, storeCount: 0, isPaid: true, paidAt: bill.paidAt ? bill.paidAt.toISOString() : null, stores: [] };
    }
    byPeriod[bill.period].total += amt;
    byPeriod[bill.period].storeCount++;
    byPeriod[bill.period].stores.push({ name: bill.store.name, city: bill.store.city, amount: amt });
    if (!bill.isPaid) byPeriod[bill.period].isPaid = false;
    if (bill.isPaid && bill.paidAt) byPeriod[bill.period].paidAt = bill.paidAt.toISOString();
  }

  const notifications: {
    id: string; type: string; title: string; message: string;
    createdAt: string; isRead: boolean; severity: string;
    period?: string; totalAmount?: number; paidAt?: string | null;
    requestId?: string; storeId?: string; requestType?: string;
  }[] = [];

  for (const [period, info] of Object.entries(byPeriod)) {
    const [y, m] = period.split('-').map(Number);
    const monthName = new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const total = parseFloat(info.total.toFixed(2));

    if (info.isPaid) {
      notifications.push({
        id: `invoice-paid-${period}`,
        type: 'BILLING',
        title: `Invoice Paid — ${monthName}`,
        message: `$${total.toFixed(2)} platform fee has been settled. Download your invoice for records.`,
        createdAt: info.paidAt ?? new Date(y, m, 1).toISOString(),
        isRead: true,
        severity: 'success',
        period,
        totalAmount: total,
        paidAt: info.paidAt,
      });
    } else {
      notifications.push({
        id: `invoice-due-${period}`,
        type: 'BILLING',
        title: `Invoice Due — ${monthName}`,
        message: `$${total.toFixed(2)} in platform fees outstanding (${(devCutRate * 100).toFixed(0)}% dev cut across ${info.storeCount} stores).`,
        createdAt: new Date(y, m, 1).toISOString(),
        isRead: false,
        severity: 'warning',
        period,
        totalAmount: total,
        paidAt: null,
      });
    }
  }

  // Rejected transaction alert
  if (rejectedTx > 0) {
    notifications.push({
      id: `rejected-${thirtyDaysAgo.toISOString().slice(0, 10)}`,
      type: 'TRANSACTION',
      title: `${rejectedTx} Transaction${rejectedTx !== 1 ? 's' : ''} Rejected`,
      message: `${rejectedTx} point grant${rejectedTx !== 1 ? 's were' : ' was'} rejected in the last 30 days. Review your transactions page for details.`,
      createdAt: thirtyDaysAgo.toISOString(),
      isRead: false,
      severity: rejectedTx >= 5 ? 'error' : 'info',
    });
  }

  // Schedule notifications — pending shift requests
  const SHIFT_TYPE_LABELS: Record<string, string> = { OPENING: 'Opening', MIDDLE: 'Middle', CLOSING: 'Closing' };
  for (const req of pendingShiftRequests) {
    const dateStr = new Date(req.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const shiftLabel = SHIFT_TYPE_LABELS[req.shiftType] ?? req.shiftType;
    const isTimeOff = req.requestType === 'TIME_OFF';
    notifications.push({
      id: `shift-request-${req.id}`,
      type: 'SCHEDULE',
      title: isTimeOff
        ? `Time Off Request — ${req.employee.name}`
        : `Extra Shift Request — ${req.employee.name}`,
      message: isTimeOff
        ? `${req.employee.name} requested time off on ${dateStr} (${shiftLabel} shift) at ${req.store.name}.${req.notes ? ` Note: "${req.notes}"` : ''}`
        : `${req.employee.name} wants to fill in on ${dateStr} (${shiftLabel} shift) at ${req.store.name}.${req.notes ? ` Note: "${req.notes}"` : ''}`,
      createdAt: req.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      requestId: req.id,
      storeId: req.store.id,
      requestType: req.requestType,
    });
  }

  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ success: true, data: notifications });
}

// DevAdmin — platform-owner notification feed
export async function getDevAdminNotifications(_req: AuthRequest, res: Response) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo  = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const [allBills, rejectedTx, newCustomers, pendingShiftRequests] = await Promise.all([
    (prisma.billingRecord as any).findMany({
      where: {
        OR: [
          { isPaid: false },
          { isPaid: true, paidAt: { gte: sixMonthsAgo } },
        ],
      },
      include: { store: { select: { id: true, name: true, city: true } } },
      orderBy: { period: 'desc' },
    }),
    prisma.pointsTransaction.count({
      where: { status: 'REJECTED', updatedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.user.count({
      where: { role: 'CUSTOMER', createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.shiftRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        employee: { select: { name: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
  ]);

  const notifications: any[] = [];

  // Group bills by period+chain (company)
  const byPeriod: Record<string, { total: number; unpaidCount: number; isPaid: boolean; paidAt: string | null; storeCount: number }> = {};
  for (const bill of allBills) {
    if (!byPeriod[bill.period]) {
      byPeriod[bill.period] = { total: 0, unpaidCount: 0, isPaid: true, paidAt: null, storeCount: 0 };
    }
    byPeriod[bill.period].total += parseFloat(String(bill.amount));
    byPeriod[bill.period].storeCount++;
    if (!bill.isPaid) {
      byPeriod[bill.period].isPaid = false;
      byPeriod[bill.period].unpaidCount++;
    } else if (bill.paidAt) {
      byPeriod[bill.period].paidAt = bill.paidAt.toISOString();
    }
  }

  for (const [period, info] of Object.entries(byPeriod)) {
    const [y, m] = period.split('-').map(Number);
    const monthName = new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const total = parseFloat(info.total.toFixed(2));

    if (info.isPaid) {
      notifications.push({
        id: `dev-paid-${period}`,
        type: 'REVENUE',
        title: `Payment Received — ${monthName}`,
        message: `$${total.toFixed(2)} subscription revenue collected across ${info.storeCount} store${info.storeCount !== 1 ? 's' : ''}.`,
        createdAt: info.paidAt ?? new Date(y, m, 1).toISOString(),
        isRead: true,
        severity: 'success',
        period,
        totalAmount: total,
        paidAt: info.paidAt,
      });
    } else {
      notifications.push({
        id: `dev-due-${period}`,
        type: 'REVENUE',
        title: `Payment Pending — ${monthName}`,
        message: `$${total.toFixed(2)} outstanding from ${info.unpaidCount} store${info.unpaidCount !== 1 ? 's' : ''}. Mark as paid once received.`,
        createdAt: new Date(y, m, 1).toISOString(),
        isRead: false,
        severity: 'warning',
        period,
        totalAmount: total,
        paidAt: null,
      });
    }
  }

  // Platform health alerts
  if (rejectedTx > 0) {
    notifications.push({
      id: `dev-rejected-${thirtyDaysAgo.toISOString().slice(0, 10)}`,
      type: 'PLATFORM',
      title: `${rejectedTx} Rejected Transaction${rejectedTx !== 1 ? 's' : ''} (Last 30 Days)`,
      message: `${rejectedTx} point grant${rejectedTx !== 1 ? 's were' : ' was'} rejected recently. Review the Activity Log for details.`,
      createdAt: now.toISOString(),
      isRead: rejectedTx < 3,
      severity: rejectedTx >= 10 ? 'error' : rejectedTx >= 5 ? 'warning' : 'info',
    });
  }

  if (newCustomers > 0) {
    notifications.push({
      id: `dev-customers-${thirtyDaysAgo.toISOString().slice(0, 10)}`,
      type: 'PLATFORM',
      title: `${newCustomers} New Customer${newCustomers !== 1 ? 's' : ''} This Month`,
      message: `${newCustomers} customer${newCustomers !== 1 ? 's have' : ' has'} signed up in the last 30 days across all stores.`,
      createdAt: now.toISOString(),
      isRead: true,
      severity: 'info',
    });
  }

  // Schedule requests — same as SuperAdmin sees
  const SHIFT_TYPE_LABELS: Record<string, string> = { OPENING: 'Opening', MIDDLE: 'Middle', CLOSING: 'Closing' };
  for (const req of pendingShiftRequests) {
    const dateStr = new Date(req.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const shiftLabel = SHIFT_TYPE_LABELS[req.shiftType] ?? req.shiftType;
    const isTimeOff = req.requestType === 'TIME_OFF';
    notifications.push({
      id: `shift-request-${req.id}`,
      type: 'SCHEDULE',
      title: isTimeOff ? `Time Off Request — ${req.employee.name}` : `Extra Shift Request — ${req.employee.name}`,
      message: isTimeOff
        ? `${req.employee.name} requested time off for ${dateStr} (${shiftLabel} shift) at ${req.store.name}.${req.notes ? ` Note: ${req.notes}` : ''}`
        : `${req.employee.name} wants to pick up the ${shiftLabel} shift on ${dateStr} at ${req.store.name}.${req.notes ? ` Note: ${req.notes}` : ''}`,
      createdAt: req.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      requestId: req.id,
      storeId: req.store.id,
      requestType: req.requestType,
    });
  }

  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data: notifications });
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

// ─── Gas Prices ───────────────────────────────────────────────────────────────

const gasPriceSchema = z.object({
  gasPricePerGallon:    z.number().min(0).max(20).optional(),
  dieselPricePerGallon: z.number().min(0).max(20).optional(),
});

/** PATCH /stores/:storeId/gas-prices — SuperAdmin or StoreManager */
export async function updateGasPrices(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = gasPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { gasPricePerGallon, dieselPricePerGallon } = parsed.data;
  if (gasPricePerGallon === undefined && dieselPricePerGallon === undefined) {
    res.status(400).json({ success: false, error: 'Provide at least one price to update' });
    return;
  }

  const updateData: Record<string, unknown> = { gasPriceUpdatedAt: new Date() };
  if (gasPricePerGallon    !== undefined) updateData.gasPricePerGallon    = gasPricePerGallon;
  if (dieselPricePerGallon !== undefined) updateData.dieselPricePerGallon = dieselPricePerGallon;

  const store = await prisma.store.update({
    where: { id: storeId },
    data: updateData,
    select: { id: true, name: true, gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true },
  });

  const parts: string[] = [];
  if (gasPricePerGallon    !== undefined) parts.push(`Gas $${gasPricePerGallon.toFixed(3)}/gal`);
  if (dieselPricePerGallon !== undefined) parts.push(`Diesel $${dieselPricePerGallon.toFixed(3)}/gal`);
  const priceText = parts.join(' · ');

  // Push + in-app → store staff only (they must update pump displays immediately)
  sendPushToStoreStaff(
    storeId,
    `⛽ Gas Prices Updated — ${store.name}`,
    `${priceText} — update pump display now`,
    'GAS_PRICE_UPDATE',
  );

  // In-app only → all customers (no push — routine daily change)
  prisma.user.findMany({ where: { role: 'CUSTOMER', isActive: true }, select: { id: true } })
    .then((customers) => {
      if (customers.length > 0) {
        saveNotificationMany(
          customers.map((c) => c.id),
          `⛽ New Prices at ${store.name}`,
          priceText,
          'GAS_PRICE_UPDATE',
        );
      }
    })
    .catch(() => { /* non-critical */ });

  res.json({ success: true, data: store });
}

/** GET /stores/gas-prices — all authenticated users (for home screen display) */
export async function getAllGasPrices(_req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, city: true, state: true,
      gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true,
      enabledCategories: true,
    },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stores });
}
