import { code128ToSvg } from './code128';
import { SheetSettings, A4Sizes, A4_PER_SHEET, A4_COLS, A4_ROWS, SIZE_LIMITS, A4_DEFAULTS, cleanSheet, fitProblem, tallScale, loadSheet, saveSheet, LetterLayout, LETTER_LIMITS, LETTER_DEFAULTS, LETTER_MARGIN_MM, LETTER_COLS, LETTER_ROWS, letterFitProblem } from './labelSheet';
import { renderPagePng, zipFiles, downloadBytes } from './labelImages';

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
          ${barcodeSvg(barcode)}
          <div class="label-barcode-val">${esc(barcode)}</div>
        </div>
      </div>` : ''}
    </div>
  `;
}

// The same label read standing up, for tall labels (A4, 18 a sheet): name on top, the price big near the middle, the deal under it, then
// the barcode at the bottom. Sizes come from the sheet's CSS (tallCss), so they follow the label width.
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

const expand = (entries: PrintableLabelEntry[]): PrintableLabel[] => entries.flatMap(e => Array(Math.max(1, e.quantity)).fill(e.label));
const LETTER_PER_SHEET = 30;
const perSheet = (s: SheetSettings) => (s.format === 'a4x18' ? A4_PER_SHEET : LETTER_PER_SHEET);

// The labels of one print as sheets. `skip` leaves that many spots empty at the start of the first sheet (a sheet with some labels
// already peeled off). Letter keeps its one flowing grid for printing (the page margins place it, as always); A4 sheets are one page each.
function letterSheets(labels: PrintableLabel[], skip: number): string[] {
  const slots: (PrintableLabel | null)[] = [...Array(skip).fill(null), ...labels];
  const sheets: string[] = [];
  for (let i = 0; i < slots.length; i += LETTER_PER_SHEET) {
    sheets.push(`<div class="lsheet">${slots.slice(i, i + LETTER_PER_SHEET).map(l => (l ? renderLabel(l) : '<div class="label-blank"></div>')).join('')}</div>`);
  }
  return sheets;
}

function a4Sheets(labels: PrintableLabel[], s: SheetSettings, skip: number, captions: boolean): string[] {
  const slots: (PrintableLabel | null)[] = [...Array(skip).fill(null), ...labels];
  const sheets: string[] = [];
  for (let i = 0; i < slots.length; i += A4_PER_SHEET) {
    sheets.push(`<div class="sheet">${slots.slice(i, i + A4_PER_SHEET).map(l => (l ? tallCell(l, s) : '<div class="cell blank"></div>')).join('')}</div>`);
  }
  return captions ? sheets.map((sh, i) => `<div class="ps-cap">Sheet ${i + 1} of ${sheets.length}</div>${sh}`) : sheets;
}

// A test page: just the outline of each label, numbered and measured, to print on plain paper and hold against a sheet of labels
// before using real ones
function outlineSheet(s: SheetSettings): string {
  if (s.format === 'letter30') {
    return `<div class="lsheet">${Array.from({ length: LETTER_PER_SHEET }, (_, i) => `<div class="label-test"><b>${i + 1}</b></div>`).join('')}</div>`;
  }
  const cells = Array.from({ length: A4_PER_SHEET }, (_, i) =>
    `<div class="cell outline"><b>${i + 1}</b><small>${s.a4.labelW} x ${s.a4.labelH} mm</small></div>`).join('');
  return `<div class="sheet">${cells}</div>`;
}

function labelCount(entries: PrintableLabelEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.max(1, e.quantity), 0);
}

// One print: a single list, or a bulk print with one group per store (each after a page with the store's name)
interface PrintJob { groups: { storeName: string | null; entries: PrintableLabelEntry[] }[] }
type View = 'labels' | 'test';

