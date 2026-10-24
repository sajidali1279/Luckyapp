// The engagement jobs (2026-10-23): pay finished store goals, send the smart nudges, and tell people their gas price alert is met.
// Everything here is switched on or off by HQ in admin > Engagement (utils/engagementConfig.ts) and does nothing while it is off.
// Nudges are polite on purpose: never in quiet hours (store time), at most N a week per person (HQ's number), and each kind only
// once for the same thing (engagement_events, unique per customer, kind and key), so a restart or two server copies cannot send twice.
import cron from 'node-cron';
import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { engagement } from './appSettings';
import { excludeDeletedCustomers } from './accountDeletion';
import { sendPushToUser } from './push';
import { addStoreDays, storeDateKey, storeDayStart } from './storeTime';
import { computeStreak, dow, payFinishedGoals, purchaseWeeks, storeHour, weekStartKey } from './engagement';
import { getCurrentPeriod } from './tier';
import { runWelcome } from './engagementWelcome';

const DAY = 86_400_000;
const PER_RUN = 150;   // most nudges one run sends, so a bad setting cannot flood anyone

export const inQuietHours = (hour: number, from: number, to: number) => (from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to);

type Who = { id: string; language: string | null };
const CUSTOMERS = { role: 'CUSTOMER' as const, isActive: true, ...excludeDeletedCustomers, pushTokens: { some: {} } };

/** Who already got this kind (and key) of nudge since `since`: left out of the query itself, so a long list of people does not starve the ones behind them. */
async function alreadyNudged(kind: string, since: Date, key?: string): Promise<string[]> {
  const rows = await prisma.engagementEvent.findMany({ where: { kind, ...(key ? { key } : {}), createdAt: { gte: since } }, select: { customerId: true }, take: 20_000 });
  return rows.map((r) => r.customerId);
}

async function underWeeklyCap(customerId: string, max: number, now: Date) {
  const sent = await prisma.engagementEvent.count({ where: { customerId, kind: { startsWith: 'NUDGE_' }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } });
  return sent < max;
}

/** Records the nudge (once per customer, kind and key) and only then pushes it. Returns whether it was sent. */
async function nudge(who: Who, kind: string, key: string, en: [string, string], es: [string, string], url: string): Promise<boolean> {
  const made = await prisma.engagementEvent.createMany({ data: [{ customerId: who.id, kind, key }], skipDuplicates: true });
  if (made.count === 0) return false;
  const [title, body] = who.language === 'es' ? es : en;
  await sendPushToUser(who.id, title, body, 'OFFER', url);
  return true;
}

