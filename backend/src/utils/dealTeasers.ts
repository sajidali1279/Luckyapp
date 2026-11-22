// "Coming soon" offers and hot food combos (2026-11-22, the owner: a post before it is available, with a countdown, to build excitement).
// HQ sets when the teaser starts (teaseFrom) before the deal itself starts (an offer's startDate, a combo's startsAt). Between the two the
// app shows a card with a live countdown, the price or reward, a "Remind me" button and how many are waiting. When it starts, everyone who
// tapped Remind me is told at once (a job every few minutes); the usual offer announcement then skips them so nobody is told twice.
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { offerUrl } from './notificationRoutes';

export type DealKind = 'OFFER' | 'COMBO';
export const TEASE_MAX_DAYS = 30;

/** The teaser's own rules (both kinds): before the start, at most 30 days before it. A message for HQ, or null. */
export function teaserProblem(teaseFrom: Date | null | undefined, startsAt: Date | null | undefined, startWord = 'start'): string | null {
  if (!teaseFrom) return null;
  if (!startsAt) return `Give the ${startWord} date and time to show a Coming soon countdown.`;
  if (teaseFrom.getTime() >= startsAt.getTime()) return `Coming soon has to begin before the ${startWord}.`;
  if (startsAt.getTime() - teaseFrom.getTime() > TEASE_MAX_DAYS * 86_400_000) return `Coming soon can begin at most ${TEASE_MAX_DAYS} days before the ${startWord}.`;
  return null;
}

/** How many are waiting for each deal (reminders not yet sent). */
export async function waitingCounts(kind: DealKind, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.dealReminder.groupBy({ by: ['dealId'], where: { kind, dealId: { in: ids }, sentAt: null }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.dealId, r._count._all]));
}

