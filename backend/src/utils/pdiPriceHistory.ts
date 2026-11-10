// What changed between a store's last PDI item list and the new one (2026-11-11). Each upload replaces the store's list; before it does,
// the two are compared item by item (on PDI's own code), so the upload can say "since the last list: 34 prices up, 12 down, 9 costs up with
// the same price, 85 new items, 20 gone" and every item keeps its price history. A cost that went up while the price stayed is the first
// sign of a shrinking margin. A file that does not look like the store's last list is probably another store's (myReport.xls, 2026-11-10):
// the upload asks first. Measured on the 8 real lists: two stores share 44% to 93% of their items, but at most 49% of the shared ones have
// the same price AND cost, while a store's own list weeks later keeps most of them (a few percent of prices change at a time).

export type ChangeKind = 'CHANGED' | 'NEW' | 'GONE';

export interface ListItem { code: string; upcKey: string; name: string; priceCents: number | null; costCents: number | null }

export interface ChangeRow {
  code: string; upcKey: string; name: string; kind: ChangeKind;
  oldPriceCents: number | null; newPriceCents: number | null; oldCostCents: number | null; newCostCents: number | null;
}

export interface ChangeCounts { pricesUp: number; pricesDown: number; costsUp: number; newItems: number; goneItems: number }

/** True when the price went up (both known). */
export const priceUp = (c: Pick<ChangeRow, 'oldPriceCents' | 'newPriceCents'>) => c.oldPriceCents != null && c.newPriceCents != null && c.newPriceCents > c.oldPriceCents;
/** True when the price went down (both known). */
export const priceDown = (c: Pick<ChangeRow, 'oldPriceCents' | 'newPriceCents'>) => c.oldPriceCents != null && c.newPriceCents != null && c.newPriceCents < c.oldPriceCents;
/** True when the cost went up while the price stayed the same. */
export const costUpSamePrice = (c: Omit<ChangeRow, 'code' | 'upcKey' | 'name' | 'kind'>) =>
  c.oldCostCents != null && c.newCostCents != null && c.newCostCents > c.oldCostCents && c.oldPriceCents === c.newPriceCents;

/** The changes from the old list to the new one, and their counts. A price or cost that is missing on one side and known on the other is
 *  a change too (it is shown), but only known-to-known moves count as up or down. */
export function diffLists(old: ListItem[], next: ListItem[]): { rows: ChangeRow[]; counts: ChangeCounts; shared: number; unchanged: number } {
  const before = new Map(old.map((i) => [i.code, i]));
  const rows: ChangeRow[] = [];
  const counts: ChangeCounts = { pricesUp: 0, pricesDown: 0, costsUp: 0, newItems: 0, goneItems: 0 };
  let shared = 0, unchanged = 0;
  const seen = new Set<string>();
  for (const n of next) {
    if (seen.has(n.code)) continue;
    seen.add(n.code);
    const o = before.get(n.code);
    if (!o) {
      rows.push({ code: n.code, upcKey: n.upcKey, name: n.name, kind: 'NEW', oldPriceCents: null, newPriceCents: n.priceCents, oldCostCents: null, newCostCents: n.costCents });
      counts.newItems++;
      continue;
    }
    shared++;
    if (o.priceCents === n.priceCents && o.costCents === n.costCents) { unchanged++; continue; }
    const row: ChangeRow = { code: n.code, upcKey: n.upcKey, name: n.name, kind: 'CHANGED', oldPriceCents: o.priceCents, newPriceCents: n.priceCents, oldCostCents: o.costCents, newCostCents: n.costCents };
    rows.push(row);
    if (priceUp(row)) counts.pricesUp++;
    else if (priceDown(row)) counts.pricesDown++;
    if (costUpSamePrice(row)) counts.costsUp++;
  }
  for (const o of old) {
    if (seen.has(o.code)) continue;
    seen.add(o.code);
    rows.push({ code: o.code, upcKey: o.upcKey, name: o.name, kind: 'GONE', oldPriceCents: o.priceCents, newPriceCents: null, oldCostCents: o.costCents, newCostCents: null });
    counts.goneItems++;
  }
  return { rows, counts, shared, unchanged };
}

/** True when the new list is probably another store's: it shares under half its items with the last one, or under 60% of the items it
 *  shares keep their price and cost. Only for lists of a real size (200 items or more on both sides). */
export const looksLikeAnotherStore = (oldCount: number, newCount: number, shared: number, unchanged: number) =>
  oldCount >= 200 && newCount >= 200 && (shared * 2 < Math.min(oldCount, newCount) || unchanged < shared * 0.6);
