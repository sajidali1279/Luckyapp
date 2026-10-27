// Invoices to PDI (2026-10-27). PDI, the stores' back-office software, takes a vendor invoice as a fixed-width text file. Until now an
// outside company (Deep Water) typed each paper invoice into one; this makes the same file from the invoice's lines. The layout was worked
// out from three invoices the owner confirmed against Deep Water's files (Frito-Lay, Ed F. Davis, PepsiCo):
//   A line, 35 characters:  "A" + supplier code 6 + invoice number 10 + date MMDDYYYY 8 + total in cents 10
//   B line, 67 characters, one per item in invoice order:  "B" + UPC 11 (without its check digit) + description 25
//     + item number 6 (spaces when the supplier has none) + price in cents 6 + "CA" + units per case 6 + quantity 5 + "00000"
// Numbers are zero-padded on the left, and a minus sign takes the first place (a return of one is "-0001"). The store is not in the
// file: PDI is told which store when the file is imported.
// Anything a person should look at comes back as a Problem naming its field, so the review page can mark that cell; the file itself is
// only made from lines with none left.
import { gs1CheckDigit } from './barcode';
import { addStoreDays, isRealDateKey } from './storeTime';

// ── The file ────────────────────────────────────────────────────────────────

/** Windows line endings, after every line including the last, until a real Deep Water file shows otherwise (only printouts so far). */
export const PDI_EOL = '\r\n';
export const A_LENGTH = 35;
export const B_LENGTH = 67;

export interface PdiHeader {
  supplierCode: string;  // the supplier's code in PDI: FRITO, EFDINC, PEPSIC
  invoiceNumber: string; // digits, without leading zeros
  date: string;          // YYYY-MM-DD
  totalCents: number;    // the invoice total as printed, not worked out from the lines
}

export interface PdiLine {
  upc: string;               // 11 digits (fullUpc adds the check digit back)
  description: string;
  itemNumber: string | null; // the supplier's item number, or null when its invoices have none
  priceCents: number;        // for one of what is invoiced (Frito-Lay: one item; Ed F. Davis and PepsiCo: one case)
  unitsPerCase: number;      // sellable units in one of what is invoiced; 0 while not known, which the file refuses
  quantity: number;          // negative for a return
}

export type ProblemField =
  'supplier' | 'invoice' | 'date' | 'total' | 'lines' | 'group' | 'upc' | 'description' | 'item' | 'price' | 'units' | 'quantity' | 'amount';
/** Something a person should look at, and which part of the line or invoice it is about. */
export interface Problem { field: ProblemField; message: string }

/** A value that cannot go in the file as it is. The message says which and why, in words for the review screen. */
export class PdiFileError extends Error {}

const fits = (n: number, width: number) => Number.isSafeInteger(n) && String(Math.abs(n)).length <= (n < 0 ? width - 1 : width);

/** A whole number in a fixed width: zero-padded, with a minus sign in the first place. */
function fixedNumber(n: number, width: number, what: string): string {
  if (!fits(n, width)) throw new PdiFileError(`${what} (${n}) does not fit in the file.`);
  return (n < 0 ? '-' : '') + String(Math.abs(n)).padStart(n < 0 ? width - 1 : width, '0');
}

const money = (cents: number) => (cents / 100).toFixed(2);

/** Characters a photo or an old file may hold, as the plain ASCII the file needs (by code point, so this source stays ASCII). */
const ASCII_FOR: Record<number, string> = {
  0x2018: "'", 0x2019: "'", 0x2032: "'", 0x201c: '"', 0x201d: '"', 0x2044: '/', 0x2215: '/', 0xd7: 'X', 0xdf: 'SS',
};

/** The description as the file carries it: plain capitals, accents and trademark signs dropped, dashes and curly quotes made plain,
 *  a half sign as 1/2, spaces closed up, cut or padded to 25. */
export function fileDescription(s: string): string {
  const plain = s
    .replace(/\p{So}/gu, '')                  // trademark and other signs, before they turn into letters ("TM")
    .normalize('NFKD').replace(/\p{M}/gu, '') // accents
    .replace(/\p{Pd}/gu, '-')
    .replace(/[^\x20-\x7e]/g, (c) => ASCII_FOR[c.codePointAt(0) ?? 0] ?? ' ')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  return plain.slice(0, 25).padEnd(25, ' ');
}

