// Comparison windows for the admin dashboard: "this period" against "the same stretch of the previous
// period", both measured on the store (Central) calendar and both ending at the same point in their
// period, so a half-finished day is compared with the first half of the day it is being compared to.
//
//   today  : today so far, against the same weekday last week up to the same time of day (hourly buckets)
//   7d/30d : the last N store days including today so far, against the N days before (daily buckets)
//   month  : the month so far, against the previous month up to the same elapsed time (daily buckets)
import {
  addStoreDays, startOfStoreDate, storeDateKey, storeDayOfMonth, storeDaysBetween, storeHour,
  storeMonthStart, storePrevMonthStart,
} from './storeTime';

export type CompareRange = 'today' | '7d' | '30d' | '90d' | 'month';
export const COMPARE_RANGES: CompareRange[] = ['today', '7d', '30d', '90d', 'month'];

export interface Row { createdAt: Date; purchaseAmount: number; pointsAwarded: number }
export interface Totals { transactions: number; purchaseVolume: number; cashbackIssued: number; avgTicket: number }
export interface Bucket { key: string; transactions: number; purchaseVolume: number; cashbackIssued: number }

interface Span { start: Date; end: Date; startKey: string; keys: string[] }

export interface CompareWindows {
  range: CompareRange;
  granularity: 'hour' | 'day';
  nowIndex: number;
  current: Span;
  previous: Span;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i));
const dayKeys = (startKey: string, n: number) => Array.from({ length: n }, (_, i) => addStoreDays(startKey, i));

export function compareWindows(range: CompareRange, now: Date = new Date()): CompareWindows {
  const todayKey = storeDateKey(now);

  if (range === 'today') {
    const cs = startOfStoreDate(todayKey);
    const prevKey = addStoreDays(todayKey, -7);
    const ps = startOfStoreDate(prevKey);
    const elapsed = now.getTime() - cs.getTime();
    return {
      range, granularity: 'hour', nowIndex: storeHour(now),
      current: { start: cs, end: now, startKey: todayKey, keys: HOURS },
      previous: { start: ps, end: new Date(ps.getTime() + elapsed), startKey: prevKey, keys: HOURS },
    };
  }

  if (range === '7d' || range === '30d' || range === '90d') {
    const n = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const csKey = addStoreDays(todayKey, -(n - 1));
    const psKey = addStoreDays(csKey, -n);
    const cs = startOfStoreDate(csKey);
    const ps = startOfStoreDate(psKey);
    const elapsed = now.getTime() - cs.getTime();
    return {
      range, granularity: 'day', nowIndex: n - 1,
      current: { start: cs, end: now, startKey: csKey, keys: dayKeys(csKey, n) },
      previous: { start: ps, end: new Date(ps.getTime() + elapsed), startKey: psKey, keys: dayKeys(psKey, n) },
    };
  }

  // month so far against the previous month, day of month against day of month
  const cs = storeMonthStart(now);
  const ps = storePrevMonthStart(now);
  const csKey = storeDateKey(cs);
  const psKey = storeDateKey(ps);
  const n = storeDayOfMonth(now);
  const prevMonthDays = storeDaysBetween(psKey, csKey);
  const elapsed = now.getTime() - cs.getTime();
  const prevEnd = new Date(Math.min(ps.getTime() + elapsed, cs.getTime() - 1));
  return {
    range, granularity: 'day', nowIndex: n - 1,
    current: { start: cs, end: now, startKey: csKey, keys: dayKeys(csKey, n) },
    previous: { start: ps, end: prevEnd, startKey: psKey, keys: dayKeys(psKey, Math.min(n, prevMonthDays)) },
  };
}

function bucketIndex(w: CompareWindows, span: Span, at: Date): number {
  return w.granularity === 'hour' ? storeHour(at) : storeDaysBetween(span.startKey, storeDateKey(at));
}

function summarizeSpan(w: CompareWindows, span: Span, rows: Row[]): { totals: Totals; series: Bucket[] } {
  const series: Bucket[] = span.keys.map((key) => ({ key, transactions: 0, purchaseVolume: 0, cashbackIssued: 0 }));
  let tx = 0, vol = 0, cash = 0;
  for (const r of rows) {
    const t = r.createdAt.getTime();
    if (t < span.start.getTime() || t > span.end.getTime()) continue;
    tx++; vol += r.purchaseAmount; cash += r.pointsAwarded;
    const b = series[bucketIndex(w, span, r.createdAt)];
    if (b) { b.transactions++; b.purchaseVolume += r.purchaseAmount; b.cashbackIssued += r.pointsAwarded; }
  }
  const round = (n: number) => parseFloat(n.toFixed(2));
  return {
    totals: { transactions: tx, purchaseVolume: round(vol), cashbackIssued: round(cash), avgTicket: tx > 0 ? round(vol / tx) : 0 },
    series: series.map((b) => ({ ...b, purchaseVolume: round(b.purchaseVolume), cashbackIssued: round(b.cashbackIssued) })),
  };
}

export function summarize(w: CompareWindows, rows: Row[]) {
  return {
    current: { start: w.current.start.toISOString(), end: w.current.end.toISOString(), ...summarizeSpan(w, w.current, rows) },
    previous: { start: w.previous.start.toISOString(), end: w.previous.end.toISOString(), ...summarizeSpan(w, w.previous, rows) },
  };
}
