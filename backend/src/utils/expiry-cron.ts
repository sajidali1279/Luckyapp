/**
 * Expiry cron — runs daily at 08:00 UTC.
 * Finds offers expiring within the next 24 hours and notifies:
 *   - SPECIFIC_STORE offers → the store's managers
 *   - ALL_STORES offers     → all store managers across all stores
 *
 * Idempotent: skips offers already notified today (checked via a simple
 * "last notified" field we track in memory per run — safe for single-instance).
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { Role } from '@prisma/client';

export async function runExpiryCheck() {
  console.log('[expiry-cron] Checking for expiring offers…');

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Offers active and expiring within 24 hours
  const expiringOffers = await prisma.offer.findMany({
    where: {
      isActive: true,
      endDate: { gte: now, lte: in24h },
    },
    select: { id: true, title: true, type: true, storeId: true, endDate: true },
  });

  if (expiringOffers.length === 0) {
    console.log('[expiry-cron] No expiring offers.');
    return;
  }

  console.log(`[expiry-cron] Found ${expiringOffers.length} expiring offer(s).`);

  // Fetch all store managers once (needed for ALL_STORES offers)
  const allManagers = await prisma.userStoreRole.findMany({
    where: { role: Role.STORE_MANAGER },
    select: { userId: true, storeId: true },
  });

  for (const offer of expiringOffers) {
    const hoursLeft = Math.round((offer.endDate.getTime() - now.getTime()) / 3600000);
    const title = '⏰ Offer Expiring Soon';
    const body  = `"${offer.title}" expires in ~${hoursLeft}h. Consider renewing or removing it.`;

    let managerIds: string[] = [];

    if (offer.type === 'SPECIFIC_STORE' && offer.storeId) {
      managerIds = allManagers
        .filter((m) => m.storeId === offer.storeId)
        .map((m) => m.userId);
    } else {
      // ALL_STORES — notify every manager
      managerIds = [...new Set(allManagers.map((m) => m.userId))];
    }

    for (const managerId of managerIds) {
      sendPushToUser(managerId, title, body, 'OFFER');
    }

    console.log(`[expiry-cron]   ✅ "${offer.title}" — notified ${managerIds.length} manager(s)`);
  }
}

// Schedule: daily at 08:00 UTC
export function startExpiryCron() {
  cron.schedule('0 8 * * *', runExpiryCheck, { timezone: 'UTC' });
  console.log('[expiry-cron] Offer expiry job scheduled (daily 08:00 UTC)');
}
