import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { OfferType, ProductCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

// ─── Offers ───────────────────────────────────────────────────────────────────

const offerSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.nativeEnum(OfferType).default(OfferType.ALL_STORES),
  storeId: z.string().uuid().optional(),
  category: z.nativeEnum(ProductCategory).optional(),
  bonusRate: z.coerce.number().min(0).max(1).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function createOffer(req: AuthRequest, res: Response) {
  const parsed = offerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
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

export async function updateOffer(req: AuthRequest, res: Response) {
  const { offerId } = req.params;
  const data = req.body;

  const offer = await prisma.offer.update({
    where: { id: offerId },
    data: {
      ...data,
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
    },
  });

  res.json({ success: true, data: offer });
}

export async function deleteOffer(req: AuthRequest, res: Response) {
  await prisma.offer.update({ where: { id: req.params.offerId }, data: { isActive: false } });
  res.json({ success: true, message: 'Offer deactivated' });
}

// ─── Banners ──────────────────────────────────────────────────────────────────

export async function createBanner(req: AuthRequest, res: Response) {
  const { title, storeId, linkUrl, sortOrder } = req.body as {
    title: string; storeId?: string; linkUrl?: string; sortOrder?: number;
  };

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
      storeId: storeId || null,
      linkUrl: linkUrl || null,
      sortOrder: sortOrder ? parseInt(String(sortOrder)) : 0,
    },
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
  await prisma.banner.update({ where: { id: req.params.bannerId }, data: { isActive: false } });
  res.json({ success: true, message: 'Banner removed' });
}