export async function runNudges(now: Date = new Date()): Promise<Record<string, number>> {
  const cfg = engagement().nudges;
  const sent: Record<string, number> = { nearReward: 0, streakRisk: 0, tierReset: 0, comeback: 0 };
  if (!cfg.enabled) return sent;
  if (inQuietHours(storeHour(now), cfg.quietFrom, cfg.quietTo)) return sent;
  let budget = PER_RUN;
  const today = storeDateKey(now);
  const month = today.slice(0, 7);

  // 1. "You're 120 pts from a free coffee"
  if (cfg.nearReward.enabled && budget > 0) {
    const items = await prisma.redemptionCatalogItem.findMany({ where: { isActive: true }, select: { id: true, title: true, pointsCost: true } });
    const w = cfg.nearReward.withinPts;
    if (items.length) {
      const skip = await alreadyNudged('NUDGE_NEAR_REWARD', new Date(now.getTime() - 14 * DAY));
      const near = await prisma.user.findMany({
        where: { ...CUSTOMERS, id: { notIn: skip }, OR: items.map((i) => ({ pointsBalance: { gte: (i.pointsCost - w) / 100, lt: i.pointsCost / 100 } })) },
        select: { id: true, language: true, pointsBalance: true }, orderBy: { pointsBalance: 'desc' }, take: 400,
      });
      const recent = new Set((await prisma.engagementEvent.findMany({ where: { kind: 'NUDGE_NEAR_REWARD', customerId: { in: near.map((u) => u.id) }, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } }, select: { customerId: true } })).map((e) => e.customerId));
      for (const u of near) {
        if (budget <= 0) break;
        if (recent.has(u.id) || !(await underWeeklyCap(u.id, cfg.maxPerWeek, now))) continue;
        const pts = Math.round(u.pointsBalance * 100);
        const target = items.filter((i) => i.pointsCost > pts && i.pointsCost - pts <= w).sort((a, b) => a.pointsCost - b.pointsCost)[0];
        if (!target) continue;
        const gap = target.pointsCost - pts;
        if (await nudge(u, 'NUDGE_NEAR_REWARD', `${target.id}:${month}`,
          ['🎁 So close!', `You are ${gap} pts away from ${target.title}. One more stop and it is yours.`],
          ['🎁 ¡Ya casi!', `Te faltan ${gap} pts para ${target.title}. Una parada más y es tuyo.`], '/(customer)/rewards')) { sent.nearReward++; budget--; }
      }
    }
  }

  // 2. "Keep your 4-week streak: one purchase by Sunday" (Friday and Saturday, from 10 AM)
  if (cfg.streakRisk.enabled && engagement().streaks.enabled && budget > 0 && [5, 6].includes(dow(today)) && storeHour(now) >= 10) {
    const thisWeek = weekStartKey(now);
    const lastWeek = addStoreDays(thisWeek, -7);
    const min = Math.max(0.01, engagement().streaks.minPurchase);
    const at = (key: string) => storeDayStart(new Date(`${key}T18:00:00Z`));   // midnight at the start of that store day
    const [prev, cur] = await Promise.all([
      prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gte: min }, createdAt: { gte: at(lastWeek), lt: at(thisWeek) } }, _count: { _all: true } }),
      prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gte: min }, createdAt: { gte: at(thisWeek) } }, _count: { _all: true } }),
    ]);
    const done = new Set(cur.map((c) => c.customerId));
    const told = new Set(await alreadyNudged('NUDGE_STREAK_RISK', new Date(now.getTime() - 7 * DAY), thisWeek));
    const ids = prev.map((p) => p.customerId).filter((id) => !done.has(id) && !told.has(id)).slice(0, 600);
    const people = await prisma.user.findMany({ where: { ...CUSTOMERS, id: { in: ids } }, select: { id: true, language: true } });
    for (const u of people) {
      if (budget <= 0) break;
      if (!(await underWeeklyCap(u.id, cfg.maxPerWeek, now))) continue;
      const s = computeStreak(await purchaseWeeks(prisma, u.id, min, now, engagement().streaks.since), thisWeek);
      if (s.weeks < 2 || !s.atRisk) continue;
      if (await nudge(u, 'NUDGE_STREAK_RISK', thisWeek,
        ['🔥 Keep your streak going', `Your ${s.weeks}-week streak ends Sunday. One purchase this weekend keeps it alive.`],
        ['🔥 No pierdas tu racha', `Tu racha de ${s.weeks} semanas termina el domingo. Una compra este fin de semana la mantiene.`], '/(customer)/home')) { sent.streakRisk++; budget--; }
    }
  }

  // 3. "Your Gold tier period ends Dec 31" (once per period, in the last N days of it, around midday)
  if (cfg.tierReset.enabled && budget > 0 && storeHour(now) >= 10 && storeHour(now) < 14) {
    const period = getCurrentPeriod(now);
    const [year, half] = period.split('-H');
    const endKey = half === '1' ? `${year}-06-30` : `${year}-12-31`;
    const left = Math.round((Date.parse(`${endKey}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
    if (left >= 0 && left <= cfg.tierReset.daysBefore) {
      const skip = await alreadyNudged('NUDGE_TIER_RESET', new Date(now.getTime() - 40 * DAY), period);
      const people = await prisma.user.findMany({ where: { ...CUSTOMERS, id: { notIn: skip }, tier: { not: 'BRONZE' } }, select: { id: true, language: true, tier: true, periodPoints: true }, orderBy: { periodPoints: 'desc' }, take: 500 });
      for (const u of people) {
        if (budget <= 0) break;
        if (!(await underWeeklyCap(u.id, cfg.maxPerWeek, now))) continue;
        const tier = u.tier.charAt(0) + u.tier.slice(1).toLowerCase();
        const pts = Math.round(u.periodPoints * 100);
        if (await nudge(u, 'NUDGE_TIER_RESET', period,
          [`📅 ${left} days left in this tier period`, `You are ${tier} with ${pts} pts earned this period. The period ends ${endKey}.`],
          [`📅 Quedan ${left} días en este período`, `Eres ${tier} con ${pts} pts ganados este período. El período termina el ${endKey}.`], '/(customer)/rewards')) { sent.tierReset++; budget--; }
      }
    }
  }

  // 4. "We miss you: you have 640 pts waiting"
  if (cfg.comeback.enabled && budget > 0) {
    const cutoff = new Date(now.getTime() - cfg.comeback.quietDays * DAY);
    const skip = await alreadyNudged('NUDGE_COMEBACK', new Date(now.getTime() - 30 * DAY));
    const people = await prisma.user.findMany({
      where: { ...CUSTOMERS, id: { notIn: skip }, pointsBalance: { gte: 1 }, AND: [{ pointsEarned: { some: { status: TransactionStatus.APPROVED, purchaseAmount: { gt: 0 } } } }, { pointsEarned: { none: { status: TransactionStatus.APPROVED, createdAt: { gte: cutoff } } } }] },
      select: { id: true, language: true, pointsBalance: true }, orderBy: { pointsBalance: 'desc' }, take: 300,
    });
    const recent = new Set((await prisma.engagementEvent.findMany({ where: { kind: 'NUDGE_COMEBACK', customerId: { in: people.map((u) => u.id) }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { customerId: true } })).map((e) => e.customerId));
    for (const u of people) {
      if (budget <= 0) break;
      if (recent.has(u.id) || !(await underWeeklyCap(u.id, cfg.maxPerWeek, now))) continue;
      const pts = Math.round(u.pointsBalance * 100);
      if (await nudge(u, 'NUDGE_COMEBACK', month,
        ['👋 We miss you', `You have ${pts} pts waiting at Lucky Stop. Stop by and put them to use.`],
        ['👋 Te extrañamos', `Tienes ${pts} pts esperándote en Lucky Stop. Pasa y úsalos.`], '/(customer)/rewards')) { sent.comeback++; budget--; }
    }
  }
  return sent;
}

/** Pays finished store goals and tells the winners. */
export async function runGoals(now: Date = new Date()) {
  const r = await payFinishedGoals(now);
  if (r.winners.length) {
    const langs = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(r.winners.map((w) => w.customerId))] } }, select: { id: true, language: true } })).map((u) => [u.id, u.language]));
    for (const w of r.winners) {
      const es = langs.get(w.customerId) === 'es';
      sendPushToUser(w.customerId, es ? '🎉 ¡Meta de la tienda cumplida!' : '🎉 Store goal reached!', es ? `${w.titleEs || w.title}: ${w.pts} pts agregados a tu saldo.` : `${w.title}: ${w.pts} pts added to your balance.`, 'OFFER', '/(customer)/home').catch(() => {});
    }
  }
  return r;
}

/**
 * Called when a store's gas price is saved: everyone whose alert for that store and fuel is met (price at or under what they asked for) is
 * told, at most once a day each. Fire and forget: a price save never waits on it.
 */
export async function checkGasAlerts(storeId: string, prices: { GAS?: number | null; DIESEL?: number | null }, now: Date = new Date()): Promise<number> {   // pass only the fuels whose price just went DOWN
  if (!engagement().gasAlerts.enabled) return 0;
  let sent = 0;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  for (const fuel of ['GAS', 'DIESEL'] as const) {
    const price = prices[fuel];
    if (price == null || !(price > 0)) continue;
    const alerts = await prisma.gasAlert.findMany({ where: { storeId, fuel, maxPrice: { gte: price }, OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(now.getTime() - DAY) } }] }, take: 500 });
    if (!alerts.length) continue;
    const people = new Map((await prisma.user.findMany({ where: { id: { in: alerts.map((a) => a.customerId) }, isActive: true, ...excludeDeletedCustomers }, select: { id: true, language: true } })).map((u) => [u.id, u]));
    for (const a of alerts) {
      const u = people.get(a.customerId);
      if (!u) continue;
      const claimed = await prisma.gasAlert.updateMany({ where: { id: a.id, OR: [{ lastSentAt: null }, { lastSentAt: { lt: new Date(now.getTime() - DAY) } }] }, data: { lastSentAt: now } });
      if (claimed.count === 0) continue;   // another copy of the server already told them
      const label = fuel === 'GAS' ? 'Regular' : 'Diesel';
      const money = `$${price.toFixed(3).replace(/0$/, '')}`;
      await sendPushToUser(u.id, u.language === 'es' ? '⛽ ¡Bajó el precio!' : '⛽ Price alert', u.language === 'es' ? `${label} está en ${money} en ${store?.name ?? 'tu tienda'}.` : `${label} is ${money} at ${store?.name ?? 'your store'}.`, 'OFFER', '/(customer)/home');
      sent++;
    }
  }
  return sent;
}

let nudging = false, paying = false, welcoming = false;   // a run that is still going when the next one is due makes the next one skip, not pile on
export function startEngagementCron() {
  cron.schedule('*/30 * * * *', () => {
    if (nudging) return;
    nudging = true;
    runNudges().catch((e) => console.error('[engagement] nudges failed:', e?.message ?? e)).finally(() => { nudging = false; });
  });
  cron.schedule('20 * * * *', () => {
    if (paying) return;
    paying = true;
    runGoals().catch((e) => console.error('[engagement] goals failed:', e?.message ?? e)).finally(() => { paying = false; });
  });
  cron.schedule('5,35 * * * *', () => {   // the welcome series, a few minutes after the nudges so the two never start together
    if (welcoming) return;
    welcoming = true;
    runWelcome().catch((e) => console.error('[engagement] welcome series failed:', e?.message ?? e)).finally(() => { welcoming = false; });
  });
  console.log('[engagement] nudges and the welcome series every 30 minutes, store goals every hour, only for what HQ has switched on');
}
