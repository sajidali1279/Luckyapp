import crypto from 'crypto';
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { sendPushToUser } from '../utils/push';
import { audit } from '../utils/audit';

const HOLD_MINUTES = 30;

function generateCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

// GET /catalog — active items (all authenticated)
export async function getCatalog(req: AuthRequest, res: Response) {
  const items = await prisma.redemptionCatalogItem.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: items });
}

// GET /catalog/all — all items including inactive (SuperAdmin+)
export async function getAllCatalog(req: AuthRequest, res: Response) {
  const items = await prisma.redemptionCatalogItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: items });
}

// POST /catalog — create item (SuperAdmin+)
export async function createCatalogItem(req: AuthRequest, res: Response) {
  const { title, description, emoji, pointsCost, sortOrder, chain, category } = req.body;
  if (!title || !pointsCost || pointsCost < 1) {
    res.status(400).json({ success: false, error: 'title and pointsCost (min 1) are required' });
    return;
  }
  const item = await prisma.redemptionCatalogItem.create({
    data: {
      title,
      description: description || '',
      emoji: emoji || '🎁',
      pointsCost: parseInt(pointsCost),
      sortOrder: sortOrder || 0,
      chain: chain || 'Lucky Stop',
      category: category || 'IN_STORE',
    },
  });
  res.status(201).json({ success: true, data: item });
}

// PATCH /catalog/:id (SuperAdmin+)
export async function updateCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { title, description, emoji, pointsCost, isActive, sortOrder, chain, category } = req.body;
  const item = await prisma.redemptionCatalogItem.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(emoji !== undefined && { emoji }),
      ...(pointsCost !== undefined && { pointsCost: parseInt(pointsCost) }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(chain !== undefined && { chain }),
      ...(category !== undefined && { category }),
    },
  });
  res.json({ success: true, data: item });
}

// DELETE /catalog/:id — soft delete (SuperAdmin+)
export async function deleteCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.redemptionCatalogItem.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true });
}

// ─── Customer: initiate redemption ────────────────────────────────────────────
// POST /catalog/redeem  (CUSTOMER)
// Deducts points immediately, creates PENDING hold for 30 min
export async function customerInitiateRedemption(req: AuthRequest, res: Response) {
  const { catalogItemId } = req.body as { catalogItemId: string };
  if (!catalogItemId) {
    res.status(400).json({ success: false, error: 'catalogItemId required' });
    return;
  }

  const [customer, item] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id } }),
    prisma.redemptionCatalogItem.findUnique({ where: { id: catalogItemId } }),
  ]);

  if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }
  if (!item || !item.isActive) { res.status(404).json({ success: false, error: 'Reward not available' }); return; }

  const costInDollars = item.pointsCost / 100;
  if (customer.pointsBalance < costInDollars) {
    res.status(400).json({
      success: false,
      error: `Not enough points. Need ${item.pointsCost} pts, you have ${Math.round(customer.pointsBalance * 100)} pts`,
    });
    return;
  }

  // Check if customer already has a pending redemption for this item
  const existing = await prisma.catalogRedemption.findFirst({
    where: { customerId: customer.id, catalogItemId, status: 'PENDING', expiresAt: { gt: new Date() } },
  });
  if (existing) {
    res.status(400).json({ success: false, error: 'You already have an active redemption for this item', data: { redemptionId: existing.id } });
    return;
  }

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
  let code = generateCode();
  // Ensure code is unique
  while (await prisma.catalogRedemption.findFirst({ where: { redemptionCode: code } })) {
    code = generateCode();
  }

  const [, redemption] = await prisma.$transaction([
    prisma.user.update({ where: { id: customer.id }, data: { pointsBalance: { decrement: costInDollars } } }),
    prisma.catalogRedemption.create({
      data: {
        customerId: customer.id,
        catalogItemId,
        pointsSpent: item.pointsCost,
        status: 'PENDING',
        redemptionCode: code,
        expiresAt,
      },
      include: { catalogItem: true },
    }),
  ]);

  res.status(201).json({
    success: true,
    data: {
      redemptionId: redemption.id,
      redemptionCode: code,
      item: { title: item.title, emoji: item.emoji, pointsCost: item.pointsCost },
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes: HOLD_MINUTES,
      remainingPts: Math.round((customer.pointsBalance - costInDollars) * 100),
    },
  });
}

