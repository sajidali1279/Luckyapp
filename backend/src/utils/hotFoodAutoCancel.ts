// A hot food order nobody at the store accepts is cancelled after a while, and the customer is told, so they are not left waiting for
// food that is not being made.
import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { customerHotFoodUrl } from './notificationRoutes';
import { escalateWaitingHotFoodOrders, ESCALATE_MINUTES, tellStoreAboutOrder } from './hotFoodRouting';
import { cancelOrder, recordPointsPickup, pts } from './hotFoodPoints';
import { rule, feature } from './appSettings';
import { hotFoodWords } from './hotFoodWords';

export const AUTO_CANCEL_MINUTES = 20;   // the default; HQ sets it in Settings > Hot food (rule hotFoodAutoCancelMinutes)
/** A ready order not picked up after this long: the customer is reminded, once (2026-10-12) */
export const READY_REMIND_MINUTES = 15;   // the default; Settings > Hot food (rule hotFoodReadyRemindMinutes)

/** Ready orders waiting READY_REMIND_MINUTES: the customer is reminded where and what to pay, once each. Returns how many. */
export async function remindReadyHotFoodOrders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - rule('hotFoodReadyRemindMinutes') * 60_000);
  const waiting = await prisma.hotFoodOrder.findMany({
    where: { status: 'READY', readyRemindedAt: null, readyAt: { lt: cutoff } },
    select: { id: true, customerId: true, orderNumber: true, paidWithPoints: true, totalAmount: true, store: { select: { name: true, address: true } }, customer: { select: { language: true } } },
  });
  let done = 0;
  for (const o of waiting) {
    const claimed = await prisma.hotFoodOrder.updateMany({ where: { id: o.id, status: 'READY', readyRemindedAt: null }, data: { readyRemindedAt: now } });
    if (claimed.count === 0) continue;   // picked up or reminded a moment ago
    done++;
    const m = hotFoodWords.waiting(o.customer?.language === 'es', o.orderNumber, o.store, o.paidWithPoints, o.totalAmount);
    sendPushToUser(o.customerId, m.title, m.body, 'HOT_FOOD_ORDER', customerHotFoodUrl());
  }
  return done;
}

/**
 * Ready orders nobody picked up (2026-10-16): closed after the minutes in Settings > Hot food (rule hotFoodReadyCloseMinutes, from when
 * it was marked ready), as CANCELLED by NO_SHOW, so it stops counting against the customer's open orders and the store's board. An
 * order paid with points gets them back, unless HQ switched that off (feature hotFoodNoShowPointsBack: the food was made); then they
 * count as used at that store, like a pickup. The customer and the store are told. Each order once. Returns how many.
 */
export async function closeUnpickedHotFoodOrders(now: Date = new Date()): Promise<number> {
  const minutes = rule('hotFoodReadyCloseMinutes');
  const cutoff = new Date(now.getTime() - minutes * 60_000);
  const left = await prisma.hotFoodOrder.findMany({
    where: { status: 'READY', readyAt: { lt: cutoff } },
    select: { id: true, customerId: true, storeId: true, orderNumber: true, paidWithPoints: true, pointsAmount: true, store: { select: { name: true } }, customer: { select: { language: true } } },
  });
  const hours = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
  let done = 0;
  for (const o of left) {
    // Points back (when HQ chose that) in the same transaction that closes it; a failure leaves it READY for the next run
    const giveBack = o.paidWithPoints && feature('hotFoodNoShowPointsBack');
    const closed = await cancelOrder(o.id, 'READY', { cancelledBy: 'NO_SHOW', cancelReason: `Not picked up within ${hours} of being ready`, cancelledAt: now }, giveBack, now)
      .catch((e) => { console.error('[hot-food-no-show] not closed:', o.id, e?.message ?? e); return null; });
    if (!closed) continue;   // picked up or cancelled a moment ago (or failed: tried again next run)
    done++;
    const back = closed.returned;
    // Kept: they count as used at that store, recorded with the customer as the one who used them (nobody handed it over)
    if (o.paidWithPoints && !giveBack) await recordPointsPickup(o, o.customerId).catch((e) => console.error('[hot-food-no-show] redemption not recorded:', o.id, e?.message ?? e));
    const m = hotFoodWords.closed(o.customer?.language === 'es', o.orderNumber, o.store.name, minutes, o.paidWithPoints, back ? pts(back) : 0);
    sendPushToUser(o.customerId, m.title, m.body, 'HOT_FOOD_ORDER', customerHotFoodUrl());
    tellStoreAboutOrder(o, `Order #${o.orderNumber} closed, not picked up`, `It was ready for ${hours}. It is off the board${o.paidWithPoints ? (back ? '; the customer\'s points went back' : '; paid with points') : ''}.`, now).catch(() => {});
  }
  return done;
}

/** Cancels every order still waiting after AUTO_CANCEL_MINUTES. Each one only once (a claim on its status). Returns how many. */
export async function cancelStaleHotFoodOrders(now: Date = new Date()): Promise<number> {
  const minutes = rule('hotFoodAutoCancelMinutes');
  const cutoff = new Date(now.getTime() - minutes * 60_000);
  const stale = await prisma.hotFoodOrder.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true, customerId: true, orderNumber: true, store: { select: { name: true } }, customer: { select: { language: true } } },
  });
  let done = 0;
  for (const o of stale) {
    // The points go back in the same transaction that cancels it; a failure leaves it PENDING for the next run
    const cancelled = await cancelOrder(o.id, 'PENDING', { cancelledBy: 'AUTO', cancelReason: `Not accepted within ${minutes} minutes`, cancelledAt: now }, true, now)
      .catch((e) => { console.error('[hot-food-auto-cancel] not cancelled:', o.id, e?.message ?? e); return null; });
    if (!cancelled) continue;   // accepted or cancelled a moment ago (or failed: tried again next run)
    done++;
    const returned = cancelled.returned;
    const m = hotFoodWords.timedOut(o.customer?.language === 'es', o.orderNumber, o.store.name, minutes, returned ? pts(returned) : 0);
    sendPushToUser(o.customerId, m.title, m.body, 'HOT_FOOD_ORDER', customerHotFoodUrl());
  }
  return done;
}

export function startHotFoodAutoCancelCron() {
  cron.schedule('*/5 * * * *', () => {
    cancelStaleHotFoodOrders().catch((e) => console.error('[hot-food-auto-cancel] run failed:', e?.message ?? e));
    closeUnpickedHotFoodOrders().catch((e) => console.error('[hot-food-no-show] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  console.log('[hot-food-auto-cancel] Orders nobody accepts are cancelled after the minutes in Settings > Hot food (checked every 5 minutes)');
  // An order waiting ESCALATE_MINUTES: its store's managers and everyone assigned there are told, once (checked every minute)
  cron.schedule('* * * * *', () => {
    escalateWaitingHotFoodOrders().catch((e) => console.error('[hot-food-escalate] run failed:', e?.message ?? e));
    remindReadyHotFoodOrders().catch((e) => console.error('[hot-food-ready-reminder] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  console.log(`[hot-food-escalate] Orders waiting ${ESCALATE_MINUTES} minutes are escalated to the store's managers`);
}
