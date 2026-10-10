// Analytics insights (Dev Admin, 2026-10-08): customers and retention, promotions and challenges, the points economy, staff and
// quality, a busy-hours heatmap, a 7-day forecast and store scorecards. Each reads the same window as the Analytics page
// (?range=7d|30d|90d, or ?from=YYYY-MM-DD&to=YYYY-MM-DD) and an optional ?storeId. Sales are approved, real (not test) and not
// a challenge's reward line; every date is on the store calendar (Central).
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { addStoreDays, isRealDateKey, startOfStoreDate, storeDateKey, storeHour, storeWeekday } from '../utils/storeTime';
import { offerLift } from '../utils/offerLift';
import { excludeDeletedCustomers } from '../utils/accountDeletion';

const money = (n: number) => Math.round(n * 100) / 100;
const pct1 = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const change = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const SALE = { status: 'APPROVED' as const, isTestData: false, challengeId: null, referralId: null };
const DAY = 86_400_000;

export interface Window { start: Date; end: Date; prevStart: Date; prevEnd: Date; storeId?: string; days: number }

/** The page's window: a preset range (the last N store days including today) or a custom from/to; the previous window is the same length just before. */
export function parseWindow(q: Record<string, unknown>, now = new Date()): Window | { error: string } {
  const storeId = typeof q.storeId === 'string' && q.storeId ? q.storeId : undefined;
  const from = typeof q.from === 'string' ? q.from.slice(0, 10) : '';
  const to = typeof q.to === 'string' ? q.to.slice(0, 10) : '';
  let start: Date, end: Date;
  if (from || to) {
    if (!isRealDateKey(from) || !isRealDateKey(to)) return { error: '"from" and "to" must be real dates written YYYY-MM-DD' };
    start = startOfStoreDate(from); end = startOfStoreDate(addStoreDays(to, 1));   // up to the end of the 'to' day
    if (start >= end) return { error: '"from" must be before "to"' };
    if (end.getTime() - start.getTime() > 400 * DAY) return { error: 'Choose a range of 400 days or less' };
  } else {
    const range = typeof q.range === 'string' ? q.range : '30d';
    const n = range === '7d' ? 7 : range === '90d' ? 90 : range === '30d' ? 30 : 0;
    if (!n) return { error: '"range" must be 7d, 30d or 90d' };
    start = startOfStoreDate(addStoreDays(storeDateKey(now), -(n - 1)));
    end = now;
  }
  const len = end.getTime() - start.getTime();
  return { start, end, prevStart: new Date(start.getTime() - len), prevEnd: start, storeId, days: Math.max(1, Math.round(len / DAY)) };
}

function windowOr400(req: AuthRequest, res: Response): Window | null {
  const w = parseWindow(req.query as Record<string, unknown>);
  if ('error' in w) { res.status(400).json({ success: false, error: w.error }); return null; }
  return w;
}

const storeScope = (w: Window) => (w.storeId ? { storeId: w.storeId } : {});

// ─── Customers and retention ──────────────────────────────────────────────────────────────────────────────────────────

