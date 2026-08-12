import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { LabelTemplate } from '@prisma/client';
import { audit } from '../utils/audit';

const createLabelSchema = z.object({
  productName: z.string().min(1).max(120),
  priceText: z.string().min(1).max(40),
  barcode: z.string().max(40).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).default(LabelTemplate.CLASSIC_RED_BLACK),
});

export async function getAllLabels(req: AuthRequest, res: Response) {
  const labels = await prisma.label.findMany({
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

  const label = await prisma.label.create({ data: parsed.data });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText },
  });

  res.status(201).json({ success: true, data: label });
}

const updateLabelSchema = z.object({
  productName: z.string().min(1).max(120).optional(),
  priceText: z.string().min(1).max(40).optional(),
  barcode: z.string().max(40).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).optional(),
});

export async function updateLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const parsed = updateLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const label = await prisma.label.update({
    where: { id: labelId },
    data: parsed.data,
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText },
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
  });

  res.json({ success: true, data: deleted });
}
