// Pure helpers behind the Labels "My Prints" cart. No React Native imports on
// purpose, so the cart rules can be exercised directly under ts-node.
//
// The cart is a personal, on-device working set of catalog labels somebody
// intends to print right now. It is deliberately separate from a store's
// StoreLabel rows (which record "this store carries this label, at this
// price, last printed at ..."): tapping around the catalog must not create
// server rows, and an already-printed label has to be re-printable, which a
// server-side "unprinted queue" can't express.

export const MAX_QTY = 999;

export interface CartEntry {
  labelId: string;
  quantity: number;
  // A store-specific price typed on the cart item, applied to the store's own
  // row at print time. Null means "print whatever price the store already
  // resolves to."
  customPrice: string | null;
  // Only meaningful alongside customPrice: the override reverts to the base
  // price this many days after printing. Null means no end date.
  customExpiryDays: number | null;
  addedAt: number;
}

export type Cart = Record<string, CartEntry>;

// One cart per user AND store: a phone shared between logins never leaks one
// person's picks to the next, and a manager who works at a different store
// gets that store's cart (prices are per-store).
export function cartKey(userId?: string | null, storeId?: string | null): string | null {
  return userId && storeId ? `${userId}:${storeId}` : null;
}

export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_QTY, Math.round(n)));
}

// Adds any labels not already in the cart; existing entries (and whatever
// quantity/price they carry) are left exactly as they were.
export function addEntries(cart: Cart, labelIds: readonly string[], now: number = Date.now()): Cart {
  let next: Cart | null = null;
  labelIds.forEach((labelId, i) => {
    if (cart[labelId] || (next && next[labelId])) return;
    if (!next) next = { ...cart };
    // `i` keeps a bulk add's own order stable when sorted by addedAt.
    next[labelId] = { labelId, quantity: 1, customPrice: null, customExpiryDays: null, addedAt: now + i };
  });
  return next ?? cart;
}

// Scanning the same item again means "one more copy".
export function bumpEntry(cart: Cart, labelId: string, now: number = Date.now()): { cart: Cart; quantity: number } {
  const existing = cart[labelId];
  if (!existing) {
    return { cart: addEntries(cart, [labelId], now), quantity: 1 };
  }
  const quantity = clampQty(existing.quantity + 1);
  return { cart: { ...cart, [labelId]: { ...existing, quantity } }, quantity };
}

export function removeEntries(cart: Cart, labelIds: readonly string[]): Cart {
  if (!labelIds.some(id => cart[id])) return cart;
  const next = { ...cart };
  labelIds.forEach(id => { delete next[id]; });
  return next;
}

export function setEntryQuantity(cart: Cart, labelId: string, qty: number): Cart {
  const existing = cart[labelId];
  if (!existing) return cart;
  const quantity = clampQty(qty);
  if (existing.quantity === quantity) return cart;
  return { ...cart, [labelId]: { ...existing, quantity } };
}

// Passing a null price clears the custom price (and its end date with it).
// A price on an item that isn't in the cart yet adds it.
export function setEntryPrice(cart: Cart, labelId: string, price: string | null, expiryDays: number | null, now: number = Date.now()): Cart {
  const base = cart[labelId] ?? addEntries({}, [labelId], now)[labelId];
  const customPrice = price && price.trim() ? price.trim() : null;
  return {
    ...cart,
    [labelId]: { ...base, customPrice, customExpiryDays: customPrice ? expiryDays : null },
  };
}

// Drops entries whose label no longer exists in the catalog (someone deleted
// it). Returns the SAME object when nothing was dropped so callers can skip a
// pointless store update.
export function pruneEntries(cart: Cart, validIds: ReadonlySet<string>): Cart {
  const stale = Object.keys(cart).filter(id => !validIds.has(id));
  return stale.length === 0 ? cart : removeEntries(cart, stale);
}

// The slice of a catalog label the price rules need.
export interface PriceableLabel {
  id: string;
  priceText: string | null;
  myStoreLabel?: { effectivePrice: string | null } | null;
}

// What this label would print at: the price typed on the cart item, else the
// store's own resolved price (an override, or the base price), else the
// chain base price. Null means it cannot be printed yet.
export function printPriceFor(label: PriceableLabel, entry?: Pick<CartEntry, 'customPrice'> | null): string | null {
  if (entry?.customPrice) return entry.customPrice;
  return label.myStoreLabel?.effectivePrice ?? label.priceText ?? null;
}

export interface CartRow<L extends PriceableLabel> {
  label: L;
  entry: CartEntry;
  printPrice: string | null;
  hasCustomPrice: boolean;
}

// Joins cart entries to live catalog labels, newest first, so what was just
// scanned or tapped is at the top. Entries whose label isn't in the map are
// skipped (see pruneEntries for actually removing them).
export function resolveCartRows<L extends PriceableLabel>(cart: Cart, labelsById: ReadonlyMap<string, L>): CartRow<L>[] {
  const rows: CartRow<L>[] = [];
  for (const entry of Object.values(cart)) {
    const label = labelsById.get(entry.labelId);
    if (!label) continue;
    rows.push({ label, entry, printPrice: printPriceFor(label, entry), hasCustomPrice: !!entry.customPrice });
  }
  return rows.sort((a, b) => b.entry.addedAt - a.entry.addedAt);
}

export function summarizeCart<L extends PriceableLabel>(rows: readonly CartRow<L>[]): { itemCount: number; copyCount: number; unpricedCount: number } {
  return {
    itemCount: rows.length,
    copyCount: rows.reduce((sum, r) => sum + r.entry.quantity, 0),
    unpricedCount: rows.filter(r => r.printPrice === null).length,
  };
}

// Re-exported so existing imports keep working; the helper itself is generic.
export { runPool } from './runPool';
