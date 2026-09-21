import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ProductCategory } from '@prisma/client';
import { getStoreByApiKey } from '../utils/storeApiKey';
import { audit } from '../utils/audit';

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

  const word = typeof keyword === 'string' ? keyword.trim().toLowerCase() : '';
  if (!word) { res.status(400).json({ success: false, error: 'Enter the word to look for on the receipt.' }); return; }
  // A keyword matches part of a receipt line, so a one- or two-letter word would put almost every line into one category
  if (word.length < 3) { res.status(400).json({ success: false, error: 'A keyword needs at least three characters, because it matches part of a receipt line ("a" would match almost every line).' }); return; }
  if (word.length > 40) { res.status(400).json({ success: false, error: 'The keyword is too long (40 characters at most).' }); return; }
  if (!VALID_CATEGORIES.includes(category as ProductCategory)) {
    res.status(400).json({ success: false, error: 'Choose one of the product categories.' }); return;
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }
  const mapping = await prisma.storeKeywordMapping.upsert({
    where: { storeId_keyword: { storeId, keyword: word } },
    create: { storeId, keyword: word, category: category as ProductCategory },
    update: { category: category as ProductCategory },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'ADD_KEYWORD_MAPPING', entity: 'store', entityId: storeId,
    details: { summary: `${store.name}: receipt keyword "${word}" counts as ${String(category).replace(/_/g, ' ').toLowerCase()}` },
    storeId, storeName: store.name,
  });
  res.json({ success: true, data: mapping });
}

// DELETE /stores/:storeId/keyword-mappings/:id  (SuperAdmin+)
export async function deleteMapping(req: AuthRequest, res: Response) {
  const { storeId, id } = req.params;
  const mapping = await prisma.storeKeywordMapping.findFirst({ where: { id, storeId }, select: { keyword: true } });
  if (!mapping) { res.status(404).json({ success: false, error: 'That keyword was already removed.' }); return; }
  await prisma.storeKeywordMapping.deleteMany({ where: { id, storeId } });
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_KEYWORD_MAPPING', entity: 'store', entityId: storeId,
    details: { summary: `${store?.name ?? 'Store'}: receipt keyword "${mapping.keyword}" removed` },
    storeId, storeName: store?.name ?? null,
  });
  res.json({ success: true });
}

// GET /stores/my-keyword-mappings  (Printer agent — store API key auth)
export async function getMyMappings(req: AuthRequest, res: Response) {
  const apiKey = req.headers['x-store-api-key'] as string;
  if (!apiKey) {
    res.status(401).json({ success: false, error: 'Missing X-Store-API-Key' }); return;
  }

  const store = await getStoreByApiKey(apiKey);
  if (!store) {
    res.status(401).json({ success: false, error: 'Invalid API key' }); return;
  }

  const mappings = await prisma.storeKeywordMapping.findMany({
    where: { storeId: store.id },
    select: { keyword: true, category: true },
  });
  res.json({ success: true, data: mappings });
}
