// Cuatro drawn as plain shapes (2026-10-27), from the launch kit's mascot.py (docs/confidential/launch-kit/src/mascot.py) so the moving
// Cuatro matches the posters and stickers. He is split into the parts that move on their own: each arm (turned at the shoulder), each leg
// (turned at the hip), the sprout, the eyes (they blink and look around), the brows and the mouth (it moves while he talks). No React
// here, so a script can draw the very same parts to a picture. Units are the poster's: the clover's centre is 0,0 and VIEWBOX is the box.

export const INK = '#0F2038';
export const RED = '#CC2936';
export const GREEN_L = '#7CEBA0';
export const GREEN = '#2DC653';
export const GREEN_D = '#1A9A41';
export const GLOVE = '#FFF7E8';
export const PINK = '#FF7B8E';
export const TEAR = '#6EC3FF';
export const GOLD = '#FFC533';

export const VIEWBOX = { x: -290, y: -262, w: 580, h: 570 };
/** Height over width of the box. */
export const ASPECT = VIEWBOX.h / VIEWBOX.w;
/** Where the soles touch the ground, as a share of the box's height from the top. */
export const FEET = (280 - VIEWBOX.y) / VIEWBOX.h;

export type Shape =
  | { k: 'path'; d: string; fill?: string; stroke?: string; sw?: number; op?: number; tf?: string }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; sw?: number; op?: number; tf?: string }
  | { k: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number; op?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill?: string; stroke?: string; sw?: number; op?: number; tf?: string }
  | { k: 'polygon'; points: string; fill?: string; stroke?: string; sw?: number; op?: number }
  | { k: 'g'; tf?: string; op?: number; clip?: string; kids: Shape[] };
export type Stop = [offset: number, color: string, opacity?: number];
export type Def =
  | { k: 'linear'; id: string; x1: number; y1: number; x2: number; y2: number; stops: Stop[] }   // in the drawing's own units
  | { k: 'radial'; id: string; stops: Stop[] }                                                  // over each shape's own box
  | { k: 'clip'; id: string; kids: Shape[] };
export interface Layer { defs?: Def[]; shapes: Shape[] }

/** The joints, in drawing units: each moving part turns about its own. */
export const PIVOT = {
  armL: [-160, 44], armR: [160, 44], legL: [-54, 150], legR: [54, 150],
  sprout: [0, -140], eyes: [0, -4], mouth: [0, 30], centre: [0, 10], feet: [0, 280],
} as const;

/** A joint as the share of the box ('22.4% 53.7%'), for a transform origin. */
export function origin(p: readonly [number, number] | readonly number[]): string {
  return `${(((p[0] - VIEWBOX.x) / VIEWBOX.w) * 100).toFixed(2)}% ${(((p[1] - VIEWBOX.y) / VIEWBOX.h) * 100).toFixed(2)}%`;
}

// ------------------------------------------------------------------ body
const HEART = 'M0 0 C-34 -22 -98 -66 -98 -124 C-98 -166 -62 -190 -30 -182 C-14 -178 -4 -166 0 -152 C4 -166 14 -178 30 -182 C62 -190 98 -166 98 -124 C98 -66 34 -22 0 0 Z';
const LEAVES = [0, 90, 180, 270];
const BODY_GRADIENT: Def = { k: 'linear', id: 'cg', x1: -170, y1: -190, x2: 170, y2: 190, stops: [[0, GREEN_L], [0.45, GREEN], [1, GREEN_D]] };

