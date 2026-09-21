/**
 * Tier reset job. Each half-year (January 1 and July 1, on the store calendar in Central time) every customer falls back one tier
 * (Platinum to Diamond, Diamond to Gold and so on; Bronze stays Bronze) and their progress starts again from 0.
 *
 * The job does not depend on being awake at one moment. It runs at :07 past every hour and once 90 seconds after the server starts,
 * and each run only touches customers whose stored period is not the current one, so it is safe to run any number of times: the
 * first run after midnight on January 1 in Texas does the reset even if the server was asleep at that hour, a second run finds
 * nothing to do, and a customer who missed several half-years falls one tier for each. A customer who buys something before the job
 * reaches them is reset first in the same step as the sale (utils/tier.ts rollCustomerPeriod), so their points are never wiped later.
 *
 * Customers are told, one by one, only when their own tier fell. Bronze customers lose nothing and hear nothing.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { Tier } from '@prisma/client';
import { getCurrentPeriod, periodsBetween, stepDownTier } from './tier';
import { sendPushToUser } from './push';
import { audit } from './audit';

let running = false; // two runs at once would race over the same customers

export async function runTierReset(at: Date = new Date()): Promise<{ period: string; moved: number; fell: number }> {
  const none = { period: getCurrentPeriod(at), moved: 0, fell: 0 };
  if (running) return none;
  running = true;
  try {
    const period = none.period;
    const stale = await prisma.user.findMany({
      where: { role: 'CUSTOMER', tierPeriod: { not: period } },
      select: { id: true, tier: true, tierPeriod: true },
    });
    if (stale.length === 0) return none;

    // One update per group of customers who share a tier and an old period (so a group steps down the same number of levels)
    const groups = new Map<string, { tier: Tier; from: string; ids: string[] }>();
    for (const c of stale) {
      const key = `${c.tier}|${c.tierPeriod}`;
      const g = groups.get(key) ?? { tier: c.tier, from: c.tierPeriod, ids: [] };
      g.ids.push(c.id);
      groups.set(key, g);
    }

    let moved = 0;
    let fell = 0;
    const told: { id: string; tier: Tier }[] = [];
    for (const g of groups.values()) {
      const newTier = stepDownTier(g.tier, periodsBetween(g.from, period));
      // Conditional on the customer still having the old tier and period: a sale that reset them in the meantime is left alone
      const res = await prisma.user.updateMany({
        where: { id: { in: g.ids }, role: 'CUSTOMER', tier: g.tier, tierPeriod: g.from },
        data: { tier: newTier, tierPeriod: period, periodPoints: 0 },
      });
      moved += res.count;
      if (newTier !== g.tier) {
        fell += res.count;
        if (res.count === g.ids.length) g.ids.forEach((id) => told.push({ id, tier: newTier }));
      }
    }

    console.log(`[tier-reset] ${period}: ${moved} customer(s) moved to the new period, ${fell} fell a tier`);
    if (moved > 0) {
      audit({
        actorId: 'system', actorName: 'Tier reset job (automatic)', actorRole: 'DEV_ADMIN',
        action: 'TIER_PERIOD_RESET', entity: 'tiers', entityId: period,
        details: { period, moved, fell, summary: `${moved} customer${moved === 1 ? '' : 's'} moved to ${period}, ${fell} fell a tier` },
      });
    }
    for (const t of told) {
      sendPushToUser(t.id, '🔄 New rewards period', `Your tier stepped back to ${t.tier[0] + t.tier.slice(1).toLowerCase()}. Earn points to climb back and keep your perks!`, 'GENERAL');
    }
    return { period, moved, fell };
  } finally {
    running = false;
  }
}

export function startTierResetCron() {
  cron.schedule('7 * * * *', () => {
    runTierReset().catch((e) => console.error('[tier-reset] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  // Catch-up after a restart or a sleep
  setTimeout(() => {
    runTierReset().catch((e) => console.error('[tier-reset] start-up run failed:', e?.message ?? e));
  }, 90_000);
  console.log('[tier-reset] Tier reset job scheduled (every hour at :07 UTC, idempotent; also once after start-up)');
}