/** What would keep this header out of the file (none when it can go in). */
export function headerProblems(h: PdiHeader): Problem[] {
  const out: Problem[] = [];
  if (!/^[A-Z0-9]{1,6}$/.test(h.supplierCode.trim().toUpperCase())) out.push({ field: 'supplier', message: `The supplier code "${h.supplierCode}" must be 1 to 6 letters or digits.` });
  if (!/^\d{1,10}$/.test(h.invoiceNumber.trim())) out.push({ field: 'invoice', message: `The invoice number "${h.invoiceNumber}" must be 1 to 10 digits.` });
  if (!isRealDateKey(h.date) || h.date < '2000-01-01' || h.date > '2099-12-31') out.push({ field: 'date', message: `The invoice date "${h.date}" is not a real date.` });
  if (!fits(h.totalCents, 10)) out.push({ field: 'total', message: `The invoice total (${h.totalCents}) does not fit in the file.` });
  return out;
}

/** What would keep this item line out of the file (none when it can go in). */
export function lineProblems(l: PdiLine): Problem[] {
  const out: Problem[] = [];
  if (!/^\d{11}$/.test(l.upc)) out.push({ field: 'upc', message: `The UPC "${l.upc}" must be 11 digits.` });
  if (!fileDescription(l.description).trim()) out.push({ field: 'description', message: 'The product name is empty.' });
  const item = (l.itemNumber ?? '').trim();
  if (item && !/^\d{1,6}$/.test(item)) out.push({ field: 'item', message: `The item number "${l.itemNumber}" must be 1 to 6 digits.` });
  if (!fits(l.priceCents, 6) || l.priceCents < 0) out.push({ field: 'price', message: l.priceCents < 0 ? 'A price cannot be below zero: a return is a minus quantity.' : `The price (${l.priceCents} cents) does not fit in the file.` });
  if (!fits(l.unitsPerCase, 6) || l.unitsPerCase < 1) out.push({ field: 'units', message: l.unitsPerCase === 0 ? 'Units per case is not known yet.' : `Units per case must be 1 or more, not ${l.unitsPerCase}.` });
  if (!fits(l.quantity, 5) || l.quantity === 0) out.push({ field: 'quantity', message: `The quantity (${l.quantity}) must be a whole number other than 0 that fits in the file.` });
  return out;
}

const fileDate = (date: string) => date.slice(5, 7) + date.slice(8, 10) + date.slice(0, 4); // "2026-08-19" -> "08192026"

export function headerLine(h: PdiHeader): string {
  const p = headerProblems(h);
  if (p.length) throw new PdiFileError(p[0].message);
  return 'A' + h.supplierCode.trim().toUpperCase().padEnd(6, ' ') + h.invoiceNumber.trim().padStart(10, '0') + fileDate(h.date) + fixedNumber(h.totalCents, 10, 'The invoice total');
}

export function itemLine(l: PdiLine): string {
  const p = lineProblems(l);
  if (p.length) throw new PdiFileError(p[0].message);
  const item = (l.itemNumber ?? '').trim();
  return 'B' + l.upc + fileDescription(l.description) + (item ? item.padStart(6, '0') : ' '.repeat(6))
    + fixedNumber(l.priceCents, 6, 'The price') + 'CA' + fixedNumber(l.unitsPerCase, 6, 'Units per case')
    + fixedNumber(l.quantity, 5, 'The quantity') + '00000';
}

/** The whole file: the A line, then one B line per item. A refusal names the line. */
export function pdiFile(h: PdiHeader, lines: PdiLine[], eol = PDI_EOL): string {
  if (!lines.length) throw new PdiFileError('An invoice needs at least one item.');
  const rows = [headerLine(h)];
  lines.forEach((l, i) => {
    try { rows.push(itemLine(l)); } catch (e) { throw e instanceof PdiFileError ? new PdiFileError(`Line ${i + 1}: ${e.message}`) : e; }
  });
  return rows.map((r) => r + eol).join('');
}

