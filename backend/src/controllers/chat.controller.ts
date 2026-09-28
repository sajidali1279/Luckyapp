import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { canUseStore as canAccessStore, usableStoreIds } from '../utils/storeAccess';
import { audit } from '../utils/audit';

const MAX_MESSAGE = 2000;
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
      where: { storeId, createdAt: { gt: afterDate } },
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
      OR: storeIds.map((storeId) => ({
        storeId,
        createdAt: { gt: readMap.get(storeId) ?? new Date(0) },
      })),
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
      where: { storeId, userId: { not: user.id }, createdAt: { gt: readMap.get(storeId) ?? new Date(0) } },
    });
    return [storeId, count] as const;
  }));

  res.json({ success: true, data: Object.fromEntries(counts) });
}

// ─── POST /chat/:storeId/messages ─────────────────────────────────────────────

export async function sendMessage(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { text } = req.body as { text: string };
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

  const message = await prisma.chatMessage.create({
    data: {
      storeId,
      userId: user.id,
      userName: user.name || user.phone,
      userRole: user.role,
      text: text.trim(),
    },
  });

  res.status(201).json({ success: true, data: message });
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
