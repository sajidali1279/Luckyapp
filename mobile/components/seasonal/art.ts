// The drawings for the Thanksgiving, Christmas and Game day themes (2026-10-25), as plain numbers and SVG path text so the app
// (react-native-svg) and the preview sheet in docs/confidential/admin-audit/tools draw exactly the same thing. Nothing here runs: it is
// only data, and it imports nothing (the preview reads this file on its own). Halloween's drawings are in ../halloween/art.ts.

/** A small shape for behind the dashboards, in a 100 x 100 box. fill: the filled shape (holes by even-odd); line: stroked lines. */
export type Drawing = { fill: string | null; line: string | null; width?: number };

// ─── Thanksgiving: a turkey that fans its tail and gobbles ───────────────────────────────────────────────────────────────────────────

/** The turkey is drawn in a 400 x 420 box. */
export const TURKEY_BOX = { w: 400, h: 420 };

export const TURKEY = {
  /** The feathers turn about this point, behind the body. */
  pivot: { x: 200, y: 258 },
  /** One feather, drawn pointing straight up from the pivot (0, 0); the app turns it to its place in the fan. */
  featherLength: 170,
  feather: 'M0 0 C-32 -44 -32 -146 0 -170 C32 -146 32 -44 0 0 Z',
  featherTip: 'M0 -114 C-20 -126 -22 -156 0 -170 C22 -156 20 -126 0 -114 Z',
  quill: 'M0 -8 L0 -160',
  /** Where each feather ends up, in degrees from straight up, with its colour. */
  fan: [-80, -60, -40, -20, 0, 20, 40, 60, 80],
  feathers: ['#78350f', '#b91c1c', '#ea580c', '#f59e0b', '#c2410c', '#f59e0b', '#ea580c', '#b91c1c', '#78350f'],
  body: { cx: 200, cy: 282, rx: 96, ry: 96 },
  belly: { cx: 200, cy: 304, rx: 58, ry: 58 },
  wings: ['M120 262 C96 300 112 346 156 352 C140 320 140 290 120 262 Z', 'M280 262 C304 300 288 346 244 352 C260 320 260 290 280 262 Z'],
  legs: 'M180 366 L176 390 M176 390 L162 398 M176 390 L176 403 M176 390 L190 398 M220 366 L224 390 M224 390 L210 398 M224 390 L224 403 M224 390 L238 398',
  /** The head is its own piece so it can turn while the turkey gobbles (about its centre). */
  head: { cx: 200, cy: 168, r: 42 },
  eyes: [{ cx: 184, cy: 158 }, { cx: 216, cy: 158 }],
  beak: 'M186 174 L214 174 L200 196 Z',
  wattle: 'M207 182 C219 188 221 208 211 216 C203 220 198 208 200 196 Z',
};

export const COLORS_THANKSGIVING = {
  night: '#1a0e06',
  bodyLight: '#a8703a',
  bodyDark: '#6b3f17',
  belly: '#c08a4e',
  wing: '#4a280c',
  head: '#9c6232',
  beak: '#f59e0b',
  wattle: '#dc2626',
  legs: '#f59e0b',
  featherTip: '#fde68a',
  quill: '#451a03',
  flood: '#fff4e0',
  skip: '#f3d9b1',
  // the faint shapes behind the dashboards
  orange: '#c2410c',
  red: '#b91c1c',
  brown: '#92400e',
  gold: '#a16207',
};

// ─── Christmas: a gift box that shakes, pops its lid and lets the light out ────────────────────────────────────────────────────────────

/** The gift is drawn in a 400 x 420 box. */
export const GIFT_BOX = { w: 400, h: 420 };

export const GIFT = {
  box: { x: 96, y: 212, w: 208, h: 168, r: 10 },
  lid: { x: 82, y: 170, w: 236, h: 50, r: 10 },
  /** The ribbon down the lid and the box, and the one around the box. */
  ribbonV: { x: 186, w: 28 },
  ribbonH: { y: 284, h: 26 },
  bowLoops: ['M200 168 C178 130 132 124 138 152 C142 170 178 172 200 168 Z', 'M200 168 C222 130 268 124 262 152 C258 170 222 172 200 168 Z'],
  bowInner: ['M200 168 C188 148 164 142 162 154 C162 164 184 168 200 168 Z', 'M200 168 C212 148 236 142 238 154 C238 164 216 168 200 168 Z'],
  bowTails: ['M194 170 L170 208 L185 206 L200 175 Z', 'M206 170 L230 208 L215 206 L200 175 Z'],
  knot: { cx: 200, cy: 168, rx: 15, ry: 12 },
  /** Where the light comes out and the camera falls in. */
  opening: { x: 200, y: 212 },
};
/** A four-point sparkle, drawn about (0, 0). */
export const SPARKLE = 'M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z';

