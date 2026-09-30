// A push to a store's staff when someone writes in the store chat. Staff used to find out only by opening Chat.
//
// Not every line: a busy conversation would buzz everyone's phone all day. A store's chat pushes at most once every 3 minutes, and only to
// the store's active staff (and chain-wide managers), never the person who wrote. The message itself is not saved to the notification
// inbox: Chat keeps its own unread count, and one inbox entry per message would bury everything else.

import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { sendExpoBatch } from './pushSend';

export const CHAT_PUSH_GAP_MS = 3 * 60_000;
const lastPush = new Map<string, number>();

export function chatUrl(role: Role | string): string {
  return role === Role.STORE_MANAGER ? '/(manager)/chat' : '/(employee)/chat';
}

/** Returns how many phones were sent to (0 when it was too soon after the last one, or nobody has a phone signed in). */
export async function pushChatMessage(storeId: string, senderId: string, senderName: string, text: string, now = Date.now()): Promise<number> {
  if ((lastPush.get(storeId) ?? 0) > now - CHAT_PUSH_GAP_MS) return 0;
  lastPush.set(storeId, now);

  const [store, people] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
    prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: senderId },
        OR: [
          { role: { in: [Role.EMPLOYEE, Role.STORE_MANAGER] }, storeRoles: { some: { storeId } } },
          { role: Role.STORE_MANAGER, allStoresAccess: true },
        ],
      },
      select: { role: true, pushTokens: { select: { token: true } } },
    }),
  ]);
  const title = `${senderName} in ${store?.name ?? 'store'} chat`;
  const body = text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text;
  let phones = 0;
  for (const role of [Role.EMPLOYEE, Role.STORE_MANAGER]) {
    const tokens = people.filter((p) => p.role === role).flatMap((p) => p.pushTokens.map((t) => t.token));
    if (tokens.length === 0) continue;
    phones += tokens.length;
    await sendExpoBatch(tokens, { title, body, actionUrl: chatUrl(role) });
  }
  return phones;
}

/** For tests: forget when each store last pushed. */
export function resetChatPushClock() { lastPush.clear(); }
