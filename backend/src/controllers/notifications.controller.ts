import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { z } from 'zod';
import { createHash } from 'crypto';
import { saveNotificationMany } from '../utils/push';
import { sendExpoBatch } from '../utils/pushSend';
import { refuse } from '../utils/refusal';
import { BROADCAST_TARGETS, BroadcastTarget, resolveAudience, countAudience, targetWords } from '../utils/audience';

// GET /notifications/my — paginated list for current user
export async function getMyNotifications(req: AuthRequest, res: Response) {
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = 20;
  const now   = new Date();

  // Exclude notifications that have expired (e.g. offer notifications past the offer's end date)
  const activeFilter = {
    userId: req.user!.id,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.userNotification.findMany({
      where: activeFilter,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.userNotification.count({
      where: { ...activeFilter, isRead: false },
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
  const now = new Date();
  const count = await prisma.userNotification.count({
    where: {
      userId: req.user!.id,
      isRead: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  res.json({ success: true, data: { count } });
}

// ─── Send Push (SuperAdmin+) ─────────────────────────────────────────────────
//
// A broadcast reaches a lot of people and cannot be recalled, so it is careful: the audience is the same for the preview and the send (active
// accounts only), the same message to the same audience is refused for five minutes (a double click, or two admins), the limits the form shows
// are enforced here too, a test can go to the sender's own phone first, the push service's answers are read (so "sent to 9 phones, 1 failed" is
// what is reported, and phones it says are gone are removed), and every send is an Activity Log entry that doubles as the "Sent" list.

const TITLE_MAX = 65;
const BODY_MAX = 200;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

const audienceQuery = z.object({
  target: z.enum(BROADCAST_TARGETS as [BroadcastTarget, ...BroadcastTarget[]], { message: 'Choose who the message goes to.' }),
  storeId: z.string({ message: 'Choose a store.' }).uuid('Choose a store.').optional(),
});

const broadcastSchema = audienceQuery.extend({
  title: z.string({ message: 'Enter a title.' }).trim().min(1, 'Enter a title.').max(TITLE_MAX, `The title is too long (${TITLE_MAX} characters at most).`),
  body: z.string({ message: 'Enter a message.' }).trim().min(1, 'Enter a message.').max(BODY_MAX, `The message is too long (${BODY_MAX} characters at most).`),
  test: z.boolean({ message: 'test must be true or false.' }).optional(),
});

const isStoreTarget = (t: string) => t === 'STORE_CUSTOMERS' || t === 'STORE_STAFF';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// One message is sent at a time per fingerprint on this server; the Activity Log check below covers the five minutes after, across restarts.
const sendingNow = new Set<string>();

/** The store a store-audience message is for, or the sentence that refuses it. */
async function storeFor(target: BroadcastTarget, storeId?: string): Promise<{ store?: { id: string; name: string }; error?: string }> {
  if (!isStoreTarget(target)) return {};
  if (!storeId) return { error: 'Choose a store.' };
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, isActive: true } });
  if (!store) return { error: 'That store does not exist.' };
  if (!store.isActive) return { error: `${store.name} is closed, so there is no one there to message.` };
  return { store: { id: store.id, name: store.name } };
}

// GET /notifications/audience?target=&storeId= — who a message would reach, in people and phones, before anything is sent
export async function getBroadcastAudience(req: AuthRequest, res: Response) {
  const parsed = audienceQuery.safeParse(req.query);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { target, storeId } = parsed.data;
  const { store, error } = await storeFor(target, storeId);
  if (error) { res.status(400).json({ success: false, error }); return; }
  const counts = countAudience(await resolveAudience(target, store?.id));
  res.json({ success: true, data: { target, storeName: store?.name ?? null, words: targetWords(target, store?.name), ...counts } });
}

// POST /notifications/broadcast (SUPER_ADMIN+)
// target: ALL_CUSTOMERS | STORE_CUSTOMERS | ALL_STAFF | STORE_STAFF; test: true sends only to the sender's own phone(s)
export async function broadcastNotification(req: AuthRequest, res: Response) {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { target, storeId, title, body, test } = parsed.data;
  const user = req.user!;

  // A test goes to the sender's own phone(s), with "[Test]" in front, no inbox row and no Activity Log entry
  if (test) {
    const mine = await prisma.pushToken.findMany({ where: { userId: user.id }, select: { token: true } });
    if (mine.length === 0) {
      res.status(409).json({ success: false, error: 'You have no phone signed in to the Lucky Stop app, so there is nowhere to send a test. Sign in on your phone first.' });
      return;
    }
    const outcome = await sendExpoBatch(mine.map((t) => t.token), { title: `[Test] ${title}`, body });
    res.json({ success: true, data: { test: true, phones: outcome.attempted, accepted: outcome.accepted, failed: outcome.failed, removed: outcome.removed, reasons: outcome.reasons } });
    return;
  }

  const { store, error } = await storeFor(target, storeId);
  if (error) { res.status(400).json({ success: false, error }); return; }

  // The same message to the same audience is one send: claim it, then look for one already sent in the last five minutes
  const fp = createHash('sha1').update([target, store?.id ?? '', title.toLowerCase(), body.toLowerCase()].join('|')).digest('hex').slice(0, 20);
  if (sendingNow.has(fp)) {
    res.status(409).json({ success: false, error: 'This message is already being sent. Wait for it to finish; it will not go out twice.' });
    return;
  }
  sendingNow.add(fp);
  try {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const recent = await prisma.auditLog.findFirst({
      where: { action: 'BROADCAST', createdAt: { gte: since }, details: { contains: `"fp":"${fp}"` } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, actorName: true },
    });
    if (recent) {
      const mins = Math.max(1, Math.round((Date.now() - recent.createdAt.getTime()) / 60000));
      res.status(409).json({ success: false, error: `This same message was already sent to the ${targetWords(target, store?.name)} ${mins === 1 ? 'a minute' : `${mins} minutes`} ago${recent.actorName ? ` by ${recent.actorName}` : ''}. Change the wording or wait five minutes if you really mean to send it again.` });
      return;
    }

    const members = await resolveAudience(target, store?.id);
    const counts = countAudience(members);
    if (counts.people === 0) {
      res.status(400).json({ success: false, error: target === 'STORE_CUSTOMERS'
        ? `No active customers have made an approved purchase at ${store!.name} in the last 6 months, so there is no one to send this to.`
        : `There is no one to send this to: no active ${targetWords(target, store?.name)}.` });
      return;
    }

    // In-app inbox rows for everyone, then the phones
    await saveNotificationMany(members.map((m) => m.id), title, body, 'BROADCAST');
    const outcome = await sendExpoBatch(members.flatMap((m) => m.tokens), { title, body });

    const summary = `Sent to ${plural(counts.people, 'person', 'people')} (${targetWords(target, store?.name)}): ${plural(outcome.accepted, 'phone', 'phones')} reached${outcome.failed > 0 ? `, ${outcome.failed} failed` : ''}${outcome.removed > 0 ? `, ${plural(outcome.removed, 'gone phone', 'gone phones')} removed` : ''}. "${title}"`;
    try {
      await prisma.auditLog.create({
        data: {
          actorId: user.id, actorName: user.name || null, actorRole: user.role,
          action: 'BROADCAST', entity: 'notification', entityId: null,
          details: JSON.stringify({ summary, fp, target, title, body, people: counts.people, phones: counts.phones, withoutPhone: counts.withoutPhone, accepted: outcome.accepted, failed: outcome.failed, removed: outcome.removed, retried: outcome.retried, reasons: outcome.reasons }),
          storeId: store?.id ?? null, storeName: store?.name ?? null,
        },
      });
    } catch (err) {
      console.error('[broadcast] Failed to write the Activity Log entry:', (err as Error).message);
    }

    res.json({
      success: true,
      data: {
        target, storeName: store?.name ?? null,
        people: counts.people, phones: counts.phones, withoutPhone: counts.withoutPhone,
        accepted: outcome.accepted, failed: outcome.failed, removed: outcome.removed, retried: outcome.retried, reasons: outcome.reasons,
        partial: outcome.failed > 0,
        recipientCount: counts.people,   // older admin pages read this
      },
    });
  } finally {
    sendingNow.delete(fp);
  }
}

// GET /notifications/broadcasts — the last 50 sends (from the Activity Log), newest first
export async function listBroadcasts(_req: AuthRequest, res: Response) {
  const rows = await prisma.auditLog.findMany({ where: { action: 'BROADCAST' }, orderBy: { createdAt: 'desc' }, take: 50 });
  const data = rows.map((r) => {
    let d: Record<string, unknown> = {};
    try { d = r.details ? JSON.parse(r.details) : {}; } catch { /* an unreadable entry still shows who and when */ }
    return {
      id: r.id, createdAt: r.createdAt, actorName: r.actorName, storeName: r.storeName,
      target: d.target ?? null, title: d.title ?? '', body: d.body ?? '',
      people: d.people ?? 0, phones: d.phones ?? 0, accepted: d.accepted ?? 0, failed: d.failed ?? 0, removed: d.removed ?? 0,
    };
  });
  res.json({ success: true, data });
}
