// Hot food combos for HQ (2026-10-12, admin Hot Food > Combos): list them with how many were ordered, make one, change it, switch it on
// or off, take it off the featured strip, or delete it. The rules are in utils/hotFoodCombos.ts. Since 2026-10-16 a combo can hold
// more than one of the item and can have no drink: a multi-buy deal ("2 corn dogs for $3.50").
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { refuse } from '../utils/refusal';
import { audit } from '../utils/audit';
import { DRINK_CODES, comboSavingLimit } from '../utils/hotFoodCombos';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const money = (n: number) => `$${n.toFixed(2)}`;
const cents = (n: number) => Math.round(n * 100) / 100;

const comboSchema = z.object({
  name: z.string().trim().min(1, 'Give the combo a name.').max(80, 'Keep the name under 80 characters.'),
  nameEs: z.string().trim().max(80, 'Keep the Spanish name under 80 characters.').nullish(),
  description: z.string().trim().max(200, 'Keep the description under 200 characters.').nullish(),
  catalogItemId: z.string().min(1, 'Choose the hot food item.'),
  // How many of the item (2026-10-16): 2 for "2 corn dogs for $3.50". An older admin page sends none: 1, as before.
  itemQuantity: z.number({ message: 'Give how many of the item.' }).int('Give a whole number of items.').min(1, 'At least 1 of the item.').max(10, 'At most 10 of the item in one deal.').default(1),
  // None = no drink (only with 2 or more of the item, checked below)
  drinks: z.array(z.enum(DRINK_CODES as [string, ...string[]], { message: 'Choose drinks from the list.' })),
  price: z.number({ message: 'Give the combo price.' }).positive('The combo price must be more than $0.').max(500, 'The combo price can be at most $500.'),
  regularPrice: z.number().positive().max(600).nullish(),
  storeIds: z.array(z.string().min(1).max(64)).max(100).default([]),
  fromTime: z.string().regex(HHMM, 'Give the start time as HH:MM.').nullish(),
  toTime: z.string().regex(HHMM, 'Give the end time as HH:MM.').nullish(),
  isFeatured: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
const switchSchema = z.object({ isActive: z.boolean().optional(), isFeatured: z.boolean().optional() }).strict();

/** The checks across fields. A message for HQ, or null. */
async function problem(d: z.infer<typeof comboSchema>): Promise<string | null> {
  if (!!d.fromTime !== !!d.toTime) return 'Give both the start and the end time, or neither.';
  if (d.fromTime && d.fromTime === d.toTime) return 'The start and end time are the same.';
  if (d.drinks.length === 0 && d.itemQuantity < 2) return 'Choose at least one drink, or make it 2 or more of the item (like 2 for $3.50).';
  const item = await prisma.hotFoodCatalogItem.findUnique({ where: { id: d.catalogItemId }, select: { name: true, price: true } });
  if (!item) return 'That hot food item is not in the catalog any more.';
  if (cents(d.price) < item.price) return `The combo (${money(d.price)}) costs less than ${item.name} alone (${money(item.price)}).`;
  if (d.regularPrice != null) {
    if (cents(d.price) >= cents(d.regularPrice)) return 'The combo price must be below the regular price, or leave the regular price empty.';
    const limit = await comboSavingLimit();
    const lowest = Math.ceil(d.regularPrice * (1 - limit) * 100) / 100;
    if (cents(d.price) < lowest) return `Your deal limit for hot food is ${Math.round(limit * 1000) / 10}% off, so with a regular price of ${money(d.regularPrice)} the combo can be ${money(lowest)} at the lowest. Change the limit in Labels > Deals > Deal limits.`;
  }
  if (d.storeIds.length) {
    const found = await prisma.store.count({ where: { id: { in: d.storeIds } } });
    if (found !== new Set(d.storeIds).size) return 'One of the stores does not exist.';
  }
  return null;
}

const clean = (d: z.infer<typeof comboSchema>) => ({
  name: d.name, nameEs: d.nameEs || null, description: d.description || null, catalogItemId: d.catalogItemId, itemQuantity: d.itemQuantity,
  drinks: [...new Set(d.drinks)], price: cents(d.price), regularPrice: d.regularPrice != null ? cents(d.regularPrice) : null,
  storeIds: [...new Set(d.storeIds)], fromTime: d.fromTime || null, toTime: d.toTime || null, isFeatured: d.isFeatured, isActive: d.isActive,
});

/** GET /hot-food/combos: every combo, with its item and how many were ordered in the last 30 days. */
export async function listCombos(_req: AuthRequest, res: Response) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [combos, sold] = await Promise.all([
    prisma.hotFoodCombo.findMany({ include: { catalogItem: { select: { id: true, name: true, price: true, imageUrl: true } } }, orderBy: [{ isActive: 'desc' }, { isFeatured: 'desc' }, { name: 'asc' }] }),
    prisma.hotFoodOrderItem.groupBy({ by: ['comboId'], where: { comboId: { not: null }, order: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } }, _sum: { quantity: true } }),
  ]);
  const count = new Map(sold.map((s) => [s.comboId, s._sum.quantity ?? 0]));
  res.json({ success: true, data: combos.map((c) => ({ ...c, ordered30d: count.get(c.id) ?? 0 })), savingLimit: await comboSavingLimit() });
}

