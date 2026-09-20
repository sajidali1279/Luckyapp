import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { excludeDeletedCustomers } from '../utils/accountDeletion';
import { storeDateKey, addStoreDays, startOfStoreDate, storeDaysBetween } from '../utils/storeTime';

// ─── Launch tracker ───────────────────────────────────────────────────────────
// How the launch is going: who signed up, who claimed the welcome reward, who has actually
// bought something. Counts start on the launch day (store calendar, Central), so anything
// created before it, such as test accounts from earlier months, never shows up here.

export const LAUNCH_DATE = process.env.LAUNCH_DATE || '2026-09-21';

const CHART_DAYS = 30;         // most days the daily chart shows
const STALLED_AFTER_DAYS = 2;  // signed up this many days ago and still no purchase

// 111 to 555 are not real area codes. Those numbers are the team's test accounts, so a test
// customer created during launch week does not inflate the numbers.
const TEST_PREFIXES = new Set(['111', '222', '333', '444', '555']);

export function isTestPhone(phone: string): boolean {
  let d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return TEST_PREFIXES.has(d.slice(0, 3));
}

export async function getLaunchStats(_req: AuthRequest, res: Response) {
  const now = new Date();
  const todayKey = storeDateKey(now);
  const launchStart = startOfStoreDate(LAUNCH_DATE);

  if (Number.isNaN(launchStart.getTime())) {
    return res.status(500).json({ success: false, error: 'LAUNCH_DATE is not a valid YYYY-MM-DD date' });
  }

  if (now < launchStart) {
    return res.json({
      success: true,
      data: { launchDate: LAUNCH_DATE, started: false, daysToLaunch: storeDaysBetween(todayKey, LAUNCH_DATE) },
    });
  }

  const rawCustomers = await prisma.user.findMany({
    where: { role: 'CUSTOMER', createdAt: { gte: launchStart }, ...excludeDeletedCustomers },
    select: { id: true, phone: true, createdAt: true },
  });
  const customers = rawCustomers.filter((c) => !isTestPhone(c.phone));
  const ids = customers.map((c) => c.id);

  const [claims, firstPurchases, stores] = await Promise.all([
    prisma.welcomeBonusClaim.findMany({
      where: { customerId: { in: ids } },
      select: { customerId: true, rewardType: true, confirmedAt: true, storeId: true },
    }),
    // Each customer's first approved purchase: which store, and when
    prisma.pointsTransaction.findMany({
      where: { customerId: { in: ids }, status: 'APPROVED', isTestData: false },
      orderBy: { createdAt: 'asc' },
      distinct: ['customerId'],
      select: { customerId: true, storeId: true, createdAt: true },
    }),
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, city: true }, orderBy: { name: 'asc' } }),
  ]);

  const purchasedIds = new Set(firstPurchases.map((p) => p.customerId));
  const claimedIds = new Set(claims.map((c) => c.customerId));
  const confirmedIds = new Set(claims.filter((c) => c.confirmedAt).map((c) => c.customerId));
  const stalled = customers.filter(
    (c) => !purchasedIds.has(c.id) && storeDaysBetween(storeDateKey(c.createdAt), todayKey) >= STALLED_AFTER_DAYS,
  ).length;

  // Daily series from launch (or the last CHART_DAYS days), zero-filled so a quiet day still shows
  const windowStart = addStoreDays(todayKey, -(CHART_DAYS - 1));
  const firstKey = LAUNCH_DATE > windowStart ? LAUNCH_DATE : windowStart;
  const byDay = new Map<string, { signups: number; firstPurchases: number }>();
  for (let k = firstKey; k <= todayKey; k = addStoreDays(k, 1)) byDay.set(k, { signups: 0, firstPurchases: 0 });
  for (const c of customers) { const r = byDay.get(storeDateKey(c.createdAt)); if (r) r.signups++; }
  for (const p of firstPurchases) { const r = byDay.get(storeDateKey(p.createdAt)); if (r) r.firstPurchases++; }
  const daily = [...byDay.entries()].map(([date, counts]) => ({ date, ...counts }));
  const today = byDay.get(todayKey) ?? { signups: 0, firstPurchases: 0 };

  // Which welcome reward people pick
  const rewardCounts = new Map<string, number>();
  for (const c of claims) rewardCounts.set(c.rewardType, (rewardCounts.get(c.rewardType) ?? 0) + 1);

  // Every active store, so a store where nobody has started shows up as a zero instead of vanishing
  const firstByStore = new Map<string, number>();
  for (const p of firstPurchases) firstByStore.set(p.storeId, (firstByStore.get(p.storeId) ?? 0) + 1);
  const confirmedByStore = new Map<string, number>();
  for (const c of claims) if (c.confirmedAt && c.storeId) confirmedByStore.set(c.storeId, (confirmedByStore.get(c.storeId) ?? 0) + 1);
  const storeRows = stores
    .map((s) => ({ id: s.id, name: s.name, city: s.city, firstPurchases: firstByStore.get(s.id) ?? 0, rewardsConfirmed: confirmedByStore.get(s.id) ?? 0 }))
    .sort((a, b) => b.firstPurchases - a.firstPurchases || b.rewardsConfirmed - a.rewardsConfirmed || a.name.localeCompare(b.name));

  res.json({
    success: true,
    data: {
      launchDate: LAUNCH_DATE,
      started: true,
      dayNumber: storeDaysBetween(LAUNCH_DATE, todayKey) + 1,
      totals: {
        signups: customers.length,
        claimed: claimedIds.size,
        confirmed: confirmedIds.size,
        purchased: purchasedIds.size,
        stalled,
      },
      today,
      daily,
      rewards: [...rewardCounts.entries()].map(([rewardType, count]) => ({ rewardType, count })).sort((a, b) => b.count - a.count),
      stores: storeRows,
      testAccountsLeftOut: rawCustomers.length - customers.length,
    },
  });
}
