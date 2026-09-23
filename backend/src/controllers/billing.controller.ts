import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { BillingType, ProductCategory, Role, Tier } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';
import { DEFAULT_DEV_CUT_RATE, DEFAULT_TIER_RATES, MAX_STORE_FEE_RATE } from '../config/constants';
import { TIER_THRESHOLDS, GAS_BONUS_PER_GALLON } from '../utils/tier';
import { TIER_ORDER as RATE_TIER_ORDER, RateState, TierChange, CategoryChange, applyChanges, refusalFor, tierName, categoryName, pct } from '../utils/rateRules';
import { sendPushToUser, sendPushToStoreEmployees, saveNotificationMany } from '../utils/push';
import { gasPriceUrlEmployee, gasPriceUrlCustomer, adminDisputeUrl, adminAlertUrl, adminProductRequestUrl, adminStockRequestUrl } from '../utils/notificationRoutes';
import { sendBillingInvoiceEmail } from '../utils/email';
import { computeTodayHoursLabel } from '../utils/storeHours';
import { storeMonthStart, storePrevMonthStart, storeDateKey, addStoreDays, startOfStoreDate, endOfStoreDate, isRealDateKey, storeDateText, storeHour, storeWeekday } from '../utils/storeTime';
import { COMPARE_RANGES, CompareRange, compareWindows, summarize } from '../utils/dashboardWindows';
import { csvText } from '../utils/csv';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { isRealPeriod, isFinishedPeriod, lastFinishedPeriod, periodBounds, periodFirstDay, periodLastDay, periodLabel, periodsSince, storePeriodOf } from '../utils/billingPeriods';
import { excludeDeletedCustomers } from '../utils/accountDeletion';
import { GAS_PRICE_MIN, GAS_PRICE_MAX, storePhone, inUnitedStates, COORDINATES_MESSAGE, COORDINATE_PAIR_MESSAGE } from '../utils/storeRules';
import { resolveAudience } from '../utils/audience';
import { cachedAnalytics, bucketTime } from '../utils/analyticsCache';

// STORE_MANAGER+ — single store info (for scheduling page)
export async function getStoreById(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true, name: true, address: true, city: true, state: true, zipCode: true,
      phone: true, latitude: true, longitude: true, shiftsPerDay: true,
      gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true,
      enabledCategories: true, hotFoodEnabled: true, orderInstructions: true,
    },
  });
  if (!store) { res.status(404).json({ success: false, error: 'Store not found' }); return; }
  res.json({ success: true, data: store });
}

// SUPER_ADMIN+, basic store list (no billing info). Deliberately not
// filtered to isActive:true, this is the store *management* view, so a
// deactivated store needs to stay visible (with its status shown) rather
// than silently vanishing with no UI path back to reactivating it.
// A price is old more than READINESS_FRESH_DAYS after it was last saved - the same "how stale" question
// the price-reminder cron (utils/price-reminder-cron.ts) asks, so the card and the reminder always agree.
const READINESS_FRESH_DAYS = 3;

export async function getStores(_req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({
    select: {
      id: true, name: true, address: true, city: true, state: true, zipCode: true,
      phone: true, latitude: true, longitude: true, shiftsPerDay: true,
      gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true, dieselPriceUpdatedAt: true,
      enabledCategories: true, hotFoodEnabled: true,
      minimumAge: true, isActive: true,
      storeHours: true,
      storeHolidays: { where: { date: { gte: new Date(Date.now() - 86400000) } } },
    },
    orderBy: { name: 'asc' },
  });

  // Two facts that live outside the Store row itself: whether anyone active is assigned to work there,
  // and whether it has ever recorded an approved sale - both grouped once for every store instead of a
  // query per card.
  const [staffCounts, soldStores] = await Promise.all([
    prisma.userStoreRole.groupBy({ by: ['storeId'], where: { user: { isActive: true } }, _count: { userId: true } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { status: 'APPROVED' }, _count: { id: true } }),
  ]);
  const staffMap = new Map(staffCounts.map((r) => [r.storeId, r._count.userId]));
  const soldSet = new Set(soldStores.map((r) => r.storeId));

  const now = Date.now();
  const fresh = (at: Date | null) => !!at && now - at.getTime() < READINESS_FRESH_DAYS * 24 * 60 * 60 * 1000;

  const withTodayHours = stores.map(({ storeHours, storeHolidays, ...store }) => {
    const readiness = {
      hoursSet: storeHours.length > 0,
      phoneSet: !!store.phone,
      locationSet: store.latitude != null && store.longitude != null,
      gasFresh: fresh(store.gasPriceUpdatedAt),
      dieselSet: store.dieselPricePerGallon != null,
      dieselFresh: fresh(store.dieselPriceUpdatedAt),
      staffAssigned: (staffMap.get(store.id) ?? 0) > 0,
      hasFirstSale: soldSet.has(store.id),
    };
    return {
      ...store,
      todayHours: computeTodayHoursLabel(storeHours, storeHolidays),
      readiness,
      isReady: Object.values(readiness).every(Boolean),
    };
  });
  res.json({ success: true, data: withTodayHours });
}

// STORE_MANAGER+ — returns stores accessible to the caller
// SuperAdmin/DevAdmin → all stores; allStoresAccess manager → all stores; regular manager → their stores
export async function getAccessibleStores(req: AuthRequest, res: Response) {
  const user = req.user!;
  const storeSelect = {
    id: true, name: true, address: true, city: true, isActive: true, orderInstructions: true,
    gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true,
  } as const;

  if (hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: storeSelect, orderBy: { name: 'asc' } });
    res.json({ success: true, data: stores });
    return;
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { allStoresAccess: true } });
  if (dbUser?.allStoresAccess) {
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: storeSelect, orderBy: { name: 'asc' } });
    res.json({ success: true, data: stores });
    return;
  }

  const assignments = await prisma.userStoreRole.findMany({
    where: { userId: user.id },
    include: { store: { select: storeSelect } },
  });
  res.json({ success: true, data: assignments.map(a => a.store) });
}

// SuperAdmin+ — update store details (name, address, lat/lng, etc.). Closing or reopening a store (isActive) is Dev Admin only, here on the
// server and not only on the page. Every change is checked with a sentence for the person, written to the Activity Log, and a request that changes
// nothing is a harmless repeat. The phone is stored as +1 and ten digits; clearing it now clears it.
const storeText = (what: string, max: number) =>
  z.string({ message: `Enter the ${what}.` }).trim().min(1, `Enter the ${what}.`).max(max, `The ${what} is too long (${max} characters at most).`);

const updateStoreSchema = z.object({
  name: storeText('store name', 60).optional(),
  address: storeText('address', 120).optional(),
  city: storeText('city', 60).optional(),
  state: z.string({ message: 'The state is its two-letter code, such as TX.' }).trim().regex(/^[A-Za-z]{2}$/, 'The state is its two-letter code, such as TX.').transform((v) => v.toUpperCase()).optional(),
  zipCode: z.string({ message: 'The ZIP code is five digits, such as 75090.' }).trim().regex(/^\d{5}(-\d{4})?$/, 'The ZIP code is five digits, such as 75090.').optional(),
  phone: z.string({ message: 'The phone number must be text.' }).trim().max(30, 'That phone number is too long.').nullable().optional(),
  latitude: z.number({ message: 'The latitude must be a number.' }).min(-90, 'The latitude must be between -90 and 90.').max(90, 'The latitude must be between -90 and 90.').nullable().optional(),
  longitude: z.number({ message: 'The longitude must be a number.' }).min(-180, 'The longitude must be between -180 and 180.').max(180, 'The longitude must be between -180 and 180.').nullable().optional(),
  shiftsPerDay: z.number({ message: 'Shifts per day must be 2 or 3.' }).int('Shifts per day must be 2 or 3.').min(2, 'Shifts per day must be 2 or 3.').max(3, 'Shifts per day must be 2 or 3.').optional(),
  enabledCategories: z.array(z.nativeEnum(ProductCategory, { message: 'One of those categories is not a real category.' })).optional(),
  hotFoodEnabled: z.boolean({ message: 'Hot food must be on or off.' }).optional(),
  minimumAge: z.number({ message: 'The minimum age must be a number.' }).int('The minimum age must be a whole number.').min(0, 'The minimum age must be between 0 and 100.').max(100, 'The minimum age must be between 0 and 100.').nullable().optional(),
  isActive: z.boolean({ message: 'Open or closed must be true or false.' }).optional(),
});

const STORE_SELECT = {
  id: true, name: true, address: true, city: true, state: true, zipCode: true, phone: true,
  latitude: true, longitude: true, shiftsPerDay: true, enabledCategories: true, hotFoodEnabled: true,
  minimumAge: true, isActive: true,
} as const;

const createStoreSchema = z.object({
  name: storeText('store name', 60),
  address: storeText('address', 120),
  city: storeText('city', 60),
  state: z.string({ message: 'The state is its two-letter code, such as TX.' }).trim().regex(/^[A-Za-z]{2}$/, 'The state is its two-letter code, such as TX.').transform((v) => v.toUpperCase()),
  zipCode: z.string({ message: 'The ZIP code is five digits, such as 75090.' }).trim().regex(/^\d{5}(-\d{4})?$/, 'The ZIP code is five digits, such as 75090.'),
  phone: z.string({ message: 'The phone number must be text.' }).trim().max(30).optional(),
  latitude: z.number({ message: 'The latitude must be a number.' }).min(-90, 'The latitude must be between -90 and 90.').max(90, 'The latitude must be between -90 and 90.').optional(),
  longitude: z.number({ message: 'The longitude must be a number.' }).min(-180, 'The longitude must be between -180 and 180.').max(180, 'The longitude must be between -180 and 180.').optional(),
  transactionFeeRate: z.number({ message: 'The fee must be a number.' }).min(0, 'The fee cannot be negative.').max(MAX_STORE_FEE_RATE, `The fee can be at most ${Math.round(MAX_STORE_FEE_RATE * 100)}% of the cashback.`).optional(),
});

// DEV_ADMIN only - a new store is a system-wide, billing-relevant entity, the same bar as closing one or
// changing a store's fee, both already Dev-Admin-only elsewhere on this page.
export async function createStore(req: AuthRequest, res: Response) {
  const parsed = createStoreSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { name, address, city, state, zipCode, phone: rawPhone, latitude, longitude, transactionFeeRate } = parsed.data;

  const same = await prisma.store.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { name: true } });
  if (same) { res.status(409).json({ success: false, error: `Another store is already called "${same.name}".` }); return; }

  let phone: string | null = null;
  if (rawPhone !== undefined && rawPhone.trim() !== '') {
    phone = storePhone(rawPhone);
    if (!phone) { res.status(400).json({ success: false, error: 'Enter a full ten-digit phone number, or leave it empty.' }); return; }
  }

  // Coordinates go together, and they must be in the United States - the same rule Edit Store already enforces.
  if ((latitude === undefined) !== (longitude === undefined)) { res.status(400).json({ success: false, error: COORDINATE_PAIR_MESSAGE }); return; }
  if (latitude !== undefined && longitude !== undefined && !inUnitedStates(latitude, longitude)) { res.status(400).json({ success: false, error: COORDINATES_MESSAGE }); return; }

  const store = await prisma.store.create({
    data: {
      name, address, city, state, zipCode, phone,
      latitude: latitude ?? null, longitude: longitude ?? null,
      transactionFeeRate: transactionFeeRate ?? DEFAULT_DEV_CUT_RATE,
    },
    select: { ...STORE_SELECT, transactionFeeRate: true },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_STORE', entity: 'store', entityId: store.id,
    details: { summary: `${store.name} added (${city}, ${state}), fee ${(store.transactionFeeRate * 100).toFixed(0)}%`, name: store.name, city, state, transactionFeeRate: store.transactionFeeRate },
    storeId: store.id, storeName: store.name,
  });

  res.status(201).json({ success: true, data: store });
}

