// Invoices to PDI (2026-10-27). PDI, the stores' back-office software, takes a vendor invoice as a fixed-width text file. Until now an
// outside company (Deep Water) typed each paper invoice into one; this makes the same file from the invoice's lines. The layout was worked
// out from three invoices the owner confirmed against Deep Water's files (Frito-Lay, Ed F. Davis, PepsiCo); since 2026-10-28 any vendor's
// invoice is read, with what the file needs to know about the vendor kept per vendor (VendorRules, utils/pdiVendors.ts):
//   A line, 35 characters:  "A" + supplier code 6 + invoice number 10 + date MMDDYYYY 8 + total in cents 10
//   B line, 67 characters, one per item in invoice order:  "B" + UPC 11 (without its check digit) + description 25
//     + item number 6 (spaces when the supplier has none) + price in cents 6 + "CA" + units per case 6 + quantity 5 + "00000"
// Numbers are zero-padded on the left, and a minus sign takes the first place (a return of one is "-0001"). The store is not in the
// file: PDI is told which store when the file is imported.
// Anything a person should look at comes back as a Problem naming its field, so the review page can mark that cell. A problem a person
// may accept after a look (the paper says so) is not `blocking`; a blocking one (a price nobody could read) must be corrected, and the
// file itself is only made from lines the file can hold (lineProblems, headerProblems).
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
  'supplier' | 'invoice' | 'date' | 'total' | 'lines' | 'group' | 'upc' | 'description' | 'item' | 'price' | 'units' | 'quantity' | 'amount' | 'handwriting';
/** Something a person should look at, and which part of the line or invoice it is about. Blocking: it must be corrected, not accepted. */
export interface Problem { field: ProblemField; message: string; blocking?: boolean }

/** A value that cannot go in the file as it is. The message says which and why, in words for the review screen. */
export class PdiFileError extends Error {}

const fits = (n: number, width: number) => Number.isSafeInteger(n) && String(Math.abs(n)).length <= (n < 0 ? width - 1 : width);

/** A whole number in a fixed width: zero-padded, with a minus sign in the first place. */
function fixedNumber(n: number, width: number, what: string): string {
  if (!fits(n, width)) throw new PdiFileError(`${what} (${n}) does not fit in the file.`);
  return (n < 0 ? '-' : '') + String(Math.abs(n)).padStart(n < 0 ? width - 1 : width, '0');
}

const money = (cents: number) => (cents / 100).toFixed(2);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Characters a photo or an old file may hold, as the plain ASCII the file needs (by code point, so the code stays ASCII). */
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

/** What is wrong with an invoice date, in words; null when the file can take it. */
function dateProblem(date: string): string | null {
  if (!date) return 'The invoice date could not be read.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `The invoice date "${date}" should be written YYYY-MM-DD.`;
  if (!isRealDateKey(date)) return `The invoice date "${date}" is not a real date.`;
  if (date < '2000-01-01' || date > '2099-12-31') return `The invoice date ${date} is before 2000 or after 2099: is the year read right?`;
  return null;
}

/** What would keep this header out of the file (none when it can go in). */
export function headerProblems(h: PdiHeader): Problem[] {
  const out: Problem[] = [];
  const date = dateProblem(h.date);
  if (!/^[A-Z0-9]{1,6}$/.test(h.supplierCode.trim().toUpperCase())) out.push({ field: 'supplier', message: `The supplier code "${h.supplierCode}" must be 1 to 6 letters or digits.`, blocking: true });
  if (!/^\d{1,10}$/.test(h.invoiceNumber.trim())) out.push({ field: 'invoice', message: h.invoiceNumber.trim() ? `The invoice number "${h.invoiceNumber}" must be 1 to 10 digits.` : 'The invoice number could not be read.', blocking: true });
  if (date) out.push({ field: 'date', message: date, blocking: true });
  if (!fits(h.totalCents, 10)) out.push({ field: 'total', message: `The invoice total (${h.totalCents}) does not fit in the file.`, blocking: true });
  return out;
}

