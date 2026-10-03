// Reading an edited Labels export (utils/labelsCsv.ts writes it). Columns are found by their header, so a file with columns moved or
// removed still reads; extra columns (store counts, Updated) are ignored. Undoes what the export did to keep Excel from changing cells:
// ="049000028911" barcodes and the apostrophe in front of a cell that starts like a formula.

export interface ImportRow {
  line: number;
  productName?: string | null;
  brand?: string | null;
  category?: string | null;
  barcode?: string | null;
  priceText?: string | null;
  dealText?: string | null;
}

export interface ParsedImport {
  rows: ImportRow[];
  dealColumn: boolean;
  problem: string | null;   // the whole file cannot be read
}

/** CSV text to rows of cells (quotes, doubled quotes, commas and line breaks inside quotes, CRLF or LF). */
export function csvCells(text: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let row: string[] = [], cell = '', quoted = false, line = 1, rowLine = 1;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') line++; cell += ch; }
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;   // a quote opens a quoted cell only at its start (="0490..." is text)
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) out.push({ line: rowLine, cells: row });
      row = []; line++; rowLine = line;
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) out.push({ line: rowLine, cells: row });
  return out;
}

/** A cell as typed: ="0490..." back to 0490..., and the export's apostrophe guard removed. */
function clean(v: string | undefined): string | null {
  if (v == null) return null;
  let t = v.trim();
  const formula = /^="(.*)"$/.exec(t);
  if (formula) t = formula[1];
  if (t.startsWith("'") && /^'[=+\-@]/.test(t)) t = t.slice(1);
  return t === '' ? null : t;
}

const HEADERS: Record<keyof Omit<ImportRow, 'line'>, string[]> = {
  productName: ['product', 'product name', 'name', 'item'],
  brand: ['brand'],
  category: ['category'],
  barcode: ['barcode', 'upc'],
  priceText: ['base price', 'price'],
  dealText: ['deal', 'deal text'],
};

export function parseLabelsCsv(text: string): ParsedImport {
  const table = csvCells(text);
  if (table.length === 0) return { rows: [], dealColumn: false, problem: 'The file is empty.' };
  const head = table[0].cells.map((h) => (clean(h) ?? '').toLowerCase());
  const col: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (const [field, names] of Object.entries(HEADERS) as [keyof typeof HEADERS, string[]][]) {
    const i = head.findIndex((h) => names.includes(h));
    if (i >= 0) col[field] = i;
  }
  if (col.productName == null && col.barcode == null) {
    return { rows: [], dealColumn: false, problem: 'This does not look like a Labels export: it needs a "Product" or a "Barcode" column. Export the list from this page, edit it, and import that file.' };
  }
  const rows = table.slice(1).map(({ line, cells }) => {
    const r: ImportRow = { line };
    for (const [field, i] of Object.entries(col) as [keyof typeof HEADERS, number][]) r[field] = clean(cells[i]);
    return r;
  });
  return { rows, dealColumn: col.dealText != null, problem: rows.length === 0 ? 'The file has a header but no items.' : null };
}
