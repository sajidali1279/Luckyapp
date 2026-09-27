import { code128ToSvg } from './code128';
import { printWhenLoaded } from './printWindow';
import { SheetSettings, A4Sizes, A4_PER_SHEET, A4_COLS, A4_ROWS, SIZE_LIMITS, A4_DEFAULTS, cleanSheet, fitProblem, tallScale, loadSheet, saveSheet } from './labelSheet';

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

// The bars are drawn here as plain markup: no script runs on the printed page and nothing is fetched, so the barcode is on the paper
// even when the store's network blocks outside websites. The box is 26 units tall at one unit per module, the same proportions the
// sheet has always had.
function barcodeSvg(barcode: string): string {
  const { rects, modules } = code128ToSvg(barcode, 26);
  return `<svg class="label-barcode" viewBox="0 0 ${modules} 26" role="img" aria-label="Barcode ${esc(barcode)}" shape-rendering="crispEdges">${rects}</svg>`;
}

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
          ${barcodeSvg(barcode)}
          <div class="label-barcode-val">${esc(barcode)}</div>
        </div>` : ''}
      </div>
    </div>
  `;
}

// The same label read standing up, for tall labels (A4, 18 a sheet): name on top, the price big near the middle, the deal under it, then
// the QR code and the barcode at the bottom. Sizes come from the sheet's CSS (tallCss), so they follow the label width.
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
      <div class="up-qr">
        <img class="label-qr" src="${QR_CODE_DATA_URI}" alt="" />
        <div class="label-qr-caption">Scan to Join</div>
      </div>
      ${barcode ? `
      <div class="label-barcode-wrap">
        ${barcodeSvg(barcode)}
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

function grid(entries: PrintableLabelEntry[], s: SheetSettings): string {
  const labels: PrintableLabel[] = entries.flatMap(e => Array(Math.max(1, e.quantity)).fill(e.label));
  if (s.format === 'letter30') return `<div class="grid">${labels.map(renderLabel).join('')}</div>`;
  const sheets: string[] = [];
  for (let i = 0; i < labels.length; i += A4_PER_SHEET) {
    sheets.push(`<div class="sheet">${labels.slice(i, i + A4_PER_SHEET).map(l => tallCell(l, s)).join('')}</div>`);
  }
  return sheets.join('');
}

// A test page: just the outline of each label, numbered and measured, to print on plain paper and hold against a sheet of labels
// before using real ones
function outlineSheet(s: SheetSettings): string {
  const cells = Array.from({ length: A4_PER_SHEET }, (_, i) =>
    `<div class="cell outline"><b>${i + 1}</b><small>${s.a4.labelW} x ${s.a4.labelH} mm</small></div>`).join('');
  return `<div class="sheet">${cells}</div>`;
}

function labelCount(entries: PrintableLabelEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.max(1, e.quantity), 0);
}

// One store's name on an otherwise blank sheet of its own, ahead of that store's labels — so a stack of sheets for several stores can
// be split apart correctly by whoever is handing them out, without opening a bulk print and cutting a single store's labels off
// mid-sheet. Never mistaken for a label: full page, no die-cut grid, plain text.
function dividerPage(storeName: string, count: number, first: boolean): string {
  return `<div class="divider-page${first ? '' : ' divider-break'}">
    <div class="divider-title">${esc(storeName)}</div>
    <div class="divider-sub">${count} label${count === 1 ? '' : 's'}</div>
  </div>`;
}

const LETTER_LAYOUT = `
    /* Matches a real, specific product: 1in x 2-5/8in address-label sheets
       (Avery 5160-compatible - e.g. the Walmart "3000 Mailing Address
       Labels" box), 30 labels/sheet, 3 columns x 10 rows, on US Letter.
       Margins and gap are the sheet's actual die-cut positions, not chosen
       for density - printing outside these exact numbers means labels
       land on the sticker seams instead of centered on each sticker. */
    @page { size: letter; margin: 0.5in 0.1875in; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 2.625in);
      grid-auto-rows: 1in;
      column-gap: 0.125in;
      row-gap: 0;
    }
    @media screen {
      .grid { background: #fff; width: 8.5in; padding: 0.5in 0.1875in; margin: 16px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.18); }
    }
`;

const LABEL_STYLE = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    @media screen { body { background: #e5e7eb; } }
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
    .label-qr-caption {
      font-size: 4.5pt;
      font-weight: 700;
      letter-spacing: 0.2px;
      color: #555;
      text-align: center;
      white-space: nowrap;
    }
    .label-qr {
      width: 7mm;
      height: 7mm;
      flex-shrink: 0;
    }
    /* No barcode to share the column with — let the QR grow into the
       freed-up space instead of leaving it blank. */
    .label-side.no-barcode .label-qr {
      width: 14mm;
      height: 14mm;
    }
    .label-barcode-wrap {
      width: 100%;
      flex-shrink: 0;
      text-align: center;
    }
    .label-barcode {
      display: block;
      width: 100%;
      height: 5mm;
    }
    .label-barcode-val {
      font-size: 4.5pt;
      color: #555;
      letter-spacing: 0.2px;
      margin-top: 0.2mm;
      word-break: break-all;
    }
    /* One store's heading page, ahead of a bulk print's grouped sheets (printLabelsGrouped only) */
    .divider-page {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      break-after: page;
      page-break-after: always;
    }
    .divider-break { break-before: page; page-break-before: always; }
    .divider-title { font-size: 28pt; font-weight: 800; color: #1a1a1a; }
    .divider-sub { margin-top: 6pt; font-size: 13pt; font-weight: 600; color: #667; }
`;

const n = (x: number) => Number(x.toFixed(3));

// A4, 18 tall labels: each sheet is its own page with the labels at the measured positions (the page margin is 0, so the millimetres
// count from the paper's edge). Turned sideways, the usual design is drawn at the size that fills the label's long side and turned 90
// degrees; upright, the stacked design is sized from the label's width.
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
    @media screen { .sheet { background: #fff; margin: 16px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.18); } }
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
    .up .up-fill.top { flex: 0.6; }   /* the price sits a little above the middle, where the eye lands */
    .up .up-qr { display: flex; flex-direction: column; align-items: center; gap: ${n(0.5 * k)}mm; }
    .up .label-qr { width: ${n(12 * k)}mm; height: ${n(12 * k)}mm; }
    .up.no-barcode .label-qr { width: ${n(17 * k)}mm; height: ${n(17 * k)}mm; }
    .up .label-qr-caption { font-size: ${n(5.5 * k)}pt; }
    .up .label-barcode { height: ${n(9 * k)}mm; }
    .up .label-barcode-val { font-size: ${n(6 * k)}pt; text-align: center; margin-top: ${n(0.4 * k)}mm; }
    .up .watermark { writing-mode: vertical-rl; font-size: ${n(16 * k)}pt; letter-spacing: 2px; }

    .outline { border: 0.3mm dashed #333; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; color: #333; }
    .outline b { font-size: 16pt; }
    .outline small { font-size: 7pt; writing-mode: vertical-rl; }
    .divider-page { height: 296mm; }
    @media screen { .divider-page { background: #fff; width: 210mm; margin: 16px auto; } }
  `;
}

function sheetCss(s: SheetSettings): string {
  return s.format === 'letter30' ? LETTER_LAYOUT + LABEL_STYLE : LABEL_STYLE + tallCss(s);
}

// The bar across the top of the print page: which paper, which design, the sizes and a test page. It is never printed.
const TOOLBAR_STYLE = `
  .toolbar { position: sticky; top: 0; z-index: 10; background: #0f172a; color: #e2e8f0; padding: 12px 18px; font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
  .toolbar [hidden] { display: none !important; }
  .toolbar .tb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
  .toolbar .tb-title { font-weight: 800; font-size: 16px; color: #fff; }
  .toolbar .tb-sum { color: #94a3b8; }
  .toolbar label { display: inline-flex; align-items: center; gap: 6px; }
  .toolbar select, .toolbar input[type=number] { font: inherit; color: #0f172a; background: #fff; border: 1px solid #cbd5e1; border-radius: 7px; padding: 5px 8px; }
  .toolbar input[type=number] { width: 72px; }
  .toolbar .tb-print { margin-left: auto; background: #2563eb; color: #fff; border: none; border-radius: 9px; padding: 9px 20px; font-weight: 800; font-size: 15px; cursor: pointer; }
  .toolbar .tb-print:disabled { opacity: 0.5; cursor: not-allowed; }
  .toolbar .tb-link { background: none; border: none; color: #93c5fd; text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }
  .toolbar .tb-hint { color: #cbd5e1; font-size: 13px; }
  .toolbar .tb-warn { color: #fca5a5; font-weight: 700; }
  .toolbar .tb-warn:empty { display: none; }
  .toolbar .tb-sizes { background: #1e293b; border-radius: 10px; padding: 10px 12px; }
  @media print { .toolbar { display: none !important; } }
`;

const SIZE_FIELDS: [keyof A4Sizes, string][] = [
  ['labelW', 'Label width'], ['labelH', 'Label height'], ['top', 'Top edge to first label'], ['left', 'Left edge to first label'],
  ['gapX', 'Gap between columns'], ['gapY', 'Gap between rows'],
];

const TOOLBAR_HTML = `
  <div class="toolbar" role="region" aria-label="Print settings">
    <div class="tb-row">
      <span class="tb-title">Print labels</span>
      <span class="tb-sum" id="tb-sum"></span>
      <label>Paper
        <select id="tb-paper">
          <option value="letter30">US Letter, 30 labels (3 across, 10 down)</option>
          <option value="a4x18">A4, 18 labels (6 across, 3 down)</option>
        </select>
      </label>
      <label id="tb-design-wrap">Design
        <select id="tb-design">
          <option value="sideways">Turned sideways (for a shelf edge)</option>
          <option value="upright">Upright (for a door or a peg)</option>
        </select>
      </label>
      <label id="tb-outline-wrap"><input type="checkbox" id="tb-outlines" /> Test page (outlines only)</label>
      <button type="button" class="tb-link" id="tb-sizes-toggle" aria-expanded="false" aria-controls="tb-sizes">Adjust sizes</button>
      <button type="button" class="tb-print" id="tb-print">Print</button>
    </div>
    <div class="tb-row tb-sizes" id="tb-sizes" hidden>
      ${SIZE_FIELDS.map(([k, name]) => `<label>${name} <input type="number" step="0.1" min="${SIZE_LIMITS[k][0]}" max="${SIZE_LIMITS[k][1]}" id="tb-${k}" /> mm</label>`).join('')}
      <button type="button" class="tb-link" id="tb-reset">Back to the starting sizes</button>
    </div>
    <div class="tb-row">
      <span class="tb-warn" id="tb-warn" role="alert"></span>
      <span class="tb-hint" id="tb-hint"></span>
    </div>
  </div>
`;

// Opens the print page with its settings bar. The bar is wired up from here (this page's own script), because the print window
// inherits this site's Content-Security-Policy and may not run scripts of its own. The print dialog opens by itself as before, with the
// paper chosen last time; changing the paper or the sizes redraws the sheets, and Print prints again.
function openPrintWindow(bodyFor: (s: SheetSettings) => string, count: number): boolean {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to print labels.'); return false; }
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Labels</title>
  <style>${TOOLBAR_STYLE}</style>
  <style id="sheet-style"></style>
</head>
<body>
  ${TOOLBAR_HTML}
  <main id="sheets"></main>
</body>
</html>`);
  win.document.close();

  const doc = win.document;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  let settings = loadSheet();

  function render(keepFocused = false) {
    const tall = settings.format === 'a4x18';
    const outlines = tall && el<HTMLInputElement>('tb-outlines').checked;
    el<HTMLStyleElement>('sheet-style').textContent = sheetCss(settings);
    el('sheets').innerHTML = outlines ? outlineSheet(settings) : bodyFor(settings);
    el<HTMLSelectElement>('tb-paper').value = settings.format;
    el<HTMLSelectElement>('tb-design').value = settings.design;
    el('tb-design-wrap').hidden = !tall;
    el('tb-outline-wrap').hidden = !tall;
    el('tb-sizes-toggle').hidden = !tall;
    if (!tall) el('tb-sizes').hidden = true;
    SIZE_FIELDS.forEach(([k]) => {
      const input = el<HTMLInputElement>(`tb-${k}`);
      if (!(keepFocused && doc.activeElement === input)) input.value = String(settings.a4[k]);
    });
    const problem = tall ? fitProblem(settings.a4) : null;
    el('tb-warn').textContent = problem ?? '';
    el<HTMLButtonElement>('tb-print').disabled = !!problem;
    const sheets = Math.max(1, Math.ceil(count / (tall ? A4_PER_SHEET : 30)));
    el('tb-sum').textContent = outlines ? 'Test page: 1 sheet' : `${count} label${count === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'}`;
    el('tb-hint').textContent = tall
      ? 'In the print box choose paper A4, scale 100% (actual size, not "fit") and margins None. Not lined up? Print the test page on plain paper, hold it against a label sheet, and adjust the sizes.'
      : 'In the print box choose paper Letter and scale 100% (actual size).';
  }

  function change(next: Partial<SheetSettings>, keepFocused = false) {
    settings = cleanSheet({ ...settings, ...next });
    saveSheet(settings);
    render(keepFocused);
  }

  el('tb-paper').addEventListener('change', (e) => change({ format: (e.target as HTMLSelectElement).value as SheetSettings['format'] }));
  el('tb-design').addEventListener('change', (e) => change({ design: (e.target as HTMLSelectElement).value as SheetSettings['design'] }));
  el('tb-outlines').addEventListener('change', () => render());
  el('tb-sizes-toggle').addEventListener('click', () => {
    const box = el('tb-sizes');
    box.hidden = !box.hidden;
    el('tb-sizes-toggle').setAttribute('aria-expanded', String(!box.hidden));
  });
  SIZE_FIELDS.forEach(([k]) => {
    const input = el<HTMLInputElement>(`tb-${k}`);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) change({ a4: { ...settings.a4, [k]: v } }, true);
    });
    input.addEventListener('change', () => render());   // leaving the box shows the number as it was kept
  });
  el('tb-reset').addEventListener('click', () => change({ a4: { ...A4_DEFAULTS } }));
  el('tb-print').addEventListener('click', () => { if (!el<HTMLButtonElement>('tb-print').disabled) { win.focus(); win.print(); } });

  render();
  // Sizes that would not fit wait for a fix instead of printing across the seams
  if (!(settings.format === 'a4x18' && fitProblem(settings.a4))) printWhenLoaded(win);
  return true;
}

export function printLabels(entries: PrintableLabelEntry[]): boolean {
  return openPrintWindow((s) => grid(entries, s), labelCount(entries));
}

export interface PrintableLabelStoreGroup {
  storeName: string;
  entries: PrintableLabelEntry[];
}

// A bulk print across several stores: each store's sheets are preceded by a heading page with its name, so the stack can be split apart
// correctly afterward. A group with no labels is skipped (nothing to divide).
export function printLabelsGrouped(groups: PrintableLabelStoreGroup[]): boolean {
  const real = groups.filter((g) => g.entries.length > 0);
  const body = (s: SheetSettings) => real
    .map((g, i) => dividerPage(g.storeName, labelCount(g.entries), i === 0) + grid(g.entries, s))
    .join('');
  return openPrintWindow(body, real.reduce((sum, g) => sum + labelCount(g.entries), 0));
}