/** The download's name, e.g. PEPSIC_27114509_2026-08-19.txt (PDI's own naming rule, if it has one, is not known yet). */
export function pdiFileName(h: PdiHeader): string {
  const p = headerProblems(h);
  if (p.length) throw new PdiFileError(p[0].message);
  return `${h.supplierCode.trim().toUpperCase()}_${h.invoiceNumber.trim()}_${h.date}.txt`;
}

/** The full 12-digit UPC of a file UPC (its 11 digits and the check digit): the form barcode.ts matches, for tables keyed by product. */
export const fullUpc = (upc11: string) => upc11 + gs1CheckDigit(upc11);

/** What the file's lines come to, in cents (returns take away), to hold against the invoice's printed total. */
export function linesTotalCents(lines: PdiLine[]): number {
  return lines.reduce((n, l) => n + l.priceCents * l.quantity, 0);
}

// ── Reading a file (old Deep Water files teach the app each product's units per case) ──

export interface ParsedPdiInvoice { header: PdiHeader; lines: PdiLine[]; notes: string[] }

function signedNumber(s: string, what: string, line: number): number {
  if (!/^-?\d+$/.test(s)) throw new PdiFileError(`Line ${line}: ${what} "${s}" is not a number.`);
  return Number(s);
}

/** Reads a file in this layout: one invoice for each A line (a file may hold several), each with the B lines after it. A line that
 *  cannot be used (another kind of line, a bad UPC, units of 0) is left out and named in `notes`, and so is a total the lines do not
 *  come to, so an old file's mistakes show before the app learns from it. */
export function parsePdiFile(content: string): ParsedPdiInvoice[] {
  const body = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content; // a byte-order mark
  const rows = body.split(/\r\n|\r|\n/).map((text, i) => ({ text: text.replace(/[\s\x1a]+$/, ''), line: i + 1 })).filter((r) => r.text);
  const out: ParsedPdiInvoice[] = [];
  for (const { text: r, line } of rows) {
    if (r[0] === 'A') {
      if (r.length !== A_LENGTH) throw new PdiFileError(`Line ${line}: an A line has ${A_LENGTH} characters, this one has ${r.length}.`);
      const mmddyyyy = r.slice(17, 25);
      const header: PdiHeader = {
        supplierCode: r.slice(1, 7).trim(),
        invoiceNumber: r.slice(7, 17).replace(/^0+(?=\d)/, ''),
        date: `${mmddyyyy.slice(4)}-${mmddyyyy.slice(0, 2)}-${mmddyyyy.slice(2, 4)}`,
        totalCents: signedNumber(r.slice(25, 35), 'the total', line),
      };
      const p = headerProblems(header);
      if (p.length) throw new PdiFileError(`Line ${line}: ${p[0].message}`);
      out.push({ header, lines: [], notes: [] });
      continue;
    }
    const inv = out[out.length - 1];
    if (!inv) throw new PdiFileError(`Line ${line}: the file must start with an A line.`);
    if (r[0] !== 'B') { inv.notes.push(`Line ${line} is not an item line and was left out: "${r.slice(0, 30)}"`); continue; }
    if (r.length !== B_LENGTH) throw new PdiFileError(`Line ${line}: a B line has ${B_LENGTH} characters, this one has ${r.length}.`);
    const parsed: PdiLine = {
      upc: r.slice(1, 12),
      description: r.slice(12, 37).trim(),
      itemNumber: r.slice(37, 43).trim() || null,
      priceCents: signedNumber(r.slice(43, 49), 'the price', line),
      unitsPerCase: signedNumber(r.slice(51, 57), 'units per case', line),
      quantity: signedNumber(r.slice(57, 62), 'the quantity', line),
    };
    const p = lineProblems(parsed);
    if (p.length) { inv.notes.push(`Line ${line} was left out: ${p[0].message}`); continue; }
    if (r.slice(49, 51) !== 'CA') inv.notes.push(`Line ${line} has "${r.slice(49, 51)}" where CA was expected.`);
    if (r.slice(62) !== '00000') inv.notes.push(`Line ${line} ends "${r.slice(62)}" where 00000 was expected.`);
    inv.lines.push(parsed);
  }
  if (!out.length) throw new PdiFileError('The file must start with an A line.');
  for (const inv of out) {
    const sum = linesTotalCents(inv.lines);
    if (sum !== inv.header.totalCents) inv.notes.push(`The lines come to ${money(sum)}, but the A line says ${money(inv.header.totalCents)}.`);
  }
  return out;
}

