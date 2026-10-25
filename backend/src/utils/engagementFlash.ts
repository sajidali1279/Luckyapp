// Flash deals (2026-10-24, HQ switch in admin > Engagement): HQ writes a short, time-boxed message ("Double points on hot food until 2 PM",
// in English and Spanish), picks who gets it (every customer, one store's customers, or a tier and above) and how long it lasts (1 to 12
// hours). It is pushed once when it starts and shows on the customer's Home with a countdown until it ends. It changes no prices or points
// by itself: a real bonus is an offer, and the flash deal can point people to the offers.
//
// The push is promotional: never in HQ's nudge quiet hours (a deal that starts then is pushed when they end, if it is still running) and
// not to anyone who already had their weekly number of nudges; it counts toward that number (kind NUDGE_FLASH). "Once" is a claim on the
// deal row (announcedAt), so a restart or a second server copy never sends it twice. One deal at a time, and at most HQ's number a week.
import { Prisma, Tier, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { engagement } from './appSettings';
import { excludeDeletedCustomers } from './accountDeletion';
import { saveNotificationMany } from './push';
import { sendExpoBatch } from './pushSend';
import { addStoreDays, startOfStoreDate, storeHour } from './storeTime';
import { weekStartKey } from './engagement';

const DAY = 86_400_000, HOUR = 3_600_000;
export const FLASH_LINKS: Record<string, string | null> = {
  NONE: null, OFFERS: '/(customer)/home?scrollTo=offers', HOT_FOOD: '/(customer)/hot-food', REWARDS: '/(customer)/rewards', GAS: '/(customer)/home?scrollTo=gas',
};
const AUDIENCES = ['ALL', 'STORE', 'TIER'];
const TIERS: Tier[] = [Tier.BRONZE, Tier.SILVER, Tier.GOLD, Tier.DIAMOND, Tier.PLATINUM];
export const FLASH_TITLE_MAX = 60, FLASH_BODY_MAX = 160;
const quiet = (hour: number, from: number, to: number) => (from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '').slice(0, max + 1);

export interface FlashDraft { title: string; titleEs: string | null; body: string; bodyEs: string | null; link: string; audience: string; storeId: string | null; tier: Tier | null; startsAt: Date; endsAt: Date }

/** HQ's flash deal checked: words, link, audience, a start now or within a week, 1 to 12 hours; one at a time and HQ's number a week. */
export async function draftFlash(b: any, now: Date = new Date()): Promise<FlashDraft | string> {
  const cfg = engagement().flashDeals;
  if (!cfg.enabled) return 'Switch flash deals on first.';
  const title = str(b?.title, FLASH_TITLE_MAX), body = str(b?.body, FLASH_BODY_MAX);
  const titleEs = str(b?.titleEs, FLASH_TITLE_MAX), bodyEs = str(b?.bodyEs, FLASH_BODY_MAX);
  if (!title || !body) return 'Write a title and a message.';
  if (title.length > FLASH_TITLE_MAX || titleEs.length > FLASH_TITLE_MAX) return `Keep the title to ${FLASH_TITLE_MAX} characters.`;
  if (body.length > FLASH_BODY_MAX || bodyEs.length > FLASH_BODY_MAX) return `Keep the message to ${FLASH_BODY_MAX} characters.`;
  const link = typeof b?.link === 'string' && b.link in FLASH_LINKS ? b.link : 'NONE';
  const audience = AUDIENCES.includes(b?.audience) ? b.audience : 'ALL';
  let storeId: string | null = null, tier: Tier | null = null;
  if (audience === 'STORE') {
    storeId = typeof b?.storeId === 'string' ? b.storeId : '';
    if (!storeId || !(await prisma.store.findFirst({ where: { id: storeId, isActive: true }, select: { id: true } }))) return 'Pick the store.';
  }
  if (audience === 'TIER') {
    tier = TIERS.includes(b?.tier) && b.tier !== Tier.BRONZE ? b.tier : null;
    if (!tier) return 'Pick the tier (Silver and above).';
  }
  const hours = Math.round(Number(b?.hours));
  if (!(hours >= 1 && hours <= 12)) return 'A flash deal lasts 1 to 12 hours.';
  const startsAt = b?.startsAt ? new Date(b.startsAt) : now;
  if (Number.isNaN(startsAt.getTime())) return 'Pick when it starts.';
  if (startsAt.getTime() < now.getTime() - 60_000) return 'It cannot start in the past.';
  if (startsAt.getTime() > now.getTime() + 7 * DAY) return 'It can start at most a week from now.';
  const start = startsAt < now ? now : startsAt;
  const endsAt = new Date(start.getTime() + hours * HOUR);
  const overlap = await prisma.flashDeal.findFirst({ where: { cancelledAt: null, startsAt: { lt: endsAt }, endsAt: { gt: start } }, select: { title: true } });
  if (overlap) return `"${overlap.title}" runs at that time. One flash deal at a time.`;
  const week = weekStartKey(start);
  const thisWeek = await prisma.flashDeal.count({ where: { cancelledAt: null, startsAt: { gte: startOfStoreDate(week), lt: startOfStoreDate(addStoreDays(week, 7)) } } });
  if (thisWeek >= cfg.maxPerWeek) return `That week already has ${thisWeek} flash deal${thisWeek === 1 ? '' : 's'}, the most you set.`;
  return { title, titleEs: titleEs || null, body, bodyEs: bodyEs || null, link, audience, storeId, tier, startsAt: start, endsAt };
}

/** The flash deal running now that this customer is in (null when there is none, or it is switched off). */
export async function activeFlashFor(customerId: string, storeId: string | null, now: Date = new Date()) {
  if (!engagement().flashDeals.enabled) return null;
  const d = await prisma.flashDeal.findFirst({ where: { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { startsAt: 'desc' } });
  if (!d) return null;
  if (d.audience === 'TIER' && d.tier) {
    const u = await prisma.user.findUnique({ where: { id: customerId }, select: { tier: true } });
    if (!u || TIERS.indexOf(u.tier) < TIERS.indexOf(d.tier)) return null;
  }
  if (d.audience === 'STORE' && d.storeId && d.storeId !== storeId) {
    // not at that store now: in the deal if they have bought there
    const bought = await prisma.pointsTransaction.findFirst({ where: { customerId, storeId: d.storeId, status: TransactionStatus.APPROVED, purchaseAmount: { gt: 0 } }, select: { id: true } });
    if (!bought) return null;
  }
  return { id: d.id, title: d.title, titleEs: d.titleEs, body: d.body, bodyEs: d.bodyEs, link: d.link, url: FLASH_LINKS[d.link] ?? null, endsAt: d.endsAt };
}

/** Who a deal's push goes to: customers with a phone in its audience. */
async function audienceOf(d: { audience: string; storeId: string | null; tier: Tier | null }) {
  const base: Prisma.UserWhereInput = { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers, pushTokens: { some: {} } };
  if (d.audience === 'TIER' && d.tier) base.tier = { in: TIERS.slice(TIERS.indexOf(d.tier)) };
  if (d.audience === 'STORE' && d.storeId) {
    const buyers = await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { storeId: d.storeId, status: TransactionStatus.APPROVED, purchaseAmount: { gt: 0 } }, _count: { _all: true } });
    base.id = { in: buyers.map((r) => r.customerId) };
  }
  return prisma.user.findMany({ where: base, select: { id: true, language: true, pushTokens: { select: { token: true } } }, take: 50_000 });
}

