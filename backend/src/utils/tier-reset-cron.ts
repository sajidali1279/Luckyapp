/**
 * Tier reset cron — runs on Jan 1 and Jul 1 at 00:01 UTC.
 * Falls each customer back one tier (Platinum→Diamond, Diamond→Gold, etc.).
 * periodPoints reset to 0. Bronze stays Bronze.
 * Notifies affected customers.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { getCurrentPeriod } from './tier';
import { broadcastToCustomers } from './push';

export async function runTierReset() {
  const newPeriod = getCurrentPeriod();
  console.log(`[tier-reset] Starting tier fall-back for period ${newPeriod}…`);

  // Execute bottom-to-top so sequential updates don't cascade within the transaction:
  // each updateMany only sees original tier holders, not users changed in earlier steps.
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { role: 'CUSTOMER', tier: 'BRONZE' },
      data: { periodPoints: 0, tierPeriod: newPeriod },
    }),
    prisma.user.updateMany({
      where: { role: 'CUSTOMER', tier: 'SILVER' },
      data: { periodPoints: 0, tier: 'BRONZE', tierPeriod: newPeriod },
    }),
    prisma.user.updateMany({
      where: { role: 'CUSTOMER', tier: 'GOLD' },
      data: { periodPoints: 0, tier: 'SILVER', tierPeriod: newPeriod },
    }),
    prisma.user.updateMany({
      where: { role: 'CUSTOMER', tier: 'DIAMOND' },
      data: { periodPoints: 0, tier: 'GOLD', tierPeriod: newPeriod },
    }),
    prisma.user.updateMany({
      where: { role: 'CUSTOMER', tier: 'PLATINUM' },
      data: { periodPoints: 0, tier: 'DIAMOND', tierPeriod: newPeriod },
    }),
  ]);

  console.log('[tier-reset] Tier fall-back complete for period', newPeriod);

  broadcastToCustomers(
    '🔄 New Rewards Period!',
    'A new period has started. Your tier has stepped back one level — earn points to climb back and keep your perks!',
    'GENERAL'
  );
}

// Jan 1 and Jul 1 at 00:01 UTC
export function startTierResetCron() {
  cron.schedule('1 0 1 1,7 *', runTierReset, { timezone: 'UTC' });
  console.log('[tier-reset] Tier reset cron scheduled (Jan 1 + Jul 1, 00:01 UTC)');
}
