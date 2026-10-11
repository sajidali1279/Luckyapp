// Who hears about a new hot food order (2026-10-11). The people working at that store right now, from the schedule; when nobody is
// scheduled at the moment (no schedule kept, or between shifts), everyone assigned to the store, so an order is never missed. Someone
// assigned to several stores is told only about the store they are working at. An order nobody accepts within ESCALATE_MINUTES is
// escalated once: the store's managers and everyone assigned there hear about it. (It is still cancelled at AUTO_CANCEL_MINUTES.)
import prisma from '../config/prisma';
import { DayOfWeek } from '@prisma/client';
import { saveNotificationMany, sendPushToStoreEmployees, sendPushToStoreManagers } from './push';
import { sendExpoBatch } from './pushSend';
import { storeMinutes, storeWeekday, storeDayStart, storeDayEnd } from './storeTime';
import { hotFoodOrderUrl } from './notificationRoutes';

export const ESCALATE_MINUTES = 5;
const DAYS: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/**
 * The people on shift at a store at `now` (store time): today's shifts that have started and not ended, and last night's shifts that run
 * past midnight. Only people still active and still assigned to that store.
 */
export async function onShiftAt(storeId: string, now: Date = new Date()): Promise<string[]> {
  const day = storeWeekday(now);
  const minute = storeMinutes(now);
  const today = DAYS[day];
  const yesterday = DAYS[(day + 6) % 7];
  const shifts = await prisma.shiftTemplate.findMany({
    where: { storeId, isActive: true, dayOfWeek: { in: [today, yesterday] }, employee: { isActive: true, storeRoles: { some: { storeId } } } },
    select: { employeeId: true, dayOfWeek: true, startTime: true, endTime: true },
  });
  // Approved time off today (store day): not working, whatever the weekly schedule says
  const off = new Set((await prisma.shiftRequest.findMany({
    where: { employeeId: { in: [...new Set(shifts.map((s) => s.employeeId))] }, requestType: 'TIME_OFF', status: 'APPROVED', date: { gte: storeDayStart(now), lte: storeDayEnd(now) } },
    select: { employeeId: true },
  })).map((r) => r.employeeId));
  const ids = new Set<string>();
  for (const s of shifts) {
    if (off.has(s.employeeId)) continue;
    const start = mins(s.startTime); const end = mins(s.endTime);
    const overnight = end <= start;
    if (s.dayOfWeek === today && (overnight ? minute >= start : minute >= start && minute < end)) ids.add(s.employeeId);
    if (s.dayOfWeek === yesterday && overnight && minute < end) ids.add(s.employeeId);
  }
  return [...ids];
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
  const cutoff = new Date(now.getTime() - ESCALATE_MINUTES * 60_000);
  const waiting = await prisma.hotFoodOrder.findMany({
    where: { status: 'PENDING', escalatedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, storeId: true, orderNumber: true, createdAt: true, store: { select: { name: true } } },
  });
  let done = 0;
  for (const o of waiting) {
    const claimed = await prisma.hotFoodOrder.updateMany({ where: { id: o.id, status: 'PENDING', escalatedAt: null }, data: { escalatedAt: now } });
    if (claimed.count === 0) continue;   // accepted, cancelled or escalated a moment ago
    done++;
    const waited = Math.max(ESCALATE_MINUTES, Math.round((now.getTime() - o.createdAt.getTime()) / 60_000));
    await sendPushToStoreEmployees(o.storeId, `⏰ Order #${o.orderNumber} is waiting`,
      `A customer's hot food order at ${o.store.name} has waited ${waited} minutes. Accept it or decline it.`, 'HOT_FOOD_ORDER', hotFoodOrderUrl(o.id, o.storeId));
    await sendPushToStoreManagers(o.storeId, `⏰ Order #${o.orderNumber} at ${o.store.name} is waiting`,
      `Nobody has accepted it in ${waited} minutes. Make sure someone at the store answers it; it cancels by itself at 20 minutes.`, 'HOT_FOOD_ORDER');
  }
  return done;
}

