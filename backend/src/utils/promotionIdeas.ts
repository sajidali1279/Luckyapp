// Promotion ideas for HQ (2026-10-05): ready-to-post promotions worked out from the last 8 weeks of approved sales.
//
//  - SLOW_HOURS: for each category, the daytime 3 hours (6 AM to 9 PM) on the days of the week that sell least against the category's
//    usual 3 hours. Idea: a happy hour on those days and hours, for 4 weeks.
//  - FALLING_CATEGORY: a category whose sales in the last 4 weeks are 15% or more below the 4 weeks before. Idea: 2 weeks, all day.
//  - SLOW_STORE: the same for a store. Idea: a store-wide promotion at that store, 2 weeks.
//  - WIN_BACK: customers who bought at least twice but not in 30 days. Idea: a win-back promotion (only they see it; their first
//    purchase back pays it), 4 weeks.
//
// Each bonus is sized so the customers most of those sales come from stay under the 10% cashback ceiling (their tier's rate plus the
// category's bonus plus the promotion), in steps of 0.5%. A gas or diesel idea pays cents a gallon when gas is paid per gallon. Each idea
// carries the cost estimate the post form shows (utils/offerEstimate.ts) and any live or scheduled promotion it would run alongside.
// A challenge's reward line is not a sale and is left out. Nothing here is posted: HQ reads the idea, changes what it likes, and posts.

import prisma from '../config/prisma';
import { ProductCategory } from '@prisma/client';
import { CASHBACK_RATE_CAP, DEFAULT_TIER_RATES } from '../config/constants';
import { addStoreDays, storeDateKey, storeHour, storeWeekday, startOfStoreDate, endOfStoreDate } from './storeTime';
import { estimateOffer, Estimate } from './offerEstimate';
import { excludeDeletedCustomers } from './accountDeletion';
import { DEFAULT_LAPSED_DAYS } from './offerAudience';

export const IDEA_BASIS_DAYS = 56;
const HALF = IDEA_BASIS_DAYS / 2;
const WEEKS = IDEA_BASIS_DAYS / 7;
const MIN_CATEGORY_SALES = 40;        // fewer sales in 8 weeks than this, and a category's slow hours are noise
const MIN_TREND_SALES = 30;           // in the earlier 4 weeks, to call a drop a drop
const SLOW_RATIO = 0.7;               // the slowest 3 hours sell under 70% of a usual 3 hours
const DAY_RATIO = 0.75;               // and other days join it when under 75%
const DROP = 0.15;                    // a fall of 15% or more
const MIN_WIN_BACK = 5;

// The daytime blocks of 3 hours that are compared (store time)
const BLOCKS = [6, 9, 12, 15, 18] as const;
const BLOCK_EN: Record<number, string> = { 6: '6 to 9 AM', 9: '9 AM to noon', 12: 'noon to 3 PM', 15: '3 to 6 PM', 18: '6 to 9 PM' };
const BLOCK_ES: Record<number, string> = { 6: 'de 6 a 9 AM', 9: 'de 9 AM a 12 PM', 12: 'de 12 a 3 PM', 15: 'de 3 a 6 PM', 18: 'de 6 a 9 PM' };
const DAYS_EN = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const DAYS_ES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
export const CAT_EN: Record<string, string> = { GROCERIES: 'groceries', FROZEN_FOODS: 'frozen food', FRESH_FOODS: 'fresh food', GAS: 'gas', DIESEL: 'diesel', HOT_FOODS: 'hot food', OTHER: 'other items' };
const CAT_ES: Record<string, string> = { GROCERIES: 'abarrotes', FROZEN_FOODS: 'congelados', FRESH_FOODS: 'comida fresca', GAS: 'gasolina', DIESEL: 'diésel', HOT_FOODS: 'comida caliente', OTHER: 'otros artículos' };
const TIER_NAME: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', DIAMOND: 'Diamond', PLATINUM: 'Platinum' };

export type IdeaKind = 'SLOW_HOURS' | 'FALLING_CATEGORY' | 'SLOW_STORE' | 'WIN_BACK';

