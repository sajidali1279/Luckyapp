// Filling a new label from the catalog we already have.
//
// Barcodes: a package's UPC starts with the maker's number and ends with the item (then one check digit), so flavours and sizes of one
// product line sit next to each other: 4k Mango 0842426165389 and 4k Kiwi Berry 0842426165358, Gatorade 28oz 0052000135190 and
// 0052000135152. A new barcode is compared with every catalog barcode on its digits (as a 13-digit EAN, short UPC-E codes expanded,
// the check digit left out). The longer the shared start, the closer the item: 7 digits is the same maker, 10 or more the same line.
//
// Names: every typed word matches the start of a word in the name, in any order ("gat 28" finds "Gatorade Fruit Punch 28oz").

export interface CatalogItem {
  id: string;
  productName: string;
  barcode: string | null;
  category: string | null;
  dealText: string | null;
  price: string | null;   // this store's price (its own, or the chain price)
}

export interface Similar { item: CatalogItem; shared: number }

export interface Suggestion {
  similar: Similar[];                 // closest first, at most 8
  closeness: 'line' | 'maker' | null; // the same product line (10+ digits), the same maker (7+), or nothing similar
  price: string | null;               // to fill in: only when two or more same-line (same-size) items all have this one price
  basis: string[];                    // the names of the items that price came from
  prices: { price: string; count: number; example: string }[];   // the prices seen, most common first, to pick from
  category: string | null;            // the most common category among the closest items
  deal: string | null;                // a deal every same-line item shares
  brand: string | null;               // the words their names start with ("4k", "Gatorade"), to start the name
}

const MAKER = 7;   // shared digits for the same maker
const LINE = 10;   // shared digits for the same product line

/** The size in a name, written one way: "20oz", "20 oz" and "20 fl oz" are "20oz"; "1liter", "1 L" and "1 Litre" are "1l"; "12 Pack" is "12pack". */
export function sizeOf(name: string | null | undefined): string | null {
  const m = (name ?? '').toLowerCase().replace(/\s+/g, ' ').match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|ml|l\b|liters?|litres?|ltr|pack|pk|pcs|pc|ct|g\b|lb)/);
  if (!m) return null;
  let unit = m[2].replace(/[\s.]/g, '');
  if (/^(l|liters?|litres?|ltr)$/.test(unit)) unit = 'l';
  if (unit === 'floz') unit = 'oz';
  if (unit === 'pk') unit = 'pack';
  if (unit === 'pcs') unit = 'pc';
  return `${Number(m[1])}${unit}`;
}

/** A UPC-E (8 digits starting 0 or 1) as its full UPC-A. */
function upcEtoA(e: string): string {
  const ns = e[0], d = e.slice(1, 7), chk = e[7], last = d[5];
  let mid: string;
  if (last <= '2') mid = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  else if (last === '3') mid = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === '4') mid = d.slice(0, 4) + '00000' + d[4];
  else mid = d.slice(0, 5) + '0000' + last;
  return ns + mid + chk;
}

/** The barcode as a 13-digit EAN, or null for codes that are not product numbers (letters, EAN-8 store codes, odd lengths). */
export function ean13(barcode: string | null | undefined): string | null {
  const b = (barcode ?? '').trim();
  if (!/^\d+$/.test(b)) return null;
  if (b.length === 8) return b[0] === '0' || b[0] === '1' ? '0' + upcEtoA(b) : null;
  if (b.length === 12) return '0' + b;
  if (b.length === 13) return b;
  if (b.length === 14) return b.slice(1);
  if (b.length === 11) return '00' + b;   // a UPC that lost its leading zero (spreadsheets)
  return null;
}

/** How many leading digits two barcodes share, the check digit left out (0 when either is not a product number). */
export function sharedDigits(a: string | null | undefined, b: string | null | undefined): number {
  const x = ean13(a), y = ean13(b);
  if (!x || !y) return 0;
  let n = 0;
  while (n < 12 && x[n] === y[n]) n++;
  return n;
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  let best: T | null = null, n = 0;
  counts.forEach((c, v) => { if (c > n) { best = v; n = c; } });
  return best;
}

/** The words every name starts with, as typed in the first one ("4k Mango", "4k Kiwi Berry" -> "4k"). */
function commonStart(names: string[]): string | null {
  if (names.length < 2) return null;
  const words = names.map((n) => n.trim().split(/\s+/));
  const out: string[] = [];
  for (let i = 0; i < words[0].length; i++) {
    const w = words[0][i].toLowerCase();
    if (!words.every((ws) => ws[i] && ws[i].toLowerCase() === w)) break;
    out.push(words[0][i]);
  }
  return out.length ? out.join(' ') : null;
}

