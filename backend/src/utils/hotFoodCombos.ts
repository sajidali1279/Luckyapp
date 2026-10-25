// Hot food combos (2026-10-12): HQ puts a catalog item together with a drink the customer chooses (fountain, a 20oz bottle, a 12oz can,
// coffee, water) for one price. Featured combos lead the app's hot food menu. A combo is on at a store when the store has its item on
// (and, when HQ chose stores, it is one of them), inside its hours (store time) when it has hours. "Save $X" comes from the regular
// price HQ gives, and the saving stays within the deal limit for hot food (Labels > Deals > Deal limits).
// Multi-buy deals (2026-10-16): a combo can hold more than one of the item (itemQuantity, "2 corn dogs for $3.50") and can come with no
// drink. A combo with no drink is only shown to apps that ask for it (?deals=1): an older app would open a drink choice with nothing in it.
import prisma from '../config/prisma';
import { storeMinutes, storeWeekday } from './storeTime';
import { loadDealLimits } from './dealLimits';
import { limitFor } from './dealSuggest';
import { feature } from './appSettings';

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

/**
 * Whether the combo is on at this moment: its days (none: every day) and its hours (none: all day). Hours can run past midnight
 * (22:00 to 02:00): the part after midnight belongs to the day it started on, as a promotion's happy hours do (utils/offerHours.ts).
 */
export function comboOpenAt(c: { fromTime: string | null; toTime: string | null; days?: number[] | null }, at: Date): boolean {
  const days = c.days && c.days.length > 0 && c.days.length < 7 ? c.days : null;
  const dayOk = (d: number) => !days || days.includes(d);
  const today = storeWeekday(at);
  if (!c.fromTime || !c.toTime) return dayOk(today);
  const m = storeMinutes(at), from = minutesOf(c.fromTime), to = minutesOf(c.toTime);
  if (from <= to) return m >= from && m < to && dayOk(today);
  if (m >= from) return dayOk(today);
  if (m < to) return dayOk((today + 6) % 7);
  return false;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Tuesdays" / "Fri, Sat" / null for every day (HQ's Activity Log) */
export function daysText(days: number[] | null | undefined): string | null {
  if (!days || days.length === 0 || days.length === 7) return null;
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.length === 1 ? `${DAY_NAMES[sorted[0]]}s` : sorted.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ');
}

/** The order line's name: what the store makes and which drink to hand over ("Corn dogs 2 for $3.50 (2x Corn Dog)"). */
export function comboLineName(comboName: string, drink: string | null, itemQuantity = 1, itemName = ''): string {
  const what = itemQuantity > 1 ? `${itemQuantity}x ${itemName}`.trim() : 'combo';
  return drink ? `${comboName} (${what}, ${DRINKS[drink] ?? drink})` : `${comboName} (${what})`;
}

type ComboRow = {
  id: string; name: string; nameEs: string | null; description: string | null; itemQuantity: number; drinks: string[]; price: number; regularPrice: number | null;
  storeIds: string[]; fromTime: string | null; toTime: string | null; days: number[]; isFeatured: boolean; isActive: boolean;
  catalogItem: { id: string; name: string; imageUrl: string | null; estimatedMinutes: number | null };
};

/** The combos a customer can order at this store right now: active, the store's item on, the store chosen (or all), within hours.
 * withoutDrink: also the ones with no drink (an app that knows them asked, or the order check, which takes whatever the app sent). */
export async function combosAt(storeId: string, now: Date = new Date(), withoutDrink = false): Promise<ComboRow[]> {
  if (!feature('hotFoodCombos')) return [];   // switched off in Settings
  const [combos, onHere] = await Promise.all([
    prisma.hotFoodCombo.findMany({
      where: { isActive: true },
      include: { catalogItem: { select: { id: true, name: true, imageUrl: true, estimatedMinutes: true } } },
      orderBy: [{ isFeatured: 'desc' }, { price: 'asc' }],
    }),
    prisma.hotFoodCatalogStore.findMany({ where: { storeId, isAvailable: true }, select: { catalogItemId: true } }),
  ]);
  const items = new Set(onHere.map((r) => r.catalogItemId));
  return (combos as ComboRow[]).filter((c) => items.has(c.catalogItem.id) && (c.storeIds.length === 0 || c.storeIds.includes(storeId)) && comboOpenAt(c, now) && (withoutDrink || c.drinks.length > 0));
}

/** The largest saving a combo may give, as a share of its regular price: the deal limit for hot food (the default limit). */
export async function comboSavingLimit(): Promise<number> {
  const limits = await loadDealLimits();
  return limitFor(limits, null) ?? 0.08;
}