export async function updateStore(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = updateStoreSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const data: Record<string, unknown> = { ...parsed.data };

  const before = await prisma.store.findUnique({ where: { id: storeId }, select: STORE_SELECT });
  if (!before) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }

  if (data.isActive !== undefined && data.isActive !== before.isActive && !hasMinRole(req.user!.role, Role.DEV_ADMIN)) {
    res.status(403).json({ success: false, error: 'Only a Dev Admin can close or reopen a store.' });
    return;
  }

  if (data.phone !== undefined) {
    const raw = String(data.phone ?? '').trim();
    if (raw === '') data.phone = null;
    else {
      const phone = storePhone(raw);
      if (!phone) { res.status(400).json({ success: false, error: 'Enter a full ten-digit phone number, or leave it empty.' }); return; }
      data.phone = phone;
    }
  }

  // Coordinates go together, and they must be in the United States
  if (data.latitude !== undefined || data.longitude !== undefined) {
    const lat = data.latitude !== undefined ? (data.latitude as number | null) : before.latitude;
    const lng = data.longitude !== undefined ? (data.longitude as number | null) : before.longitude;
    if ((lat === null) !== (lng === null)) { res.status(400).json({ success: false, error: COORDINATE_PAIR_MESSAGE }); return; }
    if (lat !== null && lng !== null && !inUnitedStates(lat, lng)) { res.status(400).json({ success: false, error: COORDINATES_MESSAGE }); return; }
  }

  if (typeof data.name === 'string' && data.name.toLowerCase() !== before.name.toLowerCase()) {
    const same = await prisma.store.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, id: { not: storeId } }, select: { name: true } });
    if (same) { res.status(409).json({ success: false, error: `Another store is already called "${same.name}".` }); return; }
  }

  // Only what really changes is written and recorded
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed: string[] = [];
  const parts: string[] = [];
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? 'none' : Array.isArray(v) ? (v.length ? v.join(', ') : 'all') : String(v));
  for (const [k, v] of Object.entries(data)) {
    const was = (before as Record<string, unknown>)[k];
    const differs = k === 'enabledCategories' ? !same([...(was as string[])].sort(), [...(v as string[])].sort()) : !same(was, v);
    if (!differs) { delete data[k]; continue; }
    changed.push(k);
    parts.push(`${k === 'isActive' ? (v ? 'reopened' : 'closed') : `${k} ${show(was)} to ${show(v)}`}`);
  }
  if (changed.length === 0) {
    res.json({ success: true, data: before, changed: false });
    return;
  }

  const store = await prisma.store.update({ where: { id: storeId }, data, select: STORE_SELECT });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_STORE', entity: 'store', entityId: storeId,
    details: { summary: `${before.name}: ${parts.join('; ')}`, changed },
    storeId, storeName: store.name,
  });
  res.json({ success: true, data: store, changed: true });
}

// DevAdmin only — change billing type for a store
const billingSchema = z.object({
  billingType: z.enum(['MONTHLY_SUBSCRIPTION', 'PER_TRANSACTION', 'HYBRID'], { errorMap: () => ({ message: 'Choose a plan: Monthly Subscription, Per Transaction or Hybrid.' }) }),
  subscriptionPrice: z.coerce.number().positive('The monthly price must be above $0.00.').max(10000, 'The monthly price can be at most $10,000.00.').optional(),
  transactionFeeRate: z.coerce.number().min(0, 'The fee cannot be negative.').max(MAX_STORE_FEE_RATE, `The fee can be at most ${Math.round(MAX_STORE_FEE_RATE * 100)}% of the cashback.`).optional(),
});

export async function updateStoreBilling(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = billingSchema.safeParse(req.body);
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  const pick = { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true } as const;
  const before = await prisma.store.findUnique({ where: { id: storeId }, select: pick });
  if (!before) {
    res.status(404).json({ success: false, error: 'Store not found' });
    return;
  }
  const store = await prisma.store.update({ where: { id: storeId }, data: parsed.data, select: pick });
  // The fee and plan apply to sales from now on: each sale keeps the fee it was granted at, and a bill that exists keeps its amount
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'STORE_BILLING_UPDATE', entity: 'store', entityId: store.id,
    details: {
      before: { billingType: before.billingType, subscriptionPrice: before.subscriptionPrice, transactionFeeRate: before.transactionFeeRate },
      after: { billingType: store.billingType, subscriptionPrice: store.subscriptionPrice, transactionFeeRate: store.transactionFeeRate },
    },
    storeId: store.id, storeName: store.name,
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
      where: { status: 'APPROVED', isTestData: false, createdAt: { gte: thirtyDaysAgo } },
      _sum: { purchaseAmount: true, pointsAwarded: true },
      _count: true,
    }),
    // Per-store transaction totals — last 90 days
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED', isTestData: false, createdAt: { gte: ninetyDaysAgo } },
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

// ─── Extra charges and payments ───────────────────────────────────────────────
// Rules kept by everything below: a bill or a charge is never deleted or overwritten by a bulk action; a PAID record never
// changes (a correction is a new extra charge); every change writes an Activity Log entry (who, when, what).

const PAYMENT_METHODS = ['CHECK', 'BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] as const;
const round2 = (n: number) => parseFloat(n.toFixed(2));
const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005;
const dollars = (n: number) => `$${n.toFixed(2)}`;

/** A record's notes are JSON text. One unreadable row must not break a list, so this never throws. */
export function parseNotes(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

const chargeSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Enter the amount in dollars.' }).positive('The amount must be above $0.00.').max(100000, 'The amount can be at most $100,000.00.'),
  period: z.string({ required_error: 'Choose the billing month.' }).refine(isRealPeriod, 'Choose a real month, like 2026-09.'),
  billingType: z.literal('CUSTOM', { errorMap: () => ({ message: 'Only a one-off (custom) charge can be added by hand. Usage bills are made by the billing job.' }) }),
  description: z.string({ required_error: 'Add a description of what the charge is for.' }).trim().min(1, 'Add a description of what the charge is for.').max(200, 'The description can be at most 200 characters.'),
});

export async function createBillingRecord(req: AuthRequest, res: Response) {
  const parsed = chargeSchema.safeParse(req.body);
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  // 'chain' is a reserved sentinel (never a real store id) meaning: bill the
  // chain/SuperAdmin as a whole, not any one store, see BillingRecord.storeId
  // in schema.prisma for the same null-means-chain-wide convention used by
  // AdminNotice/DailyTask.
  const storeId = req.params.storeId === 'chain' ? null : req.params.storeId;
  let storeName: string | null = null;
  if (storeId) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
    if (!store) {
      res.status(400).json({ success: false, error: 'That store does not exist. Choose one from the list.' });
      return;
    }
    storeName = store.name;
  }
  const { amount, period, description } = parsed.data;
  const record = await prisma.billingRecord.create({
    data: { storeId, amount: round2(amount), period, billingType: BillingType.CUSTOM, notes: JSON.stringify({ description }) },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_CHARGE_ADD', entity: 'billing', entityId: record.id,
    details: { amount: record.amount, period, description, chainWide: storeId === null },
    storeId, storeName,
  });
  res.status(201).json({ success: true, data: record });
}

const paymentSchema = z.object({
  paidOn: z.string().optional(),
  method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: 'Choose how it was paid.' }) }).optional(),
  note: z.string().trim().max(200, 'The note can be at most 200 characters.').optional(),
  // What the person saw when they clicked: if the amount changed since, nothing is marked (they are told to reload)
  expectedAmount: z.coerce.number().optional(),
  expectedTotal: z.coerce.number().optional(),
}).superRefine((d, ctx) => {
  if (d.paidOn === undefined || d.paidOn === '') return;
  if (!isRealDateKey(d.paidOn) || d.paidOn < '2020-01-01') ctx.addIssue({ code: 'custom', path: ['paidOn'], message: 'Choose a real payment date.' });
  else if (d.paidOn > storeDateKey(new Date())) ctx.addIssue({ code: 'custom', path: ['paidOn'], message: 'The payment date cannot be in the future.' });
});

/** The instant a payment is recorded at: right now for today, otherwise noon on that store day (so the day never shifts). */
function paidAtFor(paidOn: string | undefined, now: Date): Date {
  if (!paidOn || paidOn === storeDateKey(now)) return now;
  return new Date(startOfStoreDate(paidOn).getTime() + 12 * 3600_000);
}

function paymentInfo(req: AuthRequest, d: z.infer<typeof paymentSchema>, paidAt: Date, now: Date) {
  return {
    method: d.method ?? null,
    note: d.note ? d.note : null,
    paidOn: storeDateKey(paidAt),
    markedById: req.user!.id,
    markedByName: req.user!.name ?? null,
    markedAt: now.toISOString(),
  };
}

export async function markBillingPaid(req: AuthRequest, res: Response) {
  const parsed = paymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  const rec = await prisma.billingRecord.findUnique({ where: { id: req.params.recordId }, include: { store: { select: { name: true } } } });
  if (!rec) {
    res.status(404).json({ success: false, error: 'Record not found' });
    return;
  }
  if (rec.isPaid) {
    res.status(409).json({ success: false, error: `Already marked paid${rec.paidAt ? ` on ${storeDateText(rec.paidAt)}` : ''}. Undo that first if it was a mistake.` });
    return;
  }
  if (parsed.data.expectedAmount !== undefined && !sameMoney(rec.amount, parsed.data.expectedAmount)) {
    res.status(409).json({ success: false, error: `This bill is now ${dollars(rec.amount)}, not ${dollars(parsed.data.expectedAmount)}. Reload the page and check it.` });
    return;
  }
  const now = new Date();
  const paidAt = paidAtFor(parsed.data.paidOn, now);
  const payment = paymentInfo(req, parsed.data, paidAt, now);
  // Conditional update: two clicks at once cannot both "win" and move the payment date
  const changed = await prisma.billingRecord.updateMany({
    where: { id: rec.id, isPaid: false },
    data: { isPaid: true, paidAt, notes: JSON.stringify({ ...(parseNotes(rec.notes) ?? {}), payment }) },
  });
  if (changed.count === 0) {
    res.status(409).json({ success: false, error: 'Someone else just marked this bill paid. Reload the page.' });
    return;
  }
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_MARK_PAID', entity: 'billing', entityId: rec.id,
    details: { amount: rec.amount, period: rec.period, kind: rec.billingType, ...payment },
    storeId: rec.storeId, storeName: rec.store?.name ?? null,
  });
  res.json({ success: true, data: await prisma.billingRecord.findUnique({ where: { id: rec.id } }) });
}

const unpaySchema = z.object({
  reason: z.string({ required_error: 'Say why this payment is being undone.' }).trim().min(3, 'Say why this payment is being undone (a few words).').max(200, 'The reason can be at most 200 characters.'),
});

// PATCH /billing/records/:recordId/unpaid: the way back from a mistaken "paid". The payment stays in the record's history.
export async function unmarkBillingPaid(req: AuthRequest, res: Response) {
  const parsed = unpaySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  const rec = await prisma.billingRecord.findUnique({ where: { id: req.params.recordId }, include: { store: { select: { name: true } } } });
  if (!rec) {
    res.status(404).json({ success: false, error: 'Record not found' });
    return;
  }
  if (!rec.isPaid) {
    res.status(409).json({ success: false, error: 'That bill is not marked paid.' });
    return;
  }
  const notes = parseNotes(rec.notes) ?? {};
  const reversal = {
    at: new Date().toISOString(), byId: req.user!.id, byName: req.user!.name ?? null, reason: parsed.data.reason,
    previous: notes.payment ?? { paidOn: rec.paidAt ? storeDateKey(rec.paidAt) : null },
  };
  const nextNotes = { ...notes, payment: null, paymentReversals: [...(Array.isArray(notes.paymentReversals) ? notes.paymentReversals : []), reversal] };
  const changed = await prisma.billingRecord.updateMany({
    where: { id: rec.id, isPaid: true },
    data: { isPaid: false, paidAt: null, notes: JSON.stringify(nextNotes) },
  });
  if (changed.count === 0) {
    res.status(409).json({ success: false, error: 'Someone else just changed this bill. Reload the page.' });
    return;
  }
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_UNDO_PAID', entity: 'billing', entityId: rec.id,
    details: { amount: rec.amount, period: rec.period, reason: parsed.data.reason, previous: reversal.previous },
    storeId: rec.storeId, storeName: rec.store?.name ?? null,
  });
  res.json({ success: true, data: await prisma.billingRecord.findUnique({ where: { id: rec.id } }) });
}

