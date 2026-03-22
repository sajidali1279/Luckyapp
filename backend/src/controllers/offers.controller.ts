import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { OfferType, ProductCategory, Role } from '@prisma/client';
import cloudinary from '../config/cloudinary';
import { audit } from '../utils/audit';
import { broadcastToCustomers } from '../utils/push';

// ─── Offers ───────────────────────────────────────────────────────────────────

const offerSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  type: z.nativeEnum(OfferType).default(OfferType.ALL_STORES),
  storeId: z.string().uuid().optional(),
  category: z.nativeEnum(ProductCategory).optional(),
  bonusRate: z.coerce.number().min(0).max(1).optional(),
  dealText: z.string().min(1).max(40).optional(), // e.g. "2 for $5"
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function createOffer(req: AuthRequest, res: Response) {
  const parsed = offerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const isManager = req.user!.role === Role.STORE_MANAGER;
  const managerStoreId = req.user!.storeIds?.[0];

  // Store managers can only create store-specific offers for their store
  if (isManager) {
    if (!managerStoreId) {
      res.status(403).json({ success: false, error: 'No store assigned to your account' });
      return;
    }
    parsed.data.type = OfferType.SPECIFIC_STORE;
    parsed.data.storeId = managerStoreId;
  }

  let imageUrl: string | undefined;
  if (req.file) {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'luckystop/offers', resource_type: 'image' },
        (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
      ).end(req.file!.buffer);
    });
    imageUrl = result.secure_url;
  }

  const offer = await prisma.offer.create({
    data: { ...parsed.data, imageUrl, startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate) },
  });

  // Notify all customers about the new promotion (fire-and-forget)
  broadcastToCustomers('🎉 New Promotion!', `${offer.title} — check the Lucky Stop app for details.`);

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_OFFER', entity: 'offer', entityId: offer.id,
    details: { title: offer.title, type: offer.type, bonusRate: offer.bonusRate, dealText: offer.dealText },
    storeId: offer.storeId,
  });

  res.status(201).json({ success: true, data: offer });
}

export async function getActiveOffers(req: AuthRequest, res: Response) {
  const { storeId } = req.query as { storeId?: string };
  const now = new Date();

  const offers = await prisma.offer.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [
        { type: OfferType.ALL_STORES },
        ...(storeId ? [{ storeId }] : []),
      ],
    },
    orderBy: { startDate: 'desc' },
  });

  res.json({ success: true, data: offers });
}

const updateOfferSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: z.nativeEnum(OfferType).optional(),
  storeId: z.string().uuid().nullable().optional(),
  category: z.nativeEnum(ProductCategory).nullable().optional(),
  bonusRate: z.coerce.number().min(0).max(1).nullable().optional(),
  dealText: z.string().min(1).max(40).nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
}).refine(d => {
  if (d.startDate && d.endDate) return new Date(d.startDate) < new Date(d.endDate);
  return true;
}, { message: 'startDate must be before endDate' });

export async function updateOffer(req: AuthRequest, res: Response) {
  const { offerId } = req.params;

  const parsed = updateOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  // Store managers can only edit offers belonging to their store
  if (req.user!.role === Role.STORE_MANAGER) {
    const existing = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!existing || existing.storeId !== req.user!.storeIds?.[0]) {
      res.status(403).json({ success: false, error: 'You can only edit offers for your store' });
      return;
    }
    // Cannot change type or storeId
    delete parsed.data.type;
    delete parsed.data.storeId;
  }

  const { startDate, endDate, ...rest } = parsed.data;
  const offer = await prisma.offer.update({
    where: { id: offerId },
    data: {
      ...rest,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
    },
  });

  res.json({ success: true, data: offer });
}

export async function deleteOffer(req: AuthRequest, res: Response) {
  if (req.user!.role === Role.STORE_MANAGER) {
    const existing = await prisma.offer.findUnique({ where: { id: req.params.offerId } });
    if (!existing || existing.storeId !== req.user!.storeIds?.[0]) {
      res.status(403).json({ success: false, error: 'You can only delete offers for your store' });
      return;
    }
  }
  const deleted = await prisma.offer.update({
    where: { id: req.params.offerId }, data: { isActive: false },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_OFFER', entity: 'offer', entityId: deleted.id,
    details: { title: deleted.title, type: deleted.type },
    storeId: deleted.storeId,
  });
  res.json({ success: true, message: 'Offer deactivated' });
}

// Returns all past offers (expired or inactive) for the admin reuse panel
export async function getOffersHistory(req: AuthRequest, res: Response) {
  const now = new Date();
  const storeFilter = req.user!.role === Role.STORE_MANAGER
    ? { storeId: req.user!.storeIds?.[0] }
    : {};
  const offers = await prisma.offer.findMany({
    where: { ...storeFilter, OR: [{ isActive: false }, { endDate: { lt: now } }] },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  res.json({ success: true, data: offers });
}

// ─── Banners ──────────────────────────────────────────────────────────────────

export async function createBanner(req: AuthRequest, res: Response) {
  const { title, linkUrl, sortOrder } = req.body as {
    title: string; storeId?: string; linkUrl?: string; sortOrder?: number;
  };

  // Store managers always target their own store
  const storeId = req.user!.role === Role.STORE_MANAGER
    ? req.user!.storeIds?.[0] || null
    : (req.body.storeId || null);

  if (req.user!.role === Role.STORE_MANAGER && !storeId) {
    res.status(403).json({ success: false, error: 'No store assigned to your account' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'Banner image required' });
    return;
  }

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'luckystop/banners', resource_type: 'image' },
      (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
    ).end(req.file!.buffer);
  });

  const banner = await prisma.banner.create({
    data: {
      title,
      imageUrl: result.secure_url,
      storeId,
      linkUrl: linkUrl || null,
      sortOrder: sortOrder ? parseInt(String(sortOrder)) : 0,
    },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_BANNER', entity: 'banner', entityId: banner.id,
    details: { title: banner.title },
    storeId: banner.storeId,
  });
  res.status(201).json({ success: true, data: banner });
}

export async function getActiveBanners(req: AuthRequest, res: Response) {
  const { storeId } = req.query as { storeId?: string };

  const banners = await prisma.banner.findMany({
    where: {
      isActive: true,
      OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])],
    },
    orderBy: { sortOrder: 'asc' },
  });

  res.json({ success: true, data: banners });
}

export async function deleteBanner(req: AuthRequest, res: Response) {
  if (req.user!.role === Role.STORE_MANAGER) {
    const existing = await prisma.banner.findUnique({ where: { id: req.params.bannerId } });
    if (!existing || existing.storeId !== req.user!.storeIds?.[0]) {
      res.status(403).json({ success: false, error: 'You can only delete banners for your store' });
      return;
    }
  }
  const deletedBanner = await prisma.banner.update({
    where: { id: req.params.bannerId }, data: { isActive: false },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_BANNER', entity: 'banner', entityId: deletedBanner.id,
    details: { title: deletedBanner.title },
    storeId: deletedBanner.storeId,
  });
  res.json({ success: true, message: 'Banner removed' });
}
