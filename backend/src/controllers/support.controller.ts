import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

// ─── POST /support/threads ────────────────────────────────────────────────────
// SuperAdmin opens a new thread with an initial message

export async function createThread(req: AuthRequest, res: Response) {
  const schema = z.object({
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(2000),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  const user = req.user!;
  const { subject, message } = parsed.data;

  const thread = await prisma.supportThread.create({
    data: {
      fromUserId: user.id,
      fromName: user.name || user.phone,
      subject,
      messages: {
        create: {
          senderId: user.id,
          senderName: user.name || user.phone,
          senderRole: user.role,
          body: message,
        },
      },
    },
    include: { messages: true },
  });

  res.status(201).json({ success: true, data: thread });
}

// ─── GET /support/threads ─────────────────────────────────────────────────────
// SuperAdmin: own threads. DevAdmin: all threads.

export async function getThreads(req: AuthRequest, res: Response) {
  const user = req.user!;
  const isDevAdmin = user.role === 'DEV_ADMIN';

  const threads = await prisma.supportThread.findMany({
    where: isDevAdmin ? {} : { fromUserId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          messages: {
            where: {
              isRead: false,
              senderRole: { not: 'DEV_ADMIN' },
            },
          },
        },
      },
    },
  });

  res.json({ success: true, data: threads });
}

// ─── GET /support/threads/:threadId ──────────────────────────────────────────
// Get full thread with all messages. DevAdmin: mark unread messages as read.

export async function getThread(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { threadId } = req.params;
  const isDevAdmin = user.role === 'DEV_ADMIN';

  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!thread) {
    res.status(404).json({ success: false, error: 'Thread not found' });
    return;
  }

  // SuperAdmin can only view their own threads
  if (!isDevAdmin && thread.fromUserId !== user.id) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  // Mark messages as read for the viewer (DevAdmin marks customer messages; SuperAdmin marks dev messages)
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
// Both roles can send messages in a thread

export async function sendMessage(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { threadId } = req.params;
  const isDevAdmin = user.role === 'DEV_ADMIN';

  const schema = z.object({ body: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Message body is required' });
    return;
  }

  const thread = await prisma.supportThread.findUnique({ where: { id: threadId } });
  if (!thread) {
    res.status(404).json({ success: false, error: 'Thread not found' });
    return;
  }

  if (!isDevAdmin && thread.fromUserId !== user.id) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  if (thread.status === 'RESOLVED' && !isDevAdmin) {
    res.status(400).json({ success: false, error: 'Thread is resolved' });
    return;
  }

  const message = await prisma.supportMessage.create({
    data: {
      threadId,
      senderId: user.id,
      senderName: user.name || user.phone,
      senderRole: user.role,
      body: parsed.data.body,
    },
  });

  // Bump thread updatedAt
  await prisma.supportThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  res.status(201).json({ success: true, data: message });
}

// ─── PATCH /support/threads/:threadId/resolve ─────────────────────────────────
// DevAdmin marks a thread resolved (or re-opens it)

export async function resolveThread(req: AuthRequest, res: Response) {
  const { threadId } = req.params;
  const { status } = req.body as { status?: string };
  const newStatus = status === 'OPEN' ? 'OPEN' : 'RESOLVED';

  const thread = await prisma.supportThread.update({
    where: { id: threadId },
    data: { status: newStatus },
  });

  res.json({ success: true, data: thread });
}

// ─── GET /support/unread-count ────────────────────────────────────────────────
// DevAdmin: how many unread messages from SuperAdmins

export async function getUnreadCount(req: AuthRequest, res: Response) {
  const count = await prisma.supportMessage.count({
    where: {
      isRead: false,
      senderRole: { not: 'DEV_ADMIN' },
    },
  });

  res.json({ success: true, data: { count } });
}
