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
