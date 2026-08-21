/**
 * Generates and opens a printable batch of shelf/price labels in a new window.
 * The browser's print dialog opens automatically once the page loads.
 */
export interface PrintableLabel {
  id: string;
  productName: string;
  priceText: string;
  dealText?: string | null;
  barcode?: string | null;
  template: string;
}

export interface PrintableLabelEntry {
  label: PrintableLabel;
  quantity: number;
}

// Static QR code pointing at the Lucky Stop app/signup page — same on every
// label, so it's generated once and baked in as a data URI rather than
// pulled from a QR-generation library or a live external request at print
// time (no new runtime dependency, no third-party call from a printed page).
const QR_CODE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADIAQMAAACXljzdAAAABlBMVEX///8RERFxTxnbAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAvklEQVRYhd2UwRHEMAgD6b9pcgNI2EkFe/jhgfVHI5nIrois8ytNoCSqq1tPdkIko6qm0ZIz8WQ9/A9Sxl2OUYlz16YdEyRZv3Q0QRKX+adQxHrLOW/0pBLFb2aKIpjsdojjTVLJNPPKv4pK8mq9NZJLBiuJ+ltYErMr1sfUcyQ5ZFq65SLJ5G6C6HwiiUrtLg0msbaO5OkYk4T03Uq55JPDl14qkeieBJ1MFNPfjEriUNW7/M4ojCh7c3vEJA9A1mYnV9N4IgAAAABJRU5ErkJggg==';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Each template maps to a CSS class (below) that carries its whole look —
// border style, corner radius, stripe placement, and (for two of them) font
// family all vary per template, not just color, so they read as genuinely
// different label styles at a glance rather than the same shape recolored.
// Icons are still per-template text content, so they stay data here.
const TEMPLATE_CLASS: Record<string, string> = {
  CLASSIC_RED_BLACK: 'tmpl-classic',
  CHRISTMAS_WINTER: 'tmpl-christmas',
  SUMMER: 'tmpl-summer',
  CLEARANCE: 'tmpl-clearance',
  INDEPENDENCE_DAY: 'tmpl-independence',
  HALLOWEEN: 'tmpl-halloween',
  PREMIUM: 'tmpl-premium',
};

const TEMPLATE_ICONS: Record<string, string> = {
  CHRISTMAS_WINTER: '❆ ',
  SUMMER: '☀ ',
  CLEARANCE: '🔥 ',
  INDEPENDENCE_DAY: '★ ',
  HALLOWEEN: '🎃 ',
};

function renderLabel(label: PrintableLabel): string {
  const cssClass = TEMPLATE_CLASS[label.template] || TEMPLATE_CLASS.CLASSIC_RED_BLACK;
  const icon = TEMPLATE_ICONS[label.template] || '';
  const barcode = label.barcode?.trim();
  const deal = label.dealText?.trim();
  const sideClass = barcode ? 'label-side' : 'label-side no-barcode';
  // A long name gets a smaller font tier instead of being clamped to fewer
  // lines — the name always keeps its full 2 lines, it just shrinks to fit.
  const nameClass = deal
    ? (label.productName.length > 30 ? 'label-name has-deal-long' : 'label-name has-deal')
    : 'label-name';
  const priceGroupClass = deal ? 'price-group has-deal' : 'price-group';
  return `
    <div class="label ${cssClass}">
      <div class="watermark">LUCKY STOP</div>
      <div class="label-main">
        <div class="${nameClass}">${icon}${esc(label.productName)}</div>
        <div class="${priceGroupClass}">
          <div class="price-regular"><span class="price-dollar">$</span>${esc(label.priceText)}</div>
          ${deal ? `<div class="price-deal">${esc(deal)}</div>` : ''}
        </div>
      </div>
      <div class="${sideClass}">
        <img class="label-qr" src="${QR_CODE_DATA_URI}" alt="" />
        <div class="label-qr-caption">Scan to Join</div>
        ${barcode ? `
        <div class="label-barcode-wrap">
          <svg class="label-barcode" data-barcode="${esc(barcode)}"></svg>
          <div class="label-barcode-val">${esc(barcode)}</div>
        </div>` : ''}
      </div>
    </div>
  `;
}

