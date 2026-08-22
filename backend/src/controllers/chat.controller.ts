import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

const PLATFORM_ADMIN_ROLES = ['DEV_ADMIN', 'SUPER_ADMIN'];

async function canAccessStore(userId: string, role: string, storeId: string): Promise<boolean> {
  if (PLATFORM_ADMIN_ROLES.includes(role)) return true;
  const access = await prisma.userStoreRole.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  return !!access;
}

// ─── GET /chat/my-stores ──────────────────────────────────────────────────────

export async function getMyChatStores(req: AuthRequest, res: Response) {
  const user = req.user!;
  if (PLATFORM_ADMIN_ROLES.includes(user.role)) {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: stores });
  } else {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { userId: user.id },
      include: { store: { select: { id: true, name: true, city: true } } },
    });
    res.json({ success: true, data: storeRoles.map((sr) => sr.store) });
  }
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

  if (after) {
    // Polling mode: only messages newer than `after` timestamp
    const messages = await prisma.chatMessage.findMany({
      where: { storeId, createdAt: { gt: new Date(after) } },
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
          ...(before ? { createdAt: { lt: new Date(before) } } : {}),
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

  const storeIds = PLATFORM_ADMIN_ROLES.includes(user.role)
    ? (await prisma.store.findMany({ where: { isActive: true }, select: { id: true } })).map((s) => s.id)
    : (await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((r) => r.storeId);

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

  const storeIds = PLATFORM_ADMIN_ROLES.includes(user.role)
    ? (await prisma.store.findMany({ where: { isActive: true }, select: { id: true } })).map((s) => s.id)
    : (await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((r) => r.storeId);

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

  if (!text || !text.trim()) {
    res.status(400).json({ success: false, error: 'Message text is required' });
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
