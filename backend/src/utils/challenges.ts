// Challenges (2026-10-05): "Spend $30 on groceries this week, get $3 back" (SPEND) and "Every 5th coffee earns $1" (VISITS).
//
// Only APPROVED sales count, at the moment they are approved (saleDecision.approveAndCredit calls creditChallenges inside the same
// database transaction), so a sale that is later rejected never counts, and an approval counts exactly once. A reward is credited as
// its own approved line (no purchase; PointsTransaction.challengeId, rewardForSaleId), with the store's platform fee like any cashback,
// so it shows in the customer's history and in billing, and voiding it takes it back. A reward line never counts toward a challenge.
// Only customers in the challenge's audience (utils/offerAudience.ts) take part. Two approvals for the same customer at the same moment
// cannot both pay one reward: the reward is claimed with a conditional update on timesEarned.

import { Prisma, PrismaClient, ProductCategory, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { DEFAULT_DEV_CUT_RATE } from '../config/constants';
import { forCustomer } from './offerAudience';
import { sendPushToUser } from './push';
import { feature } from './appSettings';
import { addLot } from './pointLots';
import { thisWeekPick, weekWindow } from './engagementWeekly';
import { storeDateKey } from './storeTime';

type Db = Prisma.TransactionClient | PrismaClient;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ChallengeKind = 'SPEND' | 'VISITS';
// A reward is kept in dollars (as all cashback is) and shown to customers as points: 100 points = $1 (2026-10-20), so "get $2 back" is
// "get 200 pts back" everywhere a customer reads it.
export const rewardPoints = (dollars: number) => Math.round(dollars * 100);
const usd = (n: number) => `$${n.toFixed(2)}`;
type Rule = { kind: string; target: number; reward: number; minPurchase: number | null; category: string | null; repeats: boolean };
const ruleWords = (c: Rule, reward: string) => {
  const cat = c.category ? ` on ${c.category.replace(/_/g, ' ').toLowerCase()}` : '';
  if (c.kind === 'SPEND') return `Spend ${usd(c.target)}${cat}, get ${reward} back`;
  const min = c.minPurchase ? ` of ${usd(c.minPurchase)} or more` : '';
  return `${c.repeats ? 'Every' : 'The'} ${c.target}${['th', 'st', 'nd', 'rd'][c.target % 10 > 3 || [11, 12, 13].includes(c.target % 100) ? 0 : c.target % 10]} purchase${cat}${min} earns ${reward}`;
};
/** "Spend $30 on groceries, get 300 pts back" / "Every 5th purchase of $2 or more earns 100 pts" (English, for HQ, the Activity Log and a title left blank). */
export const challengeRule = (c: Rule) => ruleWords(c, `${rewardPoints(c.reward)} pts`);
/** The same rule as it used to be written, with the reward in dollars: a title that is exactly this is shown in points. */
export const legacyChallengeRule = (c: Rule) => ruleWords(c, usd(c.reward));

export interface ChallengeAward { challengeId: string; title: string; titleEs: string | null; customerId: string; reward: number; pushTitle?: string; pushTitleEs?: string }   // pushTitle: a streak bonus says so instead of "Challenge complete"

/** What a sale adds to a challenge: its amount (SPEND), or one purchase when it is big enough (VISITS). */
export function saleCounts(c: { kind: string; minPurchase: number | null }, purchaseAmount: number): number {
  if (c.kind === 'SPEND') return Math.max(0, purchaseAmount);
  return purchaseAmount >= (c.minPurchase ?? 0) && purchaseAmount > 0 ? 1 : 0;
}

/**
 * The challenges this approved sale moves on, and the rewards it completes (credited here, in `db`). Returns the rewards, for the
 * push after the transaction is saved (pushChallengeAwards).
 */
export async function creditChallenges(db: Db, saleId: string, now: Date = new Date()): Promise<ChallengeAward[]> {
  const sale = await db.pointsTransaction.findUnique({
    where: { id: saleId },
    select: { id: true, saleId: true, customerId: true, storeId: true, category: true, purchaseAmount: true, createdAt: true, challengeId: true, status: true, store: { select: { transactionFeeRate: true } } },
  });
  if (!feature('challenges')) return [];   // switched off in Settings: nothing moves on, nothing is paid
  if (!sale || sale.challengeId || sale.status !== TransactionStatus.APPROVED) return [];   // a reward line never counts
  const at = sale.createdAt;   // the challenge has to have been running when the purchase was made
  const running = await db.challenge.findMany({
    where: {
      isActive: true, startDate: { lte: at }, endDate: { gte: at },
      OR: [{ storeId: null }, { storeId: sale.storeId }],
      AND: [{ OR: [{ category: null }, { category: sale.category }] }],
    },
  });
  if (running.length === 0) return [];
  const mine = await forCustomer(running, sale.customerId, at, undefined, at);   // as of the purchase (it is not its own last visit)
  // A visit is a sale, not a line: gas and groceries on one receipt are one visit (2026-10-31; each line used to count). The lines of a
  // sale share its sale id (the first line's id); a line adds no visit when another approved line of the same sale already counted
  const saleKey = sale.saleId ?? sale.id;
  const siblings = mine.some((c) => c.kind === 'VISITS')
    ? await db.pointsTransaction.findMany({
      where: { OR: [{ id: saleKey }, { saleId: saleKey }], id: { not: sale.id }, status: TransactionStatus.APPROVED, challengeId: null, referralId: null },
      select: { storeId: true, category: true, purchaseAmount: true, createdAt: true },
    })
    : [];
  const visitCounted = (c: (typeof mine)[number]) => siblings.some((l) => (!c.storeId || c.storeId === l.storeId) && (!c.category || c.category === l.category)
    && l.createdAt >= c.startDate && l.createdAt <= c.endDate && saleCounts(c, l.purchaseAmount) > 0);
  const awards: ChallengeAward[] = [];
  for (const c of mine) {
    const add = saleCounts(c, sale.purchaseAmount);
    if (add <= 0) continue;
    if (c.kind === 'VISITS' && visitCounted(c)) continue;
    const p = await db.challengeProgress.upsert({
      where: { challengeId_customerId: { challengeId: c.id, customerId: sale.customerId } },
      create: { challengeId: c.id, customerId: sale.customerId, progress: 0, timesEarned: 0 },
      update: {},
    });
    if (!c.repeats && p.timesEarned >= 1) continue;   // a once-only challenge already earned
    const progress = p.progress + add;
    if (progress + 1e-9 < c.target) {
      await db.challengeProgress.update({ where: { id: p.id }, data: { progress: { increment: add } } });
      continue;
    }
    // Reached: claim the reward exactly once (a second approval at the same moment finds timesEarned changed and only adds its progress)
    const claimed = await db.challengeProgress.updateMany({
      where: { id: p.id, timesEarned: p.timesEarned },
      data: { timesEarned: { increment: 1 }, progress: c.repeats ? r2(progress - c.target) : r2(progress) },
    });
    if (claimed.count === 0) { await db.challengeProgress.update({ where: { id: p.id }, data: { progress: { increment: add } } }); continue; }
    const fee = r2(c.reward * (sale.store?.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE));
    const line = await db.pointsTransaction.create({
      data: {
        customerId: sale.customerId, grantedById: sale.customerId, storeId: sale.storeId,
        purchaseAmount: 0, pointsAwarded: c.reward, devCut: fee, storeCost: fee, cashbackRate: 0,
        category: (c.category ?? sale.category) as ProductCategory, status: TransactionStatus.APPROVED,
        notes: `Challenge reward: ${c.title}`, challengeId: c.id, rewardForSaleId: sale.id,
      },
    });
    const after = await db.user.update({ where: { id: sale.customerId }, data: { pointsBalance: { increment: c.reward }, periodPoints: { increment: c.reward } } });
    await addLot(db, sale.customerId, c.reward, 'CHALLENGE', line.id, after.pointsBalance);
    awards.push({ challengeId: c.id, title: c.title, titleEs: c.titleEs, customerId: sale.customerId, reward: c.reward });
  }
  return awards;
}

/** The "Challenge complete" push, in the customer's language, once the approval is saved. */
export async function pushChallengeAwards(awards: ChallengeAward[]): Promise<void> {
  if (awards.length === 0) return;
  const langs = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(awards.map((a) => a.customerId))] } }, select: { id: true, language: true } })).map((u) => [u.id, u.language]));
  for (const a of awards) {
    const es = langs.get(a.customerId) === 'es';
    sendPushToUser(a.customerId,
      es ? (a.pushTitleEs ?? '🏆 ¡Reto cumplido!') : (a.pushTitle ?? '🏆 Challenge complete!'),
      es ? `${a.titleEs || a.title}: ${rewardPoints(a.reward)} pts agregados a tu saldo.` : `${a.title}: ${rewardPoints(a.reward)} pts added to your balance.`,
      'OFFER', '/(customer)/home?scrollTo=challenges');
  }
}

