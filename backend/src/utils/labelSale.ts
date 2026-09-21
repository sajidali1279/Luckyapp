// A store's own price for an item (a "sale price") and when it ends. One place for the rules, so saving a price, printing, Price Check,
// the lists and the job that ends sales all agree.
//
// - A sale ends at the END of its store day (Central time), whoever is looking at the admin and wherever it is opened. The admin sends
//   the day ("2026-09-29"); the phone sends an exact instant, which is kept as sent.
// - A sale whose end has passed is over at once. It does not wait for the job that runs every 15 minutes to put the base price back:
//   every read treats it as already ended (`endedSaleView`).
// - Saving a price without mentioning the end keeps the end (correcting $1.99 to $1.79 must not turn a sale into a permanent price).
//   An explicit null clears it.

import { endOfStoreDate, isRealDateKey } from './storeTime';
import { samePrice } from './labelPrice';
import { resolveEffectivePrice } from './labelPricing';

export const SALE_END_NOT_A_DATE = 'That end date is not a real date. Pick a day on the calendar.';
export const SALE_END_PASSED = 'That end date has already passed. Pick today or a later day.';

interface StoreLabelRow {
  priceText: string | null;
  overrideExpiresAt: Date | null;
  printedAt: Date | null;
}

/** True when the store price has an end date and that end is now or earlier. */
export function saleEnded(row: { overrideExpiresAt?: Date | null } | null | undefined, now: Date = new Date()): boolean {
  return !!row?.overrideExpiresAt && row.overrideExpiresAt.getTime() <= now.getTime();
}

/**
 * The row as it stands right now. A sale that has ended reads as gone: back on the base price with no end date, and, because the shelf
 * still shows the sale price, no longer printed. The job that ends sales makes this true in the database within 15 minutes; until then
 * (or while the server sleeps) every read uses this view.
 */
export function endedSaleView<T extends StoreLabelRow>(row: T | null, now: Date = new Date()): T | null {
  if (!row || !saleEnded(row, now)) return row;
  // Its age counts from the moment the sale ended
  const endedAt = 'updatedAt' in row ? { updatedAt: row.overrideExpiresAt } : {};
  return { ...row, ...endedAt, priceText: null, overrideExpiresAt: null, printedAt: null };
}

export type SaleEnd = { ok: true; date: Date } | { ok: false; message: string };

/** The end of a sale from what a request sent: a store day ("2026-09-29", ends at the end of that day) or an instant. */
export function parseSaleEnd(input: string, now: Date = new Date()): SaleEnd {
  const text = input.trim();
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    if (!isRealDateKey(text)) return { ok: false, message: SALE_END_NOT_A_DATE };
    date = endOfStoreDate(text);
  } else {
    date = new Date(text);
    if (isNaN(date.getTime())) return { ok: false, message: SALE_END_NOT_A_DATE };
  }
  if (date.getTime() <= now.getTime()) return { ok: false, message: SALE_END_PASSED };
  return { ok: true, date };
}

export interface PricePlan {
  /** Nothing would change: the same price and the same end. */
  changed: boolean;
  /** The shelf price changes, so the label must be printed again. */
  priceChanged: boolean;
  data: { priceText: string | null; overrideExpiresAt: Date | null; printedAt?: null };
  before: { price: string | null; ends: Date | null };
  after: { price: string | null; ends: Date | null };
}

/**
 * What saving a store price would do to the row. `nextPrice` null means "use the base price". `end` is undefined to keep the current
 * end date, null to clear it, or the new end. The current row is read as it stands right now (an ended sale is already gone).
 */
export function planPriceSave(
  label: { priceText: string | null },
  row: StoreLabelRow | null,
  nextPrice: string | null,
  end: Date | null | undefined,
  now: Date = new Date(),
): PricePlan {
  const current = endedSaleView(row, now);
  const currentOverride = current?.priceText ?? null;
  const currentEnds = current?.overrideExpiresAt ?? null;

  const nextEnds = nextPrice === null ? null : end === undefined ? currentEnds : end;
  const beforeShelf = resolveEffectivePrice(label, current);
  const afterShelf = resolveEffectivePrice(label, { priceText: nextPrice });

  const sameOverride = samePrice(currentOverride, nextPrice);
  const sameEnd = (currentEnds?.getTime() ?? null) === (nextEnds?.getTime() ?? null);
  const priceChanged = !samePrice(beforeShelf, afterShelf);

  return {
    changed: !(sameOverride && sameEnd),
    priceChanged,
    data: {
      priceText: nextPrice,
      overrideExpiresAt: nextEnds,
      ...(priceChanged ? { printedAt: null } : {}),
    },
    before: { price: beforeShelf, ends: currentEnds },
    after: { price: afterShelf, ends: nextEnds },
  };
}

const DAY_TEXT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

/** "Sep 29" on the store calendar. */
export const saleDayText = (at: Date): string => DAY_TEXT.format(at);

const money = (price: string | null) => (price === null ? 'no price' : `$${price}`);

/** The Activity Log line for a store price save. */
export function describeStorePrice(productName: string, storeName: string, plan: PricePlan): string {
  const ends = plan.after.ends ? `, ends ${saleDayText(plan.after.ends)}` : '';
  if (plan.data.priceText === null) {
    return `Put "${productName}" at ${storeName} back on the base price (${money(plan.after.price)}), it was ${money(plan.before.price)}.`;
  }
  if (!plan.priceChanged) {
    return `Changed the end of the price for "${productName}" at ${storeName}: ${money(plan.after.price)}${ends || ', no end date'}.`;
  }
  return `Set the price of "${productName}" at ${storeName} to ${money(plan.after.price)} (was ${money(plan.before.price)})${ends}.`;
}
