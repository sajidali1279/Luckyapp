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
  CLASSIC_RED_BLACK: `
    background: #111;
    color: #fff;
    border: 3px solid #c0392b;
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
    }
    .label-name {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 4mm;
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