// GET /billing/extra-charges: list all CUSTOM charges with optional filters
export async function getExtraCharges(req: AuthRequest, res: Response) {
  const { storeId, period, isPaid } = req.query as { storeId?: string; period?: string; isPaid?: string };
  const records = await (prisma.billingRecord as any).findMany({
    where: {
      billingType: 'CUSTOM',
      ...(storeId && { storeId }),
      ...(period  && { period }),
      ...(isPaid !== undefined && { isPaid: isPaid === 'true' }),
    },
    include: { store: { select: { id: true, name: true, city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // Parse notes JSON to surface description field
  const data = records.map((r: any) => {
    const n = parseNotes(r.notes);
    return { ...r, description: n ? (n.description ?? '') : (r.notes ?? '') };
  });
  res.json({ success: true, data });
}

const chargeEditSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Enter the amount in dollars.' }).positive('The amount must be above $0.00.').max(100000, 'The amount can be at most $100,000.00.').optional(),
  description: z.string().trim().min(1, 'Add a description of what the charge is for.').max(200, 'The description can be at most 200 characters.').optional(),
});

// PATCH /billing/records/:recordId: update description/amount of an UNPAID custom charge
export async function updateBillingRecord(req: AuthRequest, res: Response) {
  const { recordId } = req.params;
  const parsed = chargeEditSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  const existing = await (prisma.billingRecord as any).findUnique({ where: { id: recordId }, include: { store: { select: { name: true } } } });
  if (!existing) { res.status(404).json({ success: false, error: 'Record not found' }); return; }
  if (existing.billingType !== 'CUSTOM') { res.status(400).json({ success: false, error: 'Only custom charges can be edited' }); return; }
  if (existing.isPaid) { res.status(400).json({ success: false, error: 'A paid charge cannot be edited. Add a new charge for the difference instead.' }); return; }
  const before = { amount: existing.amount, description: parseNotes(existing.notes)?.description ?? '' };
  const updates: any = {};
  if (parsed.data.amount !== undefined) updates.amount = round2(parsed.data.amount);
  if (parsed.data.description !== undefined) updates.notes = JSON.stringify({ ...(parseNotes(existing.notes) ?? {}), description: parsed.data.description });
  const updated = await (prisma.billingRecord as any).update({ where: { id: recordId }, data: updates });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_CHARGE_EDIT', entity: 'billing', entityId: recordId,
    details: { period: existing.period, before, after: { amount: updated.amount, description: parseNotes(updated.notes)?.description ?? '' } },
    storeId: existing.storeId, storeName: existing.store?.name ?? null,
  });
  res.json({ success: true, data: updated });
}

// DELETE /billing/records/:recordId: delete an UNPAID custom charge only
export async function deleteBillingRecord(req: AuthRequest, res: Response) {
  const { recordId } = req.params;
  const existing = await (prisma.billingRecord as any).findUnique({ where: { id: recordId }, include: { store: { select: { name: true } } } });
  if (!existing) { res.status(404).json({ success: false, error: 'Record not found' }); return; }
  if (existing.billingType !== 'CUSTOM') { res.status(400).json({ success: false, error: 'Only custom charges can be deleted' }); return; }
  if (existing.isPaid) { res.status(400).json({ success: false, error: 'Cannot delete a paid charge' }); return; }
  await (prisma.billingRecord as any).delete({ where: { id: recordId } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_CHARGE_DELETE', entity: 'billing', entityId: recordId,
    details: { amount: existing.amount, period: existing.period, description: parseNotes(existing.notes)?.description ?? '' },
    storeId: existing.storeId, storeName: existing.store?.name ?? null,
  });
  res.json({ success: true });
}

// Mark every UNPAID record of a month paid (HQ pays one consolidated invoice), all or nothing, with what the person saw as a guard
export async function markPeriodPaid(req: AuthRequest, res: Response) {
  const { period } = req.params;
  if (!isRealPeriod(period)) {
    res.status(400).json({ success: false, error: 'Choose a real month, like 2026-09.' });
    return;
  }
  const parsed = paymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  const unpaid = await prisma.billingRecord.findMany({ where: { period, isPaid: false }, include: { store: { select: { name: true } } } });
  if (unpaid.length === 0) {
    res.status(409).json({ success: false, error: `Everything in ${periodLabel(period)} is already marked paid.` });
    return;
  }
  const total = round2(unpaid.reduce((s, r) => s + r.amount, 0));
  if (parsed.data.expectedTotal !== undefined && !sameMoney(total, parsed.data.expectedTotal)) {
    res.status(409).json({ success: false, error: `${periodLabel(period)} now has ${dollars(total)} unpaid, not ${dollars(parsed.data.expectedTotal)}. Reload the page and check it.` });
    return;
  }
  const now = new Date();
  const paidAt = paidAtFor(parsed.data.paidOn, now);
  const payment = paymentInfo(req, parsed.data, paidAt, now);
  const updated = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const r of unpaid) {
      const c = await tx.billingRecord.updateMany({
        where: { id: r.id, isPaid: false },
        data: { isPaid: true, paidAt, notes: JSON.stringify({ ...(parseNotes(r.notes) ?? {}), payment }) },
      });
      n += c.count;
    }
    return n;
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_MARK_PERIOD_PAID', entity: 'billing', entityId: period,
    details: { period, records: updated, total, ...payment, recordIds: unpaid.map((r) => r.id) },
  });
  res.json({ success: true, data: { period, updated, total } });
}

// ─── Cashback rates (tier and category) ──────────────────────────────────────
//
// The Rates page changes what every sale pays. Every change goes through refusalFor() (utils/rateRules.ts: limits, the ladder of
// thresholds, the 10% ceiling), is written in one transaction, and leaves an Activity Log entry with the values before and after.

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  GROCERIES: 'Groceries',
  FROZEN_FOODS: 'Frozen Foods',
  FRESH_FOODS: 'Fresh Foods',
  GAS: 'Gas',
  DIESEL: 'Diesel',
  HOT_FOODS: 'Hot Foods',
  OTHER: 'Other',
};

/** The rates as they stand now (a row that was never saved reads as its default). Thresholds in points, bonuses as fractions. */
async function loadRateState(): Promise<RateState> {
  const [tiers, categories] = await Promise.all([prisma.tierCashbackRate.findMany(), prisma.categoryRate.findMany()]);
  const state: RateState = { tiers: {}, categories: {} };
  for (const tier of RATE_TIER_ORDER) {
    const row = tiers.find((r) => r.tier === tier);
    state.tiers[tier] = {
      cashbackRate: row?.cashbackRate ?? DEFAULT_TIER_RATES[tier],
      gasCentsPerGallon: row?.gasCentsPerGallon ?? null,
      thresholdPoints: tier === 'BRONZE' ? null : Math.round((row?.pointsThreshold ?? TIER_THRESHOLDS[tier]) * 100),
    };
  }
  for (const cat of Object.keys(CATEGORY_LABELS)) state.categories[cat] = categories.find((r) => r.category === cat)?.cashbackRate ?? 0;
  return state;
}

/** One tier as the API sends it: thresholds in points (what the app shows), plus the fixed gas bonus the code adds for Gold and up. */
function tierRow(tier: string, t: RateState['tiers'][string]) {
  return {
    tier,
    cashbackRate: t.cashbackRate,
    gasCentsPerGallon: t.gasCentsPerGallon,
    pointsThreshold: t.thresholdPoints ?? 0,
    gasBonusCentsPerGallon: Math.round((GAS_BONUS_PER_GALLON[tier] ?? 0) * 100),
  };
}

export async function getCategoryRates(_req: AuthRequest, res: Response) {
  const state = await loadRateState();
  // Return all categories. A category with no saved rate gets no bonus when points are granted
  // (points.controller and receipt.controller both use 0), so report 0, not a made-up default.
  const rates = (Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    cashbackRate: state.categories[cat] ?? 0,
  }));

  res.json({ success: true, data: rates });
}

const centsText = (n: number | null) => (n == null ? 'percent of the sale' : `${parseFloat(n.toFixed(2))} cents a gallon`);

/** Sentences for the Activity Log and the "last changed" line under the tables. */
function tierSummary(name: string, from: RateState['tiers'][string], to: RateState['tiers'][string]): string[] {
  const out: string[] = [];
  if (from.cashbackRate !== to.cashbackRate) out.push(`${name} cashback ${pct(from.cashbackRate)} to ${pct(to.cashbackRate)}`);
  if (from.gasCentsPerGallon !== to.gasCentsPerGallon) out.push(`${name} gas ${centsText(from.gasCentsPerGallon)} to ${centsText(to.gasCentsPerGallon)}`);
  if (from.thresholdPoints !== to.thresholdPoints) out.push(`${name} threshold ${from.thresholdPoints} to ${to.thresholdPoints} points`);
  return out;
}

const NUMBER_MESSAGE = (what: string) => ({ invalid_type_error: `${what} must be a number.`, required_error: `${what} is required.` });

const tierChangeSchema = z.object({
  cashbackRate: z.number(NUMBER_MESSAGE('Cashback')).min(0, 'Cashback cannot be below 0%.').max(1, 'Cashback cannot be above 100%.').optional(),
  gasCentsPerGallon: z.number(NUMBER_MESSAGE('Cents per gallon')).min(0, 'Cents per gallon cannot be negative.').nullable().optional(),
  pointsThreshold: z.number(NUMBER_MESSAGE('The points threshold')).int('The points threshold must be a whole number of points.').min(0, 'The points threshold cannot be negative.').optional(),
});
const atLeastOneField = (d: { cashbackRate?: unknown; gasCentsPerGallon?: unknown; pointsThreshold?: unknown }) =>
  d.cashbackRate !== undefined || d.gasCentsPerGallon !== undefined || d.pointsThreshold !== undefined;

const tierEnum = z.nativeEnum(Tier, { errorMap: () => ({ message: 'That tier does not exist.' }) });

interface LastChange { at: string; by: string; summary: string }

/**
 * Saves changes to one or more tiers at once, all or nothing: refuses with a sentence, writes nothing when nothing differs, and
 * otherwise writes in one transaction and records who changed what. Answers the request itself.
 */
