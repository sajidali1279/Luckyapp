import prisma from '../config/prisma';
import { Role } from '@prisma/client';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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
      where: { storeId, ...(role ? { role } : {}) },
      include: { user: { include: { pushTokens: { select: { token: true } } } } },
    });
    if (storeRoles.length === 0) return;

    const userIds = storeRoles.map((r) => r.userId);
    await saveNotificationMany(userIds, title, body, type, actionUrl);

    const tokens = storeRoles.flatMap((r) => r.user.pushTokens.map((t) => t.token));
    if (tokens.length === 0) return;

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((token) => ({ to: token, title, body, sound: 'default', ...(actionUrl && { data: { actionUrl } }) }))),
    });
  } catch { /* non-critical */ }
}

/** Send a push notification to all devices registered for a single user. */
export async function sendPushToUser(userId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  saveNotification(userId, title, body, type, actionUrl); // always save to in-app inbox

  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) return;
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default', ...(actionUrl && { data: { actionUrl } }) }))),
    });
  } catch { /* non-critical */ }
}

/** Broadcast a push notification to all customers (role = CUSTOMER). */
export async function broadcastToCustomers(title: string, body: string, type = 'OFFER', expiresAt?: Date, actionUrl?: string): Promise<void> {
  try {
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true, pushTokens: { select: { token: true } } },
    });
    if (customers.length === 0) return;

    saveNotificationMany(customers.map((c) => c.id), title, body, type, actionUrl, expiresAt);

    const allTokens = customers.flatMap((c) => c.pushTokens.map((t) => t.token));
    if (allTokens.length === 0) return;

    for (let i = 0; i < allTokens.length; i += 100) {
      const chunk = allTokens.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map((token) => ({ to: token, title, body, sound: 'default', ...(actionUrl && { data: { actionUrl } }) }))),
      });
    }
  } catch { /* non-critical */ }
}
