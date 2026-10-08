// Inventory Intelligence, more (2026-10-08): how fast the order list turns into stock on the shelf, what customers and staff ask
// for, and what rewards and hot food people actually take. Same filters as GET /inventory/analytics (?storeId, ?period=7|30|90|all)
// and the same scope: a store manager sees their own stores only, HQ sees every store or one.
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { barcodeKey } from '../utils/barcode';
import { storeHour, storeWeekday } from '../utils/storeTime';

const money = (n: number) => Math.round(n * 100) / 100;
const pct1 = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const HOUR = 3_600_000;

/** Middle value (hours, one decimal), null when there is nothing to measure. */
export function medianHours(ms: number[]): number | null {
  if (!ms.length) return null;
  const s = [...ms].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round((v / HOUR) * 10) / 10;
}

/** The same product typed two ways ("Takis Fuego", "takis  fuego ") counts once. */
export function itemKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Scope { storeIds: string[] | undefined; since: Date | undefined; period: string }

/** The stores this person may see (undefined = every store) and the window start; null when it has already answered. */
async function scope(req: AuthRequest, res: Response, empty: unknown): Promise<Scope | null> {
  const { storeId, period = '30' } = req.query as { storeId?: string; period?: string };
  if (!['7', '30', '90', 'all'].includes(period)) { res.status(400).json({ success: false, error: 'period must be 7, 30, 90 or all' }); return null; }
  const since = period === 'all' ? undefined : new Date(Date.now() - Number(period) * 24 * HOUR);
  const user = req.user!;
  if (user.role === 'DEV_ADMIN' || user.role === 'SUPER_ADMIN') return { storeIds: storeId ? [storeId] : undefined, since, period };
  const mine = (await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((r) => r.storeId);
  if (!mine.length) { res.json({ success: true, data: empty }); return null; }
  if (storeId && !mine.includes(storeId)) { res.status(403).json({ success: false, error: 'Access denied' }); return null; }
  return { storeIds: storeId ? [storeId] : mine, since, period };
}

const inStores = (s: Scope) => (s.storeIds ? { storeId: { in: s.storeIds } } : {});
const after = (s: Scope) => (s.since ? { createdAt: { gte: s.since } } : {});

// ─── Restock speed and fill rate ─────────────────────────────────────────────────────────────────────────────────────

const EMPTY_RESTOCK = { added: 0, received: 0, ordered: 0, pending: 0, removed: 0, fillRate: 0, hoursToOrder: null, hoursToReceive: null, hoursTotal: null, urgentHoursTotal: null, byStore: [], byCategory: [], stuck: [] };

export async function getRestockInsights(req: AuthRequest, res: Response) {
  const s = await scope(req, res, EMPTY_RESTOCK); if (!s) return;
  const items = await prisma.orderListItem.findMany({
    where: { ...after(s), ...(s.storeIds ? { list: { storeId: { in: s.storeIds } } } : {}) },
    select: { id: true, name: true, category: true, status: true, priority: true, createdAt: true, orderedAt: true, receivedAt: true, list: { select: { storeId: true, store: { select: { name: true } } } } },
  });
  const live = items.filter((i) => i.status !== 'REMOVED');
  const count = (st: string) => items.filter((i) => i.status === st).length;
  const toOrder = (xs: typeof items) => xs.filter((i) => i.orderedAt).map((i) => i.orderedAt!.getTime() - i.createdAt.getTime());
  const toReceive = (xs: typeof items) => xs.filter((i) => i.orderedAt && i.receivedAt).map((i) => i.receivedAt!.getTime() - i.orderedAt!.getTime());
  const total = (xs: typeof items) => xs.filter((i) => i.receivedAt).map((i) => i.receivedAt!.getTime() - i.createdAt.getTime());

  const group = <K extends string>(key: (i: (typeof items)[number]) => K) => {
    const m = new Map<K, typeof items>();
    for (const i of live) { const k = key(i); m.set(k, [...(m.get(k) ?? []), i]); }
    return m;
  };
  const byStore = [...group((i) => i.list.storeId).entries()].map(([, xs]) => ({
    store: xs[0].list.store.name, added: xs.length, received: xs.filter((i) => i.status === 'RECEIVED').length,
    fillRate: pct1(xs.filter((i) => i.status === 'RECEIVED').length, xs.length), hoursTotal: medianHours(total(xs)),
  })).sort((a, b) => b.added - a.added);
  const byCategory = [...group((i) => i.category || 'Uncategorized').entries()].map(([category, xs]) => ({
    category, added: xs.length, fillRate: pct1(xs.filter((i) => i.status === 'RECEIVED').length, xs.length), hoursTotal: medianHours(total(xs)),
  })).sort((a, b) => (b.hoursTotal ?? -1) - (a.hoursTotal ?? -1)).slice(0, 12);

  // Stuck: ordered 5+ days ago and not in, or urgent and not even ordered after 2 days
  const now = Date.now();
  const stuck = live.filter((i) => (i.status === 'ORDERED' && i.orderedAt && now - i.orderedAt.getTime() > 5 * 24 * HOUR)
    || (i.status === 'PENDING' && i.priority === 'URGENT' && now - i.createdAt.getTime() > 2 * 24 * HOUR))
    .map((i) => ({ id: i.id, name: i.name, store: i.list.store.name, status: i.status, priority: i.priority,
      days: Math.floor((now - (i.orderedAt ?? i.createdAt).getTime()) / (24 * HOUR)) }))
    .sort((a, b) => b.days - a.days).slice(0, 15);

  res.json({ success: true, data: {
    added: live.length, received: count('RECEIVED'), ordered: count('ORDERED'), pending: count('PENDING'), removed: count('REMOVED'),
    fillRate: pct1(count('RECEIVED'), live.length),
    hoursToOrder: medianHours(toOrder(live)), hoursToReceive: medianHours(toReceive(live)), hoursTotal: medianHours(total(live)),
    urgentHoursTotal: medianHours(total(live.filter((i) => i.priority === 'URGENT'))),
    byStore, byCategory, stuck,
  } });
}

// ─── What people ask for ─────────────────────────────────────────────────────────────────────────────────────────────

const EMPTY_DEMAND = { asked: [], rejectionReasons: [], customerRequests: 0, staffLines: 0, notInCatalog: [] };

export async function getDemandInsights(req: AuthRequest, res: Response) {
  const s = await scope(req, res, EMPTY_DEMAND); if (!s) return;
  const [customer, staff, open] = await Promise.all([
    prisma.productRequest.findMany({ where: { ...inStores(s), ...after(s) }, select: { productName: true, category: true, customerId: true, status: true, createdAt: true } }),
    prisma.employeeRequestLine.findMany({ where: { request: { ...inStores(s), ...after(s) } }, select: { name: true, category: true, status: true, rejectionReason: true, request: { select: { createdAt: true } } } }),
    prisma.orderListItem.findMany({ where: { status: { in: ['PENDING', 'ORDERED'] }, list: { status: 'OPEN', ...inStores(s) } }, select: { name: true } }),
  ]);
  const onList = new Set(open.map((o) => itemKey(o.name)));
  const asked = new Map<string, { name: string; category: string | null; customers: Set<string>; customerAsks: number; staffAsks: number; accepted: number; rejected: number; last: Date }>();
  const row = (name: string, category: string | null, at: Date) => {
    const k = itemKey(name);
    const r = asked.get(k) ?? { name: name.trim(), category, customers: new Set<string>(), customerAsks: 0, staffAsks: 0, accepted: 0, rejected: 0, last: at };
    if (at > r.last) r.last = at;
    r.category = r.category ?? category;
    asked.set(k, r); return r;
  };
  for (const c of customer) {
    const r = row(c.productName, c.category, c.createdAt); r.customerAsks++; r.customers.add(c.customerId);
    if (c.status === 'ACCEPTED') r.accepted++; if (c.status === 'DECLINED') r.rejected++;
  }
  for (const l of staff) {
    const r = row(l.name, l.category, l.request.createdAt); r.staffAsks++;
    if (l.status === 'ACCEPTED') r.accepted++; if (l.status === 'REJECTED') r.rejected++;
  }
  const reasons = new Map<string, number>();
  for (const l of staff) if (l.status === 'REJECTED') reasons.set(l.rejectionReason ?? 'OTHER', (reasons.get(l.rejectionReason ?? 'OTHER') ?? 0) + 1);

  // Scanned at the counter but not in the Labels catalog: products people buy that HQ has no label or price for (chain-wide)
  const [scanned, labelled] = await Promise.all([
    prisma.scannedProduct.findMany({ where: s.since ? { lastScannedAt: { gte: s.since } } : {}, orderBy: { scanCount: 'desc' }, take: 300, select: { barcode: true, name: true, category: true, scanCount: true, lastScannedAt: true } }),
    prisma.label.findMany({ where: { barcode: { not: null } }, select: { barcode: true } }),
  ]);
  const known = new Set(labelled.map((l) => barcodeKey(l.barcode!)));
  const notInCatalog = scanned.filter((p) => !known.has(barcodeKey(p.barcode))).slice(0, 20);

  res.json({ success: true, data: {
    customerRequests: customer.length, staffLines: staff.length,
    asked: [...asked.entries()].map(([k, r]) => ({
      name: r.name, category: r.category, customers: r.customers.size, customerAsks: r.customerAsks, staffAsks: r.staffAsks,
      total: r.customerAsks + r.staffAsks, accepted: r.accepted, rejected: r.rejected, lastAskedAt: r.last, onOrderList: onList.has(k),
    })).sort((a, b) => b.total - a.total || b.customers - a.customers).slice(0, 25),
    rejectionReasons: [...reasons.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count),
    notInCatalog,
  } });
}

// ─── Rewards and hot food ────────────────────────────────────────────────────────────────────────────────────────────

const EMPTY_RHF = { rewards: { redeemed: 0, points: 0, cancelled: 0, expired: 0, top: [] }, hotFood: { orders: 0, completed: 0, cancelled: 0, revenue: 0, avgTicket: 0, avgPromisedMinutes: null, cancelledBy: [], cancelReasons: [], topItems: [], byHour: [], byWeekday: [] } };

export async function getRewardsHotFoodInsights(req: AuthRequest, res: Response) {
  const s = await scope(req, res, EMPTY_RHF); if (!s) return;
  const [reds, orders] = await Promise.all([
    prisma.catalogRedemption.findMany({ where: { ...inStores(s), ...after(s) }, select: { status: true, pointsSpent: true, catalogItemId: true, catalogItem: { select: { title: true, emoji: true } } } }),
    prisma.hotFoodOrder.findMany({ where: { ...inStores(s), ...after(s) }, select: { status: true, totalAmount: true, estimatedMinutes: true, cancelledBy: true, cancelReason: true, createdAt: true, items: { select: { name: true, price: true, quantity: true } } } }),
  ]);
  const done = reds.filter((r) => r.status === 'COMPLETED');
  const top = new Map<string, { title: string; emoji: string; redeemed: number; points: number; notCompleted: number }>();
  for (const r of reds) {
    const t = top.get(r.catalogItemId) ?? { title: r.catalogItem?.title ?? 'Reward', emoji: r.catalogItem?.emoji ?? '', redeemed: 0, points: 0, notCompleted: 0 };
    if (r.status === 'COMPLETED') { t.redeemed++; t.points += r.pointsSpent; } else if (r.status === 'EXPIRED' || r.status === 'CANCELLED') t.notCompleted++;
    top.set(r.catalogItemId, t);
  }

  const completed = orders.filter((o) => o.status === 'COMPLETED');
  const cancelled = orders.filter((o) => o.status === 'CANCELLED');
  const tally = (xs: (string | null)[]) => {
    const m = new Map<string, number>(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };
  const items = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const o of completed) for (const i of o.items) {
    const k = itemKey(i.name); const r = items.get(k) ?? { name: i.name, quantity: 0, revenue: 0 };
    r.quantity += i.quantity; r.revenue += i.price * i.quantity; items.set(k, r);
  }
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, orders: 0 }));
  for (const o of orders) { byHour[storeHour(o.createdAt)].orders++; byWeekday[storeWeekday(o.createdAt)].orders++; }
  const promised = orders.map((o) => o.estimatedMinutes).filter((m): m is number => m != null);
  const revenue = completed.reduce((n, o) => n + o.totalAmount, 0);

  res.json({ success: true, data: {
    rewards: {
      redeemed: done.length, points: done.reduce((n, r) => n + r.pointsSpent, 0),
      cancelled: reds.filter((r) => r.status === 'CANCELLED').length, expired: reds.filter((r) => r.status === 'EXPIRED').length,
      top: [...top.values()].sort((a, b) => b.redeemed - a.redeemed).slice(0, 10),
    },
    hotFood: {
      orders: orders.length, completed: completed.length, cancelled: cancelled.length, cancelRate: pct1(cancelled.length, orders.length),
      revenue: money(revenue), avgTicket: completed.length ? money(revenue / completed.length) : 0,
      avgPromisedMinutes: promised.length ? Math.round(promised.reduce((a, b) => a + b, 0) / promised.length) : null,
      cancelledBy: tally(cancelled.map((o) => o.cancelledBy ?? 'STORE')), cancelReasons: tally(cancelled.map((o) => o.cancelReason)).slice(0, 6),
      topItems: [...items.values()].map((i) => ({ ...i, revenue: money(i.revenue) })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      byHour, byWeekday,
    },
  } });
}