// ─── Customer: get my redemptions ─────────────────────────────────────────────
// GET /catalog/my-redemptions  (CUSTOMER)
export async function getMyRedemptions(req: AuthRequest, res: Response) {
  const redemptions = await prisma.catalogRedemption.findMany({
    where: { customerId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { catalogItem: { select: { title: true, emoji: true } } },
  });

  // Auto-expire in response (don't wait for cron)
  const now = new Date();
  const result = redemptions.map(r => ({
    ...r,
    status: r.status === 'PENDING' && r.expiresAt && r.expiresAt < now ? 'EXPIRED' : r.status,
  }));

  res.json({ success: true, data: result });
}

// ─── Customer: cancel a pending redemption ─────────────────────────────────────
// DELETE /catalog/redeem/:id  (CUSTOMER)
export async function cancelRedemption(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const redemption = await prisma.catalogRedemption.findUnique({ where: { id } });
  if (!redemption || redemption.customerId !== req.user!.id) {
    res.status(404).json({ success: false, error: 'Redemption not found' }); return;
  }
  if (redemption.status !== 'PENDING') {
    res.status(400).json({ success: false, error: 'Only pending redemptions can be cancelled' }); return;
  }
  const costInDollars = redemption.pointsSpent / 100;
  await prisma.$transaction([
    prisma.catalogRedemption.update({ where: { id }, data: { status: 'CANCELLED' } }),
    prisma.user.update({ where: { id: req.user!.id }, data: { pointsBalance: { increment: costInDollars } } }),
  ]);
  res.json({ success: true, message: 'Redemption cancelled, points refunded' });
}

// ─── Employee: get pending redemptions for a customer ─────────────────────────
// GET /catalog/pending/:qrCode  (EMPLOYEE+)
export async function getPendingRedemptionsForCustomer(req: AuthRequest, res: Response) {
  const { qrCode } = req.params;
  const customer = await prisma.user.findUnique({ where: { qrCode } });
  if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

  const now = new Date();
  const redemptions = await prisma.catalogRedemption.findMany({
    where: { customerId: customer.id, status: 'PENDING', expiresAt: { gt: now } },
    include: { catalogItem: { select: { title: true, emoji: true, category: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: redemptions });
}

// ─── Employee: confirm a pending redemption ───────────────────────────────────
// POST /catalog/redeem/:id/confirm  (EMPLOYEE+)
export async function confirmRedemption(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const storeId = req.user!.storeIds?.[0] || req.body.storeId;

  const redemption = await prisma.catalogRedemption.findUnique({
    where: { id },
    include: { catalogItem: true, customer: true },
  });
  if (!redemption) { res.status(404).json({ success: false, error: 'Redemption not found' }); return; }
  if (redemption.status !== 'PENDING') {
    res.status(400).json({ success: false, error: `Redemption is ${redemption.status}` }); return;
  }
  if (redemption.expiresAt && redemption.expiresAt < new Date()) {
    // Expired — refund if not already done
    const costInDollars = redemption.pointsSpent / 100;
    await prisma.$transaction([
      prisma.catalogRedemption.update({ where: { id }, data: { status: 'EXPIRED' } }),
      prisma.user.update({ where: { id: redemption.customerId }, data: { pointsBalance: { increment: costInDollars } } }),
    ]);
    res.status(400).json({ success: false, error: 'Redemption has expired — points have been refunded' }); return;
  }

  await prisma.catalogRedemption.update({
    where: { id },
    data: { status: 'COMPLETED', processedById: req.user!.id, storeId: storeId || null },
  });

  sendPushToUser(redemption.customerId, '✅ Reward Confirmed!',
    `Your "${redemption.catalogItem.title}" has been redeemed. Enjoy!`, 'REDEMPTION');

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CATALOG_CONFIRM', entity: 'catalog_redemption', entityId: id,
    details: { item: redemption.catalogItem.title, customer: redemption.customer.name },
    storeId,
  });

  res.json({
    success: true,
    message: `${redemption.catalogItem.title} confirmed`,
    data: { customer: redemption.customer.name || redemption.customer.phone },
  });
}