function hexPoints(r: number): string {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = ((60 * i + 30) * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

/** The Lucky Stop sign pinned on the upper-left leaf: red hexagon, white keyline, white car. */
const BADGE: Shape = {
  k: 'g', tf: 'translate(-118 -74) rotate(-12) scale(0.47)', kids: [
    { k: 'polygon', points: hexPoints(60), fill: '#fff' },
    { k: 'polygon', points: hexPoints(54), fill: RED },
    { k: 'polygon', points: hexPoints(48.6), fill: 'none', stroke: '#fff', sw: 3 },
    { k: 'g', tf: 'rotate(-16) translate(0 2)', kids: [
      { k: 'path', d: 'M-24 8 L-20 -8 Q-19 -14 -12 -14 L12 -14 Q19 -14 20 -8 L24 8 Q25 16 18 16 L-18 16 Q-25 16 -24 8Z', fill: '#fff' },
      { k: 'path', d: 'M-15 -8 L-12.5 -10 L12.5 -10 L15 -8 L16 0 L-16 0Z', fill: RED },
      { k: 'circle', cx: -14, cy: 9, r: 4, fill: RED },
      { k: 'circle', cx: 14, cy: 9, r: 4, fill: RED },
      { k: 'rect', x: -20, y: 16, w: 9, h: 7, rx: 2, fill: '#fff' },
      { k: 'rect', x: 11, y: 16, w: 9, h: 7, rx: 2, fill: '#fff' },
    ] },
  ],
};

/** The four leaves with their outline, the shine and the badge. */
export const BODY: Layer = {
  defs: [BODY_GRADIENT],
  shapes: [
    ...LEAVES.map((a): Shape => ({ k: 'path', d: HEART, fill: INK, stroke: INK, sw: 28, tf: `rotate(${a})` })),
    ...LEAVES.map((a): Shape => ({ k: 'path', d: HEART, fill: 'url(#cg)', tf: `rotate(${a})` })),
    { k: 'g', op: 0.9, kids: LEAVES.map((a): Shape => ({ k: 'g', tf: `rotate(${a})`, kids: [
      { k: 'ellipse', cx: -56, cy: -150, rx: 26, ry: 13, fill: '#fff', op: 0.42, tf: 'rotate(-38 -56 -150)' },
      { k: 'ellipse', cx: -36, cy: -168, rx: 6, ry: 4, fill: '#fff', op: 0.65 },
      { k: 'ellipse', cx: 46, cy: -128, rx: 7, ry: 16, fill: '#fff', op: 0.16, tf: 'rotate(28 46 -128)' },
    ] })) },
    BADGE,
  ],
};

export const SPROUT: Layer = {
  shapes: [
    { k: 'path', d: 'M0 -140 C0 -178 6 -206 34 -216', stroke: INK, sw: 22 },
    { k: 'path', d: 'M0 -140 C0 -178 6 -206 34 -216', stroke: GREEN_D, sw: 10 },
    { k: 'g', tf: 'translate(30 -214) rotate(-18)', kids: [
      { k: 'path', d: 'M0 0 C6 -30 46 -34 62 -14 C52 16 14 22 0 0Z', fill: GREEN, stroke: INK, sw: 9 },
      { k: 'path', d: 'M8 -2 C24 -8 40 -10 52 -14', stroke: GREEN_L, sw: 5 },
    ] },
  ],
};

// ------------------------------------------------------------------ arms and legs
export type Glove = 'open' | 'fist' | 'thumb' | 'point';
/** The hand of the drawn arm, which points straight out to the left of the shoulder. */
const HAND = [-270, 44];
/** How each hand sits on the drawn arm, so it reads right at the angle it is used at: an open hand waves with the arm raised about
 *  60 degrees, a thumb goes up at about 35, a pointing finger follows the arm. */
const GLOVE_TURN: Record<Glove, number> = { open: -60, thumb: -35, point: 0, fist: 0 };

function glove(kind: Glove): Shape[] {
  const g = { fill: GLOVE, stroke: INK, sw: 7 };
  if (kind === 'open') {
    return [
      { k: 'ellipse', cx: -24, cy: -2, rx: 10, ry: 19, tf: 'rotate(-30 -24 -2)', ...g },
      { k: 'ellipse', cx: -9, cy: -24, rx: 10, ry: 21, tf: 'rotate(-10 -9 -24)', ...g },
      { k: 'ellipse', cx: 10, cy: -26, rx: 10, ry: 21, tf: 'rotate(8 10 -26)', ...g },
      { k: 'ellipse', cx: 27, cy: -10, rx: 10, ry: 19, tf: 'rotate(30 27 -10)', ...g },
      { k: 'circle', cx: 2, cy: 6, r: 27, ...g },
    ];
  }
  if (kind === 'thumb') {
    return [
      { k: 'ellipse', cx: 4, cy: -28, rx: 11, ry: 21, ...g },
      { k: 'rect', x: -26, y: -12, w: 52, h: 42, rx: 20, ...g },
      { k: 'path', d: 'M-12 4 H12 M-12 14 H12', stroke: INK, sw: 4, op: 0.55 },
    ];
  }
  if (kind === 'point') {
    return [
      { k: 'rect', x: -46, y: -9, w: 46, h: 18, rx: 9, ...g },
      { k: 'circle', cx: 6, cy: 4, r: 25, ...g },
    ];
  }
  return [
    { k: 'circle', cx: 0, cy: 0, r: 25, ...g },
    { k: 'path', d: 'M-11 -7 Q0 -13 11 -7', stroke: INK, sw: 4, op: 0.55 },
  ];
}

function armShapes(kind: Glove): Shape[] {
  const d = `M-160 44 C-196 56 -232 56 ${HAND[0]} ${HAND[1]}`;
  return [
    { k: 'path', d, stroke: INK, sw: 50 },
    { k: 'path', d, stroke: GREEN, sw: 32 },
    { k: 'path', d, stroke: GREEN_L, sw: 8, tf: 'translate(-5 -5)', op: 0.55 },
    { k: 'g', tf: `translate(${HAND[0]} ${HAND[1]}) rotate(${GLOVE_TURN[kind]})`, kids: glove(kind) },
  ];
}

/** An arm pointing straight out from the shoulder; the app turns it about PIVOT.armL or armR. The right arm is the left one mirrored. */
export function arm(side: 'L' | 'R', kind: Glove): Layer {
  const shapes = armShapes(kind);
  return { shapes: side === 'L' ? shapes : [{ k: 'g', tf: 'scale(-1 1)', kids: shapes }] };
}

function shoe(side: -1 | 1): Shape {
  return { k: 'g', tf: `translate(${side * 54} 246) scale(${side} 1)`, kids: [
    { k: 'path', d: 'M-26 -12 C-30 -28 -4 -30 12 -22 L34 -6 C46 0 46 26 32 30 L-24 30 C-34 30 -34 4 -26 -12Z', fill: RED, stroke: INK, sw: 8 },
    { k: 'path', d: 'M-30 20 H40', stroke: INK, sw: 8 },
    { k: 'path', d: 'M-27 24 H37', stroke: '#fff', sw: 7 },
    { k: 'path', d: 'M-4 -12 L0 -2 M6 -8 L10 2', stroke: '#fff', sw: 5 },
    { k: 'path', d: 'M14 4 C24 4 30 10 32 18', stroke: '#fff', sw: 5, op: 0.85 },
  ] };
}

/** A leg with its red sneaker, hanging straight down from the hip. */
export function leg(side: 'L' | 'R'): Layer {
  const s = side === 'L' ? -1 : 1;
  return { shapes: [
    { k: 'path', d: `M${s * 54} 150 V236`, stroke: INK, sw: 44 },
    { k: 'path', d: `M${s * 54} 150 V236`, stroke: GREEN_D, sw: 28 },
    shoe(s),
  ] };
}

// ------------------------------------------------------------------ face
// The face sits 4 lower than the poster's face coordinates (mascot.py draws it inside translate(0 4)).
const EY = -8, LX = -44, RX = 44;
const face = (kids: Shape[]): Shape => ({ k: 'g', tf: 'translate(0 4)', kids });

export type Face = 'happy' | 'wow' | 'joy' | 'wink' | 'love' | 'cool' | 'sad' | 'cry' | 'mad' | 'dizzy' | 'sleepy';

export const CHEEKS: Layer = {
  defs: [{ k: 'radial', id: 'blush', stops: [[0, '#FF6F8A', 0.95], [0.65, '#FF6F8A', 0.55], [1, '#FF6F8A', 0]] }],
  shapes: [face([
    { k: 'ellipse', cx: -82, cy: 36, rx: 26, ry: 16, fill: 'url(#blush)' },
    { k: 'ellipse', cx: 82, cy: 36, rx: 26, ry: 16, fill: 'url(#blush)' },
  ])],
};
/** Red in the face when he is cross. */
export const CHEEKS_MAD: Layer = {
  defs: [{ k: 'radial', id: 'fume', stops: [[0, '#FF3045', 0.95], [0.6, '#FF3045', 0.6], [1, '#FF3045', 0]] }],
  shapes: [face([
    { k: 'ellipse', cx: -84, cy: 30, rx: 34, ry: 22, fill: 'url(#fume)' },
    { k: 'ellipse', cx: 84, cy: 30, rx: 34, ry: 22, fill: 'url(#fume)' },
  ])],
};

const openOn = (f: Face) => (f === 'wink' ? [RX] : ['happy', 'wow', 'sad', 'mad', 'sleepy'].includes(f) ? [LX, RX] : []);

/** The whites of the open eyes. */
export function eyeWhites(f: Face): Layer {
  return { shapes: [face(openOn(f).map((x): Shape => ({ k: 'ellipse', cx: x, cy: EY, rx: 27, ry: 34, fill: '#fff', stroke: INK, sw: 7 })))] };
}

/** The pupils with their shine. The app slides this layer a little to make him look around. */
export function pupils(f: Face): Layer {
  const [gx, gy] = f === 'wow' ? [0, 0] : f === 'sad' ? [0, 8] : [3, 4];
  return { shapes: [face(openOn(f).flatMap((x): Shape[] => [
    { k: 'ellipse', cx: x + gx, cy: EY + gy, rx: 16, ry: 22, fill: INK },
    { k: 'circle', cx: x + gx - 5, cy: EY + gy - 9, r: 6.5, fill: '#fff' },
    { k: 'circle', cx: x + gx + 6, cy: EY + gy + 8, r: 3.2, fill: '#fff' },
  ]))] };
}

/** Eyelids over the open eyes: a sad droop at the outer corners, a cross frown at the inner ones, or sleepy half-closed. They are the
 *  body's own green, cut to each eye. */
export function lids(f: Face): Layer {
  const cut: Record<string, [number, number]> = { sad: [-4, -30], mad: [-32, -4], sleepy: [-6, -6] };   // the lid's edge at the outer, inner side
  const c = cut[f];
  if (!c) return { shapes: [] };
  const [outer, inner] = c;
  const one = (x: number, side: -1 | 1): Shape => {
    // side -1: the left eye, whose outer side is to the left
    const yl = side === -1 ? outer : inner, yr = side === -1 ? inner : outer;
    return { k: 'g', clip: side === -1 ? 'lidL' : 'lidR', kids: [
      { k: 'path', d: `M${x - 34} ${EY - 44} L${x + 34} ${EY - 44} L${x + 34} ${EY + yr} L${x - 34} ${EY + yl}Z`, fill: 'url(#lidg)' },
      { k: 'path', d: `M${x - 34} ${EY + yl} L${x + 34} ${EY + yr}`, stroke: INK, sw: 8 },
    ] };
  };
  return {
    defs: [
      // the body's gradient, moved up by the face's 4 so the lids match the leaves behind them
      { k: 'linear', id: 'lidg', x1: -170, y1: -194, x2: 170, y2: 186, stops: [[0, GREEN_L], [0.45, GREEN], [1, GREEN_D]] },
      { k: 'clip', id: 'lidL', kids: [{ k: 'ellipse', cx: LX, cy: EY, rx: 27, ry: 34 }] },
      { k: 'clip', id: 'lidR', kids: [{ k: 'ellipse', cx: RX, cy: EY, rx: 27, ry: 34 }] },
    ],
    shapes: [face([one(LX, -1), one(RX, 1)])],
  };
}

function spiral(cx: number, cy: number, turns = 2.25, r = 22): string {
  const pts: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * turns * Math.PI * 2;
    const rr = (i / steps) * r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

/** The eyes that are not plain open ones: happy arcs, a wink, hearts, sunglasses, dizzy spirals, squeezed shut, asleep. */
export function otherEyes(f: Face): Layer {
  const arc = (x: number, sw = 11): Shape => ({ k: 'path', d: `M${x - 24} ${EY + 8} Q${x} ${EY - 28} ${x + 24} ${EY + 8}`, stroke: INK, sw });
  const heart = (x: number): Shape => ({ k: 'g', tf: `translate(${x} ${EY}) scale(1.35)`, kids: [
    { k: 'path', d: 'M0 14 C-22 -2 -24 -22 -10 -24 C-3 -25 0 -19 0 -16 C0 -19 3 -25 10 -24 C24 -22 22 -2 0 14Z', fill: RED, stroke: INK, sw: 5 },
    { k: 'circle', cx: -8, cy: -14, r: 3.5, fill: '#fff', op: 0.9 },
  ] });
  let shapes: Shape[] = [];
  if (f === 'joy') shapes = [arc(LX), arc(RX)];
  else if (f === 'wink') shapes = [{ k: 'path', d: `M${LX - 24} ${EY + 6} Q${LX} ${EY - 26} ${LX + 24} ${EY + 6}`, stroke: INK, sw: 10 }];
  else if (f === 'love') shapes = [heart(LX), heart(RX)];
  else if (f === 'cool') {
    shapes = [
      { k: 'rect', x: -80, y: -34, w: 72, h: 50, rx: 16, fill: INK },
      { k: 'rect', x: 8, y: -34, w: 72, h: 50, rx: 16, fill: INK },
      { k: 'rect', x: -10, y: -22, w: 20, h: 9, fill: INK },
      { k: 'path', d: 'M-70 -24 L-46 -24', stroke: '#fff', sw: 6, op: 0.55 },
      { k: 'path', d: 'M18 -24 L42 -24', stroke: '#fff', sw: 6, op: 0.55 },
    ];
  } else if (f === 'dizzy') {
    shapes = [
      { k: 'ellipse', cx: LX, cy: EY, rx: 27, ry: 34, fill: '#fff', stroke: INK, sw: 7 },
      { k: 'ellipse', cx: RX, cy: EY, rx: 27, ry: 34, fill: '#fff', stroke: INK, sw: 7 },
      { k: 'path', d: spiral(LX, EY), stroke: INK, sw: 6 },
      { k: 'path', d: spiral(RX, EY), stroke: INK, sw: 6 },
    ];
  } else if (f === 'cry') {
    // squeezed shut: > <
    shapes = [
      { k: 'path', d: `M${LX - 20} ${EY - 18} L${LX + 16} ${EY} L${LX - 20} ${EY + 18}`, stroke: INK, sw: 11 },
      { k: 'path', d: `M${RX + 20} ${EY - 18} L${RX - 16} ${EY} L${RX + 20} ${EY + 18}`, stroke: INK, sw: 11 },
    ];
  }
  return { shapes: shapes.length ? [face(shapes)] : [] };
}

function brow(x: number, tilt: number, lift = 0, sw = 9): Shape {
  return { k: 'path', d: `M${x - 22} ${EY - 50 + tilt - lift} Q${x} ${EY - 62 + tilt / 2 - lift} ${x + 22} ${EY - 50 - tilt - lift}`, stroke: INK, sw };
}

export function brows(f: Face): Layer {
  const pair: Partial<Record<Face, Shape[]>> = {
    happy: [brow(LX, 4), brow(RX, -4)],
    sleepy: [brow(LX, 2, -4), brow(RX, -2, -4)],
    wow: [brow(LX, 0, 12), brow(RX, 0, 12)],
    wink: [brow(LX, 4), brow(RX, -8)],
    love: [brow(LX, 0), brow(RX, 0)],
    sad: [brow(LX, 11, 2), brow(RX, -11, 2)],
    cry: [brow(LX, 12, 4), brow(RX, -12, 4)],
    mad: [brow(LX, -13, -6, 11), brow(RX, 13, -6, 11)],
  };
  const s = pair[f];
  return { shapes: s ? [face(s)] : [] };
}

export function mouth(f: Face): Layer {
  const SMILE = 'M-42 26 Q0 40 42 26 Q40 84 0 86 Q-40 84 -42 26Z';
  const smile: Layer = {
    defs: [{ k: 'clip', id: 'mc', kids: [{ k: 'path', d: SMILE }] }],
    shapes: [face([
      { k: 'path', d: SMILE, fill: INK, stroke: INK, sw: 6 },
      { k: 'g', clip: 'mc', kids: [
        { k: 'ellipse', cx: 0, cy: 84, rx: 30, ry: 20, fill: PINK },
        { k: 'path', d: 'M-44 24 Q0 42 44 24 L44 40 Q0 56 -44 40Z', fill: '#fff' },
      ] },
    ])],
  };
  if (f === 'wow') {
    return { shapes: [face([
      { k: 'ellipse', cx: 0, cy: 52, rx: 20, ry: 26, fill: INK },
      { k: 'ellipse', cx: 0, cy: 66, rx: 12, ry: 9, fill: PINK },
    ])] };
  }
  if (f === 'cool') return { shapes: [face([{ k: 'path', d: 'M-40 34 Q0 76 40 34', stroke: INK, sw: 10 }])] };
  if (f === 'sad') return { shapes: [face([{ k: 'path', d: 'M-30 66 Q-16 50 0 52 Q16 50 30 66', stroke: INK, sw: 10 }])] };
  if (f === 'sleepy') return { shapes: [face([{ k: 'path', d: 'M-26 44 Q0 60 26 44', stroke: INK, sw: 9 }])] };
  if (f === 'dizzy') return { shapes: [face([{ k: 'path', d: 'M-36 54 Q-24 42 -12 54 Q0 66 12 54 Q24 42 36 54', stroke: INK, sw: 8 }])] };
  if (f === 'cry') {
    const WAIL = 'M-46 80 C-40 28 40 28 46 80 Q0 98 -46 80Z';
    return {
      defs: [{ k: 'clip', id: 'wc', kids: [{ k: 'path', d: WAIL }] }],
      shapes: [face([
        { k: 'path', d: WAIL, fill: INK, stroke: INK, sw: 6 },
        { k: 'g', clip: 'wc', kids: [{ k: 'ellipse', cx: 0, cy: 92, rx: 26, ry: 14, fill: PINK }] },
      ])],
    };
  }
  if (f === 'mad') {
    // teeth clenched
    return { shapes: [face([
      { k: 'path', d: 'M-40 40 Q0 32 40 40 L38 66 Q0 74 -38 66Z', fill: '#fff', stroke: INK, sw: 7 },
      { k: 'path', d: 'M-39 53 Q0 47 39 53', stroke: INK, sw: 4 },
      { k: 'path', d: 'M-20 37 V70 M0 35 V71 M20 37 V70', stroke: INK, sw: 4 },
    ])] };
  }
  return smile;
}

// ------------------------------------------------------------------ extras
/** Tears: little streams down the cheeks when sad, two fountains when he really cries. */
export function tears(kind: 'sad' | 'cry'): Layer {
  if (kind === 'sad') {
    return { shapes: [face([
      { k: 'path', d: 'M-54 28 C-60 52 -56 76 -60 100', stroke: TEAR, sw: 12, op: 0.9 },
      { k: 'path', d: 'M54 28 C60 52 56 76 60 100', stroke: TEAR, sw: 12, op: 0.9 },
    ])] };
  }
  return { shapes: [face([
    { k: 'path', d: 'M-58 4 C-120 -18 -168 30 -182 118', stroke: TEAR, sw: 18, op: 0.9 },
    { k: 'path', d: 'M58 4 C120 -18 168 30 182 118', stroke: TEAR, sw: 18, op: 0.9 },
    { k: 'path', d: 'M-70 -2 C-112 -14 -142 8 -156 48', stroke: '#fff', sw: 5, op: 0.6 },
    { k: 'path', d: 'M70 -2 C112 -14 142 8 156 48', stroke: '#fff', sw: 5, op: 0.6 },
  ])] };
}

/** The cross "vein" mark on his top right when he is mad. */
export const ANGER: Layer = {
  shapes: [{ k: 'g', tf: 'translate(132 -150) scale(1.7)', kids: [
    { k: 'path', d: 'M-15 -4 Q-4 -4 -4 -15 M4 -15 Q4 -4 15 -4 M15 4 Q4 4 4 15 M-4 15 Q-4 4 -15 4', stroke: RED, sw: 7 },
  ] }],
};

/** A nervous sweat drop by his head, while he is held up. */
export const SWEAT: Layer = {
  shapes: [{ k: 'g', tf: 'translate(158 -118) rotate(12)', kids: [
    { k: 'path', d: 'M0 -26 C11 -8 16 4 16 11 A16 16 0 0 1 -16 11 C-16 4 -11 -8 0 -26Z', fill: TEAR, stroke: INK, sw: 6 },
    { k: 'ellipse', cx: -5, cy: 8, rx: 4, ry: 7, fill: '#fff', op: 0.7 },
  ] }],
};

/** A five-pointed star (for the dizzy stars and sparkles), in its own little box -30..30. */
export function star(fill = GOLD): Layer {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 28 : 12;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  return { shapes: [{ k: 'polygon', points: pts.join(' '), fill, stroke: INK, sw: 4 }] };
}
export const STAR_BOX = { x: -32, y: -32, w: 64, h: 64 };

/** A falling tear drop, in its own little box. */
export const DROP: Layer = {
  shapes: [{ k: 'path', d: 'M0 -18 C8 -6 12 2 12 7 A12 12 0 0 1 -12 7 C-12 2 -8 -6 0 -18Z', fill: TEAR, stroke: INK, sw: 3 }],
};
export const DROP_BOX = { x: -16, y: -22, w: 32, h: 44 };
