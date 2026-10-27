// The receipt cut out of its photo before the AI reads it (2026-10-16). A receipt is a narrow strip of paper in the middle of a photo of
// the counter: the empty counter either side was most of what the AI was sent (and paid for). Paper is smooth and grey, in the light or in
// a shadow (blank paper between the printed lines), while a counter, a floor or a car seat is speckled or coloured: the photo is cut into
// small blocks and the columns (then rows) that have smooth grey blocks are kept, with a margin. Brightness is NOT used: a shadow across
// the receipt made half of it look like counter and it was cut off (the owner's photos). Nothing is cut when it is not clear (paper
// everywhere, a strip too thin). Only the copy for the AI is cut: the photo kept with the sale is the original. Any failure sends the
// photo as it came.
import sharp from 'sharp';

const ANALYSE_WIDTH = 320;        // the photo is studied at this width (fast); the cut is made on the full photo
const BLOCK = 8;                  // pixels per block side at that width
const SMOOTH_SD = 6;              // a block this even (brightness spread) is blank paper; the counter's speckle is far above
const GREY_SAT = 22;              // ...and this grey (paper in any light; a beige counter or a coloured seat is not)
const MIN_SHARE = 0.04;           // a column (row) with this share of smooth grey blocks has paper in it
const BRIDGE = 2;                 // a gap of up to this many blocks inside the paper (a dark stripe of shadow) does not split it
const MARGIN = 0.04;              // kept either side of the paper, as a share of the photo
const MAX_SIDE = 1568;            // the reader works at up to this long side; more is only scaled down there (and paid for here)
const MAX_PIXELS = 1_150_000;     // the reader's own limit, for a photo that was not cut
// A cut photo is mostly paper, so it needs fewer pixels for the same sharpness: at this size the receipt still has more pixels across than
// the whole photo gave it (the reader shrinks a whole 1200x1600 photo to about 930 wide, the receipt being about half of that)
const MAX_PIXELS_CUT = 700_000;

export interface CropResult { buffer: Buffer; mediaType: string; cropped: boolean; from: { w: number; h: number }; to: { w: number; h: number } }

/** The run of true values that matters: short gaps bridged, the longest run joined with any other at least half as long (two receipts). */
function paperRun(flags: boolean[]): [number, number] | null {
  const f = [...flags];
  for (let i = 0; i < f.length; i++) {
    if (f[i]) continue;
    let j = i; while (j < f.length && !f[j]) j++;
    if (i > 0 && j < f.length && j - i <= BRIDGE) for (let k = i; k < j; k++) f[k] = true;
    i = j;
  }
  const runs: [number, number][] = [];
  let start = -1;
  f.forEach((v, i) => {
    if (v && start < 0) start = i;
    if ((!v || i === f.length - 1) && start >= 0) { runs.push([start, v ? i : i - 1]); start = -1; }
  });
  if (!runs.length) return null;
  const len = (r: [number, number]) => r[1] - r[0] + 1;
  const longest = Math.max(...runs.map(len));
  const big = runs.filter((r) => len(r) >= longest / 2);
  return [Math.min(...big.map((r) => r[0])), Math.max(...big.map((r) => r[1]))];
}

/** Where the paper is, as fractions of the photo (left, top, right, bottom), or null when it is not clear. */
export function findPaper(rgb: Buffer, w: number, h: number): { l: number; t: number; r: number; b: number } | null {
  const bw = Math.floor(w / BLOCK), bh = Math.floor(h / BLOCK);
  if (bw < 8 || bh < 8) return null;
  const smooth = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0, s2 = 0, sat = 0;
    for (let y = by * BLOCK; y < by * BLOCK + BLOCK; y++) for (let x = bx * BLOCK; x < bx * BLOCK + BLOCK; x++) {
      const i = (y * w + x) * 3; const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      const v = (r + g + b) / 3; s += v; s2 += v * v; sat += Math.max(r, g, b) - Math.min(r, g, b);
    }
    const n = BLOCK * BLOCK, m = s / n;
    smooth[by * bw + bx] = Math.sqrt(Math.max(0, s2 / n - m * m)) < SMOOTH_SD && sat / n < GREY_SAT ? 1 : 0;
  }
  const colShare = Array.from({ length: bw }, (_, x) => { let c = 0; for (let y = 0; y < bh; y++) c += smooth[y * bw + x]; return c / bh; });
  const across = paperRun(colShare.map((v) => v >= MIN_SHARE));
  if (!across) return null;
  const [x0, x1] = across;
  const rowShare = Array.from({ length: bh }, (_, y) => { let c = 0; for (let x = x0; x <= x1; x++) c += smooth[y * bw + x]; return c / (x1 - x0 + 1); });
  const down = paperRun(rowShare.map((v) => v >= MIN_SHARE)) ?? [0, bh - 1];
  const box = { l: x0 / bw, r: (x1 + 1) / bw, t: down[0] / bh, b: (down[1] + 1) / bh };
  // Not clear enough to cut: a strip too thin to be a receipt, or smooth paper nearly everywhere (already tight, or a plain white table)
  if (box.r - box.l < 0.12 || box.b - box.t < 0.2) return null;
  if (box.r - box.l > 0.9 && box.b - box.t > 0.9) return null;
  return { l: Math.max(0, box.l - MARGIN), r: Math.min(1, box.r + MARGIN), t: Math.max(0, box.t - MARGIN), b: Math.min(1, box.b + MARGIN) };
}

/** The receipt photo ready for the reader: cut to the paper when that is clear, turned upright, and no bigger than the reader uses. */
/** maxPixelsCut: invoices (utils/pdiRead.ts) keep more of the cut paper than a till receipt, for their denser print. */
export async function cropForReading(input: Buffer, mediaType: string, maxPixelsCut = MAX_PIXELS_CUT): Promise<CropResult> {
  try {
    const upright = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
    const W = upright.info.width, H = upright.info.height;
    const small = await sharp(upright.data).resize({ width: Math.min(ANALYSE_WIDTH, W) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const box = findPaper(small.data, small.info.width, small.info.height);
    let img = sharp(upright.data);
    let w = W, h = H;
    if (box) {
      const left = Math.floor(box.l * W), top = Math.floor(box.t * H);
      w = Math.max(1, Math.min(W - left, Math.ceil((box.r - box.l) * W)));
      h = Math.max(1, Math.min(H - top, Math.ceil((box.b - box.t) * H)));
      img = img.extract({ left, top, width: w, height: h });
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt((box ? maxPixelsCut : MAX_PIXELS) / (w * h)));
    const outW = Math.max(1, Math.round(w * scale)), outH = Math.max(1, Math.round(h * scale));
    const buffer = await img.resize({ width: outW, height: outH }).jpeg({ quality: 82 }).toBuffer();
    return { buffer, mediaType: 'image/jpeg', cropped: !!box, from: { w: W, h: H }, to: { w: outW, h: outH } };
  } catch (e: any) {
    console.error('[receipt-crop] sent as it came:', e?.message ?? e);
    return { buffer: input, mediaType, cropped: false, from: { w: 0, h: 0 }, to: { w: 0, h: 0 } };
  }
}

/** About how many tokens the reader counts for an image of this size (its own scaling first). */
export function imageTokens(w: number, h: number): number {
  const s = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  return Math.round((w * s) * (h * s) / 750);
}