// ── Suppliers: how each one's paper invoice becomes file lines ──────────────

export type PdiSupplier = 'FRITO' | 'EFDINC' | 'PEPSIC';
export const PDI_SUPPLIERS: { code: PdiSupplier; name: string }[] = [
  { code: 'FRITO', name: 'Frito-Lay' },
  { code: 'EFDINC', name: 'Ed F. Davis' },
  { code: 'PEPSIC', name: 'PepsiCo' },
];

/** One item line as printed on the paper invoice. Printed values stay text (leading zeros matter); null where it could not be read. */
export interface PaperLine {
  upc: string | null;           // Frito-Lay's short code ("25955") or a full UPC as printed ("0-18200-20038-0")
  description: string | null;
  item?: string | null;         // Frito-Lay: the 8-digit ITEM; Ed F. Davis: the 6-digit ID; PepsiCo: none
  quantity: number | null;      // Frito-Lay: each; Ed F. Davis and PepsiCo: cases. Above 0; a return says so below
  units?: number | null;        // PepsiCo also prints the units (cases x units per case)
  price: string | number | null;  // Frito-Lay: EACH COST; Ed F. Davis: NET; PepsiCo: Net
  amount: string | number | null; // the line's printed total
  isReturn?: boolean;           // Frito-Lay's RETURNS section
  manufacturer?: string | null; // Frito-Lay: the MANUFACTURER number of the line's section (28400)
  group?: string | null;        // PepsiCo: the package header the line is under ("11OZ PL 1/12 TBG")
}

/** Where a line's units per case came from: one item (Frito-Lay), the paper (PepsiCo units / cases), a learned or a person-confirmed
 *  value for the product, or a guess from its name. */
export type UnitsFrom = 'each' | 'paper' | 'learned' | 'confirmed' | 'guess';
export interface ConvertedLine { line: PdiLine; problems: Problem[]; unitsFrom: UnitsFrom | null }

/** Cents from money as printed: "1.9500" -> 195, "$1,234.5" -> 123450, ".85" -> 85, "(1.95)", "1.95-" and "1.95CR" -> -195.
 *  Null when it is not money as printed, or has part of a cent (none seen on these invoices, so a person decides). */
export function printedCents(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return null;
  let s = v.trim().toUpperCase();
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  if (/(-|CR)$/.test(s)) { negative = true; s = s.replace(/(-|CR)$/, '').trim(); }
  while (/^[$-]/.test(s)) { if (s[0] === '-') negative = true; s = s.slice(1); }
  const m = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || !/\d/.test(s)) return null;
  const dollars = m[1].replace(/,/g, '');
  const decimals = (m[2] ?? '').padEnd(2, '0');
  if (dollars.length > 9 || /[1-9]/.test(decimals.slice(2))) return null;
  const cents = Number(dollars || '0') * 100 + Number(decimals.slice(0, 2));
  return negative && cents ? -cents : cents;
}

/** The file's 11 UPC digits from a UPC as printed. A full UPC's 12th digit is its check digit, dropped once it is shown to match.
 *  Frito-Lay prints only the item's last 5 digits; the rest is 0 and the manufacturer number of the section the line is in. */