async function saveTierChanges(
  req: AuthRequest, res: Response, changes: TierChange[],
  answer: (rows: ReturnType<typeof tierRow>[], extra: { changed: number; lastChange: LastChange | null }) => object,
) {
  const before = await loadRateState();
  const problem = refusalFor(before, changes);
  if (problem) { res.status(400).json({ success: false, error: problem }); return; }

  const after = applyChanges(before, changes);
  const differing = changes.filter((c) => tierSummary(tierName(c.tier), before.tiers[c.tier], after.tiers[c.tier]).length > 0);
  let lastChange: LastChange | null = null;

  if (differing.length > 0) {
    await prisma.$transaction(differing.map((c) => {
      const t = after.tiers[c.tier];
      return prisma.tierCashbackRate.upsert({
        where: { tier: c.tier as Tier },
        update: {
          ...(c.cashbackRate !== undefined && { cashbackRate: t.cashbackRate }),
          ...(c.gasCentsPerGallon !== undefined && { gasCentsPerGallon: t.gasCentsPerGallon }),
          ...(c.pointsThreshold !== undefined && { pointsThreshold: (t.thresholdPoints as number) / 100 }),
        },
        create: {
          tier: c.tier as Tier,
          cashbackRate: t.cashbackRate,
          gasCentsPerGallon: t.gasCentsPerGallon,
          pointsThreshold: c.tier === 'BRONZE' ? null : (t.thresholdPoints as number) / 100,
        },
      });
    }));

    const sentences = differing.flatMap((c) => tierSummary(tierName(c.tier), before.tiers[c.tier], after.tiers[c.tier]));
    const everyTier = (state: RateState, test: (t: RateState['tiers'][string]) => boolean) => RATE_TIER_ORDER.every((t) => test(state.tiers[t]));
    const wasCents = everyTier(before, (t) => t.gasCentsPerGallon != null);
    const wasPercent = everyTier(before, (t) => t.gasCentsPerGallon == null);
    const nowCents = everyTier(after, (t) => t.gasCentsPerGallon != null);
    const nowPercent = everyTier(after, (t) => t.gasCentsPerGallon == null);
    const gasMode = wasCents && nowPercent ? 'percent' : wasPercent && nowCents ? 'cents' : undefined;
    const summary = gasMode === 'percent' ? 'Gas switched to a percent of the sale for every tier'
      : gasMode === 'cents' ? 'Gas switched to cents per gallon for every tier'
      : sentences.join('; ');
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'RATE_TIER_UPDATE', entity: 'rates', entityId: differing.length === 1 ? differing[0].tier : 'tiers',
      details: {
        summary,
        gasMode,
        changes: differing.map((c) => ({ tier: c.tier, from: before.tiers[c.tier], to: after.tiers[c.tier] })),
      },
    });
    lastChange = { at: new Date().toISOString(), by: req.user!.name ?? 'Unknown', summary };
  }

  res.json(answer(RATE_TIER_ORDER.map((t) => tierRow(t, after.tiers[t])), { changed: differing.length, lastChange }));
}

export async function getTierRates(_req: AuthRequest, res: Response) {
  const state = await loadRateState();
  res.json({ success: true, data: RATE_TIER_ORDER.map((tier) => tierRow(tier, state.tiers[tier])) });
}

/** PUT /billing/tier-rates/:tier: one tier (kept for older callers). */
export async function updateTierRate(req: AuthRequest, res: Response) {
  const { tier } = req.params;
  const tierOk = tierEnum.safeParse(tier);
  if (!tierOk.success) { refuse(res, tierOk.error); return; }
  const parsed = tierChangeSchema.refine(atLeastOneField, { message: 'Provide at least one field to update.' }).safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  await saveTierChanges(req, res, [{ tier, ...parsed.data }], (rows, extra) => ({ success: true, data: rows.find((r) => r.tier === tier), ...extra }));
}

/** PUT /billing/tier-rates: several tiers in one all-or-nothing save (the Rates page's Save, Save all and gas switch). */
export async function updateTierRates(req: AuthRequest, res: Response) {
  const parsed = z.object({
    changes: z.array(tierChangeSchema.extend({ tier: tierEnum }).refine(atLeastOneField, { message: 'Provide at least one field to update.' }))
      .min(1, 'Nothing to change.').max(5, 'A save can change at most the five tiers.'),
  }).safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const tiers = parsed.data.changes.map((c) => c.tier);
  if (new Set(tiers).size !== tiers.length) { res.status(400).json({ success: false, error: 'Each tier can appear only once in a save.' }); return; }
  await saveTierChanges(req, res, parsed.data.changes as TierChange[], (rows, extra) => ({ success: true, data: rows, ...extra }));
}

/** PATCH /billing/category-rates/:category */
export async function updateCategoryRate(req: AuthRequest, res: Response) {
  const { category } = req.params;
  if (!Object.values(ProductCategory).includes(category as ProductCategory)) {
    res.status(400).json({ success: false, error: 'That category does not exist.' });
    return;
  }
  const parsed = z.object({
    cashbackRate: z.number(NUMBER_MESSAGE('The bonus')).min(0, 'A bonus cannot be below 0%.').max(1, 'A bonus cannot be above 100%.'),
  }).safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const before = await loadRateState();
  const change: CategoryChange = { category, cashbackRate: parsed.data.cashbackRate };
  const problem = refusalFor(before, [], [change]);
  if (problem) { res.status(400).json({ success: false, error: problem }); return; }

  const was = before.categories[category] ?? 0;
  let lastChange: LastChange | null = null;
  if (was !== change.cashbackRate) {
    await prisma.categoryRate.upsert({
      where: { category: category as ProductCategory },
      update: { cashbackRate: change.cashbackRate },
      create: { category: category as ProductCategory, cashbackRate: change.cashbackRate },
    });
    const summary = `${categoryName(category)} bonus ${pct(was)} to ${pct(change.cashbackRate)}`;
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'RATE_CATEGORY_UPDATE', entity: 'rates', entityId: category,
      details: { summary, category, from: was, to: change.cashbackRate },
    });
    lastChange = { at: new Date().toISOString(), by: req.user!.name ?? 'Unknown', summary };
  }
  res.json({ success: true, data: { category, cashbackRate: change.cashbackRate }, changed: lastChange ? 1 : 0, lastChange });
}

/** GET /billing/rates/last-change: who last changed a tier or category rate, and what they did (null if never recorded). */
export async function getRatesLastChange(_req: AuthRequest, res: Response) {
  const row = await prisma.auditLog.findFirst({
    where: { action: { in: ['RATE_TIER_UPDATE', 'RATE_CATEGORY_UPDATE'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) { res.json({ success: true, data: null }); return; }
  let summary = '';
  try { summary = (JSON.parse(row.details ?? '{}') as { summary?: string }).summary ?? ''; } catch { /* details are optional */ }
  res.json({ success: true, data: { at: row.createdAt, by: row.actorName ?? 'Unknown', summary } });
}

// ─── Dev Cut Rate Config ──────────────────────────────────────────────────────

export async function getDevCutRate(_req: AuthRequest, res: Response) {
  const config = await prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } });
  const rate = parseFloat(config?.value ?? String(DEFAULT_DEV_CUT_RATE));
  res.json({ success: true, data: { rate } });
}

export async function updateDevCutRate(req: AuthRequest, res: Response) {
  const parsed = z.object({ rate: z.number().min(0).max(MAX_STORE_FEE_RATE, `The rate can be at most ${Math.round(MAX_STORE_FEE_RATE * 100)}% of the cashback.`) }).safeParse(req.body);
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  const before = await prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } });
  await prisma.appConfig.upsert({
    where: { key: 'DEV_CUT_RATE' },
    update: { value: String(parsed.data.rate) },
    create: { key: 'DEV_CUT_RATE', value: String(parsed.data.rate) },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DEV_CUT_RATE_UPDATE', entity: 'settings',
    details: { before: before ? parseFloat(before.value) : null, after: parsed.data.rate, note: 'Default for stores added later. No existing store is billed at this rate.' },
  });
  res.json({ success: true, data: { rate: parsed.data.rate } });
}

// ─── Billing helpers ──────────────────────────────────────────────────────────

export function toPeriod(date: Date): string {
  return storePeriodOf(date);
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

export async function buildBillForPeriod(
  store: { id: string; billingType: string; subscriptionPrice: number; transactionFeeRate: number },
  period: string,
  options?: { allowEmpty?: boolean },
): Promise<{ amount: number; notes: BillNotes } | null> {
  const { start, end } = periodBounds(period);

  // Use actual per-transaction data — rates are already baked in at grant time,
  // so changing rates later doesn't retroactively alter historical bills.
  const txRows = await prisma.pointsTransaction.groupBy({
    by: ['category'],
    where: { storeId: store.id, status: 'APPROVED', isTestData: false, createdAt: { gte: start, lte: end } },
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
  if (subscriptionFee === 0 && txCount === 0 && !options?.allowEmpty) return null;

  const notes: BillNotes = {
    txCount, purchaseVolume,
    cashbackIssued, devCutEarned, customerCashback,
    effectiveCashbackRate: purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0,
    effectiveDevCutRate:   cashbackIssued > 0 ? parseFloat((devCutEarned / cashbackIssued).toFixed(4)) : 0, // devCut / cashback = configured devCutRate
    categories,
    subscriptionFee, transactionFeeRate: store.transactionFeeRate,
    transactionFee: 0, cashbackFee, totalAmountOwed,
    periodStart: periodFirstDay(period),
    periodEnd:   periodLastDay(period),
  };

  return { amount: totalAmountOwed, notes };
}

/** The usage bills that already exist (extra charges never count: a charge does not stand in for a store's bill), as "storeId:period" keys. */
async function usageBillKeys(where: { period?: string }): Promise<Set<string>> {
  const rows = await prisma.billingRecord.findMany({
    where: { ...where, billingType: { not: BillingType.CUSTOM } },
    select: { storeId: true, period: true },
  });
  return new Set(rows.map((r) => `${r.storeId}:${r.period}`));
}

const billsWord = (n: number) => `${n} bill${n === 1 ? '' : 's'}`;

// ─── Generate usage bills for one FINISHED month (default = the last one) ─────
// Never replaces or deletes anything: a store that already has its usage bill for the month is left exactly as it is.

export async function generateMonthlyBilling(req: AuthRequest, res: Response) {
  const asked = typeof req.query.period === 'string' && req.query.period ? req.query.period : lastFinishedPeriod();
  if (!isRealPeriod(asked)) {
    res.status(400).json({ success: false, error: 'Choose a real month, like 2026-09.' });
    return;
  }
  if (!isFinishedPeriod(asked)) {
    res.status(400).json({ success: false, error: `${periodLabel(asked)} is not finished yet. Bills are made after a month ends (Central time) so they hold the whole month.` });
    return;
  }
  const period = asked;

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true },
  });
  if (stores.length === 0) {
    res.json({ success: true, message: 'No active stores', data: { created: 0, alreadyBilled: 0, nothingToBill: 0, skipped: 0, period } });
    return;
  }

  const have = await usageBillKeys({ period });
  let created = 0; let alreadyBilled = 0; let nothingToBill = 0;
  for (const store of stores) {
    if (have.has(`${store.id}:${period}`)) { alreadyBilled++; continue; }
    const bill = await buildBillForPeriod(store, period);
    if (!bill) { nothingToBill++; continue; }
    await (prisma.billingRecord as any).create({
      data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify({ ...bill.notes, generatedBy: 'manual' }) },
    });
    created++;
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_GENERATE', entity: 'billing', entityId: period,
    details: { period, created, alreadyBilled, nothingToBill },
  });
  res.json({
    success: true,
    message: created ? `Made ${billsWord(created)} for ${periodLabel(period)}.`
      : alreadyBilled ? `Every store with activity in ${periodLabel(period)} already has its bill.`
      : `No store had anything to bill in ${periodLabel(period)}.`,
    data: { created, alreadyBilled, nothingToBill, skipped: alreadyBilled + nothingToBill, period },
  });
}

// ─── Fill in missing bills: every finished month since each store was created ─
// Only creates bills that do not exist yet. It never recalculates, replaces or deletes an existing bill or charge.

