import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ProductCategory } from '@prisma/client';
import { DEFAULT_DEV_CUT_RATE, DEFAULT_CASHBACK_RATE } from '../config/constants';

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

export async function getReceiptToken(req: Request, res: Response) {
  const { tokenId } = req.params;

  const token = await prisma.receiptToken.findUnique({
    where: { id: tokenId },
    include: { store: { select: { id: true, name: true, city: true } } },
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

  // Fetch per-category cashback rates
  const categoryRates = await prisma.categoryRate.findMany();
  const rateMap: Record<string, number> = {};
  categoryRates.forEach((r) => { rateMap[r.category] = r.cashbackRate; });

  const DEFAULT_RATE = DEFAULT_CASHBACK_RATE;
  const devCutConfig = await prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } });
  const devCutRate = parseFloat(devCutConfig?.value ?? String(DEFAULT_DEV_CUT_RATE));

  let estimatedCashback = 0;
  const breakdown = items.map((item) => {
    const rate = rateMap[item.category] ?? DEFAULT_RATE;
    const cashback = parseFloat((item.amount * rate).toFixed(2));
    const customerCashback = parseFloat((cashback * (1 - devCutRate)).toFixed(2));
    estimatedCashback += customerCashback;
    return { category: item.category, amount: item.amount, cashback: customerCashback };
  });

  res.json({
    success: true,
    data: {
      tokenId: token.id,
      store: token.store,
      total: token.total,
      items: breakdown,
      estimatedCashback: parseFloat(estimatedCashback.toFixed(2)),
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

  // Fetch rates
  const [categoryRatesRows, devCutConfig] = await Promise.all([
    prisma.categoryRate.findMany(),
    prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } }),
  ]);

  const rateMap: Record<string, number> = {};
  categoryRatesRows.forEach((r) => { rateMap[r.category] = r.cashbackRate; });
  const DEFAULT_RATE = DEFAULT_CASHBACK_RATE;
  const devCutRate = parseFloat(devCutConfig?.value ?? String(DEFAULT_DEV_CUT_RATE));

  // Create one transaction per category line item (for accurate category tracking)
  // Use a DevAdmin-like system user as the granter — find or use null system ID
  // Actually use the store's first employee, or create a system-level approach:
  // We'll use the customer's own ID as grantedBy (self-grant, no employee involved)
  let totalPointsAwarded = 0;
  let totalDevCut = 0;
  let totalStoreCost = 0;

  const transactions = await Promise.all(
    items.map(async (item) => {
      const cashbackRate = rateMap[item.category] ?? DEFAULT_RATE;
      const cashbackIssued = parseFloat((item.amount * cashbackRate).toFixed(4));
      const devCut = parseFloat((cashbackIssued * devCutRate).toFixed(2));
      const pointsAwarded = parseFloat((cashbackIssued - devCut).toFixed(2));

      totalPointsAwarded += pointsAwarded;
      totalDevCut += devCut;
      totalStoreCost += cashbackIssued;

      return prisma.pointsTransaction.create({
        data: {
          customerId: customer.id,
          grantedById: customer.id, // self-grant — no employee in the loop
          storeId: token.storeId,
          purchaseAmount: item.amount,
          pointsAwarded,
          devCut,
          storeCost: cashbackIssued,
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

  // Update customer balance + mark token used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: customer.id },
      data: { pointsBalance: { increment: totalPointsAwarded } },
    }),
    prisma.receiptToken.update({
      where: { id: tokenId },
      data: { usedBy: customer.id, usedAt: new Date() },
    }),
  ]);

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
