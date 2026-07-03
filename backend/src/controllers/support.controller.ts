import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const VALID_CATEGORIES = ['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCESS', 'OTHER'] as const;

// ─── POST /support/threads ────────────────────────────────────────────────────
export async function createThread(req: AuthRequest, res: Response) {
  const schema = z.object({
    subject:  z.string().min(1).max(200),
    message:  z.string().min(1).max(2000),
    priority: z.enum(VALID_PRIORITIES).optional().default('NORMAL'),
    category: z.enum(VALID_CATEGORIES).optional().default('OTHER'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  const user = req.user!;
  const { subject, message, priority, category } = parsed.data;

  const thread = await prisma.supportThread.create({
    data: {
      fromUserId: user.id,
      fromName:   user.name || user.phone,
      subject,
      priority,
      category,
      messages: {
        create: {
          senderId:   user.id,
          senderName: user.name || user.phone,
          senderRole: user.role,
          body:       message,
        },
      },
    },
    include: { messages: true },
  });

  res.status(201).json({ success: true, data: thread });
}

// ─── GET /support/threads ─────────────────────────────────────────────────────
// Supports ?status=OPEN|RESOLVED, ?category=..., ?priority=..., ?search=...
export async function getThreads(req: AuthRequest, res: Response) {
  const user = req.user!;
  const isDevAdmin = user.role === 'DEV_ADMIN';
  const { status, category, priority, search } = req.query as Record<string, string | undefined>;

  const where: any = isDevAdmin ? {} : { fromUserId: user.id };
  if (status   && ['OPEN', 'RESOLVED'].includes(status))                 where.status   = status;
  if (category && VALID_CATEGORIES.includes(category as any))            where.category = category;
  if (priority && VALID_PRIORITIES.includes(priority as any))            where.priority = priority;
  if (search?.trim()) {
    where.subject = { contains: search.trim(), mode: 'insensitive' };
  }

  const threads = await prisma.supportThread.findMany({
    where,
    orderBy: [
      // Urgent + High float to top for DevAdmin
      ...(isDevAdmin ? [{ priority: 'desc' as const }] : []),
      { updatedAt: 'desc' },
    ],
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: {
        select: {
          messages: {
            where: { isRead: false, senderRole: { not: 'DEV_ADMIN' } },
          },
        },
      },
    },
  });

  res.json({ success: true, data: threads });
}

// ─── GET /support/threads/:threadId ──────────────────────────────────────────
export async function getThread(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { threadId } = req.params;
  const isDevAdmin = user.role === 'DEV_ADMIN';

  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (!thread) { res.status(404).json({ success: false, error: 'Thread not found' }); return; }
  if (!isDevAdmin && thread.fromUserId !== user.id) {
    res.status(403).json({ success: false, error: 'Access denied' }); return;
  }

  await prisma.supportMessage.updateMany({
    where: {
      threadId,
      isRead: false,
      senderRole: isDevAdmin ? { not: 'DEV_ADMIN' } : 'DEV_ADMIN',
    },
    data: { isRead: true },
  });

  res.json({ success: true, data: thread });
}

// ─── POST /support/threads/:threadId/messages ─────────────────────────────────
export async function sendMessage(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { threadId } = req.params;
  const isDevAdmin = user.role === 'DEV_ADMIN';

  const schema = z.object({ body: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: 'Message body is required' }); return; }

  const thread = await prisma.supportThread.findUnique({ where: { id: threadId } });
  if (!thread) { res.status(404).json({ success: false, error: 'Thread not found' }); return; }
  if (!isDevAdmin && thread.fromUserId !== user.id) { res.status(403).json({ success: false, error: 'Access denied' }); return; }
  if (thread.status === 'RESOLVED' && !isDevAdmin) { res.status(400).json({ success: false, error: 'Thread is resolved' }); return; }

  const message = await prisma.supportMessage.create({
    data: {
      threadId,
      senderId:   user.id,
      senderName: user.name || user.phone,
      senderRole: user.role,
      body:       parsed.data.body,
    },
  });

  await prisma.supportThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  res.status(201).json({ success: true, data: message });
}

// ─── PATCH /support/threads/:threadId/resolve ─────────────────────────────────
export async function resolveThread(req: AuthRequest, res: Response) {
  const { threadId } = req.params;
  const { status } = req.body as { status?: string };
  const newStatus = status === 'OPEN' ? 'OPEN' : 'RESOLVED';

  const thread = await prisma.supportThread.update({
    where: { id: threadId },
    data: {
      status: newStatus,
      resolvedAt: newStatus === 'RESOLVED' ? new Date() : null,
    },
  });

  res.json({ success: true, data: thread });
}

// ─── PATCH /support/threads/:threadId/priority ───────────────────────────────
// DevAdmin only — change thread priority
export async function updatePriority(req: AuthRequest, res: Response) {
  const { threadId } = req.params;
  const { priority } = req.body as { priority?: string };

  if (!priority || !VALID_PRIORITIES.includes(priority as any)) {
    res.status(400).json({ success: false, error: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}` }); return;
  }

  const thread = await prisma.supportThread.update({
    where: { id: threadId },
    data: { priority },
  });

  res.json({ success: true, data: thread });
}

// ─── GET /support/unread-count ────────────────────────────────────────────────
// DevAdmin: unread replies across the whole inbox (from anyone but themself).
// SuperAdmin: unread replies from DevAdmin on threads they personally opened.
export async function getUnreadCount(req: AuthRequest, res: Response) {
  const user = req.user!;
  const isDevAdmin = user.role === 'DEV_ADMIN';

  const count = await prisma.supportMessage.count({
    where: isDevAdmin
      ? { isRead: false, senderRole: { not: 'DEV_ADMIN' } }
      : { isRead: false, senderRole: 'DEV_ADMIN', thread: { fromUserId: user.id } },
  });
  res.json({ success: true, data: { count } });
}

// ─── GET /support/stats ───────────────────────────────────────────────────────
// DevAdmin only — summary stats for the inbox header
export async function getSupportStats(req: AuthRequest, res: Response) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [openCount, urgentCount, resolvedThisWeek, allResolved] = await Promise.all([
    prisma.supportThread.count({ where: { status: 'OPEN' } }),
    prisma.supportThread.count({ where: { status: 'OPEN', priority: 'URGENT' } }),
    prisma.supportThread.count({ where: { status: 'RESOLVED', resolvedAt: { gte: sevenDaysAgo } } }),
    (prisma.supportThread as any).findMany({
      where: { status: 'RESOLVED', resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    }),
  ]);

  // Avg response time in hours (only threads with resolvedAt)
  let avgResponseHours: number | null = null;
  if (allResolved.length > 0) {
    const totalMs = allResolved.reduce((sum: number, t: any) => {
      return sum + (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime());
    }, 0);
    avgResponseHours = Math.round(totalMs / allResolved.length / 3600000 * 10) / 10;
  }

  res.json({ success: true, data: { openCount, urgentCount, resolvedThisWeek, avgResponseHours } });
}
