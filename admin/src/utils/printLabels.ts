/**
 * Generates and opens a printable batch of shelf/price labels in a new window.
 * The browser's print dialog opens automatically once the page loads.
 */
export interface PrintableLabel {
  id: string;
  productName: string;
  priceText: string;
  template: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TEMPLATE_CSS: Record<string, string> = {
  // Black border + red accent stripe achieve the "red and black" sale-tag look
  // using only borders and text color (both print reliably by default), never
  // a background-color fill (browsers don't print background graphics unless
  // the user explicitly opts in via the print dialog).
  CLASSIC_RED_BLACK: `
    border: 3px solid #111;
    border-top: 8px solid #c0392b;
  `,
};

function renderLabel(label: PrintableLabel): string {
  const templateCss = TEMPLATE_CSS[label.template] || TEMPLATE_CSS.CLASSIC_RED_BLACK;
  return `
    <div class="label" style="${templateCss}">
      <div class="label-name">${esc(label.productName)}</div>
      <div class="label-price">${esc(label.priceText)}</div>
    </div>
  `;
}

export function printLabels(labels: PrintableLabel[]): void {
  const html = `<!DOCTYPE html>
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
      grid-template-columns: repeat(4, 1fr);
      gap: 6mm;
    }
    .label {
      aspect-ratio: 3 / 2;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4mm;
      page-break-inside: avoid;
      /* Defense-in-depth: forces background rendering in browsers that honor
         this (not all do), in case a future template relies on a fill color.
         The primary fix for legibility is that templates no longer depend on
         backgrounds for contrast — see TEMPLATE_CSS above. */
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .label-name {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 4mm;
      color: #111;
    }
    .label-price {
      font-size: 20pt;
      font-weight: 900;
      color: #e63946;
    }
  </style>
  <script>window.onload = () => window.print();</script>
</head>
<body>
  <div class="grid">
    ${labels.map(renderLabel).join('')}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to print labels.'); return; }
  win.document.write(html);
  win.document.close();
}
