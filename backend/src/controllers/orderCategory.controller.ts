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

// Manager submits a new category for DevAdmin approval
export async function submitCategory(req: AuthRequest, res: Response) {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'Category name is required' });
    return;
  }
  const normalizedName = (name as string).trim();

  // If already approved, just return it (nothing to do)
  const existing = await prisma.orderCategory.findFirst({
    where: { name: { equals: normalizedName, mode: 'insensitive' } },
  });

  if (existing?.status === 'APPROVED') {
    res.json({ success: true, data: existing, already: true });
    return;
  }

  if (!existing) {
    const cat = await prisma.orderCategory.create({
      data: { name: normalizedName, status: 'PENDING' },
    });

    // Notify all DevAdmins
    const devAdmins = await prisma.user.findMany({ where: { role: 'DEV_ADMIN', isActive: true } });
    if (devAdmins.length > 0) {
      await prisma.notification.createMany({
        data: devAdmins.map(u => ({
          userId: u.id,
          title: 'New Category Pending',
          body: `"${normalizedName}" was submitted for approval`,
          type: 'SYSTEM',
        })),
      });
    }

    res.json({ success: true, data: cat });
    return;
  }

  // Already pending/rejected — just return existing record
  res.json({ success: true, data: existing });
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

  // If name is changing, cascade the rename to every item that used the old name
  const newName = parsed.data.name;
  if (newName && newName !== cat.name) {
    await prisma.$transaction([
      prisma.orderCategory.update({ where: { id }, data }),
      prisma.orderListItem.updateMany({
        where: { category: cat.name },
        data:  { category: newName },
      }),
    ]);
  } else {
    await prisma.orderCategory.update({ where: { id }, data });
  }

  const updated = await prisma.orderCategory.findUnique({
    where: { id },
    include: { approvedBy: { select: { id: true, name: true } } },
  });
  res.json({ success: true, data: updated });
}

export async function adminDeleteCategory(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.orderCategory.delete({ where: { id } }).catch(() => {});
  res.json({ success: true });
}
