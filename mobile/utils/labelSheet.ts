// Which label paper a print is laid out for. Mirrors admin/src/utils/labelSheet.ts (keep the two the same; this one keeps the choice on
// the phone and reports a size that does not fit as numbers, so the screen can say it in the app's language).
//
// letter30: US Letter, 30 labels (3 across, 10 down), each 2-5/8 x 1 in (Avery 5160 and the like). The layout every print used before.
// a4x18:    A4, 18 tall labels (6 across, 3 down). The label can carry the usual design turned 90 degrees ("sideways", for sticking
//           along a shelf edge) or a stacked design read with the label standing up ("upright", for a door or a peg). A4 sheets differ
//           by maker, so the sizes are adjustable in millimetres; the starting numbers are a guess until someone measures the sheet.
//
// letter.down / letter.right: the Letter sheet's layout is the sheet's real die-cut positions, but most printers place the whole page
//           a millimetre or two off (an HP DeskJet 2700 did, 2026-10-01). These move everything by that much (minus = up / left).
//           In the app they come from the STORE (GET /stores/:id/label-printer), since the offset belongs to the store's printer
//           and staff print from their own phones; whatever this phone saved under `letter` is not used.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SheetFormat = 'letter30' | 'a4x18';
export type TallDesign = 'sideways' | 'upright';
export interface A4Sizes { labelW: number; labelH: number; top: number; left: number; gapX: number; gapY: number }
// down/right move the whole page; labelW/labelH are one label, gapX/gapY the space between columns and between rows (all mm)
export interface LetterLayout { down: number; right: number; labelW: number; labelH: number; gapX: number; gapY: number }
export interface SheetSettings { format: SheetFormat; design: TallDesign; a4: A4Sizes; letter: LetterLayout }

export const A4_PAGE = { w: 210, h: 297 };
export const A4_COLS = 6;
export const A4_ROWS = 3;
export const A4_PER_SHEET = A4_COLS * A4_ROWS;
export const LETTER_PER_SHEET = 30;
export const perSheet = (s: SheetSettings) => (s.format === 'a4x18' ? A4_PER_SHEET : LETTER_PER_SHEET);
export const A4_DEFAULTS: A4Sizes = { labelW: 31.3, labelH: 92.3, top: 8, left: 6, gapX: 2, gapY: 2 };
// Avery 5160: 2-5/8 x 1 in labels, 1/8 in between columns, none between rows
export const LETTER_DEFAULTS: LetterLayout = { down: 0, right: 0, labelW: 66.675, labelH: 25.4, gapX: 3.175, gapY: 0 };
export const DEFAULT_SHEET: SheetSettings = { format: 'letter30', design: 'sideways', a4: { ...A4_DEFAULTS }, letter: { ...LETTER_DEFAULTS } };

// Where an Avery 5160 sheet's first label sits: 1/2 in from the top, 3/16 in from the left. Move down / right shift from there.
export const LETTER_PAGE = { w: 215.9, h: 279.4 };
export const LETTER_COLS = 3;
export const LETTER_ROWS = 10;
export const LETTER_MARGIN_MM = { topBottom: 12.7, side: 4.7625 };
export const LETTER_LIMITS: Record<keyof LetterLayout, [number, number]> = {
  down: [-10, 10], right: [-4.5, 4.5], labelW: [55, 75], labelH: [20, 30], gapX: [0, 10], gapY: [0, 8],
};

export const SIZE_LIMITS: Record<keyof A4Sizes, [number, number]> = {
  labelW: [15, 60], labelH: [40, 140], top: [0, 40], left: [0, 40], gapX: [0, 15], gapY: [0, 20],
};

// Page size handed to the print system, in points (72 a inch)
export const PAGE_POINTS: Record<SheetFormat, { width: number; height: number }> = {
  letter30: { width: 612, height: 792 },
  a4x18: { width: 595, height: 842 },
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
    // to 0.001 mm, so the 5160 numbers (66.675, 3.175) are kept exactly
    if (Number.isFinite(v)) letter[k] = Math.round(Math.min(LETTER_LIMITS[k][1], Math.max(LETTER_LIMITS[k][0], v)) * 1000) / 1000;
  });
  return {
    format: r.format === 'a4x18' ? 'a4x18' : 'letter30',
    design: r.design === 'upright' ? 'upright' : 'sideways',
    a4,
    letter,
  };
}

// The labels as set would run past the right edge or the bottom of the page by this many millimetres (null when they fit)
export function fitIssue(a: A4Sizes): { edge: 'right' | 'bottom'; mm: number } | null {
  const width = a.left + A4_COLS * a.labelW + (A4_COLS - 1) * a.gapX;
  const height = a.top + A4_ROWS * a.labelH + (A4_ROWS - 1) * a.gapY;
  if (width > A4_PAGE.w + 0.05) return { edge: 'right', mm: round1(width - A4_PAGE.w) };
  if (height > A4_PAGE.h + 0.05) return { edge: 'bottom', mm: round1(height - A4_PAGE.h) };
  return null;
}

// The Letter labels as set would run past the right edge or the bottom of the page by this many millimetres (null when they fit)
export function letterFitIssue(l: LetterLayout): { edge: 'right' | 'bottom'; mm: number } | null {
  const width = LETTER_MARGIN_MM.side + l.right + LETTER_COLS * l.labelW + (LETTER_COLS - 1) * l.gapX;
  const height = LETTER_MARGIN_MM.topBottom + l.down + LETTER_ROWS * l.labelH + (LETTER_ROWS - 1) * l.gapY;
  if (width > LETTER_PAGE.w + 0.05) return { edge: 'right', mm: round1(width - LETTER_PAGE.w) };
  if (height > LETTER_PAGE.h + 0.05) return { edge: 'bottom', mm: round1(height - LETTER_PAGE.h) };
  return null;
}

// How big the design is drawn on a tall label, against the 31.3 mm starting width (fonts and boxes grow and shrink with it)
export function tallScale(a: A4Sizes): number {
  return Math.min(1.8, Math.max(0.6, a.labelW / A4_DEFAULTS.labelW));
}

const STORE_KEY = 'luckystop-label-sheet';

export async function loadSheet(): Promise<SheetSettings> {
  try { return cleanSheet(JSON.parse((await AsyncStorage.getItem(STORE_KEY)) || 'null')); } catch { return cleanSheet(null); }
}

export async function saveSheet(s: SheetSettings): Promise<void> {
  try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* not remembered this time; the print still uses it */ }
}
