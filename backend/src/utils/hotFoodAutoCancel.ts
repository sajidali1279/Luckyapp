// A hot food order nobody at the store accepts is cancelled after a while, and the customer is told, so they are not left waiting for
// food that is not being made.
import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { customerHotFoodUrl } from './notificationRoutes';
import { escalateWaitingHotFoodOrders, ESCALATE_MINUTES } from './hotFoodRouting';
import { returnOrderPoints, pts } from './hotFoodPoints';

export const AUTO_CANCEL_MINUTES = 20;
/** A ready order not picked up after this long: the customer is reminded, once (2026-10-12) */
export const READY_REMIND_MINUTES = 15;

/** Ready orders waiting READY_REMIND_MINUTES: the customer is reminded where and what to pay, once each. Returns how many. */
export async function remindReadyHotFoodOrders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - READY_REMIND_MINUTES * 60_000);
  const waiting = await prisma.hotFoodOrder.findMany({
    where: { status: 'READY', readyRemindedAt: null, readyAt: { lt: cutoff } },
    select: { id: true, customerId: true, orderNumber: true, paidWithPoints: true, totalAmount: true, store: { select: { name: true, address: true } } },
  });
  let done = 0;
  for (const o of waiting) {
    const claimed = await prisma.hotFoodOrder.updateMany({ where: { id: o.id, status: 'READY', readyRemindedAt: null }, data: { readyRemindedAt: now } });
    if (claimed.count === 0) continue;   // picked up or reminded a moment ago
    done++;
    sendPushToUser(o.customerId, `🔥 Order #${o.orderNumber} is waiting for you`,
      `It is ready at ${o.store.name}${o.store.address ? `, ${o.store.address}` : ''}. ${o.paidWithPoints ? 'Paid with points: nothing to pay.' : `Pay $${o.totalAmount.toFixed(2)} at the counter.`}`,
      'HOT_FOOD_ORDER', customerHotFoodUrl());
  }
  return done;
}

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
    const returned = await returnOrderPoints(o.id, now).catch((e) => { console.error('[hot-food-auto-cancel] points not returned:', o.id, e?.message ?? e); return 0; });
    sendPushToUser(o.customerId, `Order #${o.orderNumber} was cancelled`,
      `${o.store.name} did not accept it within ${AUTO_CANCEL_MINUTES} minutes, so it was cancelled. ${returned ? `Your ${pts(returned)} points are back.` : 'You were not charged.'} You can order again.`,
      'HOT_FOOD_ORDER', customerHotFoodUrl());
  }
  return done;
}

export function startHotFoodAutoCancelCron() {
  cron.schedule('*/5 * * * *', () => {
    cancelStaleHotFoodOrders().catch((e) => console.error('[hot-food-auto-cancel] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  console.log(`[hot-food-auto-cancel] Orders not accepted within ${AUTO_CANCEL_MINUTES} minutes are cancelled (checked every 5 minutes)`);
  // An order waiting ESCALATE_MINUTES: its store's managers and everyone assigned there are told, once (checked every minute)
  cron.schedule('* * * * *', () => {
    escalateWaitingHotFoodOrders().catch((e) => console.error('[hot-food-escalate] run failed:', e?.message ?? e));
    remindReadyHotFoodOrders().catch((e) => console.error('[hot-food-ready-reminder] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  console.log(`[hot-food-escalate] Orders waiting ${ESCALATE_MINUTES} minutes are escalated to the store's managers`);
}
