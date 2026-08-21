import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { LabelTemplate } from '@prisma/client';
import { audit } from '../utils/audit';

const createLabelSchema = z.object({
  productName: z.string().min(1).max(40),
  priceText: z.string().min(1).max(7),
  dealText: z.string().max(20).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).default(LabelTemplate.CLASSIC_RED_BLACK),
});

export async function getAllLabels(req: AuthRequest, res: Response) {
  const { storeId, unprinted } = req.query;
  const where: Record<string, unknown> = {};
  if (typeof storeId === 'string' && storeId) where.createdByStoreId = storeId;
  if (unprinted === 'true') where.printedAt = null;

  const labels = await prisma.label.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ success: true, data: labels });
}

export async function createLabel(req: AuthRequest, res: Response) {
  const parsed = createLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const storeId = req.user!.storeIds?.[0] ?? null;

  const label = await prisma.label.create({
    data: {
      ...parsed.data,
      createdByStoreId: storeId,
      createdById: req.user!.id,
    },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText, category: label.category },
    storeId,
  });

  res.status(201).json({ success: true, data: label });
}

const updateLabelSchema = z.object({
  productName: z.string().min(1).max(40).optional(),
  priceText: z.string().min(1).max(7).optional(),
  dealText: z.string().max(20).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).optional(),
});

export async function updateLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const parsed = updateLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const storeId = req.user!.storeIds?.[0] ?? null;

  const label = await prisma.label.update({
    where: { id: labelId },
    data: { ...parsed.data, printedAt: null },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText, category: label.category },
    storeId,
  });

  res.json({ success: true, data: label });
}

export async function deleteLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const deleted = await prisma.label.delete({ where: { id: labelId } });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_LABEL', entity: 'label', entityId: deleted.id,
    details: { productName: deleted.productName },
    storeId: req.user!.storeIds?.[0] ?? null,
  });

  res.json({ success: true, data: deleted });
}

const printLabelsSchema = z.object({
  items: z.array(z.object({
    labelId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999).default(1),
  })).min(1),
});

export async function markLabelsPrinted(req: AuthRequest, res: Response) {
  const parsed = printLabelsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { items } = parsed.data;
  const labelIds = items.map(i => i.labelId);
  const totalCopies = items.reduce((sum, i) => sum + i.quantity, 0);
  const storeId = req.user!.storeIds?.[0] ?? null;

  await prisma.label.updateMany({
    where: { id: { in: labelIds } },
    data: { printedAt: new Date() },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PRINT_LABEL', entity: 'label',
    details: { labelCount: labelIds.length, totalCopies, labelIds },
    storeId,
  });

  res.json({ success: true, data: { printedCount: labelIds.length, totalCopies } });
}
