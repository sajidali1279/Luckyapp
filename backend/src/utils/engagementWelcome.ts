// The welcome series (2026-10-24, HQ switch in admin > Engagement): up to three personal pushes in a new customer's first days, for people
// who sign up from the day HQ switches it on (the ones who joined before are never messaged, so switching it on cannot flood anyone). Each
// step sends the first of its messages that fits the person and skips the ones that do not: "show your QR at the register" only before
// their first purchase, "order ahead" only while hot food ordering is on and they have never ordered, "check in daily" only once they can
// (check-in on and a purchase made), "invite a friend" only while invites are on and they have not invited anyone yet.
//
// Personal-moment pushes: never in HQ's quiet hours and only between 10 AM and 8 PM store time; each step once per person (an
// engagement_events row is written BEFORE the push, so a restart or a second server copy cannot send it twice), so at most three ever.
// A step whose day passed while nothing could be sent (quiet hours all day, the server down) is still sent up to two days late, then
// dropped. Every message also lands in the app's notification inbox. The welcome bonus (one free item a day) sends no pushes of its own,
// so step 1 mentions it while it lasts instead of a second message about it.
import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { engagement, feature } from './appSettings';
import { excludeDeletedCustomers } from './accountDeletion';
import { sendPushToUser } from './push';
import { startOfStoreDate, storeDateKey, storeDaysBetween, storeHour } from './storeTime';
import { readReferralSettings } from './referrals';
import { welcomeDay } from '../controllers/welcome-bonus.controller';
import type { WelcomeKey } from './engagementConfig';

const DAY = 86_400_000;
export const WELCOME_GRACE_DAYS = 2;
const PER_RUN = 300;             // most welcome pushes one run sends
const SEND_FROM = 10, SEND_UNTIL = 20;   // store hours a welcome push may go out (and never inside HQ's quiet hours)

/** Each step's message choices, in the order they are tried. */
export const WELCOME_STEPS: WelcomeKey[][] = [['qrBonus', 'qr'], ['hotFood', 'checkIn'], ['invite', 'tier']];
export const WELCOME_LINKS: Record<WelcomeKey, string> = {
  qrBonus: '/(customer)/home', qr: '/(customer)/home', hotFood: '/(customer)/hot-food', checkIn: '/(customer)/home', invite: '/(customer)/invite-friends', tier: '/(customer)/rewards',
};

// the same rule as engagement-cron's inQuietHours (kept here so the two modules do not import each other)
const quiet = (hour: number, from: number, to: number) => (from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to);

export async function runWelcome(now: Date = new Date()): Promise<{ sent: number; byStep: number[] }> {
  const out = { sent: 0, byStep: WELCOME_STEPS.map(() => 0) };
  const all = engagement();
  const cfg = all.welcome;
  if (!cfg.enabled || !cfg.since) return out;
  const hour = storeHour(now);
  if (hour < SEND_FROM || hour >= SEND_UNTIL || quiet(hour, all.nudges.quietFrom, all.nudges.quietTo)) return out;
  const lastDay = Math.max(0, ...cfg.steps.filter((s) => s.enabled).map((s) => s.day));
  if (lastDay === 0) return out;

  // everyone who signed up since the switch went on and is still inside the series, oldest signups first, so someone near the end of a
  // step's grace days is not crowded out by a busy signup day
  const from = new Date(Math.max(startOfStoreDate(cfg.since).getTime(), now.getTime() - (lastDay + WELCOME_GRACE_DAYS + 1) * DAY));
  const people = await prisma.user.findMany({
    where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers, pushTokens: { some: {} }, createdAt: { gte: from } },
    select: { id: true, language: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 3000,
  });
  if (!people.length) return out;
  const ids = people.map((p) => p.id);
  const [sentRows, buyers, eaters, checkIns, inviters, invites] = await Promise.all([
    prisma.engagementEvent.findMany({ where: { kind: 'WELCOME', customerId: { in: ids } }, select: { customerId: true, key: true } }),
    prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, purchaseAmount: { gt: 0 } }, _count: { _all: true } }),
    prisma.hotFoodOrder.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _count: { _all: true } }),
    prisma.engagementEvent.groupBy({ by: ['customerId'], where: { kind: 'CHECKIN', customerId: { in: ids } }, _count: { _all: true } }),
    prisma.referral.groupBy({ by: ['referrerId'], where: { referrerId: { in: ids } }, _count: { _all: true } }),
    readReferralSettings(),
  ]);
  const sent = new Set(sentRows.map((r) => `${r.customerId}:${r.key}`));
  const bought = new Set(buyers.map((b) => b.customerId));
  const ordered = new Set(eaters.map((e) => e.customerId));
  const checkedIn = new Set(checkIns.map((c) => c.customerId));
  const invited = new Set(inviters.map((r) => r.referrerId));
  const today = storeDateKey(now);
  let budget = PER_RUN;

  for (const p of people) {
    if (budget <= 0) break;
    const age = storeDaysBetween(storeDateKey(p.createdAt), today);   // 0 on the store day they signed up
    const fits: Record<WelcomeKey, boolean> = {
      qrBonus: !bought.has(p.id) && welcomeDay(p.createdAt, now) !== null,
      qr: !bought.has(p.id),
      hotFood: feature('hotFoodOrdering') && !ordered.has(p.id),
      checkIn: all.checkIn.enabled && bought.has(p.id) && !checkedIn.has(p.id),
      invite: invites.enabled && !invited.has(p.id),
      tier: true,
    };
    // the first step that is due, not sent yet, and has a message that fits (one push per person per run)
    let pick: { step: number; key: WelcomeKey } | null = null;
    for (let i = 0; i < cfg.steps.length && !pick; i++) {
      const s = cfg.steps[i];
      if (!s.enabled || sent.has(`${p.id}:step${i + 1}`) || age < s.day || age > s.day + WELCOME_GRACE_DAYS) continue;
      const key = WELCOME_STEPS[i].find((k) => fits[k]);
      if (key) pick = { step: i, key };
    }
    if (!pick) continue;
    const made = await prisma.engagementEvent.createMany({ data: [{ customerId: p.id, kind: 'WELCOME', key: `step${pick.step + 1}` }], skipDuplicates: true });
    if (made.count === 0) continue;   // another server copy sent it a moment ago
    const t = cfg.texts[pick.key];
    const es = p.language === 'es';
    await sendPushToUser(p.id, es ? t.titleEs : t.titleEn, es ? t.bodyEs : t.bodyEn, 'OFFER', WELCOME_LINKS[pick.key]);
    out.sent++; out.byStep[pick.step]++; budget--;
  }
  return out;
}
