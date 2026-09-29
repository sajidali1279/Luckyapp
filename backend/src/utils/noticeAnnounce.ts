// Staff notices: who a notice is for, and its push, sent once.
//
// A notice is for the staff of its stores (every store when it lists none), narrowed to managers or employees when it says so. Managers
// with chain-wide access count as staff of every store. A notice that has started is announced when it is posted; one scheduled ahead
// is announced by the job below when its first day begins. "Once" is a claim on the row (announcedAt still empty -> now), so the posting
// request and the job can never both send it.

import cron from 'node-cron';
import { NoticeAudience, NoticePriority, Role, type Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { saveNotificationMany } from './push';
import { sendExpoBatch } from './pushSend';
import { noticeUrl } from './notificationRoutes';

export interface NoticeTarget { storeIds: string[]; audience: NoticeAudience }
export interface NoticeRecipient { id: string; role: Role; tokens: string[] }

/** The roles a notice's audience covers. */
export function audienceRoles(audience: NoticeAudience): Role[] {
  if (audience === NoticeAudience.MANAGERS) return [Role.STORE_MANAGER];
  if (audience === NoticeAudience.EMPLOYEES) return [Role.EMPLOYEE];
  return [Role.EMPLOYEE, Role.STORE_MANAGER];
}

/** Everyone active the notice is for, with their phones. */
export async function noticeRecipients(target: NoticeTarget): Promise<NoticeRecipient[]> {
  const roles = audienceRoles(target.audience);
  const where: Prisma.UserWhereInput = target.storeIds.length === 0
    ? { isActive: true, role: { in: roles } }
    : {
        isActive: true,
        OR: [
          { role: { in: roles }, storeRoles: { some: { storeId: { in: target.storeIds } } } },
          ...(roles.includes(Role.STORE_MANAGER) ? [{ role: Role.STORE_MANAGER, allStoresAccess: true }] : []),
        ],
      };
  const rows = await prisma.user.findMany({ where, select: { id: true, role: true, pushTokens: { select: { token: true } } } });
  return rows.map((r) => ({ id: r.id, role: r.role, tokens: r.pushTokens.map((t) => t.token) }));
}

export function noticePushTitle(n: { title: string; priority: NoticePriority }): string {
  return n.priority === NoticePriority.URGENT ? `Urgent: ${n.title}` : `Notice: ${n.title}`;
}

function pushBody(body: string): string {
  return body.length > 180 ? `${body.slice(0, 177).trimEnd()}...` : body;
}

type Announceable = { id: string; title: string; body: string; priority: NoticePriority; endDate: Date } & NoticeTarget;

/** Sends the notice's push to the people it is for. `force` sends it again (an edit that asks to tell staff again). Returns how many people. */
export async function announceNotice(notice: Announceable, now: Date = new Date(), force = false): Promise<number> {
  // The claim: only the request that moves announcedAt from empty to now sends (a forced resend moves it from whatever it was)
  const claimed = await prisma.adminNotice.updateMany({
    where: { id: notice.id, ...(force ? {} : { announcedAt: null }) },
    data: { announcedAt: now },
  });
  if (claimed.count === 0) return 0;
  const people = await noticeRecipients(notice);
  await prisma.adminNotice.update({ where: { id: notice.id }, data: { announcedTo: people.length } });
  if (people.length === 0) return 0;

  const title = noticePushTitle(notice);
  const body = pushBody(notice.body);
  // The link differs by role (managers and employees use different parts of the app), so save and send per role
  for (const role of [Role.EMPLOYEE, Role.STORE_MANAGER]) {
    const group = people.filter((p) => p.role === role);
    if (group.length === 0) continue;
    const url = noticeUrl(role, notice.id);
    await saveNotificationMany(group.map((p) => p.id), title, body, 'NOTICE', url, notice.endDate);
    await sendExpoBatch(group.flatMap((p) => p.tokens), { title, body, actionUrl: url });
  }
  return people.length;
}

/** Announces every live notice that asked for a push and has not had it yet (scheduled ones on their first day). Safe to run any number of times. */
export async function announceStartedNotices(now: Date = new Date()): Promise<number> {
  const due = await prisma.adminNotice.findMany({
    where: { isActive: true, notify: true, announcedAt: null, startDate: { lte: now }, endDate: { gte: now } },
    select: { id: true, title: true, body: true, priority: true, endDate: true, storeIds: true, audience: true },
  });
  let sent = 0;
  for (const n of due) sent += await announceNotice(n, now);
  return sent;
}

export function startNoticeAnnounceCron() {
  // Every 10 minutes: a notice scheduled for a day starts at midnight at the store, and should not wait an hour to be pushed
  cron.schedule('*/10 * * * *', () => {
    announceStartedNotices().catch((e) => console.error('[notice-announce] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  console.log('[notice-announce] Scheduled notice pushes checked every 10 minutes');
}
