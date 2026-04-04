import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

// POST /promotions/request — customer submits a promotion request
export async function submitPromotionRequest(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const { requesterName, requesterPhone, businessName, businessDescription, website } = req.body;

  if (!requesterName || !requesterPhone || !businessName || !businessDescription) {
    res.status(400).json({ success: false, error: 'requesterName, requesterPhone, businessName, and businessDescription are required' });
    return;
  }

  // One pending/approved request per user at a time
  const existing = await prisma.businessPromotion.findFirst({
    where: { requesterId: userId, status: { in: ['PENDING', 'APPROVED'] } },
  });
  if (existing) {
    res.status(409).json({ success: false, error: 'You already have an active promotion request. Contact support to update it.' });
    return;
  }

  const promo = await prisma.businessPromotion.create({
    data: {
      requesterId: userId,
      requesterName: requesterName.trim(),
      requesterPhone: requesterPhone.trim(),
      businessName: businessName.trim(),
      businessDescription: businessDescription.trim(),
      website: website?.trim() || null,
    },
  });

  res.status(201).json({ success: true, data: promo });
}

// GET /promotions — published ads visible to all customers
export async function getPublishedPromotions(_req: AuthRequest, res: Response) {
  const now = new Date();
  const promos = await prisma.businessPromotion.findMany({
    where: {
      status: 'APPROVED',
      OR: [
        { adExpiresAt: null },
        { adExpiresAt: { gt: now } },
      ],
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      businessName: true,
      adTitle: true,
      adBody: true,
      adImageUrl: true,
      website: true,
      publishedAt: true,
      adExpiresAt: true,
    },
  });
  res.json({ success: true, data: promos });
}

// GET /promotions/my — customer checks their own request status
export async function getMyPromotionRequest(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const promo = await prisma.businessPromotion.findFirst({
    where: { requesterId: userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: promo || null });
}

// GET /promotions/requests — DevAdmin sees all requests
export async function getAllPromotionRequests(req: AuthRequest, res: Response) {
  const { status } = req.query;
  const promos = await prisma.businessPromotion.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      requester: { select: { id: true, name: true, phone: true } },
    },
  });
  res.json({ success: true, data: promos });
}

// POST /promotions/:id/publish — DevAdmin approves and publishes an ad
export async function publishPromotion(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { adTitle, adBody, adImageUrl, adExpiresAt, devAdminNote } = req.body;

  if (!adTitle || !adBody) {
    res.status(400).json({ success: false, error: 'adTitle and adBody are required to publish' });
    return;
  }

  const promo = await prisma.businessPromotion.update({
    where: { id },
    data: {
      status: 'APPROVED',
      adTitle: adTitle.trim(),
      adBody: adBody.trim(),
      adImageUrl: adImageUrl?.trim() || null,
      adExpiresAt: adExpiresAt ? new Date(adExpiresAt) : null,
      devAdminNote: devAdminNote?.trim() || null,
      publishedAt: new Date(),
    },
  });
  res.json({ success: true, data: promo });
}

// PATCH /promotions/:id/reject — DevAdmin rejects a request
export async function rejectPromotion(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { devAdminNote } = req.body;

  const promo = await prisma.businessPromotion.update({
    where: { id },
    data: {
      status: 'REJECTED',
      devAdminNote: devAdminNote?.trim() || null,
    },
  });
  res.json({ success: true, data: promo });
}

// DELETE /promotions/:id — DevAdmin deletes a promotion
export async function deletePromotion(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.businessPromotion.delete({ where: { id } });
  res.json({ success: true });
}
