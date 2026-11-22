// When a Super Admin is on the HQ website (2026-11-21, the owner: "let me know when a super admin logs in or out of HQ"). HQ sends a
// "still here" signal when it opens and every 5 minutes while it is on screen, and one at Sign out. The first signal starts a session,
// Sign out ends it, and 30 minutes without a signal (a closed tab, a shut laptop) ends it as inactive. Each start and end is emailed to
// the Dev Admin inbox (ADMIN_EMAIL, the one job applications go to) and kept in the Activity Log. Dev Admins themselves are not tracked.
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { audit } from './audit';
import { sendEmail } from './email';
import { storeDateText, storeTimeText } from './storeTime';

export const INACTIVE_MINUTES = 30;
const TOUCH_EVERY_MS = 60_000;   // a signal within a minute of the last one changes nothing
const starting = new Set<string>();   // two tabs signalling at once start one session, not two

type Who = { id: string; name: string; role: Role | string };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const when = (at: Date) => `${storeTimeText(at)} on ${storeDateText(at)}`;

async function tell(subject: string, line: string) {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;
  await sendEmail(to, subject, `<p style="font-family:Arial,sans-serif;font-size:15px">${line}</p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#667">Lucky Stop HQ. Times are store time (Central). You get these for every Super Admin.</p>`);
}

/** HQ's "still here" signal. Starts a session when there is none open; otherwise keeps it fresh. */
export async function hqPing(user: Who, now = new Date()): Promise<'started' | 'fresh' | 'ignored'> {
  if (user.role !== Role.SUPER_ADMIN) return 'ignored';
  const open = await prisma.hqSession.findFirst({ where: { userId: user.id, endedAt: null }, orderBy: { startedAt: 'desc' } });
  if (open) {
    if (now.getTime() - open.lastSeenAt.getTime() >= TOUCH_EVERY_MS) await prisma.hqSession.update({ where: { id: open.id }, data: { lastSeenAt: now } });
    return 'fresh';
  }
  if (starting.has(user.id)) return 'fresh';
  starting.add(user.id);
  try {
    const last = await prisma.hqSession.findFirst({ where: { userId: user.id }, orderBy: { startedAt: 'desc' }, select: { endReason: true, endedAt: true } });
    await prisma.hqSession.create({ data: { userId: user.id, startedAt: now, lastSeenAt: now } });
    // coming back to a tab that went quiet (still signed in) reads differently from a fresh sign-in
    const back = last?.endReason === 'INACTIVE' && !!last.endedAt && now.getTime() - last.endedAt.getTime() < 12 * 3_600_000;
    const what = back ? 'is back on HQ' : 'signed in to HQ';
    audit({ actorId: user.id, actorName: user.name, actorRole: user.role as Role, action: 'HQ_SIGN_IN', entity: 'user', entityId: user.id,
      details: { summary: `${user.name} ${what}` }, storeId: null });
    await tell(`HQ: ${user.name} ${what}`, `<b>${esc(user.name)}</b> ${what} at ${when(now)}.`);
    return 'started';
  } finally {
    starting.delete(user.id);
  }
}

/** Sign out pressed on HQ. */
export async function hqSignOut(user: Who, now = new Date()): Promise<boolean> {
  if (user.role !== Role.SUPER_ADMIN) return false;
  const open = await prisma.hqSession.findMany({ where: { userId: user.id, endedAt: null } });
  if (open.length === 0) return false;
  await prisma.hqSession.updateMany({ where: { id: { in: open.map((s) => s.id) } }, data: { endedAt: now, endReason: 'SIGN_OUT', lastSeenAt: now } });
  const since = open.reduce((a, s) => (s.startedAt < a ? s.startedAt : a), open[0].startedAt);
  audit({ actorId: user.id, actorName: user.name, actorRole: user.role as Role, action: 'HQ_SIGN_OUT', entity: 'user', entityId: user.id,
    details: { summary: `${user.name} signed out of HQ (on since ${storeTimeText(since)})` }, storeId: null });
  await tell(`HQ: ${user.name} signed out`, `<b>${esc(user.name)}</b> signed out of HQ at ${when(now)} (on since ${storeTimeText(since)}).`);
  return true;
}

/** Each Super Admin's HQ status for the Dev Admin's Staff page (2026-11-21): on HQ now (an open session with a signal in the last 30
 *  minutes) and since when, or when they were last on and how they left. */
export async function hqPresence(now = new Date()) {
  const admins = await prisma.user.findMany({ where: { role: Role.SUPER_ADMIN }, select: { id: true } });
  if (admins.length === 0) return {};
  const ids = admins.map((a) => a.id);
  const rows = await prisma.hqSession.findMany({ where: { userId: { in: ids } }, orderBy: { startedAt: 'desc' }, take: ids.length * 20 });
  const cutoff = now.getTime() - INACTIVE_MINUTES * 60_000;
  const out: Record<string, { online: boolean; since: string | null; lastSeenAt: string | null; leftAt: string | null; leftHow: string | null }> = {};
  for (const id of ids) {
    const latest = rows.find((r) => r.userId === id);
    if (!latest) { out[id] = { online: false, since: null, lastSeenAt: null, leftAt: null, leftHow: null }; continue; }
    const online = !latest.endedAt && latest.lastSeenAt.getTime() >= cutoff;
    out[id] = {
      online,
      since: online ? latest.startedAt.toISOString() : null,
      lastSeenAt: latest.lastSeenAt.toISOString(),
      leftAt: online ? null : (latest.endedAt ?? latest.lastSeenAt).toISOString(),
      leftHow: online ? null : latest.endReason ?? 'INACTIVE',
    };
  }
  return out;
}

/** Every few minutes: sessions with no signal for 30 minutes end as inactive, dated from their last signal. */
export async function closeInactiveHqSessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - INACTIVE_MINUTES * 60_000);
  const stale = await prisma.hqSession.findMany({ where: { endedAt: null, lastSeenAt: { lt: cutoff } } });
  if (stale.length === 0) return 0;
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(stale.map((s) => s.userId))] } }, select: { id: true, name: true, role: true } });
  const nameOf = new Map(users.map((u) => [u.id, u]));
  for (const s of stale) {
    // ended only if still open (a signal may have come in meanwhile)
    const { count } = await prisma.hqSession.updateMany({ where: { id: s.id, endedAt: null, lastSeenAt: { lt: cutoff } }, data: { endedAt: s.lastSeenAt, endReason: 'INACTIVE' } });
    if (count === 0) continue;
    const u = nameOf.get(s.userId);
    const name = u?.name ?? 'A Super Admin';
    audit({ actorId: s.userId, actorName: name, actorRole: (u?.role ?? Role.SUPER_ADMIN) as Role, action: 'HQ_INACTIVE', entity: 'user', entityId: s.userId,
      details: { summary: `${name} left HQ without signing out (last active ${storeTimeText(s.lastSeenAt)})` }, storeId: null });
    await tell(`HQ: ${name} is inactive`, `<b>${esc(name)}</b> has not used HQ since ${when(s.lastSeenAt)} (no activity for ${INACTIVE_MINUTES} minutes; the tab was likely closed). On since ${storeTimeText(s.startedAt)}.`);
  }
  return stale.length;
}
