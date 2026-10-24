// Birthday gift (2026-10-24, HQ switch in admin > Engagement): on a customer's birthday (the month and day they gave in Profile; no year is
// kept) a warm greeting push after 10 AM store time, and, when HQ sets a bonus, points once a year. People born on Feb 29 celebrate on
// Feb 28 in other years. The bonus only goes to customers who bought in the last N days (HQ's number; 0 means anyone who has ever bought),
// is paid as a reward line at the store they last bought at (so that store's platform fee applies, like any bonus), and comes out of a
// chain-wide monthly budget that is a hard cap (utils/engagementBudget.ts): when it is spent, the greeting still goes out, without points.
// Personal-moment push: never in HQ's quiet hours, only between 10 AM and 8 PM; one engagement_events row per customer and year, written
// in the same transaction as the bonus and before the push, so a restart or a second server copy can never greet or pay twice.
import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { engagement } from './appSettings';
import { excludeDeletedCustomers } from './accountDeletion';
import { sendPushToUser } from './push';
import { storeDateKey, storeHour } from './storeTime';
import { payBonus } from './engagement';
import { ensureBudgetLock, takeFromBudget } from './engagementBudget';
import type { PushText } from './engagementConfig';

const DAY = 86_400_000;
const PER_RUN = 1000;
const SEND_FROM = 10, SEND_UNTIL = 20;
const quiet = (hour: number, from: number, to: number) => (from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Whose birthday it is today, in store time: the month and the day(s) of month (Feb 28 also takes Feb 29 in a year without one). */
export function birthdaysOn(now: Date): { year: string; month: number; days: number[] } {
  const [y, m, d] = storeDateKey(now).split('-').map(Number);
  return { year: String(y), month: m, days: m === 2 && d === 28 && !isLeap(y) ? [28, 29] : [d] };
}
export function isBirthday(birthMonth: number | null | undefined, birthDay: number | null | undefined, now: Date): boolean {
  if (!birthMonth || !birthDay) return false;
  const t = birthdaysOn(now);
  return birthMonth === t.month && t.days.includes(birthDay);
}

/** {name} and {pts} filled in; with no first name, ", {name}" goes away rather than leaving "Happy birthday, !". */
export function fillBirthday(t: PushText, es: boolean, name: string | null | undefined, pts: number): { title: string; body: string } {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const fill = (s: string) => (first ? s.replace(/\{name\}/g, first) : s.replace(/,?\s*\{name\}/g, '')).replace(/\{pts\}/g, pts.toLocaleString('en-US')).replace(/\s+([!.,])/g, '$1').trim();
  return { title: fill(es ? t.titleEs : t.titleEn), body: fill(es ? t.bodyEs : t.bodyEn) };
}

export async function runBirthdays(now: Date = new Date()): Promise<{ greeted: number; paid: number; pts: number }> {
  const out = { greeted: 0, paid: 0, pts: 0 };
  const all = engagement();
  const cfg = all.birthday;
  if (!cfg.enabled) return out;
  const hour = storeHour(now);
  if (hour < SEND_FROM || hour >= SEND_UNTIL || quiet(hour, all.nudges.quietFrom, all.nudges.quietTo)) return out;
  const { year, month, days } = birthdaysOn(now);

  const people = await prisma.user.findMany({
    where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers, birthMonth: month, birthDay: { in: days } },
    select: { id: true, name: true, language: true }, orderBy: { createdAt: 'asc' }, take: 5000,
  });
  if (!people.length) return out;
  const ids = people.map((p) => p.id);
  const [done, lastBuys] = await Promise.all([
    prisma.engagementEvent.findMany({ where: { kind: 'BIRTHDAY', key: year, customerId: { in: ids } }, select: { customerId: true } }),
    // each person's latest purchase: where it was (the bonus line's store) and when (the "bought lately" rule)
    prisma.pointsTransaction.findMany({
      where: { customerId: { in: ids }, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gt: 0 } },
      orderBy: { createdAt: 'desc' }, distinct: ['customerId'], select: { customerId: true, storeId: true, createdAt: true },
    }),
  ]);
  const greetedAlready = new Set(done.map((d) => d.customerId));
  const last = new Map(lastBuys.map((t) => [t.customerId, t]));
  if (cfg.bonusPts > 0) await ensureBudgetLock('BIRTHDAY');
  let budget = PER_RUN;

  for (const p of people) {
    if (budget <= 0) break;
    if (greetedAlready.has(p.id)) continue;
    const buy = last.get(p.id);
    const deserves = cfg.bonusPts > 0 && !!buy && (cfg.needBoughtDays === 0 || buy.createdAt.getTime() >= now.getTime() - cfg.needBoughtDays * DAY);
    const result = await prisma.$transaction(async (db) => {
      const pts = deserves ? await takeFromBudget(db, 'BIRTHDAY', cfg.monthlyBudgetPts, cfg.bonusPts, now) : 0;
      const made = await db.engagementEvent.createMany({ data: [{ customerId: p.id, kind: 'BIRTHDAY', key: year, points: pts / 100 }], skipDuplicates: true });
      if (made.count === 0) return null;   // another server copy greeted them a moment ago
      if (pts > 0) await payBonus(db, { customerId: p.id, storeId: buy!.storeId, points: pts, note: 'Birthday gift', kind: 'BIRTHDAY' });
      return { pts };
    });
    if (!result) continue;
    budget--;
    out.greeted++;
    if (result.pts > 0) { out.paid++; out.pts += result.pts; }
    const msg = fillBirthday(result.pts > 0 ? cfg.gift : cfg.greeting, p.language === 'es', p.name, result.pts);
    await sendPushToUser(p.id, msg.title, msg.body, 'OFFER', result.pts > 0 ? '/(customer)/history' : '/(customer)/home');
  }
  return out;
}

/** For the app's Home (GET /engagement/me): is it their birthday today, and what was paid this year (null while HQ has it off). */
export async function birthdayFor(customerId: string, now: Date = new Date()): Promise<{ today: boolean; pts: number; name: string | null } | null> {
  if (!engagement().birthday.enabled) return null;
  const u = await prisma.user.findUnique({ where: { id: customerId }, select: { birthMonth: true, birthDay: true, name: true } });
  if (!u || !isBirthday(u.birthMonth, u.birthDay, now)) return { today: false, pts: 0, name: null };
  const ev = await prisma.engagementEvent.findFirst({ where: { customerId, kind: 'BIRTHDAY', key: birthdaysOn(now).year }, select: { points: true } });
  return { today: true, pts: Math.round((ev?.points ?? 0) * 100), name: (u.name ?? '').trim().split(/\s+/)[0] || null };
}
