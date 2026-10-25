// Challenge of the week (2026-10-24, HQ switch in admin > Engagement): HQ puts one challenge on each week (Monday to Sunday, store time),
// the app features it at the top of the challenges with a countdown to the end of the week, and a Monday morning push tells customers.
// Featuring pays nothing new: a challenge pays its own reward (utils/challenges.ts creditChallenges). HQ can also make the week's challenge
// here, with limits the server owns (the general challenge form allows rewards up to $1,000): at most 500 pts, one reward per customer per
// week, the window fixed to that week, and no midnight "New challenge!" push (it is marked announced; the Monday push announces it).
//
// The schedule is a list of { weekOf: Monday, challengeId } in the ENGAGEMENT settings (no migration). A week whose challenge has since
// ended, been switched off or removed simply has nothing featured: reads never fail on a stale entry.
import { ProductCategory, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { engagement, feature } from './appSettings';
import { excludeDeletedCustomers } from './accountDeletion';
import { sendPushToUser } from './push';
import { voiced } from './mascot';
import { membersInAudience } from './offerAudience';
import { addStoreDays, endOfStoreDate, startOfStoreDate, storeDateKey, storeHour } from './storeTime';
import { dow, weekStartKey } from './engagement';

const DAY = 86_400_000;
export const WEEKLY_AHEAD_WEEKS = 8;      // this week and the next seven can be planned
const PUSH_PER_RUN = 400;                 // the Monday push has its own budget, apart from the other nudges
const quiet = (hour: number, from: number, to: number) => (from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to);

export type WeekPick = { weekOf: string; challengeId: string };

/** The first and last instant of a store week (the week of Nov 1, when the clocks go back, is 169 hours: worked out, never assumed). */
export const weekWindow = (weekOf: string) => ({ start: startOfStoreDate(weekOf), end: endOfStoreDate(addStoreDays(weekOf, 6)) });

/** This week's pick, or null (switched off, or nothing put on this week). */
export function thisWeekPick(now: Date = new Date()): WeekPick | null {
  const cfg = engagement().weeklyChallenge;
  if (!cfg.enabled) return null;
  const weekOf = weekStartKey(now);
  return cfg.schedule.find((e) => e.weekOf === weekOf) ?? null;
}

/**
 * HQ's schedule checked against the real challenges (the settings cleaner can only check the shape): each must exist, be a spend or
 * visits challenge (never a win-back gift or a hidden system row), be on, not be over, and run during its week. Weeks already past are
 * dropped. Returns the list to save, or the reason it cannot be saved.
 */
export async function checkSchedule(schedule: WeekPick[], now: Date = new Date()): Promise<{ ok: true; schedule: WeekPick[] } | { ok: false; error: string }> {
  const thisWeek = weekStartKey(now);
  const keep = schedule.filter((e) => e.weekOf >= thisWeek);
  if (!keep.length) return { ok: true, schedule: keep };
  const rows = await prisma.challenge.findMany({ where: { id: { in: [...new Set(keep.map((e) => e.challengeId))] } }, select: { id: true, kind: true, isActive: true, startDate: true, endDate: true, title: true } });
  const by = new Map(rows.map((r) => [r.id, r]));
  for (const e of keep) {
    const c = by.get(e.challengeId);
    const week = `the week of ${e.weekOf}`;
    if (!c) return { ok: false, error: `The challenge picked for ${week} was not found.` };
    if (c.kind !== 'SPEND' && c.kind !== 'VISITS') return { ok: false, error: `Only a spend or a visits challenge can be the challenge of the week (${week}).` };
    if (!c.isActive) return { ok: false, error: `"${c.title}" is switched off, so it cannot be featured (${week}).` };
    if (c.endDate <= now) return { ok: false, error: `"${c.title}" has already ended.` };
    const w = weekWindow(e.weekOf);
    if (c.endDate <= w.start || c.startDate > w.end) return { ok: false, error: `"${c.title}" does not run during ${week}.` };
  }
  return { ok: true, schedule: keep };
}

const CATEGORIES = Object.values(ProductCategory) as string[];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export interface WeeklyDraft {
  weekOf: string; kind: 'SPEND' | 'VISITS'; target: number; reward: number; minPurchase: number | null; category: ProductCategory | null; storeId: string | null;
  title: string; titleEs: string | null; description: string; descriptionEs: string | null; startDate: Date; endDate: Date;
}

/** The week's challenge as HQ asked for it, inside the server's limits, or the reason it cannot be made. */
export function draftWeekly(b: any, stores: Set<string>, now: Date = new Date()): WeeklyDraft | string {
  const thisWeek = weekStartKey(now);
  const weekOf = typeof b?.weekOf === 'string' ? b.weekOf : '';
  const weeks = Array.from({ length: WEEKLY_AHEAD_WEEKS }, (_, i) => addStoreDays(thisWeek, 7 * i));
  if (!weeks.includes(weekOf)) return 'Pick this week or one of the next seven.';
  const kind = b?.kind === 'VISITS' ? 'VISITS' : b?.kind === 'SPEND' ? 'SPEND' : null;
  if (!kind) return 'Choose spend or visits.';
  const target = Number(b?.target), pts = Math.round(Number(b?.rewardPts));
  if (!(pts >= 1 && pts <= 500)) return 'The reward must be from 1 to 500 points.';
  if (kind === 'SPEND' && !(target >= 1 && target <= 500)) return 'A spend target must be from $1 to $500.';
  if (kind === 'SPEND' && pts / 100 >= target) return 'The reward must be less than the amount they spend.';
  if (kind === 'VISITS' && !(Number.isInteger(target) && target >= 2 && target <= 12)) return 'A visits target must be from 2 to 12 purchases.';
  const minPurchase = kind === 'VISITS' ? Math.round(Math.max(0, Math.min(100, Number(b?.minPurchase) || 0)) * 100) / 100 : null;
  const category = typeof b?.category === 'string' && CATEGORIES.includes(b.category) ? (b.category as ProductCategory) : null;
  const storeId = typeof b?.storeId === 'string' && b.storeId ? b.storeId : null;
  if (storeId && !stores.has(storeId)) return 'That store was not found.';
  const w = weekWindow(weekOf);
  if (w.end <= now) return 'That week is already over.';
  const start = w.start > now ? w.start : now;   // made mid-week: it starts now, never backdated
  const title = str(b?.title, 100);
  if (!title) return 'Give the challenge a title.';
  return {
    weekOf, kind, target: kind === 'SPEND' ? Math.round(target * 100) / 100 : target, reward: pts / 100, minPurchase: minPurchase || null, category, storeId,
    title, titleEs: str(b?.titleEs, 100) || null, description: str(b?.description, 500), descriptionEs: str(b?.descriptionEs, 500) || null, startDate: start, endDate: w.end,
  };
}

const WEEKDAYS = { en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] };

