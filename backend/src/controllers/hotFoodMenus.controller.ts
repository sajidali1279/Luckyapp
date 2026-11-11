// Hot food menus by time for HQ (2026-11-10, admin Hot Food > Menus by time): make a menu ("Breakfast" 05:00 to 10:30), change or switch
// it off, give a store its own times or leave the menu out there, and choose which catalog items are in it. The rules are in
// utils/hotFoodMenus.ts. HQ only (the routes say so).
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { daypartFields, daysOf, hoursText, TIME_RE, MAX_DAYPARTS, DaypartRow } from '../utils/hotFoodMenus';
import { daysText } from '../utils/hotFoodCombos';

/** Every menu by time with its store rows (what the app, the order check and the admin read) */
export async function loadDayparts(): Promise<DaypartRow[]> {
  return prisma.hotFoodDaypart.findMany({
    include: { stores: { select: { storeId: true, fromTime: true, toTime: true, days: true, isOff: true } } },
    orderBy: [{ sortOrder: 'asc' }, { fromTime: 'asc' }],
  }) as unknown as DaypartRow[];
}

const who = (req: AuthRequest) => ({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role });
const when = (d: { fromTime: string; toTime: string; days: number[] }) => `${hoursText(d)}${daysText(d.days) ? `, ${daysText(d.days)}` : ', every day'}`;

/** GET /hot-food/dayparts: the menus, each with its store rows and the catalog items in it */
export async function listDayparts(_req: AuthRequest, res: Response) {
  const [dayparts, items] = await Promise.all([
    loadDayparts(),
    prisma.hotFoodCatalogItem.findMany({ select: { id: true, daypartIds: true } }),
  ]);
  res.json({ success: true, data: dayparts.map((d) => ({ ...d, itemIds: items.filter((i) => i.daypartIds.includes(d.id)).map((i) => i.id) })) });
}

/** POST /hot-food/dayparts */
export async function createDaypart(req: AuthRequest, res: Response) {
  const f = daypartFields(req.body ?? {}, true);
  if ('error' in f) { res.status(400).json({ success: false, error: f.error }); return; }
  if ((await prisma.hotFoodDaypart.count()) >= MAX_DAYPARTS) { res.status(400).json({ success: false, error: `There can be up to ${MAX_DAYPARTS} menus.` }); return; }
  const d = await prisma.hotFoodDaypart.create({ data: f.data as any });
  audit({ ...who(req), action: 'HOT_FOOD_MENU_TIME_CREATED', entity: 'hot_food_daypart', entityId: d.id, details: { name: d.name, summary: `${d.name}: ${when(d)}, last call ${d.lastCallMinutes} min before the end` } });
  res.status(201).json({ success: true, data: d });
}

/** PATCH /hot-food/dayparts/:id */
export async function updateDaypart(req: AuthRequest, res: Response) {
  const before = await prisma.hotFoodDaypart.findUnique({ where: { id: req.params.id } });
  if (!before) { res.status(404).json({ success: false, error: 'That menu is not there any more.' }); return; }
  const f = daypartFields(req.body ?? {}, false);
  if ('error' in f) { res.status(400).json({ success: false, error: f.error }); return; }
  const next = { ...before, ...f.data };
  if (next.fromTime === next.toTime) { res.status(400).json({ success: false, error: 'The menu must end at a different time than it starts.' }); return; }
  const d = await prisma.hotFoodDaypart.update({ where: { id: before.id }, data: f.data });
  const changes: string[] = [];
  if (d.name !== before.name) changes.push(`name "${before.name}" to "${d.name}"`);
  if (when(d) !== when(before)) changes.push(`${when(before)} to ${when(d)}`);
  if (d.lastCallMinutes !== before.lastCallMinutes) changes.push(`last call ${before.lastCallMinutes} to ${d.lastCallMinutes} min`);
  if (d.isActive !== before.isActive) changes.push(d.isActive ? 'switched on' : 'switched off');
  if (changes.length) audit({ ...who(req), action: 'HOT_FOOD_MENU_TIME_UPDATED', entity: 'hot_food_daypart', entityId: d.id, details: { name: d.name, summary: `${d.name}: ${changes.join('; ')}` } });
  res.json({ success: true, data: d });
}

/** DELETE /hot-food/dayparts/:id: the menu goes, and its items are no longer in it (an item in no other menu is served all day) */
export async function deleteDaypart(req: AuthRequest, res: Response) {
  const d = await prisma.hotFoodDaypart.findUnique({ where: { id: req.params.id } });
  if (!d) { res.json({ success: true, changed: false }); return; }
  const items = await prisma.hotFoodCatalogItem.findMany({ where: { daypartIds: { has: d.id } }, select: { id: true, daypartIds: true } });
  await prisma.$transaction([
    ...items.map((i) => prisma.hotFoodCatalogItem.update({ where: { id: i.id }, data: { daypartIds: i.daypartIds.filter((x) => x !== d.id) } })),
    prisma.hotFoodDaypart.delete({ where: { id: d.id } }),
  ]);
  audit({ ...who(req), action: 'HOT_FOOD_MENU_TIME_DELETED', entity: 'hot_food_daypart', entityId: d.id, details: { name: d.name, summary: `${d.name} deleted (${items.length} items were in it)` } });
  res.json({ success: true, changed: true });
}

