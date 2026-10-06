import { Request, Response } from 'express';
import { offerPaysAt } from '../utils/offerHours';
import { forCustomer } from '../utils/offerAudience';
import { hasLimits, promotionRoom, noteBudgetUse } from '../utils/offerBudget';
import { creditChallenges, pushChallengeAwards } from '../utils/challenges';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ProductCategory, Tier } from '@prisma/client';
import { DEFAULT_DEV_CUT_RATE, DEFAULT_TIER_RATES } from '../config/constants';
import { updateCustomerTierIfNeeded, GAS_BONUS_PER_GALLON, effectiveTier, rollCustomerPeriod } from '../utils/tier';
import { pickOffer, percentBonus } from '../utils/offerPick';
import { sendPushToUser } from '../utils/push';
import { pointsUrl } from '../utils/notificationRoutes';
import { getStoreByApiKey, generateStoreApiKey } from '../utils/storeApiKey';
import { audit } from '../utils/audit';
import { storeDayStart } from '../utils/storeTime';

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
        isActive: true, startDate: { lte: now }, endDate: { gte: now }, budgetReachedAt: null,   // a used-up budget pays no more
        OR: [{ bonusRate: { not: null } }, { gasBonusCentsPerGallon: { not: null } }],
        AND: [{ OR: [{ type: 'ALL_STORES' }, { storeId: token.storeId }] }],
      },
      orderBy: { bonusRate: 'desc' },
      select: { id: true, createdAt: true, type: true, storeId: true, bonusRate: true, tierBonusRates: true, gasBonusCentsPerGallon: true, category: true, title: true, happyDays: true, happyFrom: true, happyTo: true,
        audience: true, audienceTier: true, audienceDays: true, budgetCap: true, dailyCapPerCustomer: true },
    }).then((rows) => rows.filter((o) => offerPaysAt(o, now)))   // a happy-hour promotion pays only inside its hours
      .then((rows) => forCustomer(rows, req.user!.id, now, customerTier)),   // only the promotions this customer is in the audience of
  ]);

  const tierBaseRate = tierRate?.cashbackRate ?? DEFAULT_TIER_RATES[customerTier] ?? 0.01;
  const devCutRate = token.store.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
  const categoryRateMap = Object.fromEntries(allCategoryRates.map(r => [r.category, r.cashbackRate]));

  const tierGasCpg = tierRate?.gasCentsPerGallon ?? null;


  const rooms = new Map<string, number>();
  for (const o of activeOffers) if (hasLimits(o)) rooms.set(o.id, await promotionRoom(o, req.user!.id, now));
  const takeRoom = (o: { id?: string } | null, wanted: number) => {
    if (!o?.id || !rooms.has(o.id)) return wanted;
    const got = Math.max(0, Math.min(wanted, rooms.get(o.id)!));
    rooms.set(o.id, rooms.get(o.id)! - got);
    return got;
  };

  let estimatedCashback = 0;
  const breakdown = items.map((item) => {
    const categoryBonus = categoryRateMap[item.category] ?? 0;

    // Per-gallon mode: estimate gallons from store's posted gas price
    const isGasItem = item.category === ProductCategory.GAS || item.category === ProductCategory.DIESEL;
    const storeGasPrice = isGasItem
      ? (item.category === ProductCategory.GAS ? token.store.gasPricePerGallon : token.store.dieselPricePerGallon)
      : null;
    const estimatedGallons = storeGasPrice && storeGasPrice > 0 ? item.amount / storeGasPrice : null;
    const usePerGallon = isGasItem && estimatedGallons != null && tierGasCpg != null && tierGasCpg > 0;

    // Same one-promotion rule as a cashier grant (utils/offerPick.ts): the answer never depends on row order
    const offer = pickOffer(activeOffers, { storeId: token.storeId, category: item.category, tier: customerTier, purchaseAmount: item.amount, gallons: estimatedGallons });
    const promoBonus = offer ? percentBonus(offer, customerTier) : 0;

    let cashback: number;
    let effectiveRate: number;
    if (usePerGallon) {
      const baseCashback = parseFloat((estimatedGallons! * tierGasCpg! / 100).toFixed(4));
      // Only apply promo in per-gallon mode if it's also a cpg offer; ignore % offers to avoid mode mixing
      const promoCashback = takeRoom(offer, offer?.gasBonusCentsPerGallon != null
        ? parseFloat((estimatedGallons! * offer.gasBonusCentsPerGallon / 100).toFixed(4))
        : 0);   // within the promotion's budget and daily limit
      cashback = parseFloat((baseCashback + promoCashback).toFixed(2));
      effectiveRate = item.amount > 0 ? parseFloat((cashback / item.amount).toFixed(4)) : 0;
    } else {
      const promo = takeRoom(offer, item.amount * promoBonus);   // within the promotion's budget and daily limit
      cashback = parseFloat((item.amount * (tierBaseRate + categoryBonus) + promo).toFixed(2));
      effectiveRate = item.amount > 0 ? parseFloat((cashback / item.amount).toFixed(4)) : 0;
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

  // Daily self-grant cap — limits abuse if a store API key is compromised
  const todayStart = storeDayStart();
  const todaySelfGrantCount = await prisma.pointsTransaction.count({
    where: { customerId: customer.id, grantedById: customer.id, challengeId: null, createdAt: { gte: todayStart } },   // a challenge reward is not a scan
  });
  if (todaySelfGrantCount >= 15) {
    res.status(429).json({ success: false, error: 'Daily receipt scan limit reached. Visit the store cashier to claim additional points.' });
    return;
  }

  const items: { category: ProductCategory; amount: number }[] = JSON.parse(token.items);
  // The tier after any half-year step down that has not been written yet (the signed-in user object only carries the stored tier)
  const tierState = await prisma.user.findUnique({ where: { id: customer.id }, select: { tier: true, tierPeriod: true, periodPoints: true } });
  const customerTier: Tier = tierState ? effectiveTier(tierState).tier : Tier.BRONZE;
  const now = new Date();

  // Fetch tier rate, category rates, active offers for this store, and store's dev cut rate
  const [tierRate, allCategoryRates, activeOffers] = await Promise.all([
    prisma.tierCashbackRate.findUnique({ where: { tier: customerTier } }),
    prisma.categoryRate.findMany(),
    prisma.offer.findMany({
      where: {
        isActive: true, startDate: { lte: now }, endDate: { gte: now }, budgetReachedAt: null,   // a used-up budget pays no more
        OR: [{ bonusRate: { not: null } }, { gasBonusCentsPerGallon: { not: null } }],
        AND: [{ OR: [{ type: 'ALL_STORES' }, { storeId: token.storeId }] }],
      },
      orderBy: { bonusRate: 'desc' },
      select: { id: true, createdAt: true, type: true, storeId: true, title: true, bonusRate: true, tierBonusRates: true, gasBonusCentsPerGallon: true, category: true, happyDays: true, happyFrom: true, happyTo: true,
        audience: true, audienceTier: true, audienceDays: true, budgetCap: true, dailyCapPerCustomer: true },
    }).then((rows) => rows.filter((o) => offerPaysAt(o, now)))   // a happy-hour promotion pays only inside its hours
      .then((rows) => forCustomer(rows, customer.id, now, customerTier)),   // only the promotions this customer is in the audience of
  ]);

  const tierBaseRate = tierRate?.cashbackRate ?? DEFAULT_TIER_RATES[customerTier] ?? 0.01;
  const tierGasCpg = tierRate?.gasCentsPerGallon ?? null;
  const devCutRate = token.store.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
  const categoryRateMap = Object.fromEntries(allCategoryRates.map((r) => [r.category, r.cashbackRate]));


  const rooms = new Map<string, number>();
  for (const o of activeOffers) if (hasLimits(o)) rooms.set(o.id, await promotionRoom(o, customer.id, now));
  const takeRoom = (o: { id?: string } | null, wanted: number) => {
    if (!o?.id || !rooms.has(o.id)) return wanted;
    const got = Math.max(0, Math.min(wanted, rooms.get(o.id)!));
    rooms.set(o.id, rooms.get(o.id)! - got);
    return got;
  };

  let totalPointsAwarded = 0;
  let totalDevCut = 0;
  let totalStoreCost = 0;

  const transactions = await Promise.all(
    items.map(async (item) => {
      const categoryBonus = categoryRateMap[item.category] ?? 0;

      // Per-gallon mode: estimate gallons from store's posted gas price
      const isGasItem = item.category === ProductCategory.GAS || item.category === ProductCategory.DIESEL;
      const storeGasPrice = isGasItem
        ? (item.category === ProductCategory.GAS ? token.store.gasPricePerGallon : token.store.dieselPricePerGallon)
        : null;
      const estimatedGallons = storeGasPrice && storeGasPrice > 0 ? item.amount / storeGasPrice : null;
      const usePerGallon = isGasItem && estimatedGallons != null && tierGasCpg != null && tierGasCpg > 0;

      // Same one-promotion rule as a cashier grant (utils/offerPick.ts): the answer never depends on row order
      const offer = pickOffer(activeOffers, { storeId: token.storeId, category: item.category, tier: customerTier, purchaseAmount: item.amount, gallons: estimatedGallons });
      const promoBonus = offer ? percentBonus(offer, customerTier) : 0;

      let cashbackRate: number;
      let cashbackIssued: number;
      let offerAdded = 0;   // what the promotion added to this line, recorded on the sale for its results
      if (usePerGallon) {
        const baseCashback = parseFloat((estimatedGallons! * tierGasCpg! / 100).toFixed(4));
        // Only apply promo in per-gallon mode if it's also a cpg offer; ignore % offers to avoid mode mixing
        const promoCashback = takeRoom(offer, offer?.gasBonusCentsPerGallon != null
          ? parseFloat((estimatedGallons! * offer.gasBonusCentsPerGallon / 100).toFixed(4))
          : 0);   // within the promotion's budget and daily limit
        cashbackIssued = parseFloat((baseCashback + promoCashback).toFixed(4));
        cashbackRate = item.amount > 0 ? parseFloat((cashbackIssued / item.amount).toFixed(4)) : 0;
        offerAdded = promoCashback;
      } else {
        offerAdded = parseFloat(takeRoom(offer, item.amount * promoBonus).toFixed(4));   // within the promotion's budget and daily limit
        cashbackIssued = parseFloat((item.amount * (tierBaseRate + categoryBonus) + offerAdded).toFixed(4));
        cashbackRate = item.amount > 0 ? parseFloat((cashbackIssued / item.amount).toFixed(4)) : 0;
      }
      const devCut = parseFloat((cashbackIssued * devCutRate).toFixed(4)); // % of cashback, not purchase
      const pointsAwarded = cashbackIssued; // customer gets full cashback

      // Gas tier bonus — extra per-gallon bonus for Gold+ (stacks on top)
      const gasBonusRate = isGasItem ? (GAS_BONUS_PER_GALLON[customerTier] ?? 0) : 0;
      const gasBonusPoints = isGasItem && estimatedGallons != null
        ? parseFloat((estimatedGallons * gasBonusRate).toFixed(4))
        : 0;

      totalPointsAwarded += pointsAwarded + gasBonusPoints;
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
          isGas: isGasItem,
          gasGallons: isGasItem ? estimatedGallons : null,
          gasBonusPoints,
          offerId: offer && offerAdded > 0 ? offer.id : null,
          offerCashback: offer && offerAdded > 0 ? offerAdded : null,
          status: 'APPROVED',    // Auto-approved — QR token is the receipt proof
          receiptImageUrl: null, // No photo needed; QR token IS the proof
          notes: `Self-grant via receipt QR (txRef: ${token.txRef})`,
        },
      });
    })
  );

  // A promotion whose budget this receipt used up stops, and HQ is told
  for (const o of activeOffers) if (o.budgetCap != null && rooms.has(o.id)) noteBudgetUse(o, now).catch((e) => console.error('[receipt] budget check failed:', e?.message ?? e));

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
      await rollCustomerPeriod(tx, customer.id);
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

  // Challenges: each approved line moves them on, one after the other (utils/challenges.ts)
  const challengeAwards = [];
  for (const line of transactions) challengeAwards.push(...await prisma.$transaction((db) => creditChallenges(db, line.id)));
  const challengeExtra = challengeAwards.reduce((n, a) => n + a.reward, 0);
  pushChallengeAwards(challengeAwards).catch((e) => console.error('[challenges] push failed:', e?.message ?? e));

  // Recalculate tier after balance update
  await updateCustomerTierIfNeeded(customer.id, updatedCustomer.periodPoints + challengeExtra, updatedCustomer.tier);

  sendPushToUser(
    customer.id,
    '💰 Points Credited!',
    `${Math.round(totalPointsAwarded * 100)} pts added to your Lucky Stop balance.`,
    'POINTS',
    pointsUrl()
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

// ─── GET /billing/stores/:storeId/api-key  (DevAdmin — check/regenerate) ─────
// Only the hash is ever stored, so the raw key can't be shown after the
// fact — this reports whether one exists, not what it is. Regenerating is
// the only way to get a usable raw key, and it's shown exactly once.

export async function getStoreApiKey(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, apiKey: true } });
  if (!store) { res.status(404).json({ success: false, error: 'Store not found' }); return; }
  res.json({ success: true, data: { storeId: store.id, name: store.name, hasApiKey: !!store.apiKey } });
}

export async function regenerateStoreApiKey(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { rawKey, hashedKey } = generateStoreApiKey();
  const store = await prisma.store.update({ where: { id: storeId }, data: { apiKey: hashedKey }, select: { id: true, name: true } });
  // Recorded (never the key itself): making a new key stops the printer agent that used the old one
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'REGENERATE_API_KEY', entity: 'store', entityId: storeId,
    details: { summary: `${store.name}: printer API key regenerated (the old key stopped working)` },
    storeId, storeName: store.name,
  });
  res.json({ success: true, data: { storeId: store.id, name: store.name, apiKey: rawKey } });
}
