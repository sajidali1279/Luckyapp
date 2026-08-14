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
  barcode?: string | null;
  template: string;
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
  const cls = barcode ? 'label has-barcode' : 'label';
  return `
    <div class="${cls}" style="border: ${t.border}; border-top: ${t.borderTop};">
      <img class="label-qr" src="${QR_CODE_DATA_URI}" alt="" />
      <div class="label-name" style="color: ${t.nameColor};">${t.icon || ''}${esc(label.productName)}</div>
      <div class="label-price" style="color: ${t.priceColor};">${esc(label.priceText)}</div>
      ${barcode ? `
      <div class="label-barcode-wrap">
        <svg class="label-barcode" data-barcode="${esc(barcode)}"></svg>
        <div class="label-barcode-val">${esc(barcode)}</div>
      </div>` : ''}
    </div>
  `;
}

function buildHtml(labels: PrintableLabel[]): string {
  const hasAnyBarcode = labels.some(l => l.barcode?.trim());
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
            format: 'CODE128', width: 1.5, height: 40,
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
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6mm;
    }
    .label {
      position: relative;
      aspect-ratio: 3 / 2;
      border-radius: 5px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2.5mm 7mm 2.5mm 2.5mm;
      page-break-inside: avoid;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .label-qr {
      position: absolute;
      bottom: 1mm;
      right: 1mm;
      width: 6mm;
      height: 6mm;
    }
    .label-name {
      font-size: 7pt;
      font-weight: 700;
      margin-bottom: 1.5mm;
    }
    .label-price {
      font-size: 11pt;
      font-weight: 900;
    }
    .label.has-barcode {
      aspect-ratio: auto;
    }
    .label.has-barcode .label-qr {
      width: 4.5mm;
      height: 4.5mm;
    }
    .label-barcode-wrap {
      width: 100%;
      margin-top: 1mm;
    }
    .label-barcode {
      display: block;
      width: 100%;
      max-width: 20mm;
      height: 6.5mm;
      margin: 0 auto;
    }
    .label-barcode-val {
      font-size: 5.5pt;
      color: #555;
      letter-spacing: 0.3px;
      margin-top: 0.3mm;
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
  labels,
  shareAsPdf = false,
}: {
  labels: PrintableLabel[];
  shareAsPdf?: boolean;
}): Promise<void> {
  const html = buildHtml(labels);

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
