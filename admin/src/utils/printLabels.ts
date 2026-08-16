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

interface TemplateStyle {
  border: string;
  borderTop: string;
  nameColor: string;
  priceColor: string;
  icon?: string;
}

// Every template gets its look from borders + text color only, never a
// background-color fill — browsers don't print background graphics unless
// the user explicitly opts in via the print dialog, so a design that relies
// on a background fill for contrast (e.g. white text on a dark card) prints
// invisible by default. Keep this rule for any future template too.
const TEMPLATES: Record<string, TemplateStyle> = {
  CLASSIC_RED_BLACK: {
    border: '3px solid #111',
    borderTop: '8px solid #c0392b',
    nameColor: '#111',
    priceColor: '#e63946',
  },
  CHRISTMAS_WINTER: {
    border: '3px solid #1e7a3d',
    borderTop: '8px solid #c0392b',
    nameColor: '#1e7a3d',
    priceColor: '#c0392b',
    icon: '❆ ',
  },
  SUMMER: {
    border: '3px solid #ea580c',
    borderTop: '8px solid #0891b2',
    nameColor: '#0c4a6e',
    priceColor: '#ea580c',
    icon: '☀ ',
  },
};

function renderLabel(label: PrintableLabel): string {
  const t = TEMPLATES[label.template] || TEMPLATES.CLASSIC_RED_BLACK;
  const barcode = label.barcode?.trim();
  const deal = label.dealText?.trim();
  const sideClass = barcode ? 'label-side' : 'label-side no-barcode';
  const mainClass = deal ? 'label-main has-deal' : 'label-main';
  return `
    <div class="label" style="border: ${t.border}; border-top: ${t.borderTop};">
      <div class="watermark">LUCKY STOP</div>
      <div class="${mainClass}">
        <div class="label-name" style="color: ${t.nameColor};">${t.icon || ''}${esc(label.productName)}</div>
        <div class="price-regular" style="color: ${t.priceColor};"><span class="price-dollar">$</span>${esc(label.priceText)}</div>
        ${deal ? `<div class="price-deal" style="color: ${t.nameColor};">${esc(deal)}</div>` : ''}
      </div>
      <div class="${sideClass}">
        <img class="label-qr" src="${QR_CODE_DATA_URI}" alt="" />
        ${barcode ? `
        <div class="label-barcode-wrap">
          <svg class="label-barcode" data-barcode="${esc(barcode)}"></svg>
          <div class="label-barcode-val">${esc(barcode)}</div>
        </div>` : ''}
      </div>
    </div>
  `;
}

export function printLabels(entries: PrintableLabelEntry[]): void {
  const labels: PrintableLabel[] = entries.flatMap(e => Array(Math.max(1, e.quantity)).fill(e.label));
  const hasAnyBarcode = labels.some(l => l.barcode?.trim());
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
      align-items: flex-start;
      padding-right: 1.5mm;
    }
    .label-name {
      font-size: 7.5pt;
      font-weight: 700;
      line-height: 1.15;
      text-align: left;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    /* A deal line takes up vertical space the 2-line name normally has, so
       the name clamps to 1 line whenever a deal is present. */
    .label-main.has-deal .label-name {
      -webkit-line-clamp: 1;
    }
    .price-regular {
      font-size: 25pt;
      font-weight: 900;
      line-height: 1;
      text-align: left;
    }
    .label-main.has-deal .price-regular {
      font-size: 18pt;
    }
    .price-dollar {
      font-size: 12pt;
      font-weight: 700;
      margin-right: 0.5mm;
    }
    .label-main.has-deal .price-dollar {
      font-size: 9pt;
    }
    .price-deal {
      font-size: 8pt;
      font-weight: 700;
      line-height: 1.1;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .label-side {
      width: 17mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1mm;
    }
    .label-qr {
      width: 9mm;
      height: 9mm;
    }
    /* No barcode to share the column with — let the QR grow into the
       freed-up space instead of leaving it blank. */
    .label-side.no-barcode .label-qr {
      width: 15mm;
      height: 15mm;
    }
    .label-barcode-wrap {
      width: 100%;
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
  if (!win) { alert('Please allow pop-ups to print labels.'); return; }
  win.document.write(html);
  win.document.close();
}