function printBody(job: PrintJob, s: SheetSettings, skip: number, view: View): string {
  if (view === 'test') return outlineSheet(s);
  return job.groups.map((g, i) => {
    const labels = expand(g.entries);
    const sheets = s.format === 'letter30' ? letterSheets(labels, skip).join('') : a4Sheets(labels, s, skip, true).join('');
    return g.storeName == null ? sheets : dividerPage(g.storeName, labels.length, i === 0) + sheets;
  }).join('');
}

// The same sheets for pictures: every sheet on its own page-sized box (Letter included), no store pages, no captions
function imagePages(job: PrintJob, s: SheetSettings, skip: number, view: View): { name: string; html: string }[] {
  if (view === 'test') return [{ name: 'test-page', html: `<div class="img-page ${s.format === 'letter30' ? 'letter' : 'a4'}">${outlineSheet(s)}</div>` }];
  const pages: { name: string; html: string }[] = [];
  job.groups.forEach((g) => {
    const labels = expand(g.entries);
    const prefix = g.storeName ? `${g.storeName.replace(/[^A-Za-z0-9#-]+/g, '-').replace(/^-+|-+$/g, '')}-` : '';
    if (s.format === 'a4x18') {
      const sheets = a4Sheets(labels, s, skip, false);
      sheets.forEach((sh, i) => pages.push({ name: `${prefix}sheet-${i + 1}-of-${sheets.length}`, html: `<div class="img-page a4">${sh}</div>` }));
    } else {
      const sheets = letterSheets(labels, skip);
      sheets.forEach((sh, i) => pages.push({ name: `${prefix}sheet-${i + 1}-of-${sheets.length}`, html: `<div class="img-page letter">${sh}</div>` }));
    }
  });
  return pages;
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

const letterLayout = (s: SheetSettings) => {
  const l = s.letter;
  return `
    /* Matches a real, specific product: 1in x 2-5/8in address-label sheets (Avery 5160-compatible - e.g. the Walmart "3000 Mailing
       Address Labels" box), 30 labels/sheet, 3 columns x 10 rows, on US Letter. Each sheet is its own page with the page margin 0, so
       the millimetres count from the paper's edge: the first label 1/2 in down and 3/16 in in, moved by the printer fine-tune, and
       the label size and the space between columns and rows as set (starting at the sheet's own numbers). */
    @page { size: letter; margin: 0; }
    .lsheet {
      width: 215.9mm; height: 279mm; overflow: hidden;
      padding: ${n(LETTER_MARGIN_MM.topBottom + l.down)}mm 0 0 ${n(LETTER_MARGIN_MM.side + l.right)}mm;
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
    .divider-page { height: 279mm; }
    @media screen {
      .lsheet { background: #fff; margin: 16px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.18); }
      .divider-page { background: #fff; width: 215.9mm; margin: 16px auto; }
    }
`;
};

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
  return s.format === 'letter30' ? letterLayout(s) + LABEL_STYLE : LABEL_STYLE + tallCss(s);
}

// What a picture of a sheet needs on top of the sheet's own CSS: the page box, and none of the on-screen extras of the preview
const IMAGE_CSS = `
  .img-page { background: #fff; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }   /* a picture has no <body> to take the font from */
  .img-page.a4 { width: 210mm; height: 297mm; }
  .img-page.letter { width: 8.5in; height: 11in; }
  .img-page .lsheet { margin: 0 !important; box-shadow: none !important; height: 279.4mm; }
  .img-page .sheet { margin: 0 !important; box-shadow: none !important; height: 297mm; }
  .img-page .label-blank, .img-page .cell.blank { outline: none !important; background: none !important; }
`;

