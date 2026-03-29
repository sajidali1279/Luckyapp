import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ProductCategory, Role, TransactionStatus, Tier } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';
import cloudinary from '../config/cloudinary';
import { audit } from '../utils/audit';
import { sendPushToUser } from '../utils/push';
import { DEFAULT_CASHBACK_RATE, DEFAULT_DEV_CUT_RATE } from '../config/constants';
import { calculateTier, getCurrentPeriod, GAS_BONUS_PER_GALLON, getNextTierProgress } from '../utils/tier';

// Employee: initiate a points grant (before receipt upload)
const grantSchema = z.object({
  customerQrCode: z.string(),
  storeId: z.string().uuid(),
  purchaseAmount: z.number().positive(),
  category: z.nativeEnum(ProductCategory).optional().default(ProductCategory.OTHER),
  notes: z.string().optional(),
  // Gas fields
  isGas: z.boolean().optional().default(false),
  gasGallons: z.number().positive().optional(),
  gasPricePerGallon: z.number().positive().optional(),
});

export async function initiateGrant(req: AuthRequest, res: Response) {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { customerQrCode, storeId, purchaseAmount, category, notes, isGas, gasGallons, gasPricePerGallon } = parsed.data;
  const employee = req.user!;

  // Prevent employee from granting to themselves
  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR code not found' });
    return;
  }
  if (customer.id === employee.id) {
    res.status(403).json({ success: false, error: 'Cannot grant points to yourself' });
    return;
  }

  // Look up per-category rate, active promotional offer, and dev cut rate simultaneously
  const now = new Date();
  const [categoryRate, activeOffer, devCutConfig] = await Promise.all([
    prisma.categoryRate.findUnique({ where: { category } }),
    prisma.offer.findFirst({
      where: {
        isActive: true,
        bonusRate: { not: null },
        startDate: { lte: now },
        endDate: { gte: now },
        AND: [
          { OR: [{ type: 'ALL_STORES' }, { storeId }] },
          { OR: [{ category: null }, { category }] },
        ],
      },
      orderBy: { bonusRate: 'desc' }, // highest promo wins if multiple active
      select: { bonusRate: true, title: true },
    }),
    prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } }),
  ]);

  const baseCashbackRate = categoryRate?.cashbackRate ?? DEFAULT_CASHBACK_RATE;
  // Promotion wins if its rate is higher than the default — reverts automatically when offer expires
  const cashbackRate = Math.max(baseCashbackRate, activeOffer?.bonusRate ?? 0);
  const promotionApplied = (activeOffer?.bonusRate ?? 0) > baseCashbackRate ? activeOffer!.title : null;

  // Dev cut is taken from cashback issued — customer receives the remainder, store pays the full amount
  const devCutRate = parseFloat(devCutConfig?.value ?? String(DEFAULT_DEV_CUT_RATE));
  const cashbackIssued = parseFloat((purchaseAmount * cashbackRate).toFixed(4));
  const devCut = parseFloat((cashbackIssued * devCutRate).toFixed(2));
  const pointsAwarded = parseFloat((cashbackIssued - devCut).toFixed(2));
  const storeCost = cashbackIssued; // store pays the full cashback amount (dev cut is taken from that pool)

  // Gas tier bonus
  const gasBonusRate = (isGas && gasGallons && customer.tier) ? (GAS_BONUS_PER_GALLON[customer.tier] ?? 0) : 0;
  const gasBonusPoints = parseFloat(((gasGallons ?? 0) * gasBonusRate).toFixed(2));

  // Create transaction in PENDING state — no points credited yet
  const transaction = await prisma.pointsTransaction.create({
    data: {
      customerId: customer.id,
      grantedById: employee.id,
      storeId,
      purchaseAmount,
      pointsAwarded,
      devCut,
      storeCost,
      cashbackRate,
      category,
      notes,
      status: TransactionStatus.PENDING,
      isGas: isGas ?? false,
      gasGallons: gasGallons ?? null,
      gasPricePerGallon: gasPricePerGallon ?? null,
      gasBonusPoints,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Transaction created. Upload receipt to complete.',
    data: {
      transactionId: transaction.id,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      pointsAwarded,
      purchaseAmount,
      cashbackRate,
      promotionApplied, // null if regular rate; string title if a promo boosted the rate
      gasBonusPoints,
      tier: customer.tier,
    },
  });
}

