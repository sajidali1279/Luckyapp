// Hot food "Store menus" grid (2026-10-20). HQ sets, for every catalog item and every store, whether the store CARRIES it (a
// HotFoodCatalogStore row: it is on that store's menu) and whether it is IN STOCK today (that row's isAvailable: the app hides a sold-out
// item). Before, carrying was set one item at a time in a pop-up and in-stock only from the phone app, which was slow with many items
// and 12 different menus. GET returns the whole grid; POST applies many changes at once, in one database transaction and one log entry.
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { orderCategories } from '../utils/hotFoodCategories';

export const MAX_GRID_CHANGES = 3000;

/** GET /hot-food/menu-grid (HQ): every catalog item, every open store, and which stores carry which item (and whether it is in stock). */
export async function getMenuGrid(_req: AuthRequest, res: Response) {
  const [items, stores, links] = await Promise.all([
    prisma.hotFoodCatalogItem.findMany({ select: { id: true, name: true, category: true, price: true, imageUrl: true }, orderBy: [{ name: 'asc' }] }),
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, city: true, hotFoodEnabled: true }, orderBy: [{ name: 'asc' }] }),
    prisma.hotFoodCatalogStore.findMany({ select: { catalogItemId: true, storeId: true, isAvailable: true } }),
  ]);
  const cells: Record<string, Record<string, boolean>> = {};
  for (const l of links) (cells[l.catalogItemId] ??= {})[l.storeId] = l.isAvailable;
  res.json({ success: true, data: { items, stores, cells, categories: orderCategories(items.map((i) => i.category)) } });
}

const changeSchema = z.object({
  itemId: z.string().uuid(),
  storeId: z.string().uuid(),
  carried: z.boolean().optional(),     // true: put it on that store's menu; false: take it off
  available: z.boolean().optional(),   // in stock (true) or sold out (false) at that store
}).refine((c) => c.carried !== undefined || c.available !== undefined, { message: 'Each change needs carried or available.' });
const bodySchema = z.object({ changes: z.array(changeSchema).min(1, 'Nothing to change.').max(MAX_GRID_CHANGES, `At most ${MAX_GRID_CHANGES} changes at once.`) });

/**
 * POST /hot-food/menu-grid (HQ) { changes: [{ itemId, storeId, carried?, available? }] }: applied together or not at all.
 *   carried true  -> on the store's menu (in stock unless `available` says otherwise); already there: only `available` is applied
 *   carried false -> off the store's menu
 *   available only -> in stock / sold out; ignored (counted as skipped) where the store does not carry the item
 * Returns how many were added, removed and switched, and how many were skipped.
 */
export async function applyMenuGrid(req: AuthRequest, res: Response) {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Check the changes.' }); return; }

  // one change per item and store: the last one wins
  const byPair = new Map<string, z.infer<typeof changeSchema>>();
  for (const c of parsed.data.changes) byPair.set(`${c.itemId}|${c.storeId}`, c);
  const changes = [...byPair.values()];
  const itemIds = [...new Set(changes.map((c) => c.itemId))], storeIds = [...new Set(changes.map((c) => c.storeId))];

  const [items, stores, existing] = await Promise.all([
    prisma.hotFoodCatalogItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } }),
    prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }),
    prisma.hotFoodCatalogStore.findMany({ where: { catalogItemId: { in: itemIds }, storeId: { in: storeIds } }, select: { catalogItemId: true, storeId: true, isAvailable: true } }),
  ]);
  if (items.length !== itemIds.length) { res.status(400).json({ success: false, error: 'One of the items no longer exists. Reload the page.' }); return; }
  if (stores.length !== storeIds.length) { res.status(400).json({ success: false, error: 'One of the stores no longer exists. Reload the page.' }); return; }
  const have = new Map(existing.map((e) => [`${e.catalogItemId}|${e.storeId}`, e.isAvailable]));

  const toAdd: { catalogItemId: string; storeId: string; isAvailable: boolean }[] = [];
  const toRemove: { catalogItemId: string; storeId: string }[] = [];
  const toSet: { on: { catalogItemId: string; storeId: string }[]; off: { catalogItemId: string; storeId: string }[] } = { on: [], off: [] };
  let skipped = 0;
  for (const c of changes) {
    const key = `${c.itemId}|${c.storeId}`, pair = { catalogItemId: c.itemId, storeId: c.storeId };
    const isThere = have.has(key);
    if (c.carried === false) { if (isThere) toRemove.push(pair); else skipped++; continue; }
    if (!isThere) {
      if (c.carried === true) toAdd.push({ ...pair, isAvailable: c.available ?? true }); else skipped++;
      continue;
    }
    if (c.available !== undefined && have.get(key) !== c.available) (c.available ? toSet.on : toSet.off).push(pair); else skipped++;
  }
  const switched = toSet.on.length + toSet.off.length;
  if (toAdd.length + toRemove.length + switched === 0) { res.json({ success: true, data: { added: 0, removed: 0, switched: 0, skipped } }); return; }

  await prisma.$transaction([
    ...(toAdd.length ? [prisma.hotFoodCatalogStore.createMany({ data: toAdd, skipDuplicates: true })] : []),
    ...(toRemove.length ? [prisma.hotFoodCatalogStore.deleteMany({ where: { OR: toRemove } })] : []),
    ...(toSet.on.length ? [prisma.hotFoodCatalogStore.updateMany({ where: { OR: toSet.on }, data: { isAvailable: true } })] : []),
    ...(toSet.off.length ? [prisma.hotFoodCatalogStore.updateMany({ where: { OR: toSet.off }, data: { isAvailable: false } })] : []),
  ]);

  const names = (ids: Set<string>) => stores.filter((s) => ids.has(s.id)).map((s) => s.name);
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'HOT_FOOD_MENU_GRID', entity: 'hot_food_menu',
    details: { added: toAdd.length, removed: toRemove.length, switched, skipped, items: itemIds.length, stores: names(new Set(storeIds)) }, storeId: null });
  res.json({ success: true, data: { added: toAdd.length, removed: toRemove.length, switched, skipped } });
}
