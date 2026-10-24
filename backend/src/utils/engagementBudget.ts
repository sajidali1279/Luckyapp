// A chain-wide monthly points budget for an engagement gift or game (2026-10-24): HQ sets how many points a feature may pay in a store
// month, in total, and it is a hard cap. The check and the payout run in one transaction that holds a lock row in app_config (one row
// per feature), so two requests or two server copies at the same moment cannot both spend the last points. What a feature has spent is
// read from its engagement_events rows (their points are in dollars), so no second counter can drift out of step with the payouts.
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { storeMonthStart } from './storeTime';

type Tx = Prisma.TransactionClient;

const lockKey = (kind: string) => `ENGAGEMENT_BUDGET_LOCK:${kind}`;

/** Makes sure the feature's lock row exists. Call it once before the payouts (outside their transactions); safe to call any number of times. */
export async function ensureBudgetLock(kind: string): Promise<void> {
  try {
    await prisma.appConfig.upsert({ where: { key: lockKey(kind) }, create: { key: lockKey(kind), value: 'lock row for the monthly budget, no settings here' }, update: {} });
  } catch (e: any) {
    if (e?.code !== 'P2002') throw e;   // two copies created it at the same moment: it exists, which is all that matters
  }
}

/** Whole points paid this store month by the feature whose engagement_events kind is `kind`. */
export async function spentThisMonth(db: Tx | typeof prisma, kind: string, now: Date = new Date()): Promise<number> {
  const agg = await db.engagementEvent.aggregate({ where: { kind, createdAt: { gte: storeMonthStart(now) } }, _sum: { points: true } });
  return Math.round((agg._sum.points ?? 0) * 100);
}

/**
 * Inside prisma.$transaction, BEFORE writing the payout's engagement_events row: holds the feature's budget until the transaction ends and
 * returns how many of `want` points may be paid. allOrNothing (a gift of a set size): the whole amount or 0, never a strange part of it.
 */
export async function takeFromBudget(tx: Tx, kind: string, monthlyBudgetPts: number, want: number, now: Date = new Date(), allOrNothing = true): Promise<number> {
  if (want <= 0 || monthlyBudgetPts <= 0) return 0;
  const locked = await tx.$queryRaw<{ key: string }[]>`SELECT key FROM "app_config" WHERE key = ${lockKey(kind)} FOR UPDATE`;
  if (locked.length === 0) throw new Error(`The budget lock for ${kind} is missing: call ensureBudgetLock first`);   // never pay without the lock
  const left = monthlyBudgetPts - await spentThisMonth(tx, kind, now);
  if (left <= 0) return 0;
  return allOrNothing ? (want <= left ? want : 0) : Math.min(want, left);
}
