// Which label paper a print is laid out for. Mirrored in mobile/utils/labelSheet.ts (keep the two the same; only storage differs).
//
// letter30: US Letter, 30 labels (3 across, 10 down), each 2-5/8 x 1 in (Avery 5160 and the like). The layout every print used before.
// a4x18:    A4, 18 tall labels (6 across, 3 down). The label can carry the usual design turned 90 degrees ("sideways", for sticking
//           along a shelf edge) or a stacked design read with the label standing up ("upright", for a door or a peg). A4 sheets differ
//           by maker, so the sizes are adjustable in millimetres; the starting numbers are a guess until someone measures the sheet.
//
// letter.down / letter.right: the Letter sheet's layout is the sheet's real die-cut positions, but most printers place the whole page
//           a millimetre or two off (an HP DeskJet 2700 did, 2026-10-01). These move everything by that much (minus = up / left).

export type SheetFormat = 'letter30' | 'a4x18';
export type TallDesign = 'sideways' | 'upright';
export interface A4Sizes { labelW: number; labelH: number; top: number; left: number; gapX: number; gapY: number }
// down/right move the whole page; labelW/labelH are one label, gapX/gapY the space between columns and between rows (all mm)
// scale: the whole sheet drawn this % of its size (100 = as set). A phone's print app that shrinks the page (top row right, the rows
// creeping up the further down they are) is made up for by a little over 100, e.g. 103.
export interface LetterLayout { down: number; right: number; labelW: number; labelH: number; gapX: number; gapY: number; scale: number }
export interface SheetSettings { format: SheetFormat; design: TallDesign; a4: A4Sizes; letter: LetterLayout }

export const A4_PAGE = { w: 210, h: 297 };
export const A4_COLS = 6;
export const A4_ROWS = 3;
export const A4_PER_SHEET = A4_COLS * A4_ROWS;
export const A4_DEFAULTS: A4Sizes = { labelW: 31.3, labelH: 92.3, top: 8, left: 6, gapX: 2, gapY: 2 };
// The starting numbers for Letter sheets: what HQ found prints right on Avery 5160 sheets (HP DeskJet 2700, 2026-10-02), so every
// computer and every store's phones start there. The sheet's own die-cut numbers are 66.675 x 25.4 mm labels, 3.175 mm between
// columns and none between rows; a printer's small shift and scale are why these differ.
export const LETTER_DEFAULTS: LetterLayout = { down: 0, right: 1, labelW: 65, labelH: 25, gapX: 4.9, gapY: 0.6, scale: 100 };
export const DEFAULT_SHEET: SheetSettings = { format: 'letter30', design: 'sideways', a4: { ...A4_DEFAULTS }, letter: { ...LETTER_DEFAULTS } };

// Where an Avery 5160 sheet's first label sits: 1/2 in from the top, 3/16 in from the left. Move down / right shift from there.
export const LETTER_PAGE = { w: 215.9, h: 279.4 };
export const LETTER_COLS = 3;
export const LETTER_ROWS = 10;
export const LETTER_MARGIN_MM = { topBottom: 12.7, side: 4.7625 };
export const LETTER_LIMITS: Record<keyof LetterLayout, [number, number]> = {
  // Spacing up to 25 / 15 mm and moving right up to 10 mm: a narrower label keeps its place on its sticker by growing the space around it
  // (resizeKeepingCentres). The page-fit check stops anything running off the paper.
  down: [-10, 10], right: [-10, 10], labelW: [55, 75], labelH: [20, 30], gapX: [0, 25], gapY: [0, 15], scale: [90, 110],
};

/**
 * A new label width or height that keeps every label centred where it was on its sticker: the space between columns (rows) grows by
 * what the label lost, and the page moves by half of it. Without this a narrower label pulled the middle and right columns left.
 * base is the layout before this edit started (so typing 6, 60 in a box ends where it should). A wider label than the gap can absorb
 * leaves the space at 0.
 */
export function resizeKeepingCentres(base: LetterLayout, key: 'labelW' | 'labelH', value: number): LetterLayout {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const lost = (key === 'labelW' ? base.labelW : base.labelH) - value;
  if (key === 'labelW') {
    const gapX = Math.max(0, base.gapX + lost);
    const used = gapX - base.gapX;             // what the space could take (less than lost when it hit 0)
    return { ...base, labelW: value, gapX: r(gapX), right: r(base.right + used / 2) };
  }
  const gapY = Math.max(0, base.gapY + lost);
  const used = gapY - base.gapY;
  return { ...base, labelH: value, gapY: r(gapY), down: r(base.down + used / 2) };
}