// The print page around the sheets: settings on the left, the sheets at actual size on the right. None of it is printed.
const PANEL_STYLE = `
  .ps-app { display: grid; grid-template-columns: 360px minmax(0, 1fr); min-height: 100vh; font: 14px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; }
  .ps-panel { position: sticky; top: 0; height: 100vh; overflow-y: auto; background: #fff; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
  .ps-head { padding: 18px 20px 14px; border-bottom: 1px solid #eef2f7; }
  .ps-title { font-size: 19px; font-weight: 800; }
  .ps-sum { margin-top: 3px; color: #475569; font-weight: 600; }
  .ps-next { margin-top: 6px; font-size: 12.5px; color: #64748b; }
  .ps-sec { padding: 14px 20px; border-bottom: 1px solid #eef2f7; }
  .ps-sec[hidden], .ps-panel [hidden] { display: none !important; }
  .ps-sec h2 { margin: 0 0 9px; font-size: 11.5px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; color: #64748b; }
  .ps-help { margin: -3px 0 9px; font-size: 12.5px; color: #64748b; }
  .ps-cards { display: grid; gap: 8px; }
  .ps-cards.two { grid-template-columns: 1fr 1fr; }
  .ps-card { position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1.5px solid #e2e8f0; border-radius: 12px; cursor: pointer; background: #fff; }
  .ps-cards.two .ps-card { flex-direction: column; align-items: center; text-align: center; gap: 8px; }
  .ps-card:hover { border-color: #93c5fd; }
  .ps-card input { position: absolute; opacity: 0; pointer-events: none; }
  .ps-card:has(input:checked) { border-color: #2563eb; background: #eff6ff; box-shadow: 0 0 0 3px #2563eb22; }
  .ps-card:has(input:focus-visible) { outline: 2px solid #2563eb; outline-offset: 2px; }
  .ps-card b { display: block; font-size: 14px; }
  .ps-card small { display: block; font-size: 12px; color: #64748b; margin-top: 1px; }
  .ps-mini { flex-shrink: 0; display: grid; gap: 2px; padding: 4px; background: #fff; border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
  .ps-mini i { display: block; background: #bfdbfe; border-radius: 1px; }
  .ps-mini.letter { grid-template-columns: repeat(3, 11px); grid-auto-rows: 4px; }
  .ps-mini.a4 { grid-template-columns: repeat(6, 5px); grid-auto-rows: 16px; }
  .ps-tag { width: 34px; height: 64px; border: 1.5px solid #334155; border-top: 4px solid #dc2626; border-radius: 3px; display: flex; align-items: center; justify-content: center; background: #fff; }
  .ps-tag.side span { transform: rotate(90deg); font-weight: 900; font-size: 13px; color: #dc2626; white-space: nowrap; }
  .ps-tag.up { flex-direction: column; justify-content: space-between; padding: 4px 3px; }
  .ps-tag.up .n { width: 22px; height: 3px; background: #334155; border-radius: 1px; }
  .ps-tag.up .p { font-weight: 900; font-size: 11px; color: #dc2626; }
  .ps-tag.up .q { width: 12px; height: 12px; background: repeating-linear-gradient(90deg, #334155 0 2px, #fff 2px 3px); }
  .ps-start { display: flex; gap: 14px; align-items: flex-start; }
  .ps-sheetpick { display: grid; gap: 3px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; }
  .ps-sheetpick.letter { grid-template-columns: repeat(3, 38px); grid-auto-rows: 15px; }
  .ps-sheetpick.a4 { grid-template-columns: repeat(6, 22px); grid-auto-rows: 44px; }
  .ps-sheetpick button { border: 1px solid #cbd5e1; border-radius: 2px; background: #fff; font-size: 9px; color: #64748b; cursor: pointer; padding: 0; }
  .ps-sheetpick button.used { background: repeating-linear-gradient(45deg, #e2e8f0 0 3px, #f8fafc 3px 6px); color: transparent; }
  .ps-sheetpick button.first { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 800; }
  .ps-sheetpick button:hover { border-color: #2563eb; }
  .ps-stepper { display: inline-flex; align-items: center; border: 1.5px solid #cbd5e1; border-radius: 9px; overflow: hidden; }
  .ps-stepper button { width: 30px; height: 32px; border: none; background: #f1f5f9; font-size: 17px; font-weight: 700; cursor: pointer; color: #0f172a; }
  .ps-stepper input { width: 46px; height: 32px; border: none; text-align: center; font: inherit; font-weight: 700; }
  .ps-start-side { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; font-size: 12.5px; color: #64748b; }
  .ps-stepper input::-webkit-inner-spin-button, .ps-stepper input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .ps-stepper input { -moz-appearance: textfield; }
  .ps-sizes summary { cursor: pointer; font-weight: 700; color: #1d4ed8; list-style: none; display: flex; align-items: center; gap: 6px; }
  .ps-sizes summary::-webkit-details-marker { display: none; }
  .ps-sizes summary::before { content: '▸'; transition: transform .15s; }
  .ps-sizes[open] summary::before { transform: rotate(90deg); }
  .ps-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin-top: 12px; }
  .ps-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569; font-weight: 600; }
  .ps-field span.in { display: flex; align-items: center; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 0 8px; background: #fff; }
  .ps-field span.in:focus-within { border-color: #2563eb; }
  .ps-field input { width: 100%; border: none; outline: none; padding: 7px 0; font: inherit; font-size: 14px; color: #0f172a; background: transparent; }
  .ps-field em { font-style: normal; color: #94a3b8; font-size: 12px; }
  .ps-link { border: none; background: none; padding: 0; margin-top: 10px; color: #1d4ed8; font: inherit; font-size: 12.5px; font-weight: 700; text-decoration: underline; cursor: pointer; }
  .ps-warn { margin-top: 10px; padding: 9px 11px; border-radius: 9px; background: #fef2f2; color: #b91c1c; font-weight: 700; font-size: 13px; }
  .ps-warn:empty { display: none; }
  .ps-actions { margin-top: auto; position: sticky; bottom: 0; background: #fff; border-top: 1px solid #e2e8f0; padding: 14px 20px 16px; display: flex; flex-direction: column; gap: 8px; }
  .ps-primary, .ps-secondary { width: 100%; border-radius: 11px; padding: 11px 14px; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .ps-primary { background: #2563eb; color: #fff; border: none; }
  .ps-secondary { background: #fff; color: #1e293b; border: 1.5px solid #cbd5e1; }
  .ps-primary:disabled, .ps-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ps-tip { font-size: 12px; color: #64748b; margin: 2px 0 0; }
  .ps-status { font-size: 12.5px; font-weight: 700; color: #1d4ed8; margin: 0; }
  .ps-status.bad { color: #b91c1c; }
  .ps-status:empty { display: none; }
  .ps-preview { padding: 14px 28px 48px; min-width: 0; overflow-x: auto; background: #e5e7eb; }
  .ps-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; max-width: 820px; margin: 0 auto 4px; }
  .ps-seg { display: inline-flex; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 3px; }
  .ps-seg[hidden] { display: none; }
  .ps-seg label { padding: 6px 12px; border-radius: 7px; font-weight: 700; font-size: 13px; color: #475569; cursor: pointer; }
  .ps-seg input { position: absolute; opacity: 0; pointer-events: none; }
  .ps-seg label:has(input:checked) { background: #0f172a; color: #fff; }
  .ps-note { font-size: 12.5px; color: #64748b; }
  .ps-cap { max-width: 210mm; margin: 18px auto -8px; font-size: 12.5px; font-weight: 700; color: #475569; }
  @media screen {
    .label-blank { outline: 1px dashed #cbd5e1; outline-offset: -3px; background: repeating-linear-gradient(45deg, #f1f5f9 0 6px, #fff 6px 12px); }
    .cell.blank { outline: 1px dashed #cbd5e1; outline-offset: -3px; background: repeating-linear-gradient(45deg, #f1f5f9 0 6px, #fff 6px 12px); }
  }
  @media print {
    .ps-panel, .ps-preview-bar, .ps-cap { display: none !important; }
    .ps-app, .ps-preview { display: block !important; padding: 0 !important; margin: 0 !important; background: none !important; min-height: 0 !important; }
  }
`;