export async function getCustomerInsights(req: AuthRequest, res: Response) {
  const w = windowOr400(req, res); if (!w) return;
  const sales = await prisma.pointsTransaction.findMany({
    where: { ...SALE, ...storeScope(w), createdAt: { gte: w.prevStart, lt: w.end } },
    select: { customerId: true, createdAt: true },
  });
  const cur = sales.filter((s) => s.createdAt >= w.start), prev = sales.filter((s) => s.createdAt < w.start);
  const visits = new Map<string, number>();
  for (const s of cur) visits.set(s.customerId, (visits.get(s.customerId) ?? 0) + 1);
  const active = visits.size, prevActive = new Set(prev.map((s) => s.customerId)).size;
  const repeaters = [...visits.values()].filter((n) => n >= 2).length;

  // First purchase ever (in this store's scope) decides new vs returning
  const ids = [...visits.keys()];
  const firsts = ids.length ? await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { ...SALE, ...storeScope(w), customerId: { in: ids } }, _min: { createdAt: true } }) : [];
  const newCustomers = firsts.filter((f) => f._min.createdAt && f._min.createdAt >= w.start).length;

  // Cohorts: customers by the month of their first purchase (last 6 months), and the share who bought again in each later month
  const cohortStartKey = addStoreDays(storeDateKey(), -183);
  const cohortSales = await prisma.pointsTransaction.findMany({
    where: { ...SALE, ...storeScope(w), createdAt: { gte: startOfStoreDate(cohortStartKey.slice(0, 8) + '01') } },
    select: { customerId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const allFirsts = await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { ...SALE, ...storeScope(w) }, _min: { createdAt: true } });
  const firstMonth = new Map(allFirsts.filter((f) => f._min.createdAt).map((f) => [f.customerId, storeDateKey(f._min.createdAt!).slice(0, 7)]));
  const monthIdx = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  const thisMonth = monthIdx(storeDateKey().slice(0, 7));
  const cohortMap = new Map<string, { size: Set<string>; active: Map<number, Set<string>> }>();
  for (const [cid, m] of firstMonth) {
    if (thisMonth - monthIdx(m) > 5) continue;
    const c = cohortMap.get(m) ?? { size: new Set(), active: new Map() };
    c.size.add(cid); cohortMap.set(m, c);
  }
  for (const s of cohortSales) {
    const m0 = firstMonth.get(s.customerId); if (!m0) continue;
    const c = cohortMap.get(m0); if (!c) continue;
    const off = monthIdx(storeDateKey(s.createdAt).slice(0, 7)) - monthIdx(m0);
    if (off < 1) continue;
    const set = c.active.get(off) ?? new Set(); set.add(s.customerId); c.active.set(off, set);
  }
  const cohorts = [...cohortMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, c]) => ({
    month, size: c.size.size,
    retention: Array.from({ length: Math.max(0, thisMonth - monthIdx(month)) }, (_, i) => pct1(c.active.get(i + 1)?.size ?? 0, c.size.size)),
  }));

  // The win-back pool: customers who have bought but not in 30+ days
  const last = await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { ...SALE, ...storeScope(w) }, _max: { createdAt: true }, _count: { _all: true } });
  const now = Date.now();
  const lapsed = { d30: 0, d60: 0, d90: 0 };
  for (const l of last) {
    const age = (now - (l._max.createdAt?.getTime() ?? now)) / DAY;
    if (age >= 90) lapsed.d90++; else if (age >= 60) lapsed.d60++; else if (age >= 30) lapsed.d30++;
  }

  const [tiers, langs, signups] = await Promise.all([
    prisma.user.groupBy({ by: ['tier'], where: { role: 'CUSTOMER', ...excludeDeletedCustomers }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ['language'], where: { role: 'CUSTOMER', ...excludeDeletedCustomers }, _count: { _all: true } }),
    prisma.user.count({ where: { role: 'CUSTOMER', ...excludeDeletedCustomers, createdAt: { gte: w.start, lt: w.end } } }),
  ]);
  res.json({ success: true, data: {
    active, prevActive, activeChange: change(active, prevActive),
    newCustomers, returning: active - newCustomers, repeaters, repeatRate: pct1(repeaters, active), signups,
    cohorts, lapsed,
    tiers: tiers.map((t) => ({ tier: t.tier, count: t._count._all })),
    languages: [...langs.reduce((m, l) => m.set(l.language || 'en', (m.get(l.language || 'en') ?? 0) + l._count._all), new Map<string, number>())]   // not set yet is English
      .map(([language, count]) => ({ language, count })),
  } });
}

// ─── Promotions and challenges ───────────────────────────────────────────────────────────────────────────────────────