export const COLORS_CHRISTMAS = {
  night: '#0b1630',
  boxLight: '#d42a38',
  boxDark: '#8e0f1c',
  lidLight: '#e8404e',
  lidDark: '#a3141f',
  ribbon: '#f6c445',
  ribbonDark: '#d99e1b',
  knot: '#e9b026',
  glow: '#fff1b8',
  sparkle: '#fff4c2',
  snow: '#ffffff',
  flood: '#fff8e1',
  skip: '#c7d2fe',
  // the faint shapes behind the dashboards
  green: '#166534',
  red: '#b91c1c',
  gold: '#a16207',
  ice: '#1e40af',
};

// ─── Game day: a field goal through the posts, then confetti ───────────────────────────────────────────────────────────────────────

/** The field is drawn in a 400 x 520 box, seen from behind the kicker. */
export const FIELD_BOX = { w: 400, h: 520 };

export const FIELD = {
  horizon: 250,
  yardLines: [268, 292, 326, 378, 452],
  sidelines: 'M70 250 L-140 520 M330 250 L540 520',
  posts: 'M200 250 L200 196 M140 196 L260 196 M140 196 L140 70 M260 196 L260 70',
  /** Where the ball goes through (between the uprights, over the bar) and the camera flies in. */
  goal: { x: 200, y: 132 },
  ballStart: { x: 200, y: 452 },
  /** Low enough that their glow (radius 96) fades out before the top edge of the drawing, so it is never cut off in a line. */
  lights: [{ cx: 40, cy: 100 }, { cx: 360, cy: 100 }],
};

/** The ball, side on, in a 140 x 84 box. */
export const BALL_BOX = { w: 140, h: 84 };
export const BALL = {
  body: 'M4 42 C20 6 120 6 136 42 C120 78 20 78 4 42 Z',
  stripes: 'M30 19 C25 32 25 52 30 65 M110 19 C115 32 115 52 110 65',
  laces: 'M50 40 L90 40 M56 34 L56 46 M64 34 L64 46 M72 34 L72 46 M80 34 L80 46',
};
export const CONFETTI = ['#facc15', '#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#f97316'];

export const COLORS_GAME_DAY = {
  night: '#07111f',
  fieldTop: '#15803d',
  fieldBottom: '#14532d',
  line: '#ffffff',
  post: '#facc15',
  postGlow: '#fff7ae',
  ballLight: '#9a4f1c',
  ballDark: '#5c2e0e',
  laces: '#ffffff',
  light: '#dbeafe',
  flood: '#ffffff',
  skip: '#cbd5e1',
  // the faint shapes behind the dashboards
  green: '#166534',
  brown: '#7c2d12',
  navy: '#1e3a8a',
  gold: '#a16207',
};

// ─── the shapes that drift behind the dashboards ───────────────────────────────────────────────────────────────────────────────────

