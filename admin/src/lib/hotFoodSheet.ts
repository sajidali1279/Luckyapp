// The hot food import sheet (2026-10-11): the Krispy Krunchy items the stores carry, written once so HQ only adds prices, and the
// reader for the filled-in sheet. A plain CSV that Excel opens and saves. Kept free of React so it can be tested on its own.

export interface SheetRow { sell: string; name: string; description: string; price: string; minutes: string }

// The items, from the Krispy Krunchy menu. Prices are the store's own, so they are left for HQ to fill in (the 6-piece wings are $7.99).
export const STARTER_ITEMS: SheetRow[] = [
  { sell: 'Y', name: '2 PC Chicken', description: 'Two pieces of hand-breaded, Cajun-seasoned bone-in chicken.', price: '', minutes: '10' },
  { sell: 'Y', name: '3 PC Chicken', description: 'Three pieces of hand-breaded, Cajun-seasoned bone-in chicken.', price: '', minutes: '10' },
  { sell: 'Y', name: '4 PC Chicken', description: 'Four pieces of hand-breaded, Cajun-seasoned bone-in chicken.', price: '', minutes: '10' },
  { sell: 'Y', name: '3 PC Jumbo Tenders', description: 'Three hand-breaded jumbo tenders, all white meat.', price: '', minutes: '10' },
  { sell: 'Y', name: '4 PC Jumbo Tenders', description: 'Four hand-breaded jumbo tenders, all white meat.', price: '', minutes: '10' },
  { sell: 'Y', name: '6 PC Jumbo Tenders', description: 'Six hand-breaded jumbo tenders, all white meat.', price: '', minutes: '10' },
  { sell: 'Y', name: '6 PC Wings', description: 'Six crispy fried chicken wings.', price: '7.99', minutes: '10' },
  { sell: 'Y', name: '6 PC BBQ Wings', description: 'Six crispy wings tossed in barbecue sauce.', price: '', minutes: '10' },
  { sell: 'Y', name: '6 PC Buffalo Wings', description: 'Six crispy wings tossed in buffalo hot sauce.', price: '', minutes: '10' },
  { sell: 'Y', name: 'Chicken Nuggets', description: 'All-white breast meat nuggets, marinated and breaded.', price: '', minutes: '10' },
  { sell: 'Y', name: 'Honey Butter Fried Shrimp', description: 'Crispy fried shrimp with a honey butter glaze.', price: '', minutes: '10' },
  { sell: 'Y', name: 'Chicken Sandwich', description: 'A crispy hand-breaded chicken fillet on a toasted bun.', price: '', minutes: '10' },
  { sell: 'Y', name: 'Fries', description: 'Golden, crispy fries.', price: '', minutes: '5' },
  { sell: 'Y', name: 'Potato Wedges', description: 'Thick, seasoned skin-on potato wedges.', price: '', minutes: '5' },
  { sell: 'Y', name: 'Mashed Potatoes & Gravy', description: 'Creamy mashed potatoes with gravy.', price: '', minutes: '5' },
  { sell: 'Y', name: 'Red Beans & Rice', description: 'Slow-cooked red beans over seasoned rice.', price: '', minutes: '5' },
  { sell: 'Y', name: 'Mac & Cheese', description: 'Pasta in a creamy cheddar cheese sauce.', price: '', minutes: '5' },
  { sell: 'Y', name: 'Honey Biscuit', description: 'A warm, soft biscuit with honey.', price: '', minutes: '5' },
  { sell: 'Y', name: 'Jambalaya', description: 'Cajun-style rice with seasoned meat.', price: '', minutes: '5' },
];

export const HEADERS = ['Sell (Y/N)', 'Name', 'Description', 'Price ($)', 'Ready in (minutes)'];

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The sheet as CSV text, with a byte-order mark so Excel reads the accents and the dollar signs right. */
export function sheetCsv(rows: SheetRow[] = STARTER_ITEMS): string {
  const lines = [HEADERS, ...rows.map((r) => [r.sell, r.name, r.description, r.price, r.minutes])].map((l) => l.map(cell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** CSV text to rows of cells: quotes, commas and line breaks inside quotes, CRLF, and Excel's byte-order mark. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type Verdict =
  | { kind: 'add'; name: string; description: string | null; price: number; minutes: number | null }
  | { kind: 'skip'; name: string; why: string };

/** What each row of the filled-in sheet will do. `existing` = names already in the catalog (any case); nothing is ever changed or deleted. */
export function readSheet(text: string, existing: string[]): { verdicts: Verdict[]; problem: string | null } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { verdicts: [], problem: 'The sheet has no items. Fill in the rows under the header and save it as CSV.' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const c = { sell: col(/^sell/), name: col(/^name/), description: col(/^desc/), price: col(/^price/), minutes: col(/minute|ready/) };
  if (c.name < 0 || c.price < 0) return { verdicts: [], problem: 'The sheet needs a Name and a Price column. Download the sheet from here and fill that one in.' };
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const verdicts: Verdict[] = [];
  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const name = get(c.name).replace(/\s+/g, ' ');
    if (!name) continue;
    const sell = get(c.sell).toUpperCase();
    if (c.sell >= 0 && sell && !['Y', 'YES', 'X', '1', 'TRUE'].includes(sell)) { verdicts.push({ kind: 'skip', name, why: 'Not sold (Sell is N)' }); continue; }
    if (name.length > 100) { verdicts.push({ kind: 'skip', name: name.slice(0, 60) + '…', why: 'Name is longer than 100 letters' }); continue; }
    const rawPrice = get(c.price).replace(/[$\s]/g, '').replace(',', '.');
    if (!rawPrice) { verdicts.push({ kind: 'skip', name, why: 'No price yet' }); continue; }
    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0 || price >= 1000) { verdicts.push({ kind: 'skip', name, why: `Price "${get(c.price)}" is not a price` }); continue; }
    if (taken.has(name.toLowerCase())) { verdicts.push({ kind: 'skip', name, why: 'Already in the catalog (left as it is)' }); continue; }
    const m = get(c.minutes);
    const minutes = m && /^\d{1,3}$/.test(m) && Number(m) > 0 ? Number(m) : null;
    taken.add(name.toLowerCase());   // the same name twice in the sheet: the first one counts
    verdicts.push({ kind: 'add', name, description: get(c.description) || null, price: Math.round(price * 100) / 100, minutes });
  }
  return { verdicts, problem: verdicts.length === 0 ? 'No items found under the header.' : null };
}
