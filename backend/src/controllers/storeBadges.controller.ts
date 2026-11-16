import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { usableStoreIds } from '../utils/storeAccess';

/**
 * GET /manager/store-badges (2026-11-15, the owner): what waits at each of a manager's stores, for the store picker's badges. One call
 * instead of a screen per kind; each count follows the same rule as that kind's own screen and per-store count:
 *   toOrder   order list items not yet ordered, on the store's open list(s)
 *   requests  staff stock requests (PENDING) + store alerts (PENDING) + customer product requests (PENDING, not expired)
 *   disputes  missing-points reports waiting for a decision
 *   schedule  time off and shift requests waiting
 * Open stores busiest first, then by name; closed stores last, marked. HQ (and a manager with every store) gets every open store.
 */
export async function getStoreBadges(req: AuthRequest, res: Response) {
  const user = req.user!;
  const ids = await usableStoreIds(user.id, user.role);
  if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
  const now = new Date();
  const [stores, lists, items, alerts, products, disputes, shifts] = await Promise.all([
    // closed stores too (the screens still list them), marked, last
    prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, city: true, isActive: true } }),
    prisma.orderList.findMany({ where: { storeId: { in: ids }, status: 'OPEN' }, select: { storeId: true, _count: { select: { items: { where: { status: 'PENDING' } } } } } }),
    prisma.employeeItemRequest.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.storeRequest.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.productRequest.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, status: 'PENDING', expiresAt: { gte: now } }, _count: { _all: true } }),
    prisma.pointsDispute.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.shiftRequest.groupBy({ by: ['storeId'], where: { storeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
  ]);
  const by = (rows: { storeId: string | null; _count: { _all: number } }[]) => {
    const m = new Map<string, number>(); for (const r of rows) if (r.storeId) m.set(r.storeId, (m.get(r.storeId) ?? 0) + r._count._all); return m;
  };
  const toOrder = new Map<string, number>();
  for (const l of lists) toOrder.set(l.storeId, (toOrder.get(l.storeId) ?? 0) + l._count.items);
  const [it, al, pr, di, sh] = [by(items as any), by(alerts as any), by(products as any), by(disputes as any), by(shifts as any)];
  const data = stores.map((s) => {
    const row = {
      storeId: s.id, name: s.name, city: s.city, closed: !s.isActive,
      toOrder: toOrder.get(s.id) ?? 0,
      requests: (it.get(s.id) ?? 0) + (al.get(s.id) ?? 0) + (pr.get(s.id) ?? 0),
      disputes: di.get(s.id) ?? 0,
      schedule: sh.get(s.id) ?? 0,
    };
    return { ...row, total: row.toOrder + row.requests + row.disputes + row.schedule };
  }).sort((a, b) => Number(a.closed) - Number(b.closed) || b.total - a.total || a.name.localeCompare(b.name, undefined, { numeric: true }));
  res.json({ success: true, data });
}
