import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { TransactionStatus, Role } from '@prisma/client';
import { z } from 'zod';

// ─── Customer Leaderboard ─────────────────────────────────────────────────────

export async function getCustomerLeaderboard(req: Request, res: Response) {
  const { storeId } = req.query as { storeId?: string };

  // Sum approved points (pointsAwarded + gasBonusPoints) per customer
  const grouped = await prisma.pointsTransaction.groupBy({
    by: ['customerId'],
    where: {
      status: TransactionStatus.APPROVED,
      isTestData: false,
      ...(storeId ? { storeId } : {}),
    },
    _sum: { pointsAwarded: true, gasBonusPoints: true },
    orderBy: { _sum: { pointsAwarded: 'desc' } },
    take: 100,
  });

  if (grouped.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const customerIds = grouped.map((g) => g.customerId);
  const users = await prisma.user.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const leaderboard = grouped
    .map((g, i) => {
      const totalPts = Math.round(
        ((g._sum.pointsAwarded ?? 0) + (g._sum.gasBonusPoints ?? 0)) * 100
      );
      const u = userMap[g.customerId];
      const firstName = (u?.name || 'Customer').split(' ')[0];
      return {
        rank: i + 1,
        customerId: g.customerId,
        firstName,
        totalPoints: totalPts,
        isCurrentUser: g.customerId === req.user!.id,
      };
    })
    // Re-sort by total (including gas bonus) — groupBy ordered by pointsAwarded only
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  res.json({ success: true, data: leaderboard });
}

// ─── Employee Leaderboard ─────────────────────────────────────────────────────

export async function getEmployeeLeaderboard(req: Request, res: Response) {
  const { storeId } = req.params;

  // Verify store exists
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) return res.status(404).json({ success: false, error: 'Store not found' });

  // All-time avg rating per employee at this store
  const allTime = await prisma.employeeRating.groupBy({
    by: ['employeeId'],
    where: { storeId },
    _avg: { rating: true },
    _count: { rating: true },
    orderBy: { _avg: { rating: 'desc' } },
  });

  // This-month ratings for "Employee of the Month"
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRatings = await prisma.employeeRating.groupBy({
    by: ['employeeId'],
    where: { storeId, createdAt: { gte: monthStart } },
    _avg: { rating: true },
    _count: { rating: true },
    having: { rating: { _count: { gte: 3 } } }, // min 3 ratings to qualify
    orderBy: { _avg: { rating: 'desc' } },
    take: 1,
  });
  const employeeOfMonthId = monthRatings[0]?.employeeId ?? null;

  if (allTime.length === 0) {
    return res.json({ success: true, data: { storeName: store.name, leaderboard: [], employeeOfMonthId: null } });
  }

  const employeeIds = allTime.map((e) => e.employeeId);
  const users = await prisma.user.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, name: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const leaderboard = allTime.map((e, i) => ({
    rank: i + 1,
    employeeId: e.employeeId,
    firstName: (userMap[e.employeeId]?.name || 'Employee').split(' ')[0],
    avgRating: Math.round((e._avg.rating ?? 0) * 10) / 10,
    ratingCount: e._count.rating,
    isEmployeeOfMonth: e.employeeId === employeeOfMonthId,
    isCurrentUser: e.employeeId === req.user!.id,
  }));

  res.json({ success: true, data: { storeName: store.name, leaderboard, employeeOfMonthId } });
}

// ─── Submit Rating (customer → employee) ─────────────────────────────────────

const submitRatingSchema = z.object({
  transactionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
});

export async function submitRating(req: Request, res: Response) {
  const parsed = submitRatingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const { transactionId, rating } = parsed.data;
  const customerId = req.user!.id;

  // Verify transaction belongs to this customer and is approved
  const tx = await prisma.pointsTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, customerId: true, grantedById: true, storeId: true, status: true, rating: true },
  });
  if (!tx) return res.status(404).json({ success: false, error: 'Transaction not found' });
  if (tx.customerId !== customerId) return res.status(403).json({ success: false, error: 'Not your transaction' });
  if (tx.status !== TransactionStatus.APPROVED) return res.status(400).json({ success: false, error: 'Can only rate approved transactions' });
  if (tx.rating) return res.status(409).json({ success: false, error: 'Already rated' });

  const result = await prisma.employeeRating.create({
    data: { transactionId, customerId, employeeId: tx.grantedById, storeId: tx.storeId, rating },
  });

  res.json({ success: true, data: result });
}

// ─── Pending Ratings (customer: unrated approved transactions, last 7 days) ──

export async function getPendingRatings(req: Request, res: Response) {
  const customerId = req.user!.id;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const transactions = await prisma.pointsTransaction.findMany({
    where: {
      customerId,
      status: TransactionStatus.APPROVED,
      isTestData: false,
      createdAt: { gte: since },
      rating: null,
    },
    select: {
      id: true,
      storeId: true,
      createdAt: true,
      store: { select: { name: true } },
      grantedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1, // show one at a time
  });

  res.json({ success: true, data: transactions });
}

// ─── Employee's own rating summary ───────────────────────────────────────────

export async function getMyRatingSummary(req: Request, res: Response) {
  const employeeId = req.user!.id;
  const { storeId } = req.params;

  const [allTime, thisMonth] = await Promise.all([
    prisma.employeeRating.aggregate({
      where: { employeeId, storeId },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.employeeRating.aggregate({
      where: {
        employeeId,
        storeId,
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      allTime: {
        avg: Math.round((allTime._avg.rating ?? 0) * 10) / 10,
        count: allTime._count.rating,
      },
      thisMonth: {
        avg: Math.round((thisMonth._avg.rating ?? 0) * 10) / 10,
        count: thisMonth._count.rating,
      },
    },
  });
}
