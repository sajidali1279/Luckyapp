import cron from 'node-cron';
import prisma from '../config/prisma';
import { samePrice } from './labelPrice';
import { sendPushToStoreManagers } from './push';
import { audit } from './audit';

// Reads already treat a sale whose end has passed as over (utils/labelSale.ts), so nothing waits for this job to be right. What the job
// does is make the database say so: it puts each ended sale's store back on the base price, and where the shelf still shows the sale
// price (the label was printed at it) it flags the label to be printed again, then tells that store's managers how many labels they
// need to reprint. It runs every 15 minutes and once after the server starts (a server that slept catches up on waking).
//
// A sale whose price equals the base price changes nothing on the shelf, so it is tidied up without a reprint flag or a message.

export interface SaleEndResult {
  ended: number;
  needReprint: number;
  stores: number;
}

let running = false;

export async function endExpiredSalePrices(now: Date = new Date()): Promise<SaleEndResult> {
  if (running) return { ended: 0, needReprint: 0, stores: 0 };
  running = true;
  try {
    const rows = await prisma.storeLabel.findMany({
      where: { overrideExpiresAt: { lte: now } },
      select: {
        id: true, storeId: true, priceText: true, printedAt: true,
        label: { select: { productName: true, priceText: true } },
      },
    });
    if (rows.length === 0) return { ended: 0, needReprint: 0, stores: 0 };

    const priceMoves = rows.filter((r) => !samePrice(r.priceText, r.label.priceText));
    const quiet = rows.filter((r) => samePrice(r.priceText, r.label.priceText));

    // Claimed by the row still being overdue, so two runs at once change (and announce) each row once
    const claimedMoves = priceMoves.length > 0
      ? await prisma.storeLabel.updateMany({
          where: { id: { in: priceMoves.map((r) => r.id) }, overrideExpiresAt: { lte: now } },
          data: { priceText: null, overrideExpiresAt: null, printedAt: null },
        })
      : { count: 0 };
    if (quiet.length > 0) {
      await prisma.storeLabel.updateMany({
        where: { id: { in: quiet.map((r) => r.id) }, overrideExpiresAt: { lte: now } },
        data: { priceText: null, overrideExpiresAt: null },
      });
    }

    // Only a label that was printed at the sale price is now wrong on the shelf; one still waiting to print is already in the queue
    const wrongOnShelf = claimedMoves.count === 0 ? [] : priceMoves.filter((r) => r.printedAt !== null);
    const perStore = new Map<string, number>();
    for (const r of wrongOnShelf) perStore.set(r.storeId, (perStore.get(r.storeId) ?? 0) + 1);

    for (const [storeId, count] of perStore) {
      const words = count === 1 ? '1 sale price ended' : `${count} sale prices ended`;
      await sendPushToStoreManagers(storeId, 'Sale prices ended', `${words}. Reprint ${count === 1 ? 'this label' : 'these labels'}.`, 'LABEL_SALE_ENDED', '/(manager)/labels');
    }

    if (rows.length > 0) {
      audit({
        actorId: 'system', actorName: 'Sale price job (automatic)', actorRole: 'DEV_ADMIN',
        action: 'LABEL_SALE_ENDED', entity: 'label',
        details: {
          summary: `${rows.length} sale ${rows.length === 1 ? 'price' : 'prices'} ended and went back to the base price; ${wrongOnShelf.length} ${wrongOnShelf.length === 1 ? 'label needs' : 'labels need'} a reprint.`,
          ended: rows.length, needReprint: wrongOnShelf.length,
        },
        storeId: null,
      });
    }

    return { ended: rows.length, needReprint: wrongOnShelf.length, stores: perStore.size };
  } finally {
    running = false;
  }
}

export function startLabelPriceExpiryCron() {
  const run = async () => {
    try {
      const result = await endExpiredSalePrices();
      if (result.ended > 0) {
        console.log(`[label-price-expiry] Ended ${result.ended} sale price(s); ${result.needReprint} label(s) to reprint at ${result.stores} store(s)`);
      }
    } catch (err) {
      console.error('[label-price-expiry] Error:', err);
    }
  };
  cron.schedule('*/15 * * * *', run);
  // A server that slept through a sale's end catches up as soon as it wakes
  setTimeout(run, 100_000).unref?.();
}
