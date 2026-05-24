import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

// GET /inventory/analytics?storeId=&period=7|30|90|all&category=
// Returns: topItems, categoryBreakdown, storeBreakdown (admin only),
//          activeListSummary, pendingRequestsCount
export async function getInventoryAnalytics(req: AuthRequest, res: Response) {
  const { storeId, period = '30', category } = req.query as {
    storeId?: string; period?: string; category?: string;
  };
  const user = req.user!;
  const isAdmin = user.role === 'DEV_ADMIN' || user.role === 'SUPER_ADMIN';

  // Date filter
  let dateFilter: Date | undefined;
  if (period !== 'all') {
    const days = parseInt(period) || 30;
    dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  // Store filter: managers can only see their own stores; admins can filter or see all
  let storeIds: string[] | undefined;
  if (!isAdmin) {
    const roles = await prisma.userStoreRole.findMany({
      where: { userId: user.id },
      select: { storeId: true },
    });
    storeIds = roles.map(r => r.storeId);
    if (storeIds.length === 0) {
      res.json({
        success: true,
        data: { topItems: [], categoryBreakdown: [], storeBreakdown: [], activeListSummary: null, pendingRequestsCount: 0, period, totalItems: 0 },
      });
      return;
    }
    if (storeId) {
      if (!storeIds.includes(storeId)) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }
      storeIds = [storeId];
    }
  } else {
    if (storeId) storeIds = [storeId];
  }

  const where: Record<string, unknown> = {
    status: { not: 'REMOVED' },
    ...(dateFilter ? { createdAt: { gte: dateFilter } } : {}),
    ...(storeIds ? { list: { storeId: { in: storeIds } } } : {}),
    ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
  };

  // Top ordered items
  const rawItems = await prisma.orderListItem.groupBy({
    by: ['name', 'category'],
    where,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  });

  const topItems = rawItems.map(r => ({
    name: r.name,
    category: r.category,
    orderCount: r._count.id,
  }));

  // Category breakdown
  const rawCategories = await prisma.orderListItem.groupBy({
    by: ['category'],
    where,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const totalItems = rawCategories.reduce((sum, r) => sum + r._count.id, 0);
  const categoryBreakdown = rawCategories.map(r => ({
    category: r.category ?? 'Uncategorized',
    count: r._count.id,
    pct: totalItems > 0 ? Math.round((r._count.id / totalItems) * 100) : 0,
  }));

  // Store breakdown (admin only) — using Prisma
  let storeBreakdown: { storeId: string; storeName: string; itemCount: number }[] = [];
  if (isAdmin) {
    const lists = await prisma.orderList.findMany({
      where: storeIds ? { storeId: { in: storeIds } } : undefined,
      select: { storeId: true, store: { select: { name: true } } },
      distinct: ['storeId'],
    });

    for (const l of lists) {
      const count = await prisma.orderListItem.count({
        where: {
          ...where,
          list: { storeId: l.storeId },
        },
      });
      storeBreakdown.push({ storeId: l.storeId, storeName: l.store.name, itemCount: count });
    }
    storeBreakdown.sort((a, b) => b.itemCount - a.itemCount);
  }

  // Active list summary for manager view (single store)
  let activeListSummary: { listId: string; name: string; itemCount: number } | null = null;
  if (!isAdmin && storeIds && storeIds.length === 1) {
    const list = await prisma.orderList.findFirst({
      where: { storeId: storeIds[0], status: 'OPEN' },
      include: { _count: { select: { items: { where: { status: { not: 'REMOVED' } } } } } },
    });
    if (list) {
      activeListSummary = { listId: list.id, name: list.name, itemCount: list._count.items };
    }
  }

  // Pending employee requests count
  let pendingRequestsCount = 0;
  if (!isAdmin) {
    pendingRequestsCount = await prisma.employeeItemRequest.count({
      where: {
        storeId: storeIds ? { in: storeIds } : undefined,
        status: 'PENDING',
      },
    });
  }

  res.json({
    success: true,
    data: {
      topItems,
      categoryBreakdown,
      storeBreakdown,
      activeListSummary,
      pendingRequestsCount,
      period,
      totalItems,
    },
  });
}