const LETTER_SIZE_FIELDS: [keyof LetterLayout, string][] = [
  ['gapY', 'Space between rows'], ['gapX', 'Space between columns'], ['labelH', 'Label height'], ['labelW', 'Label width'],
];
const LETTER_KEYS: (keyof LetterLayout)[] = ['down', 'right', 'gapY', 'gapX', 'labelH', 'labelW'];

const SIZE_FIELDS: [keyof A4Sizes, string][] = [
  ['labelW', 'Label width'], ['labelH', 'Label height'], ['top', 'Top edge to first label'], ['left', 'Left edge to first label'],
  ['gapX', 'Gap between columns'], ['gapY', 'Gap between rows'],
];

const PANEL_HTML = `
<div class="ps-app">
  <aside class="ps-panel" aria-label="Print settings">
    <div class="ps-head">
      <div class="ps-title">Print labels</div>
      <div class="ps-sum" id="ps-sum"></div>
      <div class="ps-next" id="ps-next"></div>
    </div>
    <section class="ps-sec">
      <h2 id="ps-paper-h">Paper</h2>
      <div class="ps-cards" role="radiogroup" aria-labelledby="ps-paper-h">
        <label class="ps-card"><input type="radio" name="ps-paper" value="letter30" />
          <span class="ps-mini letter" aria-hidden="true">${'<i></i>'.repeat(30)}</span>
          <span><b>US Letter · 30 labels</b><small>3 across, 10 down · 2⅝ x 1 in</small></span></label>
        <label class="ps-card"><input type="radio" name="ps-paper" value="a4x18" />
          <span class="ps-mini a4" aria-hidden="true">${'<i></i>'.repeat(18)}</span>
          <span><b>A4 · 18 labels</b><small>6 across, 3 down · tall labels</small></span></label>
      </div>
    </section>
    <section class="ps-sec" id="ps-design-sec">
      <h2 id="ps-design-h">Design</h2>
      <div class="ps-cards two" role="radiogroup" aria-labelledby="ps-design-h">
        <label class="ps-card"><input type="radio" name="ps-design" value="sideways" />
          <span class="ps-tag side" aria-hidden="true"><span>$2.79</span></span>
          <span><b>Turned sideways</b><small>For a shelf edge</small></span></label>
        <label class="ps-card"><input type="radio" name="ps-design" value="upright" />
          <span class="ps-tag up" aria-hidden="true"><span class="n"></span><span class="p">$2.79</span><span class="q"></span></span>
          <span><b>Upright</b><small>For a door or a peg</small></span></label>
      </div>
    </section>
    <section class="ps-sec" id="ps-start-sec">
      <h2 id="ps-start-h">Start at label</h2>
      <p class="ps-help">Using a sheet with some labels already peeled off? Click the first free spot.</p>
      <div class="ps-start">
        <div class="ps-sheetpick" id="ps-pick" role="group" aria-labelledby="ps-start-h"></div>
        <div class="ps-start-side">
          <span class="ps-stepper">
            <button type="button" id="ps-start-dec" aria-label="Start one label earlier">−</button>
            <input type="number" id="ps-start" min="1" aria-label="Start at label number" />
            <button type="button" id="ps-start-inc" aria-label="Start one label later">+</button>
          </span>
          <span id="ps-start-note"></span>
        </div>
      </div>
    </section>
    <section class="ps-sec" id="ps-sizes-sec">
      <details class="ps-sizes" id="ps-sizes">
        <summary>Adjust to your sheet (mm)</summary>
        <p class="ps-help" style="margin: 8px 0 0">Measure one label, and from the top and left edges of the sheet to the first label.</p>
        <div class="ps-fields">
          ${SIZE_FIELDS.map(([k, name]) => `<label class="ps-field">${name}<span class="in"><input type="number" step="0.1" min="${SIZE_LIMITS[k][0]}" max="${SIZE_LIMITS[k][1]}" id="ps-${k}" /><em>mm</em></span></label>`).join('')}
        </div>
        <button type="button" class="ps-link" id="ps-reset">Back to the starting sizes</button>
      </details>
    </section>
    <section class="ps-sec" id="ps-nudge-sec">
      <details class="ps-sizes" id="ps-nudge">
        <summary>Fine-tune for your printer (mm)</summary>
        <p class="ps-help" style="margin: 8px 0 0">Most printers place the page a millimetre or two off. Print the test page on plain paper, hold it over a label sheet against a window or a light, and see how far the boxes are from the stickers.</p>
        <p class="ps-help" style="margin: 6px 0 0">Boxes too high: type how much in Move down. Too low: a minus number. The same for Move right (minus moves left). It is saved for this computer.</p>
        <div class="ps-fields">
          <label class="ps-field">Move down<span class="in"><input type="number" step="0.1" min="${LETTER_LIMITS.down[0]}" max="${LETTER_LIMITS.down[1]}" id="ps-nudge-down" /><em>mm</em></span></label>
          <label class="ps-field">Move right<span class="in"><input type="number" step="0.1" min="${LETTER_LIMITS.right[0]}" max="${LETTER_LIMITS.right[1]}" id="ps-nudge-right" /><em>mm</em></span></label>
        </div>
        <p class="ps-help" style="margin: 10px 0 0">Top row right but the bottom row off? Change the space between rows (smaller when the bottom row is too low; if it is already 0, make the label height a little smaller). Left column right but the right column off? The space between columns.</p>
        <div class="ps-fields">
          ${LETTER_SIZE_FIELDS.map(([k, name]) => `<label class="ps-field">${name}<span class="in"><input type="number" step="0.1" min="${LETTER_LIMITS[k][0]}" max="${LETTER_LIMITS[k][1]}" id="ps-nudge-${k}" /><em>mm</em></span></label>`).join('')}
        </div>
        <button type="button" class="ps-link" id="ps-nudge-reset">Back to the Avery 5160 numbers (no move)</button>
      </details>
    </section>
    <div class="ps-actions">
      <div class="ps-warn" id="ps-warn" role="alert"></div>
      <button type="button" class="ps-primary" id="ps-print">Print</button>
      <button type="button" class="ps-secondary" id="ps-image">Save as image</button>
      <p class="ps-status" id="ps-status" role="status"></p>
      <p class="ps-tip" id="ps-tip"></p>
    </div>
  </aside>
  <main class="ps-preview">
    <div class="ps-preview-bar">
      <div class="ps-seg" id="ps-view" role="radiogroup" aria-label="Show">
        <label><input type="radio" name="ps-view" value="labels" /> Labels</label>
        <label><input type="radio" name="ps-view" value="test" /> Test page (outlines)</label>
      </div>
      <span class="ps-note" id="ps-note">Preview at actual size</span>
    </div>
    <div id="sheets"></div>
  </main>
</div>
`;

