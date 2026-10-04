import crypto from 'crypto';
import { Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';
import { refuse } from '../utils/refusal';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { sendPushToUser } from '../utils/push';
import { redemptionUrl } from '../utils/notificationRoutes';
import { audit } from '../utils/audit';
import { lockCustomer, settlePendingRedemption } from '../utils/moneyGuards';
import { isCustomerAccount, NOT_A_CUSTOMER } from '../utils/customerOnly';
import { usableStoreIds } from '../utils/storeAccess';
import { pointsForPrice } from '../utils/rewardPoints';

const HOLD_MINUTES = 30;

function generateCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

// GET /catalog — active items (all authenticated)
export async function getCatalog(req: AuthRequest, res: Response) {
  const items = await prisma.redemptionCatalogItem.findMany({
    where: { isActive: true },
    include: { store: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: items });
}

// Chain-wide rewards are HQ's. A store manager may add and change rewards for their own stores only, and HQ is told (the Activity Log
// entries below show on the HQ Notifications list).
async function managerStores(req: AuthRequest): Promise<string[] | null> {
  if (hasMinRole(req.user!.role, Role.SUPER_ADMIN)) return null;      // null = every store, chain-wide included
  return usableStoreIds(req.user!.id, req.user!.role);
}
function mayChange(mine: string[] | null, storeId: string | null): boolean {
  return mine === null || (storeId !== null && mine.includes(storeId));
}
const CHAIN_WIDE_IS_HQ = 'Chain-wide rewards are set by HQ. You can add or change rewards for your own store.';

// GET /catalog/all — all items including inactive (SuperAdmin+)
export async function getAllCatalog(req: AuthRequest, res: Response) {
  const mine = await managerStores(req);
  const items = await prisma.redemptionCatalogItem.findMany({
    // A manager sees the chain's rewards and their own stores' (not another store's)
    where: mine === null ? {} : { OR: [{ storeId: null }, { storeId: { in: mine } }] },
    include: { store: { select: { id: true, name: true } }, label: { select: { id: true, productName: true, priceText: true, category: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  // How often each reward is actually taken: all time and the last 30 days (handed out only, not held, cancelled or expired)
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [allTime, recent] = await Promise.all([
    prisma.catalogRedemption.groupBy({ by: ['catalogItemId'], where: { status: 'COMPLETED' }, _count: { _all: true } }),
    prisma.catalogRedemption.groupBy({ by: ['catalogItemId'], where: { status: 'COMPLETED', createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const total = new Map(allTime.map((g) => [g.catalogItemId, g._count._all]));
  const last30 = new Map(recent.map((g) => [g.catalogItemId, g._count._all]));
  res.json({
    success: true,
    data: items.map((it) => ({ ...it, canManage: mayChange(mine, it.storeId), redeemedTotal: total.get(it.id) ?? 0, redeemed30d: last30.get(it.id) ?? 0 })),
  });
}

// A reward's fields, checked: a reward priced at 0 points was a free reward, and text for the price or order crashed the save
const rewardFields = {
  title: z.string({ message: 'Enter the reward name.' }).trim().min(1, 'Enter the reward name.').max(60, 'The name is too long (60 characters at most).'),
  description: z.string().trim().max(200, 'The description is too long (200 characters at most).'),
  emoji: z.string().trim().max(8, 'Use one emoji.'),
  pointsCost: z.coerce.number({ message: 'The points cost must be a number.' }).int('The points cost must be a whole number.').min(1, 'A reward costs at least 1 point.').max(100_000, 'That is more than 100,000 points ($1,000). Check the number.'),
  sortOrder: z.coerce.number({ message: 'The order must be a number.' }).int('The order must be a whole number.').min(0).max(9999),
  isActive: z.boolean({ message: 'Active must be true or false.' }),
  chain: z.string().trim().min(1, 'Enter the company name.').max(40, 'The company name is too long (40 characters at most).'),
  // The admin form offers six; only the first three were accepted, so Groceries, Frozen Foods and Fresh Foods could never be saved
  category: z.enum(['IN_STORE', 'GAS', 'HOT_FOODS', 'GROCERIES', 'FROZEN_FOODS', 'FRESH_FOODS'], { message: 'Pick a category from the list.' }),
  // null (or empty) = every store
  storeId: z.string().trim().nullable().transform((v) => v || null),
  // The Labels catalog item it is: its points follow that item's price. null (or empty) = points set by hand
  labelId: z.string().trim().max(64).nullable().transform((v) => v || null),
};
const createRewardSchema = z.object({ ...rewardFields, description: rewardFields.description.optional(), emoji: rewardFields.emoji.optional(), sortOrder: rewardFields.sortOrder.optional(), isActive: rewardFields.isActive.optional(), chain: rewardFields.chain.optional(), category: rewardFields.category.optional(), storeId: rewardFields.storeId.optional(), labelId: rewardFields.labelId.optional() });

/** The linked item, and the points its price makes; a 400 sentence when the item is gone. Points stay as asked when it has no price. */
async function linkedPoints(labelId: string | null | undefined): Promise<{ error: string } | { points: number | null; label: { productName: string; priceText: string | null } | null }> {
  if (!labelId) return { points: null, label: null };
  const label = await prisma.label.findUnique({ where: { id: labelId }, select: { productName: true, priceText: true } });
  if (!label) return { error: 'That catalog item no longer exists. Pick it again.' };
  return { points: pointsForPrice(label.priceText), label };
}
const updateRewardSchema = createRewardSchema.partial();

async function storeName(id: string): Promise<string> {
  return (await prisma.store.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'a store';
}

const rewardWords = (r: { title: string; pointsCost: number; isActive: boolean }) => `${r.title} (${r.pointsCost.toLocaleString('en-US')} pts${r.isActive ? '' : ', off'})`;

// POST /catalog — create item
export async function createCatalogItem(req: AuthRequest, res: Response) {
  const parsed = createRewardSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const d = parsed.data;
  const mine = await managerStores(req);
  // A manager's reward is for their store: the one they picked, or their only store
  let storeId: string | null = d.storeId ?? null;
  if (mine !== null && storeId === null && mine.length === 1) storeId = mine[0];
  if (!mayChange(mine, storeId)) { res.status(403).json({ success: false, error: CHAIN_WIDE_IS_HQ }); return; }
  if (storeId && !(await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }))) {
    res.status(400).json({ success: false, error: 'That store does not exist.' }); return;
  }
  const link = await linkedPoints(d.labelId);
  if ('error' in link) { res.status(400).json({ success: false, error: link.error }); return; }
  const item = await prisma.redemptionCatalogItem.create({
    data: {
      storeId,
      labelId: d.labelId ?? null,
      title: d.title,
      description: d.description ?? '',
      emoji: d.emoji || '🎁',
      pointsCost: link.points ?? d.pointsCost,   // a linked item's price decides
      sortOrder: d.sortOrder ?? 0,
      isActive: d.isActive ?? true,
      chain: d.chain || 'Lucky Stop',
      category: d.category ?? 'IN_STORE',
    },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CATALOG_ITEM_CREATE', entity: 'catalog_item', entityId: item.id,
    details: { summary: `Reward added${item.storeId ? ` for ${(await storeName(item.storeId))}` : ' for every store'}: ${rewardWords(item)}${link.label ? `, linked to ${link.label.productName} ($${link.label.priceText ?? 'no price'})` : ''}` },
    storeId: item.storeId, storeName: item.storeId ? await storeName(item.storeId) : undefined,
  });
  res.status(201).json({ success: true, data: item });
}

// PATCH /catalog/:id
export async function updateCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateRewardSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const before = await prisma.redemptionCatalogItem.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ success: false, error: 'That reward does not exist.' }); return; }
  const mine = await managerStores(req);
  const nextStore = parsed.data.storeId === undefined ? before.storeId : parsed.data.storeId;
  // A manager may change only their own stores' rewards, and cannot move one to another store or make it chain-wide
  if (!mayChange(mine, before.storeId) || !mayChange(mine, nextStore)) { res.status(403).json({ success: false, error: CHAIN_WIDE_IS_HQ }); return; }
  if (nextStore && nextStore !== before.storeId && !(await prisma.store.findUnique({ where: { id: nextStore }, select: { id: true } }))) {
    res.status(400).json({ success: false, error: 'That store does not exist.' }); return;
  }
  // Linked (now, or still): the item's price decides the points; a typed number is used only without a price
  const nextLabel = parsed.data.labelId === undefined ? before.labelId : parsed.data.labelId;
  const link = await linkedPoints(nextLabel);
  if ('error' in link) { res.status(400).json({ success: false, error: link.error }); return; }
  const data = { ...parsed.data, ...(link.points != null ? { pointsCost: link.points } : {}) };
  const item = await prisma.redemptionCatalogItem.update({ where: { id }, data });
  const changes: string[] = [];
  if (before.labelId !== item.labelId) changes.push(item.labelId ? `linked to ${link.label!.productName} ($${link.label!.priceText ?? 'no price'})` : 'unlinked from its catalog item (points set by hand)');
  if (before.title !== item.title) changes.push(`name "${before.title}" to "${item.title}"`);
  if (before.pointsCost !== item.pointsCost) changes.push(`${before.pointsCost.toLocaleString('en-US')} to ${item.pointsCost.toLocaleString('en-US')} pts`);
  if (before.isActive !== item.isActive) changes.push(item.isActive ? 'turned on' : 'turned off');
  if (before.category !== item.category) changes.push(`category ${before.category} to ${item.category}`);
  if (before.storeId !== item.storeId) changes.push(item.storeId ? `now only at ${await storeName(item.storeId)}` : 'now at every store');
  if (changes.length) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'CATALOG_ITEM_UPDATE', entity: 'catalog_item', entityId: id,
      details: { summary: `Reward ${before.title}: ${changes.join(', ')}` },
      storeId: item.storeId, storeName: item.storeId ? await storeName(item.storeId) : undefined,
    });
  }
  res.json({ success: true, data: item });
}

// DELETE /catalog/:id — switched off, kept for history (codes already handed out can still be used)
export async function deleteCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const before = await prisma.redemptionCatalogItem.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ success: false, error: 'That reward does not exist.' }); return; }
  if (!mayChange(await managerStores(req), before.storeId)) { res.status(403).json({ success: false, error: CHAIN_WIDE_IS_HQ }); return; }
  await prisma.redemptionCatalogItem.update({ where: { id }, data: { isActive: false } });
  if (before.isActive) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'CATALOG_ITEM_UPDATE', entity: 'catalog_item', entityId: id,
      details: { summary: `Reward ${before.title}: turned off` },
      storeId: before.storeId, storeName: before.storeId ? await storeName(before.storeId) : undefined,
    });
  }
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

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
  let code = generateCode();
  // Ensure code is unique
  while (await prisma.catalogRedemption.findFirst({ where: { redemptionCode: code } })) {
    code = generateCode();
  }

  // Balance, "already have one for this item" and the cap of 5 are all checked inside one customer lock: a double tap on Redeem used to
  // pass them twice, take the points twice and hold two codes for the same reward.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customer.id);
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: customer.id }, select: { pointsBalance: true } });
    if (fresh.pointsBalance < costInDollars) {
      return { ok: false as const, status: 400, body: { success: false, error: `Not enough points. Need ${item.pointsCost} pts, you have ${Math.round(fresh.pointsBalance * 100)} pts` } };
    }
    const existing = await tx.catalogRedemption.findFirst({
      where: { customerId: customer.id, catalogItemId, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (existing) {
      return { ok: false as const, status: 400, body: { success: false, error: 'You already have an active redemption for this item', data: { redemptionId: existing.id } } };
    }
    // Concurrent redemption cap — prevents holding many items in limbo simultaneously
    const activePendingCount = await tx.catalogRedemption.count({
      where: { customerId: customer.id, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (activePendingCount >= 5) {
      return { ok: false as const, status: 429, body: { success: false, error: 'You have too many active redemptions. Cancel one or wait for them to expire before starting another.' } };
    }
    await tx.user.update({ where: { id: customer.id }, data: { pointsBalance: { decrement: costInDollars } } });
    const created = await tx.catalogRedemption.create({
      data: {
        customerId: customer.id,
        catalogItemId,
        pointsSpent: item.pointsCost,
        status: 'PENDING',
        redemptionCode: code,
        expiresAt,
      },
      include: { catalogItem: true },
    });
    return { ok: true as const, redemption: created, balance: fresh.pointsBalance - costInDollars };
  });
  if (!outcome.ok) {
    res.status(outcome.status).json(outcome.body);
    return;
  }
  const redemption = outcome.redemption;

  res.status(201).json({
    success: true,
    data: {
      redemptionId: redemption.id,
      redemptionCode: code,
      item: { title: item.title, emoji: item.emoji, pointsCost: item.pointsCost },
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes: HOLD_MINUTES,
      remainingPts: Math.round(outcome.balance * 100),
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
  // Only if it is still pending: a double tap refunded twice, and a cancel racing the cashier's confirm refunded a reward already handed over
  const cancelled = await prisma.$transaction((tx) => settlePendingRedemption(tx, redemption, 'CANCELLED', { refund: true }));
  if (!cancelled) {
    res.status(409).json({ success: false, error: 'This redemption was already used, cancelled or expired.' });
    return;
  }
  res.json({ success: true, message: 'Redemption cancelled, points refunded' });
}

// ─── Employee: get pending redemptions for a customer ─────────────────────────
// GET /catalog/pending/:qrCode  (EMPLOYEE+)
export async function getPendingRedemptionsForCustomer(req: AuthRequest, res: Response) {
  const { qrCode } = req.params;
  const customer = await prisma.user.findUnique({ where: { qrCode } });
  if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }
  if (!isCustomerAccount(customer)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }

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
  // The mobile client sends the employee's GPS-detected current store
  // (useCurrentStoreId in scan.tsx) specifically so a multi-store employee's
  // work gets attributed to wherever they're actually standing, not always
  // their first assigned store — prefer that over storeIds[0].
  const storeId = req.body.storeId || req.user!.storeIds?.[0];
  // The reward is counted at a store the cashier works at (HQ may name any store)
  if (req.body.storeId && !hasMinRole(req.user!.role, Role.SUPER_ADMIN) && !(req.user!.storeIds ?? []).includes(req.body.storeId)) {
    const all = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { allStoresAccess: true } });
    if (!all?.allStoresAccess) { res.status(403).json({ success: false, error: 'You can only hand out rewards at a store you work at.' }); return; }
  }

  const redemption = await prisma.catalogRedemption.findUnique({
    where: { id },
    include: { catalogItem: true, customer: true },
  });
  if (!redemption) { res.status(404).json({ success: false, error: 'Redemption not found' }); return; }
  if (redemption.status !== 'PENDING') {
    res.status(400).json({ success: false, error: `Redemption is ${redemption.status}` }); return;
  }
  if (redemption.catalogItem.storeId && redemption.catalogItem.storeId !== storeId) {
    // Still held: the customer can use it at that store, or cancel it in the app to get the points back
    res.status(409).json({ success: false, error: `"${redemption.catalogItem.title}" is a reward of ${await storeName(redemption.catalogItem.storeId)} only, so it cannot be handed out here.` });
    return;
  }
  if (redemption.expiresAt && redemption.expiresAt < new Date()) {
    // Expired — refund if not already done (the expiry job or a second tap may have got there first: only one of them refunds)
    await prisma.$transaction((tx) => settlePendingRedemption(tx, redemption, 'EXPIRED', { refund: true }));
    res.status(400).json({ success: false, error: 'Redemption has expired - points have been refunded' }); return;
  }

  const completed = await prisma.$transaction((tx) =>
    settlePendingRedemption(tx, redemption, 'COMPLETED', { data: { processedById: req.user!.id, storeId: storeId || null } }));
  if (!completed) {
    res.status(409).json({ success: false, error: 'This redemption was just confirmed, cancelled or expired. Scan the customer again.' });
    return;
  }

  sendPushToUser(redemption.customerId, '✅ Reward Confirmed!',
    `Your "${redemption.catalogItem.title}" has been redeemed. Enjoy!`, 'REDEMPTION', redemptionUrl(redemption.id));

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
