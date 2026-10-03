// HQ's alerts marked read, shared by every HQ admin and every computer (AdminNotificationRead). The alert lists themselves are worked
// out fresh on each request (billing.controller.ts getSuperAdminNotifications / getDevAdminNotifications); this adds who read each one.

import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { refuse } from '../utils/refusal';

/** The alerts with read status filled in from the shared list (an alert the server already counts as read stays read). */
export async function withSharedReads<T extends { id: string; isRead: boolean }>(alerts: T[]): Promise<(T & { readByName?: string | null; readAt?: Date })[]> {
  if (alerts.length === 0) return alerts;
  const reads = await prisma.adminNotificationRead.findMany({
    where: { notificationId: { in: alerts.map((a) => a.id) } },
    select: { notificationId: true, readByName: true, readAt: true },
  });
  const byId = new Map(reads.map((r) => [r.notificationId, r]));
  return alerts.map((a) => {
    const r = byId.get(a.id);
    return r ? { ...a, isRead: true, readByName: r.readByName, readAt: r.readAt } : a;
  });
}

const readSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(200)).min(1, 'Choose at least one alert.').max(500, 'At most 500 alerts at once.'),
  read: z.boolean().default(true),
});

/** POST /admin/notifications/read { ids, read }: marks alerts read (or unread again) for every HQ admin. */
export async function setAdminNotificationsRead(req: AuthRequest, res: Response) {
  const parsed = readSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const ids = [...new Set(parsed.data.ids)];
  if (parsed.data.read) {
    await prisma.adminNotificationRead.createMany({
      data: ids.map((notificationId) => ({ notificationId, readById: req.user!.id, readByName: req.user!.name || null })),
      skipDuplicates: true,   // already read by someone: the first reader stays on record
    });
  } else {
    await prisma.adminNotificationRead.deleteMany({ where: { notificationId: { in: ids } } });
  }
  res.json({ success: true, data: { ids, read: parsed.data.read } });
}
