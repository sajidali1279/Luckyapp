import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ProductCategory, Tier } from '@prisma/client';
import { DEFAULT_DEV_CUT_RATE, DEFAULT_TIER_RATES } from '../config/constants';
import { getTierBonusRate, updateCustomerTierIfNeeded } from '../utils/tier';
import { sendPushToUser } from '../utils/push';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getStoreByApiKey(apiKey: string) {
  return prisma.store.findUnique({ where: { apiKey } });
}
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─── POST /points/receipt-token  (called by printer agent) ───────────────────
// Auth: X-Store-API-Key header

const receiptTokenSchema = z.object({
  txRef: z.string().min(1).max(100),   // POS transaction reference
  total: z.number().positive(),
  items: z.array(z.object({
    category: z.nativeEnum(ProductCategory),
    amount: z.number().positive(),
  })).min(1),
});

export async function generateReceiptToken(req: Request, res: Response) {
  const apiKey = req.headers['x-store-api-key'] as string;
  if (!apiKey) {
    res.status(401).json({ success: false, error: 'Missing X-Store-API-Key header' });
    return;
  }

  const store = await getStoreByApiKey(apiKey);
  if (!store || !store.isActive) {
    res.status(401).json({ success: false, error: 'Invalid or inactive store API key' });
    return;
  }

  const parsed = receiptTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { txRef, total, items } = parsed.data;

  // Upsert — if same txRef printed again, return same token (idempotent)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const token = await prisma.receiptToken.upsert({
    where: { storeId_txRef: { storeId: store.id, txRef } },
    update: { expiresAt, usedBy: null, usedAt: null, items: JSON.stringify(items), total },
    create: { storeId: store.id, txRef, total, items: JSON.stringify(items), expiresAt },
  });

  res.json({
    success: true,
    data: {
      tokenId: token.id,
      qrData: `LS:RECEIPT:${token.id}`,
      expiresAt: token.expiresAt.toISOString(),
    },
  });
}

// ─── GET /points/receipt-token/:tokenId  (customer preview before claiming) ──

export async function getReceiptToken(req: AuthRequest, res: Response) {
  const { tokenId } = req.params;
  const customerTier: Tier = (req.user?.tier as Tier) ?? Tier.BRONZE;

  const token = await prisma.receiptToken.findUnique({
    where: { id: tokenId },
    include: { store: { select: { id: true, name: true, city: true, transactionFeeRate: true, gasPricePerGallon: true, dieselPricePerGallon: true } } },
  });

  if (!token) {
    res.status(404).json({ success: false, error: 'Receipt QR code not found' });
    return;
  }
  if (new Date() > token.expiresAt) {
    res.status(410).json({ success: false, error: 'This QR code has expired (15-minute limit)' });
    return;
  }
  if (token.usedBy) {
    res.status(409).json({ success: false, error: 'These points have already been claimed' });
    return;
  }

  const items: { category: ProductCategory; amount: number }[] = JSON.parse(token.items);
  const now = new Date();

  // Fetch tier rate, category bonus rates, and active offers for this store
  const [tierRate, allCategoryRates, activeOffers] = await Promise.all([
    prisma.tierCashbackRate.findUnique({ where: { tier: customerTier } }),
    prisma.categoryRate.findMany(),
    prisma.offer.findMany({
      where: {
        isActive: true, startDate: { lte: now }, endDate: { gte: now },
        bonusRate: { not: null },
        AND: [{ OR: [{ type: 'ALL_STORES' }, { storeId: token.storeId }] }],
      },
      orderBy: { bonusRate: 'desc' },
      select: { bonusRate: true, tierBonusRates: true, gasBonusCentsPerGallon: true, category: true, title: true },
    }),
  ]);

  const tierBaseRate = tierRate?.cashbackRate ?? DEFAULT_TIER_RATES[customerTier] ?? 0.01;
  const devCutRate = token.store.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
  const categoryRateMap = Object.fromEntries(allCategoryRates.map(r => [r.category, r.cashbackRate]));

  const tierGasCpg = tierRate?.gasCentsPerGallon ?? null;

  let estimatedCashback = 0;
  const breakdown = items.map((item) => {
    // Pick best offer: category-specific match first, then null-category — both sorted by bonusRate desc
    const offer = activeOffers.find((o) => o.category === item.category)
      ?? activeOffers.find((o) => o.category === null);
    const promoBonus = getTierBonusRate(offer ?? null, customerTier);
    const categoryBonus = categoryRateMap[item.category] ?? 0;

    // Per-gallon mode: estimate gallons from store's posted gas price
    const isGasItem = item.category === ProductCategory.GAS || item.category === ProductCategory.DIESEL;
    const storeGasPrice = isGasItem
      ? (item.category === ProductCategory.GAS ? token.store.gasPricePerGallon : token.store.dieselPricePerGallon)
      : null;
    const estimatedGallons = storeGasPrice && storeGasPrice > 0 ? item.amount / storeGasPrice : null;
    const usePerGallon = isGasItem && estimatedGallons != null && tierGasCpg != null;

    let cashback: number;
    let effectiveRate: number;
    if (usePerGallon) {
      const baseCashback = parseFloat((estimatedGallons! * tierGasCpg! / 100).toFixed(4));
      const promoCashback = offer?.gasBonusCentsPerGallon != null
        ? parseFloat((estimatedGallons! * offer.gasBonusCentsPerGallon / 100).toFixed(4))
        : parseFloat((item.amount * promoBonus).toFixed(4));
      cashback = parseFloat((baseCashback + promoCashback).toFixed(2));
      effectiveRate = item.amount > 0 ? parseFloat((cashback / item.amount).toFixed(4)) : 0;
    } else {
      effectiveRate = parseFloat((tierBaseRate + categoryBonus + promoBonus).toFixed(4));
      cashback = parseFloat((item.amount * effectiveRate).toFixed(2));
    }

    estimatedCashback += cashback;
    return { category: item.category, amount: item.amount, cashback, effectiveRate };
  });

  res.json({
    success: true,
    data: {
      tokenId: token.id,
      store: { id: token.store.id, name: token.store.name, city: token.store.city },
      total: token.total,
      items: breakdown,
      estimatedCashback: parseFloat(estimatedCashback.toFixed(2)),
      tier: customerTier,
      tierBaseRate,
      expiresAt: token.expiresAt.toISOString(),
    },
  });
}

