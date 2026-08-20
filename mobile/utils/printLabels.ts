/**
 * Generates and prints/shares a batch of shelf/price labels from mobile.
 * Mirrors admin web's printLabels.ts HTML/CSS exactly so a printed batch
 * looks identical regardless of which platform produced it.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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
// label, baked in as a data URI rather than pulled from a QR-generation
// library or a live external request at print time.
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
// background-color fill — matches admin web's rule exactly, for the same
// print-legibility reason (background graphics are off by default).
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
  // A long name gets a smaller font tier instead of being clamped to fewer
  // lines — the name always keeps its full 2 lines, it just shrinks to fit.
  const nameClass = deal
    ? (label.productName.length > 30 ? 'label-name has-deal-long' : 'label-name has-deal')
    : 'label-name';
  const priceGroupClass = deal ? 'price-group has-deal' : 'price-group';
  return `
    <div class="label" style="border: ${t.border}; border-top: ${t.borderTop};">
      <div class="watermark">LUCKY STOP</div>
      <div class="label-main">
        <div class="${nameClass}" style="color: ${t.nameColor};">${t.icon || ''}${esc(label.productName)}</div>
        <div class="${priceGroupClass}">
          <div class="price-regular" style="color: ${t.priceColor};"><span class="price-dollar">$</span>${esc(label.priceText)}</div>
          ${deal ? `<div class="price-deal" style="color: ${t.priceColor}; border-color: ${t.priceColor};">${esc(deal)}</div>` : ''}
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

function buildHtml(entries: PrintableLabelEntry[]): string {
  const labels: PrintableLabel[] = entries.flatMap(e => Array(Math.max(1, e.quantity)).fill(e.label));
  const hasAnyBarcode = entries.some(e => e.label.barcode?.trim());
  // IMPORTANT: this script is placed at the end of <body> (see below), never
  // in <head> — a <head> script would run before the <svg> elements it
  // targets exist in the DOM and silently render nothing. Admin web shipped
  // exactly this bug once; this file starts from the fixed version.
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

  return `<!DOCTYPE html>
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
</head>
<body>
  <div class="grid">
    ${labels.map(renderLabel).join('')}
  </div>
  ${barcodeScript}
</body>
</html>`;
}

export async function printLabels({
  entries,
  shareAsPdf = false,
}: {
  entries: PrintableLabelEntry[];
  shareAsPdf?: boolean;
}): Promise<void> {
  const html = buildHtml(entries);

  if (shareAsPdf) {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Labels.pdf',
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
}