/** What would keep this item line out of the file (none when it can go in). */
export function lineProblems(l: PdiLine): Problem[] {
  const out: Problem[] = [];
  const say = (field: ProblemField, message: string) => out.push({ field, message, blocking: true });
  if (!/^\d{11}$/.test(l.upc)) say('upc', l.upc ? `The UPC "${l.upc}" must be 11 digits.` : 'The UPC is missing.');
  else if (/^0+$/.test(l.upc)) say('upc', 'The UPC is all zeros, which is not a product.');
  if (!fileDescription(l.description).trim()) say('description', 'The product name is empty.');
  const item = (l.itemNumber ?? '').trim();
  if (item && !/^\d{1,6}$/.test(item)) say('item', `The item number "${l.itemNumber}" must be 1 to 6 digits.`);
  if (l.priceCents < 0) say('price', 'A price cannot be below zero: a return is a minus quantity.');
  else if (!fits(l.priceCents, 6)) say('price', `The price (${l.priceCents} cents) does not fit in the file.`);
  if (l.unitsPerCase === 0) say('units', 'Units per case is not known yet.');
  else if (!fits(l.unitsPerCase, 6) || l.unitsPerCase < 1) say('units', `Units per case must be a whole number from 1 to 999999, not ${l.unitsPerCase}.`);
  if (!fits(l.quantity, 5) || l.quantity === 0) say('quantity', l.quantity === 0 ? 'The quantity is missing.' : `The quantity (${l.quantity}) does not fit in the file.`);
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
export function fullUpc(upc11: string): string {
  if (!/^\d{11}$/.test(upc11)) throw new PdiFileError(`A file UPC has 11 digits, not "${upc11}".`);
  return upc11 + gs1CheckDigit(upc11);
}

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
  // byte-order marks and DOS end-of-file marks are never part of a line, wherever two files were joined
  const rows = content.replace(/[\x1a\ufeff]/g, '').split(/\r\n|\r|\n/).map((text, i) => ({ text: text.replace(/\s+$/, ''), raw: text, line: i + 1 })).filter((r) => r.text);
  const out: ParsedPdiInvoice[] = [];
  const leftOut = new Map<ParsedPdiInvoice, PdiLine[]>();
  for (const { text: r, raw, line } of rows) {
    if (r[0] === 'A') {
      if (r.length !== A_LENGTH) throw new PdiFileError(`Line ${line}: an A line has ${A_LENGTH} characters, this one has ${r.length}.`);
      const mmddyyyy = r.slice(17, 25);
      const header: PdiHeader = {
        supplierCode: r.slice(1, 7).trim(),
        invoiceNumber: r.slice(7, 17).trim().replace(/^0+(?=\d)/, ''),
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
    // spaces at the end count (where 00000 should be); only a line longer than 67 is refused here
    const b = raw.replace(/\r$/, '').padEnd(B_LENGTH, ' ');
    if (b.replace(/\s+$/, '').length > B_LENGTH) throw new PdiFileError(`Line ${line}: a B line has ${B_LENGTH} characters, this one has ${r.length}.`);
    const parsed: PdiLine = {
      upc: b.slice(1, 12),
      description: b.slice(12, 37).trim(),
      itemNumber: b.slice(37, 43).trim() || null,
      priceCents: signedNumber(b.slice(43, 49), 'the price', line),
      unitsPerCase: signedNumber(b.slice(51, 57), 'units per case', line),
      quantity: signedNumber(b.slice(57, 62), 'the quantity', line),
    };
    const p = lineProblems(parsed);
    if (p.length) { inv.notes.push(`Line ${line} was left out: ${p[0].message}`); leftOut.set(inv, [...(leftOut.get(inv) ?? []), parsed]); continue; }
    if (b.slice(49, 51) !== 'CA') inv.notes.push(`Line ${line} has "${b.slice(49, 51)}" where CA was expected.`);
    if (b.slice(62, 67) !== '00000') inv.notes.push(`Line ${line} ends "${b.slice(62, 67)}" where 00000 was expected.`);
    inv.lines.push(parsed);
  }
  if (!out.length) throw new PdiFileError('The file must start with an A line.');
  for (const inv of out) {
    const dropped = leftOut.get(inv) ?? [];
    const all = linesTotalCents([...inv.lines, ...dropped]);
    if (all !== inv.header.totalCents) {
      inv.notes.push(`The lines come to ${money(all)}, but the A line says ${money(inv.header.totalCents)}.`);
    }
  }
  return out;
}

// ── Vendors: how a vendor's paper invoice becomes file lines ────────────────

/** What the file needs to know about a vendor (pdi_vendors), set once per vendor by a person or from its Deep Water files. */
export interface VendorRules {
  code: string;                              // its code in PDI ("FRITO"); "" until someone sets it
  name: string;
  sellsBy: 'EACH' | 'CASE';                  // what its quantities count: single items (Frito-Lay) or cases
  itemDigits: 'FIRST6' | 'LAST6' | 'NONE';   // its item numbers in the file's 6 places (Frito-Lay prints 8: the first 6), or none printed
  itemLength?: number | null;                // how many digits its item numbers have, to catch a misread (Frito-Lay 8, Ed F. Davis 6)
}

/** Until a person says which vendor an invoice is from, its lines are shown with these (and the file waits for the vendor). */
export const UNKNOWN_VENDOR: VendorRules = { code: '', name: '', sellsBy: 'EACH', itemDigits: 'NONE' };

/** One item line as printed on the paper invoice. Printed values stay text (leading zeros matter); null where it could not be read. */
export interface PaperLine {
  upc: string | null;           // a full UPC as printed ("0-18200-20038-0"), or only its last digits under a manufacturer number (Frito-Lay)
  description: string | null;
  item?: string | null;         // the vendor's own item number or ID
  quantity: number | null;      // what the vendor counts (single items or cases). Above 0; a return says so below
  units?: number | null;        // the units, when the invoice prints them (PepsiCo: cases x units per case)
  price: string | number | null;  // the price of one of what is counted, after discounts (Frito-Lay EACH COST, Ed F. Davis NET)
  amount: string | number | null; // the line's printed total
  isReturn?: boolean;           // a return or credit line
  manufacturer?: string | null; // a manufacturer number printed over a section of short UPCs (Frito-Lay: 28400)
  group?: string | null;        // the package or section header the line is under ("11OZ PL 1/12 TBG")
  handwritten?: string | null;  // anything written by hand on the line ("5 crossed out, 4 written"): the printed values are in the fields
  per?: string | null;          // what the line's quantity counts when a distributor prints it per line: CS, EA, CTN, BX ("" when not)
  sku?: string | null;          // the vendor's own code printed where the UPC goes, on a line with no barcode (AMS Wholesale "SKU: 21695"):
                                // finds the UPC remembered for it, never written to the file (it is not the vendor item number)
  skip?: boolean;               // left out of the file by a person (no UPC to be had): added in PDI by hand (2026-11-03)
}

/** Where a line's units per case came from: one item (a vendor that counts items), the paper (units / cases, or the package header), a
 *  learned or a person-confirmed value for the product, a guess from its name, or not known (1 is written, 2026-11-03). */
export type UnitsFrom = 'each' | 'paper' | 'learned' | 'confirmed' | 'guess' | 'unknown';
// upcFrom 'memory': the paper printed no UPC and the vendor's item code was matched to the UPC used on an earlier file (2026-11-03)
// skipped: a line a person left out of the file; it has nothing to look at and the file goes without it
export interface ConvertedLine { line: PdiLine; problems: Problem[]; unitsFrom: UnitsFrom | null; upcFrom?: 'memory'; skipped?: true }

/** Cents from money as printed: "1.9500" -> 195, "$1,234.5" -> 123450, ".85" -> 85, "$ 1.95" -> 195; "(1.95)", "$(1.95)", "- 1.95",
 *  "1.95-" and "1.95 CR" -> -195. Null when it is not money as printed, or has part of a cent (none seen on these invoices). */
export function printedCents(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return null;
  let s = v.trim().toUpperCase();
  let negative = false;
  const strip = () => {
    for (;;) {
      if (s.startsWith('$')) s = s.slice(1).trim();
      else if (s.startsWith('-')) { negative = true; s = s.slice(1).trim(); }
      else if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
      else return;
    }
  };
  strip();
  if (/(-|CR)$/.test(s)) { negative = true; s = s.replace(/(-|CR)$/, '').trim(); strip(); }
  const m = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || !/\d/.test(s)) return null;
  const dollars = m[1].replace(/,/g, '').replace(/^0+(?=\d)/, '');
  const decimals = (m[2] ?? '').padEnd(2, '0');
  if (dollars.length > 9 || /[1-9]/.test(decimals.slice(2))) return null;
  const cents = Number(dollars || '0') * 100 + Number(decimals.slice(0, 2));
  return negative && cents ? -cents : cents;
}

/** True for money printed with part of a cent ("1.1875"): read, but the file holds whole cents. */
const partCent = (v: unknown) => typeof v === 'string' && /\.\d{2}\d*[1-9]/.test(v) && printedCents(v.replace(/(\.\d{2})\d+/, '$1')) !== null;

const SEPARATORS = /[\s.\p{Pd}]/gu;   // spaces, dots and dashes between the digits of a printed number
const SEPARATOR = /[\s.\p{Pd}]/u;

/** The file's 11 UPC digits from a UPC as printed. A full UPC's 12th digit is its check digit, dropped once it is shown to match.
 *  A vendor that prints only an item's last digits (Frito-Lay: up to 5) prints its manufacturer number over the section: the rest is 0
 *  and that number. */
/** A UPC-E code's full UPC, without the check digit (11 digits): the number system digit and the six digits, expanded by the standard rule
 *  (04252614 -> 0 42100 00526, check digit 4). */
export function upcEtoA(numberSystem: string, six: string): string {
  const [a, b, c, d4, e, f] = six.split('');
  const middle = f <= '2' ? `${a}${b}${f}0000${c}${d4}${e}` : f === '3' ? `${a}${b}${c}00000${d4}${e}` : f === '4' ? `${a}${b}${c}${d4}00000${e}` : `${a}${b}${c}${d4}${e}0000${f}`;
  return numberSystem + middle;
}

export function fileUpc(printed: string | null | undefined, manufacturer?: string | number | null): { upc: string | null; problems: Problem[] } {
  const no = (message: string, upc: string | null = null, blocking = upc === null) => ({ upc, problems: [{ field: 'upc' as const, message, ...(blocking ? { blocking } : {}) }] });
  if (typeof printed !== 'string' || !printed.trim()) return no('The UPC could not be read.');
  let d = printed.replace(SEPARATORS, '');
  if (!d) return no(`The UPC "${printed}" has no digits: it could not be read.`);
  if (/[A-Za-z]/.test(d)) return no(`The UPC "${printed}" has a letter in it: a digit was probably misread.`);
  if (/\D/.test(d)) return no(`The UPC "${printed}" has a character that is not a digit.`);
  if (/^0+$/.test(d)) return no(`The UPC "${printed}" is all zeros, which is not a product: compare it with the paper.`);
  if (d.length <= 5) {
    const m = String(manufacturer ?? '').replace(/\D/g, '');
    if (m.length !== 5) return no(`Only the last digits of the UPC were read (${printed}): which 5-digit manufacturer number goes before them? Type the whole UPC.`);
    return { upc: '0' + m + d.padStart(5, '0'), problems: [] };
  }
  // an EAN-13 or GTIN-14 of a UPC is shortened only when printed as bare digits: vendors print UPCs with dashes, so a dashed UPC with a
  // 13th digit is more likely a digit read twice than an EAN-13
  if (d.length > 12 && !SEPARATOR.test(printed.trim()) && /^0+$/.test(d.slice(0, d.length - 12))) d = d.slice(d.length - 12);
  if (d.length === 12) {
    // Must be corrected, never accepted (2026-11-03): accepting wrote the first 11 digits, so when the paper prints a shorter code (Blue
    // Bell's 10 digits, read with two zeros in front) a real digit was dropped and PDI got the wrong product.
    if (gs1CheckDigit(d.slice(0, 11)) !== Number(d[11])) {
      const short = d.startsWith('00') ? ` If the paper shows ${d.slice(2)} (10 digits), type that.` : '';
      return no(`The UPC ${printed} does not check out (its last digit should be a check digit). Compare it with the paper and type it exactly as printed.${short}`, d.slice(0, 11), true);
    }
    return { upc: d.slice(0, 11), problems: [] };
  }
  if (d.length === 11) {
    const shifted = gs1CheckDigit('0' + d.slice(0, 10)) === Number(d[10]) ? ' It may also be a whole UPC missing its first 0.' : '';
    return no(`The UPC ${printed} has no check digit (it was cut off or unreadable), so a misread digit cannot be caught: compare it with the paper.${shifted}`, d);
  }
  // a vendor that prints the manufacturer and item numbers only (Blue Bell: 71899 03735), without the 0 in front or the check digit:
  // the file's 11 digits are a 0 and those 10, the same way a Frito-Lay code is completed
  if (d.length === 10) {
    return no(`The UPC ${printed} has 10 digits (no 0 in front, no check digit): the file gets 0${d}. A misread digit cannot be caught, so compare it with the paper.`, '0' + d, false);
  }
  // UPC-E, the short barcode on small packs (candy, gum, tobacco): 8 digits (number system 0 or 1, six digits, the check digit), or the
  // six digits alone. It stands for one full UPC by a fixed rule, so the file gets that UPC.
  if (d.length === 8 && /^[01]/.test(d)) {
    const body = upcEtoA(d[0], d.slice(1, 7));
    if (gs1CheckDigit(body) !== Number(d[7])) return no(`The UPC ${printed} looks like a short UPC-E code but does not check out, so a digit is probably misread: compare it with the paper and correct it.`, null, true);
    return { upc: body, problems: [] };
  }
  if (d.length === 6) {
    // blocking (2026-11-03): six digits are far more often an item code or a cut-off UPC than a short barcode (AMS Wholesale 088125)
    return no(`The UPC ${printed} has only 6 digits: type the full UPC from the product, or the 8 digits under a short barcode.`, null, true);
  }
  if (d.length === 14) return no(`The UPC ${printed} has 14 digits: it looks like the case code, not the item's own UPC. Type the 12-digit UPC of one item.`, null, true);
  if (d.length === 13) return no(`The UPC ${printed} has 13 digits (an international EAN code), and PDI's file holds a 12-digit UPC: type the item's UPC if it has one, or compare with the paper.`, null, true);
  return no(`The UPC "${printed}" has ${d.length} digits; a full UPC has 12.`);
}

/** A guess at units per case from a product's name, for a vendor that counts cases without printing the units (Ed F. Davis):
 *  "24/12oz 2/12 C" -> 2 (two 12-packs), "24/12oz 4/6 B" -> 4, "4/6/12oz" -> 4, "12/24oz B" -> 12 and "12/695ML" -> 12 (big singles),
 *  "18/12oz C" -> 1 (one 18-pack), "24/355ML" -> 1. Null when the name does not say ("MODELO CHELADA NEGRA"), its pack is cut off
 *  ("24/12 2"), or the can is 13 to 18 oz with no pack (singles and packs both happen). An L is litres only for a bottle of 5 L or less
 *  ("24/12 L" is a name cut off after the L of LN). Always shown to a person: on the confirmed Ed F. Davis invoice, 4 of its 40 names
 *  did not give the units Deep Water used. */
export function guessUnitsPerCase(description: string): number | null {
  const d = description.toUpperCase().trim().slice(0, 200);
  const tokens = [...d.matchAll(/(?<!\d)(\d{1,4})\/(\d{1,4}(?:\.\d{1,3})?)(?:\/(\d{1,4}(?:\.\d{1,3})?))?(?!\d)(?:\s*(OZ|ML|CL|LTR|LITER|LITRE|L)(?![A-Z]))?/g)]
    .map((m) => {
      const b = +m[2];
      let unit = m[4] ?? '';
      if (/^L/.test(unit) && b > 5) unit = '';        // 12 L is not a drink: a cut-off word
      if (unit === 'ML' && b < 100) unit = '';
      return { a: +m[1], b, triple: m[3] !== undefined, unit, end: (m.index ?? 0) + m[0].length };
    });
  const triple = tokens.find((t) => t.triple);
  if (triple) return triple.a;                                                    // 4/6/12OZ: four 6-packs
  const caseSize = tokens.find((t) => t.unit) ?? tokens.find((t) => t.a >= 12);  // 24/12OZ: how many, how big
  const pack = tokens.find((t) => t !== caseSize && !t.unit && t.a >= 2 && t.a < 12); // 2/12, 4/6, 3/8: how many packs
  if (pack) return pack.a;
  if (!caseSize) {
    // a box counted by pieces, as candy and snack vendors print it: "SNICKERS KING 24CT", "GUM 12 COUNT" (still only a guess to confirm)
    const ct = d.match(/(?<![\d/.])(\d{1,4})\s*(?:CT|COUNT)(?![A-Z])/);
    return ct && +ct[1] >= 2 ? +ct[1] : null;
  }
  if (/^\d+\/?$/.test(d.slice(caseSize.end).replace(/[.\s]/g, ''))) return null; // "24/12 2": the pack was cut off
  const ounces = caseSize.unit === 'ML' ? caseSize.b / 29.5735 : caseSize.unit === 'CL' ? caseSize.b / 2.95735
    : /^L/.test(caseSize.unit) ? caseSize.b * 33.814 : caseSize.b;
  if (ounces >= 19) return caseSize.a;
  return ounces <= 12.05 ? 1 : null;
}

/** A package header's units per case: "11OZ PL 1/12 TBG" -> 12, "12OZ CN 12/2 FM" -> 2 (two 12-packs), "5G BIB" -> 1,
 *  "1/2 GAL PL 1/6" -> 6 (the last count, not a size like 1/2 GAL). */
export function unitsFromPackage(group: string | null | undefined): number | null {
  if (!group) return null;
  const g = group.toUpperCase().slice(0, 200);
  const pairs = [...g.matchAll(/(?<!\d)(\d{1,4})\/(\d{1,4})(?!\d)(?!\s*(?:GAL|G|L|OZ|ML|LTR)\b)/g)];
  if (pairs.length) return +pairs[pairs.length - 1][2];
  return /\bBIB\b/.test(g) ? 1 : null;
}

export interface KnownUnits { units: number; from: 'learned' | 'confirmed' }
export interface ConvertContext {
  knownUnits?: (upc: string) => KnownUnits | undefined; // what the app remembers for a product of this vendor, by its 11 file digits
  knownUpc?: (itemKey: string) => string | undefined;    // the UPC used before for this vendor's item code (pdi_product_upcs)
  today?: string;                                        // YYYY-MM-DD, to question a date far from it
}

/** One paper line as the file's line, with what a person should look at. */
/** A vendor item code as the UPC memory keys it: capitals, letters and digits only ("wb-20 oz" -> WB20OZ). Empty when none is printed. */
export function itemKey(item: string | null | undefined): string {
  return typeof item === 'string' ? item.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40) : '';
}

