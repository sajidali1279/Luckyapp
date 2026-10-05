// The "last day" push: at 10 AM store time on a promotion's last day, the people it was announced to (that store's customers, or every
// customer) get one reminder. Only for promotions that ran 3 days or more (a one-day promotion's announcement already said it), and HQ can
// switch it off per promotion (Offer.lastDayReminder). Exactly once: the promotion is claimed (lastDayRemindedAt) before anything is sent.

import cron from 'node-cron';
import prisma from '../config/prisma';
import { resolveAudience } from './audience';
import { saveNotificationMany } from './push';
import { sendExpoBatch } from './pushSend';
import { storeHour, storeDayEnd } from './storeTime';
import { membersInAudience } from './offerAudience';

export const LAST_DAY_HOUR = 10;
const MIN_LENGTH_MS = 3 * 86_400_000 - 60 * 60_000;   // 3 days (a Monday-to-Wednesday promotion counts)

/** Sends today's last-day reminders that are due. Returns how many promotions were reminded about. Safe to run any number of times. */
export async function remindLastDays(now: Date = new Date()): Promise<number> {
  if (storeHour(now) < LAST_DAY_HOUR) return 0;
  const offers = await prisma.offer.findMany({
    where: {
      isActive: true, lastDayReminder: true, lastDayRemindedAt: null, budgetReachedAt: null,   // a used-up budget: no "last day" for it
      startDate: { lte: now }, endDate: { gte: now, lte: storeDayEnd(now) },
    },
    select: { id: true, title: true, titleEs: true, storeId: true, startDate: true, endDate: true, audience: true, audienceTier: true, audienceDays: true },
  });
  let reminded = 0;
  for (const offer of offers) {
    if (offer.endDate.getTime() - offer.startDate.getTime() < MIN_LENGTH_MS) continue;
    const { count } = await prisma.offer.updateMany({ where: { id: offer.id, lastDayRemindedAt: null }, data: { lastDayRemindedAt: now } });
    if (count === 0) continue;   // another run got it
    const members = await membersInAudience(offer, await resolveAudience(offer.storeId ? 'STORE_CUSTOMERS' : 'ALL_CUSTOMERS', offer.storeId ?? undefined));
    if (members.length === 0) continue;
    const url = `/(customer)/home?scrollTo=offers&lastDay=${offer.id}`;
    // In each person's language (the English title when the offer has no Spanish one)
    const groups = [
      { people: members.filter((m) => m.language !== 'es'), title: 'Last day!', body: `${offer.title} ends today. Check the Lucky Stop app.` },
      { people: members.filter((m) => m.language === 'es'), title: '¡Último día!', body: `${offer.titleEs?.trim() || offer.title} termina hoy. Mira la app de Lucky Stop.` },
    ];
    for (const g of groups) {
      if (g.people.length === 0) continue;
      await saveNotificationMany(g.people.map((m) => m.id), g.title, g.body, 'OFFER', url, offer.endDate);
      await sendExpoBatch(g.people.flatMap((m) => m.tokens), { title: g.title, body: g.body, actionUrl: url });
    }
    reminded += 1;
  }
  return reminded;
}

export function startOfferLastDayCron() {
  const run = () => remindLastDays().catch((e) => console.error('[offer-last-day] run failed:', e?.message ?? e));
  cron.schedule('20 * * * *', run, { timezone: 'UTC' });
  setTimeout(run, 150_000).unref?.();   // a server that slept past 10 AM catches up on waking
  console.log('[offer-last-day] Last-day reminders scheduled (every hour at :20 UTC, from 10 AM store time)');
}