export const SHAPES: Record<string, Drawing> = {
  // Thanksgiving
  maple: { fill: 'M50 6 L57 24 L68 18 L64 40 L82 30 L78 44 L94 46 L80 58 L86 66 L62 64 L64 80 L52 70 L52 94 L48 94 L48 70 L36 80 L38 64 L14 66 L20 58 L6 46 L22 44 L18 30 L36 40 L32 18 L43 24 Z', line: null },
  oak: { fill: 'M50 8 C58 14 54 22 62 26 C72 30 64 40 72 44 C80 50 68 58 74 64 C78 72 64 74 58 78 L52 80 L52 94 L48 94 L48 80 L42 78 C36 74 22 72 26 64 C32 58 20 50 28 44 C36 40 28 30 38 26 C46 22 42 14 50 8 Z', line: null },
  acorn: { fill: 'M28 40 C28 27 38 20 50 20 C62 20 72 27 72 40 Z M33 43 L67 43 C67 64 59 80 50 88 C41 80 33 64 33 43 Z M47 21 L47 10 L53 10 L53 21 Z', line: null },
  wheat: {
    fill: 'M50 20 C46 14 47 8 50 4 C53 8 54 14 50 20 Z M49 34 C40 33 36 26 37 20 C44 21 49 26 49 34 Z M51 34 C60 33 64 26 63 20 C56 21 51 26 51 34 Z M49 46 C40 45 36 38 37 32 C44 33 49 38 49 46 Z M51 46 C60 45 64 38 63 32 C56 33 51 38 51 46 Z M49 58 C40 57 36 50 37 44 C44 45 49 50 49 58 Z M51 58 C60 57 64 50 63 44 C56 45 51 50 51 58 Z M49 70 C40 69 36 62 37 56 C44 57 49 62 49 70 Z M51 70 C60 69 64 62 63 56 C56 57 51 62 51 70 Z',
    line: 'M50 96 L50 18 M50 86 C40 80 34 82 28 88 M50 80 C60 74 66 76 72 82',
  },
  pie: { fill: 'M12 58 C14 42 32 34 50 34 C68 34 86 42 88 58 Z M10 62 L90 62 L84 82 L16 82 Z', line: 'M36 28 C32 22 40 18 36 12 M50 26 C46 20 54 16 50 10 M64 28 C60 22 68 18 64 12' },
  // Christmas
  snowflake: {
    fill: 'M50 44 L55.2 47 L55.2 53 L50 56 L44.8 53 L44.8 47 Z',
    line: 'M50 8 L50 92 M13.6 29 L86.4 71 M13.6 71 L86.4 29 M43.6 14.3 L50 22 L56.4 14.3 M43.6 85.7 L50 78 L56.4 85.7 M77.6 26.6 L74.2 36 L84 37.7 M22.4 73.4 L25.8 64 L16 62.3 M16 37.7 L25.8 36 L22.4 26.6 M77.6 73.4 L74.2 64 L84 62.3',
    width: 5,
  },
  star: { fill: 'M50 6 L61 38 L95 38 L67 58 L78 92 L50 72 L22 92 L33 58 L5 38 L39 38 Z', line: null },
  tree: { fill: 'M50 6 L72 36 L62 36 L80 60 L68 60 L86 84 L14 84 L32 60 L20 60 L38 36 L28 36 Z M44 84 L56 84 L56 96 L44 96 Z', line: null },
  ornament: { fill: 'M20 62 A30 30 0 1 0 80 62 A30 30 0 1 0 20 62 Z M41 24 L59 24 L59 33 L41 33 Z', line: 'M50 24 C45 17 55 13 50 6' },
  candyCane: { fill: null, line: 'M60 94 L60 36 C60 18 34 16 34 34', width: 12 },
  gift: { fill: 'M14 38 L86 38 L86 54 L14 54 Z M20 56 L80 56 L80 92 L20 92 Z M46 38 L54 38 L54 92 L46 92 Z M50 38 C40 20 22 24 30 34 C34 38 42 38 50 38 Z M50 38 C60 20 78 24 70 34 C66 38 58 38 50 38 Z', line: null },
  // Game day
  football: { fill: 'M6 50 C18 20 82 20 94 50 C82 80 18 80 6 50 Z M34 48 L66 48 L66 52 L34 52 Z M38 42 L41 42 L41 46 L38 46 Z M46 42 L49 42 L49 46 L46 46 Z M54 42 L57 42 L57 46 L54 46 Z M62 42 L65 42 L65 46 L62 46 Z M38 54 L41 54 L41 58 L38 58 Z M46 54 L49 54 L49 58 L46 58 Z M54 54 L57 54 L57 58 L54 58 Z M62 54 L65 54 L65 58 L62 58 Z', line: null },
  helmet: { fill: 'M16 64 C12 34 34 12 58 12 C80 12 94 30 94 52 L94 60 L72 60 L68 74 L42 78 C28 78 18 72 16 64 Z M42 44 A7 7 0 1 0 56 44 A7 7 0 1 0 42 44 Z', line: 'M72 60 L98 60 M78 60 L78 80 M90 60 L90 80 M72 70 L98 70 M74 80 L98 80' },
  goalPost: { fill: null, line: 'M50 96 L50 60 M18 60 L82 60 M18 60 L18 8 M82 60 L82 8', width: 6 },
  trophy: { fill: 'M28 12 L72 12 L72 30 C72 48 62 58 50 60 C38 58 28 48 28 30 Z M45 60 L55 60 L55 74 L45 74 Z M32 76 L68 76 L68 90 L32 90 Z', line: 'M28 20 C12 20 12 44 32 46 M72 20 C88 20 88 44 68 46' },
  megaphone: { fill: 'M12 40 L28 40 L74 18 L74 82 L28 60 L12 60 Z M30 62 L42 66 L38 82 L28 80 Z', line: 'M82 36 L94 28 M84 50 L98 50 M82 64 L94 72' },
};
