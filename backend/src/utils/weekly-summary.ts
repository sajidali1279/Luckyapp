// A short email to HQ every Monday morning (Central) summarizing the past 7 days against the 7 days
// before that: transactions, purchase volume, cashback awarded, platform fee, and the week's busiest
// store. Reuses the exact "last 7 days vs the 7 days before, on the store calendar" definition already
// shared by the Dashboard and Analytics (utils/dashboardWindows.ts), so this number never disagrees with
// what those pages show.
//
// Idempotent the same way runMorningSummary is: it only ever considers running on a Monday, and an Activity
// Log entry for that Monday is the record, so a server asleep on Monday morning sends it at the first check
// afterward instead of skipping the week, and the hourly check never sends it twice in the same week.

import cron from 'node-cron';
import prisma from '../config/prisma';
import { audit } from './audit';
import { emailHQ } from './adminEmail';
import { STORE_TIMEZONE, storeDayStart, storeWeekday } from './storeTime';
import { compareWindows, summarize } from './dashboardWindows';

const HOUR_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: STORE_TIMEZONE, hour: 'numeric', hourCycle: 'h23' });

export type WeeklySummaryResult = 'sent' | 'not-monday' | 'not-yet' | 'already' | 'no-activity';

const pctChange = (now: number, prev: number): string => {
  if (prev === 0) return now === 0 ? 'no change' : 'new this week';
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return 'no change';
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}%`;
};

export async function runWeeklySummary(now: Date = new Date()): Promise<WeeklySummaryResult> {
  if (storeWeekday(now) !== 1) return 'not-monday'; // 0=Sunday..6=Saturday, so 1=Monday
  if (Number(HOUR_FORMAT.format(now)) < 8) return 'not-yet';

  const weekStart = storeDayStart(now);
  const done = await prisma.auditLog.findFirst({ where: { action: 'WEEKLY_SUMMARY', createdAt: { gte: weekStart } }, select: { id: true } });
  if (done) return 'already';

  const w = compareWindows('7d', now);
  const rows = await prisma.pointsTransaction.findMany({
    where: { status: 'APPROVED', isTestData: false, createdAt: { gte: w.previous.start, lte: w.current.end } },
    select: { createdAt: true, purchaseAmount: true, pointsAwarded: true, devCut: true, store: { select: { name: true } } },
  });

  const compare = summarize(w, rows);
  const currentRows = rows.filter((r) => r.createdAt >= w.current.start && r.createdAt <= w.current.end);
  const devCut = parseFloat(currentRows.reduce((s, r) => s + Number(r.devCut), 0).toFixed(2));

  const byStore = new Map<string, number>();
  for (const r of currentRows) byStore.set(r.store.name, (byStore.get(r.store.name) ?? 0) + Number(r.purchaseAmount));
  const busiest = [...byStore.entries()].sort((a, b) => b[1] - a[1])[0];

  if (compare.current.totals.transactions === 0) return 'no-activity';

  const dollars = (n: number) => `$${n.toFixed(2)}`;
  const lines = [
    `${compare.current.totals.transactions} transactions this week (${pctChange(compare.current.totals.transactions, compare.previous.totals.transactions)} from the week before), totaling ${dollars(compare.current.totals.purchaseVolume)} in purchases.`,
    `${dollars(compare.current.totals.cashbackIssued)} in cashback awarded (${pctChange(compare.current.totals.cashbackIssued, compare.previous.totals.cashbackIssued)}), ${dollars(devCut)} platform fee.`,
    `Average ticket ${dollars(compare.current.totals.avgTicket)}.`,
  ];
  if (busiest) lines.push(`Busiest store: ${busiest[0]} (${dollars(busiest[1])} in purchases this week).`);

  await emailHQ('Lucky Stop: last week in numbers', 'Here is how the past 7 days went:', lines, { path: '/analytics', label: 'Open Analytics' });
  audit({
    actorId: 'system', actorName: 'Weekly summary (automatic)', actorRole: 'DEV_ADMIN',
    action: 'WEEKLY_SUMMARY', entity: 'notification', entityId: null,
    details: { summary: lines.join(' '), ...compare.current.totals, devCut, busiestStore: busiest?.[0] ?? null },
  });
  return 'sent';
}

export function startWeeklySummaryCron() {
  cron.schedule('35 * * * *', () => {
    runWeeklySummary().catch((e) => console.error('[weekly-summary] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  setTimeout(() => {
    runWeeklySummary().catch((e) => console.error('[weekly-summary] start-up run failed:', e?.message ?? e));
  }, 155_000);
  console.log('[weekly-summary] Weekly summary email scheduled (checks every hour at :35 UTC, sends once a week after 8 am Central on Monday; also once after start-up)');
}