// Employee: upload receipt and approve the transaction
export async function uploadReceiptAndApprove(req: AuthRequest, res: Response) {
  const { transactionId } = req.params;
  const employee = req.user!;

  const transaction = await prisma.pointsTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    res.status(404).json({ success: false, error: 'Transaction not found' });
    return;
  }
  const canOverride = hasMinRole(employee.role, Role.STORE_MANAGER);
  if (transaction.grantedById !== employee.id && !canOverride) {
    res.status(403).json({ success: false, error: 'Not your transaction' });
    return;
  }
  // Store managers can only approve transactions belonging to their own store
  if (canOverride && !hasMinRole(employee.role, Role.SUPER_ADMIN)) {
    if (!employee.storeIds?.includes(transaction.storeId)) {
      res.status(403).json({ success: false, error: 'No access to this store' });
      return;
    }
  }
  if (transaction.status !== TransactionStatus.PENDING) {
    res.status(400).json({ success: false, error: 'Transaction already processed' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Receipt image is required' });
    return;
  }

  // Upload receipt to Cloudinary
  const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'luckystop/receipts', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result as { secure_url: string });
      }
    );
    stream.end(req.file!.buffer);
  });

  // Approve transaction atomically
  const [updatedTransaction] = await prisma.$transaction([
    prisma.pointsTransaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.APPROVED,
        receiptImageUrl: uploadResult.secure_url,
      },
    }),
  ]);

  // Update periodPoints + recalculate tier
  const updatedCustomer = await prisma.user.update({
    where: { id: transaction.customerId },
    data: {
      pointsBalance: { increment: transaction.pointsAwarded + transaction.gasBonusPoints },
      periodPoints: { increment: transaction.pointsAwarded + transaction.gasBonusPoints },
    },
  });
  const newTier = calculateTier(updatedCustomer.periodPoints);
  if (newTier !== updatedCustomer.tier) {
    await prisma.user.update({ where: { id: transaction.customerId }, data: { tier: newTier } });
    sendPushToUser(transaction.customerId, `🎉 Tier Up! You're now ${newTier}!`, `You've reached ${newTier} tier. Check your new benefits!`, 'GENERAL');
  }

  // Notify customer their points were credited
  sendPushToUser(
    transaction.customerId,
    '💰 Points Credited!',
    `${Math.round((transaction.pointsAwarded + transaction.gasBonusPoints) * 100)} pts added to your Lucky Stop balance.`,
    'POINTS'
  );

  audit({
    actorId: employee.id, actorName: employee.name, actorRole: employee.role,
    action: 'GRANT_POINTS', entity: 'transaction', entityId: transactionId,
    details: {
      purchaseAmount: transaction.purchaseAmount,
      pointsAwarded: transaction.pointsAwarded,
      category: transaction.category,
      customerId: transaction.customerId,
    },
    storeId: transaction.storeId,
  });

  res.json({
    success: true,
    message: `$${transaction.pointsAwarded.toFixed(2)} credited to customer account`,
    data: updatedTransaction,
  });
}

// Employee: redeem customer credits (deduct from balance)
const redeemSchema = z.object({
  customerQrCode: z.string(),
  storeId: z.string().uuid(),
  amount: z.number().positive(),
});

export async function redeemCredits(req: AuthRequest, res: Response) {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { customerQrCode, storeId, amount } = parsed.data;
  const employee = req.user!;

  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR code not found' });
    return;
  }
  if (customer.pointsBalance < amount) {
    res.status(400).json({
      success: false,
      error: `Insufficient balance. Customer has $${customer.pointsBalance.toFixed(2)}.`,
    });
    return;
  }

  // Dev cut is taken at grant time — no cut applied on redemption
  // Atomically: deduct balance + record redemption
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: customer.id },
      data: { pointsBalance: { decrement: amount } },
      select: { id: true, name: true, phone: true, pointsBalance: true },
    }),
    prisma.creditRedemption.create({
      data: { customerId: customer.id, storeId, amount, devCut: 0, processedBy: employee.id },
    }),
  ]);

  sendPushToUser(
    customer.id,
    '🎉 Redemption Successful!',
    `$${amount.toFixed(2)} redeemed at Lucky Stop. Remaining balance: $${updated.pointsBalance.toFixed(2)}.`,
    'REDEMPTION'
  );

  audit({
    actorId: employee.id, actorName: employee.name, actorRole: employee.role,
    action: 'REDEEM_CREDITS', entity: 'credit_redemption',
    details: { amount, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone },
    storeId,
  });

  res.json({
    success: true,
    message: `$${amount.toFixed(2)} redeemed successfully`,
    data: { customer: { ...updated, pointsBalance: Number(updated.pointsBalance) }, amountRedeemed: amount },
  });
}