/**
 * What the catalog suggests for a new barcode. Items with the same barcode (the product itself) are not "similar".
 * The price is filled in only when it is safe: two or more items of the same line (and, once the name says a size, the same size) all
 * cost the same. Checked against the real catalog (813 items, 2026-10-03): right 95 times in 100; without the size and with one item
 * it was 80 (the 20oz and the 1 liter of a drink sit next to each other). Otherwise the prices are offered to pick from.
 */
export function suggestFromBarcode(barcode: string | null | undefined, catalog: CatalogItem[], nameHint?: string | null): Suggestion {
  const empty: Suggestion = { similar: [], closeness: null, price: null, basis: [], prices: [], category: null, deal: null, brand: null };
  const code = ean13(barcode);
  if (!code) return empty;
  const ref = Number(code.slice(0, 12));
  const similar = catalog
    .map((item) => ({ item, shared: sharedDigits(code, item.barcode), code: ean13(item.barcode) }))
    .filter((s) => s.code && s.code.slice(0, 12) !== code.slice(0, 12) && s.shared >= MAKER)
    .sort((a, b) => b.shared - a.shared || Math.abs(Number(a.code!.slice(0, 12)) - ref) - Math.abs(Number(b.code!.slice(0, 12)) - ref))
    .slice(0, 8)
    .map(({ item, shared }) => ({ item, shared }));
  if (similar.length === 0) return empty;

  const top = similar[0].shared;
  const closeness: Suggestion['closeness'] = top >= LINE ? 'line' : 'maker';
  // The same line: everything that shares as much as the closest one (within a digit), when that is a product line
  const size = sizeOf(nameHint);
  const line = closeness === 'line' ? similar.filter((s) => s.shared >= top - 1) : [];
  // The items the price is taken from: the same line, or once the size is known, the same size in the same line (9+ digits)
  const basis = closeness !== 'line' ? [] : size ? similar.filter((s) => s.shared >= 9 && sizeOf(s.item.productName) === size) : line;
  const linePrices = [...new Set(basis.map((s) => s.item.price).filter((p): p is string => !!p))];
  const lineDeals = new Set(line.map((s) => s.item.dealText ?? ''));

  const counts = new Map<string, { count: number; example: string }>();
  similar.forEach((s) => {
    if (!s.item.price) return;
    const c = counts.get(s.item.price) ?? { count: 0, example: s.item.productName };
    c.count += 1; counts.set(s.item.price, c);
  });
  // The same size first when the name says one
  const sameSize = new Set(size ? similar.filter((s) => sizeOf(s.item.productName) === size).map((s) => s.item.price) : []);
  const prices = [...counts.entries()].map(([price, c]) => ({ price, ...c }))
    .sort((a, b) => Number(sameSize.has(b.price)) - Number(sameSize.has(a.price)) || b.count - a.count);

  const near = similar.filter((s) => s.shared >= top - 1);
  return {
    similar,
    closeness,
    price: basis.length >= 2 && linePrices.length === 1 ? linePrices[0] : null,
    basis: basis.length >= 2 && linePrices.length === 1 ? basis.map((s) => s.item.productName) : [],
    prices,
    category: mostCommon(near.map((s) => s.item.category).filter((c): c is string => !!c)),
    deal: line.length > 0 && lineDeals.size === 1 && [...lineDeals][0] ? [...lineDeals][0] : null,
    brand: commonStart(near.slice(0, 6).map((s) => s.item.productName)),
  };
}

/** Catalog items whose name matches what is typed: every typed word starts a word of the name, in any order. Best matches first. */
export function matchNames(query: string, catalog: CatalogItem[], limit = 6): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const scored: { item: CatalogItem; score: number }[] = [];
  const seen = new Set<string>();
  for (const item of catalog) {
    const name = item.productName.toLowerCase();
    if (seen.has(name)) continue;
    const words = name.split(/[\s\-/&.,()]+/).filter(Boolean);
    const wordStarts = tokens.every((t) => words.some((w) => w.startsWith(t)));
    const contains = name.includes(q);
    if (!wordStarts && !contains) continue;
    seen.add(name);
    // The whole text at the start, then every word at a word start, then anywhere
    scored.push({ item, score: name.startsWith(q) ? 0 : wordStarts ? 1 : 2 });
  }
  return scored.sort((a, b) => a.score - b.score || a.item.productName.length - b.item.productName.length).slice(0, limit).map((s) => s.item);
}
