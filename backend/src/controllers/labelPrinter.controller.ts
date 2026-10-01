// The label printer's fine-tune for a store: how far that store's printer places a US Letter (Avery 5160) sheet off, in mm.
// Saved per store, not per phone, because the offset belongs to the printer: staff print from their own phones, and someone working
// at two stores must get each store's correction. Anyone at the store reads it (the app applies it when printing); a manager of the
// store, or HQ, sets it from the test page.
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';

// Kept inside the sheet's margins (1/2 in top and bottom, 3/16 in sides), the same limits the app and the admin print page use
const nudgeSchema = z.object({
  down: z.number().finite().min(-10, 'Move down can be at most 10 mm up (-10).').max(10, 'Move down can be at most 10 mm.'),
  right: z.number().finite().min(-4.5, 'Move right can be at most 4.5 mm left (-4.5).').max(4.5, 'Move right can be at most 4.5 mm.'),
}).strict();

const round1 = (n: number) => Math.round(n * 10) / 10;
const SELECT = { id: true, name: true, labelNudgeDown: true, labelNudgeRight: true, labelNudgeUpdatedAt: true, labelNudgeUpdatedBy: true } as const;

type Row = { id: string; name: string; labelNudgeDown: number; labelNudgeRight: number; labelNudgeUpdatedAt: Date | null; labelNudgeUpdatedBy: string | null };
const shape = (s: Row) => ({
  storeId: s.id, storeName: s.name, down: s.labelNudgeDown, right: s.labelNudgeRight, updatedAt: s.labelNudgeUpdatedAt, updatedBy: s.labelNudgeUpdatedBy,
});

/** GET /stores/:storeId/label-printer — anyone with access to the store */
export async function getLabelPrinter(req: AuthRequest, res: Response) {
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId }, select: SELECT });
  if (!store) { res.status(404).json({ success: false, error: 'Store not found' }); return; }
  res.json({ success: true, data: shape(store) });
}

/** PUT /stores/:storeId/label-printer — a manager of the store, or HQ */
export async function updateLabelPrinter(req: AuthRequest, res: Response) {
  const parsed = nudgeSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ success: false, error: first?.code === 'invalid_type' || first?.code === 'unrecognized_keys' ? 'Send the move as two numbers in mm: down and right.' : first?.message });
    return;
  }
  const before = await prisma.store.findUnique({ where: { id: req.params.storeId }, select: SELECT });
  if (!before) { res.status(404).json({ success: false, error: 'Store not found' }); return; }

  const down = round1(parsed.data.down), right = round1(parsed.data.right);
  const store = await prisma.store.update({
    where: { id: before.id },
    data: { labelNudgeDown: down, labelNudgeRight: right, labelNudgeUpdatedAt: new Date(), labelNudgeUpdatedBy: req.user!.name || null },
    select: SELECT,
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'LABEL_PRINTER_FINE_TUNE', entity: 'store', entityId: store.id,
    details: { from: { down: before.labelNudgeDown, right: before.labelNudgeRight }, to: { down, right } },
    storeId: store.id, storeName: store.name,
  });
  res.json({ success: true, data: shape(store) });
}
