/**
 * Generates and prints/shares a batch of shelf/price labels from mobile.
 * Mirrors admin web's printLabels.ts HTML/CSS exactly so a printed batch
 * looks identical regardless of which platform produced it.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { code128ToSvg } from './code128';
import { SheetSettings, DEFAULT_SHEET, A4_PER_SHEET, A4_COLS, A4_ROWS, PAGE_POINTS, tallScale, LETTER_MARGIN_MM, LETTER_PER_SHEET, LETTER_COLS, LETTER_ROWS } from './labelSheet';

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

// Rendered statically at HTML-build time (not via a runtime <script> once
// the page is loaded), see code128.ts for why.
function renderBarcodeSvg(barcode: string): string {
  const HEIGHT = 34;
  const { rects, modules } = code128ToSvg(barcode, HEIGHT);
  return `<svg class="label-barcode" viewBox="0 0 ${modules} ${HEIGHT}" fill="#000">${rects}</svg>`;
}

function renderLabel(label: PrintableLabel): string {
  const cssClass = TEMPLATE_CLASS[label.template] || TEMPLATE_CLASS.CLASSIC_RED_BLACK;
  const icon = TEMPLATE_ICONS[label.template] || '';
  const barcode = label.barcode?.trim();
  const deal = label.dealText?.trim();
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
      ${barcode ? `
      <div class="label-side">
        <div class="label-barcode-wrap">
          ${renderBarcodeSvg(barcode)}
          <div class="label-barcode-val">${esc(barcode)}</div>
        </div>
      </div>` : ''}
    </div>
  `;
}

const letterLayout = (s: SheetSettings) => {
  const l = s.letter;
  const r = (x: number) => Number(x.toFixed(3));
  return `
    /* Matches a real, specific product: 1in x 2-5/8in address-label sheets (Avery 5160-compatible - e.g. the Walmart "3000 Mailing
       Address Labels" box), 30 labels/sheet, 3 columns x 10 rows, on US Letter. Each sheet is its own page with the page margin 0, so
       the millimetres count from the paper's edge: the first label 1/2 in down and 3/16 in in, moved by the store's printer fine-tune,
       and the label size and the space between columns and rows as set (starting at the sheet's own numbers). */
    @page { size: letter; margin: 0; }
    .lsheet {
      width: 215.9mm; height: 279mm; overflow: hidden;
      padding: ${r(LETTER_MARGIN_MM.topBottom + l.down)}mm 0 0 ${r(LETTER_MARGIN_MM.side + l.right)}mm;
      display: grid;
      grid-template-columns: repeat(${LETTER_COLS}, ${l.labelW}mm);
      grid-template-rows: repeat(${LETTER_ROWS}, ${l.labelH}mm);
      column-gap: ${l.gapX}mm;
      row-gap: ${l.gapY}mm;
      align-content: start;
      break-after: page; page-break-after: always;
    }
    .lsheet:last-child { break-after: auto; page-break-after: auto; }
    .lsheet .label { width: ${l.labelW}mm; height: ${l.labelH}mm; }
    /* A spot left empty on a sheet that already has labels peeled off */
    .label-blank { width: ${l.labelW}mm; height: ${l.labelH}mm; }
    /* The test page: each label's outline only, to hold against a sheet of labels */
    .label-test { width: ${l.labelW}mm; height: ${l.labelH}mm; border: 0.3mm dashed #333; display: flex; align-items: center; justify-content: center; color: #333; }
    .label-test b { font-size: 14pt; }
`;
};

const LABEL_STYLE = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    /* Every label is the exact same fixed physical size — matching the
       sheet's actual die-cut label size (1in x 2.625in) — regardless of
       whether it carries a barcode. Content is organized to fit inside,
       never the other way around. */
    .label {
      position: relative;
      width: 2.625in;
      height: 1in;
      border-radius: 3px;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      padding: 1.2mm;
      overflow: hidden;
      page-break-inside: avoid;
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
    .tmpl-classic { border: 2px solid #1a1a1a; border-top: 6px solid #b91c1c; }
    .tmpl-classic .label-name { color: #1a1a1a; }
    .tmpl-classic .price-regular, .tmpl-classic .price-dollar { color: #dc2626; }
    .tmpl-classic .price-deal { color: #dc2626; border-color: #dc2626; }

    .tmpl-christmas { border: 2px dashed #14532d; border-top: 6px solid #b91c1c; }
    .tmpl-christmas .label-name { color: #14532d; }
    .tmpl-christmas .price-regular, .tmpl-christmas .price-dollar { color: #b91c1c; }
    .tmpl-christmas .price-deal { color: #b91c1c; border-color: #b91c1c; }

    .tmpl-summer { border: 2px solid #ea580c; border-radius: 8px; border-bottom: 6px solid #0e7490; }
    .tmpl-summer .label-name { color: #0e7490; }
    .tmpl-summer .price-regular, .tmpl-summer .price-dollar { color: #f97316; }
    .tmpl-summer .price-deal { color: #f97316; border-color: #f97316; }

    .tmpl-clearance { border: 4px solid #1a1a1a; border-top: 6px solid #dc2626; }
    .tmpl-clearance .label-name { color: #1a1a1a; letter-spacing: 0.3px; }
    .tmpl-clearance .price-regular, .tmpl-clearance .price-dollar { color: #dc2626; }
    .tmpl-clearance .price-deal { color: #dc2626; border-color: #dc2626; }

    .tmpl-independence { border: 1.5px solid #1e3a8a; outline: 1.5px solid #b91c1c; outline-offset: -3.5px; }
    .tmpl-independence .label-name { color: #1e3a8a; }
    .tmpl-independence .price-regular, .tmpl-independence .price-dollar { color: #b91c1c; }
    .tmpl-independence .price-deal { color: #b91c1c; border-color: #b91c1c; }

    .tmpl-halloween { border: 2px dashed #7c3aed; border-top: 6px solid #ea580c; }
    .tmpl-halloween .label-name { color: #1a1a1a; font-style: italic; }
    .tmpl-halloween .price-regular, .tmpl-halloween .price-dollar { color: #ea580c; }
    .tmpl-halloween .price-deal { color: #ea580c; border-color: #ea580c; }

    .tmpl-premium { border: 1px solid #1a2744; outline: 1px solid #b8860b; outline-offset: -3px; font-family: Georgia, 'Times New Roman', serif; }
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
      font-size: 10pt;
      font-weight: 800;
      letter-spacing: 1px;
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
      padding-right: 1.2mm;
    }
    .label-name {
      min-width: 0;
      font-size: 6.5pt;
      font-weight: 700;
      line-height: 1.1;
      text-align: left;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }
    /* The name always keeps its full 2 lines — a deal shrinks the font
       instead of cutting a line off, so long names still read in full. */
    .label-name.has-deal { font-size: 5.5pt; }
    .label-name.has-deal-long { font-size: 5pt; }
    .price-group {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .price-group.has-deal { gap: 0.4mm; }
    .price-regular {
      font-size: 20pt;
      font-weight: 900;
      line-height: 1;
      text-align: left;
    }
    .price-group.has-deal .price-regular {
      font-size: 12pt;
    }
    .price-dollar {
      font-size: 10pt;
      font-weight: 700;
      margin-right: 0.4mm;
    }
    .price-group.has-deal .price-dollar {
      font-size: 6pt;
    }
    /* Deal text is meant to grab attention on its own, not read like a
       caption under the price — bold, in the template's bright accent
       color, with a border-only "badge" outline (never a background fill,
       so it stays legible with print backgrounds off by default). */
    .price-deal {
      min-width: 0;
      max-width: 100%;
      font-size: 9pt;
      font-weight: 800;
      line-height: 1.1;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 1pt solid;
      border-radius: 2pt;
      padding: 0.3mm 1mm;
    }
    .label-side {
      width: 17mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.4mm;
    }
    .label-barcode-wrap {
      width: 100%;
      flex-shrink: 0;
      text-align: center;
    }
    /* The side column holds only the barcode (the QR was taken off, 2026-10-02), so the bars are taller and easier to scan */
    .label-barcode {
      display: block;
      width: 100%;
      height: 9mm;
    }
    .label-barcode-val {
      font-size: 4.5pt;
      color: #555;
      letter-spacing: 0.2px;
      margin-top: 0.2mm;
      word-break: break-all;
    }
`;

// The same label read standing up, for tall labels (A4, 18 a sheet): name on top, the price big near the middle, the deal under it, then
// the barcode at the bottom. Sizes come from tallCss, so they follow the label width.
function renderUpright(label: PrintableLabel): string {
  const cssClass = TEMPLATE_CLASS[label.template] || TEMPLATE_CLASS.CLASSIC_RED_BLACK;
  const icon = TEMPLATE_ICONS[label.template] || '';
  const barcode = label.barcode?.trim();
  const deal = label.dealText?.trim();
  return `
    <div class="label up ${cssClass}${barcode ? '' : ' no-barcode'}">
      <div class="watermark">LUCKY STOP</div>
      <div class="label-name up-name${label.productName.length > 24 ? ' long' : ''}">${icon}${esc(label.productName)}</div>
      <div class="up-fill top"></div>
      <div class="price-regular up-price${label.priceText.length >= 6 ? ' long' : ''}"><span class="price-dollar">$</span>${esc(label.priceText)}</div>
      ${deal ? `<div class="price-deal">${esc(deal)}</div>` : ''}
      <div class="up-fill"></div>
      ${barcode ? `
      <div class="label-barcode-wrap">
        ${renderBarcodeSvg(barcode)}
        <div class="label-barcode-val">${esc(barcode)}</div>
      </div>` : ''}
    </div>
  `;
}

// One tall label: the usual design turned 90 degrees to run along the long side, or the upright design
function tallCell(label: PrintableLabel, s: SheetSettings): string {
  return s.design === 'upright'
    ? `<div class="cell">${renderUpright(label)}</div>`
    : `<div class="cell"><div class="rot">${renderLabel(label)}</div></div>`;
}

const n = (x: number) => Number(x.toFixed(3));

// A4, 18 tall labels: each sheet is its own page with the labels at the measured positions (the page margin is 0, so the millimetres
// count from the paper's edge). Same as admin's tallCss.
function tallCss(s: SheetSettings): string {
  const a = s.a4;
  const k = tallScale(a);
  const rotK = a.labelW / 25.4;       // the usual design is 1 in tall: stretched to the label's width
  const rotW = a.labelH / rotK;       // and made as long as the label, before that stretch
  return `
    @page { size: A4; margin: 0; }
    .sheet {
      width: 210mm; height: 296mm; padding: ${a.top}mm 0 0 ${a.left}mm; overflow: hidden;
      display: grid; grid-template-columns: repeat(${A4_COLS}, ${a.labelW}mm); grid-template-rows: repeat(${A4_ROWS}, ${a.labelH}mm);
      column-gap: ${a.gapX}mm; row-gap: ${a.gapY}mm; align-content: start;
      break-after: page; page-break-after: always;
    }
    .sheet:last-child { break-after: auto; page-break-after: auto; }
    .cell { position: relative; width: ${a.labelW}mm; height: ${a.labelH}mm; overflow: hidden; }
    .rot { position: absolute; top: 0; left: 0; width: ${n(rotW)}mm; height: 1in; transform-origin: 0 0; transform: translateX(${a.labelW}mm) rotate(90deg) scale(${n(rotK)}); }
    .rot .label { width: 100%; height: 100%; }

    .label.up { width: 100%; height: 100%; flex-direction: column; align-items: stretch; padding: ${n(2 * k)}mm ${n(1.6 * k)}mm; gap: ${n(1.4 * k)}mm; }
    .up .up-name { font-size: ${n(9 * k)}pt; line-height: 1.12; text-align: center; -webkit-line-clamp: 4; }
    .up .up-name.long { font-size: ${n(7.5 * k)}pt; -webkit-line-clamp: 5; }
    .up .up-price { font-size: ${n(24 * k)}pt; text-align: center; white-space: nowrap; }
    .up .up-price.long { font-size: ${n(19 * k)}pt; }
    .up .up-price .price-dollar { font-size: ${n(11 * k)}pt; }
    .up .price-deal { align-self: center; font-size: ${n(10 * k)}pt; text-align: center; white-space: normal; }
    .up .up-fill { flex: 1; }
    .up .up-fill.top { flex: 0.6; }
    .up .label-barcode { height: ${n(9 * k)}mm; }
    .up .label-barcode-val { font-size: ${n(6 * k)}pt; text-align: center; margin-top: ${n(0.4 * k)}mm; }
    .up .watermark { writing-mode: vertical-rl; font-size: ${n(16 * k)}pt; letter-spacing: 2px; }

    .outline { border: 0.3mm dashed #333; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; color: #333; }
    .outline b { font-size: 16pt; }
    .outline small { font-size: 7pt; writing-mode: vertical-rl; }
  `;
}

function page(css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Labels</title>
  <style>${css}</style>
</head>
<body>
  ${body}
</body>
</html>`;
}

// `skip` leaves that many spots empty at the start of the first sheet (a sheet with some labels already peeled off)
export function buildHtml(entries: PrintableLabelEntry[], sheet: SheetSettings = DEFAULT_SHEET, skip = 0): string {
  const labels: PrintableLabel[] = entries.flatMap(e => Array(Math.max(1, e.quantity)).fill(e.label));
  if (sheet.format === 'letter30') {
    // 30 to a sheet, each sheet its own page
    const slots: (PrintableLabel | null)[] = [...Array(skip).fill(null), ...labels];
    const sheets: string[] = [];
    for (let i = 0; i < slots.length; i += LETTER_PER_SHEET) {
      sheets.push(`<div class="lsheet">${slots.slice(i, i + LETTER_PER_SHEET).map(l => (l ? renderLabel(l) : '<div class="label-blank"></div>')).join('')}</div>`);
    }
    return page(letterLayout(sheet) + LABEL_STYLE, sheets.join(''));
  }
  const slots: (PrintableLabel | null)[] = [...Array(skip).fill(null), ...labels];
  const sheets: string[] = [];
  for (let i = 0; i < slots.length; i += A4_PER_SHEET) {
    sheets.push(`<div class="sheet">${slots.slice(i, i + A4_PER_SHEET).map(l => (l ? tallCell(l, sheet) : '<div class="cell blank"></div>')).join('')}</div>`);
  }
  return page(LABEL_STYLE + tallCss(sheet), sheets.join(''));
}

// A test page: just the outline of each label, numbered, to print on plain paper and hold against a sheet of labels
export function buildTestSheetHtml(sheet: SheetSettings): string {
  if (sheet.format === 'letter30') {
    return page(letterLayout(sheet) + LABEL_STYLE, `<div class="lsheet">${Array.from({ length: LETTER_PER_SHEET }, (_, i) => `<div class="label-test"><b>${i + 1}</b></div>`).join('')}</div>`);
  }
  const cells = Array.from({ length: A4_PER_SHEET }, (_, i) =>
    `<div class="cell outline"><b>${i + 1}</b><small>${sheet.a4.labelW} x ${sheet.a4.labelH} mm</small></div>`).join('');
  return page(LABEL_STYLE + tallCss({ ...sheet, format: 'a4x18' }), `<div class="sheet">${cells}</div>`);
}

async function output(html: string, pageSize: { width: number; height: number }, shareAsPdf: boolean) {
  if (shareAsPdf) {
    const { uri } = await Print.printToFileAsync({ html, ...pageSize });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Labels.pdf',
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html, ...pageSize });
  }
}

export async function printLabels({
  entries,
  shareAsPdf = false,
  sheet = DEFAULT_SHEET,
  skip = 0,
}: {
  entries: PrintableLabelEntry[];
  shareAsPdf?: boolean;
  sheet?: SheetSettings;
  skip?: number;
}): Promise<void> {
  await output(buildHtml(entries, sheet, skip), PAGE_POINTS[sheet.format], shareAsPdf);
}

export async function printTestSheet(sheet: SheetSettings): Promise<void> {
  await output(buildTestSheetHtml(sheet), PAGE_POINTS[sheet.format], false);
}
