// Telling customers about a promotion, once, when it STARTS.
//
// Before, every new promotion messaged every customer the moment it was posted: a promotion made on Monday for Friday told everyone on
// Monday to "check the app" when there was nothing there yet, and a single-store promotion went to customers of every store. Now a promotion
// that has already started is announced when it is posted, one that starts later is announced by the hourly job when its first day begins, and a
// single-store promotion goes to that store's customers (an approved purchase there in the last six months) and not to everyone.
//
// Exactly once without a new column: the message carries the offer's id in its link, and an offer is skipped when a message for it already exists
// (the old kind, sent at posting, is recognised by its text and date, so switching to this does not announce running promotions a second time).

import cron from 'node-cron';
import prisma from '../config/prisma';
import { resolveAudience } from './audience';
import { saveNotificationMany } from './push';
import { sendExpoBatch } from './pushSend';
import { offerUrl } from './notificationRoutes';

export interface AnnounceableOffer { id: string; title: string; storeId: string | null; endDate: Date; createdAt: Date }

const TITLE = '🎉 New Promotion!';

export async function alreadyAnnounced(offer: AnnounceableOffer): Promise<boolean> {
  const found = await prisma.userNotification.findFirst({
    where: {
      type: 'OFFER',
      OR: [
        { actionUrl: { contains: `offerId=${offer.id}` } },
        { body: { startsWith: `${offer.title}.` }, createdAt: { gte: offer.createdAt } },
      ],
    },
    select: { id: true },
  });
  return !!found;
}

/** Sends the promotion's notification to its audience once. Returns how many people it went to (0 when it had already gone out or there is no one). */
export async function announceOffer(offer: AnnounceableOffer): Promise<number> {
  if (await alreadyAnnounced(offer)) return 0;
  const members = await resolveAudience(offer.storeId ? 'STORE_CUSTOMERS' : 'ALL_CUSTOMERS', offer.storeId ?? undefined);
  if (members.length === 0) return 0;
  const url = offerUrl(offer.id);
  const body = `${offer.title}. Check the Lucky Stop app for details.`;
  await saveNotificationMany(members.map((m) => m.id), TITLE, body, 'OFFER', url, offer.endDate);
  await sendExpoBatch(members.flatMap((m) => m.tokens), { title: TITLE, body, actionUrl: url });
  return members.length;
}

/** Announces every promotion that has started in the last two weeks and has not been announced yet. Safe to run any number of times. */
export async function announceStartedOffers(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const offers = await prisma.offer.findMany({
    where: { isActive: true, startDate: { lte: now, gte: since }, endDate: { gte: now } },
    select: { id: true, title: true, storeId: true, endDate: true, createdAt: true },
  });
  let sent = 0;
  for (const offer of offers) sent += await announceOffer(offer);
  return sent;
}

export function startOfferAnnounceCron() {
  cron.schedule('12 * * * *', () => {
    announceStartedOffers().catch((e) => console.error('[offer-announce] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  setTimeout(() => {
    announceStartedOffers().catch((e) => console.error('[offer-announce] start-up run failed:', e?.message ?? e));
  }, 120_000);
  console.log('[offer-announce] Promotion announcements scheduled (every hour at :12 UTC, once per promotion; also once after start-up)');
}
