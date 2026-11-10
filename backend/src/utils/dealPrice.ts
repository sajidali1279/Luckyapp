// A deal's price checked against each store's register (2026-11-10). Prices differ by store (the Oklahoma stores 5, 6, 7 and 11 pay other
// taxes and vendors, and the Texas stores differ among themselves on about 3,800 items), so one chain-wide "2 for $5" can be a real saving
// at one store, no saving at another (the register already charges $2.29 each) and below cost at a third. The deal's words are read for
// a price per item: "2 for $5", "2/$5", "3 for 4", "$1.99", "only $1.99 each". Words with no price ("Buy 2 Get 1 Free", "$1 off",
// "50% off") are a saving at any price, so they are not checked.

export interface DealPrice { qty: number; totalCents: number; unitCents: number }

const money = (s: string) => Math.round(parseFloat(s) * 100);

/** The price per item a deal's words name, or null when they name none (or a relative deal like "$1 off"). */
export function dealPriceOf(text: string | null | undefined): DealPrice | null {
  const t = (text ?? '').toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
  if (!t || /\boff\b|%|free|bogo|get \d|save/.test(t)) return null;
  const multi = t.match(/(\d{1,2})\s*(?:for|\/|x)\s*\$?\s*(\d{1,4}(?:\.\d{1,2})?)\b/);
  if (multi) {
    const qty = parseInt(multi[1], 10), totalCents = money(multi[2]);
    if (qty < 1 || qty > 24 || totalCents <= 0) return null;
    // "2 for 1" is buy one get one, not 50 cents each: a bare whole number below the count is not a price
    if (!/\$/.test(t) && !multi[2].includes('.') && parseInt(multi[2], 10) < qty) return null;
    return { qty, totalCents, unitCents: Math.round(totalCents / qty) };
  }
  const one = t.match(/^(?:only |now |just |all )?\$\s*(\d{1,4}(?:\.\d{1,2})?)(?: each| ea)?$/) ?? t.match(/^(\d{1,4}\.\d{2})(?: each| ea)?$/);
  if (one) { const c = money(one[1]); return c > 0 ? { qty: 1, totalCents: c, unitCents: c } : null; }
  return null;
}

export type DealVerdict = 'SAVES' | 'NOT_A_SAVING' | 'BELOW_COST' | 'NO_PRICE';

/** What the deal means at one store: a saving, no saving (the register charges the same or less), or below PDI's cost (each sale loses money). */
export function dealVerdict(unitCents: number, register: { priceCents: number | null; costCents: number | null }): DealVerdict {
  if (!register.priceCents) return 'NO_PRICE';
  if (register.costCents && unitCents < register.costCents) return 'BELOW_COST';
  if (unitCents >= register.priceCents) return 'NOT_A_SAVING';
  return 'SAVES';
}

/** The stores where a deal is no saving or below cost, from each store's register price. */
export function dealProblems(unitCents: number, rows: { storeName: string; priceCents: number | null; costCents: number | null }[]) {
  const notSaving: string[] = [], belowCost: string[] = [];
  let checked = 0;
  for (const r of rows) {
    const v = dealVerdict(unitCents, r);
    if (v === 'NO_PRICE') continue;
    checked++;
    if (v === 'NOT_A_SAVING') notSaving.push(r.storeName);
    if (v === 'BELOW_COST') belowCost.push(r.storeName);
  }
  return { checked, notSaving, belowCost };
}
