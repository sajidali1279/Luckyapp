// Hot food combos (2026-10-12): HQ puts a catalog item together with a drink the customer chooses (fountain, a 20oz bottle, a 12oz can,
// coffee, water) for one price. Featured combos lead the app's hot food menu. A combo is on at a store when the store has its item on
// (and, when HQ chose stores, it is one of them), inside its hours (store time) when it has hours. "Save $X" comes from the regular
// price HQ gives, and the saving stays within the deal limit for hot food (Labels > Deals > Deal limits).
import prisma from '../config/prisma';
import { storeMinutes } from './storeTime';
import { loadDealLimits } from './dealLimits';
import { limitFor } from './dealSuggest';

/** The drinks a combo can come with. The English name goes on the order the store sees; the app shows its own words. */
export const DRINKS: Record<string, string> = {
  FOUNTAIN: 'Fountain drink',
  BOTTLE_20: '20oz bottle',
  CAN_12: '12oz can',
  COFFEE: 'Coffee',
  WATER: 'Bottled water',
};
export const DRINK_CODES = Object.keys(DRINKS);

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether the combo's hours include this moment (no hours: always). Hours can run past midnight (22:00 to 02:00). */
export function comboOpenAt(c: { fromTime: string | null; toTime: string | null }, at: Date): boolean {
  if (!c.fromTime || !c.toTime) return true;
  const m = storeMinutes(at), from = minutesOf(c.fromTime), to = minutesOf(c.toTime);
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/** The order line's name: what the store makes and which drink to hand over. */
export const comboLineName = (comboName: string, drink: string) => `${comboName} (combo, ${DRINKS[drink] ?? drink})`;

type ComboRow = {
  id: string; name: string; nameEs: string | null; description: string | null; drinks: string[]; price: number; regularPrice: number | null;
  storeIds: string[]; fromTime: string | null; toTime: string | null; isFeatured: boolean; isActive: boolean;
  catalogItem: { id: string; name: string; imageUrl: string | null; estimatedMinutes: number | null };
};

/** The combos a customer can order at this store right now: active, the store's item on, the store chosen (or all), within hours. */
export async function combosAt(storeId: string, now: Date = new Date()): Promise<ComboRow[]> {
  const [combos, onHere] = await Promise.all([
    prisma.hotFoodCombo.findMany({
      where: { isActive: true },
      include: { catalogItem: { select: { id: true, name: true, imageUrl: true, estimatedMinutes: true } } },
      orderBy: [{ isFeatured: 'desc' }, { price: 'asc' }],
    }),
    prisma.hotFoodCatalogStore.findMany({ where: { storeId, isAvailable: true }, select: { catalogItemId: true } }),
  ]);
  const items = new Set(onHere.map((r) => r.catalogItemId));
  return (combos as ComboRow[]).filter((c) => items.has(c.catalogItem.id) && (c.storeIds.length === 0 || c.storeIds.includes(storeId)) && comboOpenAt(c, now) && c.drinks.length > 0);
}

/** The largest saving a combo may give, as a share of its regular price: the deal limit for hot food (the default limit). */
export async function comboSavingLimit(): Promise<number> {
  const limits = await loadDealLimits();
  return limitFor(limits, null) ?? 0.08;
}
