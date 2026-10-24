// Customer engagement (2026-10-23): visit streaks, the daily check-in, badges and store goals. HQ switches each one on in admin >
// Engagement (utils/engagementConfig.ts; everything is off until then). Money rules, the same as challenge rewards (utils/challenges.ts):
// a bonus is paid as its own approved line (no purchase), tied to a hidden "system challenge" so every report that leaves reward lines
// out of purchase counts leaves these out too, with the store's platform fee, a dated batch of points for expiry, and the customer's
// balance moved in the same transaction. Each payout is guarded by a row in engagement_events with a unique (customer, kind, key), so a
// double tap, a retry or two requests at the same moment can never pay the same thing twice.

import { Prisma, PrismaClient, ProductCategory, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { DEFAULT_DEV_CUT_RATE } from '../config/constants';
import { addLot } from './pointLots';
import { rollCustomerPeriod } from './tier';
import { excludeDeletedCustomers } from './accountDeletion';
import { engagement } from './appSettings';
import { addStoreDays, storeDateKey } from './storeTime';

type Db = Prisma.TransactionClient | PrismaClient;
const fee4 = (n: number) => Math.round(n * 10000) / 10000;   // the platform fee to 4 places, like a real sale: a 2 pt check-in is $0.0008, not $0.00
const DAY = 86_400_000;

// ─── the hidden "system challenge" every bonus line is tied to ──────────────────────────────────────────────────────────────────────
// The ids are fixed so every copy of the server agrees; e5 to e7 are kept for the prize games (spin, scratch card, lucky number).
const SYSTEM: Record<'STREAK' | 'CHECKIN' | 'GOAL' | 'BIRTHDAY', { id: string; title: string; titleEs: string }> = {
  STREAK: { id: '00000000-0000-4000-8000-0000000000e1', title: 'Streak bonus', titleEs: 'Bono de racha' },
  CHECKIN: { id: '00000000-0000-4000-8000-0000000000e2', title: 'Daily check-in', titleEs: 'Registro diario' },
  GOAL: { id: '00000000-0000-4000-8000-0000000000e3', title: 'Store goal', titleEs: 'Meta de la tienda' },
  BIRTHDAY: { id: '00000000-0000-4000-8000-0000000000e4', title: 'Birthday gift', titleEs: 'Regalo de cumpleaños' },
};
export const SYSTEM_CHALLENGE_IDS = Object.values(SYSTEM).map((s) => s.id);

async function systemChallengeId(db: Db, kind: keyof typeof SYSTEM): Promise<string> {
  const s = SYSTEM[kind];
  await db.challenge.upsert({
    where: { id: s.id },
    create: { id: s.id, kind: 'SYSTEM', title: s.title, titleEs: s.titleEs, description: '', target: 0, reward: 0, startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2099-12-31T00:00:00Z'), isActive: false, createdById: 'system' },
    update: { title: s.title, titleEs: s.titleEs },   // History shows these names (in Spanish too), so rows made before the Spanish names get them
  });
  return s.id;
}

/** Pays `points` (whole points, 100 = $1) as a bonus line, in `db`. */
export async function payBonus(db: Db, o: { customerId: string; storeId: string; category?: ProductCategory | null; points: number; note: string; kind: keyof typeof SYSTEM; forSaleId?: string | null }) {
  const dollars = o.points / 100;
  const store = await db.store.findUnique({ where: { id: o.storeId }, select: { transactionFeeRate: true } });
  const fee = fee4(dollars * (store?.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE));
  const challengeId = await systemChallengeId(db, o.kind);
  const line = await db.pointsTransaction.create({
    data: {
      customerId: o.customerId, grantedById: o.customerId, storeId: o.storeId,
      purchaseAmount: 0, pointsAwarded: dollars, devCut: fee, storeCost: fee, cashbackRate: 0,
      category: (o.category ?? 'OTHER') as ProductCategory, status: TransactionStatus.APPROVED,
      notes: o.note, challengeId, ...(o.forSaleId ? { rewardForSaleId: o.forSaleId } : {}),
    },
  });
  await rollCustomerPeriod(db, o.customerId);   // a bonus paid just after a tier period ends must count in the new one, not be wiped by the reset
  const after = await db.user.update({ where: { id: o.customerId }, data: { pointsBalance: { increment: dollars }, periodPoints: { increment: dollars } } });
  await addLot(db, o.customerId, dollars, 'ENGAGEMENT', line.id, after.pointsBalance);
  return line;
}

// ─── weeks (Monday to Sunday, the store's calendar) ─────────────────────────────────────────────────────────────────────────────────
export const dow = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();   // 0 = Sunday
/** The Monday ('YYYY-MM-DD') of the store-week the instant falls in. */
export function weekStartKey(at: Date): string {
  const key = storeDateKey(at);
  return addStoreDays(key, -((dow(key) + 6) % 7));
}

export interface StreakInfo { weeks: number; startWeek: string | null; current: boolean; atRisk: boolean; endsOn: string | null }
/** Consecutive weeks with a visit, counted back from this week (or from last week while this week has no visit yet: still alive, at risk until Sunday). */
export function computeStreak(weeks: Set<string>, thisWeek: string): StreakInfo {
  const has = weeks.has(thisWeek);
  const end = has ? thisWeek : weeks.has(addStoreDays(thisWeek, -7)) ? addStoreDays(thisWeek, -7) : null;
  if (!end) return { weeks: 0, startWeek: null, current: false, atRisk: false, endsOn: null };
  let n = 0, w = end;
  while (weeks.has(w)) { n++; w = addStoreDays(w, -7); }
  return { weeks: n, startWeek: addStoreDays(end, -7 * (n - 1)), current: has, atRisk: !has, endsOn: addStoreDays(thisWeek, 6) };
}
/** The longest run of consecutive weeks ever. */
export function bestRun(weeks: Set<string>): number {
  let best = 0;
  for (const w of weeks) {
    if (weeks.has(addStoreDays(w, -7))) continue;   // only count from the start of a run
    let n = 0, x = w;
    while (weeks.has(x)) { n++; x = addStoreDays(x, 7); }
    best = Math.max(best, n);
  }
  return best;
}

const PURCHASES = (customerId: string): Prisma.PointsTransactionWhereInput => ({
  customerId, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false,
});

/** The store-weeks with a qualifying purchase. `since` (the day streaks were switched on) leaves out the weeks before it. */
export async function purchaseWeeks(db: Db, customerId: string, minPurchase: number, now: Date = new Date(), since: string | null = null): Promise<Set<string>> {
  const rows = await db.pointsTransaction.findMany({
    where: { ...PURCHASES(customerId), purchaseAmount: { gte: Math.max(0.01, minPurchase) }, createdAt: { gte: new Date(now.getTime() - 400 * DAY) } },
    select: { createdAt: true },
  });
  const first = since ? weekStartKey(new Date(`${since}T18:00:00Z`)) : null;   // the week streaks were switched on counts, the ones before do not
  return new Set(rows.map((r) => weekStartKey(r.createdAt)).filter((w) => !first || w >= first));
}

export interface BonusAward { challengeId: string; title: string; titleEs: string | null; customerId: string; reward: number; pushTitle?: string; pushTitleEs?: string }

/**
 * Called inside the approval of a sale (utils/saleDecision.ts, next to creditChallenges): when this purchase carries the customer's
 * streak past a milestone, the bonus is paid once. Returns the awards for the push after the transaction is saved.
 */
export async function creditStreak(db: Db, saleId: string, now: Date = new Date()): Promise<BonusAward[]> {
  const cfg = engagement().streaks;
  if (!cfg.enabled) return [];
  const sale = await db.pointsTransaction.findUnique({
    where: { id: saleId },
    select: { id: true, customerId: true, storeId: true, category: true, purchaseAmount: true, challengeId: true, referralId: true, isTestData: true, status: true },
  });
  if (!sale || sale.challengeId || sale.referralId || sale.isTestData || sale.status !== TransactionStatus.APPROVED) return [];
  if (sale.purchaseAmount < Math.max(0.01, cfg.minPurchase)) return [];
  const thisWeek = weekStartKey(now);
  const streak = computeStreak(await purchaseWeeks(db, sale.customerId, cfg.minPurchase, now, cfg.since), thisWeek);
  if (!streak.startWeek) return [];
  const awards: BonusAward[] = [];
  for (const m of cfg.milestones) {
    if (streak.weeks < m.weeks || m.pts <= 0) continue;
    // only a milestone reached lately: one HQ adds or lowers later does not pay the people who passed it long ago
    if (addStoreDays(streak.startWeek, 7 * (m.weeks - 1)) < addStoreDays(thisWeek, -14)) continue;
    const made = await db.engagementEvent.createMany({ data: [{ customerId: sale.customerId, kind: 'STREAK_AWARD', key: `${streak.startWeek}:${m.weeks}`, points: m.pts / 100 }], skipDuplicates: true });
    if (made.count === 0) continue;   // this milestone of this streak was already paid
    await payBonus(db, { customerId: sale.customerId, storeId: sale.storeId, category: sale.category, points: m.pts, note: `Streak bonus: ${m.weeks} weeks in a row`, kind: 'STREAK', forSaleId: sale.id });
    awards.push({
      challengeId: SYSTEM.STREAK.id, title: `${m.weeks}-week streak`, titleEs: `Racha de ${m.weeks} semanas`, customerId: sale.customerId, reward: m.pts / 100,
      pushTitle: '🔥 Streak bonus!', pushTitleEs: '🔥 ¡Bono de racha!',
    });
  }
  return awards;
}

/** The customer's streak now, for the app. */
export async function streakFor(customerId: string, now: Date = new Date()) {
  const cfg = engagement().streaks;
  if (!cfg.enabled) return null;
  const weeks = await purchaseWeeks(prisma, customerId, cfg.minPurchase, now, cfg.since);
  const s = computeStreak(weeks, weekStartKey(now));
  const next = cfg.milestones.find((m) => m.weeks > s.weeks) ?? null;
  const paid = s.startWeek ? new Set((await prisma.engagementEvent.findMany({ where: { customerId, kind: 'STREAK_AWARD', key: { startsWith: `${s.startWeek}:` } }, select: { key: true } })).map((e) => Number(e.key.split(':')[1]))) : new Set<number>();
  return {
    weeks: s.weeks, current: s.current, atRisk: s.atRisk, endsOn: s.endsOn, best: bestRun(weeks), minPurchase: cfg.minPurchase,
    next: next ? { weeks: next.weeks, pts: next.pts } : null,
    milestones: cfg.milestones.map((m) => ({ weeks: m.weeks, pts: m.pts, reached: s.weeks >= m.weeks, paid: paid.has(m.weeks) })),
  };
}

// ─── daily check-in ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Refusal = 'OFF' | 'ALREADY' | 'NO_VISIT' | 'CAP';
async function lastVisit(db: Db, customerId: string) {
  return db.pointsTransaction.findFirst({ where: PURCHASES(customerId), orderBy: { createdAt: 'desc' }, select: { storeId: true, createdAt: true } });
}

interface CheckInView { available: boolean; reason: Refusal | null; doneToday: boolean; streakDays: number; mode: 'FIXED' | 'MYSTERY'; todayPts: number | null; weekBonusPts: number; monthLeftPts: number }
async function checkInView(db: Db, customerId: string, now: Date): Promise<(CheckInView & { storeId: string | null }) | null> {
  const cfg = engagement().checkIn;
  if (!cfg.enabled) return null;
  const today = storeDateKey(now);
  const events = await db.engagementEvent.findMany({ where: { customerId, kind: 'CHECKIN', createdAt: { gte: new Date(now.getTime() - 400 * DAY) } }, select: { key: true, points: true } });
  const keys = new Set(events.map((e) => e.key));
  const doneToday = keys.has(today);
  let n = 0, d = doneToday ? today : addStoreDays(today, -1);
  while (keys.has(d)) { n++; d = addStoreDays(d, -1); }
  const month = today.slice(0, 7);
  const paidPts = Math.round(events.filter((e) => e.key.startsWith(month)).reduce((t, e) => t + e.points, 0) * 100);
  const monthLeftPts = Math.max(0, cfg.monthlyCapPts - paidPts);
  const visit = await lastVisit(db, customerId);
  const visited = !!visit && (cfg.needVisitDays === 0 || visit.createdAt.getTime() >= now.getTime() - cfg.needVisitDays * DAY);
  const day = doneToday ? n : n + 1;   // which day of the run this one is
  const bonus = day % 7 === 0 ? cfg.weekBonusPts : 0;
  let reason: Refusal | null = doneToday ? 'ALREADY' : !visited ? 'NO_VISIT' : monthLeftPts <= 0 ? 'CAP' : null;
  return {
    available: reason === null, reason, doneToday, streakDays: n, mode: cfg.mode, weekBonusPts: cfg.weekBonusPts, monthLeftPts, storeId: visit?.storeId ?? null,
    todayPts: cfg.mode === 'FIXED' ? Math.min(cfg.pts + bonus, monthLeftPts) : null,
  };
}
export async function checkInFor(customerId: string, now: Date = new Date()) {
  const v = await checkInView(prisma, customerId, now);
  if (!v) return null;
  const { storeId: _s, ...rest } = v;
  return rest;
}

/** Weighted pick; `roll` is 0 to 1 (injectable for tests). */
export function pickMystery(prizes: { pts: number; weight: number }[], roll: number): number {
  const total = prizes.reduce((t, p) => t + p.weight, 0);
  let at = roll * total;
  for (const p of prizes) { at -= p.weight; if (at < 0) return p.pts; }
  return prizes[prizes.length - 1]!.pts;
}

export async function doCheckIn(customerId: string, now: Date = new Date(), roll: number = Math.random()): Promise<{ ok: true; pts: number; streakDays: number; mode: string } | { ok: false; reason: Refusal }> {
  const cfg = engagement().checkIn;
  if (!cfg.enabled) return { ok: false, reason: 'OFF' };
  return prisma.$transaction(async (db) => {
    const v = await checkInView(db, customerId, now);
    if (!v) return { ok: false as const, reason: 'OFF' as Refusal };
    if (!v.available || !v.storeId) return { ok: false as const, reason: (v.reason ?? 'NO_VISIT') as Refusal };
    const day = v.streakDays + 1;
    const base = cfg.mode === 'MYSTERY' ? pickMystery(cfg.mystery, roll) : cfg.pts;
    const pts = Math.min(base + (day % 7 === 0 ? cfg.weekBonusPts : 0), v.monthLeftPts);
    const made = await db.engagementEvent.createMany({ data: [{ customerId, kind: 'CHECKIN', key: storeDateKey(now), points: pts / 100 }], skipDuplicates: true });
    if (made.count === 0) return { ok: false as const, reason: 'ALREADY' as Refusal };   // two taps at once: the other one won
    if (pts > 0) await payBonus(db, { customerId, storeId: v.storeId, points: pts, note: 'Daily check-in', kind: 'CHECKIN' });
    return { ok: true as const, pts, streakDays: day, mode: cfg.mode };
  });
}

// ─── badges (worked out from the customer's history each time: nothing to store, and a rule change applies at once) ─────────────────
export interface BadgeStats { purchases: number; stores: number; hotFood: number; gas: number; early: number; weekend: number; referrals: number; challenges: number; bestStreak: number; tierRank: number }
export interface BadgeDef { key: string; emoji: string; name: string; nameEs: string; desc: string; descEs: string; target: number; value: (s: BadgeStats) => number }
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const BADGES: BadgeDef[] = [
  { key: 'first_visit', emoji: '👋', name: 'First stop', nameEs: 'Primera parada', desc: 'Make your first purchase with the app', descEs: 'Haz tu primera compra con la app', target: 1, value: (s) => s.purchases },
  { key: 'regular_10', emoji: '⭐', name: 'Regular', nameEs: 'Cliente frecuente', desc: '10 purchases with the app', descEs: '10 compras con la app', target: 10, value: (s) => s.purchases },
  { key: 'regular_50', emoji: '🌟', name: 'Local favorite', nameEs: 'Favorito local', desc: '50 purchases with the app', descEs: '50 compras con la app', target: 50, value: (s) => s.purchases },
  { key: 'regular_100', emoji: '🏆', name: 'Lucky Stop legend', nameEs: 'Leyenda Lucky Stop', desc: '100 purchases with the app', descEs: '100 compras con la app', target: 100, value: (s) => s.purchases },
  { key: 'explorer_3', emoji: '🧭', name: 'Explorer', nameEs: 'Explorador', desc: 'Shop at 3 different stores', descEs: 'Compra en 3 tiendas distintas', target: 3, value: (s) => s.stores },
  { key: 'explorer_6', emoji: '🗺️', name: 'Road tripper', nameEs: 'Viajero', desc: 'Shop at 6 different stores', descEs: 'Compra en 6 tiendas distintas', target: 6, value: (s) => s.stores },
  { key: 'hot_food_10', emoji: '🔥', name: 'Hot food fan', nameEs: 'Fan de la comida caliente', desc: '10 hot food purchases', descEs: '10 compras de comida caliente', target: 10, value: (s) => s.hotFood },
  { key: 'gas_10', emoji: '⛽', name: 'Fill-up fan', nameEs: 'Fan del tanque lleno', desc: '10 fill-ups scanned', descEs: '10 cargas de gasolina escaneadas', target: 10, value: (s) => s.gas },
  { key: 'early_bird_5', emoji: '🌅', name: 'Early bird', nameEs: 'Madrugador', desc: '5 purchases before 8 AM', descEs: '5 compras antes de las 8 AM', target: 5, value: (s) => s.early },
  { key: 'weekend_5', emoji: '🎉', name: 'Weekend warrior', nameEs: 'Guerrero del fin de semana', desc: '5 weekend purchases', descEs: '5 compras en fin de semana', target: 5, value: (s) => s.weekend },
  { key: 'streak_3', emoji: '🔥', name: 'On a roll', nameEs: 'En racha', desc: 'A 3-week visit streak', descEs: 'Una racha de 3 semanas', target: 3, value: (s) => s.bestStreak },
  { key: 'streak_8', emoji: '💪', name: 'Unstoppable', nameEs: 'Imparable', desc: 'An 8-week visit streak', descEs: 'Una racha de 8 semanas', target: 8, value: (s) => s.bestStreak },
  { key: 'challenger_1', emoji: '🎯', name: 'Challenger', nameEs: 'Retador', desc: 'Complete a challenge', descEs: 'Completa un reto', target: 1, value: (s) => s.challenges },
  { key: 'challenger_5', emoji: '🥇', name: 'Champion', nameEs: 'Campeón', desc: 'Complete 5 challenges', descEs: 'Completa 5 retos', target: 5, value: (s) => s.challenges },
  { key: 'friend_1', emoji: '🤝', name: 'Friend maker', nameEs: 'Buen amigo', desc: 'A friend joins with your code', descEs: 'Un amigo se une con tu código', target: 1, value: (s) => s.referrals },
  { key: 'friend_5', emoji: '🎁', name: 'Super sharer', nameEs: 'Súper compartidor', desc: '5 friends join with your code', descEs: '5 amigos se unen con tu código', target: 5, value: (s) => s.referrals },
  { key: 'gold_club', emoji: '🥇', name: 'Gold club', nameEs: 'Club Oro', desc: 'Reach the Gold tier', descEs: 'Llega al nivel Oro', target: 2, value: (s) => s.tierRank },
  { key: 'platinum_club', emoji: '💎', name: 'Platinum club', nameEs: 'Club Platino', desc: 'Reach the Platinum tier', descEs: 'Llega al nivel Platino', target: 4, value: (s) => s.tierRank },
];
export const BADGE_KEYS = BADGES.map((b) => b.key);

const HOUR = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', hour: '2-digit' });
export const storeHour = (at: Date) => parseInt(HOUR.formatToParts(at).find((p) => p.type === 'hour')!.value, 10);
const TIER_RANK: Record<string, number> = { BRONZE: 0, SILVER: 1, GOLD: 2, DIAMOND: 3, PLATINUM: 4 };

export async function badgeStats(customerId: string): Promise<BadgeStats> {
  const [rows, user, referrals, progress] = await Promise.all([
    prisma.pointsTransaction.findMany({ where: { ...PURCHASES(customerId), purchaseAmount: { gt: 0 } }, select: { createdAt: true, storeId: true, category: true }, take: 5000 }),
    prisma.user.findUnique({ where: { id: customerId }, select: { tier: true } }),
    prisma.referral.count({ where: { referrerId: customerId, status: 'REWARDED' } }),
    prisma.challengeProgress.findMany({ where: { customerId }, select: { timesEarned: true } }),
  ]);
  const weeks = new Set(rows.filter((r) => true).map((r) => weekStartKey(r.createdAt)));
  return {
    purchases: rows.length,
    stores: new Set(rows.map((r) => r.storeId)).size,
    hotFood: rows.filter((r) => r.category === 'HOT_FOODS').length,
    gas: rows.filter((r) => r.category === 'GAS' || r.category === 'DIESEL').length,
    early: rows.filter((r) => storeHour(r.createdAt) < 8).length,
    weekend: rows.filter((r) => [0, 6].includes(dow(storeDateKey(r.createdAt)))).length,
    referrals,
    challenges: progress.reduce((t, p) => t + p.timesEarned, 0),
    bestStreak: bestRun(weeks),
    tierRank: TIER_RANK[user?.tier ?? 'BRONZE'] ?? 0,
  };
}

export async function badgesFor(customerId: string) {
  const cfg = engagement().badges;
  if (!cfg.enabled) return null;
  const stats = await badgeStats(customerId);
  const list = BADGES.filter((b) => !cfg.off.includes(b.key)).map((b) => {
    const v = Math.min(b.value(stats), b.target);
    return { key: b.key, emoji: b.emoji, name: b.name, nameEs: b.nameEs, desc: b.desc, descEs: b.descEs, target: b.target, progress: v, earned: v >= b.target };
  });
  return { earned: list.filter((b) => b.earned).length, total: list.length, badges: list };
}

// ─── store goals ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface GoalProgress { sales: number; customers: number }
/** A sale counts toward a store goal (and earns its reward) from this much: a pack of gum should not win $5. */
export const GOAL_MIN_PURCHASE = 2;
export async function goalProgress(db: Db, storeId: string, from: Date, to: Date): Promise<GoalProgress> {
  const where: Prisma.PointsTransactionWhereInput = { storeId, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gte: GOAL_MIN_PURCHASE }, createdAt: { gte: from, lte: to } };
  const [sales, customers] = await Promise.all([
    db.pointsTransaction.count({ where }),
    db.pointsTransaction.groupBy({ by: ['customerId'], where, _count: { _all: true } }).then((g) => g.length),
  ]);
  return { sales, customers };
}
export const goalValue = (metric: string, p: GoalProgress) => (metric === 'CUSTOMERS' ? p.customers : p.sales);

/** The active goals at one store (or the customer's last store), with how far the store has got, for the app. */
export async function goalsFor(customerId: string, storeId: string | null, now: Date = new Date()) {
  if (!engagement().storeGoals.enabled) return null;
  const store = storeId ?? (await lastVisit(prisma, customerId))?.storeId ?? null;
  if (!store) return [];
  const goals = await prisma.storeGoal.findMany({ where: { isActive: true, endDate: { gte: now }, startDate: { lte: now }, OR: [{ storeId: null }, { storeId: store }] }, orderBy: { endDate: 'asc' } });
  const name = (await prisma.store.findUnique({ where: { id: store }, select: { name: true } }))?.name ?? '';
  const out = [];
  for (const g of goals) {
    const p = await goalProgress(prisma, store, g.startDate, now);
    const mine = await prisma.pointsTransaction.count({ where: { storeId: store, customerId, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gte: GOAL_MIN_PURCHASE }, createdAt: { gte: g.startDate, lte: now } } });
    out.push({ id: g.id, title: g.title, titleEs: g.titleEs, metric: g.metric, target: g.target, rewardPts: g.rewardPoints, endDate: g.endDate, store: name, progress: Math.min(goalValue(g.metric, p), g.target), reached: goalValue(g.metric, p) >= g.target, joined: mine > 0 });
  }
  return out;
}

