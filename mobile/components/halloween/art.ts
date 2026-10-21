// The drawings for the Halloween theme (2026-10-21), as plain numbers and SVG path text so the app (react-native-svg) and the preview
// sheet in docs/confidential/admin-audit/tools draw exactly the same thing. Nothing here runs: it is only data.

/** The jack-o'-lantern is drawn in a 400 x 420 box. */
export const PUMPKIN_BOX = { w: 400, h: 420 };

export const PUMPKIN = {
  lobes: [
    { cx: 128, cy: 242, rx: 82, ry: 114 },
    { cx: 272, cy: 242, rx: 82, ry: 114 },
    { cx: 200, cy: 236, rx: 100, ry: 124 },
  ],
  ribs: [
    'M200 114 C168 180 168 300 200 358',
    'M136 128 C98 190 98 292 136 352',
    'M264 128 C302 190 302 292 264 352',
  ],
  stem: 'M184 120 C176 92 192 70 214 60 C224 57 234 64 227 73 C213 82 215 102 219 120 Z',
  stemShade: 'M214 62 C222 60 232 64 227 73 C220 78 217 86 217 96 C223 84 232 78 230 70 C229 64 222 60 214 62 Z',
  // the carved shapes, which glow
  eyes: ['M104 176 L178 202 L126 228 Z', 'M296 176 L222 202 L274 228 Z'],
  nose: 'M200 234 L185 260 L215 260 Z',
};

/** The mouth is its own 220 x 110 piece so the app can open and close it (scaled from its top edge). */
export const MOUTH_BOX = { w: 220, h: 110, x: 90, y: 262 };
export const MOUTH = 'M0 16 L28 34 L48 14 L74 38 L96 18 L110 40 L124 18 L146 38 L172 14 L192 34 L220 16 L208 62 L184 80 L170 52 L148 86 L130 58 L110 92 L90 58 L72 86 L50 52 L36 80 L12 62 Z';

export const COLORS_HALLOWEEN = {
  night: '#0b0612',
  nightGlow: '#2a1140',
  skinLight: '#ffa63d',
  skinMid: '#f07a12',
  skinDark: '#a9440a',
  rib: '#8a3507',
  stem: '#5b3a1a',
  stemShade: '#3d2410',
  glow: '#ffd35c',
  glowEdge: '#ff9d1c',
  // the faint creatures behind the dashboards
  purple: '#5b21b6',
  orange: '#c2410c',
  bone: '#6b5b7a',
};

/** The small creatures that drift behind the dashboards, each drawn in a 100 x 100 box. fill = filled shape, line = stroked lines. */
export const CREATURES = {
  bat: {
    fill: 'M50 40 C44 30 36 26 20 30 C26 36 24 44 12 48 C26 50 32 56 34 68 C38 58 44 56 50 62 C56 56 62 58 66 68 C68 56 74 50 88 48 C76 44 74 36 80 30 C64 26 56 30 50 40 Z M44 38 L46 26 L50 35 L54 26 L56 38 Z',
    line: null as string | null,
  },
  ghost: {
    fill: 'M18 92 L18 46 C18 22 34 8 50 8 C66 8 82 22 82 46 L82 92 L71 81 L60 92 L50 81 L40 92 L29 81 Z M34 40 a6 9 0 1 0 12 0 a6 9 0 1 0 -12 0 M54 40 a6 9 0 1 0 12 0 a6 9 0 1 0 -12 0 M42 62 a8 11 0 1 0 16 0 a8 11 0 1 0 -16 0',
    line: null,
  },
  spider: {
    fill: 'M36 58 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0 M42 40 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0',
    line: 'M42 52 L22 40 L8 56 M40 58 L16 58 L6 74 M42 64 L22 76 L14 92 M44 48 L30 28 L14 30 M58 52 L78 40 L92 56 M60 58 L84 58 L94 74 M58 64 L78 76 L86 92 M56 48 L70 28 L86 30',
  },
  skull: {
    fill: 'M50 8 C26 8 14 26 16 46 C17 56 24 60 28 64 L28 80 L72 80 L72 64 C76 60 83 56 84 46 C86 26 74 8 50 8 Z M27 44 a9 10 0 1 0 18 0 a9 10 0 1 0 -18 0 M55 44 a9 10 0 1 0 18 0 a9 10 0 1 0 -18 0 M50 54 L44 66 L56 66 Z',
    line: null,
  },
  pumpkin: {
    fill: 'M50 26 C30 22 10 34 10 58 C10 80 28 92 50 92 C72 92 90 80 90 58 C90 34 70 22 50 26 Z M47 24 C46 14 52 8 60 6 L62 12 C56 14 55 20 55 25 Z',
    line: 'M50 28 C40 44 40 76 50 90 M30 32 C18 46 20 76 34 88 M70 32 C82 46 80 76 66 88',
  },
  moon: {
    fill: 'M58 10 A40 40 0 1 0 92 68 A32 32 0 1 1 58 10 Z',
    line: null,
  },
};
export type Creature = keyof typeof CREATURES;