/** What a per-line unit as printed counts: 'case' (CS, CA, CASE, CTN, CARTON, BX, BOX, PK, PACK), 'each' (EA, EACH, UN, UNIT, PC, PCS, BTL,
 *  CAN), or null when none is printed or it is something else. */
export function perKind(per: string | null | undefined): 'case' | 'each' | null {
  const p = typeof per === 'string' ? per.toUpperCase().replace(/[^A-Z]/g, '') : '';
  if (/^(CS|CA|CASE|CASES|CTN|CARTON|BX|BOX|PK|PACK)$/.test(p)) return 'case';
  if (/^(EA|EACH|UN|UNIT|UNITS|PC|PCS|PIECE|BTL|BOTTLE|CAN)$/.test(p)) return 'each';
  return null;
}

/** The code a line's UPC is remembered by (pdi_product_upcs): its SKU printed in the UPC's place, else its vendor item number. */
export function lineKey(p: PaperLine): string {
  return itemKey(p.sku) || itemKey(p.item);
}

/** Whether a paper line printed no UPC at all (as opposed to one that cannot be read). */
const noUpcPrinted = (upc: string | null | undefined) => typeof upc !== 'string' || !upc.trim();

/** The vendor's own code (SKU) printed where the UPC goes, moved out of the UPC (2026-11-03, AMS Wholesale prints "SKU:" over both its
 *  barcodes and its own codes): a short code with no item or manufacturer number beside it (21695, 088125), or a code read into both the
 *  UPC and the item that is no whole barcode. Its UPC is typed once and remembered for it; the file never carries it. Frito-Lay's short
 *  codes come with a manufacturer number and stay. */