export async function generateAllMissingBills(req: AuthRequest, res: Response) {
  const upTo = lastFinishedPeriod();
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true, createdAt: true },
  });
  const have = await usageBillKeys({});

  let created = 0; let alreadyBilled = 0; let nothingToBill = 0;
  const results: { store: string; period: string; amount: number; action: string }[] = [];
  for (const store of stores) {
    for (const period of periodsSince(store.createdAt, upTo)) {
      if (have.has(`${store.id}:${period}`)) { alreadyBilled++; continue; }
      const bill = await buildBillForPeriod(store, period);
      if (!bill) { nothingToBill++; continue; }
      await (prisma.billingRecord as any).create({
        data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify({ ...bill.notes, generatedBy: 'manual' }) },
      });
      results.push({ store: store.name, period, amount: bill.amount, action: 'created' });
      created++;
    }
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_FILL_MISSING', entity: 'billing',
    details: { upTo, created, alreadyBilled, nothingToBill, bills: results.slice(0, 50) },
  });
  res.json({
    success: true,
    message: created ? `Made ${billsWord(created)} that were missing (up to ${periodLabel(upTo)}). ${alreadyBilled} existing bill${alreadyBilled === 1 ? ' was' : 's were'} left as they are.`
      : `Nothing was missing up to ${periodLabel(upTo)}. ${alreadyBilled} existing bill${alreadyBilled === 1 ? ' was' : 's were'} left as they are.`,
    data: { created, alreadyBilled, nothingToBill, skipped: alreadyBilled + nothingToBill, bills: results },
  });
}

// ─── Recalculate ONE unpaid usage bill ────────────────────────────────────────
// POST /billing/records/:recordId/recalculate[?dryRun=1]. Rebuilds the bill from its month's approved sales, on the plan the bill
// was made with (a later plan change never rewrites it). A paid bill is never touched: a correction is a new extra charge.

export async function recalculateBillingRecord(req: AuthRequest, res: Response) {
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const rec = await prisma.billingRecord.findUnique({
    where: { id: req.params.recordId },
    include: { store: { select: { id: true, name: true, transactionFeeRate: true } } },
  });
  if (!rec) {
    res.status(404).json({ success: false, error: 'Record not found' });
    return;
  }
  if (rec.billingType === BillingType.CUSTOM || !rec.storeId) {
    res.status(400).json({ success: false, error: 'Only usage bills can be recalculated. An extra charge is edited on the Manual Charges tab.' });
    return;
  }
  if (rec.isPaid) {
    res.status(400).json({ success: false, error: 'A paid bill is never changed. Add an extra charge for the difference instead.' });
    return;
  }
  if (!isFinishedPeriod(rec.period)) {
    res.status(400).json({ success: false, error: `${periodLabel(rec.period)} is not finished yet.` });
    return;
  }
  const notes = parseNotes(rec.notes) ?? {};
  const plan = {
    id: rec.storeId,
    billingType: rec.billingType as string,
    subscriptionPrice: typeof notes.subscriptionFee === 'number' ? notes.subscriptionFee : 0,
    transactionFeeRate: typeof notes.transactionFeeRate === 'number' ? notes.transactionFeeRate : (rec.store?.transactionFeeRate ?? 0),
  };
  const next = (await buildBillForPeriod(plan, rec.period, { allowEmpty: true }))!;
  const difference = round2(next.amount - rec.amount);
  if (dryRun) {
    res.json({ success: true, data: { current: rec.amount, recalculated: next.amount, difference } });
    return;
  }
  const changed = await prisma.billingRecord.updateMany({
    where: { id: rec.id, isPaid: false },
    data: {
      amount: next.amount,
      notes: JSON.stringify({ ...next.notes, generatedBy: notes.generatedBy ?? 'manual', recalculatedAt: new Date().toISOString(), previousAmount: rec.amount }),
    },
  });
  if (changed.count === 0) {
    res.status(409).json({ success: false, error: 'Someone just marked this bill paid, so it was not changed. Reload the page.' });
    return;
  }
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_RECALCULATE', entity: 'billing', entityId: rec.id,
    details: { period: rec.period, before: rec.amount, after: next.amount, difference },
    storeId: rec.storeId, storeName: rec.store?.name ?? null,
  });
  res.json({ success: true, data: { current: rec.amount, recalculated: next.amount, difference, record: await prisma.billingRecord.findUnique({ where: { id: rec.id } }) } });
}

// ─── Seed test transactions (DevAdmin only — for demo/testing) ────────────────

const WEIGHTED_CATEGORIES = [
  ...Array(12).fill('GAS'),   ...Array(8).fill('GROCERIES'),
  ...Array(6).fill('DIESEL'), ...Array(5).fill('HOT_FOODS'),
  ...Array(3).fill('FRESH_FOODS'),
  ...Array(3).fill('FROZEN_FOODS'),  ...Array(2).fill('OTHER'),
] as ProductCategory[];

const AMOUNT_RANGES: Record<string, [number, number]> = {
  GAS: [25, 110], DIESEL: [60, 200], GROCERIES: [8, 65], HOT_FOODS: [4, 18],
  FROZEN_FOODS: [3, 22], FRESH_FOODS: [5, 30], OTHER: [2, 40],
};

export async function seedTestTransactions(_req: AuthRequest, res: Response) {
  // Off unless ALLOW_SEED_TEST_DATA=true is set on the server. It fills the database with fake sales and gives real customers fake balances.
  if (process.env.ALLOW_SEED_TEST_DATA !== 'true') {
    res.status(403).json({ success: false, error: 'Seeding test data is switched off on this server. It fills the database with fake sales and gives real customers fake balances.' });
    return;
  }
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
  const asked = typeof req.query.period === 'string' && req.query.period ? req.query.period : lastFinishedPeriod();
  if (!isRealPeriod(asked)) {
    res.status(400).json({ success: false, error: 'Choose a real month, like 2026-09.' });
    return;
  }
  const period = asked;

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

    // Email each super admin their store's unpaid invoice(s)
    if (admin.email) {
      const adminStores = await (prisma.userStoreRole as any).findMany({
        where: { userId: admin.id },
        select: { storeId: true },
      });
      const adminStoreIds = new Set(adminStores.map((s: any) => s.storeId));
      const adminRecords = records.filter((r: any) => adminStoreIds.has(r.storeId));
      for (const record of adminRecords) {
        sendBillingInvoiceEmail(admin.email, {
          period,
          storeName: record.store.name,
          amount: record.amount,
          isPaid: record.isPaid,
        }).catch(() => {});
      }
    }
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'BILLING_REPORT_SENT', entity: 'billing', entityId: period,
    details: { period, records: records.length, totalOwed: parseFloat(totalOwed.toFixed(2)), notified: sent },
  });
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
  const records = rawRecords.map((r: any) => ({ ...r, notes: parseNotes(r.notes) }));

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

  const records = rawRecords.map((r: any) => ({ ...r, notes: parseNotes(r.notes) }));

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
    byPeriod[r.period].stores.push({ store: r.store, amount: amt, billingType: r.billingType, txCount: n?.txCount ?? 0, cashbackIssued: n?.cashbackIssued ?? 0, description: n?.description ?? null, isPaid: r.isPaid, paidAt: r.paidAt });
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

// GET /billing/pending-count — badge count: billing periods with at least one unpaid record.
// Same underlying data for DevAdmin's /billing and SuperAdmin's /my-billing — both consolidate
// the same BillingRecord rows, just grouped differently.
export async function getBillingPendingCount(_req: AuthRequest, res: Response) {
  const unpaidPeriods = await prisma.billingRecord.findMany({
    where: { isPaid: false },
    select: { period: true },
    distinct: ['period'],
  });
  res.json({ success: true, data: { count: unpaidPeriods.length } });
}

