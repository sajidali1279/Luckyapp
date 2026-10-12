// Who hears about a new hot food order (2026-10-11). The people working at that store right now, from the schedule; when nobody is
// scheduled at the moment (no schedule kept, or between shifts), everyone assigned to the store, so an order is never missed. Someone
// assigned to several stores is told only about the store they are working at. An order nobody accepts within ESCALATE_MINUTES is
// escalated once: the store's managers and everyone assigned there hear about it. (It is still cancelled at AUTO_CANCEL_MINUTES.)
import prisma from '../config/prisma';
import { saveNotificationMany, sendPushToStoreEmployees, sendPushToStoreManagers } from './push';
import { sendExpoBatch } from './pushSend';
import { workingAt } from './staffCheckIn';
import { hotFoodOrderUrl } from './notificationRoutes';
import { rule } from './appSettings';

export const ESCALATE_MINUTES = 5;   // the default; Settings > Hot food (rule hotFoodEscalateMinutes)

/**
 * The people working at a store at `now`: on a shift now and checked in there today, or not checked in anywhere today and scheduled there
 * (utils/staffCheckIn.ts). Approved time off and people no longer assigned to the store are left out.
 */
export async function onShiftAt(storeId: string, now: Date = new Date()): Promise<string[]> {
  return workingAt(storeId, now);
}

async function pushToUsers(userIds: string[], title: string, body: string, type: string, actionUrl?: string) {
  if (userIds.length === 0) return;
  await saveNotificationMany(userIds, title, body, type, actionUrl);
  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } });
  if (tokens.length) await sendExpoBatch(tokens.map((t) => t.token), { title, body, actionUrl });
}

/** About an order: to whoever is on shift at its store now, else to everyone assigned to the store. Returns who was told. */
export async function tellStoreAboutOrder(order: { id: string; storeId: string }, title: string, body: string, now: Date = new Date()): Promise<'shift' | 'store'> {
  const url = hotFoodOrderUrl(order.id, order.storeId);
  try {
    const onShift = await onShiftAt(order.storeId, now);
    // Only people whose phone can ring: when nobody on shift has the app with notifications on, the whole store is told instead
    const reachable = onShift.length ? new Set((await prisma.pushToken.findMany({ where: { userId: { in: onShift } }, select: { userId: true } })).map((t) => t.userId)) : new Set<string>();
    if (reachable.size > 0) { await pushToUsers(onShift, title, body, 'HOT_FOOD_ORDER', url); return 'shift'; }
  } catch { /* fall back to the whole store below */ }
  await sendPushToStoreEmployees(order.storeId, title, body, 'HOT_FOOD_ORDER', url);
  return 'store';
}

/** Orders still waiting after ESCALATE_MINUTES, each once: the store's managers and everyone assigned there are told. Returns how many. */
export async function escalateWaitingHotFoodOrders(now: Date = new Date()): Promise<number> {
  const escalate = rule('hotFoodEscalateMinutes');
  const cutoff = new Date(now.getTime() - escalate * 60_000);
  const waiting = await prisma.hotFoodOrder.findMany({
    where: { status: 'PENDING', escalatedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, storeId: true, orderNumber: true, createdAt: true, store: { select: { name: true } } },
  });
  let done = 0;
  for (const o of waiting) {
    const claimed = await prisma.hotFoodOrder.updateMany({ where: { id: o.id, status: 'PENDING', escalatedAt: null }, data: { escalatedAt: now } });
    if (claimed.count === 0) continue;   // accepted, cancelled or escalated a moment ago
    done++;
    const waited = Math.max(escalate, Math.round((now.getTime() - o.createdAt.getTime()) / 60_000));
    await sendPushToStoreEmployees(o.storeId, `⏰ Order #${o.orderNumber} is waiting`,
      `A customer's hot food order at ${o.store.name} has waited ${waited} minutes. Accept it or decline it.`, 'HOT_FOOD_ORDER', hotFoodOrderUrl(o.id, o.storeId));
    await sendPushToStoreManagers(o.storeId, `⏰ Order #${o.orderNumber} at ${o.store.name} is waiting`,
      `Nobody has accepted it in ${waited} minutes. Make sure someone at the store answers it; it cancels by itself at ${rule('hotFoodAutoCancelMinutes')} minutes.`, 'HOT_FOOD_ORDER');
  }
  return done;
}