/** POST /hot-food/combos */
export async function createCombo(req: AuthRequest, res: Response) {
  const parsed = comboSchema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const why = await problem(parsed.data);
  if (why) { res.status(400).json({ success: false, error: why }); return; }
  const combo = await prisma.hotFoodCombo.create({ data: clean(parsed.data) });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'HOT_FOOD_COMBO_CREATE', entity: 'hot_food_combo', entityId: combo.id,
    details: { summary: `Hot food combo "${combo.name}" ${money(combo.price)}${combo.isFeatured ? ', featured' : ''}` }, storeId: null });
  res.status(201).json({ success: true, data: combo });
}

/** PATCH /hot-food/combos/:id: the whole combo, or only { isActive } / { isFeatured } (the switches on the list). */
export async function updateCombo(req: AuthRequest, res: Response) {
  const existing = await prisma.hotFoodCombo.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ success: false, error: 'That combo does not exist.' }); return; }
  const quick = switchSchema.safeParse(req.body ?? {});
  let data: Record<string, unknown>;
  if (quick.success && Object.keys(quick.data).length > 0) data = quick.data;
  else {
    const parsed = comboSchema.safeParse(req.body ?? {});
    if (!parsed.success) { refuse(res, parsed.error); return; }
    const why = await problem(parsed.data);
    if (why) { res.status(400).json({ success: false, error: why }); return; }
    data = clean(parsed.data);
  }
  const combo = await prisma.hotFoodCombo.update({ where: { id: existing.id }, data });
  const what = 'isActive' in data && Object.keys(data).length === 1 ? (data.isActive ? 'switched on' : 'switched off')
    : 'isFeatured' in data && Object.keys(data).length === 1 ? (data.isFeatured ? 'featured' : 'no longer featured') : 'changed';
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'HOT_FOOD_COMBO_UPDATE', entity: 'hot_food_combo', entityId: combo.id,
    details: { summary: `Hot food combo "${combo.name}" ${what}` }, storeId: null });
  res.json({ success: true, data: combo });
}

/** DELETE /hot-food/combos/:id (orders keep their own copy of the name and price) */
export async function deleteCombo(req: AuthRequest, res: Response) {
  const existing = await prisma.hotFoodCombo.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!existing) { res.status(404).json({ success: false, error: 'That combo does not exist.' }); return; }
  await prisma.hotFoodCombo.delete({ where: { id: existing.id } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'HOT_FOOD_COMBO_DELETE', entity: 'hot_food_combo', entityId: existing.id,
    details: { summary: `Hot food combo "${existing.name}" deleted` }, storeId: null });
  res.json({ success: true });
}