export function skuFromUpcColumn(paper: PaperInvoice): PaperInvoice {
  let moved = false;
  const lines = paper.lines.map((p) => {
    if (itemKey(p.sku) || noUpcPrinted(p.upc)) return p;
    const d = (p.upc as string).replace(SEPARATORS, '');
    const short = /^\d{1,6}$/.test(d) && !/^0+$/.test(d) && !itemKey(p.item) && !(typeof p.manufacturer === 'string' && p.manufacturer.trim());
    const both = itemKey(p.upc) === itemKey(p.item) && (() => { const f = fileUpc(p.upc, p.manufacturer); return !f.upc || f.problems.length > 0; })();
    if (!short && !both) return p;
    moved = true;
    return { ...p, sku: (p.upc as string).trim(), upc: '', ...(both ? { item: '' } : {}) };
  });
  return moved ? { ...paper, lines } : paper;
}

export function convertPaperLine(vendor: VendorRules, p: PaperLine, ctx: ConvertContext = {}): ConvertedLine {
  const problems: Problem[] = [];
  const say = (field: ProblemField, message: string, blocking = false) => problems.push({ field, message, ...(blocking ? { blocking } : {}) });
  const who = vendor.name || 'This vendor';
  // no UPC on the paper: the one used for this SKU or item code on an earlier file, if there is one (typed once per product, not every
  // time). One column holding a UPC on some lines and the vendor's own code on others (AMS Wholesale, 2026-11-03): a code there is a UPC
  // only when it is a whole barcode that checks out (skuFromUpcColumn moves the others to sku).
  const checked = fileUpc(p.upc, p.manufacturer);
  const sameAsItem = !noUpcPrinted(p.upc) && !!itemKey(p.item) && itemKey(p.upc) === itemKey(p.item);
  const itemOnly = noUpcPrinted(p.upc) || (sameAsItem && (!checked.upc || checked.problems.length > 0));
  const key = lineKey(p);
  const memoryUpc = itemOnly && key ? ctx.knownUpc?.(key) : undefined;
  const u = memoryUpc ? { upc: memoryUpc, problems: [] as Problem[] } : itemOnly && key ? { upc: null as string | null, problems: [] as Problem[] } : checked;
  if (!memoryUpc && itemOnly && key) {
    const what = itemKey(p.sku) ? `SKU ${p.sku}` : `item ${p.item}`;
    u.problems = [{ field: 'upc', message: `No UPC is printed for ${what}: type its UPC once (from the product) and it is remembered for ${vendor.name ? vendor.name + "'s" : "this vendor's"} next invoices.`, blocking: true }];
  }
  problems.push(...u.problems);
  const description = typeof p.description === 'string' ? p.description : '';
  const price = printedCents(p.price);
  if (price === null) {
    say('price', partCent(p.price) ? `The price ${p.price} has part of a cent, which the file cannot hold: type it in whole cents.`
      : `The price "${p.price ?? ''}" could not be read: type it in.`, true);
  } else if (price < 0) say('price', 'The price is below zero: mark a return as a return and keep the printed price.', true);
  const qty = typeof p.quantity === 'number' && Number.isSafeInteger(p.quantity) && p.quantity > 0 ? p.quantity : null;
  if (qty === null) say('quantity', `The quantity "${p.quantity ?? ''}" should be a whole number above 0.`, true);

  // the vendor's item number, in the file's 6 places. PDI does not need it (Deep Water left it blank for PepsiCo), so one that is not
  // printed, has letters, or has the wrong length is left blank, never a stop (2026-11-03: every AMS line waited for an item number). A
  // vendor whose item numbers have a set length gets a note when one does not fit it: likely a misread digit.
  let item: string | null = null;
  if (vendor.itemDigits !== 'NONE') {
    const digits = typeof p.item === 'string' ? p.item.replace(SEPARATORS, '') : '';
    if (/^\d+$/.test(digits) && (!vendor.itemLength || digits.length === vendor.itemLength)) item = vendor.itemDigits === 'LAST6' ? digits.slice(-6) : digits.slice(0, 6);
    else if (digits && vendor.itemLength) say('item', `The item number "${p.item}" is not ${vendor.itemLength} digits like ${who}'s, so the file leaves it blank. Correct it if it was misread.`);
  }

  // units per case: one, for a vendor that counts items; else as printed, from the package header, remembered, or guessed from the name
  let units = 0;
  let unitsFrom: UnitsFrom | null = null;
  // a distributor that prints per line whether it counts cases or single items (CS / EA): a single-item line of a case vendor is 1 a
  // "case" in the file, and a case line of a single-item vendor is pointed out (2026-11-03)
  const per = perKind(p.per);
  if (vendor.sellsBy === 'EACH' && per === 'case') say('units', `This line is counted in ${String(p.per).trim()} (cases), but ${who} is set up to count single items: is the quantity right, and should the vendor count cases?`);
  if (vendor.sellsBy === 'EACH' || per === 'each') { units = 1; unitsFrom = vendor.sellsBy === 'EACH' ? 'each' : 'paper'; }
  else {
    const pack = unitsFromPackage(p.group);
    const remembered = u.upc && /^\d{11}$/.test(u.upc) ? ctx.knownUnits?.(u.upc) : undefined;
    if (typeof p.units === 'number') {
      const printedUnits = Number.isSafeInteger(p.units) && p.units > 0 ? p.units : null;
      if (printedUnits === null) say('units', `The units (${p.units}) must be above 0.`, true);
      else if (qty === null) say('units', 'Units per case comes from the cases, which could not be read.', true);
      else if (printedUnits % qty === 0) {
        units = printedUnits / qty; unitsFrom = 'paper';
        if (pack !== null && pack !== units) say('units', `${count(printedUnits, 'unit', 'units')} in ${count(qty, 'case', 'cases')} is ${units} a case, but the package header (${p.group}) says ${pack}.`);
      } else say('units', `The units (${printedUnits}) do not divide evenly by the cases (${qty}).`, true);
    } else if (remembered) { units = remembered.units; unitsFrom = remembered.from; }
    else if (pack !== null) { units = pack; unitsFrom = 'paper'; }
    else {
      const guess = guessUnitsPerCase(description);
      if (guess) { units = guess; unitsFrom = 'guess'; say('units', `Units per case (${guess}) is a guess from the name: check it once and it is remembered.`); }
      // not known: the file gets 1 and the invoice says so once (a stop on every line of a new vendor before 2026-11-03)
      else { units = 1; unitsFrom = 'unknown'; }
    }
  }

  const amount = printedCents(p.amount);
  if (amount === null) say('amount', `The line total "${p.amount ?? ''}" could not be read, so the line cannot be checked: compare it with the paper.`);
  else if (amount < 0 && !p.isReturn) say('amount', 'The line total is below zero: is this a return?');
  else if (price !== null && price >= 0 && qty !== null && Math.abs(amount) !== price * qty) {
    say('amount', `${qty} at ${money(price)} is ${money(price * qty)}, but the line says ${String(p.amount).trim()}.`);
  }
  // A driver's handwriting (a crossed-out quantity, "1 short") is what was really delivered, but the reader copies only the print: a
  // person looks and corrects the cells (2026-11-03; a short delivery otherwise passed every check with the printed numbers)
  const hand = typeof p.handwritten === 'string' ? p.handwritten.trim() : '';
  if (hand) say('handwriting', `Handwriting on this line: "${hand.slice(0, 120)}". The file uses the values in the cells: if it changes the quantity or price, correct them.`);
  const line: PdiLine = {
    upc: u.upc ?? '', description, itemNumber: item, priceCents: price !== null && price >= 0 ? price : 0, unitsPerCase: units,
    quantity: qty === null ? 0 : p.isReturn ? -qty : qty,
  };
  // what the file itself would refuse, where it is not already said
  for (const lp of lineProblems(line)) if (!problems.some((x) => x.field === lp.field)) problems.push(lp);
  return { line, problems, unitsFrom, ...(memoryUpc ? { upcFrom: 'memory' as const } : {}) };
}

