import prisma from '../config/prisma';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Send a push notification to all devices registered for a single user. */
export async function sendPushToUser(userId: string, title: string, body: string): Promise<void> {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (tokens.length === 0) return;
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default' }))),
    });
  } catch {
    // Non-critical — don't let push failure break the response
  }
}

/** Broadcast a push notification to all customers (role = CUSTOMER). */
export async function broadcastToCustomers(title: string, body: string): Promise<void> {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { user: { role: 'CUSTOMER' } },
      select: { token: true },
    });
    if (tokens.length === 0) return;
    // Expo push API accepts up to 100 messages per request
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map(({ token }) => ({ to: token, title, body, sound: 'default' }))),
      });
    }
  } catch {
    // Non-critical — don't block the response
  }
}