// ─── POST /points/self-grant  (customer claims receipt QR points) ─────────────

const selfGrantSchema = z.object({
  tokenId: z.string().uuid(),
});

export async function selfGrant(req: AuthRequest, res: Response) {
  const parsed = selfGrantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { tokenId } = parsed.data;
  const customer = req.user!;

  const token = await prisma.receiptToken.findUnique({
    where: { id: tokenId },
    include: { store: true },
  });

  if (!token) {
    res.status(404).json({ success: false, error: 'Invalid receipt QR code' });
    return;
  }
  if (new Date() > token.expiresAt) {
    res.status(410).json({ success: false, error: 'This QR code has expired (15-minute limit)' });
    return;
  }
  if (token.usedBy) {
    res.status(409).json({ success: false, error: 'These points have already been claimed' });
    return;
  }

  const items: { category: ProductCategory; amount: number }[] = JSON.parse(token.items);
  const customerTier: Tier = (customer.tier as Tier) ?? Tier.BRONZE;
  const now = new Date();

  // Fetch tier rate, category rates, active offers for this store, and store's dev cut rate
  const [tierRate, allCategoryRates, activeOffers] = await Promise.all([
    prisma.tierCashbackRate.findUnique({ where: { tier: customerTier } }),
    prisma.categoryRate.findMany(),
    prisma.offer.findMany({
      where: {
        isActive: true, startDate: { lte: now }, endDate: { gte: now },
        bonusRate: { not: null },
        AND: [{ OR: [{ type: 'ALL_STORES' }, { storeId: token.storeId }] }],
      },
      orderBy: { bonusRate: 'desc' },
      select: { bonusRate: true, tierBonusRates: true, gasBonusCentsPerGallon: true, category: true },
    }),
  ]);

  const tierBaseRate = tierRate?.cashbackRate ?? DEFAULT_TIER_RATES[customerTier] ?? 0.01;
  const tierGasCpg = tierRate?.gasCentsPerGallon ?? null;
  const devCutRate = token.store.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
  const categoryRateMap = Object.fromEntries(allCategoryRates.map((r) => [r.category, r.cashbackRate]));

  let totalPointsAwarded = 0;
  let totalDevCut = 0;
  let totalStoreCost = 0;

  const transactions = await Promise.all(
    items.map(async (item) => {
      // Pick best offer: category-specific first, then null-category — both sorted by bonusRate desc
      const offer = activeOffers.find((o) => o.category === item.category)
        ?? activeOffers.find((o) => o.category === null);
      const promoBonus = getTierBonusRate(offer ?? null, customerTier);
      const categoryBonus = categoryRateMap[item.category] ?? 0;

      // Per-gallon mode: estimate gallons from store's posted gas price
      const isGasItem = item.category === ProductCategory.GAS || item.category === ProductCategory.DIESEL;
      const storeGasPrice = isGasItem
        ? (item.category === ProductCategory.GAS ? token.store.gasPricePerGallon : token.store.dieselPricePerGallon)
        : null;
      const estimatedGallons = storeGasPrice && storeGasPrice > 0 ? item.amount / storeGasPrice : null;
      const usePerGallon = isGasItem && estimatedGallons != null && tierGasCpg != null;

      let cashbackRate: number;
      let cashbackIssued: number;
      if (usePerGallon) {
        const baseCashback = parseFloat((estimatedGallons! * tierGasCpg! / 100).toFixed(4));
        const promoCashback = offer?.gasBonusCentsPerGallon != null
          ? parseFloat((estimatedGallons! * offer.gasBonusCentsPerGallon / 100).toFixed(4))
          : parseFloat((item.amount * promoBonus).toFixed(4));
        cashbackIssued = parseFloat((baseCashback + promoCashback).toFixed(4));
        cashbackRate = item.amount > 0 ? parseFloat((cashbackIssued / item.amount).toFixed(4)) : 0;
      } else {
        cashbackRate = parseFloat((tierBaseRate + categoryBonus + promoBonus).toFixed(4));
        cashbackIssued = parseFloat((item.amount * cashbackRate).toFixed(4));
      }
      const devCut = parseFloat((cashbackIssued * devCutRate).toFixed(4)); // % of cashback, not purchase
      const pointsAwarded = cashbackIssued; // customer gets full cashback

      totalPointsAwarded += pointsAwarded;
      totalDevCut += devCut;
      totalStoreCost += devCut; // store owes developer: dev cut only

      return prisma.pointsTransaction.create({
        data: {
          customerId: customer.id,
          grantedById: customer.id, // self-grant — no employee in the loop
          storeId: token.storeId,
          purchaseAmount: item.amount,
          pointsAwarded,
          devCut,
          storeCost: devCut, // store owes: dev cut only (cashback is store's loyalty cost via product redemptions)
          cashbackRate,
          category: item.category,
          status: 'APPROVED',    // Auto-approved — QR token is the receipt proof
          receiptImageUrl: null, // No photo needed; QR token IS the proof
          notes: `Self-grant via receipt QR (txRef: ${token.txRef})`,
        },
      });
    })
  );

  // Round totals
  totalPointsAwarded = parseFloat(totalPointsAwarded.toFixed(2));
  totalDevCut = parseFloat(totalDevCut.toFixed(2));

  // Update customer balance + atomically claim the token — prevents double-claim race condition
  let updatedCustomer: Awaited<ReturnType<typeof prisma.user.update>>;
  try {
    updatedCustomer = await prisma.$transaction(async (tx) => {
      // Atomic claim: only succeeds if usedBy is still null at this moment
      const claimed = await tx.receiptToken.updateMany({
        where: { id: tokenId, usedBy: null },
        data: { usedBy: customer.id, usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw Object.assign(new Error('ALREADY_CLAIMED'), { code: 'ALREADY_CLAIMED' });
      }
      return tx.user.update({
        where: { id: customer.id },
        data: {
          pointsBalance: { increment: totalPointsAwarded },
          periodPoints:  { increment: totalPointsAwarded },
        },
      });
    });
  } catch (err: any) {
    if (err.code === 'ALREADY_CLAIMED') {
      res.status(409).json({ success: false, error: 'These points have already been claimed' });
      return;
    }
    throw err;
  }

  // Recalculate tier after balance update
  await updateCustomerTierIfNeeded(customer.id, updatedCustomer.periodPoints, updatedCustomer.tier);

  sendPushToUser(
    customer.id,
    '💰 Points Credited!',
    `${Math.round(totalPointsAwarded * 100)} pts added to your Lucky Stop balance.`,
    'POINTS'
  );

  res.json({
    success: true,
    data: {
      pointsAwarded: totalPointsAwarded,
      storeName: token.store.name,
      total: token.total,
      transactionCount: transactions.length,
    },
  });
}

// ─── GET /billing/stores/:storeId/api-key  (DevAdmin — view/regenerate) ──────

export async function getStoreApiKey(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, apiKey: true } });
  if (!store) { res.status(404).json({ success: false, error: 'Store not found' }); return; }
  res.json({ success: true, data: { storeId: store.id, name: store.name, apiKey: store.apiKey } });
}

export async function regenerateStoreApiKey(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { randomBytes } = await import('crypto');
  const apiKey = `sk_store_${randomBytes(20).toString('hex')}`;
  const store = await prisma.store.update({ where: { id: storeId }, data: { apiKey }, select: { id: true, name: true, apiKey: true } });
  res.json({ success: true, data: { storeId: store.id, name: store.name, apiKey: store.apiKey } });
}
