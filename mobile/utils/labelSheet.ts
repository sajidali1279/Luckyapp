// Which label paper a print is laid out for. Mirrors admin/src/utils/labelSheet.ts (keep the two the same; this one keeps the choice on
// the phone and reports a size that does not fit as numbers, so the screen can say it in the app's language).
//
// letter30: US Letter, 30 labels (3 across, 10 down), each 2-5/8 x 1 in (Avery 5160 and the like). The layout every print used before.
// a4x18:    A4, 18 tall labels (6 across, 3 down). The label can carry the usual design turned 90 degrees ("sideways", for sticking
//           along a shelf edge) or a stacked design read with the label standing up ("upright", for a door or a peg). A4 sheets differ
//           by maker, so the sizes are adjustable in millimetres; the starting numbers are a guess until someone measures the sheet.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SheetFormat = 'letter30' | 'a4x18';
export type TallDesign = 'sideways' | 'upright';
export interface A4Sizes { labelW: number; labelH: number; top: number; left: number; gapX: number; gapY: number }
export interface SheetSettings { format: SheetFormat; design: TallDesign; a4: A4Sizes }

export const A4_PAGE = { w: 210, h: 297 };
export const A4_COLS = 6;
export const A4_ROWS = 3;
export const A4_PER_SHEET = A4_COLS * A4_ROWS;
export const LETTER_PER_SHEET = 30;
export const perSheet = (s: SheetSettings) => (s.format === 'a4x18' ? A4_PER_SHEET : LETTER_PER_SHEET);
export const A4_DEFAULTS: A4Sizes = { labelW: 31.3, labelH: 92.3, top: 8, left: 6, gapX: 2, gapY: 2 };
export const DEFAULT_SHEET: SheetSettings = { format: 'letter30', design: 'sideways', a4: { ...A4_DEFAULTS } };

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
  return {
    format: r.format === 'a4x18' ? 'a4x18' : 'letter30',
    design: r.design === 'upright' ? 'upright' : 'sideways',
    a4,
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
