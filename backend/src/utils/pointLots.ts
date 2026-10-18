// Points expiry, kept as batches (2026-10-17).
//
// Every credit to a customer's balance is a batch (point_lots) with its own date. Spending takes the oldest batches first (first in, first
// out), and records which batches it took (point_lot_uses), so a refund puts the points back where they came from. A batch expires HQ's
// days after its date, or after the day HQ switched expiry on if that is later (Settings > Rewards & offers > Points expiry). Example:
// 30 points on day 0 and 40 on day 10, 35 spent on day 20: the 30 are all used and 5 of the 40, so on day 90 nothing expires and on day 100
// the last 35 do.
//
// Taking points away is handled with care:
//  - nothing expires while HQ has expiry switched off, and every clock starts no earlier than the day it was switched on;
//  - a customer whose batches do not add up to their balance is skipped and reported, never charged;
//  - expiry never takes more than the balance, never takes a balance below zero, and runs inside the customer's lock;
//  - every expiry is in the Activity Log and in the customer's History, and HQ can give a customer's expired points back (undoExpiry).
//
// Amounts are dollars of credit, like users.pointsBalance (100 points = $1). The balance is the sum of what is left in the batches. A
// balance below zero (a voided sale the customer had already spent) has no batches left, and the next credit pays it back first.
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { pointsExpiry, type ExpiryConfig } from './appSettings';
import { lockCustomer } from './moneyGuards';
import { audit } from './audit';
import { sendPushToUser } from './push';

type Db = Prisma.TransactionClient | typeof prisma;
const DAY = 86_400_000;
const c2 = (v: number) => Math.round(v * 100) / 100;
const pts = (dollars: number) => Math.round(dollars * 100);

export type LotSource = 'SALE' | 'RECEIPT_QR' | 'CHALLENGE' | 'REFERRAL' | 'WINBACK' | 'GOODWILL' | 'DISPUTE' | 'RESTORED' | 'OPENING' | 'TEST';
export type UseRef = 'CREDIT_REDEMPTION' | 'CATALOG' | 'HOT_FOOD' | 'VOID';

/** When a batch earned at `earnedAt` expires, or null while expiry is off. */
export function lotExpiresAt(earnedAt: Date, cfg: ExpiryConfig = pointsExpiry()): Date | null {
  if (!cfg.enabled || !cfg.startedAt) return null;
  return new Date(Math.max(earnedAt.getTime(), Date.parse(cfg.startedAt)) + cfg.days * DAY);
}

/**
 * Points coming in: a batch dated now. Call it after the balance went up, in the same transaction; `balanceAfter` is the balance then
 * (read when not given). When the balance had been below zero, only the part above zero becomes a batch (the rest paid the debt back).
 */
export async function addLot(db: Db, userId: string, amount: number, source: LotSource, sourceId?: string | null, balanceAfter?: number): Promise<void> {
  const a = c2(amount);
  if (!(a > 0)) return;
  let after = balanceAfter;
  if (after === undefined) after = (await db.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } }))?.pointsBalance ?? 0;
  const keep = c2(Math.min(a, Math.max(0, after)));
  if (keep <= 0) return;
  await db.pointLot.create({ data: { userId, amount: a, remaining: keep, source, sourceId: sourceId ?? null } });
}

/** Points going out (the balance went down by `amount`, same transaction): taken from the oldest batches first, and recorded. */
export async function useLots(db: Db, userId: string, amount: number, refType: UseRef, refId?: string | null): Promise<void> {
  let left = c2(amount);
  if (left <= 0) return;
  const lots = await db.pointLot.findMany({ where: { userId, remaining: { gt: 0 } }, orderBy: [{ earnedAt: 'asc' }, { createdAt: 'asc' }] });
  for (const lot of lots) {
    if (left <= 0) break;
    const take = c2(Math.min(lot.remaining, left));
    if (take <= 0) continue;
    await db.pointLot.update({ where: { id: lot.id }, data: { remaining: c2(lot.remaining - take) } });
    await db.pointLotUse.create({ data: { lotId: lot.id, userId, amount: take, refType, refId: refId ?? null } });
    left = c2(left - take);
  }
}

/**
 * A spend given back (an unused reward code, a cancelled hot food order; the balance went up by `amount`, same transaction): into the
 * batches it was taken from, keeping their dates. A batch that has expired, or would by now, gives a fresh batch instead, so a refund is
 * never lost to the clock. Anything spent before batches were kept comes back as a fresh batch too.
 */