// SuperAdmin — derived notification feed (no DB table needed)
export async function getSuperAdminNotifications(_req: AuthRequest, res: Response) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const [allBills, rejectedTx, flaggedSales] = await Promise.all([
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
    // Sales held for review: the most urgent thing here, and until now the one thing this list did not contain
    prisma.pointsTransaction.findMany({
      where: { status: 'FLAGGED' },
      select: { id: true, purchaseAmount: true, fraudFlags: true, createdAt: true, store: { select: { id: true, name: true } }, customer: { select: { name: true, phone: true } }, grantedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => [] as any[]),
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

  let pendingDisputes: any[] = [];
  try {
    pendingDisputes = await prisma.pointsDispute.findMany({
      where: { status: 'PENDING' },
      include: { customer: { select: { name: true, phone: true } }, store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  } catch { /* Gracefully degrade — dispute notifications simply won't appear */ }

  // Each request-type query degrades independently — one failing query no
  // longer takes the other two down with it (previously a single shared
  // try/catch dropped all three on any one failure).
  const [pendingStoreAlerts, pendingProductRequests, pendingStockRequests] = await Promise.all([
    prisma.storeRequest.findMany({
      where: { status: 'PENDING' },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
    prisma.productRequest.findMany({
      where: { status: 'PENDING', expiresAt: { gte: now } },
      include: { customer: { select: { name: true, phone: true } }, store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
    prisma.employeeItemRequest.findMany({
      where: { status: 'PENDING' },
      include: { store: { select: { id: true, name: true } }, submittedBy: { select: { name: true } }, lines: true },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
  ]);

  // Group bills by period
  const byPeriod: Record<string, { total: number; storeCount: number; isPaid: boolean; paidAt: string | null; stores: { name: string; city: string; amount: number }[] }> = {};
  for (const bill of allBills) {
    const amt = parseFloat(String(bill.amount));
    if (!byPeriod[bill.period]) {
      byPeriod[bill.period] = { total: 0, storeCount: 0, isPaid: true, paidAt: bill.paidAt ? bill.paidAt.toISOString() : null, stores: [] };
    }
    byPeriod[bill.period].total += amt;
    byPeriod[bill.period].stores.push({ name: bill.store?.name ?? 'All Stores (Chain-wide)', city: bill.store?.city ?? '', amount: amt });
    if (!bill.isPaid) byPeriod[bill.period].isPaid = false;
    if (bill.isPaid && bill.paidAt) byPeriod[bill.period].paidAt = bill.paidAt.toISOString();
  }

  const notifications: {
    id: string; type: string; category: string; title: string; message: string;
    createdAt: string; isRead: boolean; severity: string;
    actionUrl?: string; actionLabel?: string;
    period?: string; totalAmount?: number; paidAt?: string | null;
    requestId?: string; storeId?: string; requestType?: string;
  }[] = [];

  for (const [period, info] of Object.entries(byPeriod)) {
    const [y, m] = period.split('-').map(Number);
    const monthName = new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const total = parseFloat(info.total.toFixed(2));
    const storeCount = new Set(info.stores.map((st) => st.name)).size;   // stores, not bills: a store with a usage bill and an extra charge is one store

    if (info.isPaid) {
      notifications.push({
        id: `invoice-paid-${period}`,
        type: 'BILLING',
        category: 'billing',
        title: `Invoice Paid — ${monthName}`,
        message: `$${total.toFixed(2)} platform fee has been settled. Download your invoice for records.`,
        createdAt: info.paidAt ?? new Date(y, m, 1).toISOString(),
        isRead: true,
        severity: 'success',
        actionUrl: '/billing',
        actionLabel: 'View Billing',
        period,
        totalAmount: total,
        paidAt: info.paidAt,
      });
    } else {
      notifications.push({
        id: `invoice-due-${period}`,
        type: 'BILLING',
        category: 'billing',
        title: `Invoice Due — ${monthName}`,
        message: `$${total.toFixed(2)} in platform fees outstanding across ${storeCount} store${storeCount !== 1 ? 's' : ''}.`,
        createdAt: new Date(y, m, 1).toISOString(),
        isRead: false,
        severity: 'warning',
        actionUrl: '/billing',
        actionLabel: 'Pay Invoice',
        period,
        totalAmount: total,
        paidAt: null,
      });
    }
  }

  // Sales held for review, one card each. The id is the sale's own id, so a card you have read stays read.
  for (const t of flaggedSales) {
    let flags: string[] = [];
    try { flags = t.fraudFlags ? JSON.parse(t.fraudFlags) : []; } catch { /* unreadable flags: shown without them */ }
    const big = t.purchaseAmount >= 500;
    notifications.push({
      id: `flagged-${t.id}`,
      type: 'TRANSACTION',
      category: 'transactions',
      title: `Sale held for review at ${t.store?.name ?? 'a store'}`,
      message: `$${Number(t.purchaseAmount).toFixed(2)} for ${t.customer?.name || t.customer?.phone || 'a customer'}, granted by ${t.grantedBy?.name || 'a cashier'}${flags.length ? `. Held because: ${flags.join(', ')}` : ''}.`,
      createdAt: t.createdAt.toISOString(),
      isRead: false,
      severity: big ? 'error' : 'warning',
      actionUrl: '/transactions',
      actionLabel: 'Review Sale',
      storeId: t.store?.id,
    });
  }

  // Rejected transaction alert. The id holds the count, so it stays read until the number changes (it used to hold the date 30 days ago, which changed at midnight and brought it back as new every day).
  if (rejectedTx > 0) {
    notifications.push({
      id: `rejected-30d-${rejectedTx}`,
      type: 'TRANSACTION',
      category: 'transactions',
      title: `${rejectedTx} Transaction${rejectedTx !== 1 ? 's' : ''} Rejected`,
      message: `${rejectedTx} point grant${rejectedTx !== 1 ? 's were' : ' was'} rejected in the last 30 days. Review your transactions page for details.`,
      createdAt: now.toISOString(),
      isRead: false,
      severity: rejectedTx >= 5 ? 'error' : 'info',
      actionUrl: '/transactions',
      actionLabel: 'View Rejected Transactions',
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
      category: 'scheduling',
      title: isTimeOff
        ? `Time Off Request — ${req.employee.name}`
        : `Extra Shift Request — ${req.employee.name}`,
      message: isTimeOff
        ? `${req.employee.name} requested time off on ${dateStr} (${shiftLabel} shift) at ${req.store.name}.${req.notes ? ` Note: "${req.notes}"` : ''}`
        : `${req.employee.name} wants to fill in on ${dateStr} (${shiftLabel} shift) at ${req.store.name}.${req.notes ? ` Note: "${req.notes}"` : ''}`,
      createdAt: req.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      actionUrl: '/scheduling',
      actionLabel: 'Review Request',
      requestId: req.id,
      storeId: req.store.id,
      requestType: req.requestType,
    });
  }

  for (const d of pendingDisputes) {
    notifications.push({
      id: `dispute-${d.id}`,
      type: 'DISPUTE',
      category: 'disputes',
      title: `Missing-Points Report — ${d.customer?.name || d.customer?.phone}`,
      message: `${d.description} (${d.store?.name || 'Unknown store'})`,
      createdAt: d.createdAt.toISOString(),
      isRead: false,
      severity: 'warning',
      actionUrl: adminDisputeUrl(d.id),
      actionLabel: 'Review Dispute',
    });
  }

  for (const r of pendingStoreAlerts) {
    notifications.push({
      id: `emp-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Store Alert — ${r.submitterName || 'Employee'}`,
      message: `${r.notes || r.type} at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: r.priority === 'HIGH' ? 'error' : 'info',
      actionUrl: adminAlertUrl(r.store.id, r.id),
      actionLabel: 'Review Alert',
    });
  }

  for (const r of pendingProductRequests) {
    notifications.push({
      id: `product-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Product Request — "${r.productName}"`,
      message: `${r.customer?.name || r.customer?.phone} at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      actionUrl: adminProductRequestUrl(r.store.id, r.id),
      actionLabel: 'Review Request',
    });
  }

  for (const r of pendingStockRequests) {
    notifications.push({
      id: `stock-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Stock Request — ${r.submittedBy?.name || 'Employee'}`,
      message: `${r.lines.length} item${r.lines.length !== 1 ? 's' : ''} requested at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      actionUrl: adminStockRequestUrl(r.store.id, r.id),
      actionLabel: 'Review Request',
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

  const [allBills, rejectedTx, newCustomers, pendingShiftRequests, pendingDisputes, pendingStoreAlerts, pendingProductRequests, pendingStockRequests, flaggedSales] = await Promise.all([
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
      where: { role: 'CUSTOMER', ...excludeDeletedCustomers, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.shiftRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        employee: { select: { name: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
    prisma.pointsDispute.findMany({
      where: { status: 'PENDING' },
      include: { customer: { select: { name: true, phone: true } }, store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
    prisma.storeRequest.findMany({
      where: { status: 'PENDING' },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
    prisma.productRequest.findMany({
      where: { status: 'PENDING', expiresAt: { gte: now } },
      include: { customer: { select: { name: true, phone: true } }, store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
    prisma.employeeItemRequest.findMany({
      where: { status: 'PENDING' },
      include: { store: { select: { id: true, name: true } }, submittedBy: { select: { name: true } }, lines: true },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [] as any[]),
    prisma.pointsTransaction.findMany({
      where: { status: 'FLAGGED' },
      select: { id: true, purchaseAmount: true, fraudFlags: true, createdAt: true, store: { select: { id: true, name: true } }, customer: { select: { name: true, phone: true } }, grantedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }).catch(() => [] as any[]),
  ]);

  const notifications: any[] = [];

  for (const t of flaggedSales) {
    let flags: string[] = [];
    try { flags = t.fraudFlags ? JSON.parse(t.fraudFlags) : []; } catch { /* unreadable flags: shown without them */ }
    notifications.push({
      id: `flagged-${t.id}`,
      type: 'TRANSACTION',
      category: 'transactions',
      title: `Sale held for review at ${t.store?.name ?? 'a store'}`,
      message: `$${Number(t.purchaseAmount).toFixed(2)} for ${t.customer?.name || t.customer?.phone || 'a customer'}, granted by ${t.grantedBy?.name || 'a cashier'}${flags.length ? `. Held because: ${flags.join(', ')}` : ''}.`,
      createdAt: t.createdAt.toISOString(),
      isRead: false,
      severity: t.purchaseAmount >= 500 ? 'error' : 'warning',
      actionUrl: '/transactions',
      actionLabel: 'Review Sale',
      storeId: t.store?.id,
    });
  }

  // Group bills by period+chain (company)
  const byPeriod: Record<string, { total: number; unpaidStores: Set<string>; isPaid: boolean; paidAt: string | null; stores: Set<string> }> = {};
  for (const bill of allBills) {
    if (!byPeriod[bill.period]) {
      byPeriod[bill.period] = { total: 0, unpaidStores: new Set(), isPaid: true, paidAt: null, stores: new Set() };
    }
    const storeName = bill.store?.name ?? 'All Stores (Chain-wide)';
    byPeriod[bill.period].total += parseFloat(String(bill.amount));
    byPeriod[bill.period].stores.add(storeName);   // stores, not bills
    if (!bill.isPaid) {
      byPeriod[bill.period].isPaid = false;
      byPeriod[bill.period].unpaidStores.add(storeName);
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
        category: 'billing',
        title: `Payment Received — ${monthName}`,
        message: `$${total.toFixed(2)} in platform fees collected across ${info.stores.size} store${info.stores.size !== 1 ? 's' : ''}.`,
        createdAt: info.paidAt ?? new Date(y, m, 1).toISOString(),
        isRead: true,
        severity: 'success',
        actionUrl: '/billing',
        actionLabel: 'View Revenue',
        period,
        totalAmount: total,
        paidAt: info.paidAt,
      });
    } else {
      notifications.push({
        id: `dev-due-${period}`,
        type: 'REVENUE',
        category: 'billing',
        title: `Payment Pending — ${monthName}`,
        message: `$${total.toFixed(2)} outstanding from ${info.unpaidStores.size} store${info.unpaidStores.size !== 1 ? 's' : ''}. Mark as paid once received.`,
        createdAt: new Date(y, m, 1).toISOString(),
        isRead: false,
        severity: 'warning',
        actionUrl: '/billing',
        actionLabel: 'Mark as Paid',
        period,
        totalAmount: total,
        paidAt: null,
      });
    }
  }

  // Platform health alerts
  if (rejectedTx > 0) {
    notifications.push({
      id: `dev-rejected-30d-${rejectedTx}`,   // holds the count, not the date 30 days ago (which changed every midnight)
      type: 'PLATFORM',
      category: 'transactions',
      title: `${rejectedTx} Rejected Transaction${rejectedTx !== 1 ? 's' : ''} (Last 30 Days)`,
      message: `${rejectedTx} point grant${rejectedTx !== 1 ? 's were' : ' was'} rejected recently. Review the Activity Log for details.`,
      createdAt: now.toISOString(),
      isRead: rejectedTx < 3,
      severity: rejectedTx >= 10 ? 'error' : rejectedTx >= 5 ? 'warning' : 'info',
      actionUrl: '/activity',
      actionLabel: 'View Activity Log',
    });
  }

  if (newCustomers > 0) {
    notifications.push({
      id: `dev-customers-30d-${newCustomers}`,
      type: 'PLATFORM',
      category: 'customers',
      title: `${newCustomers} New Customer${newCustomers !== 1 ? 's' : ''} (Last 30 Days)`,
      message: `${newCustomers} customer${newCustomers !== 1 ? 's have' : ' has'} signed up in the last 30 days across all stores.`,
      createdAt: now.toISOString(),
      isRead: true,
      severity: 'info',
      actionUrl: '/customers',
      actionLabel: 'View Customers',
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
      category: 'scheduling',
      title: isTimeOff ? `Time Off Request — ${req.employee.name}` : `Extra Shift Request — ${req.employee.name}`,
      message: isTimeOff
        ? `${req.employee.name} requested time off for ${dateStr} (${shiftLabel} shift) at ${req.store.name}.${req.notes ? ` Note: ${req.notes}` : ''}`
        : `${req.employee.name} wants to pick up the ${shiftLabel} shift on ${dateStr} at ${req.store.name}.${req.notes ? ` Note: ${req.notes}` : ''}`,
      createdAt: req.createdAt.toISOString(),
      isRead: false,
      actionUrl: '/scheduling',
      actionLabel: 'Review Request',
      severity: 'info',
      requestId: req.id,
      storeId: req.store.id,
      requestType: req.requestType,
    });
  }

  for (const d of pendingDisputes) {
    notifications.push({
      id: `dispute-${d.id}`,
      type: 'DISPUTE',
      category: 'disputes',
      title: `Missing-Points Report — ${d.customer?.name || d.customer?.phone}`,
      message: `${d.description} (${d.store?.name || 'Unknown store'})`,
      createdAt: d.createdAt.toISOString(),
      isRead: false,
      severity: 'warning',
      actionUrl: adminDisputeUrl(d.id),
      actionLabel: 'Review Dispute',
    });
  }

  for (const r of pendingStoreAlerts) {
    notifications.push({
      id: `emp-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Store Alert — ${r.submitterName || 'Employee'}`,
      message: `${r.notes || r.type} at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: r.priority === 'HIGH' ? 'error' : 'info',
      actionUrl: adminAlertUrl(r.store.id, r.id),
      actionLabel: 'Review Alert',
    });
  }

  for (const r of pendingProductRequests) {
    notifications.push({
      id: `product-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Product Request — "${r.productName}"`,
      message: `${r.customer?.name || r.customer?.phone} at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      actionUrl: adminProductRequestUrl(r.store.id, r.id),
      actionLabel: 'Review Request',
    });
  }

  for (const r of pendingStockRequests) {
    notifications.push({
      id: `stock-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Stock Request — ${r.submittedBy?.name || 'Employee'}`,
      message: `${r.lines.length} item${r.lines.length !== 1 ? 's' : ''} requested at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      actionUrl: adminStockRequestUrl(r.store.id, r.id),
      actionLabel: 'Review Request',
    });
  }

  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data: notifications });
}

// ─── Revenue & Analytics ──────────────────────────────────────────────────────

// DevAdmin: total revenue summary
// DevAdmin: revenue totals. ?period=all (default) | month | last-month, cut on the store calendar
// (Central time). For a month, subscription revenue is what was collected (paidAt) in that month.
export async function getDevRevenue(req: AuthRequest, res: Response) {
  const asked = String(req.query.period ?? 'all');
  const period: 'all' | 'month' | 'last-month' = asked === 'month' || asked === 'last-month' ? asked : 'all';
  const now = new Date();
  const range = period === 'month' ? { gte: storeMonthStart(now) }
    : period === 'last-month' ? { gte: storePrevMonthStart(now), lt: storeMonthStart(now) }
    : undefined;

  const [transactionStats, txDevCut, redemptionStats, subscriptionStats, devCutConfig] = await Promise.all([
    prisma.pointsTransaction.aggregate({
      _sum: { purchaseAmount: true, pointsAwarded: true },
      _count: true,
      where: { status: 'APPROVED', isTestData: false, ...(range ? { createdAt: range } : {}) },
    }),
    // Dev cut earned at grant time (new model)
    prisma.pointsTransaction.aggregate({
      _sum: { devCut: true },
      where: { status: 'APPROVED', isTestData: false, ...(range ? { createdAt: range } : {}) },
    }),
    prisma.creditRedemption.aggregate({
      _sum: { amount: true },
      _count: true,
      where: range ? { createdAt: range } : undefined,
    }),
    // Not an aggregate: "subscription revenue" is the subscriptionFee component inside each paid bill's notes, not a billingType or a
    // column of its own, and it must NOT include extra (CUSTOM) charges, which used to be summed in here too (a $500 one-off charge
    // read as "subscription revenue"). CUSTOM records have no subscriptionFee field at all, so they fall out on their own.
    prisma.billingRecord.findMany({
      where: { isPaid: true, billingType: { not: 'CUSTOM' }, ...(range ? { paidAt: range } : {}) },
      select: { notes: true },
    }),
    prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } }),
  ]);

  const devCutRate = parseFloat(devCutConfig?.value ?? String(DEFAULT_DEV_CUT_RATE));
  const totalSubscriptionRevenue = parseFloat(
    subscriptionStats.reduce((sum, r) => sum + (parseNotes(r.notes)?.subscriptionFee ?? 0), 0).toFixed(2)
  );

  res.json({
    success: true,
    data: {
      period,
      devCutRate,
      totalTransactions: transactionStats._count,
      totalPurchaseVolume: transactionStats._sum.purchaseAmount ?? 0,
      totalPointsAwarded: transactionStats._sum.pointsAwarded ?? 0,
      totalDevCut: txDevCut._sum.devCut ?? 0,               // 4% of cashback issued (at grant time)
      totalRedemptions: redemptionStats._count,
      totalRedeemedAmount: redemptionStats._sum.amount ?? 0,
      totalSubscriptionRevenue,
    },
  });
}

// DevAdmin: date-ranged analytics for charts
export async function getAnalytics(req: AuthRequest, res: Response) {
  const { from, to, range, storeId } = req.query as { from?: string; to?: string; range?: string; storeId?: string };

  if (range !== undefined && !COMPARE_RANGES.includes(range as CompareRange)) {
    res.status(400).json({ success: false, error: `"range" must be ${COMPARE_RANGES.join(', ')}` });
    return;
  }

  // Dates are store days written YYYY-MM-DD. Anything else, or a day that does not exist (2026-02-31), is a clear 400
  // (before: text became a 500 and an impossible date quietly rolled into the next month).
  const realDay = (k: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
  };
  if ((from && !realDay(from.slice(0, 10))) || (to && !realDay(to.slice(0, 10)))) {
    res.status(400).json({ success: false, error: '"from" and "to" must be real dates written YYYY-MM-DD' });
    return;
  }

  // "range" gives one shared definition of "the last 30 days" (etc.) with the Dashboard, on the store
  // calendar, and asks for the previous stretch of the same length in the same query so the two can be
  // compared. It wins over from/to when both are sent.
  const compareWindow = range ? compareWindows(range as CompareRange) : null;
  const fromDate = compareWindow ? compareWindow.previous.start : from ? startOfStoreDate(from.slice(0, 10)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate   = compareWindow ? compareWindow.current.end     : to   ? endOfStoreDate(to.slice(0, 10))     : new Date();
  // What the charts and totals below actually display: the current period only. With a plain from/to this is
  // the same as fromDate/toDate; with "range" the fetch above also reaches back into the previous period so
  // compareWindows has real rows to summarize, and everything past this point is filtered back down to just
  // the current period.
  const displayFrom = compareWindow ? compareWindow.current.start : fromDate;
  const displayTo   = compareWindow ? compareWindow.current.end   : toDate;

  if (fromDate >= toDate) {
    res.status(400).json({ success: false, error: '"from" date must be before "to" date' });
    return;
  }
  if (toDate.getTime() - fromDate.getTime() > 400 * 24 * 60 * 60 * 1000) {
    res.status(400).json({ success: false, error: 'Choose a range of 400 days or less' });
    return;
  }

  // A short cache (see utils/analyticsCache.ts) keyed on the exact resolved window - not the raw
  // "range=30d" query string, since what that means depends on the moment the request landed - so a
  // repeat view of the same window within the cache's TTL reuses the last computed result instead of
  // re-scanning every approved sale again.
  const cacheKey = JSON.stringify({
    f: bucketTime(fromDate), t: bucketTime(toDate), s: storeId || null,
    cw: compareWindow ? {
      cs: bucketTime(compareWindow.current.start), ce: bucketTime(compareWindow.current.end),
      ps: bucketTime(compareWindow.previous.start), pe: bucketTime(compareWindow.previous.end),
    } : null,
  });

  const data = await cachedAnalytics(cacheKey, async () => {
    const [allTransactions, allRedemptions] = await Promise.all([
      prisma.pointsTransaction.findMany({
        // Seeded test sales never count toward revenue (the leaderboard already left them out)
        where: { status: 'APPROVED', isTestData: false, createdAt: { gte: fromDate, lte: toDate }, ...(storeId ? { storeId } : {}) },
        select: {
          createdAt: true, purchaseAmount: true, pointsAwarded: true, cashbackRate: true, category: true, devCut: true,
          store: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.creditRedemption.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate }, ...(storeId ? { storeId } : {}) },
        select: { createdAt: true, amount: true, devCut: true, store: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Compared against the previous period, before narrowing down to just the current one below.
    const compare = compareWindow ? summarize(compareWindow, allTransactions) : null;

    const transactions = compareWindow ? allTransactions.filter((t) => t.createdAt >= displayFrom && t.createdAt <= displayTo) : allTransactions;
    const redemptions  = compareWindow ? allRedemptions.filter((r) => r.createdAt  >= displayFrom && r.createdAt  <= displayTo) : allRedemptions;

    // Daily grouping: combine transactions + redemptions by date
    const byDate: Record<string, {
      date: string; transactions: number; purchaseVolume: number;
      pointsAwarded: number; redemptions: number; redeemedAmount: number; devCut: number;
    }> = {};

    for (const tx of transactions) {
      const date = storeDateKey(tx.createdAt);
      if (!byDate[date]) byDate[date] = { date, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, redeemedAmount: 0, devCut: 0 };
      byDate[date].transactions++;
      byDate[date].purchaseVolume = parseFloat((byDate[date].purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
      byDate[date].pointsAwarded = parseFloat((byDate[date].pointsAwarded + Number(tx.pointsAwarded)).toFixed(2));
      byDate[date].devCut = parseFloat((byDate[date].devCut + Number(tx.devCut)).toFixed(2));
    }
    for (const r of redemptions) {
      const date = storeDateKey(r.createdAt);
      if (!byDate[date]) byDate[date] = { date, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, redeemedAmount: 0, devCut: 0 };
      byDate[date].redemptions++;
      byDate[date].redeemedAmount = parseFloat((byDate[date].redeemedAmount + Number(r.amount)).toFixed(2));
      byDate[date].devCut = parseFloat((byDate[date].devCut + Number(r.devCut)).toFixed(2));
    }

    // Fill quiet days with zeros so a $0 day reads as a $0 day instead of a line skipping over it. Only the
    // displayed (current) period — in "range" mode fromDate/toDate also cover the earlier comparison period,
    // which has no chart of its own here.
    for (let key = storeDateKey(displayFrom), last = storeDateKey(displayTo), guard = 0; key <= last && guard < 400; key = addStoreDays(key, 1), guard++) {
      if (!byDate[key]) byDate[key] = { date: key, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, redeemedAmount: 0, devCut: 0 };
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
      byStore[id].devCut = parseFloat((byStore[id].devCut + Number(tx.devCut)).toFixed(2));
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

    // When busy times are: hour of day and day of week, store-local. Both start at zero for every slot so a
    // quiet hour or day reads as quiet, not missing.
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, transactions: 0, purchaseVolume: 0 }));
    const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byWeekday = WEEKDAY_NAMES.map((label, weekday) => ({ weekday, label, transactions: 0, purchaseVolume: 0 }));
    for (const tx of transactions) {
      const h = byHour[storeHour(tx.createdAt)];
      h.transactions++; h.purchaseVolume = parseFloat((h.purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
      const w = byWeekday[storeWeekday(tx.createdAt)];
      w.transactions++; w.purchaseVolume = parseFloat((w.purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
    }

    // A promotion that started inside the visible window, so a spike on the chart can be tied to it. Ended and
    // chain-wide-vs-one-store offers are both included; only the start date matters here.
    const promotionMarkers = (await prisma.offer.findMany({
      where: { startDate: { gte: displayFrom, lte: displayTo }, ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : {}) },
      select: { id: true, title: true, startDate: true, storeId: true },
      orderBy: { startDate: 'asc' },
    })).map((o) => ({ id: o.id, title: o.title, date: storeDateKey(o.startDate), storeId: o.storeId }));

    const totals = {
      transactions: transactions.length,
      purchaseVolume: transactions.reduce((s, t) => parseFloat((s + Number(t.purchaseAmount)).toFixed(2)), 0),
      pointsAwarded: transactions.reduce((s, t) => parseFloat((s + Number(t.pointsAwarded)).toFixed(2)), 0),
      redemptions: redemptions.length,
      redeemedAmount: redemptions.reduce((s, r) => parseFloat((s + Number(r.amount)).toFixed(2)), 0),
      devCut: parseFloat((
        transactions.reduce((s, t) => s + Number(t.devCut), 0) +
        redemptions.reduce((s, r) => s + Number(r.devCut), 0)
      ).toFixed(2)),
    };

    return {
      daily: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
      byStore: Object.values(byStore).sort((a, b) => b.purchaseVolume - a.purchaseVolume),
      byCategory: Object.values(byCategory).sort((a, b) => b.purchaseVolume - a.purchaseVolume),
      byHour,
      byWeekday,
      promotionMarkers,
      totals,
      compare,
      range: { from: displayFrom.toISOString(), to: displayTo.toISOString() },
    };
  });

  res.json({ success: true, data });
}

// DevAdmin: the same filters as getAnalytics, as a CSV (daily rows; a store/category summary underneath)
export async function exportAnalyticsCsv(req: AuthRequest, res: Response) {
  const { from, to, range, storeId } = req.query as { from?: string; to?: string; range?: string; storeId?: string };

  if (range !== undefined && !COMPARE_RANGES.includes(range as CompareRange)) {
    res.status(400).json({ success: false, error: `"range" must be ${COMPARE_RANGES.join(', ')}` });
    return;
  }
  const realDay = (k: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
  };
  if ((from && !realDay(from.slice(0, 10))) || (to && !realDay(to.slice(0, 10)))) {
    res.status(400).json({ success: false, error: '"from" and "to" must be real dates written YYYY-MM-DD' });
    return;
  }

  const w = range ? compareWindows(range as CompareRange) : null;
  const fromDate = w ? w.current.start : from ? startOfStoreDate(from.slice(0, 10)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate   = w ? w.current.end   : to   ? endOfStoreDate(to.slice(0, 10))     : new Date();
  if (fromDate >= toDate) {
    res.status(400).json({ success: false, error: '"from" date must be before "to" date' });
    return;
  }

  const transactions = await prisma.pointsTransaction.findMany({
    where: { status: 'APPROVED', isTestData: false, createdAt: { gte: fromDate, lte: toDate }, ...(storeId ? { storeId } : {}) },
    select: { createdAt: true, purchaseAmount: true, pointsAwarded: true, category: true, devCut: true, store: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const byDate: Record<string, { date: string; transactions: number; purchaseVolume: number; pointsAwarded: number; devCut: number }> = {};
  for (const t of transactions) {
    const d = storeDateKey(t.createdAt);
    if (!byDate[d]) byDate[d] = { date: d, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, devCut: 0 };
    byDate[d].transactions++;
    byDate[d].purchaseVolume = parseFloat((byDate[d].purchaseVolume + Number(t.purchaseAmount)).toFixed(2));
    byDate[d].pointsAwarded  = parseFloat((byDate[d].pointsAwarded  + Number(t.pointsAwarded)).toFixed(2));
    byDate[d].devCut         = parseFloat((byDate[d].devCut         + Number(t.devCut)).toFixed(2));
  }
  for (let key = storeDateKey(fromDate), last = storeDateKey(toDate), guard = 0; key <= last && guard < 400; key = addStoreDays(key, 1), guard++) {
    if (!byDate[key]) byDate[key] = { date: key, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, devCut: 0 };
  }

  const header = 'Date (Central),Transactions,Purchase Volume,Cashback Awarded,Platform Fee\n';
  const lines = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map((d) =>
    [d.date, d.transactions, d.purchaseVolume.toFixed(2), d.pointsAwarded.toFixed(2), d.devCut.toFixed(2)].join(',')
  ).join('\n');

  const byStore: Record<string, { name: string; transactions: number; purchaseVolume: number; pointsAwarded: number }> = {};
  for (const t of transactions) {
    const name = t.store.name;
    if (!byStore[name]) byStore[name] = { name, transactions: 0, purchaseVolume: 0, pointsAwarded: 0 };
    byStore[name].transactions++;
    byStore[name].purchaseVolume = parseFloat((byStore[name].purchaseVolume + Number(t.purchaseAmount)).toFixed(2));
    byStore[name].pointsAwarded  = parseFloat((byStore[name].pointsAwarded  + Number(t.pointsAwarded)).toFixed(2));
  }
  const storeHeader = '\nStore,Transactions,Purchase Volume,Cashback Awarded\n';
  const storeLines = Object.values(byStore).sort((a, b) => b.purchaseVolume - a.purchaseVolume)
    .map((s) => [csvText(s.name), s.transactions, s.purchaseVolume.toFixed(2), s.pointsAwarded.toFixed(2)].join(',')).join('\n');

  const filename = `analytics-${storeDateKey(fromDate)}-to-${storeDateKey(toDate)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(header + lines + storeHeader + storeLines);
}

// ─── Gas Prices ───────────────────────────────────────────────────────────────

const gasPrice = (what: string) =>
  z.number({ message: `The ${what} price must be a number.` })
    .min(GAS_PRICE_MIN, `The ${what} price must be at least $${GAS_PRICE_MIN.toFixed(2)} a gallon.`)
    .max(GAS_PRICE_MAX, `The ${what} price can be at most $${GAS_PRICE_MAX.toFixed(2)} a gallon.`)
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, `The ${what} price has at most three decimals, such as 3.199.`);

const gasPriceSchema = z.object({
  gasPricePerGallon:    gasPrice('gas').optional(),
  dieselPricePerGallon: gasPrice('diesel').optional(),
});

/**
 * PATCH /stores/:storeId/gas-prices — SuperAdmin or StoreManager. A price that is already the saved price changes nothing: no write, no message to the
 * store's staff, no line in customers' inboxes (a double click, or saving the form without touching a box, used to send them all again). Each real change
 * is an Activity Log entry with the old and new price.
 */
export async function updateGasPrices(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = gasPriceSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const { gasPricePerGallon, dieselPricePerGallon } = parsed.data;
  if (gasPricePerGallon === undefined && dieselPricePerGallon === undefined) {
    res.status(400).json({ success: false, error: 'Enter a gas or a diesel price to update.' });
    return;
  }

  const before = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true, dieselPriceUpdatedAt: true },
  });
  if (!before) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }

  // Each commodity tracks its own updatedAt — a diesel-only edit must not
  // make mobile's "change needed" indicator blink for gas too, and vice versa.
  const now = new Date();
  const updateData: Record<string, unknown> = {};
  const parts: string[] = [];
  const log: string[] = [];
  if (gasPricePerGallon !== undefined && gasPricePerGallon !== before.gasPricePerGallon) {
    updateData.gasPricePerGallon = gasPricePerGallon; updateData.gasPriceUpdatedAt = now;
    parts.push(`Gas $${gasPricePerGallon.toFixed(3)}/gal`);
    log.push(`gas ${before.gasPricePerGallon != null ? `$${before.gasPricePerGallon.toFixed(3)}` : 'not set'} to $${gasPricePerGallon.toFixed(3)}`);
  }
  if (dieselPricePerGallon !== undefined && dieselPricePerGallon !== before.dieselPricePerGallon) {
    updateData.dieselPricePerGallon = dieselPricePerGallon; updateData.dieselPriceUpdatedAt = now;
    parts.push(`Diesel $${dieselPricePerGallon.toFixed(3)}/gal`);
    log.push(`diesel ${before.dieselPricePerGallon != null ? `$${before.dieselPricePerGallon.toFixed(3)}` : 'not set'} to $${dieselPricePerGallon.toFixed(3)}`);
  }

  if (parts.length === 0) {
    res.json({ success: true, data: before, changed: false });
    return;
  }

  // Written only if the price is still what was just read: two identical requests at once (a double click, two managers) cannot both count as the
  // change, so staff are told once and the log has one entry
  const claimed = await prisma.store.updateMany({
    where: {
      id: storeId,
      ...('gasPricePerGallon' in updateData ? { gasPricePerGallon: before.gasPricePerGallon } : {}),
      ...('dieselPricePerGallon' in updateData ? { dieselPricePerGallon: before.dieselPricePerGallon } : {}),
    },
    data: updateData,
  });
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true, dieselPriceUpdatedAt: true },
  });
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }
  if (claimed.count === 0) {
    const nowSame = (gasPricePerGallon === undefined || store.gasPricePerGallon === gasPricePerGallon) && (dieselPricePerGallon === undefined || store.dieselPricePerGallon === dieselPricePerGallon);
    if (nowSame) { res.json({ success: true, data: store, changed: false }); return; }   // the same price was saved a moment ago
    res.status(409).json({ success: false, error: "Someone changed this store's price a moment ago. Reload to see the new price, then try again if it still needs changing." });
    return;
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'GAS_PRICE_UPDATE', entity: 'store', entityId: storeId,
    details: { summary: `${store.name}: ${log.join('; ')}`, before: { gas: before.gasPricePerGallon, diesel: before.dieselPricePerGallon }, after: { gas: store.gasPricePerGallon, diesel: store.dieselPricePerGallon } },
    storeId, storeName: store.name,
  });

  const priceText = parts.join(' · ');

  // Push + in-app → employees only (they update pump displays; managers don't need push)
  sendPushToStoreEmployees(
    storeId,
    `⛽ Gas Prices Updated — ${store.name}`,
    `${priceText} — update pump display now`,
    'GAS_PRICE_UPDATE',
    gasPriceUrlEmployee(),
  );

  // In-app only (no push, it is a routine change) → the customers of THIS store, meaning an approved purchase there in the last six months, and one
  // line per store: the new price replaces the store's unread old line instead of stacking up (before, every save at any store added a line for every
  // customer: 360 lines, 333 of them unread, for 13 customers in a month)
  resolveAudience('STORE_CUSTOMERS', storeId)
    .then(async (members) => {
      if (members.length === 0) return;
      const ids = members.map((m) => m.id);
      const title = `⛽ New Prices at ${store.name}`;
      await prisma.userNotification.deleteMany({ where: { userId: { in: ids }, type: 'GAS_PRICE_UPDATE', title, isRead: false } });
      await saveNotificationMany(ids, title, priceText, 'GAS_PRICE_UPDATE', gasPriceUrlCustomer());
    })
    .catch(() => { /* non-critical */ });

  res.json({ success: true, data: store, changed: true });
}

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store) — standing order instructions
const orderInstructionsSchema = z.object({
  instructions: z.string().trim().max(300).nullable(),
});

export async function updateOrderInstructions(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = orderInstructionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const trimmed = parsed.data.instructions?.trim() || null;
  const store = await prisma.store.update({
    where: { id: storeId },
    data: { orderInstructions: trimmed },
    select: { id: true, orderInstructions: true },
  });
  res.json({ success: true, data: store });
}

/** GET /stores/gas-prices — all authenticated users (for home screen display) */
export async function getAllGasPrices(_req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, address: true, city: true, state: true, phone: true,
      gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true, dieselPriceUpdatedAt: true,
      latitude: true, longitude: true, enabledCategories: true, minimumAge: true, hotFoodEnabled: true,
      storeHours: true,
      // Only holidays from the last day onward, old ones can never match
      // "today" and would just grow this payload forever otherwise.
      storeHolidays: { where: { date: { gte: new Date(Date.now() - 86400000) } } },
    },
    orderBy: { name: 'asc' },
  });
  const withTodayHours = stores.map(({ storeHours, storeHolidays, ...store }) => ({
    ...store,
    todayHours: computeTodayHoursLabel(storeHours, storeHolidays),
  }));
  res.json({ success: true, data: withTodayHours });
}

// ─── Cashback-to-Sales Health (DevAdmin only) ──────────────────────────────────

// Same value as CASHBACK_RATE_WARN (config/constants.ts) by coincidence, not by reference —
// that one caps a single transaction at grant time; this one flags a 30-day aggregate trend.
// Keep them as separate constants even if one changes.
const CASHBACK_HEALTH_WARN = 0.075;
const CASHBACK_HEALTH_CRITICAL = 0.09;

export function classifyCashbackRatio(ratio: number): 'ok' | 'warn' | 'critical' {
  if (ratio > CASHBACK_HEALTH_CRITICAL) return 'critical';
  if (ratio > CASHBACK_HEALTH_WARN) return 'warn';
  return 'ok';
}

// DevAdmin: trailing-30-day cashback-to-sales ratio per store, with category breakdown.
// Catches a systemic rate misconfiguration that no single transaction would look
// anomalous for (every transaction using the same wrong rate looks "consistent").
export async function getCashbackHealth(_req: AuthRequest, res: Response) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [stores, categoryStats] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.pointsTransaction.groupBy({
      by: ['storeId', 'category'],
      where: { status: 'APPROVED', isTestData: false, createdAt: { gte: thirtyDaysAgo } },
      _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
  ]);

  const byStore: Record<string, typeof categoryStats> = {};
  for (const row of categoryStats) {
    (byStore[row.storeId] ??= []).push(row);
  }

  const data = stores.map((store) => {
    const rows = byStore[store.id] ?? [];
    const categories = rows
      .map((r) => {
        const cashbackIssued = parseFloat((r._sum.pointsAwarded ?? 0).toFixed(2));
        const purchaseVolume = parseFloat((r._sum.purchaseAmount ?? 0).toFixed(2));
        const ratio = purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0;
        return { category: String(r.category), cashbackIssued, purchaseVolume, ratio, status: classifyCashbackRatio(ratio) };
      })
      .filter((c) => c.purchaseVolume > 0);

    const cashbackIssued = parseFloat(categories.reduce((s, c) => s + c.cashbackIssued, 0).toFixed(2));
    const purchaseVolume = parseFloat(categories.reduce((s, c) => s + c.purchaseVolume, 0).toFixed(2));
    const ratio = purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0;

    return {
      storeId: store.id,
      storeName: store.name,
      cashbackIssued,
      purchaseVolume,
      ratio,
      status: classifyCashbackRatio(ratio),
      categories,
    };
  });

  res.json({ success: true, data });
}