export function fileUpc(printed: string | null | undefined, supplier: PdiSupplier, manufacturer?: string | null): { upc: string | null; problems: Problem[] } {
  const no = (message: string, upc: string | null = null) => ({ upc, problems: [{ field: 'upc' as const, message }] });
  if (typeof printed !== 'string' || !printed.trim()) return no('The UPC could not be read.');
  let d = printed.replace(/[\s.\p{Pd}]/gu, '');
  if (/\D/.test(d)) return no(`The UPC "${printed}" has a letter in it: a digit was probably misread.`);
  if (supplier === 'FRITO' && d.length <= 5) {
    const m = (manufacturer ?? '').replace(/\D/g, '');
    if (m.length !== 5) return no(`Which manufacturer section is this line in? Frito-Lay's short code ${printed} needs its 5-digit MANUFACTURER number.`);
    return { upc: '0' + m + d.padStart(5, '0'), problems: [] };
  }
  if (d.length > 12 && /^0+$/.test(d.slice(0, d.length - 12))) d = d.slice(d.length - 12); // EAN-13 or GTIN-14 of a UPC
  if (d.length === 12) {
    if (gs1CheckDigit(d.slice(0, 11)) !== Number(d[11])) return no(`The UPC ${printed} does not check out (its last digit is a check digit), so a digit is probably misread.`, d.slice(0, 11));
    return { upc: d.slice(0, 11), problems: [] };
  }
  if (d.length === 11) {
    const shifted = gs1CheckDigit('0' + d.slice(0, 10)) === Number(d[10]) ? ' It may also be a whole UPC missing its first 0.' : '';
    return no(`The UPC ${printed} has no check digit (it was cut off or unreadable), so a misread digit cannot be caught: compare it with the paper.${shifted}`, d);
  }
  return no(`The UPC "${printed}" has ${d.length} digits; a full UPC has 12.`);
}

/** A guess at units per case from a beer's name, for a product the app has not seen (Ed F. Davis prints no units):
 *  "24/12oz 2/12 C" -> 2 (two 12-packs), "24/12oz 4/6 B" -> 4, "4/6/12oz" -> 4, "12/24oz B" -> 12 and "12/695ML" -> 12 (big singles),
 *  "18/12oz C" -> 1 (one 18-pack). Null when the name does not say ("MODELO CHELADA NEGRA"), its pack is cut off ("24/12 2"), or the
 *  can is 13 to 18 oz with no pack (singles and packs both happen). Always shown to a person: on the confirmed Ed F. Davis invoice,
 *  4 of its 40 names did not give the units Deep Water used. */
