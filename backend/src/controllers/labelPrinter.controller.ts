// The label printer's fine-tune for a store: how that store's printer lays out a US Letter (Avery 5160) sheet, in mm.
// Saved per store, not per phone, because it belongs to the printer: staff print from their own phones, and someone working at two
// stores must get each store's numbers. Anyone at the store reads it (the app applies it when printing); HQ sets it on the admin
// Stores page, from what someone at the store measured with the test page.
//   down / right:   move the whole page (minus = up / left)
//   width / height: one label
//   gapX / gapY:    the space between columns and between rows (fixes labels drifting further off across or down the sheet)
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';

// The same limits the app and the admin print page use. The sheet's first label sits 12.7 mm down and 4.7625 mm in.
const PAGE = { w: 215.9, h: 279.4 };
const FIRST = { top: 12.7, left: 4.7625 };
const num = (name: string, min: number, max: number) =>
  z.number({ invalid_type_error: `${name} must be a number of millimetres.`, required_error: `${name} is missing.` }).finite()
    .min(min, `${name} can be from ${min} to ${max} mm.`).max(max, `${name} can be from ${min} to ${max} mm.`);
const layoutSchema = z.object({
  down: num('Move down', -10, 10),
  right: num('Move right', -4.5, 4.5),
  width: num('Label width', 55, 75),
  height: num('Label height', 20, 30),
  gapX: num('Space between columns', 0, 10),
  gapY: num('Space between rows', 0, 8),
}).strict();

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const SELECT = {
  id: true, name: true, labelNudgeDown: true, labelNudgeRight: true, labelWidth: true, labelHeight: true, labelGapX: true, labelGapY: true,
  labelNudgeUpdatedAt: true, labelNudgeUpdatedBy: true,
} as const;

type Row = {
  id: string; name: string; labelNudgeDown: number; labelNudgeRight: number; labelWidth: number; labelHeight: number; labelGapX: number; labelGapY: number;
  labelNudgeUpdatedAt: Date | null; labelNudgeUpdatedBy: string | null;
};
const shape = (s: Row) => ({
  storeId: s.id, storeName: s.name,
  down: s.labelNudgeDown, right: s.labelNudgeRight, width: s.labelWidth, height: s.labelHeight, gapX: s.labelGapX, gapY: s.labelGapY,
  updatedAt: s.labelNudgeUpdatedAt, updatedBy: s.labelNudgeUpdatedBy,
});

/** GET /stores/:storeId/label-printer — anyone with access to the store */
export async function getLabelPrinter(req: AuthRequest, res: Response) {
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId }, select: SELECT });
  if (!store) { res.status(404).json({ success: false, error: 'Store not found' }); return; }
  res.json({ success: true, data: shape(store) });
}

type Layout = z.infer<typeof layoutSchema>;

// The six numbers from a request, rounded to 0.001 mm, or the sentence that refuses them (a missing or odd number, or labels that would
// run off the page: 3 across and 10 down must still fit)
function checkLayout(body: unknown): { layout: Layout } | { error: string } {
  const parsed = layoutSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.code === 'unrecognized_keys' ? 'Send only: down, right, width, height, gapX, gapY (mm).' : (first?.message ?? 'Those numbers are not valid.') };
  }
  const v = Object.fromEntries(Object.entries(parsed.data).map(([k, x]) => [k, round3(x)])) as Layout;
  const across = FIRST.left + v.right + 3 * v.width + 2 * v.gapX;
  const down = FIRST.top + v.down + 10 * v.height + 9 * v.gapY;
  if (across > PAGE.w + 0.05) return { error: `The labels would run ${Math.round((across - PAGE.w) * 10) / 10} mm past the right edge of the page. Make them narrower, the space between columns smaller, or move them left.` };
  if (down > PAGE.h + 0.05) return { error: `The labels would run ${Math.round((down - PAGE.h) * 10) / 10} mm past the bottom of the page. Make them shorter, the space between rows smaller, or move them up.` };
  return { layout: v };
}

const toColumns = (v: Layout, by: string | null) => ({
  labelNudgeDown: v.down, labelNudgeRight: v.right, labelWidth: v.width, labelHeight: v.height, labelGapX: v.gapX, labelGapY: v.gapY,
  labelNudgeUpdatedAt: new Date(), labelNudgeUpdatedBy: by,
});

/** PUT /stores/:storeId/label-printer — HQ only */
export async function updateLabelPrinter(req: AuthRequest, res: Response) {
  const checked = checkLayout(req.body);
  if ('error' in checked) { res.status(400).json({ success: false, error: checked.error }); return; }
  const v = checked.layout;

  const before = await prisma.store.findUnique({ where: { id: req.params.storeId }, select: SELECT });
  if (!before) { res.status(404).json({ success: false, error: 'Store not found' }); return; }

  const store = await prisma.store.update({
    where: { id: before.id },
    data: toColumns(v, req.user!.name || null),
    select: SELECT,
  });
  const was = shape(before);
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'LABEL_PRINTER_FINE_TUNE', entity: 'store', entityId: store.id,
    details: {
      from: { down: was.down, right: was.right, width: was.width, height: was.height, gapX: was.gapX, gapY: was.gapY },
      to: v,
    },
    storeId: store.id, storeName: store.name,
  });
  res.json({ success: true, data: shape(store) });
}

/**
 * PUT /label-printer/all-stores — HQ only. The same numbers for every open store, for when HQ has found what works on its own printer
 * (on the admin print page) and wants the phones at every store to print the same way. A store can still be set on its own afterwards.
 */
export async function applyLabelPrinterToAllStores(req: AuthRequest, res: Response) {
  const checked = checkLayout(req.body);
  if ('error' in checked) { res.status(400).json({ success: false, error: checked.error }); return; }
  const v = checked.layout;
  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  if (stores.length === 0) { res.status(400).json({ success: false, error: 'There are no open stores to set.' }); return; }
  const { count } = await prisma.store.updateMany({ where: { id: { in: stores.map((s) => s.id) } }, data: toColumns(v, req.user!.name || null) });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'LABEL_PRINTER_FINE_TUNE', entity: 'store', entityId: null,
    details: { summary: `Set the label printer for all ${count} open stores: down ${v.down}, right ${v.right}, rows +${v.gapY}, columns ${v.gapX}, labels ${v.width} x ${v.height} mm.`, to: v, stores: count, storeNames: stores.map((s) => s.name) },
    storeId: null,
  });
  res.json({ success: true, data: { stores: count, layout: v } });
}