/** What a customer sees as Coming soon at a store: offers and combos whose teaser has begun and which have not started. */
export async function comingSoon(userId: string, role: Role | string, storeId: string | null, now = new Date()) {
  let hideRestricted = false;
  if (role === Role.CUSTOMER) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { age21Confirmed: true, age21Declined: true } });
    hideRestricted = !!me?.age21Declined && !me?.age21Confirmed;
  }
  const [offers, combos] = await Promise.all([
    prisma.offer.findMany({
      where: {
        isActive: true, teaseFrom: { lte: now }, startDate: { gt: now }, endDate: { gt: now },
        // a promotion for some customers only (a tier, a win-back) is not teased to everyone
        audience: 'EVERYONE',
        ...(hideRestricted ? { requires21: false } : {}),
        ...(storeId ? { AND: [{ OR: [{ type: 'ALL_STORES' }, { storeId }] }] } : { type: 'ALL_STORES' }),
      },
      orderBy: { startDate: 'asc' },
      select: { id: true, title: true, titleEs: true, description: true, descriptionEs: true, dealText: true, dealTextEs: true, imageUrl: true, startDate: true,
        bonusRate: true, tierBonusRates: true, gasBonusCentsPerGallon: true, category: true, requires21: true },
    }),
    prisma.hotFoodCombo.findMany({
      where: { isActive: true, teaseFrom: { lte: now }, startsAt: { gt: now }, ...(storeId ? { OR: [{ storeIds: { isEmpty: true } }, { storeIds: { has: storeId } }] } : {}) },
      orderBy: { startsAt: 'asc' },
      select: { id: true, name: true, nameEs: true, description: true, price: true, regularPrice: true, startsAt: true, catalogItem: { select: { name: true, imageUrl: true } } },
    }),
  ]);
  const [offerWaiting, comboWaiting, mine] = await Promise.all([
    waitingCounts('OFFER', offers.map((o) => o.id)),
    waitingCounts('COMBO', combos.map((c) => c.id)),
    prisma.dealReminder.findMany({ where: { userId, sentAt: null, dealId: { in: [...offers.map((o) => o.id), ...combos.map((c) => c.id)] } }, select: { kind: true, dealId: true } }),
  ]);
  const mineSet = new Set(mine.map((m) => `${m.kind}:${m.dealId}`));
  return [
    ...offers.map((o) => ({
      kind: 'OFFER' as const, id: o.id, title: o.title, titleEs: o.titleEs, description: o.description, descriptionEs: o.descriptionEs,
      dealText: o.dealText, dealTextEs: o.dealTextEs, imageUrl: o.imageUrl, startsAt: o.startDate.toISOString(),
      bonusRate: o.bonusRate, tierBonusRates: o.tierBonusRates, gasBonusCentsPerGallon: o.gasBonusCentsPerGallon, category: o.category, requires21: o.requires21,
      waiting: offerWaiting.get(o.id) ?? 0, remindMe: mineSet.has(`OFFER:${o.id}`),
    })),
    ...combos.map((c) => ({
      kind: 'COMBO' as const, id: c.id, title: c.name, titleEs: c.nameEs, description: c.description, descriptionEs: null,
      price: c.price, regularPrice: c.regularPrice, imageUrl: c.catalogItem.imageUrl, itemName: c.catalogItem.name, startsAt: c.startsAt!.toISOString(),
      waiting: comboWaiting.get(c.id) ?? 0, remindMe: mineSet.has(`COMBO:${c.id}`),
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Remind me on or off. Only for a deal that is teased and has not started. The new waiting count, or a message. */
export async function setReminder(userId: string, kind: DealKind, dealId: string, on: boolean, now = new Date()): Promise<{ waiting: number } | { error: string }> {
  const open = kind === 'OFFER'
    ? await prisma.offer.findFirst({ where: { id: dealId, isActive: true, teaseFrom: { lte: now }, startDate: { gt: now } }, select: { id: true } })
    : await prisma.hotFoodCombo.findFirst({ where: { id: dealId, isActive: true, teaseFrom: { lte: now }, startsAt: { gt: now } }, select: { id: true } });
  if (!open && on) return { error: 'This deal has already started (or is no longer coming).' };
  if (on) {
    await prisma.dealReminder.upsert({ where: { userId_kind_dealId: { userId, kind, dealId } }, create: { userId, kind, dealId }, update: { sentAt: null } });
  } else {
    await prisma.dealReminder.deleteMany({ where: { userId, kind, dealId, sentAt: null } });
  }
  return { waiting: (await waitingCounts(kind, [dealId])).get(dealId) ?? 0 };
}

const LIVE = { en: "It's live!", es: '¡Ya empezó!' };

/** Every few minutes: deals that have started tell the people waiting for them. Each reminder is claimed before it is sent (no repeats). */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const pending = await prisma.dealReminder.findMany({ where: { sentAt: null }, select: { kind: true, dealId: true }, distinct: ['kind', 'dealId'] });
  if (pending.length === 0) return 0;
  const offerIds = pending.filter((p) => p.kind === 'OFFER').map((p) => p.dealId);
  const comboIds = pending.filter((p) => p.kind === 'COMBO').map((p) => p.dealId);
  const [offers, combos] = await Promise.all([
    offerIds.length ? prisma.offer.findMany({ where: { id: { in: offerIds }, isActive: true, startDate: { lte: now }, endDate: { gt: now } }, select: { id: true, title: true, titleEs: true } }) : [],
    comboIds.length ? prisma.hotFoodCombo.findMany({ where: { id: { in: comboIds }, isActive: true, startsAt: { lte: now } }, select: { id: true, name: true, nameEs: true, price: true } }) : [],
  ]);
  const due = [
    ...offers.map((o) => ({ kind: 'OFFER', id: o.id, en: o.title, es: o.titleEs || o.title, url: offerUrl(o.id) })),
    ...combos.map((c) => ({ kind: 'COMBO', id: c.id, en: `${c.name} $${c.price.toFixed(2)}`, es: `${c.nameEs || c.name} $${c.price.toFixed(2)}`, url: '/(customer)/hot-food' })),
  ];
  let sent = 0;
  for (const d of due) {
    const rows = await prisma.dealReminder.findMany({ where: { kind: d.kind, dealId: d.id, sentAt: null }, select: { id: true, userId: true } });
    if (rows.length === 0) continue;
    const claimed = await prisma.dealReminder.updateMany({ where: { id: { in: rows.map((r) => r.id) }, sentAt: null }, data: { sentAt: now } });
    if (claimed.count === 0) continue;
    const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) }, isActive: true }, select: { id: true, language: true } });
    for (const u of users) {
      const es = u.language === 'es';
      await sendPushToUser(u.id, es ? LIVE.es : LIVE.en, es ? `${d.es}. Ya está disponible.` : `${d.en} is on now. You asked us to tell you.`, 'OFFER', d.url)
        .catch(() => undefined);
      sent++;
    }
  }
  return sent;
}

/** The offer announcement skips the people a Remind me already told (so nobody gets two pushes). */
export async function remindedAlready(offerId: string): Promise<Set<string>> {
  const rows = await prisma.dealReminder.findMany({ where: { kind: 'OFFER', dealId: offerId, sentAt: { not: null } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}
