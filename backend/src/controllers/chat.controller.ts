import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { canUseStore as canAccessStore, usableStoreIds } from '../utils/storeAccess';
import { audit } from '../utils/audit';
import { pushChatMessage, pushDirectMessage } from '../utils/chatPush';
import { hasMinRole } from '../middleware/auth';
import { Role } from '@prisma/client';

const MAX_MESSAGE = 2000;
/**
 * Private messages (2026-10-23): a message with a toUserId in the store's thread is read only by who wrote it, who it is for, and HQ
 * (Super Admin and above, who see the whole thread so a private line can never hide a problem). Everyone else never receives it, from
 * any of the routes below. Messages with no toUserId are the shared thread, as before.
 */
const canSeeAllPrivate = (role: string) => hasMinRole(role as Role, Role.SUPER_ADMIN);
const visibleTo = (user: { id: string; role: string }) => (canSeeAllPrivate(user.role) ? {} : { OR: [{ toUserId: null }, { toUserId: user.id }, { userId: user.id }] });
/** What counts as unread for someone: the shared thread and what was sent to them (HQ is not told about other people's private lines). */
const unreadVisible = (user: { id: string }) => ({ OR: [{ toUserId: null }, { toUserId: user.id }] });
const asDate = (v?: string) => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d : null; };

// ─── GET /chat/my-stores ──────────────────────────────────────────────────────

export async function getMyChatStores(req: AuthRequest, res: Response) {
  const user = req.user!;
  // HQ and the all-stores manager get every open store; anyone else their own
  const ids = await usableStoreIds(user.id, user.role);
  const stores = await prisma.store.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stores });
}

// ─── GET /chat/:storeId/messages ─────────────────────────────────────────────

