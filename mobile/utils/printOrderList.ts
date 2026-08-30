import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { JSBARCODE_SOURCE } from './jsbarcodeSource';

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

function renderItem(item: PrintItem, idx: number, barcode: string | undefined): string {
  const barcodeCell = barcode
    ? `<svg data-barcode="${esc(barcode)}"></svg><div class="barcode-val">${esc(barcode)}</div>`
    : `<div class="no-barcode">No barcode</div>`;

  return `
    <div class="item">
      <div class="item-num">${idx}</div>
      <div class="item-barcode">${barcodeCell}</div>
      <div class="item-body">
        <div class="item-name">${esc(item.name)}</div>
        <div class="item-meta">
          ${item.quantity ? `<span class="item-qty">Qty: ${esc(item.quantity)}</span>` : ''}
          ${item.category ? `<span class="item-cat">${esc(item.category)}</span>` : ''}
          ${item.source === 'EMPLOYEE_REQUEST' ? '<span class="item-staff">Staff request</span>' : ''}
          ${item.priority === 'URGENT' ? '<span class="urgent-tag">URGENT</span>' : ''}
        </div>
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
      ${esc(label)} &mdash; ${sectionItems.length} item${sectionItems.length !== 1 ? 's' : ''}
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
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#1F2937;background:#fff}

.header{background:#1E3A5F;color:#fff;padding:18px 20px}
.store-name{font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.7;margin-bottom:3px}
.list-name{font-size:20px;font-weight:800;margin-bottom:4px}
.print-meta{font-size:10px;opacity:.65}

.stats{display:flex;background:#F8FAFC;border-bottom:1px solid #E5E7EB}
.stat{flex:1;text-align:center;padding:9px 4px;border-right:1px solid #E5E7EB}
.stat:last-child{border-right:none}
.stat-num{font-size:16px;font-weight:800}
.stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#6B7280;margin-top:1px}

.section-header{padding:5px 16px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #E5E7EB}
.section-urgent{background:#FFF7ED;color:#C2410C}
.section-needed{background:#FFFBEB;color:#92400E}
.section-ordered{background:#F0FDF4;color:#166534}
.section-received{background:#F8FAFC;color:#6B7280}

.item{display:flex;align-items:center;padding:9px 16px;border-bottom:1px solid #F3F4F6;gap:10px;page-break-inside:avoid}
.item:nth-child(even){background:#FAFAFA}
.item-num{width:22px;font-size:11px;color:#9CA3AF;font-weight:600;text-align:right;flex-shrink:0}
.item-barcode{width:90px;flex-shrink:0;text-align:center}
.item-barcode svg{max-width:90px;height:42px}
.barcode-val{font-size:8px;color:#9CA3AF;margin-top:1px;word-break:break-all}
.no-barcode{height:42px;display:flex;align-items:center;justify-content:center;color:#D1D5DB;font-size:10px;font-style:italic}
.item-body{flex:1;min-width:0}
.item-name{font-size:13px;font-weight:700;color:#1F2937}
.item-meta{display:flex;gap:5px;margin-top:3px;flex-wrap:wrap;align-items:center}
.item-qty{font-size:11px;color:#6B7280}
.item-cat{font-size:10px;font-weight:600;color:#4F46E5;background:#EEF2FF;padding:2px 7px;border-radius:10px}
.item-staff{font-size:10px;font-weight:600;color:#16A34A;background:#F0FDF4;padding:2px 7px;border-radius:10px}
.urgent-tag{font-size:10px;font-weight:700;color:#EA580C}
.checkbox{width:18px;height:18px;border:2px solid #D1D5DB;border-radius:4px;flex-shrink:0}
.footer{padding:10px 16px;text-align:center;font-size:10px;color:#9CA3AF;border-top:1px solid #E5E7EB;margin-top:12px}

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

<script>${JSBARCODE_SOURCE}</script>
<script>
document.querySelectorAll('svg[data-barcode]').forEach(function(el) {
  try {
    JsBarcode(el, el.getAttribute('data-barcode'), {
      format: 'CODE128', width: 1.5, height: 36,
      displayValue: false, margin: 2, lineColor: '#1F2937'
    });
  } catch(e) { el.style.display = 'none'; }
});
</script>
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