export function guessUnitsPerCase(description: string): number | null {
  const d = description.toUpperCase().trim();
  const tokens = [...d.matchAll(/(\d+)\/(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?(?:\s*(OZ|ML|L)(?![A-Z]))?/g)]
    .map((m) => ({ a: +m[1], b: +m[2], triple: m[3] !== undefined, unit: m[4] ?? '', end: (m.index ?? 0) + m[0].length }));
  const triple = tokens.find((t) => t.triple);
  if (triple) return triple.a;                                                    // 4/6/12OZ: four 6-packs
  const caseSize = tokens.find((t) => t.unit) ?? tokens.find((t) => t.a >= 12);  // 24/12OZ: how many, how big
  const pack = tokens.find((t) => t !== caseSize && !t.unit && t.a >= 2 && t.a < 12); // 2/12, 4/6, 3/8: how many packs
  if (pack) return pack.a;
  if (!caseSize) return null;
  if (/^\d+\/?$/.test(d.slice(caseSize.end).replace(/[.\s]/g, ''))) return null; // "24/12 2": the pack was cut off
  const ounces = caseSize.unit === 'ML' ? caseSize.b / 29.5735 : caseSize.unit === 'L' ? caseSize.b * 33.814 : caseSize.b;
  if (ounces >= 19) return caseSize.a;
  return ounces <= 12 ? 1 : null;
}

/** PepsiCo's package header gives units per case: "11OZ PL 1/12 TBG" -> 12, "12OZ CN 12/2 FM" -> 2 (two 12-packs), "5G BIB" -> 1. */
export function unitsFromPackage(group: string | null | undefined): number | null {
  if (!group) return null;
  const m = /(\d+)\/(\d+)/.exec(group);
  if (m) return +m[2];
  return /\bBIB\b/.test(group.toUpperCase()) ? 1 : null;
}

export interface KnownUnits { units: number; from: 'learned' | 'confirmed' }
export interface ConvertContext {
  knownUnits?: (upc: string) => KnownUnits | undefined; // what the app remembers for a product (Ed F. Davis)
  today?: string;                                        // YYYY-MM-DD, to question a date far from it
}

/** One paper line as the file's line, with what a person should look at. */
export function convertPaperLine(supplier: PdiSupplier, p: PaperLine, ctx: ConvertContext = {}): ConvertedLine {
  const problems: Problem[] = [];
  const say = (field: ProblemField, message: string) => problems.push({ field, message });
  const known = PDI_SUPPLIERS.some((s) => s.code === supplier);
  if (!known) say('supplier', `There are no rules for the supplier "${supplier}" yet.`);
  const u = fileUpc(p.upc, supplier, p.manufacturer);
  problems.push(...u.problems);
  const description = typeof p.description === 'string' ? p.description : '';
  const price = printedCents(p.price);
  if (price === null) say('price', `The price "${p.price ?? ''}" could not be read as dollars and cents.`);
  else if (price < 0) say('price', 'The price is below zero: mark a return as a return and keep the printed price.');
  const qty = typeof p.quantity === 'number' && Number.isSafeInteger(p.quantity) && p.quantity > 0 ? p.quantity : null;
  if (qty === null) say('quantity', `The quantity "${p.quantity ?? ''}" should be a whole number above 0.`);
  const itemDigits = typeof p.item === 'string' ? p.item.replace(/[\s.\p{Pd}]/gu, '') : '';
  let item: string | null = null;
  let units = 0;
  let unitsFrom: UnitsFrom | null = null;
  if (supplier === 'FRITO') {
    // the file has room for 6 of Frito-Lay's 8 digits; Deep Water keeps the first 6
    if (/^\d{8}$/.test(itemDigits)) item = itemDigits.slice(0, 6);
    else say('item', `Frito-Lay's item number should be 8 digits, not "${p.item ?? ''}".`);
    units = 1; unitsFrom = 'each';
  } else if (supplier === 'EFDINC') {
    if (/^\d{6}$/.test(itemDigits)) item = itemDigits;
    else say('item', `Ed F. Davis's product ID should be 6 digits, not "${p.item ?? ''}".`);
    const remembered = u.upc ? ctx.knownUnits?.(u.upc) : undefined;
    const guess = remembered ? null : guessUnitsPerCase(description);
    if (remembered) { units = remembered.units; unitsFrom = remembered.from; }
    else if (guess) { units = guess; unitsFrom = 'guess'; say('units', `Units per case (${guess}) is a guess from the name: check it once and it is remembered.`); }
    else say('units', 'Units per case is not known for this product yet: enter it once and it is remembered.');
  } else if (supplier === 'PEPSIC') {
    const printedUnits = typeof p.units === 'number' && Number.isSafeInteger(p.units) && p.units > 0 ? p.units : null;
    const pack = unitsFromPackage(p.group);
    if (printedUnits === null) say('units', `The units "${p.units ?? ''}" could not be read.`);
    else if (qty !== null && printedUnits % qty === 0) {
      units = printedUnits / qty; unitsFrom = 'paper';
      if (pack !== null && pack !== units) say('units', `${printedUnits} units in ${qty} cases is ${units} a case, but the package header (${p.group}) says ${pack}.`);
    } else if (qty !== null) say('units', `The units (${printedUnits}) do not divide evenly by the cases (${qty}).`);
  }
  const amount = printedCents(p.amount);
  if (amount === null) say('amount', `The line total "${p.amount ?? ''}" could not be read.`);
  else if (amount < 0 && !p.isReturn) say('amount', 'The line total is below zero: is this a return?');
  else if (price !== null && price >= 0 && qty !== null && Math.abs(amount) !== price * qty) {
    say('amount', `${qty} at ${money(price)} is ${money(price * qty)}, but the line says ${String(p.amount).trim()}.`);
  }
  const line: PdiLine = {
    upc: u.upc ?? '', description, itemNumber: item, priceCents: price ?? 0, unitsPerCase: units,
    quantity: qty === null ? 0 : p.isReturn ? -qty : qty,
  };
  // what the file itself would refuse, where it is not already said
  for (const lp of lineProblems(line)) if (!problems.some((x) => x.field === lp.field)) problems.push(lp);
  return { line, problems, unitsFrom };
}

/** What the paper prints besides its lines, to check them against: subtotals per package group (in order) and the whole invoice's counts. */
export interface PaperInvoice {
  invoiceNumber: string | null;
  date: string | null;              // YYYY-MM-DD
  total: string | number | null;
  lines: PaperLine[];
  groups?: { name: string; cases?: number; units?: number; amount?: string }[];
  summary?: { cases?: number; units?: number };
}

/** A whole paper invoice as the file's header and lines, with every line's problems and the invoice's own. */
export function convertInvoice(supplier: PdiSupplier, paper: PaperInvoice, ctx: ConvertContext = {}) {
  const lines = paper.lines.map((p) => convertPaperLine(supplier, p, ctx));
  const problems: Problem[] = [];
  const say = (field: ProblemField, message: string) => problems.push({ field, message });
  const printedNumber = typeof paper.invoiceNumber === 'string' ? paper.invoiceNumber.trim() : '';
  const digits = printedNumber.replace(/[\s\p{Pd}]/gu, '');
  if (!/^\d+$/.test(digits)) say('invoice', `The invoice number "${printedNumber}" should be digits only.`);
  const totalCents = printedCents(paper.total);
  if (totalCents === null) say('total', `The invoice total "${paper.total ?? ''}" could not be read.`);
  const header: PdiHeader = {
    supplierCode: supplier, invoiceNumber: digits.replace(/^0+(?=\d)/, ''), date: typeof paper.date === 'string' ? paper.date.trim() : '', totalCents: totalCents ?? 0,
  };
  for (const hp of headerProblems(header)) if (!problems.some((x) => x.field === hp.field)) problems.push(hp);
  if (ctx.today && isRealDateKey(header.date) && (header.date > addStoreDays(ctx.today, 7) || header.date < addStoreDays(ctx.today, -400))) {
    say('date', `The invoice date ${header.date} is far from today: is the date read right?`);
  }
  if (!lines.length) say('lines', 'No item lines were found.');
  const fileLines = lines.map((c) => c.line);
  const sum = linesTotalCents(fileLines);
  if (totalCents !== null && sum !== totalCents) say('total', `The lines come to ${money(sum)}, but the invoice total is ${money(totalCents)}.`);
  // printed subtotals: each group is the next run of lines under the same package header
  if (paper.groups?.length) {
    let at = 0;
    for (const g of paper.groups) {
      const start = at;
      while (at < lines.length && paper.lines[at].group === g.name) at++;
      const run = fileLines.slice(start, at);
      const cases = run.reduce((n, l) => n + l.quantity, 0);
      const units = run.reduce((n, l) => n + l.quantity * l.unitsPerCase, 0);
      const cents = linesTotalCents(run);
      const amount = g.amount === undefined ? null : printedCents(g.amount);
      const off: string[] = [];
      if (g.cases !== undefined && cases !== g.cases) off.push(`${cases} cases where the subtotal says ${g.cases}`);
      if (g.units !== undefined && units !== g.units) off.push(`${units} units where it says ${g.units}`);
      if (amount !== null && cents !== amount) off.push(`${money(cents)} where it says ${money(amount)}`);
      if (!run.length) say('group', `${g.name}: no lines were found under it.`);
      else if (off.length) say('group', `${g.name}: the lines come to ${off.join(', and ')}.`);
    }
    if (at !== lines.length) say('group', `${lines.length - at} lines after "${paper.lines[at]?.group ?? ''}" are not under any printed subtotal.`);
  }
  const sales = fileLines.filter((l) => l.quantity > 0);
  const salesCases = sales.reduce((n, l) => n + l.quantity, 0);
  const salesUnits = sales.reduce((n, l) => n + l.quantity * l.unitsPerCase, 0);
  if (paper.summary?.cases !== undefined && salesCases !== paper.summary.cases) say('lines', `The lines hold ${salesCases} cases, but the invoice says ${paper.summary.cases}: is a line missing or read twice?`);
  if (paper.summary?.units !== undefined && salesUnits !== paper.summary.units) say('lines', `The lines hold ${salesUnits} units, but the invoice says ${paper.summary.units}: is a line missing or read twice?`);
  return { header, lines, problems };
}
