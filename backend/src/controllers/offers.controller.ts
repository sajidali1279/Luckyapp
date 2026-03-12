import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { OfferType, ProductCategory } from '@prisma/client';
import cloudinary from '../config/cloudinary';

// Broadcast a push notification to all customers who have tokens
async function notifyAllCustomers(title: string, body: string) {
  try {
    const tokens = await prisma.pushToken.findMany({
      where: { user: { role: 'CUSTOMER' } },
      select: { token: true },
    });
    if (tokens.length === 0) return;
    // Expo push API accepts up to 100 messages per request — chunk if needed
    const chunks: { token: string }[][] = [];
    for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));
    for (const chunk of chunks) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map(({ token }) => ({ to: token, title, body, sound: 'default' }))),
      });
    }
  } catch {
    // Non-critical — don't block the response
  }
}

// ─── Offers ───────────────────────────────────────────────────────────────────

const offerSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
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
  notifyAllCustomers(
    '🎉 New Promotion!',
    `${offer.title} — check the Lucky Stop app for details.`
  );

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
  await prisma.offer.update({ where: { id: req.params.offerId }, data: { isActive: false } });
  res.json({ success: true, message: 'Offer deactivated' });
}

// Returns all past offers (expired or inactive) for the admin reuse panel
export async function getOffersHistory(_req: AuthRequest, res: Response) {
  const now = new Date();
  const offers = await prisma.offer.findMany({
    where: { OR: [{ isActive: false }, { endDate: { lt: now } }] },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  res.json({ success: true, data: offers });
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