export async function restoreLots(db: Db, userId: string, refType: UseRef, refId: string, amount: number, now: Date = new Date()): Promise<void> {
  let left = c2(amount);
  if (left <= 0) return;
  const uses = await db.pointLotUse.findMany({ where: { userId, refType, refId, restoredAt: null }, include: { lot: true }, orderBy: { createdAt: 'asc' } });
  for (const u of uses) {
    if (left <= 0) break;
    const back = c2(Math.min(u.amount, left));
    const due = lotExpiresAt(u.lot.earnedAt);
    if (u.lot.expiredAt || (due && due.getTime() <= now.getTime())) {
      await db.pointLot.create({ data: { userId, amount: back, remaining: back, source: 'RESTORED', sourceId: refId } });
    } else {
      await db.pointLot.update({ where: { id: u.lotId }, data: { remaining: { increment: back } } });
    }
    await db.pointLotUse.update({ where: { id: u.id }, data: { restoredAt: now } });
    left = c2(left - back);
  }
  if (left > 0) await db.pointLot.create({ data: { userId, amount: left, remaining: left, source: 'RESTORED', sourceId: refId } });
}

/**
 * A sale voided after it was credited (the balance went down by `total`, same transaction): what is left of its batch is taken back, and
 * whatever of it the customer had already spent comes out of their other batches, oldest first (what is not there is the debt below zero).
 */
export async function voidSaleLots(db: Db, userId: string, saleId: string, total: number): Promise<void> {
  const lots = await db.pointLot.findMany({ where: { userId, sourceId: saleId, remaining: { gt: 0 } } });
  let removed = 0;
  for (const l of lots) {
    const left = l.remaining;   // read before the row changes
    await db.pointLot.update({ where: { id: l.id }, data: { remaining: 0, removedAmount: { increment: left } } });
    removed = c2(removed + left);
  }
  const spent = c2(total - removed);
  if (spent > 0) await useLots(db, userId, spent, 'VOID', saleId);
}

/** The account was closed and its balance forfeited: no batch is left to expire or to show. */
export async function closeLots(db: Db, userId: string): Promise<void> {
  await db.pointLot.updateMany({ where: { userId, remaining: { gt: 0 } }, data: { remaining: 0 } });
}

/** What is left in a customer's batches, and whether it matches their balance (to the cent). */
export async function lotsMatch(db: Db, userId: string): Promise<{ ok: boolean; balance: number; inLots: number }> {
  const [u, sum] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } }),
    db.pointLot.aggregate({ where: { userId, remaining: { gt: 0 } }, _sum: { remaining: true } }),
  ]);
  const balance = c2(u?.pointsBalance ?? 0);
  const inLots = c2(sum._sum.remaining ?? 0);
  return { ok: balance <= 0 ? inLots === 0 : pts(balance) === pts(inLots), balance, inLots };
}

// ── The daily jobs ──

/**
 * Takes away the points whose batches are past their date. Per customer, inside their lock: skipped (and reported) when the batches do not
 * match the balance; never more than the balance. Returns what happened, for the log and the tests.
 */
