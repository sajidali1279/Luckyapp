import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

// GET /catalog — all active items (all authenticated users)
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

// POST /catalog
export async function createCatalogItem(req: AuthRequest, res: Response) {
  const { title, description, emoji, pointsCost, sortOrder, chain } = req.body;
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
    },
  });
  res.status(201).json({ success: true, data: item });
}

// PATCH /catalog/:id
export async function updateCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { title, description, emoji, pointsCost, isActive, sortOrder, chain } = req.body;
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
    },
  });
  res.json({ success: true, data: item });
}

// DELETE /catalog/:id
export async function deleteCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.redemptionCatalogItem.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true });
}