/**
 * The Monday push (a smart nudge: HQ's nudges switch, its quiet hours and each person's weekly cap apply). Monday from 9 AM to before 2 PM
 * store time, to customers with a phone who can take part (the challenge's audience, and for a store's challenge only people who have bought
 * there) and have not finished it. Once per person per week (kind NUDGE_WEEKLY_CHALLENGE, key the Monday), claimed before sending.
 */
export async function runWeeklyChallengePush(now: Date = new Date()): Promise<number> {
  const all = engagement();
  if (!all.weeklyChallenge.enabled || !all.nudges.enabled || !all.nudges.weeklyChallenge.enabled || !feature('challenges')) return 0;
  if (dow(storeDateKey(now)) !== 1) return 0;
  const hour = storeHour(now);
  if (hour < 9 || hour >= 14 || quiet(hour, all.nudges.quietFrom, all.nudges.quietTo)) return 0;
  const pick = thisWeekPick(now);
  if (!pick) return 0;
  const c = await prisma.challenge.findUnique({ where: { id: pick.challengeId } });
  if (!c || !c.isActive || (c.kind !== 'SPEND' && c.kind !== 'VISITS') || c.startDate > now || c.endDate <= now) return 0;   // a challenge starting Tuesday is not promised on Monday

  const kind = 'NUDGE_WEEKLY_CHALLENGE', key = pick.weekOf;
  const told = new Set((await prisma.engagementEvent.findMany({ where: { kind, key }, select: { customerId: true }, take: 50_000 })).map((e) => e.customerId));
  const storeBuyers = c.storeId
    ? (await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { storeId: c.storeId, status: TransactionStatus.APPROVED, challengeId: null, purchaseAmount: { gt: 0 } }, _count: { _all: true } })).map((r) => r.customerId)
    : null;
  let people = await prisma.user.findMany({
    where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers, pushTokens: { some: {} }, ...(storeBuyers ? { id: { in: storeBuyers } } : {}) },
    select: { id: true, language: true }, orderBy: { createdAt: 'asc' }, take: 20_000,
  });
  people = people.filter((p) => !told.has(p.id));
  if (!people.length) return 0;
  people = await membersInAudience(c, people, now);
  const ids = people.map((p) => p.id);
  const [finished, recent] = await Promise.all([
    c.repeats ? Promise.resolve([] as { customerId: string }[]) : prisma.challengeProgress.findMany({ where: { challengeId: c.id, timesEarned: { gte: 1 }, customerId: { in: ids } }, select: { customerId: true } }),
    prisma.engagementEvent.groupBy({ by: ['customerId'], where: { kind: { startsWith: 'NUDGE_' }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) }, customerId: { in: ids } }, _count: { _all: true } }),
  ]);
  const done = new Set(finished.map((f) => f.customerId));
  const thisWeek = new Map(recent.map((r) => [r.customerId, r._count._all]));
  const until = c.endDate < weekWindow(pick.weekOf).end ? c.endDate : weekWindow(pick.weekOf).end;
  const endDay = dow(storeDateKey(until));
  const pts = Math.round(c.reward * 100).toLocaleString('en-US');
  let budget = PUSH_PER_RUN, sent = 0;
  for (const p of people) {
    if (budget <= 0) break;
    if (done.has(p.id) || (thisWeek.get(p.id) ?? 0) >= all.nudges.maxPerWeek) continue;
    const made = await prisma.engagementEvent.createMany({ data: [{ customerId: p.id, kind, key }], skipDuplicates: true });
    if (made.count === 0) continue;   // another server copy told them a moment ago
    const es = p.language === 'es';
    const name = (es && c.titleEs) || c.title;
    const title = es ? '🏆 El reto de la semana' : "🏆 This week's challenge";
    const body = es ? `${name}: gana ${pts} pts. Termina el ${WEEKDAYS.es[endDay]}.` : `${name}: earn ${pts} pts. Ends ${WEEKDAYS.en[endDay]}.`;
    await sendPushToUser(p.id, voiced(title), body, 'OFFER', '/(customer)/home?scrollTo=challenges', until);   // the inbox line goes when the week ends
    sent++; budget--;
  }
  return sent;
}