/**
 * PUT /hot-food/dayparts/:id/stores/:storeId { mode: 'chain' | 'own' | 'off', fromTime?, toTime?, days? }: the chain's times at this store
 * (the store row goes), the store's own times, or the menu left out at this store.
 */
export async function setDaypartStore(req: AuthRequest, res: Response) {
  const { id, storeId } = req.params;
  const [d, store] = await Promise.all([
    prisma.hotFoodDaypart.findUnique({ where: { id } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } }),
  ]);
  if (!d || !store) { res.status(404).json({ success: false, error: !d ? 'That menu is not there any more.' : 'That store does not exist.' }); return; }
  const mode = req.body?.mode;
  if (mode === 'chain') {
    await prisma.hotFoodDaypartStore.deleteMany({ where: { daypartId: id, storeId } });
    audit({ ...who(req), action: 'HOT_FOOD_MENU_TIME_UPDATED', entity: 'hot_food_daypart', entityId: id, details: { name: d.name, summary: `${d.name} at ${store.name}: the chain's times (${when(d)})` } });
    res.json({ success: true, data: null });
    return;
  }
  let data: { fromTime: string | null; toTime: string | null; days: number[]; isOff: boolean };
  if (mode === 'off') data = { fromTime: null, toTime: null, days: [], isOff: true };
  else if (mode === 'own') {
    const { fromTime, toTime } = req.body ?? {};
    const days = req.body?.days === undefined ? [] : daysOf(req.body.days);
    if (typeof fromTime !== 'string' || typeof toTime !== 'string' || !TIME_RE.test(fromTime) || !TIME_RE.test(toTime)) { res.status(400).json({ success: false, error: 'Give the times as hours and minutes, like 05:00 and 11:00.' }); return; }
    if (fromTime === toTime) { res.status(400).json({ success: false, error: 'The menu must end at a different time than it starts.' }); return; }
    if (!days) { res.status(400).json({ success: false, error: 'Days must be from Sunday (0) to Saturday (6).' }); return; }
    data = { fromTime, toTime, days, isOff: false };
  } else { res.status(400).json({ success: false, error: 'Choose the chain\'s times, the store\'s own times, or not at this store.' }); return; }
  const row = await prisma.hotFoodDaypartStore.upsert({ where: { daypartId_storeId: { daypartId: id, storeId } }, create: { daypartId: id, storeId, ...data }, update: data });
  audit({ ...who(req), action: 'HOT_FOOD_MENU_TIME_UPDATED', entity: 'hot_food_daypart', entityId: id,
    details: { name: d.name, summary: `${d.name} at ${store.name}: ${data.isOff ? 'not served there' : `its own times, ${when(data as any)}`}` } });
  res.json({ success: true, data: row });
}

/** PUT /hot-food/dayparts/:id/items { itemIds }: exactly these catalog items are in the menu (others taken out of it) */
export async function setDaypartItems(req: AuthRequest, res: Response) {
  const d = await prisma.hotFoodDaypart.findUnique({ where: { id: req.params.id } });
  if (!d) { res.status(404).json({ success: false, error: 'That menu is not there any more.' }); return; }
  const ids = req.body?.itemIds;
  if (!Array.isArray(ids) || ids.length > 500 || ids.some((x) => typeof x !== 'string')) { res.status(400).json({ success: false, error: 'Send the list of items.' }); return; }
  const want = new Set<string>(ids);
  const items = await prisma.hotFoodCatalogItem.findMany({ select: { id: true, name: true, daypartIds: true } });
  const unknown = [...want].filter((x) => !items.some((i) => i.id === x));
  if (unknown.length) { res.status(400).json({ success: false, error: 'One of the items is not in the catalog any more. Reload the page.' }); return; }
  const added: string[] = [], removed: string[] = [];
  const ops = [];
  for (const i of items) {
    const inIt = i.daypartIds.includes(d.id);
    if (want.has(i.id) && !inIt) { added.push(i.name); ops.push(prisma.hotFoodCatalogItem.update({ where: { id: i.id }, data: { daypartIds: [...i.daypartIds, d.id] } })); }
    if (!want.has(i.id) && inIt) { removed.push(i.name); ops.push(prisma.hotFoodCatalogItem.update({ where: { id: i.id }, data: { daypartIds: i.daypartIds.filter((x) => x !== d.id) } })); }
  }
  if (ops.length) await prisma.$transaction(ops);
  if (ops.length) audit({ ...who(req), action: 'HOT_FOOD_MENU_TIME_ITEMS', entity: 'hot_food_daypart', entityId: d.id,
    details: { name: d.name, summary: `${d.name}: ${[added.length ? `added ${added.join(', ')}` : '', removed.length ? `taken out ${removed.join(', ')}` : ''].filter(Boolean).join('; ')}` } });
  res.json({ success: true, data: { added: added.length, removed: removed.length } });
}