export async function getMessages(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { after, before } = req.query as { after?: string; before?: string };
  const user = req.user!;

  if (!(await canAccessStore(user.id, user.role, storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store chat' });
    return;
  }

  const afterDate = asDate(after);
  const beforeDate = asDate(before);
  if (afterDate) {
    // Polling mode: only messages newer than `after` timestamp
    const messages = await prisma.chatMessage.findMany({
      where: { storeId, createdAt: { gt: afterDate }, ...visibleTo(user) },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json({ success: true, data: messages });
  } else {
    // Initial load: last 50 messages — this is when the user is actually looking
    // at the room, so mark it read up to now
    const [messages] = await Promise.all([
      prisma.chatMessage.findMany({
        where: {
          storeId,
          ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
          ...visibleTo(user),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.chatRead.upsert({
        where: { userId_storeId: { userId: user.id, storeId } },
        update: { lastReadAt: new Date() },
        create: { userId: user.id, storeId, lastReadAt: new Date() },
      }),
    ]);
    res.json({ success: true, data: messages.reverse() });
  }
}

// ─── GET /chat/unread-count ───────────────────────────────────────────────────

export async function getUnreadCount(req: AuthRequest, res: Response) {
  const user = req.user!;

  const storeIds = await usableStoreIds(user.id, user.role);

  if (storeIds.length === 0) {
    res.json({ success: true, data: { count: 0 } });
    return;
  }

  const reads = await prisma.chatRead.findMany({
    where: { userId: user.id, storeId: { in: storeIds } },
    select: { storeId: true, lastReadAt: true },
  });
  const readMap = new Map(reads.map((r) => [r.storeId, r.lastReadAt]));

  const count = await prisma.chatMessage.count({
    where: {
      userId: { not: user.id },
      AND: [
        { OR: storeIds.map((storeId) => ({ storeId, createdAt: { gt: readMap.get(storeId) ?? new Date(0) } })) },
        unreadVisible(user),
      ],
    },
  });

  res.json({ success: true, data: { count } });
}

// ─── GET /chat/unread-by-store ────────────────────────────────────────────────
// Same computation as getUnreadCount, but broken out per store so a
// multi-store viewer's own store-picker sidebar can show which specific
// store(s) actually have something unread, instead of one combined number
// with no indication of where it is.

export async function getUnreadCountByStore(req: AuthRequest, res: Response) {
  const user = req.user!;

  const storeIds = await usableStoreIds(user.id, user.role);

  if (storeIds.length === 0) {
    res.json({ success: true, data: {} });
    return;
  }

  const reads = await prisma.chatRead.findMany({
    where: { userId: user.id, storeId: { in: storeIds } },
    select: { storeId: true, lastReadAt: true },
  });
  const readMap = new Map(reads.map((r) => [r.storeId, r.lastReadAt]));

  const counts = await Promise.all(storeIds.map(async (storeId) => {
    const count = await prisma.chatMessage.count({
      where: { storeId, userId: { not: user.id }, createdAt: { gt: readMap.get(storeId) ?? new Date(0) }, ...unreadVisible(user) },
    });
    return [storeId, count] as const;
  }));

  res.json({ success: true, data: Object.fromEntries(counts) });
}

// ─── POST /chat/:storeId/messages ─────────────────────────────────────────────

export async function sendMessage(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { text, toUserId } = req.body as { text: string; toUserId?: string };
  const user = req.user!;

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ success: false, error: 'Message text is required' });
    return;
  }
  if (text.trim().length > MAX_MESSAGE) {
    res.status(400).json({ success: false, error: `Keep a message under ${MAX_MESSAGE.toLocaleString('en-US')} characters.` });
    return;
  }

  if (!(await canAccessStore(user.id, user.role, storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store chat' });
    return;
  }

  // A private message: to one person who works at this store (or an all-stores manager), never to yourself or a customer
  type Recipient = { id: string; name: string | null; phone: string; role: Role; isActive: boolean };
  let to = null as Recipient | null;
  if (toUserId !== undefined && toUserId !== null && toUserId !== '') {
    if (typeof toUserId !== 'string') { res.status(400).json({ success: false, error: 'Choose who the message is for.' }); return; }
    if (toUserId === user.id) { res.status(400).json({ success: false, error: 'You cannot send a private message to yourself.' }); return; }
    to = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, name: true, phone: true, role: true, isActive: true } }) as typeof to;
    if (!to || !(to as any).isActive || to.role === Role.CUSTOMER || !(await canAccessStore(to.id, to.role, storeId))) {
      res.status(400).json({ success: false, error: 'That person does not work at this store, so a private message cannot go to them here.' });
      return;
    }
  }

  const message = await prisma.chatMessage.create({
    data: {
      storeId,
      userId: user.id,
      userName: user.name || user.phone,
      userRole: user.role,
      text: text.trim(),
      ...(to ? { toUserId: to.id, toUserName: to.name || to.phone } : {}),
    },
  });
  // The store's staff hear about it (at most once every few minutes per store), or just the one person it is for; a push problem never fails the message
  if (to) pushDirectMessage(storeId, user.id, user.name || 'Someone', to.id, message.text).catch((e) => console.error('[chat-push]', e?.message ?? e));
  else pushChatMessage(storeId, user.id, user.name || 'Someone', message.text).catch((e) => console.error('[chat-push]', e?.message ?? e));

  res.status(201).json({ success: true, data: message });
}

// ─── GET /chat/:storeId/people ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Who a private message can go to at this store (2026-10-23): its active employees and managers, and managers over every store; not you.

export async function getChatPeople(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const user = req.user!;
  if (!(await canAccessStore(user.id, user.role, storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store chat' });
    return;
  }
  const people = await prisma.user.findMany({
    where: {
      isActive: true, id: { not: user.id },
      OR: [
        { role: { in: [Role.EMPLOYEE, Role.STORE_MANAGER] }, storeRoles: { some: { storeId } } },
        { role: Role.STORE_MANAGER, allStoresAccess: true },
      ],
    },
    select: { id: true, name: true, phone: true, role: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: people.map((p) => ({ id: p.id, name: p.name || (p.role === Role.STORE_MANAGER ? 'Manager' : 'Employee'), role: p.role })) });
}

// ─── DELETE /chat/:storeId/messages ───────────────────────────────────────────
// Permanently deletes this store's entire chat history. There is one shared
// thread per store, not a separate copy per viewer, so this clears it for
// that store's own staff too, not just the admin who clicked it — route-gated
// to SUPER_ADMIN+ accordingly, not left to a StoreManager acting alone on a
// conversation other people rely on.

export async function clearChat(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }
  const result = await prisma.chatMessage.deleteMany({ where: { storeId } });
  // Nothing else remembers that a whole conversation was wiped, or by whom
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CLEAR_CHAT', entity: 'store', entityId: storeId,
    details: { summary: `${store.name} chat cleared: ${result.count.toLocaleString('en-US')} message${result.count === 1 ? '' : 's'} deleted`, deletedCount: result.count },
    storeId, storeName: store.name,
  });
  res.json({ success: true, data: { deletedCount: result.count } });
}