// Customer: view their own points history
export async function getMyTransactions(req: AuthRequest, res: Response) {
  const { page = '1', limit = '20' } = req.query as { page?: string; limit?: string };
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where: { customerId: req.user!.id, status: TransactionStatus.APPROVED },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
      include: { store: { select: { name: true } } },
    }),
    prisma.pointsTransaction.count({
      where: { customerId: req.user!.id, status: TransactionStatus.APPROVED },
    }),
  ]);

  res.json({ success: true, data: { transactions, total, page: parseInt(page), limit: parseInt(limit) } });
}

// Admin: reject a pending transaction
export async function rejectTransaction(req: AuthRequest, res: Response) {
  const { transactionId } = req.params;

  const transaction = await prisma.pointsTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== TransactionStatus.PENDING) {
    res.status(400).json({ success: false, error: 'Transaction not found or already processed' });
    return;
  }

  // Store managers can only reject transactions belonging to their own store
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    if (!req.user!.storeIds?.includes(transaction.storeId)) {
      res.status(403).json({ success: false, error: 'No access to this store' });
      return;
    }
  }

  await prisma.pointsTransaction.update({
    where: { id: transactionId },
    data: { status: TransactionStatus.REJECTED },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'REJECT_TRANSACTION', entity: 'transaction', entityId: transactionId,
    details: {
      purchaseAmount: transaction.purchaseAmount,
      pointsAwarded: transaction.pointsAwarded,
      category: transaction.category,
      customerId: transaction.customerId,
    },
    storeId: transaction.storeId,
  });

  res.json({ success: true, message: 'Transaction rejected' });
}

// Manager: store dashboard summary stats
export async function getStoreSummary(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, address: true, city: true } });
  if (!store) { res.status(404).json({ success: false, error: 'Store not found' }); return; }

  const [todayStats, pendingCount, allTimeStats] = await prisma.$transaction([
    prisma.pointsTransaction.aggregate({
      where: { storeId, status: TransactionStatus.APPROVED, createdAt: { gte: todayStart } },
      _count: true,
      _sum: { pointsAwarded: true, purchaseAmount: true },
    }),
    prisma.pointsTransaction.count({ where: { storeId, status: TransactionStatus.PENDING } }),
    prisma.pointsTransaction.aggregate({
      where: { storeId, status: TransactionStatus.APPROVED },
      _count: true,
      _sum: { pointsAwarded: true, purchaseAmount: true },
    }),
  ]);

  const recent = await prisma.pointsTransaction.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { customer: { select: { name: true, phone: true } }, grantedBy: { select: { name: true } } },
  });

  res.json({
    success: true,
    data: {
      store,
      today: {
        transactions: todayStats._count,
        pointsAwarded: todayStats._sum.pointsAwarded || 0,
        purchaseVolume: todayStats._sum.purchaseAmount || 0,
      },
      pending: pendingCount,
      allTime: {
        transactions: allTimeStats._count,
        pointsAwarded: allTimeStats._sum.pointsAwarded || 0,
        purchaseVolume: allTimeStats._sum.purchaseAmount || 0,
      },
      recent,
    },
  });
}

// Admin: view all transactions for a store with receipt photos
export async function getStoreTransactions(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status, page = '1', limit = '20' } = req.query as {
    status?: TransactionStatus;
    page?: string;
    limit?: string;
  };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where: { storeId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        grantedBy: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.pointsTransaction.count({ where: { storeId, ...(status && { status }) } }),
  ]);

  res.json({ success: true, data: { transactions, total, page: parseInt(page), limit: parseInt(limit) } });
}