export function printLabels(entries: PrintableLabelEntry[]): boolean {
  const labels: PrintableLabel[] = entries.flatMap(e => Array(Math.max(1, e.quantity)).fill(e.label));
  const hasAnyBarcode = entries.some(e => e.label.barcode?.trim());
  const barcodeScript = hasAnyBarcode
    ? `<script>
    function renderBarcodes() {
      document.querySelectorAll('svg[data-barcode]').forEach(function(el) {
        try {
          JsBarcode(el, el.getAttribute('data-barcode'), {
            format: 'CODE128', width: 1.3, height: 34,
            displayValue: false, margin: 0, lineColor: '#000'
          });
          var w = parseFloat(el.getAttribute('width') || '0');
          var h = parseFloat(el.getAttribute('height') || '0');
          if (w && h) el.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
          el.removeAttribute('width');
          el.removeAttribute('height');
        } catch (e) { el.style.display = 'none'; }
      });
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js" onload="renderBarcodes()"></script>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Labels</title>
  <style>
    @page { size: A4; margin: 7mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 63.5mm);
      grid-auto-rows: 31.75mm;
      gap: 2mm;
    }
    /* Every label is the exact same fixed physical size — sized to fit a
       standard 1.25in-tall shelf-channel/data-strip holder — regardless of
       whether it carries a barcode. Content is organized to fit inside,
       never the other way around. */
    .label {
      position: relative;
      width: 63.5mm;
      height: 31.75mm;
      border-radius: 3px;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      padding: 1.5mm;
      overflow: hidden;
      page-break-inside: avoid;
      /* Defense-in-depth only — the real fix for legibility is that every
         template gets its contrast from text/border color, never a fill. */
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    /* Templates: each gets a genuinely different frame, not just a
       different color — border style, corner radius, stripe placement, and
       (for two of them) font family all vary, so they read as distinct
       label styles at a glance. Every one still gets its contrast from
       text/border color only, never a background fill (see the rule
       above) — the outline-based double borders below are exempt from
       that concern since outline-color, like border-color, prints by
       default even with background graphics off. */
    .tmpl-classic { border: 3px solid #1a1a1a; border-top: 8px solid #b91c1c; }
    .tmpl-classic .label-name { color: #1a1a1a; }
    .tmpl-classic .price-regular, .tmpl-classic .price-dollar { color: #dc2626; }
    .tmpl-classic .price-deal { color: #dc2626; border-color: #dc2626; }

    .tmpl-christmas { border: 3px dashed #14532d; border-top: 8px solid #b91c1c; }
    .tmpl-christmas .label-name { color: #14532d; }
    .tmpl-christmas .price-regular, .tmpl-christmas .price-dollar { color: #b91c1c; }
    .tmpl-christmas .price-deal { color: #b91c1c; border-color: #b91c1c; }

    .tmpl-summer { border: 3px solid #ea580c; border-radius: 10px; border-bottom: 8px solid #0e7490; }
    .tmpl-summer .label-name { color: #0e7490; }
    .tmpl-summer .price-regular, .tmpl-summer .price-dollar { color: #f97316; }
    .tmpl-summer .price-deal { color: #f97316; border-color: #f97316; }

    .tmpl-clearance { border: 5px solid #1a1a1a; border-top: 8px solid #dc2626; }
    .tmpl-clearance .label-name { color: #1a1a1a; letter-spacing: 0.3px; }
    .tmpl-clearance .price-regular, .tmpl-clearance .price-dollar { color: #dc2626; }
    .tmpl-clearance .price-deal { color: #dc2626; border-color: #dc2626; }

    .tmpl-independence { border: 2px solid #1e3a8a; outline: 2px solid #b91c1c; outline-offset: -5px; }
    .tmpl-independence .label-name { color: #1e3a8a; }
    .tmpl-independence .price-regular, .tmpl-independence .price-dollar { color: #b91c1c; }
    .tmpl-independence .price-deal { color: #b91c1c; border-color: #b91c1c; }

    .tmpl-halloween { border: 3px dashed #7c3aed; border-top: 8px solid #ea580c; }
    .tmpl-halloween .label-name { color: #1a1a1a; font-style: italic; }
    .tmpl-halloween .price-regular, .tmpl-halloween .price-dollar { color: #ea580c; }
    .tmpl-halloween .price-deal { color: #ea580c; border-color: #ea580c; }

    .tmpl-premium { border: 1px solid #1a2744; outline: 1px solid #b8860b; outline-offset: -4px; font-family: Georgia, 'Times New Roman', serif; }
    .tmpl-premium .label-name { color: #1a2744; }
    .tmpl-premium .price-regular, .tmpl-premium .price-dollar { color: #b8860b; }
    .tmpl-premium .price-deal { color: #b8860b; border-color: #b8860b; }
    .watermark {
      position: absolute;
      inset: 0;
      z-index: -1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13pt;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: rgba(204, 41, 54, 0.08);
      white-space: nowrap;
    }
    .label-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      /* stretch (not flex-start) so children get a real width to shrink
         against — flex-start sizes children to fit-content, which makes
         max-width/ellipsis/line-clamp below resolve against a circular,
         effectively-unconstrained width and never actually engage. */
      align-items: stretch;
      padding-right: 1.5mm;
    }
    .label-name {
      min-width: 0;
      font-size: 7.5pt;
      font-weight: 700;
      line-height: 1.15;
      text-align: left;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    /* The name always keeps its full 2 lines — a deal shrinks the font
       instead of cutting a line off, so long names still read in full. */
    .label-name.has-deal { font-size: 6.5pt; }
    .label-name.has-deal-long { font-size: 5.8pt; }
    .price-group {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .price-group.has-deal { gap: 0.6mm; }
    .price-regular {
      font-size: 25pt;
      font-weight: 900;
      line-height: 1;
      text-align: left;
    }
    .price-group.has-deal .price-regular {
      font-size: 15pt;
    }
    .price-dollar {
      font-size: 12pt;
      font-weight: 700;
      margin-right: 0.5mm;
    }
    .price-group.has-deal .price-dollar {
      font-size: 7pt;
    }
    /* Deal text is meant to grab attention on its own, not read like a
       caption under the price — bold, in the template's bright accent
       color, with a border-only "badge" outline (never a background fill,
       so it stays legible with print backgrounds off by default). */
    .price-deal {
      min-width: 0;
      max-width: 100%;
      font-size: 11pt;
      font-weight: 800;
      line-height: 1.15;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 1.2pt solid;
      border-radius: 2.5pt;
      padding: 0.4mm 1.5mm;
    }
    .label-side {
      width: 17mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.6mm;
    }
    .label-qr-caption {
      font-size: 5pt;
      font-weight: 700;
      letter-spacing: 0.2px;
      color: #555;
      text-align: center;
      white-space: nowrap;
    }
    .label-qr {
      width: 9mm;
      height: 9mm;
      flex-shrink: 0;
    }
    /* No barcode to share the column with — let the QR grow into the
       freed-up space instead of leaving it blank. */
    .label-side.no-barcode .label-qr {
      width: 15mm;
      height: 15mm;
    }
    .label-barcode-wrap {
      width: 100%;
      flex-shrink: 0;
      text-align: center;
    }
    .label-barcode {
      display: block;
      width: 100%;
      height: 6.5mm;
    }
    .label-barcode-val {
      font-size: 5pt;
      color: #555;
      letter-spacing: 0.2px;
      margin-top: 0.3mm;
      word-break: break-all;
    }
  </style>
  <script>window.onload = () => window.print();</script>
</head>
<body>
  <div class="grid">
    ${labels.map(renderLabel).join('')}
  </div>
  ${barcodeScript}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to print labels.'); return false; }
  win.document.write(html);
  win.document.close();
  return true;
}
