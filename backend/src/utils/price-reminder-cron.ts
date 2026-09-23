// Daily gas/diesel price staleness reminder — once a day at 9am Central, pushes each active store's own
// managers when a price they HAVE set has gone more than 2 days without an update. A price that was
// never set at all is a launch-readiness gap the Stores page's readiness line already flags (see
// getStores' READINESS_FRESH_DAYS in billing.controller.ts) - this only nudges about a price that used
// to be fresh and is now aging, so a store that has simply never set diesel is not nagged forever.
//
// Same simplicity as daily-report-reminder-cron.ts: a single node-cron schedule in the stores' own
// timezone, no separate idempotency guard - a server restart resending one day's reminder is a low-stakes
// annoyance, not a correctness problem, for an informational nudge like this.
import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';

const REMINDER_TIMEZONE = 'America/Chicago'; // Central Time — stores are in Texas
export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000; // 2 days, the audit's own suggested threshold

export async function runPriceReminderCheck(now: Date = new Date()): Promise<{ storesReminded: number }> {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true, dieselPriceUpdatedAt: true },
  });

  const stale = (at: Date | null) => !!at && now.getTime() - at.getTime() > STALE_AFTER_MS;

  let storesReminded = 0;
  for (const store of stores) {
    const gasStale = store.gasPricePerGallon != null && stale(store.gasPriceUpdatedAt);
    const dieselStale = store.dieselPricePerGallon != null && stale(store.dieselPriceUpdatedAt);
    if (!gasStale && !dieselStale) continue;

    const managers = await prisma.userStoreRole.findMany({
      where: { storeId: store.id, role: 'STORE_MANAGER', user: { isActive: true } },
      select: { userId: true },
    });
    if (managers.length === 0) continue;

    const what = gasStale && dieselStale ? 'gas and diesel prices have' : gasStale ? 'gas price has' : 'diesel price has';
    const body = `${store.name}'s ${what} not been updated in over 2 days. Check them if they have changed.`;
    for (const m of managers) sendPushToUser(m.userId, '⛽ Price check', body, 'PRICE_REMINDER');
    storesReminded++;
  }

  console.log(`[price-reminder] Done. ${storesReminded} store(s) reminded.`);
  return { storesReminded };
}

export function startPriceReminderCron() {
  cron.schedule('0 9 * * *', () => {
    runPriceReminderCheck().catch((e) => console.error('[price-reminder] run failed:', e?.message ?? e));
  }, { timezone: REMINDER_TIMEZONE });
  console.log(`[price-reminder] Price staleness reminder scheduled (daily 09:00 ${REMINDER_TIMEZONE})`);
}