export const SIZE_LIMITS: Record<keyof A4Sizes, [number, number]> = {
  labelW: [15, 60], labelH: [40, 140], top: [0, 40], left: [0, 40], gapX: [0, 15], gapY: [0, 20],
};

const round1 = (n: number) => Math.round(n * 10) / 10;

// Whatever was stored (or typed), made safe to lay out: unknown values fall back to the defaults, numbers are kept within limits
export function cleanSheet(raw: unknown): SheetSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SheetSettings>;
  const a = (r.a4 && typeof r.a4 === 'object' ? r.a4 : {}) as Partial<A4Sizes>;
  const a4 = { ...A4_DEFAULTS };
  (Object.keys(SIZE_LIMITS) as (keyof A4Sizes)[]).forEach((k) => {
    const v = Number(a[k]);
    if (Number.isFinite(v)) a4[k] = round1(Math.min(SIZE_LIMITS[k][1], Math.max(SIZE_LIMITS[k][0], v)));
  });
  const l = (r.letter && typeof r.letter === 'object' ? r.letter : {}) as Partial<LetterLayout>;
  const letter = { ...LETTER_DEFAULTS };
  (Object.keys(LETTER_LIMITS) as (keyof LetterLayout)[]).forEach((k) => {
    const v = Number(l[k]);
    // to 0.001 mm, so exact sheet numbers (66.675, 3.175) are kept as typed
    if (Number.isFinite(v)) letter[k] = Math.round(Math.min(LETTER_LIMITS[k][1], Math.max(LETTER_LIMITS[k][0], v)) * 1000) / 1000;
  });
  return {
    format: r.format === 'a4x18' ? 'a4x18' : 'letter30',
    design: r.design === 'upright' ? 'upright' : 'sideways',
    a4,
    letter,
  };
}

// Said in words when the labels as set would not fit on the page, so it is fixed before a sheet is wasted
export function fitProblem(a: A4Sizes): string | null {
  const width = a.left + A4_COLS * a.labelW + (A4_COLS - 1) * a.gapX;
  const height = a.top + A4_ROWS * a.labelH + (A4_ROWS - 1) * a.gapY;
  if (width > A4_PAGE.w + 0.05) return `The labels run ${round1(width - A4_PAGE.w)} mm past the right edge of the page. Make them narrower or the gaps smaller.`;
  if (height > A4_PAGE.h + 0.05) return `The labels run ${round1(height - A4_PAGE.h)} mm past the bottom of the page. Make them shorter or the gaps smaller.`;
  return null;
}

// Said in words when the Letter labels as set would run off the page
export function letterFitProblem(l: LetterLayout): string | null {
  const k = l.scale / 100;   // the size % grows or shrinks the drawn sheet around the middle of the page
  const cx = LETTER_PAGE.w / 2, cy = LETTER_PAGE.h / 2;
  const x0 = LETTER_MARGIN_MM.side + l.right, x1 = x0 + LETTER_COLS * l.labelW + (LETTER_COLS - 1) * l.gapX;
  const y0 = LETTER_MARGIN_MM.topBottom + l.down, y1 = y0 + LETTER_ROWS * l.labelH + (LETTER_ROWS - 1) * l.gapY;
  const left = cx + (x0 - cx) * k, right = cx + (x1 - cx) * k, top = cy + (y0 - cy) * k, bottom = cy + (y1 - cy) * k;
  if (right > LETTER_PAGE.w + 0.05) return `The labels run ${round1(right - LETTER_PAGE.w)} mm past the right edge of the page. Make them narrower, the space between columns smaller, the size % smaller, or move them left.`;
  if (bottom > LETTER_PAGE.h + 0.05) return `The labels run ${round1(bottom - LETTER_PAGE.h)} mm past the bottom of the page. Make them shorter, the space between rows smaller, the size % smaller, or move them up.`;
  if (left < -0.05) return `The labels run ${round1(-left)} mm past the left edge of the page. Move them right, or make the size % smaller.`;
  if (top < -0.05) return `The labels run ${round1(-top)} mm past the top of the page. Move them down, or make the size % smaller.`;
  return null;
}

// How big the design is drawn on a tall label, against the 31.3 mm starting width (fonts and boxes grow and shrink with it)
export function tallScale(a: A4Sizes): number {
  return Math.min(1.8, Math.max(0.6, a.labelW / A4_DEFAULTS.labelW));
}

const STORE_KEY = 'luckystop-label-sheet';

export function loadSheet(): SheetSettings {
  try { return cleanSheet(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch { return cleanSheet(null); }
}

export function saveSheet(s: SheetSettings) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private window or storage blocked: the choice just is not remembered */ }
}
