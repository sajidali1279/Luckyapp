// The signed-in person's own account page (admin Profile): what the account is, which HQ emails it gets, and ending other sessions.
import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';
import { audit } from '../utils/audit';
import { usableStoreIds } from '../utils/storeAccess';
import { HQ_EMAIL_KINDS, type HqEmailKind } from '../utils/adminEmail';
import { issueJwt } from './auth.controller';

function summaryOf(details: string | null): string | null {
  if (!details) return null;
  try { const d = JSON.parse(details); return typeof d?.summary === 'string' ? d.summary : null; } catch { return null; }
}

// GET /auth/account
export async function getAccount(req: AuthRequest, res: Response) {
  const me = req.user!;
  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      id: true, name: true, phone: true, role: true, email: true, avatarUrl: true, createdAt: true,
      lastSignInAt: true, previousSignInAt: true, emailAlertsOff: true, allStoresAccess: true,
    },
  });
  if (!user) { res.status(404).json({ success: false, error: 'Account not found' }); return; }

  const everyStore = hasMinRole(user.role, Role.SUPER_ADMIN) || user.allStoresAccess;
  const [stores, activeStoreCount, activity] = await Promise.all([
    everyStore ? Promise.resolve([]) : usableStoreIds(user.id, user.role).then((ids) => prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })),
    everyStore ? prisma.store.count({ where: { isActive: true } }) : Promise.resolve(0),
    prisma.auditLog.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, action: true, details: true, storeName: true, createdAt: true },
    }),
  ]);
  const hq = hasMinRole(user.role, Role.SUPER_ADMIN);

  res.json({
    success: true,
    data: {
      ...user,
      stores: everyStore ? { all: true, count: activeStoreCount } : { all: false, list: stores },
      activity: activity.map((a) => ({ id: a.id, action: a.action, summary: summaryOf(a.details), storeName: a.storeName, createdAt: a.createdAt })),
      // Only HQ gets HQ emails; the list says which ones there are, the page shows a switch for each
      emailKinds: hq ? HQ_EMAIL_KINDS : [],
      emailAlertsOff: user.emailAlertsOff.filter((k) => (HQ_EMAIL_KINDS as readonly string[]).includes(k)),
    },
  });
}

// PATCH /auth/email-alerts  (Super Admin+) — { off: [...] }: the HQ emails this person does not want
export async function updateEmailAlerts(req: AuthRequest, res: Response) {
  const off = req.body?.off;
  if (!Array.isArray(off) || !off.every((k) => typeof k === 'string')) {
    res.status(400).json({ success: false, error: 'Send the list of emails to switch off.' });
    return;
  }
  const unknown = off.filter((k: string) => !(HQ_EMAIL_KINDS as readonly string[]).includes(k));
  if (unknown.length) { res.status(400).json({ success: false, error: `Unknown email: ${unknown.join(', ')}` }); return; }
  const list = [...new Set(off as HqEmailKind[])];
  await prisma.user.update({ where: { id: req.user!.id }, data: { emailAlertsOff: list } });
  res.json({ success: true, data: { emailAlertsOff: list } });
}

// POST /auth/sign-out-others — every other session of this account ends (a lost laptop, a shared computer); this one carries on with a new token
export async function signOutOthers(req: AuthRequest, res: Response) {
  const me = req.user!;
  const now = new Date();
  const user = await prisma.user.update({
    where: { id: me.id },
    data: { sessionsValidAfter: now },
    select: { id: true, phone: true, name: true, role: true, tier: true },
  });
  // Phones signed in to this account stop getting its pushes too
  await prisma.pushToken.deleteMany({ where: { userId: me.id } });
  const storeIds = (await prisma.userStoreRole.findMany({ where: { userId: me.id }, select: { storeId: true } })).map((r) => r.storeId);
  const token = issueJwt(user, storeIds);
  audit({
    actorId: me.id, actorName: me.name, actorRole: me.role,
    action: 'SIGN_OUT_EVERYWHERE', entity: 'user', entityId: me.id,
    details: { summary: `${me.name || 'Someone'} signed out of every other device` },
  });
  res.json({ success: true, data: { token } });
}
