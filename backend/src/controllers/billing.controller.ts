import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { BillingType } from '@prisma/client';

// SUPER_ADMIN+ — basic store list (no billing info)
export async function getStores(_req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, city: true, state: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stores });
}

// DevAdmin only — change billing type for a store
const billingSchema = z.object({
  billingType: z.nativeEnum(BillingType),
  subscriptionPrice: z.number().positive().optional(),
  transactionFeeRate: z.number().min(0).max(1).optional(),
});

export async function updateStoreBilling(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = billingSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const store = await prisma.store.update({
    where: { id: storeId },
    data: parsed.data,
    select: { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true },
  });

  res.json({ success: true, data: store });
}

export async function getAllStoresBilling(req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      city: true,
      billingType: true,
      subscriptionPrice: true,
      transactionFeeRate: true,
      isActive: true,
      billing: {
        orderBy: { createdAt: 'desc' },
        take: 3,
      },
    },
  });

  res.json({ success: true, data: stores });
}

export async function createBillingRecord(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { amount, period, billingType } = req.body as {
    amount: number; period: string; billingType: BillingType;
  };

  const record = await prisma.billingRecord.create({
    data: { storeId, amount, period, billingType },
  });

  res.status(201).json({ success: true, data: record });
}

export async function markBillingPaid(req: AuthRequest, res: Response) {
  const record = await prisma.billingRecord.update({
    where: { id: req.params.recordId },
    data: { isPaid: true, paidAt: new Date() },
  });

  res.json({ success: true, data: record });
}

// Analytics: date-ranged breakdown for charts
export async function getAnalytics(req: AuthRequest, res: Response) {
  const { from, to } = req.query as { from?: string; to?: string };

  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to + 'T23:59:59') : new Date();

  if (fromDate >= toDate) {
    res.status(400).json({ success: false, error: '"from" date must be before "to" date' });
    return;
  }

  const transactions = await prisma.pointsTransaction.findMany({
    where: { status: 'APPROVED', createdAt: { gte: fromDate, lte: toDate } },
    select: {
      createdAt: true, purchaseAmount: true, pointsAwarded: true,
      devCut: true, storeCost: true,
      store: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by date (YYYY-MM-DD)
  const byDate: Record<string, { date: string; transactions: number; purchaseVolume: number; devCut: number; pointsAwarded: number }> = {};
  for (const tx of transactions) {
    const date = tx.createdAt.toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, transactions: 0, purchaseVolume: 0, devCut: 0, pointsAwarded: 0 };
    byDate[date].transactions++;
    byDate[date].purchaseVolume = parseFloat((byDate[date].purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
    byDate[date].devCut = parseFloat((byDate[date].devCut + Number(tx.devCut)).toFixed(2));
    byDate[date].pointsAwarded = parseFloat((byDate[date].pointsAwarded + Number(tx.pointsAwarded)).toFixed(2));
  }

  // Group by store
  const byStore: Record<string, { storeId: string; storeName: string; transactions: number; purchaseVolume: number; devCut: number }> = {};
  for (const tx of transactions) {
    const id = tx.store.id;
    if (!byStore[id]) byStore[id] = { storeId: id, storeName: tx.store.name, transactions: 0, purchaseVolume: 0, devCut: 0 };
    byStore[id].transactions++;
    byStore[id].purchaseVolume = parseFloat((byStore[id].purchaseVolume + Number(tx.purchaseAmount)).toFixed(2));
    byStore[id].devCut = parseFloat((byStore[id].devCut + Number(tx.devCut)).toFixed(2));
  }

  // Totals
  const totals = transactions.reduce((acc, tx) => ({
    transactions: acc.transactions + 1,
    purchaseVolume: parseFloat((acc.purchaseVolume + Number(tx.purchaseAmount)).toFixed(2)),
    devCut: parseFloat((acc.devCut + Number(tx.devCut)).toFixed(2)),
    pointsAwarded: parseFloat((acc.pointsAwarded + Number(tx.pointsAwarded)).toFixed(2)),
    storeCost: parseFloat((acc.storeCost + Number(tx.storeCost)).toFixed(2)),
  }), { transactions: 0, purchaseVolume: 0, devCut: 0, pointsAwarded: 0, storeCost: 0 });

  res.json({
    success: true,
    data: {
      daily: Object.values(byDate),
      byStore: Object.values(byStore).sort((a, b) => b.purchaseVolume - a.purchaseVolume),
      totals,
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
    },
  });
}

// Analytics: total dev revenue across all stores
export async function getDevRevenue(req: AuthRequest, res: Response) {
  const revenue = await prisma.pointsTransaction.aggregate({
    _sum: { devCut: true, storeCost: true, purchaseAmount: true },
    _count: true,
    where: { status: 'APPROVED' },
  });

  const subscriptionRevenue = await prisma.billingRecord.aggregate({
    _sum: { amount: true },
    where: { isPaid: true },
  });

  res.json({
    success: true,
    data: {
      totalTransactions: revenue._count,
      totalPurchaseVolume: revenue._sum.purchaseAmount,
      totalDevCutFromTransactions: revenue._sum.devCut,
      totalStoreCost: revenue._sum.storeCost,
      totalSubscriptionRevenue: subscriptionRevenue._sum.amount,
    },
  });
}
