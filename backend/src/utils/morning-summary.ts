// One short email to HQ each morning (Central time) with what is waiting: sales held for review, missing-points reports, store alerts, requests and
// unpaid bills. It does not depend on the server being awake at one moment: it runs every hour and once after start-up, and sends at most one per
// store day (the Activity Log entry it writes is the record), so the first run after 8 am sends it even if the server was asleep at 8:00.

import cron from 'node-cron';
import prisma from '../config/prisma';
import { audit } from './audit';
import { emailHQ } from './adminEmail';
import { STORE_TIMEZONE, storeDayStart } from './storeTime';

const HOUR_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: STORE_TIMEZONE, hour: 'numeric', hourCycle: 'h23' });

export type SummaryResult = 'sent' | 'not-yet' | 'already' | 'nothing-waiting';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => Math.round(n).toLocaleString('en-US');

export interface YesterdayReport {
  totals: { sales: number; purchases: number; points: number; hotFood: number; hotFoodCancelled: number };
  rows: { store: string; sales: number; purchases: number; points: number; hotFood: number }[];
  unusual: string[];
}

/**
 * Yesterday by store (2026-10-16): real sales (no reward lines, no test data), what was bought, the points they gave, hot food orders,
 * and what looks off: a store with no sales when it had several the same day last week, sales well down on last week, hot food orders
 * that were cancelled, receipt scans waiting. Each part fails on its own without stopping the email.
 */
