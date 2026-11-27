import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { code128ToSvg } from './code128';

export interface PrintItem {
  id: string;
  name: string;
  quantity?: string;
  category?: string;
  priority: 'URGENT' | 'NORMAL' | 'LOW';
  status: 'PENDING' | 'ORDERED' | 'RECEIVED' | 'REMOVED';
  source: 'MANAGER' | 'EMPLOYEE_REQUEST';
}

export interface CatalogEntry {
  barcode: string;
  name: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rendered statically at HTML-build time (not via a runtime <script> once
// the page is loaded), see code128.ts for why.
// Short bars with the digits beside them (owner 2026-11-26: at least 30 items a page; rows were about 14 a page)
function renderBarcodeSvg(barcode: string): string {
  const HEIGHT = 20;
  const { rects, modules } = code128ToSvg(barcode, HEIGHT, 2);
  return `<svg viewBox="0 0 ${modules} ${HEIGHT}" preserveAspectRatio="none" fill="#000">${rects}</svg>`;
}

function renderItem(item: PrintItem, idx: number, barcode: string | undefined): string {
  const barcodeCell = barcode
    ? `${renderBarcodeSvg(barcode)}<div class="barcode-val">${esc(barcode)}</div>`
    : `<div class="no-barcode">No barcode</div>`;

  return `
    <div class="item">
      <div class="item-num">${idx}</div>
      <div class="item-barcode">${barcodeCell}</div>
      <div class="item-body">
        <span class="item-name">${esc(item.name)}</span>
        ${item.quantity ? `<span class="item-qty">Qty: ${esc(item.quantity)}</span>` : ''}
        ${item.category ? `<span class="item-cat">${esc(item.category)}</span>` : ''}
        ${item.source === 'EMPLOYEE_REQUEST' ? '<span class="item-staff">Staff request</span>' : ''}
        ${item.priority === 'URGENT' ? '<span class="urgent-tag">URGENT</span>' : ''}
      </div>
      <div class="checkbox"></div>
    </div>`;
}

function renderSection(
  label: string,
  cls: string,
  sectionItems: PrintItem[],
  barcodeMap: Map<string, string>,
): string {
  if (sectionItems.length === 0) return '';
  const rows = sectionItems
    .map((item, i) => renderItem(item, i + 1, barcodeMap.get(item.name.toLowerCase().trim())))
    .join('');
  return `
    <div class="section-header section-${cls}">
      ${esc(label)} &middot; ${sectionItems.length} item${sectionItems.length !== 1 ? 's' : ''}
    </div>
    ${rows}`;
}

function buildHTML(opts: {
  listName: string;
  storeName: string;
  urgentItems: PrintItem[];
  neededItems: PrintItem[];
  orderedItems: PrintItem[];
  receivedItems: PrintItem[];
  barcodeMap: Map<string, string>;
}): string {
  const { listName, storeName, urgentItems, neededItems, orderedItems, receivedItems, barcodeMap } = opts;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const total = urgentItems.length + neededItems.length + orderedItems.length + receivedItems.length;

  const statUrgent = urgentItems.length > 0
    ? `<div class="stat"><div class="stat-num" style="color:#EA580C">${urgentItems.length}</div><div class="stat-label">Urgent</div></div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(listName)}</title>
<style>
@page{margin:10mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#1F2937;background:#fff}

.header{background:#1E3A5F;color:#fff;padding:8px 12px}
.store-name{font-size:9px;text-transform:uppercase;letter-spacing:1px;opacity:.7;margin-bottom:1px}
.list-name{font-size:16px;font-weight:800;margin-bottom:1px}
.print-meta{font-size:9px;opacity:.65}

.stats{display:flex;background:#F8FAFC;border-bottom:1px solid #E5E7EB}
.stat{flex:1;text-align:center;padding:3px 4px;border-right:1px solid #E5E7EB;display:flex;align-items:baseline;justify-content:center;gap:4px}
.stat:last-child{border-right:none}
.stat-num{font-size:13px;font-weight:800}
.stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7280}

.section-header{padding:2px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #E5E7EB}
.section-urgent{background:#FFF7ED;color:#C2410C}
.section-needed{background:#FFFBEB;color:#92400E}
.section-ordered{background:#F0FDF4;color:#166534}
.section-received{background:#F8FAFC;color:#6B7280}

.item{display:flex;align-items:center;padding:1px 10px;border-bottom:1px solid #F3F4F6;gap:8px;page-break-inside:avoid;min-height:24px}
.item:nth-child(even){background:#FAFAFA}
.item-num{width:20px;font-size:10px;color:#9CA3AF;font-weight:600;text-align:right;flex-shrink:0}
.item-barcode{width:225px;flex-shrink:0;display:flex;align-items:center;gap:6px}
.item-barcode svg{width:130px;height:20px;flex-shrink:0}
.barcode-val{font-size:10px;font-family:Menlo,Consolas,monospace;color:#374151;white-space:nowrap}
.no-barcode{height:22px;display:flex;align-items:center;color:#D1D5DB;font-size:10px;font-style:italic}
.item-body{flex:1;min-width:0;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.item-name{font-size:12px;font-weight:700;color:#1F2937}
.item-qty{font-size:11px;color:#4B5563}
.item-cat{font-size:9px;font-weight:600;color:#4F46E5;background:#EEF2FF;padding:0 6px;border-radius:10px}
.item-staff{font-size:9px;font-weight:600;color:#16A34A;background:#F0FDF4;padding:0 6px;border-radius:10px}
.urgent-tag{font-size:9px;font-weight:700;color:#EA580C}
.checkbox{width:15px;height:15px;border:1.5px solid #6B7280;border-radius:3px;flex-shrink:0}
.footer{padding:6px 10px;text-align:center;font-size:9px;color:#9CA3AF;border-top:1px solid #E5E7EB;margin-top:8px}

@media print{
  .section-header,.item-cat,.item-staff{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>

<div class="header">
  <div class="store-name">Lucky Stop &middot; ${esc(storeName)}</div>
  <div class="list-name">${esc(listName)}</div>
  <div class="print-meta">${esc(dateStr)} at ${esc(timeStr)}</div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-num">${total}</div><div class="stat-label">Total</div></div>
  ${statUrgent}
  <div class="stat"><div class="stat-num">${neededItems.length}</div><div class="stat-label">Needed</div></div>
  <div class="stat"><div class="stat-num" style="color:#059669">${orderedItems.length}</div><div class="stat-label">Ordered</div></div>
  <div class="stat"><div class="stat-num" style="color:#16A34A">${receivedItems.length}</div><div class="stat-label">Received</div></div>
</div>

${renderSection('⚡ Urgent', 'urgent', urgentItems, barcodeMap)}
${renderSection('Needed', 'needed', neededItems, barcodeMap)}
${renderSection('Ordered', 'ordered', orderedItems, barcodeMap)}
${renderSection('Received', 'received', receivedItems, barcodeMap)}

<div class="footer">Lucky Stop &middot; ${esc(storeName)} &middot; Generated by Lucky Stop App</div>

</body>
</html>`;
}

export async function printOrderList({
  listName,
  storeName,
  items,
  catalog,
  shareAsPdf = false,
}: {
  listName: string;
  storeName: string;
  items: PrintItem[];
  catalog: CatalogEntry[];
  shareAsPdf?: boolean;
}) {
  const barcodeMap = new Map<string, string>();
  for (const ci of catalog) {
    if (ci.barcode && ci.name) {
      barcodeMap.set(ci.name.toLowerCase().trim(), ci.barcode);
    }
  }

  const active = items.filter(i => i.status !== 'REMOVED');
  const urgentItems   = active.filter(i => i.status === 'PENDING' && i.priority === 'URGENT');
  const neededItems   = active.filter(i => i.status === 'PENDING' && i.priority !== 'URGENT');
  const orderedItems  = active.filter(i => i.status === 'ORDERED');
  const receivedItems = active.filter(i => i.status === 'RECEIVED');

  const html = buildHTML({ listName, storeName, urgentItems, neededItems, orderedItems, receivedItems, barcodeMap });

  if (shareAsPdf) {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${listName}.pdf`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
}
