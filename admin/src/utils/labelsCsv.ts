// The Labels catalog as a spreadsheet (CSV that opens in Excel). One row per item with its base price and deal, and, when the
// coverage list could be loaded, how many stores have it, how many have it printed and current, and each store's own price.

export interface CsvLabel {
  id: string;
  productName: string;
  brand?: string | null;
  category: string | null;
  barcode: string | null;
  priceText: string | null;
  dealText: string | null;
  template: string;
  updatedAt: string;
}

export interface CsvCoverage {
  stores: { id: string; name: string }[];
  labels: { id: string; addedCount: number; coverage: { storeId: string; status: string; priceText: string | null; hasOverride: boolean }[] }[];
}

// A cell starting with one of these is run as a formula by Excel and Google Sheets. Product names can come from barcode lookups,
// so text cells that start with one get a leading apostrophe and are shown as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

function textCell(v: string | null | undefined): string {
  const s = v ?? '';
  return `"${(FORMULA_START.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

// A barcode is digits that must stay text: Excel would drop the leading zero (049000028911) and show long ones as 4.9E+10
function barcodeCell(v: string | null): string {
  if (!v) return '""';
  return /^\d+$/.test(v) ? `="${v}"` : textCell(v);
}

function numberCell(v: string | null): string {
  return v != null && /^\d+(\.\d+)?$/.test(v) ? v : textCell(v);
}

export function labelsCsv(labels: CsvLabel[], templateNames: Record<string, string>, coverage: CsvCoverage | null): string {
  const byId = new Map((coverage?.labels ?? []).map(l => [l.id, l]));
  const storeName = new Map((coverage?.stores ?? []).map(s => [s.id, s.name]));
  const head = ['Product', 'Brand', 'Category', 'Barcode', 'Base price', 'Deal', 'Design', 'Updated'];
  if (coverage) head.push('Stores with it', 'Printed and current', 'Needs reprint', 'Store prices (own price)');
  const rows = labels.map(l => {
    const row = [
      textCell(l.productName), textCell(l.brand), textCell(l.category), barcodeCell(l.barcode), numberCell(l.priceText), textCell(l.dealText),
      textCell(templateNames[l.template] || l.template), textCell(new Date(l.updatedAt).toLocaleDateString('en-CA')),
    ];
    if (coverage) {
      const c = byId.get(l.id);
      const cov = c?.coverage ?? [];
      const own = cov.filter(x => x.hasOverride && x.priceText).map(x => `${storeName.get(x.storeId) ?? 'Store'} $${x.priceText}`);
      row.push(
        String(c?.addedCount ?? 0),
        String(cov.filter(x => x.status === 'printed').length),
        String(cov.filter(x => x.status === 'needs_reprint').length),
        textCell(own.join('; ')),
      );
    }
    return row.join(',');
  });
  // The byte order mark tells Excel the file is UTF-8 (names with accents, the $ and ; stay right); CRLF is what Excel expects
  return '﻿' + [head.map(h => textCell(h)).join(','), ...rows].join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
