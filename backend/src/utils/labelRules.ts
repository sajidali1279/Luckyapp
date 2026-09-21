// Who may change the chain-wide catalog, and what a change to it did. The catalog record is shared: one price, one name, one barcode for
// every store, so changing it changes the shelf label at every store. Cashiers create items and set their own store's price; changing
// what an item IS needs a store manager or above, and changing its chain-wide price or removing it needs HQ.

import { Role } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';
import { samePrice } from './labelPrice';

export const PRICE_ROLE_MESSAGE = "Only HQ (a Super Admin or Dev Admin) can change an item's chain-wide price, because it changes the shelf label at every store. To change your own store's price, use the store price.";
export const CONTENT_ROLE_MESSAGE = "Only a store manager or HQ can change an item's name, barcode, category, deal or design, because it changes the label at every store. Ask your manager.";
export const DELETE_ROLE_MESSAGE = 'Only HQ (a Super Admin or Dev Admin) can remove an item from the catalog, because it removes it from every store.';

export type LabelFields = {
  productName: string;
  priceText: string | null;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
};

export type LabelChanges = Partial<Record<keyof LabelFields, { from: string | null; to: string | null }>>;

const blank = (v: string | null | undefined) => (v == null || v === '' ? null : v);

/** What a request would really change: fields the request repeats unchanged (the phone sends every field on every edit) do not count. */
export function labelChanges(before: LabelFields, next: Partial<LabelFields>): LabelChanges {
  const changes: LabelChanges = {};
  if (next.priceText !== undefined && !samePrice(before.priceText, next.priceText)) changes.priceText = { from: before.priceText, to: next.priceText };
  for (const field of ['productName', 'barcode', 'category', 'dealText', 'template'] as const) {
    if (next[field] === undefined) continue;
    if (blank(before[field]) !== blank(next[field])) changes[field] = { from: before[field], to: next[field] };
  }
  return changes;
}

/** The sentence that refuses a change this role may not make, or null when the role may make all of it. */
export function refusalFor(role: Role, changes: LabelChanges): string | null {
  if (changes.priceText && !hasMinRole(role, Role.SUPER_ADMIN)) return PRICE_ROLE_MESSAGE;
  const others = Object.keys(changes).some((k) => k !== 'priceText');
  if (others && !hasMinRole(role, Role.STORE_MANAGER)) return CONTENT_ROLE_MESSAGE;
  return null;
}

const FIELD_WORDS: Record<keyof LabelFields, string> = {
  productName: 'name', priceText: 'price', dealText: 'deal', barcode: 'barcode', category: 'category', template: 'design',
};
const show = (field: keyof LabelFields, v: string | null) => (v == null || v === '' ? 'none' : field === 'priceText' ? `$${v}` : field === 'template' ? v.toLowerCase().replace(/_/g, ' ') : `"${v}"`);

/** "price $2.79 to $3.19; name "A" to "B"" for the Activity Log. */
export function describeChanges(changes: LabelChanges): string {
  return (Object.keys(changes) as (keyof LabelFields)[])
    .map((f) => `${FIELD_WORDS[f]} ${show(f, changes[f]!.from)} to ${show(f, changes[f]!.to)}`)
    .join('; ');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The one line for a label edit in the Activity Log. */
export function editSummary(productName: string, changes: LabelChanges, flagged: number, keptOwnPrice: number): string {
  const parts = [`${productName}: ${describeChanges(changes)}`];
  parts.push(`${plural(flagged, 'store', 'stores')} told to reprint`);
  if (keptOwnPrice > 0) parts.push(`${plural(keptOwnPrice, 'store keeps', 'stores keep')} its own price`);
  return parts.join('; ');
}

export const ITEM_GONE_MESSAGE = 'That item no longer exists. It may have been removed by someone else.';

/** The sentence for a barcode that is already on another item (one barcode belongs to one item). */
export const barcodeTakenText = (barcode: string, itemName: string) => `The barcode ${barcode} already belongs to "${itemName}". Use that item, or change the barcode.`;
