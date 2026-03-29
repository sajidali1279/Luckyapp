/**
 * Tier reset cron — runs on Jan 1 and Jul 1 at 00:01 UTC.
 * Resets periodPoints and tier to BRONZE for all customers.
 * Notifies affected customers.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { getCurrentPeriod } from './tier';
import { broadcastToCustomers } from './push';

export async function runTierReset() {
  const newPeriod = getCurrentPeriod();
  console.log(`[tier-reset] Starting tier reset for period ${newPeriod}…`);

  await prisma.user.updateMany({
    where: { role: 'CUSTOMER' },
    data: { periodPoints: 0, tier: 'BRONZE', tierPeriod: newPeriod },
  });

  console.log('[tier-reset] All customer tiers reset to Bronze.');

  broadcastToCustomers(
    '🔄 New Rewards Period Started!',
    'Your tier has reset for the new period. Start earning points to climb back up!',
    'GENERAL'
  );
}

// Jan 1 and Jul 1 at 00:01 UTC
export function startTierResetCron() {
  cron.schedule('1 0 1 1,7 *', runTierReset, { timezone: 'UTC' });
  console.log('[tier-reset] Tier reset cron scheduled (Jan 1 + Jul 1, 00:01 UTC)');
}