export async function yesterdayReport(now: Date = new Date()): Promise<YesterdayReport> {
  const end = storeDayStart(now);
  const start = new Date(end.getTime() - 24 * 3600_000);
  const lastWeekStart = new Date(start.getTime() - 7 * 24 * 3600_000), lastWeekEnd = new Date(end.getTime() - 7 * 24 * 3600_000);
  const real = { status: 'APPROVED' as const, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gt: 0 } };
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [stores, sales, lastWeek, hot, heldScans] = await Promise.all([
    safe(prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, hotFoodEnabled: true }, orderBy: { name: 'asc' } }), [] as { id: string; name: string; hotFoodEnabled: boolean }[]),
    safe(prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...real, createdAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true } }), [] as any[]),
    safe(prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...real, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } }, _count: { _all: true } }), [] as any[]),
    safe(prisma.hotFoodOrder.groupBy({ by: ['storeId', 'status'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true } }), [] as any[]),
    safe(prisma.receiptScan.count({ where: { status: 'HELD' } }), 0),
  ]);
  const s = new Map(sales.map((r: any) => [r.storeId, r]));
  const lw = new Map(lastWeek.map((r: any) => [r.storeId, r._count._all as number]));
  const hotBy = (id: string, cancelled?: boolean) => hot.filter((h: any) => h.storeId === id && (cancelled === undefined || (h.status === 'CANCELLED') === cancelled)).reduce((n: number, h: any) => n + h._count._all, 0);
  const rows = stores.map((st) => {
    const r: any = s.get(st.id);
    return { store: st.name, sales: r?._count?._all ?? 0, purchases: r?._sum?.purchaseAmount ?? 0, points: ((r?._sum?.pointsAwarded ?? 0) + (r?._sum?.gasBonusPoints ?? 0)) * 100, hotFood: hotBy(st.id, false) };
  });
  const unusual: string[] = [];
  for (const st of stores) {
    const now1 = (s.get(st.id) as any)?._count?._all ?? 0, before = lw.get(st.id) ?? 0;
    if (now1 === 0 && before >= 5) unusual.push(`${st.name} had no sales yesterday (${before} the same day last week). Check the scanner or who was on shift.`);
    else if (before >= 10 && now1 <= before * 0.4) unusual.push(`${st.name} had ${now1} sales yesterday, down from ${before} the same day last week.`);
    const cancelled = hotBy(st.id, true);
    if (cancelled >= 3) unusual.push(`${st.name} had ${cancelled} hot food orders cancelled yesterday.`);
  }
  if (heldScans > 0) unusual.push(`${heldScans} customer receipt scan${heldScans === 1 ? ' is' : 's are'} waiting for a decision (Transactions).`);
  const sum = (f: (r: typeof rows[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  return {
    totals: { sales: sum((r) => r.sales), purchases: sum((r) => r.purchases), points: sum((r) => r.points), hotFood: sum((r) => r.hotFood), hotFoodCancelled: stores.reduce((n, st) => n + hotBy(st.id, true), 0) },
    rows: rows.filter((r) => r.sales > 0 || r.hotFood > 0 || stores.length <= 15),
    unusual,
  };
}

export async function runMorningSummary(now: Date = new Date()): Promise<SummaryResult> {
  if (Number(HOUR_FORMAT.format(now)) < 8) return 'not-yet';
  const dayStart = storeDayStart(now);
  const done = await prisma.auditLog.findFirst({ where: { action: 'MORNING_SUMMARY', createdAt: { gte: dayStart } }, select: { id: true } });
  if (done) return 'already';

  const count = (p: Promise<number>) => p.catch(() => 0);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [flagged, staleFlagged, disputes, alerts, urgentAlerts, stock, shifts, products, unpaid, offerRequests] = await Promise.all([
    count(prisma.pointsTransaction.count({ where: { status: 'FLAGGED' } })),
    // Waited over a day for a decision: worth a more pointed line than "some are flagged", the same idea as a
    // stale flagged sale getting its own nudge rather than blending into the daily count.
    count(prisma.pointsTransaction.count({ where: { status: 'FLAGGED', createdAt: { lt: oneDayAgo } } })),
    count(prisma.pointsDispute.count({ where: { status: 'PENDING' } })),
    count(prisma.storeRequest.count({ where: { status: 'PENDING' } })),
    count(prisma.storeRequest.count({ where: { status: 'PENDING', priority: 'HIGH' } })),
    count(prisma.employeeItemRequest.count({ where: { status: 'PENDING' } })),
    count(prisma.shiftRequest.count({ where: { status: 'PENDING' } })),
    count(prisma.productRequest.count({ where: { status: 'PENDING', expiresAt: { gte: now } } })),
    count(prisma.billingRecord.count({ where: { isPaid: false } })),
    count(prisma.offerRequest.count({ where: { status: 'PENDING' } })),
  ]);

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const lines: string[] = [];
  if (flagged) lines.push(`${plural(flagged, 'sale is', 'sales are')} held for review${staleFlagged ? ` (${staleFlagged} waiting over a day)` : ''}.`);
  if (disputes) lines.push(`${plural(disputes, 'missing-points report is', 'missing-points reports are')} waiting.`);
  if (alerts) lines.push(`${plural(alerts, 'store alert is', 'store alerts are')} open${urgentAlerts ? ` (${urgentAlerts} high priority)` : ''}.`);
  if (stock) lines.push(`${plural(stock, 'stock request is', 'stock requests are')} waiting.`);
  if (products) lines.push(`${plural(products, 'product request is', 'product requests are')} waiting.`);
  if (shifts) lines.push(`${plural(shifts, 'schedule request is', 'schedule requests are')} waiting.`);
  if (unpaid) lines.push(`${plural(unpaid, 'bill is', 'bills are')} unpaid.`);
  if (offerRequests) lines.push(`${plural(offerRequests, 'promotion request from a manager is', 'promotion requests from managers are')} waiting (Offers).`);
  // Yesterday's numbers by store and what looks off (2026-10-16)
  const y = await yesterdayReport(now).catch(() => null);
  const busy = !!y && (y.totals.sales > 0 || y.totals.hotFood > 0);
  if (lines.length === 0 && !busy && !(y?.unusual.length)) return 'nothing-waiting';

  const t = y?.totals;
  const extras = y ? {
    sections: [
      { title: 'Yesterday', lines: busy ? [`${whole(t!.sales)} sales, ${money(t!.purchases)} bought, ${whole(t!.points)} points given${t!.hotFood ? `, ${whole(t!.hotFood)} hot food orders${t!.hotFoodCancelled ? ` (${t!.hotFoodCancelled} cancelled)` : ''}` : ''}.`] : ['No sales were recorded yesterday.'] },
      { title: 'Worth a look', lines: y.unusual, tone: 'warning' as const },
    ],
    table: busy ? {
      title: 'By store', head: ['Store', 'Sales', 'Bought', 'Points', 'Hot food'],
      rows: y.rows.map((r) => [r.store, r.sales, money(r.purchases), whole(r.points), r.hotFood]),
      foot: ['All stores', t!.sales, money(t!.purchases), whole(t!.points), t!.hotFood],
    } : undefined,
  } : undefined;
  const waiting = lines.length ? lines : ['Nothing is waiting for a decision.'];
  await emailHQ(lines.length ? 'Lucky Stop: yesterday, and what is waiting' : 'Lucky Stop: yesterday at the stores', 'Good morning. This is what is waiting:', waiting, { path: '/', label: 'Open the dashboard' }, 'MORNING_SUMMARY', extras);
  audit({
    actorId: 'system', actorName: 'Morning summary (automatic)', actorRole: 'DEV_ADMIN',
    action: 'MORNING_SUMMARY', entity: 'notification', entityId: null,
    details: { summary: [...lines, ...(y?.unusual ?? [])].join(' ') || 'Yesterday only', flagged, staleFlagged, disputes, alerts, urgentAlerts, stock, shifts, products, unpaid, offerRequests, yesterday: t ?? null },
  });
  return 'sent';
}

export function startMorningSummaryCron() {
  cron.schedule('25 * * * *', () => {
    runMorningSummary().catch((e) => console.error('[morning-summary] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  setTimeout(() => {
    runMorningSummary().catch((e) => console.error('[morning-summary] start-up run failed:', e?.message ?? e));
  }, 150_000);
  console.log('[morning-summary] Morning summary email scheduled (checks every hour at :25 UTC, sends once a day after 8 am Central; also once after start-up)');
}
