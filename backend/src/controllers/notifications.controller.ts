import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

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