/** What the post form is filled with. Dates are store days (YYYY-MM-DD). */
export interface IdeaOffer {
  title: string; titleEs: string; description: string; descriptionEs: string;
  category: ProductCategory | null; storeId: string | null; storeName: string | null;
  bonusRate: number | null; gasBonusCentsPerGallon: number | null;
  happyDays: number[]; happyFrom: string | null; happyTo: string | null;
  startDate: string; endDate: string;
  audience: 'EVERYONE' | 'LAPSED'; audienceDays: number | null;
}

export interface PromotionIdea {
  id: string;
  kind: IdeaKind;
  headline: string;
  why: string;
  sizing: string;           // why the bonus is this size
  offer: IdeaOffer;
  estimate: Estimate;
  alongside: string[];      // live or scheduled promotions that already pay on some of the same sales
}

export interface IdeasResult {
  basis: { days: number; sales: number; from: string; to: string };
  ideas: PromotionIdea[];
  tooFew: boolean;          // too few sales to suggest anything yet
}

type Sale = { purchaseAmount: number; category: ProductCategory; storeId: string; createdAt: Date; tier: string };
type Rates = { tier: Record<string, number>; category: Record<string, number>; gasPerGallon: boolean };

const money = (n: number) => Math.round(n * 100) / 100;
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const pctText = (r: number) => `${Math.round(r * 1000) / 10}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hhmm = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
function joinList(items: string[], and: string): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/** The tier most of these sales (by amount) come from. */
function typicalTier(sales: Sale[]): string {
  const by = new Map<string, number>();
  for (const s of sales) by.set(s.tier, (by.get(s.tier) ?? 0) + s.purchaseAmount);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'BRONZE';
}

/**
 * The bonus for an idea: the preferred size, made smaller when the typical customer would pass the 10% ceiling, in steps of 0.5%.
 * null when there is no room at all (the category already pays close to the ceiling).
 */
export function sizeBonus(preferred: number, tier: string, categoryBonus: number, rates: Rates): { bonus: number; sizing: string } | null {
  const standing = (rates.tier[tier] ?? DEFAULT_TIER_RATES[tier] ?? 0.01) + categoryBonus;
  const room = Math.max(0, CASHBACK_RATE_CAP - standing);
  const bonus = Math.floor(Math.min(preferred, room) * 200 + 1e-9) / 200;
  if (bonus < 0.005) return null;
  const who = TIER_NAME[tier] ?? tier;
  const sizing = bonus < preferred
    ? `${pctText(bonus)}: most of these sales are ${who} members, who already get ${pctText(standing)}, and a sale pays 10% at most.`
    : `${pctText(bonus)}: most of these sales are ${who} members (${pctText(standing)} now), so they get all of it under the 10% ceiling.`;
  return { bonus, sizing };
}

async function loadRates(): Promise<Rates> {
  const [tiers, cats] = await Promise.all([prisma.tierCashbackRate.findMany(), prisma.categoryRate.findMany()]);
  return {
    tier: { ...DEFAULT_TIER_RATES, ...Object.fromEntries(tiers.map((t) => [t.tier, t.cashbackRate])) },
    category: Object.fromEntries(cats.map((c) => [c.category, c.cashbackRate])),
    gasPerGallon: tiers.some((t) => (t.gasCentsPerGallon ?? 0) > 0),
  };
}

type Live = { title: string; category: string | null; storeId: string | null };
function alongside(live: Live[], category: string | null, storeId: string | null): string[] {
  return live.filter((o) => (o.category == null || category == null || o.category === category) && (o.storeId == null || storeId == null || o.storeId === storeId)).map((o) => o.title);
}

const isGas = (c: string | null) => c === 'GAS' || c === 'DIESEL';

/** The bonus words: "3%" or "5¢ a gallon" / "5¢ por galón". */
function bonusWords(o: { bonusRate: number | null; gasBonusCentsPerGallon: number | null }): { en: string; es: string } {
  if (o.gasBonusCentsPerGallon != null) return { en: `${o.gasBonusCentsPerGallon}¢ a gallon`, es: `${o.gasBonusCentsPerGallon}¢ por galón` };
  const p = pctText(o.bonusRate ?? 0);
  return { en: p, es: p };
}

/** A gas idea paid in cents when gas pays per gallon, otherwise a percentage sized to the ceiling. */
function bonusFor(category: string | null, preferredPct: number, preferredCents: number, sales: Sale[], rates: Rates, categoryBonus: number):
  { bonusRate: number | null; gasBonusCentsPerGallon: number | null; sizing: string } | null {
  if (isGas(category) && rates.gasPerGallon) {
    return { bonusRate: null, gasBonusCentsPerGallon: preferredCents, sizing: `${preferredCents}¢ a gallon: gas pays per gallon, so the bonus does too. At today's prices that is far below the 10% ceiling.` };
  }
  const sized = sizeBonus(preferredPct, typicalTier(sales), categoryBonus, rates);
  return sized ? { bonusRate: sized.bonus, gasBonusCentsPerGallon: null, sizing: sized.sizing } : null;
}

