// A pending sale is a points grant an employee started, waiting on the receipt photo before it can be
// approved or held for review. Nothing ever moved it out of PENDING on its own (docs/confidential/admin-audit/
// 04-transactions.md finding #2: "the sidebar count only grows"), so a receipt the cashier forgot to upload
// stayed in the Needs Review queue forever. After 24 hours with no receipt, the sale is rejected the same
// way a person choosing Reject would (nothing was ever credited, so there is nothing to claw back), and that
// store's active managers are told once, grouped by store, not once per lapsed sale.

import cron from 'node-cron';
import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { audit } from './audit';
import { sendPushToUser } from './push';
import { flaggedSaleRecipientIds } from './alertRecipients';

export const ABANDON_AFTER_HOURS = 24;

let running = false;

export async function expireAbandonedPendingSales(now: Date = new Date()): Promise<{ expired: number; stores: number }> {
  if (running) return { expired: 0, stores: 0 };
  running = true;
  try {
    const cutoff = new Date(now.getTime() - ABANDON_AFTER_HOURS * 60 * 60 * 1000);
    const stale = await prisma.pointsTransaction.findMany({
      where: { status: TransactionStatus.PENDING, createdAt: { lt: cutoff } },
      select: { id: true, storeId: true, purchaseAmount: true, customerId: true },
    });
    if (stale.length === 0) return { expired: 0, stores: 0 };

    const perStore = new Map<string, number>();
    for (const tx of stale) {
      // Decide-once, the same as a real Reject: only if the sale is still PENDING (a person could have acted
      // on it in the same instant this job reads it).
      const moved = await prisma.pointsTransaction.updateMany({
        where: { id: tx.id, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.REJECTED, notes: `Automatically expired: no receipt was uploaded within ${ABANDON_AFTER_HOURS} hours.` },
      });
      if (moved.count === 0) continue;
      perStore.set(tx.storeId, (perStore.get(tx.storeId) ?? 0) + 1);
      audit({
        actorId: 'system', actorName: 'Pending-sale expiry (automatic)', actorRole: 'DEV_ADMIN',
        action: 'AUTO_EXPIRE_PENDING', entity: 'transaction', entityId: tx.id,
        details: { purchaseAmount: tx.purchaseAmount, customerId: tx.customerId, abandonAfterHours: ABANDON_AFTER_HOURS },
        storeId: tx.storeId,
      });
    }

    for (const [storeId, count] of perStore) {
      const recipients = await flaggedSaleRecipientIds(storeId);
      for (const id of recipients) {
        sendPushToUser(
          id,
          '⏱️ Pending sale(s) expired',
          `${count} sale${count === 1 ? '' : 's'} at your store had no receipt uploaded within ${ABANDON_AFTER_HOURS} hours and ${count === 1 ? 'was' : 'were'} automatically rejected. Nothing was credited.`,
          'ALERT'
        );
      }
    }

    return { expired: [...perStore.values()].reduce((s, n) => s + n, 0), stores: perStore.size };
  } finally {
    running = false;
  }
}

export function startPendingExpiryCron() {
  const run = async () => {
    try {
      const result = await expireAbandonedPendingSales();
      if (result.expired > 0) {
        console.log(`[pending-expiry] Expired ${result.expired} abandoned pending sale(s) at ${result.stores} store(s)`);
      }
    } catch (err) {
      console.error('[pending-expiry] Error:', err);
    }
  };
  cron.schedule('*/30 * * * *', run);
  // A server that slept through the 24-hour mark catches up as soon as it wakes
  setTimeout(run, 110_000).unref?.();
}
