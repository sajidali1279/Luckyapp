import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ProductCategory } from '@prisma/client';

const VALID_CATEGORIES = Object.values(ProductCategory);

// GET /stores/:storeId/keyword-mappings  (SuperAdmin+)
export async function getMappings(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const mappings = await prisma.storeKeywordMapping.findMany({
    where: { storeId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ success: true, data: mappings });
}

// POST /stores/:storeId/keyword-mappings  (SuperAdmin+)
export async function addMapping(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { keyword, category } = req.body as { keyword: string; category: string };

  if (!keyword?.trim()) {
    res.status(400).json({ success: false, error: 'keyword is required' }); return;
  }
  if (!VALID_CATEGORIES.includes(category as ProductCategory)) {
    res.status(400).json({ success: false, error: 'Invalid category' }); return;
  }

  const mapping = await prisma.storeKeywordMapping.upsert({
    where: { storeId_keyword: { storeId, keyword: keyword.trim().toLowerCase() } },
    create: { storeId, keyword: keyword.trim().toLowerCase(), category: category as ProductCategory },
    update: { category: category as ProductCategory },
  });
  res.json({ success: true, data: mapping });
}

// DELETE /stores/:storeId/keyword-mappings/:id  (SuperAdmin+)
export async function deleteMapping(req: AuthRequest, res: Response) {
  const { storeId, id } = req.params;
  await prisma.storeKeywordMapping.deleteMany({ where: { id, storeId } });
  res.json({ success: true });
}

// GET /stores/my-keyword-mappings  (Printer agent — store API key auth)
export async function getMyMappings(req: AuthRequest, res: Response) {
  const apiKey = req.headers['x-store-api-key'] as string;
  if (!apiKey) {
    res.status(401).json({ success: false, error: 'Missing X-Store-API-Key' }); return;
  }

  const store = await prisma.store.findUnique({ where: { apiKey } });
  if (!store) {
    res.status(401).json({ success: false, error: 'Invalid API key' }); return;
  }

  const mappings = await prisma.storeKeywordMapping.findMany({
    where: { storeId: store.id },
    select: { keyword: true, category: true },
  });
  res.json({ success: true, data: mappings });
}