export async function getPromotionInsights(req: AuthRequest, res: Response) {
  const w = windowOr400(req, res); if (!w) return;
  const [rows, total] = await Promise.all([
    prisma.pointsTransaction.groupBy({
      by: ['offerId'], where: { ...SALE, ...storeScope(w), createdAt: { gte: w.start, lt: w.end }, offerId: { not: null } },
      _count: { _all: true }, _sum: { purchaseAmount: true, offerCashback: true },
    }),
    prisma.pointsTransaction.aggregate({ where: { ...SALE, ...storeScope(w), createdAt: { gte: w.start, lt: w.end } }, _sum: { purchaseAmount: true }, _count: true }),
  ]);
  const offers = await prisma.offer.findMany({ where: { id: { in: rows.map((r) => r.offerId!) } }, select: { id: true, title: true, category: true, storeId: true, startDate: true, endDate: true, isActive: true, updatedAt: true, store: { select: { name: true } } } });
  const byId = new Map(offers.map((o) => [o.id, o]));
  // Lift for the biggest ten (each is four small aggregates)
  const sorted = [...rows].sort((a, b) => (b._sum.offerCashback ?? 0) - (a._sum.offerCashback ?? 0));
  const list = [];
  for (const [i, r] of sorted.entries()) {
    const o = byId.get(r.offerId!); if (!o) continue;
    const extra = r._sum.offerCashback ?? 0;
    let lift = null;
    if (i < 10) {
      const now = new Date();
      let end = o.endDate < now ? o.endDate : now;
      if (!o.isActive && o.updatedAt < end) end = o.updatedAt;
      if (o.startDate < end) lift = (await offerLift({ storeId: o.storeId, category: o.category }, o.startDate, end, extra)).lift;
    }
    list.push({
      id: o.id, title: o.title, category: o.category, where: o.store?.name ?? 'All stores',
      sales: r._count._all, salesAmount: money(r._sum.purchaseAmount ?? 0), extraCashback: money(extra), lift,
    });
  }
  const promoAmount = rows.reduce((n, r) => n + (r._sum.purchaseAmount ?? 0), 0);

  const challenges = await prisma.challenge.findMany({
    where: { startDate: { lt: w.end }, endDate: { gte: w.start }, ...(w.storeId ? { OR: [{ storeId: w.storeId }, { storeId: null }] } : {}) },
    select: { id: true, title: true, kind: true, target: true, reward: true, startDate: true, endDate: true, store: { select: { name: true } } },
  });
  const ids = challenges.map((c) => c.id);
  const [prog, paid] = ids.length ? await Promise.all([
    prisma.challengeProgress.groupBy({ by: ['challengeId'], where: { challengeId: { in: ids } }, _count: { _all: true }, _sum: { timesEarned: true } }),
    prisma.pointsTransaction.groupBy({ by: ['challengeId'], where: { challengeId: { in: ids }, status: 'APPROVED', createdAt: { gte: w.start, lt: w.end } }, _sum: { pointsAwarded: true } }),
  ]) : [[], []];
  res.json({ success: true, data: {
    promotionSalesShare: pct1(promoAmount, total._sum.purchaseAmount ?? 0),
    extraCashback: money(rows.reduce((n, r) => n + (r._sum.offerCashback ?? 0), 0)),
    promotions: list,
    challenges: challenges.map((c) => {
      const g = prog.find((x) => x.challengeId === c.id);
      return { id: c.id, title: c.title, kind: c.kind, where: c.store?.name ?? 'All stores', participants: g?._count._all ?? 0,
        completions: g?._sum.timesEarned ?? 0, paid: money(paid.find((x) => x.challengeId === c.id)?._sum.pointsAwarded ?? 0) };
    }),
  } });
}

