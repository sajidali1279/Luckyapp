import prisma from '../config/prisma';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function saveNotification(userId: string, title: string, body: string, type: string) {
  try {
    await prisma.userNotification.create({ data: { userId, title, body, type } });
  } catch { /* non-critical */ }
}

export async function saveNotificationMany(userIds: string[], title: string, body: string, type: string) {
  if (userIds.length === 0) return;
  try {
    await prisma.userNotification.createMany({
      data: userIds.map((userId) => ({ userId, title, body, type })),
    });
  } catch { /* non-critical */ }
}

/** Send push + in-app notification to all staff (employees + managers) of a specific store. */
export async function sendPushToStoreStaff(storeId: string, title: string, body: string, type = 'GENERAL'): Promise<void> {
  try {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { storeId },
      include: { user: { include: { pushTokens: { select: { token: true } } } } },
    });
    if (storeRoles.length === 0) return;

    const userIds = storeRoles.map((r) => r.userId);
    await saveNotificationMany(userIds, title, body, type);

    const tokens = storeRoles.flatMap((r) => r.user.pushTokens.map((t) => t.token));
    if (tokens.length === 0) return;

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((token) => ({ to: token, title, body, sound: 'default' }))),
    });
  } catch { /* non-critical */ }
}

/** Send a push notification to all devices registered for a single user. */
export async function sendPushToUser(userId: string, title: string, body: string, type = 'GENERAL'): Promise<void> {
  saveNotification(userId, title, body, type); // always save to in-app inbox

  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) return;
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default' }))),
    });
  } catch { /* non-critical */ }
}

/** Broadcast a push notification to all customers (role = CUSTOMER). */
export async function broadcastToCustomers(title: string, body: string, type = 'OFFER'): Promise<void> {
  try {
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true, pushTokens: { select: { token: true } } },
    });
    if (customers.length === 0) return;

    saveNotificationMany(customers.map((c) => c.id), title, body, type);

    const allTokens = customers.flatMap((c) => c.pushTokens.map((t) => t.token));
    if (allTokens.length === 0) return;

    for (let i = 0; i < allTokens.length; i += 100) {
      const chunk = allTokens.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map((token) => ({ to: token, title, body, sound: 'default' }))),
      });
    }
  } catch { /* non-critical */ }
}