/** What the paper prints besides its lines, to check them against: subtotals per package group (in order), the whole invoice's counts, and
 *  charges that are not item lines (a deposit, a fuel surcharge, a tax). */
export interface PaperInvoice {
  invoiceNumber: string | null;
  date: string | null;              // YYYY-MM-DD
  total: string | number | null;
  lines: PaperLine[];
  groups?: { name: string; cases?: number; units?: number; amount?: string }[];
  summary?: { cases?: number; units?: number };
  charges?: { name: string; amount: string | null }[];
  handwritten?: string | null;      // anything written by hand outside the lines
}

/** A whole paper invoice as the file's header and lines, with every line's problems and the invoice's own. `vendor` is null until a
 *  person says which vendor the invoice is from. */
export function convertInvoice(vendor: VendorRules | null, paper: PaperInvoice, ctx: ConvertContext = {}) {
  paper = skuFromUpcColumn(paper);
  const rules = vendor ?? UNKNOWN_VENDOR;
  const lines: ConvertedLine[] = paper.lines.map((p) => {
    const c = convertPaperLine(rules, p, ctx);
    return p.skip ? { ...c, problems: [], skipped: true } : c;
  });
  const problems: Problem[] = [];
  const say = (field: ProblemField, message: string, blocking = false) => problems.push({ field, message, ...(blocking ? { blocking } : {}) });
  if (!vendor) say('supplier', 'Which vendor is this invoice from? Choose it, or add it as a new vendor.', true);
  else if (!vendor.code) say('supplier', `Set ${vendor.name}'s code in PDI to make the file.`, true);
  const printedNumber = typeof paper.invoiceNumber === 'string' ? paper.invoiceNumber.trim() : '';
  // The file's invoice number is digits only (PDI reads the A line by column). Letters and signs are left out ("INV-004512" -> 4512,
  // "881234A" -> 881234) and a person ticks it once; before 2026-11-03 such a vendor could never make a file at all.
  const digits = printedNumber.replace(/\D/g, '');
  // The file holds 10 digits: a longer number keeps its last 10, the part that changes from one invoice to the next, and a person ticks
  // it once (2026-11-03, Blue Bell prints 12 digits: 020122966546 -> 0122966546)
  const significant = digits.replace(/^0+(?=\d)/, '');
  const invoiceNumber = significant.length > 10 ? significant.slice(-10).replace(/^0+(?=\d)/, '') : significant;
  if (!printedNumber) say('invoice', 'The invoice number could not be read.', true);
  else if (!digits) say('invoice', `The invoice number "${printedNumber}" has no digits, and the file holds digits only: type the number.`, true);
  else if (/[^\d\s\p{Pd}]/u.test(printedNumber)) {
    say('invoice', `The invoice number was printed "${printedNumber}"; the file holds digits only, so it will say ${invoiceNumber}. Check that PDI shows this invoice the same way.`);
  } else if (/[\s\p{Pd}]/u.test(printedNumber)) {   // a dash or space inside: joined, but a person says whether all of it is the number
    say('invoice', `The invoice number was printed "${printedNumber}"; the file will say ${invoiceNumber}. Is all of it the invoice number?`);
  }
  if (digits && significant.length > 10) {
    say('invoice', `The invoice number ${printedNumber} is longer than the file's 10 places, so the file gets the last 10: ${significant.slice(-10)}. Check that PDI shows this invoice the same way.`);
  }
  const totalCents = printedCents(paper.total);
  if (totalCents === null) say('total', partCent(paper.total) ? `The invoice total ${paper.total} has part of a cent: type it in whole cents.` : `The invoice total "${paper.total ?? ''}" could not be read: type it in.`, true);
  const header: PdiHeader = {
    supplierCode: rules.code, invoiceNumber, date: typeof paper.date === 'string' ? paper.date.trim() : '', totalCents: totalCents ?? 0,
  };
  for (const hp of headerProblems(header)) if (!problems.some((x) => x.field === hp.field)) problems.push(hp);
  if (ctx.today && !problems.some((x) => x.field === 'date') && (header.date > addStoreDays(ctx.today, 7) || header.date < addStoreDays(ctx.today, -400))) {
    say('date', `The invoice date ${header.date} is far from today: is the date read right?`);
  }
  if (!lines.length) say('lines', 'No item lines were found.', true);
  else if (lines.every((c) => c.skipped)) say('lines', 'Every line is left out of the file: put at least one back.', true);
  // lines left out (a product with no UPC to be had, 2026-11-03): the file keeps the printed total, as it does when charges are printed
  const left = lines.filter((c) => c.skipped);
  if (left.length && left.length < lines.length) {
    say('lines', `${count(left.length, 'line is', 'lines are')} left out of the file (${money(linesTotalCents(left.map((c) => c.line)))}): add ${left.length === 1 ? 'it' : 'them'} in PDI by hand. The file keeps the invoice total.`);
  }
  const handNote = typeof paper.handwritten === 'string' ? paper.handwritten.trim() : '';
  if (handNote) say('handwriting', `Handwriting on the invoice: "${handNote.slice(0, 160)}". If it changes the total or what was delivered, correct the invoice to match.`);
  const fileLines = lines.map((c) => c.line);
  const unreadable = fileLines.filter((l) => l.quantity === 0 || l.unitsPerCase === 0).length;
  const unknownUnits = lines.filter((c) => c.unitsFrom === 'unknown' && !c.skipped).length;
  if (unknownUnits) {
    say('units', `Units per case is not known yet for ${count(unknownUnits, 'line', 'lines')}, so the file says 1 for ${unknownUnits === 1 ? 'it' : 'them'}. Type the real number on a line if PDI should have it: it is remembered for the next invoice.`);
  }
  // units per case depend on the vendor (cases or single items): until it is known (and while a line's is not), only cases and money are
  // checked
  const unitsKnown = !!vendor && !unknownUnits;

  // the total: the lines, or the lines and the charges printed besides them (the file carries the lines and the printed total)
  const sum = linesTotalCents(fileLines);
  const charges = (paper.charges ?? []).filter((c) => c && typeof c.name === 'string').map((c) => ({ name: c.name.trim(), cents: printedCents(c.amount) }));
  for (const c of charges) if (c.cents === null) say('total', `The charge "${c.name}" could not be read: compare it with the paper.`);
  const chargeCents = charges.reduce((n, c) => n + (c.cents ?? 0), 0);
  const chargeList = charges.filter((c) => c.cents).map((c) => `${c.name} ${money(c.cents!)}`).join(', ');
  // charges read while the lines alone already make the total: one was read that is not part of it, or a line holds it too (2026-11-03)
  if (totalCents !== null && sum === totalCents && chargeCents) {
    say('total', `The lines alone come to the total, yet charges were read besides them (${chargeList}): is a charge read that is not on the invoice, or is it inside a line?`);
  }
  if (totalCents !== null && sum !== totalCents) {
    if (chargeCents && sum + chargeCents === totalCents) {
      say('total', `The total includes charges besides the lines (${chargeList}). The file carries the lines and the printed total: check how PDI should get these charges.`);
    } else {
      say('total', `The lines come to ${money(sum)}${chargeCents ? ` (and the charges ${money(chargeCents)})` : ''}, but the invoice total is ${money(totalCents)}.`);
    }
  }

  // printed subtotals, matched in order to the runs of lines under each package header; a header read wrong, or a subtotal missing,
  // is named once and the rest still line up
  const grouped = paper.lines.some((p) => typeof p.group === 'string' && p.group.trim());
  if (paper.groups?.length) {
    const runs: { name: string | null; start: number; end: number }[] = [];
    paper.lines.forEach((p, i) => {
      const name = typeof p.group === 'string' && p.group.trim() ? p.group.trim() : null;
      const last = runs[runs.length - 1];
      if (last && last.name === name) last.end = i + 1; else runs.push({ name, start: i, end: i + 1 });
    });
    const unmatched = (r: { name: string | null; start: number; end: number }) => {
      const which = r.end - r.start === 1 ? `Line ${r.start + 1}` : `Lines ${r.start + 1} to ${r.end}`;
      const has = r.end - r.start === 1 ? 'has' : 'have';
      say('group', r.name ? `${which} (under "${r.name}") ${has} no printed subtotal: is the package header read right?`
        : `${which} ${has} no package header: which package ${r.end - r.start === 1 ? 'is it' : 'are they'} under?`);
    };
    let at = 0;
    for (const g of paper.groups) {
      const k = runs.findIndex((r, i) => i >= at && r.name === g.name.trim());
      if (k < 0) { say('group', `${g.name}: no lines were read under this package header.`); continue; }
      runs.slice(at, k).forEach(unmatched);
      at = k + 1;
      const run = fileLines.slice(runs[k].start, runs[k].end);
      const cases = run.reduce((n, l) => n + l.quantity, 0);
      const units = run.reduce((n, l) => n + l.quantity * l.unitsPerCase, 0);
      const cents = linesTotalCents(run);
      const amount = g.amount === undefined ? null : printedCents(g.amount);
      if (g.amount !== undefined && amount === null) say('group', `${g.name}: the subtotal "${g.amount}" could not be read.`);
      const off: string[] = [];
      if (g.cases !== undefined && cases !== g.cases) off.push(`${count(cases, 'case', 'cases')} where the subtotal says ${g.cases}`);
      if (unitsKnown && g.units !== undefined && units !== g.units) off.push(`${count(units, 'unit', 'units')} where it says ${g.units}`);
      if (amount !== null && cents !== amount) off.push(`${money(cents)} where it says ${money(amount)}`);
      if (off.length) say('group', `${g.name}: the lines come to ${off.join(', and ')}.`);
    }
    runs.slice(at).forEach(unmatched);
  } else if (grouped) {
    say('group', 'Package headers were read but no subtotals, so the lines cannot be checked against them: compare a few lines with the paper.');
  }
  const sales = fileLines.filter((l) => l.quantity > 0);
  const salesCases = sales.reduce((n, l) => n + l.quantity, 0);
  const salesUnits = sales.reduce((n, l) => n + l.quantity * l.unitsPerCase, 0);
  const why = unreadable ? `: ${count(unreadable, 'line', 'lines')} could not be read in full` : ': is a line missing or read twice?';
  if (paper.summary?.cases !== undefined && salesCases !== paper.summary.cases) say('lines', `The lines hold ${count(salesCases, 'case', 'cases')}, but the invoice says ${paper.summary.cases}${why}`);
  if (unitsKnown && paper.summary?.units !== undefined && salesUnits !== paper.summary.units) say('lines', `The lines hold ${count(salesUnits, 'unit', 'units')}, but the invoice says ${paper.summary.units}${why}`);
  if (unitsKnown && lines.some((c) => c.unitsFrom === 'paper') && !paper.groups?.length && paper.summary?.units === undefined) {
    say('lines', 'The units per case could not be checked: no subtotals or total units were read. Compare a few lines with the paper.');
  }
  return { header, lines, problems };
}