// ─── Points economy ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function getPointsInsights(req: AuthRequest, res: Response) {
  const w = windowOr400(req, res); if (!w) return;
  const at = { gte: w.start, lt: w.end };
  const [earnedRows, credits, catalog, balances] = await Promise.all([
    prisma.pointsTransaction.findMany({ where: { status: 'APPROVED', isTestData: false, ...storeScope(w), createdAt: at }, select: { createdAt: true, pointsAwarded: true } }),
    prisma.creditRedemption.findMany({ where: { ...storeScope(w), createdAt: at }, select: { createdAt: true, amount: true } }),
    prisma.catalogRedemption.findMany({ where: { ...storeScope(w), createdAt: at, status: 'COMPLETED' }, select: { createdAt: true, pointsSpent: true, catalogItemId: true, catalogItem: { select: { title: true } } } }),
    prisma.user.findMany({ where: { role: 'CUSTOMER', ...excludeDeletedCustomers }, select: { pointsBalance: true } }),
  ]);
  const days = new Map<string, { date: string; earned: number; redeemed: number }>();
  for (let k = storeDateKey(w.start), g = 0; k <= storeDateKey(new Date(w.end.getTime() - 1)) && g < 400; k = addStoreDays(k, 1), g++) days.set(k, { date: k, earned: 0, redeemed: 0 });
  const bump = (d: Date, f: 'earned' | 'redeemed', v: number) => { const r = days.get(storeDateKey(d)); if (r) r[f] += v; };
  for (const e of earnedRows) bump(e.createdAt, 'earned', e.pointsAwarded);
  for (const c of credits) bump(c.createdAt, 'redeemed', c.amount);
  for (const c of catalog) bump(c.createdAt, 'redeemed', c.pointsSpent / 100);
  const earned = earnedRows.reduce((n, e) => n + e.pointsAwarded, 0);
  const redeemed = credits.reduce((n, c) => n + c.amount, 0) + catalog.reduce((n, c) => n + c.pointsSpent / 100, 0);
  const top = new Map<string, { title: string; count: number; points: number }>();
  for (const c of catalog) { const r = top.get(c.catalogItemId) ?? { title: c.catalogItem?.title ?? 'Reward', count: 0, points: 0 }; r.count++; r.points += c.pointsSpent; top.set(c.catalogItemId, r); }
  const buckets = [
    { label: 'No points', min: 0, max: 0.0001 }, { label: 'Under 100 pts', min: 0.0001, max: 1 }, { label: '100 to 499 pts', min: 1, max: 5 },
    { label: '500 to 1,999 pts', min: 5, max: 20 }, { label: '2,000+ pts', min: 20, max: Infinity },
  ].map((b) => ({ label: b.label, customers: balances.filter((u) => u.pointsBalance >= b.min && u.pointsBalance < b.max).length }));
  res.json({ success: true, data: {
    earned: money(earned), redeemed: money(redeemed), redemptionRate: pct1(redeemed, earned),
    outstanding: money(balances.reduce((n, u) => n + u.pointsBalance, 0)),
    daily: [...days.values()].map((d) => ({ ...d, earned: money(d.earned), redeemed: money(d.redeemed) })),
    topRewards: [...top.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    balanceBuckets: buckets,
  } });
}

// ─── Staff and quality ───────────────────────────────────────────────────────────────────────────────────────────────

