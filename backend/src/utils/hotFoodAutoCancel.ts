// A hot food order nobody at the store accepts is cancelled after a while, and the customer is told, so they are not left waiting for
// food that is not being made.
import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { customerHotFoodUrl } from './notificationRoutes';

export const AUTO_CANCEL_MINUTES = 20;

/** Cancels every order still waiting after AUTO_CANCEL_MINUTES. Each one only once (a claim on its status). Returns how many. */
export async function cancelStaleHotFoodOrders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTO_CANCEL_MINUTES * 60_000);
  const stale = await prisma.hotFoodOrder.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true, customerId: true, orderNumber: true, store: { select: { name: true } } },
  });
  let done = 0;
  for (const o of stale) {
    const moved = await prisma.hotFoodOrder.updateMany({
      where: { id: o.id, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledBy: 'AUTO', cancelReason: `Not accepted within ${AUTO_CANCEL_MINUTES} minutes`, cancelledAt: now },
    });
    if (moved.count === 0) continue;   // accepted or cancelled a moment ago
    done++;
    sendPushToUser(o.customerId, `Order #${o.orderNumber} was cancelled`,
      `${o.store.name} did not accept it within ${AUTO_CANCEL_MINUTES} minutes, so it was cancelled. You were not charged. You can order again.`,
      'HOT_FOOD_ORDER', customerHotFoodUrl());
  }
  return done;
}

export function startHotFoodAutoCancelCron() {
  cron.schedule('*/5 * * * *', () => {
    cancelStaleHotFoodOrders().catch((e) => console.error('[hot-food-auto-cancel] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  console.log(`[hot-food-auto-cancel] Orders not accepted within ${AUTO_CANCEL_MINUTES} minutes are cancelled (checked every 5 minutes)`);
}