export async function expireDueLots(now: Date = new Date()): Promise<{ customers: number; points: number; skipped: string[] }> {
  const cfg = pointsExpiry();
  const out = { customers: 0, points: 0, skipped: [] as string[] };
  if (!cfg.enabled || !cfg.startedAt) return out;
  const cutoff = new Date(now.getTime() - cfg.days * DAY);
  if (Date.parse(cfg.startedAt) > cutoff.getTime()) return out;   // every clock starts on the day it was switched on: nothing is due yet
  const who = await prisma.pointLot.findMany({ where: { remaining: { gt: 0 }, earnedAt: { lte: cutoff } }, select: { userId: true }, distinct: ['userId'] });
  for (const { userId } of who) {
    try {
      const r = await prisma.$transaction(async (tx) => {
        await lockCustomer(tx, userId);
        const check = await lotsMatch(tx, userId);
        if (!check.ok) return { skipped: true as const, check };
        const due = await tx.pointLot.findMany({ where: { userId, remaining: { gt: 0 }, earnedAt: { lte: cutoff } } });
        let total = 0;
        for (const l of due) {
          const left = l.remaining;   // read before the row changes
          await tx.pointLot.update({ where: { id: l.id }, data: { remaining: 0, expiredAmount: { increment: left }, expiredAt: now } });
          total = c2(total + left);
        }
        const take = c2(Math.min(total, Math.max(0, check.balance)));
        if (take > 0) await tx.user.update({ where: { id: userId }, data: { pointsBalance: { decrement: take } } });
        return { skipped: false as const, total: take, lots: due.map((l) => l.id), balanceBefore: check.balance };
      }, { timeout: 30_000 });
      if (r.skipped) {
        out.skipped.push(userId);
        audit({ actorId: 'system', actorName: 'Points expiry (automatic)', actorRole: 'DEV_ADMIN', action: 'POINTS_EXPIRY_SKIPPED', entity: 'user', entityId: userId,
          details: { reason: 'The batches do not add up to the balance, so nothing was taken. Check this customer.', balance: r.check.balance, inBatches: r.check.inLots } });
        continue;
      }
      if (r.total <= 0) continue;
      out.customers++;
      out.points = c2(out.points + r.total);
      audit({ actorId: 'system', actorName: 'Points expiry (automatic)', actorRole: 'DEV_ADMIN', action: 'POINTS_EXPIRED', entity: 'user', entityId: userId,
        details: { points: pts(r.total), dollars: r.total, balanceBefore: r.balanceBefore, batches: r.lots, days: cfg.days } });
    } catch (e: any) {
      out.skipped.push(userId);
      console.error('[points-expiry] could not expire for', userId, e?.message ?? e);
    }
  }
  if (out.customers || out.skipped.length) console.log(`[points-expiry] ${pts(out.points)} points expired for ${out.customers} customer(s); ${out.skipped.length} skipped`);
  return out;
}

/** The "points expire soon" push: once per batch, `warnDays` before its date, one message per customer with the soonest date. */
export async function warnSoonExpiring(now: Date = new Date()): Promise<number> {
  const cfg = pointsExpiry();
  if (!cfg.enabled || !cfg.startedAt || cfg.warnDays <= 0) return 0;
  const horizon = now.getTime() + cfg.warnDays * DAY;
  // a batch is due within the window when max(earnedAt, startedAt) + days <= horizon
  const latestEarned = new Date(horizon - cfg.days * DAY);
  if (Date.parse(cfg.startedAt) > latestEarned.getTime()) return 0;
  const lots = await prisma.pointLot.findMany({ where: { remaining: { gt: 0 }, warnedAt: null, earnedAt: { lte: latestEarned } }, select: { id: true, userId: true, remaining: true, earnedAt: true } });
  const byUser = new Map<string, { ids: string[]; total: number; first: Date }>();
  for (const l of lots) {
    const due = lotExpiresAt(l.earnedAt, cfg)!;
    if (due.getTime() <= now.getTime()) continue;   // the expiry job takes it
    const e = byUser.get(l.userId) ?? { ids: [], total: 0, first: due };
    e.ids.push(l.id); e.total = c2(e.total + l.remaining); if (due < e.first) e.first = due;
    byUser.set(l.userId, e);
  }
  if (byUser.size === 0) return 0;
  const people = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] }, isActive: true }, select: { id: true, language: true } });
  let sent = 0;
  for (const p of people) {
    const e = byUser.get(p.id)!;
    const claimed = await prisma.pointLot.updateMany({ where: { id: { in: e.ids }, warnedAt: null }, data: { warnedAt: now } });
    if (claimed.count === 0) continue;
    const day = e.first.toLocaleDateString(p.language === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
    const n = pts(e.total).toLocaleString('en-US');
    if (p.language === 'es') sendPushToUser(p.id, 'Tus puntos vencen pronto', `${n} puntos vencen el ${day}. Úsalos en tu Lucky Stop antes de esa fecha.`, 'POINTS', '/(customer)/rewards');
    else sendPushToUser(p.id, 'Points expiring soon', `${n} points expire on ${day}. Use them at your Lucky Stop before then.`, 'POINTS', '/(customer)/rewards');
    sent++;
  }
  return sent;
}