// Opens the print page: settings on the left, the sheets on the right, then Print (or Save as image) when ready. It no longer opens
// the print dialog by itself, so the paper, the design and the first free label can be chosen first. Everything on the page is wired
// up from here (this page's own script), because the print window inherits this site's Content-Security-Policy and may not run
// scripts of its own.
function openPrintWindow(job: PrintJob): boolean {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to print labels.'); return false; }
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Labels</title>
  <style id="sheet-style"></style>
  <style>${PANEL_STYLE}</style>
</head>
<body>${PANEL_HTML}</body>
</html>`);
  win.document.close();

  const doc = win.document;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const radios = (name: string) => Array.from(doc.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  const count = job.groups.reduce((sum, g) => sum + labelCount(g.entries), 0);
  const single = job.groups.length === 1 && job.groups[0].storeName == null;
  let settings = loadSheet();
  let view: View = 'labels';
  let start = 1;       // the first free spot on the first sheet (single prints only)
  let busy = false;

  function render(keepFocused = false, keepStatus = false) {
    if (!keepStatus && !busy) { el('ps-status').textContent = ''; el('ps-status').className = 'ps-status'; }
    const tall = settings.format === 'a4x18';
    const per = perSheet(settings);
    start = Math.min(Math.max(1, start), per);
    const skip = single ? start - 1 : 0;
    el<HTMLStyleElement>('sheet-style').textContent = sheetCss(settings);
    el('sheets').innerHTML = printBody(job, settings, skip, view);

    radios('ps-paper').forEach(r => { r.checked = r.value === settings.format; });
    radios('ps-design').forEach(r => { r.checked = r.value === settings.design; });
    radios('ps-view').forEach(r => { r.checked = r.value === view; });
    el('ps-design-sec').hidden = !tall;
    el('ps-sizes-sec').hidden = !tall;
    el('ps-nudge-sec').hidden = tall;
    if (!tall && view === 'test') el<HTMLDetailsElement>('ps-nudge').open = true;
    LETTER_KEYS.forEach((k) => {
      const input = el<HTMLInputElement>(`ps-nudge-${k}`);
      if (!(keepFocused && doc.activeElement === input)) input.value = String(settings.letter[k]);
    });
    el('ps-start-sec').hidden = !single || view === 'test';
    SIZE_FIELDS.forEach(([k]) => {
      const input = el<HTMLInputElement>(`ps-${k}`);
      if (!(keepFocused && doc.activeElement === input)) input.value = String(settings.a4[k]);
    });

    // The first-free-spot picker: a small drawing of the sheet
    const pick = el('ps-pick');
    pick.className = `ps-sheetpick ${tall ? 'a4' : 'letter'}`;
    pick.innerHTML = Array.from({ length: per }, (_, i) => {
      const n = i + 1;
      const cls = n < start ? 'used' : n === start ? 'first' : '';
      return `<button type="button" class="${cls}" data-n="${n}" aria-label="Start at label ${n}" aria-pressed="${n === start}">${n}</button>`;
    }).join('');
    const startInput = el<HTMLInputElement>('ps-start');
    startInput.max = String(per);
    if (!(keepFocused && doc.activeElement === startInput)) startInput.value = String(start);
    el('ps-start-note').textContent = start > 1 ? `Labels 1 to ${start - 1} are left empty.` : 'Starts with the first label.';

    const problem = tall ? fitProblem(settings.a4) : letterFitProblem(settings.letter);
    el('ps-warn').textContent = problem ?? '';
    const sheets = view === 'test' ? 1 : single ? Math.max(1, Math.ceil((count + skip) / per))
      : job.groups.reduce((n, g) => n + Math.max(1, Math.ceil(labelCount(g.entries) / per)), 0);
    el('ps-sum').textContent = view === 'test' ? 'Test page: 1 sheet of outlines' : `${count} label${count === 1 ? '' : 's'} on ${sheets} sheet${sheets === 1 ? '' : 's'}`;
    const leftover = single && view === 'labels' ? sheets * per - (count + skip) : 0;
    el('ps-next').textContent = leftover > 0 ? `${leftover} free label${leftover === 1 ? '' : 's'} left on the last sheet. Next time, start at label ${per - leftover + 1}.` : '';
    el<HTMLButtonElement>('ps-print').disabled = !!problem || busy;
    el<HTMLButtonElement>('ps-image').disabled = !!problem || busy;
    el('ps-print').textContent = view === 'test' ? 'Print test page' : 'Print';
    el('ps-image').textContent = busy ? 'Making images…' : sheets > 1 ? `Save as images (${sheets} sheets, .zip)` : 'Save as image';
    el('ps-tip').textContent = tall
      ? 'In the print box choose paper A4, scale 100% (actual size, not "fit") and margins None. Images are 300 dpi: print them at actual size.'
      : 'In the print box choose paper Letter, scale 100% (actual size, not "fit") and margins None or Default. Images are 300 dpi: print them at actual size.';
    el('ps-note').textContent = view === 'test' ? 'Print on plain paper and hold it against a label sheet' : 'Preview at actual size';
  }

  function change(next: Partial<SheetSettings>, keepFocused = false) {
    settings = cleanSheet({ ...settings, ...next });
    saveSheet(settings);
    render(keepFocused);
  }

  radios('ps-paper').forEach(r => r.addEventListener('change', () => change({ format: r.value as SheetSettings['format'] })));
  radios('ps-design').forEach(r => r.addEventListener('change', () => change({ design: r.value as SheetSettings['design'] })));
  radios('ps-view').forEach(r => r.addEventListener('change', () => { view = r.value as View; render(); }));
  el('ps-pick').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b?.dataset.n) { start = Number(b.dataset.n); render(); }
  });
  el('ps-start-dec').addEventListener('click', () => { start -= 1; render(); });
  el('ps-start-inc').addEventListener('click', () => { start += 1; render(); });
  el<HTMLInputElement>('ps-start').addEventListener('input', (e) => {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    if (Number.isFinite(v)) { start = v; render(true); }
  });
  el('ps-start').addEventListener('change', () => render());
  SIZE_FIELDS.forEach(([k]) => {
    const input = el<HTMLInputElement>(`ps-${k}`);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) change({ a4: { ...settings.a4, [k]: v } }, true);
    });
    input.addEventListener('change', () => render());   // leaving the box shows the number as it was kept
  });
  el('ps-reset').addEventListener('click', () => change({ a4: { ...A4_DEFAULTS } }));
  LETTER_KEYS.forEach((k) => {
    const input = el<HTMLInputElement>(`ps-nudge-${k}`);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) change({ letter: { ...settings.letter, [k]: v } }, true);
    });
    input.addEventListener('change', () => render());
  });
  el('ps-nudge-reset').addEventListener('click', () => change({ letter: { ...LETTER_DEFAULTS } }));
  el('ps-print').addEventListener('click', () => { if (!el<HTMLButtonElement>('ps-print').disabled) { win.focus(); win.print(); } });

  el('ps-image').addEventListener('click', async () => {
    if (busy || el<HTMLButtonElement>('ps-image').disabled) return;
    const status = el('ps-status');
    busy = true;
    status.className = 'ps-status';
    render();
    try {
      const tall = settings.format === 'a4x18';
      const pages = imagePages(job, settings, single ? start - 1 : 0, view);
      const css = sheetCss(settings) + IMAGE_CSS;
      const [w, h] = tall ? [210 / 25.4, 297 / 25.4] : [8.5, 11];
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < pages.length; i++) {
        status.textContent = pages.length > 1 ? `Making sheet ${i + 1} of ${pages.length}…` : 'Making the image…';
        files.push({ name: `${pages[i].name}.png`, data: await renderPagePng(doc, pages[i].html, css, w, h) });
      }
      const day = new Date().toLocaleDateString('en-CA');
      const base = view === 'test' ? `lucky-stop-label-test-page-${day}` : `lucky-stop-labels-${day}`;
      if (files.length === 1) downloadBytes(doc, files[0].data, `${base}.png`, 'image/png');
      else downloadBytes(doc, zipFiles(files), `${base}.zip`, 'application/zip');
      status.textContent = files.length === 1 ? 'Saved the image (300 dpi).' : `Saved ${files.length} images in one .zip (300 dpi).`;
    } catch {
      status.className = 'ps-status bad';
      status.textContent = 'This browser could not make the image. Use Print and choose "Save as PDF" instead.';
    } finally {
      busy = false;
      render(false, true);
    }
  });

  render();
  el('ps-print').focus();
  return true;
}

export function printLabels(entries: PrintableLabelEntry[]): boolean {
  return openPrintWindow({ groups: [{ storeName: null, entries }] });
}

export interface PrintableLabelStoreGroup {
  storeName: string;
  entries: PrintableLabelEntry[];
}

// A bulk print across several stores: each store's sheets are preceded by a heading page with its name, so the stack can be split apart
// correctly afterward. A group with no labels is skipped (nothing to divide).
export function printLabelsGrouped(groups: PrintableLabelStoreGroup[]): boolean {
  return openPrintWindow({ groups: groups.filter((g) => g.entries.length > 0).map(g => ({ storeName: g.storeName, entries: g.entries })) });
}
