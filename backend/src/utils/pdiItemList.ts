// A store's item list as PDI knows it (2026-11-06), read from PDI's "Current inventory by item" report: the Excel file PDI saves (named
// .xls but really .xlsx), or the same report saved as CSV. PDI's scan codes are UPCs without their check digit, as numbers, so Excel has
// dropped their leading zeros (2840033181 is 0-28400-33181-x); they are padded back to PDI's 11 places, the same 11 the invoice file
// carries. Columns are found by their headings, so a report with its columns in another order (or with vendor columns added) reads too.
// The report's counts are never used: most are below zero. No library: an .xlsx is a zip of XML, read with Node's own zlib.
import { inflateRawSync } from 'zlib';
import { barcodeKey, gs1CheckDigit } from './barcode';
import { upcEtoA } from './pdiInvoice';

export interface PdiItemRow {
  code: string;           // PDI's scan code, digits, padded to 11 when shorter
  upcKey: string;         // the matching key of the full barcode (check digit added to an 11-digit code)
  name: string;
  department: string | null;
  vendor: string | null;
  costCents: number | null;
  priceCents: number | null;
}

export class PdiItemListError extends Error {}

export const MAX_ITEMS = 50_000;

// ── Reading the file ────────────────────────────────────────────────────────

/** The files inside a zip, by name (only the ones asked for are unpacked). */
function unzip(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  // the end of central directory record: its signature, searched from the end (a zip comment can follow it)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new PdiItemListError('The file could not be opened as an Excel file. Save it from Excel as .xlsx or CSV and try again.');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, method === 0 ? data : inflateRawSync(data));
  }
  return out;
}

const decode = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
  const k = e.toLowerCase();
  if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'amp') return '&'; if (k === 'quot') return '"'; if (k === 'apos') return "'";
  return String.fromCodePoint(k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});
const textOf = (xml: string) => decode([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const column = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** The first sheet of an .xlsx as rows of cell text (numbers as written in the file, so long scan codes keep every digit). */
export function readXlsx(buf: Buffer): string[][] {
  const files = unzip(buf, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || n.startsWith('xl/worksheets/sheet'));
  const shared = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  // the first sheet in the workbook's order (not always sheet1.xml)
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = files.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined;
  if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheet = files.get(sheetPath)?.toString('utf8');
  if (!sheet) throw new PdiItemListError('The Excel file has no sheet to read.');
  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(inner) : decode(v ?? '');
      const idx = ref ? column(ref) : row.length;
      while (row.length < idx) row.push('');
      row[idx] = value;
    }
    rows.push(row);
  }
  return rows;
}

/** A CSV file as rows (quoted fields with commas, quotes and line breaks inside them). */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ── Turning rows into items ─────────────────────────────────────────────────

const clean = (s: string | undefined) => (s ?? '').replace(/[ \s]+/g, ' ').trim();

/** PDI's scan code as digits: "2840033181", 2840033181 written as "2.840033181E9", or "02840033181". Null when it is not a code. */
export function scanCode(raw: string | undefined): string | null {
  let s = clean(raw);
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '');
  else if (/^\d(\.\d+)?E\+?\d+$/i.test(s)) { const n = Number(s); if (!Number.isSafeInteger(n)) return null; s = String(n); }
  else return null;
  if (!/^\d{1,14}$/.test(s) || /^0+$/.test(s)) return null;
  return s.length <= 11 ? s.padStart(11, '0') : s;
}

/** The PDI matching key of a barcode as scanned or typed (2026-11-10). PDI lists small packs (gum, candy, cigarette packs) under their
 *  full UPC (Marlboro 02820017833), while the pack's short UPC-E barcode reads as 8 digits (0, six digits, the check digit): those are
 *  expanded first, when the check digit agrees. Every other barcode is matched on its digits, as everywhere (utils/barcode.ts). */
export function pdiKey(barcode: string): string {
  const b = barcode.trim();
  if (/^[01]\d{7}$/.test(b)) {
    const body = upcEtoA(b[0], b.slice(1, 7));
    if (gs1CheckDigit(body) === Number(b[7])) return barcodeKey(body + b[7]);
  }
  return barcodeKey(b);
}

/** The matching key of the barcode a code stands for: an 11-digit code is a UPC without its check digit, so the check digit is added. */
export function upcKeyOf(code: string): string {
  return barcodeKey(code.length === 11 ? code + gs1CheckDigit(code) : code);
}

function cents(raw: string | undefined): number | null {
  const s = clean(raw).replace(/[$,]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isSafeInteger(n) && n >= 0 && n < 100_000_000 ? n : null;
}

const HEAD = {
  code: /^(scan\s*code|upc|barcode|item\s*code|plu)$/i,
  name: /^(item\s*name|description|item\s*description|name)$/i,
  department: /^(department|dept)$/i,
  vendor: /^(vendor|vendor\s*name|supplier)$/i,
  cost: /^(cost|unit\s*cost)$/i,
  price: /^(price|retail|retail\s*price|unit\s*price)$/i,
};

/** The items in a PDI item report (rows as read from the file). Items without a usable code or name are skipped and counted; a code
 *  listed twice keeps its first line. */
export function itemsFromRows(rows: string[][]): { items: PdiItemRow[]; skipped: number; duplicates: number } {
  const headAt = rows.slice(0, 40).findIndex((r) => r.some((c) => HEAD.code.test(clean(c))) && r.some((c) => HEAD.name.test(clean(c))));
  if (headAt < 0) throw new PdiItemListError('This does not look like PDI\'s item report: no "Scan Code" and "Item Name" columns were found.');
  const head = rows[headAt].map(clean);
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const at = { code: col(HEAD.code), name: col(HEAD.name), department: col(HEAD.department), vendor: col(HEAD.vendor), cost: col(HEAD.cost), price: col(HEAD.price) };
  const items: PdiItemRow[] = [];
  const seen = new Set<string>();
  let skipped = 0, duplicates = 0;
  for (const r of rows.slice(headAt + 1)) {
    if (!r.some((c) => clean(c))) continue;
    const code = scanCode(r[at.code]);
    const name = clean(r[at.name]).slice(0, 120);
    if (!code || !name) { if (!/^total$/i.test(clean(r[at.code]))) skipped++; continue; }
    if (seen.has(code)) { duplicates++; continue; }
    seen.add(code);
    const opt = (i: number) => (i >= 0 ? clean(r[i]).slice(0, 80) || null : null);
    items.push({
      code, upcKey: upcKeyOf(code), name, department: opt(at.department), vendor: opt(at.vendor),
      costCents: at.cost >= 0 ? cents(r[at.cost]) || null : null, priceCents: at.price >= 0 ? cents(r[at.price]) || null : null,
    });
    if (items.length > MAX_ITEMS) throw new PdiItemListError(`The file has more than ${MAX_ITEMS.toLocaleString()} items: is it one store's report?`);
  }
  if (!items.length) throw new PdiItemListError('No items were found under the column headings.');
  return { items, skipped, duplicates };
}

/** A PDI item report file (.xlsx, even when named .xls, or .csv) to items. */
export function readItemReport(buf: Buffer): { items: PdiItemRow[]; skipped: number; duplicates: number } {
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return itemsFromRows(readXlsx(buf));
  // the old binary .xls (Excel 97-2003) starts with this signature: it cannot be read here
  if (buf.length >= 8 && buf.readUInt32LE(0) === 0xe011cfd0) throw new PdiItemListError('This is an old Excel 97-2003 file. Open it in Excel, save it as .xlsx or CSV, and upload that.');
  return itemsFromRows(readCsv(buf.toString('utf8').replace(/^﻿/, '')));
}
