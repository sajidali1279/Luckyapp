import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { broadcastToCustomers, sendPushToStoreStaff, saveNotificationMany } from '../utils/push';

// GET /notifications/my — paginated list for current user
export async function getMyNotifications(req: AuthRequest, res: Response) {
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = 20;

  const [notifications, unreadCount] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.userNotification.count({
      where: { userId: req.user!.id, isRead: false },
    }),
  ]);

  res.json({ success: true, data: { notifications, unreadCount, page } });
}

// PATCH /notifications/mark-all-read
export async function markAllRead(req: AuthRequest, res: Response) {
  await prisma.userNotification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ success: true });
}

// PATCH /notifications/:id/read
export async function markOneRead(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.userNotification.updateMany({
    where: { id, userId: req.user!.id },
    data: { isRead: true },
  });
  res.json({ success: true });
}

// GET /notifications/unread-count — lightweight for badge polling
export async function getUnreadCount(req: AuthRequest, res: Response) {
  const count = await prisma.userNotification.count({
    where: { userId: req.user!.id, isRead: false },
  });
  res.json({ success: true, data: { count } });
}

// POST /notifications/broadcast (SUPER_ADMIN+)
// target: ALL_CUSTOMERS | STORE_CUSTOMERS | ALL_STAFF | STORE_STAFF
export async function broadcastNotification(req: AuthRequest, res: Response) {
  const { target, storeId, title, body } = req.body as {
    target: string; storeId?: string; title: string; body: string;
  };

  const VALID = ['ALL_CUSTOMERS', 'STORE_CUSTOMERS', 'ALL_STAFF', 'STORE_STAFF'];
  if (!VALID.includes(target)) {
    res.status(400).json({ success: false, error: 'Invalid target' }); return;
  }
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ success: false, error: 'title and body are required' }); return;
  }
  if ((target === 'STORE_CUSTOMERS' || target === 'STORE_STAFF') && !storeId) {
    res.status(400).json({ success: false, error: 'storeId required for store-specific targets' }); return;
  }

  const PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  let recipientCount = 0;

  if (target === 'ALL_CUSTOMERS') {
    await broadcastToCustomers(title.trim(), body.trim(), 'BROADCAST');
    recipientCount = await prisma.user.count({ where: { role: 'CUSTOMER' as any, isActive: true } });
  } else if (target === 'STORE_CUSTOMERS') {
    const rows = await prisma.pointsTransaction.findMany({
      where: { storeId }, select: { customerId: true }, distinct: ['customerId'],
    });
    const ids = rows.map((r) => r.customerId);
    if (ids.length > 0) {
      const customers = await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true, pushTokens: { select: { token: true } } },
      });
      await saveNotificationMany(customers.map((c) => c.id), title.trim(), body.trim(), 'BROADCAST');
      const tokens = customers.flatMap((c) => c.pushTokens.map((t) => t.token));
      for (let i = 0; i < tokens.length; i += 100) {
        await fetch(PUSH_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(tokens.slice(i, i + 100).map((token) => ({ to: token, title: title.trim(), body: body.trim(), sound: 'default' }))),
        });
      }
      recipientCount = customers.length;
    }
  } else if (target === 'ALL_STAFF') {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['EMPLOYEE', 'STORE_MANAGER'] as any[] }, isActive: true },
      select: { id: true, pushTokens: { select: { token: true } } },
    });
    await saveNotificationMany(staff.map((s) => s.id), title.trim(), body.trim(), 'BROADCAST');
    const tokens = staff.flatMap((s) => s.pushTokens.map((t) => t.token));
    for (let i = 0; i < tokens.length; i += 100) {
      await fetch(PUSH_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(tokens.slice(i, i + 100).map((token) => ({ to: token, title: title.trim(), body: body.trim(), sound: 'default' }))),
      });
    }
    recipientCount = staff.length;
  } else if (target === 'STORE_STAFF') {
    await sendPushToStoreStaff(storeId!, title.trim(), body.trim(), 'BROADCAST');
    recipientCount = await prisma.userStoreRole.count({ where: { storeId } });
  }

  res.json({ success: true, data: { recipientCount, target } });
}
