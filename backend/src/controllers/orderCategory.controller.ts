import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

export async function getCategories(_req: AuthRequest, res: Response) {
  const cats = await prisma.orderCategory.findMany({
    where: { status: 'APPROVED', storeId: null },
    orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
    select: { name: true },
  });
  res.json({ success: true, data: cats.map(c => c.name) });
}

export async function adminGetCategories(req: AuthRequest, res: Response) {
  const { status } = req.query;
  const where: Record<string, unknown> = {};
  if (status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED') where.status = status;
  const cats = await prisma.orderCategory.findMany({
    where, orderBy: [{ status: 'asc' }, { usageCount: 'desc' }, { name: 'asc' }],
    include: { approvedBy: { select: { id: true, name: true } } },
  });
  res.json({ success: true, data: cats });
}

const patchSchema = z.object({
  name:   z.string().min(1).max(80).optional(),
  status: z.enum(['APPROVED', 'REJECTED']).optional(),
});

export async function adminUpdateCategory(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  const cat = await prisma.orderCategory.findUnique({ where: { id } });
  if (!cat) { res.status(404).json({ success: false, error: 'Category not found' }); return; }
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === 'APPROVED' && cat.status !== 'APPROVED') {
    data.approvedById = req.user!.id;
    data.approvedAt   = new Date();
  }
  const updated = await prisma.orderCategory.update({ where: { id }, data });
  res.json({ success: true, data: updated });
}

export async function adminDeleteCategory(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.orderCategory.delete({ where: { id } }).catch(() => {});
  res.json({ success: true });
}