export async function getStaffInsights(req: AuthRequest, res: Response) {
  const w = windowOr400(req, res); if (!w) return;
  const at = { gte: w.start, lt: w.end };
  const [txs, ratings, disputes] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where: { isTestData: false, challengeId: null, referralId: null, ...storeScope(w), createdAt: at },
      select: { grantedById: true, customerId: true, status: true, purchaseAmount: true, fraudFlags: true, storeId: true },
    }),
    prisma.employeeRating.groupBy({ by: ['employeeId'], where: { ...storeScope(w), createdAt: at }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.pointsDispute.findMany({ where: { ...storeScope(w), createdAt: at }, select: { storeId: true, status: true, createdAt: true, updatedAt: true, store: { select: { name: true } } } }),
  ]);
  const byEmp = new Map<string, { total: number; approved: number; amount: number; flagged: number; rejected: number }>();
  for (const t of txs) {
    if (t.grantedById === t.customerId) continue;   // a self-claim, not a cashier's sale
    const r = byEmp.get(t.grantedById) ?? { total: 0, approved: 0, amount: 0, flagged: 0, rejected: 0 };
    r.total++;
    if (t.status === 'APPROVED') { r.approved++; r.amount += t.purchaseAmount; }
    if (t.fraudFlags) r.flagged++;
    if (t.status === 'REJECTED' || t.status === 'VOIDED') r.rejected++;
    byEmp.set(t.grantedById, r);
  }
  const people = await prisma.user.findMany({ where: { id: { in: [...byEmp.keys()] } }, select: { id: true, name: true, phone: true, storeRoles: { select: { store: { select: { name: true } } }, take: 1 } } });
  const name = new Map(people.map((p) => [p.id, { name: p.name || p.phone, store: p.storeRoles[0]?.store.name ?? '' }]));
  const rating = new Map(ratings.map((r) => [r.employeeId, { avg: r._avg.rating, count: r._count._all }]));
  const staff = [...byEmp.entries()].map(([id, r]) => ({
    id, name: name.get(id)?.name ?? 'Unknown', store: name.get(id)?.store ?? '',
    sales: r.approved, amount: money(r.amount), avgTicket: r.approved ? money(r.amount / r.approved) : 0,
    flaggedRate: pct1(r.flagged, r.total), rejectedRate: pct1(r.rejected, r.total),
    rating: rating.get(id)?.avg != null ? Math.round(rating.get(id)!.avg! * 10) / 10 : null, ratings: rating.get(id)?.count ?? 0,
  })).sort((a, b) => b.sales - a.sales);
  const ds = new Map<string, { store: string; opened: number; resolved: number; pending: number; hours: number[] }>();
  for (const d of disputes) {
    const r = ds.get(d.storeId) ?? { store: d.store?.name ?? '', opened: 0, resolved: 0, pending: 0, hours: [] };
    r.opened++;
    if (d.status === 'PENDING') r.pending++; else { r.resolved++; r.hours.push((d.updatedAt.getTime() - d.createdAt.getTime()) / 3_600_000); }
    ds.set(d.storeId, r);
  }
  res.json({ success: true, data: {
    staff,
    disputes: [...ds.values()].map((r) => ({ store: r.store, opened: r.opened, resolved: r.resolved, pending: r.pending,
      avgHoursToResolve: r.hours.length ? Math.round((r.hours.reduce((a, b) => a + b, 0) / r.hours.length) * 10) / 10 : null })),
  } });
}

// ─── Busy hours, forecast, scorecards ────────────────────────────────────────────────────────────────────────────────

export async function getHeatmap(req: AuthRequest, res: Response) {
  const w = windowOr400(req, res); if (!w) return;
  const rows = await prisma.pointsTransaction.findMany({ where: { ...SALE, ...storeScope(w), createdAt: { gte: w.start, lt: w.end } }, select: { createdAt: true, purchaseAmount: true } });
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sales: 0, amount: 0 })));
  for (const r of rows) { const c = grid[storeWeekday(r.createdAt)][storeHour(r.createdAt)]; c.sales++; c.amount += r.purchaseAmount; }
  res.json({ success: true, data: { grid: grid.map((day) => day.map((c) => ({ sales: c.sales, amount: money(c.amount) }))), total: rows.length } });
}

/** Next 7 store days from each weekday's last 8 weeks: a weighted mean (recent weeks count more) and a low-high band. */
export function forecastFrom(history: Map<string, { amount: number; sales: number; cashback: number }>, todayKey: string) {
  const out = [];
  for (let i = 1; i <= 7; i++) {
    const key = addStoreDays(todayKey, i);
    const same: { amount: number; sales: number; cashback: number; w: number }[] = [];
    for (let k = 1; k <= 8; k++) {
      const past = history.get(addStoreDays(key, -7 * k)) ?? { amount: 0, sales: 0, cashback: 0 };
      same.push({ ...past, w: 9 - k });
    }
    const wsum = same.reduce((n, s) => n + s.w, 0);
    const mean = (f: 'amount' | 'sales' | 'cashback') => same.reduce((n, s) => n + s[f] * s.w, 0) / wsum;
    const amounts = same.map((s) => s.amount).sort((a, b) => a - b);
    out.push({ date: key, weekday: storeWeekday(startOfStoreDate(key)), amount: money(mean('amount')), sales: Math.round(mean('sales')), cashback: money(mean('cashback')),
      low: money(amounts[1]), high: money(amounts[6]) });
  }
  return out;
}

