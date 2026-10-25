import prisma from '../config/prisma';
import { Role } from '@prisma/client';
import { sendExpoBatch } from './pushSend';
import { excludeDeletedCustomers } from './accountDeletion';

async function saveNotification(userId: string, title: string, body: string, type: string, actionUrl?: string, expiresAt?: Date) {
  try {
    await prisma.userNotification.create({ data: { userId, title, body, type, actionUrl, ...(expiresAt && { expiresAt }) } });
  } catch { /* non-critical */ }
}

export async function saveNotificationMany(userIds: string[], title: string, body: string, type: string, actionUrl?: string, expiresAt?: Date) {
  if (userIds.length === 0) return;
  try {
    await prisma.userNotification.createMany({
      data: userIds.map((userId) => ({ userId, title, body, type, actionUrl, ...(expiresAt && { expiresAt }) })),
    });
  } catch { /* non-critical */ }
}

/** Send push + in-app notification to all staff (employees + managers) of a specific store. */
export async function sendPushToStoreStaff(storeId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  return sendPushToStoreByRole(storeId, title, body, type, actionUrl);
}

/** Send push + in-app notification to employees only (excludes store managers). */
export async function sendPushToStoreEmployees(storeId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  return sendPushToStoreByRole(storeId, title, body, type, actionUrl, Role.EMPLOYEE);
}

/** Send push + in-app notification to store managers only (excludes employees). */
export async function sendPushToStoreManagers(storeId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  return sendPushToStoreByRole(storeId, title, body, type, actionUrl, Role.STORE_MANAGER);
}

async function sendPushToStoreByRole(storeId: string, title: string, body: string, type: string, actionUrl?: string, role?: Role): Promise<void> {
  try {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { storeId, ...(role ? { role } : {}), user: { isActive: true } },   // a deactivated person is not told about the store any more
      include: { user: { include: { pushTokens: { select: { token: true } } } } },
    });
    if (storeRoles.length === 0) return;

    const userIds = storeRoles.map((r) => r.userId);
    await saveNotificationMany(userIds, title, body, type, actionUrl);

    const tokens = storeRoles.flatMap((r) => r.user.pushTokens.map((t) => t.token));
    if (tokens.length === 0) return;

    await sendExpoBatch(tokens, { title, body, actionUrl });
  } catch { /* non-critical */ }
}

/** Send a push notification to all devices registered for a single user. */
export async function sendPushToUser(userId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string, expiresAt?: Date): Promise<void> {
  saveNotification(userId, title, body, type, actionUrl, expiresAt); // always save to in-app inbox (expiresAt: it leaves the inbox then)

  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) return;
    await sendExpoBatch(tokens.map((t) => t.token), { title, body, actionUrl });
  } catch { /* non-critical */ }
}

/** The same push (and inbox line) to many people at once (2026-10-16, win-back gifts): one database read, batched sends. */
export async function sendPushToUsers(userIds: string[], title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await saveNotificationMany(userIds, title, body, type, actionUrl);
    const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } });
    if (tokens.length === 0) return;
    await sendExpoBatch(tokens.map((t) => t.token), { title, body, actionUrl });
  } catch { /* non-critical */ }
}

/** Broadcast a push notification to all customers (role = CUSTOMER). */
export async function broadcastToCustomers(title: string, body: string, type = 'OFFER', expiresAt?: Date, actionUrl?: string): Promise<void> {
  try {
    // Active customers only: a restricted account and a deleted one are not messaged
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers },
      select: { id: true, pushTokens: { select: { token: true } } },
    });
    if (customers.length === 0) return;

    saveNotificationMany(customers.map((c) => c.id), title, body, type, actionUrl, expiresAt);

    const allTokens = customers.flatMap((c) => c.pushTokens.map((t) => t.token));
    if (allTokens.length === 0) return;

    await sendExpoBatch(allTokens, { title, body, actionUrl });
  } catch { /* non-critical */ }
}
