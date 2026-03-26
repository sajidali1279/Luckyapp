import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

export async function getAuditLogs(req: AuthRequest, res: Response) {
  const {
    action, actorRole, storeId,
    from, to,
    page = '1', limit = '50',
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (actorRole) where.actorRole = actorRole;
  if (storeId) where.storeId = storeId;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.createdAt = dateFilter;
  }

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Math.min(parseInt(limit), 100),
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ success: true, data: { logs, total, page: parseInt(page) } });
}

export async function getAuditStats(req: AuthRequest, res: Response) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [byAction, byRole, recentHighRisk] = await prisma.$transaction([
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: since } },
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
    }),
    prisma.auditLog.groupBy({
      by: ['actorRole'],
      where: { createdAt: { gte: since } },
      _count: { actorRole: true },
      orderBy: { _count: { actorRole: 'desc' } },
    }),
    // High-risk: large grants or bulk deletions in last 24h
    prisma.auditLog.findMany({
      where: {
        action: { in: ['DELETE_OFFER', 'DELETE_BANNER', 'TOGGLE_USER', 'RESET_PIN', 'REMOVE_SHIFT', 'REMOVE_STORE'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  res.json({ success: true, data: { byAction, byRole, recentHighRisk } });
}