export async function promotionIdeas(now: Date = new Date()): Promise<IdeasResult> {
  const since = new Date(now.getTime() - IDEA_BASIS_DAYS * 86_400_000);
  const half = new Date(now.getTime() - HALF * 86_400_000);
  const [rows, rates, offers, stores] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where: { status: 'APPROVED', isTestData: false, challengeId: null, referralId: null, createdAt: { gte: since, lt: now }, store: { isActive: true } },
      select: { purchaseAmount: true, category: true, storeId: true, createdAt: true, customer: { select: { tier: true } } },
    }),
    loadRates(),
    prisma.offer.findMany({
      where: { isActive: true, endDate: { gt: now } },
      select: { title: true, category: true, storeId: true, bonusRate: true, gasBonusCentsPerGallon: true, tierBonusRates: true },
    }),
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const sales: Sale[] = rows.map((r) => ({ purchaseAmount: r.purchaseAmount, category: r.category, storeId: r.storeId, createdAt: r.createdAt, tier: r.customer?.tier ?? 'BRONZE' }));
  const basis = { days: IDEA_BASIS_DAYS, sales: sales.length, from: storeDateKey(since), to: storeDateKey(now) };
  if (sales.length < MIN_CATEGORY_SALES) return { basis, ideas: [], tooFew: true };

  const live: Live[] = offers
    .filter((o) => o.bonusRate != null || o.gasBonusCentsPerGallon != null || (o.tierBonusRates && Object.keys(o.tierBonusRates as object).length > 0))
    .map((o) => ({ title: o.title, category: o.category, storeId: o.storeId }));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const tomorrow = addStoreDays(storeDateKey(now), 1);
  const span = (days: number) => ({ startDate: tomorrow, endDate: addStoreDays(tomorrow, days - 1) });
  const maxCategoryBonus = Math.max(0, ...[...new Set(sales.map((s) => s.category))].map((c) => rates.category[c] ?? 0));

  type Draft = Omit<PromotionIdea, 'estimate' | 'alongside'> & { weight: number };
  const drafts: Draft[] = [];

  // ── Slow hours, per category ──
  const byCat = new Map<string, Sale[]>();
  for (const s of sales) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);
  const slow: Draft[] = [];
  for (const [cat, list] of byCat) {
    if (list.length < MIN_CATEGORY_SALES) continue;
    const cell = new Map<string, number>();    // "day|block" -> amount over the 8 weeks
    for (const s of list) {
      const h = storeHour(s.createdAt);
      const bi = BLOCKS.findIndex((b) => h >= b && h < b + 3);
      if (bi < 0) continue;
      const k = `${storeWeekday(s.createdAt)}|${BLOCKS[bi]}`;
      cell.set(k, (cell.get(k) ?? 0) + s.purchaseAmount);
    }
    const daytime = [...cell.values()].reduce((n, v) => n + v, 0);
    const usual = daytime / (7 * BLOCKS.length);            // a usual 3 hours on a usual day, over the 8 weeks
    if (usual <= 0) continue;
    let best: { day: number; block: number; ratio: number } | null = null;
    for (let d = 0; d < 7; d++) for (const b of BLOCKS) {
      const ratio = (cell.get(`${d}|${b}`) ?? 0) / usual;
      if (!best || ratio < best.ratio) best = { day: d, block: b, ratio };
    }
    if (!best || best.ratio >= SLOW_RATIO) continue;
    const days = [0, 1, 2, 3, 4, 5, 6]
      .map((d) => ({ d, ratio: (cell.get(`${d}|${best!.block}`) ?? 0) / usual }))
      .filter((x) => x.d === best!.day || x.ratio < DAY_RATIO)
      .sort((a, b) => a.ratio - b.ratio).slice(0, 3).map((x) => x.d).sort((a, b) => a - b);
    const slowAmount = days.reduce((n, d) => n + (cell.get(`${d}|${best!.block}`) ?? 0), 0) / days.length;
    const below = Math.round((1 - slowAmount / usual) * 100);
    const bonus = bonusFor(cat, 0.03, 5, list, rates, rates.category[cat] ?? 0);
    if (!bonus) continue;
    const words = bonusWords(bonus);
    const daysEn = joinList(days.map((d) => DAYS_EN[d]), 'and'), daysEs = joinList(days.map((d) => DAYS_ES[d]), 'y');
    slow.push({
      id: `slow:${cat}:${days.join('')}:${best.block}`,
      kind: 'SLOW_HOURS',
      headline: `${cap(CAT_EN[cat])} sell least on ${daysEn}, ${BLOCK_EN[best.block]}`,
      why: `Those hours averaged ${dollars(slowAmount / WEEKS)} a week of ${CAT_EN[cat]} over the last 8 weeks, ${below}% below a usual 3 hours of the day (${dollars(usual / WEEKS)} a week).`,
      sizing: bonus.sizing,
      offer: {
        title: `${cap(CAT_EN[cat])} happy hour: ${words.en} extra`,
        titleEs: `Hora feliz de ${CAT_ES[cat]}: ${words.es} extra`,
        description: `Get ${words.en} extra cashback on ${CAT_EN[cat]}, ${daysEn} ${BLOCK_EN[best.block]}.`,
        descriptionEs: `Gana ${words.es} extra de reembolso en ${CAT_ES[cat]}, los ${daysEs} ${BLOCK_ES[best.block]}.`,
        category: cat as ProductCategory, storeId: null, storeName: null,
        bonusRate: bonus.bonusRate, gasBonusCentsPerGallon: bonus.gasBonusCentsPerGallon,
        happyDays: days, happyFrom: hhmm(best.block), happyTo: hhmm(best.block + 3),
        ...span(28), audience: 'EVERYONE', audienceDays: null,
      },
      weight: (usual - slowAmount) * days.length,
    });
  }
  drafts.push(...slow.sort((a, b) => b.weight - a.weight).slice(0, 3));

  // ── Falling: a category, then a store, last 4 weeks against the 4 before ──
  const trend = (key: (s: Sale) => string) => {
    const m = new Map<string, { before: number; beforeN: number; recent: number; list: Sale[] }>();
    for (const s of sales) {
      const k = key(s);
      const r = m.get(k) ?? { before: 0, beforeN: 0, recent: 0, list: [] };
      if (s.createdAt < half) { r.before += s.purchaseAmount; r.beforeN += 1; } else r.recent += s.purchaseAmount;
      r.list.push(s);
      m.set(k, r);
    }
    return [...m.entries()].filter(([, r]) => r.beforeN >= MIN_TREND_SALES && r.recent <= r.before * (1 - DROP))
      .sort((a, b) => (b[1].before - b[1].recent) - (a[1].before - a[1].recent)).slice(0, 2);
  };
  for (const [cat, r] of trend((s) => s.category)) {
    const bonus = bonusFor(cat, 0.02, 3, r.list, rates, rates.category[cat] ?? 0);
    if (!bonus) continue;
    const words = bonusWords(bonus);
    const down = Math.round((1 - r.recent / r.before) * 100);
    drafts.push({
      id: `falling:${cat}`,
      kind: 'FALLING_CATEGORY',
      headline: `Sales of ${CAT_EN[cat]} are down ${down}%`,
      why: `${dollars(r.recent)} in the last 4 weeks, against ${dollars(r.before)} in the 4 weeks before.`,
      sizing: bonus.sizing,
      offer: {
        title: `${words.en} extra on ${CAT_EN[cat]}`, titleEs: `${words.es} extra en ${CAT_ES[cat]}`,
        description: `Get ${words.en} extra cashback on ${CAT_EN[cat]}, every day for two weeks.`,
        descriptionEs: `Gana ${words.es} extra de reembolso en ${CAT_ES[cat]}, todos los días por dos semanas.`,
        category: cat as ProductCategory, storeId: null, storeName: null,
        bonusRate: bonus.bonusRate, gasBonusCentsPerGallon: bonus.gasBonusCentsPerGallon,
        happyDays: [], happyFrom: null, happyTo: null, ...span(14), audience: 'EVERYONE', audienceDays: null,
      },
      weight: r.before - r.recent,
    });
  }
  for (const [sid, r] of trend((s) => s.storeId)) {
    const name = storeName.get(sid) ?? 'One store';
    const sized = sizeBonus(0.02, typicalTier(r.list), maxCategoryBonus, rates);
    if (!sized) continue;
    const p = pctText(sized.bonus);
    const down = Math.round((1 - r.recent / r.before) * 100);
    drafts.push({
      id: `store:${sid}`,
      kind: 'SLOW_STORE',
      headline: `Sales at ${name} are down ${down}%`,
      why: `${dollars(r.recent)} in the last 4 weeks, against ${dollars(r.before)} in the 4 weeks before.`,
      sizing: sized.sizing,
      offer: {
        title: `${p} extra at ${name}`, titleEs: `${p} extra en ${name}`,
        description: `Get ${p} extra cashback on everything at ${name} for two weeks.`,
        descriptionEs: `Gana ${p} extra de reembolso en todo en ${name} por dos semanas.`,
        category: null, storeId: sid, storeName: name, bonusRate: sized.bonus, gasBonusCentsPerGallon: null,
        happyDays: [], happyFrom: null, happyTo: null, ...span(14), audience: 'EVERYONE', audienceDays: null,
      },
      weight: r.before - r.recent,
    });
  }

  // ── Win-back: customers who came in at least twice but not in 30 days ──
  const lapsedSince = new Date(now.getTime() - DEFAULT_LAPSED_DAYS * 86_400_000);
  const visits = await prisma.pointsTransaction.groupBy({
    by: ['customerId'],
    where: { status: { not: 'REJECTED' }, isTestData: false, challengeId: null, referralId: null, customer: excludeDeletedCustomers },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  const lapsed = visits.filter((v) => v._count._all >= 2 && v._max.createdAt && v._max.createdAt < lapsedSince).length;
  if (lapsed >= MIN_WIN_BACK) {
    const sized = sizeBonus(0.05, typicalTier(sales), maxCategoryBonus, rates);
    if (sized) {
      const p = pctText(sized.bonus);
      drafts.push({
        id: 'winback',
        kind: 'WIN_BACK',
        headline: `${lapsed.toLocaleString('en-US')} regular customers have not been back in ${DEFAULT_LAPSED_DAYS} days`,
        why: `Each bought at least twice before. A win-back promotion is shown and sent only to customers who have not bought in ${DEFAULT_LAPSED_DAYS} days, and pays on their first purchase back.`,
        sizing: sized.sizing,
        offer: {
          title: `We miss you: ${p} extra`, titleEs: `Te extrañamos: ${p} extra`,
          description: `Come back to Lucky Stop and get ${p} extra cashback on your next purchase.`,
          descriptionEs: `Vuelve a Lucky Stop y gana ${p} extra de reembolso en tu próxima compra.`,
          category: null, storeId: null, storeName: null, bonusRate: sized.bonus, gasBonusCentsPerGallon: null,
          happyDays: [], happyFrom: null, happyTo: null, ...span(28), audience: 'LAPSED', audienceDays: DEFAULT_LAPSED_DAYS,
        },
        weight: 0,
      });
    }
  }

  // What each would cost, from the same estimate as the post form
  const ideas: PromotionIdea[] = [];
  for (const { weight: _w, ...d } of drafts) {
    const o = d.offer;
    const estimate = await estimateOffer({
      storeId: o.storeId, category: o.category, bonusRate: o.bonusRate, tierBonusRates: null, gasBonusCentsPerGallon: o.gasBonusCentsPerGallon,
      startDate: startOfStoreDate(o.startDate), endDate: endOfStoreDate(o.endDate),
      happyDays: o.happyDays, happyFrom: o.happyFrom, happyTo: o.happyTo,
      audience: o.audience, audienceTier: null, audienceDays: o.audienceDays, budgetCap: null, dailyCapPerCustomer: null,
    }, now);
    ideas.push({ ...d, estimate: { ...estimate, estimatedExtra: money(estimate.estimatedExtra) }, alongside: alongside(live, o.category, o.storeId) });
  }
  return { basis, ideas, tooFew: false };
}