export async function getForecast(req: AuthRequest, res: Response) {
  const storeId = typeof req.query.storeId === 'string' && req.query.storeId ? req.query.storeId : undefined;
  const todayKey = storeDateKey();
  const rows = await prisma.pointsTransaction.findMany({
    where: { ...SALE, ...(storeId ? { storeId } : {}), createdAt: { gte: startOfStoreDate(addStoreDays(todayKey, -56)), lt: startOfStoreDate(todayKey) } },
    select: { createdAt: true, purchaseAmount: true, pointsAwarded: true },
  });
  const history = new Map<string, { amount: number; sales: number; cashback: number }>();
  for (const r of rows) {
    const k = storeDateKey(r.createdAt); const h = history.get(k) ?? { amount: 0, sales: 0, cashback: 0 };
    h.amount += r.purchaseAmount; h.sales++; h.cashback += r.pointsAwarded; history.set(k, h);
  }
  res.json({ success: true, data: { days: forecastFrom(history, todayKey), basisDays: 56, enoughHistory: rows.length >= 50 } });
}

export async function getScorecards(req: AuthRequest, res: Response) {
  const now = new Date();
  const todayKey = storeDateKey(now);
  const start = startOfStoreDate(addStoreDays(todayKey, -29)), prevStart = startOfStoreDate(addStoreDays(todayKey, -59));
  const [stores, rows] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, city: true } }),
    prisma.pointsTransaction.findMany({ where: { isTestData: false, challengeId: null, referralId: null, createdAt: { gte: prevStart, lt: now } }, select: { storeId: true, customerId: true, status: true, purchaseAmount: true, pointsAwarded: true, fraudFlags: true, createdAt: true } }),
  ]);
  const cards = stores.map((st) => {
    const mine = rows.filter((r) => r.storeId === st.id);
    const cur = mine.filter((r) => r.createdAt >= start), prev = mine.filter((r) => r.createdAt < start);
    const ok = cur.filter((r) => r.status === 'APPROVED'), okPrev = prev.filter((r) => r.status === 'APPROVED');
    const amount = ok.reduce((n, r) => n + r.purchaseAmount, 0), prevAmount = okPrev.reduce((n, r) => n + r.purchaseAmount, 0);
    const visits = new Map<string, number>(); for (const r of ok) visits.set(r.customerId, (visits.get(r.customerId) ?? 0) + 1);
    return {
      id: st.id, name: st.name, city: st.city,
      sales: ok.length, amount: money(amount), growth: change(amount, prevAmount),
      customers: visits.size, repeatRate: pct1([...visits.values()].filter((n) => n >= 2).length, visits.size),
      avgTicket: ok.length ? money(amount / ok.length) : 0,
      cashbackShare: pct1(ok.reduce((n, r) => n + r.pointsAwarded, 0), amount),
      flaggedRate: pct1(cur.filter((r) => r.fraudFlags).length, cur.length),
    };
  }).sort((a, b) => b.amount - a.amount).map((c, i) => ({ ...c, rank: i + 1 }));
  const n = cards.length || 1;
  const avg = (f: 'amount' | 'repeatRate' | 'avgTicket' | 'cashbackShare' | 'flaggedRate') => money(cards.reduce((s, c) => s + c[f], 0) / n);
  res.json({ success: true, data: { cards, chain: { amount: avg('amount'), repeatRate: avg('repeatRate'), avgTicket: avg('avgTicket'), cashbackShare: avg('cashbackShare'), flaggedRate: avg('flaggedRate') } } });
}
