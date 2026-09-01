import cron from 'node-cron';
import prisma from '../config/prisma';

// Run every 15 minutes — revert any per-store price override whose scheduled
// end has passed back to the base price. Also clears printedAt, matching the
// same "any real price change flags the store to reprint" rule every other
// price-changing path in this file already follows, so a sale ending is
// treated exactly like an admin manually reverting the price.
export function startLabelPriceExpiryCron() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await prisma.storeLabel.updateMany({
        where: { overrideExpiresAt: { lte: new Date() } },
        data: { priceText: null, overrideExpiresAt: null, printedAt: null },
      });

      if (result.count > 0) {
        console.log(`[label-price-expiry] Reverted ${result.count} expired price override(s) to base price`);
      }
    } catch (err) {
      console.error('[label-price-expiry] Error:', err);
    }
  });
}