/** HQ gives a customer's expired points back: each expired batch (all, or the ones listed) becomes a fresh batch, and the balance goes up. */
export async function undoExpiry(userId: string, actor: { id: string; name?: string | null; role: string }, lotIds?: string[], now: Date = new Date()): Promise<number> {
  const total = await prisma.$transaction(async (tx) => {
    await lockCustomer(tx, userId);
    const lots = await tx.pointLot.findMany({ where: { userId, expiredAt: { not: null }, expiryUndoneAt: null, expiredAmount: { gt: 0 }, ...(lotIds?.length ? { id: { in: lotIds } } : {}) } });
    let sum = 0;
    for (const l of lots) {
      const back = l.expiredAmount;   // read before the row changes
      await tx.pointLot.update({ where: { id: l.id }, data: { expiryUndoneAt: now } });
      await tx.pointLot.create({ data: { userId, amount: back, remaining: back, source: 'RESTORED', sourceId: l.id, earnedAt: now } });
      sum = c2(sum + back);
    }
    if (sum > 0) await tx.user.update({ where: { id: userId }, data: { pointsBalance: { increment: sum } } });
    return sum;
  });
  if (total > 0) {
    audit({ actorId: actor.id, actorName: actor.name ?? null, actorRole: actor.role, action: 'POINTS_EXPIRY_UNDONE', entity: 'user', entityId: userId, details: { points: pts(total), dollars: total } });
  }
  return total;
}

/** What a customer sees: the next batches to expire, and what expired (not given back) in the last year. */
export async function expirySummary(userId: string, now: Date = new Date()) {
  const cfg = pointsExpiry();
  const [open, gone] = await Promise.all([
    prisma.pointLot.findMany({ where: { userId, remaining: { gt: 0 } }, select: { remaining: true, earnedAt: true }, orderBy: { earnedAt: 'asc' } }),
    prisma.pointLot.findMany({ where: { userId, expiredAt: { gte: new Date(now.getTime() - 365 * DAY) }, expiryUndoneAt: null, expiredAmount: { gt: 0 } }, select: { expiredAmount: true, expiredAt: true }, orderBy: { expiredAt: 'desc' } }),
  ]);
  const upcoming = new Map<string, number>();
  if (cfg.enabled) {
    for (const l of open) {
      const due = lotExpiresAt(l.earnedAt, cfg)!.toISOString().slice(0, 10);
      upcoming.set(due, c2((upcoming.get(due) ?? 0) + l.remaining));
    }
  }
  const expired = new Map<string, number>();
  for (const l of gone) { const d = l.expiredAt!.toISOString().slice(0, 10); expired.set(d, c2((expired.get(d) ?? 0) + l.expiredAmount)); }
  const list = [...upcoming.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dollars]) => ({ date, points: pts(dollars) }));
  return {
    enabled: cfg.enabled, days: cfg.days,
    next: list[0] ?? null,
    upcoming: list.slice(0, 6),
    expired: [...expired.entries()].map(([date, dollars]) => ({ date, points: pts(dollars) })),
  };
}

/**
 * For HQ before switching it on (or changing the days): what would expire, by date, if expiry ran with these settings from `startedAt`
 * (today when switching on). Also how many customers' batches do not match their balance (they would be skipped).
 */
export async function previewExpiry(days: number, startedAt: Date, horizonDays = 120): Promise<{ byDate: { date: string; customers: number; points: number }[]; customers: number; points: number; mismatched: number }> {
  const end = startedAt.getTime() + days * DAY + horizonDays * DAY;
  const lots = await prisma.pointLot.findMany({ where: { remaining: { gt: 0 } }, select: { userId: true, remaining: true, earnedAt: true } });
  const byDate = new Map<string, { users: Set<string>; dollars: number }>();
  const users = new Set<string>();
  let dollars = 0;
  for (const l of lots) {
    const due = Math.max(l.earnedAt.getTime(), startedAt.getTime()) + days * DAY;
    if (due > end) continue;
    const d = new Date(due).toISOString().slice(0, 10);
    const e = byDate.get(d) ?? { users: new Set<string>(), dollars: 0 };
    e.users.add(l.userId); e.dollars = c2(e.dollars + l.remaining); byDate.set(d, e);
    users.add(l.userId); dollars = c2(dollars + l.remaining);
  }
  // customers whose batches and balance disagree (would be skipped, not charged)
  const balances = await prisma.user.findMany({ where: { role: 'CUSTOMER', pointsBalance: { gt: 0 } }, select: { id: true, pointsBalance: true } });
  const sums = new Map<string, number>();
  for (const l of lots) sums.set(l.userId, c2((sums.get(l.userId) ?? 0) + l.remaining));
  let mismatched = 0;
  for (const b of balances) if (pts(b.pointsBalance) !== pts(sums.get(b.id) ?? 0)) mismatched++;
  return {
    byDate: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => ({ date, customers: e.users.size, points: pts(e.dollars) })),
    customers: users.size, points: pts(dollars), mismatched,
  };
}