/** Pays every goal whose window has ended and whose target was reached: once, to each customer who bought at that store in the window. */
export async function payFinishedGoals(now: Date = new Date()): Promise<{ goals: number; paid: number; winners: { customerId: string; title: string; titleEs: string | null; pts: number }[] }> {
  const winners: { customerId: string; title: string; titleEs: string | null; pts: number }[] = [];
  if (!engagement().storeGoals.enabled) return { goals: 0, paid: 0, winners };
  const due = await prisma.storeGoal.findMany({ where: { isActive: true, paidAt: null, endDate: { lt: now } } });
  let paid = 0;
  for (const g of due) {
    const stores = g.storeId ? [{ id: g.storeId }] : await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
    for (const s of stores) {
      const p = await goalProgress(prisma, s.id, g.startDate, g.endDate);
      if (goalValue(g.metric, p) < g.target) continue;
      const buyers = await prisma.pointsTransaction.groupBy({
        by: ['customerId'], where: { storeId: s.id, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gte: GOAL_MIN_PURCHASE }, createdAt: { gte: g.startDate, lte: g.endDate } },
        _count: { _all: true },
      });
      // only people who can still use points: not deleted, not restricted
      const live = new Set((await prisma.user.findMany({ where: { id: { in: buyers.map((b) => b.customerId) }, role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers }, select: { id: true } })).map((u) => u.id));
      for (const b of buyers) {
        if (!live.has(b.customerId)) continue;
        const ok = await prisma.$transaction(async (db) => {
          const made = await db.engagementEvent.createMany({ data: [{ customerId: b.customerId, kind: 'GOAL_AWARD', key: g.id, points: g.rewardPoints / 100 }], skipDuplicates: true });
          if (made.count === 0) return false;
          await payBonus(db, { customerId: b.customerId, storeId: s.id, points: g.rewardPoints, note: `Store goal reached: ${g.title}`, kind: 'GOAL' });
          return true;
        });
        if (ok) { paid++; winners.push({ customerId: b.customerId, title: g.title, titleEs: g.titleEs, pts: g.rewardPoints }); }
      }
    }
    await prisma.storeGoal.update({ where: { id: g.id }, data: { paidAt: now } });   // closed: a goal is looked at once after its window
  }
  return { goals: due.length, paid, winners };
}

