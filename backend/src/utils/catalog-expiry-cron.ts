import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';

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

      for (const r of expired) {
        const costInDollars = r.pointsSpent / 100;
        await prisma.$transaction([
          prisma.catalogRedemption.update({ where: { id: r.id }, data: { status: 'EXPIRED' } }),
          prisma.user.update({ where: { id: r.customerId }, data: { pointsBalance: { increment: costInDollars } } }),
        ]);
        sendPushToUser(
          r.customerId,
          '⏰ Redemption Expired',
          `Your "${r.catalogItem.title}" redemption wasn't scanned in time — ${r.pointsSpent} pts have been refunded.`,
          'REDEMPTION',
        );
      }

      console.log(`[catalog-expiry] Expired ${expired.length} redemption(s), points refunded`);
    } catch (err) {
      console.error('[catalog-expiry] Error:', err);
    }
  });
}