/** The running challenges for a customer (theirs only), with their progress, for the app. */
export async function challengesFor(customerId: string, storeId: string | null, now: Date = new Date()) {
  if (!feature('challenges')) return [];   // switched off in Settings
  const running = await prisma.challenge.findMany({
    where: { isActive: true, startDate: { lte: now }, endDate: { gte: now }, ...(storeId ? { OR: [{ storeId: null }, { storeId }] } : {}) },
    orderBy: { endDate: 'asc' },
    include: { store: { select: { name: true } } },
  });
  const mine = await forCustomer(running, customerId, now);
  if (mine.length === 0) return [];
  const progress = new Map((await prisma.challengeProgress.findMany({ where: { customerId, challengeId: { in: mine.map((c) => c.id) } } })).map((p) => [p.challengeId, p]));
  // Challenge of the week (2026-10-24): this week's pick, if it is in the customer's own list, comes first with the end of its week (a
  // store-specific one only when the customer is at that store). endsOn on every row is the store date, so a phone in another timezone
  // never reads a Sunday 11:59 PM end as "Monday".
  const pick = thisWeekPick(now);
  const week = pick ? weekWindow(pick.weekOf) : null;
  const rows = mine.map((c) => {
    const p = progress.get(c.id);
    const done = !c.repeats && (p?.timesEarned ?? 0) >= 1;
    const featured = !!pick && !!week && c.id === pick.challengeId && (!c.storeId || c.storeId === storeId);
    const endsAt = featured ? (c.endDate < week!.end ? c.endDate : week!.end) : null;
    return {
      // a title that is just the old dollar sentence ("Spend $20.00, get $2.00 back") is shown in points, so older challenges need no re-posting
      id: c.id, kind: c.kind, title: c.title === legacyChallengeRule(c) ? challengeRule(c) : c.title, titleEs: c.titleEs, description: c.description, descriptionEs: c.descriptionEs,
      category: c.category, store: c.store?.name ?? null, target: c.target, minPurchase: c.minPurchase, reward: c.reward, repeats: c.repeats,
      endDate: c.endDate, endsOn: storeDateKey(c.endDate), progress: done ? c.target : r2(p?.progress ?? 0), timesEarned: p?.timesEarned ?? 0, done,
      featured, ...(endsAt ? { endsAt, weekEndsOn: storeDateKey(endsAt) } : {}),
    };
  });
  return [...rows.filter((r) => r.featured), ...rows.filter((r) => !r.featured)];
}

/** For HQ: per challenge, how many took part, how many times it was earned, and what it paid. */
export async function challengeStats(ids: string[]) {
  if (ids.length === 0) return new Map<string, { customers: number; earned: number; paid: number }>();
  const [prog, paid] = await Promise.all([
    prisma.challengeProgress.groupBy({ by: ['challengeId'], where: { challengeId: { in: ids } }, _count: { _all: true }, _sum: { timesEarned: true } }),
    prisma.pointsTransaction.groupBy({ by: ['challengeId'], where: { challengeId: { in: ids }, status: TransactionStatus.APPROVED }, _sum: { pointsAwarded: true } }),
  ]);
  const paidBy = new Map(paid.map((p) => [p.challengeId as string, r2(p._sum.pointsAwarded ?? 0)]));
  return new Map(ids.map((id) => {
    const g = prog.find((x) => x.challengeId === id);
    return [id, { customers: g?._count._all ?? 0, earned: g?._sum.timesEarned ?? 0, paid: paidBy.get(id) ?? 0 }];
  }));
}