// SuperAdmin+: platform-wide summary stats
export async function getPlatformSummary(_req: AuthRequest, res: Response) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayStats, monthStats, pendingCount, allTimeStats, perStore, creditsOut] = await prisma.$transaction([
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED', createdAt: { gte: todayStart } },
      _count: true, _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED', createdAt: { gte: monthStart } },
      _count: true, _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
    prisma.pointsTransaction.count({ where: { status: 'PENDING' } }),
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED' },
      _count: true, _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED', createdAt: { gte: monthStart } },
      _count: true,
      _sum: { purchaseAmount: true, pointsAwarded: true },
      orderBy: { _sum: { purchaseAmount: 'desc' } },
    }),
    prisma.user.aggregate({
      where: { role: 'CUSTOMER' },
      _sum: { pointsBalance: true },
    }),
  ]);

  const storeIds = perStore.map((r) => r.storeId);
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true, city: true },
  });
  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s]));

  res.json({
    success: true,
    data: {
      today: {
        transactions: todayStats._count,
        purchaseVolume: parseFloat((todayStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((todayStats._sum.pointsAwarded ?? 0).toFixed(2)),
      },
      thisMonth: {
        transactions: monthStats._count,
        purchaseVolume: parseFloat((monthStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((monthStats._sum.pointsAwarded ?? 0).toFixed(2)),
      },
      pending: pendingCount,
      allTime: {
        transactions: allTimeStats._count,
        purchaseVolume: parseFloat((allTimeStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((allTimeStats._sum.pointsAwarded ?? 0).toFixed(2)),
      },
      totalCreditsOutstanding: parseFloat((creditsOut._sum.pointsBalance ?? 0).toFixed(2)),
      storeRanking: perStore.map((r) => ({
        ...(storeMap[r.storeId] ?? { id: r.storeId, name: 'Unknown', city: '' }),
        transactions: r._count,
        purchaseVolume: parseFloat(((r._sum?.purchaseAmount) ?? 0).toFixed(2)),
        cashbackIssued: parseFloat(((r._sum?.pointsAwarded) ?? 0).toFixed(2)),
      })),
    },
  });
}

// GET /points/customer-info/:qrCode — cashier fetches customer tier + benefit status before choosing action
export async function getCustomerInfo(req: AuthRequest, res: Response) {
  const { qrCode } = req.params;
  const customer = await prisma.user.findUnique({ where: { qrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR not found' });
    return;
  }

  const period = getCurrentPeriod();

  // Ensure period is current — if not, no benefits from old period
  const currentPeriod = customer.tierPeriod === period;
  const tier = currentPeriod ? customer.tier : Tier.BRONZE;
  const periodPoints = currentPeriod ? customer.periodPoints : 0;

  // Check today's daily benefit (Gold+)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  let benefitAvailable = false;
  let benefitType: string | null = null;
  let silverRemaining = 0;

  if (tier === 'SILVER') {
    const used = await prisma.tierBenefitClaim.count({
      where: { userId: customer.id, period, benefitType: 'SILVER_FOUNTAIN' },
    });
    silverRemaining = Math.max(0, 30 - used);
    benefitAvailable = silverRemaining > 0;
    benefitType = 'SILVER_FOUNTAIN';
  } else if (['GOLD', 'DIAMOND', 'PLATINUM'].includes(tier)) {
    const usedToday = await prisma.tierBenefitClaim.count({
      where: { userId: customer.id, period, benefitType: 'DAILY_DRINK', claimedAt: { gte: todayStart, lte: todayEnd } },
    });
    benefitAvailable = usedToday === 0;
    benefitType = 'DAILY_DRINK';
  }

  const progress = getNextTierProgress(periodPoints);

  res.json({
    success: true,
    data: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      pointsBalance: Math.round(customer.pointsBalance * 100), // in pts
      tier,
      periodPts: progress.pts,
      nextTier: progress.nextTier,
      nextPts: progress.nextPts,
      benefit: { available: benefitAvailable, type: benefitType, silverRemaining },
    },
  });
}

export async function claimTierBenefit(req: AuthRequest, res: Response) {
  const { customerQrCode, storeId } = req.body as { customerQrCode: string; storeId: string };
  if (!customerQrCode || !storeId) {
    res.status(400).json({ success: false, error: 'customerQrCode and storeId required' });
    return;
  }

  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }

  const period = getCurrentPeriod();
  const tier = customer.tier;

  if (tier === 'BRONZE') {
    res.status(400).json({ success: false, error: 'No tier benefit available for Bronze' });
    return;
  }

  let benefitType: string;
  if (tier === 'SILVER') {
    const used = await prisma.tierBenefitClaim.count({
      where: { userId: customer.id, period, benefitType: 'SILVER_FOUNTAIN' },
    });
    if (used >= 30) {
      res.status(400).json({ success: false, error: 'Silver benefit limit reached (30 uses this period)' });
      return;
    }
    benefitType = 'SILVER_FOUNTAIN';
  } else {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const usedToday = await prisma.tierBenefitClaim.count({
      where: { userId: customer.id, period, benefitType: 'DAILY_DRINK', claimedAt: { gte: todayStart, lte: todayEnd } },
    });
    if (usedToday > 0) {
      res.status(400).json({ success: false, error: 'Daily benefit already claimed today' });
      return;
    }
    benefitType = 'DAILY_DRINK';
  }

  await prisma.tierBenefitClaim.create({ data: { userId: customer.id, period, benefitType } });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CLAIM_TIER_BENEFIT', entity: 'tier_benefit_claim', entityId: customer.id,
    details: { tier, benefitType, customerName: customer.name, customerPhone: customer.phone },
    storeId,
  });

  res.json({ success: true, message: `${tier} benefit claimed`, data: { benefitType } });
}

export async function processCatalogRedemption(req: AuthRequest, res: Response) {
  const { customerQrCode, catalogItemId, storeId } = req.body as { customerQrCode: string; catalogItemId: string; storeId: string };
  if (!customerQrCode || !catalogItemId || !storeId) {
    res.status(400).json({ success: false, error: 'customerQrCode, catalogItemId, storeId required' });
    return;
  }

  const [customer, item] = await Promise.all([
    prisma.user.findUnique({ where: { qrCode: customerQrCode } }),
    prisma.redemptionCatalogItem.findUnique({ where: { id: catalogItemId } }),
  ]);

  if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }
  if (!item || !item.isActive) { res.status(404).json({ success: false, error: 'Catalog item not found or inactive' }); return; }

  // pointsCost is in points; convert to dollars for balance deduction
  const costInDollars = item.pointsCost / 100;
  if (customer.pointsBalance < costInDollars) {
    res.status(400).json({ success: false, error: `Insufficient points. Need ${item.pointsCost} pts, have ${Math.round(customer.pointsBalance * 100)} pts` });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: customer.id }, data: { pointsBalance: { decrement: costInDollars } } }),
    prisma.catalogRedemption.create({
      data: { customerId: customer.id, catalogItemId, pointsSpent: item.pointsCost, storeId, processedById: req.user!.id },
    }),
  ]);

  sendPushToUser(customer.id, '🎁 Reward Redeemed!', `You redeemed "${item.title}" for ${item.pointsCost} pts.`, 'REDEMPTION');

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CATALOG_REDEMPTION', entity: 'catalog_redemption', entityId: customer.id,
    details: { item: item.title, pointsCost: item.pointsCost, customerName: customer.name },
    storeId,
  });

  res.json({ success: true, message: `${item.title} redeemed`, data: { remainingPts: Math.round((customer.pointsBalance - costInDollars) * 100) } });
}

// SuperAdmin+: all-store transactions with filters
export async function getAllTransactions(req: AuthRequest, res: Response) {
  const {
    storeId, status, category, from, to,
    page = '1', limit = '25',
  } = req.query as Record<string, string>;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = Math.min(parseInt(limit), 100);

  const where: Record<string, unknown> = {};
  if (storeId)  where.storeId  = storeId;
  if (status)   where.status   = status;
  if (category) where.category = category;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to)   dateFilter.lte = new Date(to + 'T23:59:59');
    where.createdAt = dateFilter;
  }

  const [transactions, total, aggStats] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        customer:  { select: { id: true, name: true, phone: true } },
        grantedBy: { select: { id: true, name: true, phone: true } },
        store:     { select: { id: true, name: true } },
      },
    }),
    prisma.pointsTransaction.count({ where }),
    prisma.pointsTransaction.aggregate({
      where: { ...where, status: 'APPROVED' },
      _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      transactions, total,
      page: parseInt(page), limit: take,
      summary: {
        purchaseVolume: parseFloat((aggStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((aggStats._sum.pointsAwarded ?? 0).toFixed(2)),
      },
    },
  });
}
