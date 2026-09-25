import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { redemptionUrl } from './notificationRoutes';
import { settlePendingRedemption } from './moneyGuards';

// Run every 5 minutes — expire PENDING catalog redemptions older than their expiresAt
// and refund points to the customer
export function startCatalogExpiryCron() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const expired = await prisma.catalogRedemption.findMany({
        where: { status: 'PENDING', expiresAt: { lt: new Date() } },
        include: { catalogItem: { select: { title: true } } },
      });

      if (expired.length === 0) return;

      let refunded = 0;
      for (const r of expired) {
        // Only if still pending: the cashier may have confirmed it, or the customer cancelled it, since the list above was read
        const settled = await prisma.$transaction((tx) => settlePendingRedemption(tx, r, 'EXPIRED', { refund: true }));
        if (!settled) continue;
        refunded += 1;
        sendPushToUser(
          r.customerId,
          '⏰ Redemption Expired',
          `Your "${r.catalogItem.title}" redemption wasn't scanned in time — ${r.pointsSpent} pts have been refunded.`,
          'REDEMPTION',
          redemptionUrl(r.id),
        );
      }

      if (refunded) console.log(`[catalog-expiry] Expired ${refunded} redemption(s), points refunded`);
    } catch (err) {
      console.error('[catalog-expiry] Error:', err);
    }
  });
}