/** Pushes every flash deal that has started and was not pushed yet (every 5 minutes; and right away when one starts now). */
export async function announceDueFlashDeals(now: Date = new Date()): Promise<number> {
  const all = engagement();
  if (!all.flashDeals.enabled) return 0;
  if (quiet(storeHour(now), all.nudges.quietFrom, all.nudges.quietTo)) return 0;   // pushed when quiet hours end, if still running
  const due = await prisma.flashDeal.findMany({ where: { cancelledAt: null, announcedAt: null, startsAt: { lte: now }, endsAt: { gt: now } } });
  let sent = 0;
  for (const d of due) {
    const claimed = await prisma.flashDeal.updateMany({ where: { id: d.id, announcedAt: null, cancelledAt: null }, data: { announcedAt: now } });
    if (claimed.count === 0) continue;   // another server copy took it
    const people = await audienceOf(d);
    const ids = people.map((p) => p.id);
    // the weekly nudge number: people who already had it this week are left out, and this push counts for the others
    const recent = ids.length ? await prisma.engagementEvent.groupBy({ by: ['customerId'], where: { kind: { startsWith: 'NUDGE_' }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) }, customerId: { in: ids } }, _count: { _all: true } }) : [];
    const used = new Map(recent.map((r) => [r.customerId, r._count._all]));
    const told = people.filter((p) => (used.get(p.id) ?? 0) < all.nudges.maxPerWeek);
    if (told.length) await prisma.engagementEvent.createMany({ data: told.map((p) => ({ customerId: p.id, kind: 'NUDGE_FLASH', key: d.id })), skipDuplicates: true });
    const url = FLASH_LINKS[d.link] ?? undefined;
    for (const es of [false, true]) {
      const group = told.filter((p) => (p.language === 'es') === es);
      if (!group.length) continue;
      const title = es ? `⚡ ${d.titleEs || d.title}` : `⚡ ${d.title}`;
      const body = es ? d.bodyEs || d.body : d.body;
      await saveNotificationMany(group.map((p) => p.id), title, body, 'OFFER', url, d.endsAt);   // the inbox line goes when the deal ends
      const tokens = group.flatMap((p) => p.pushTokens.map((t) => t.token));
      if (tokens.length) await sendExpoBatch(tokens, { title, body, actionUrl: url }).catch((e) => console.error('[flash] push failed:', e?.message ?? e));
    }
    await prisma.flashDeal.update({ where: { id: d.id }, data: { sentCount: told.length } });
    sent += told.length;
  }
  return sent;
}
