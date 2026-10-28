// Cuatro as moving parts (2026-10-27): the shapes in art.ts, one picture per part, stacked in the poster's order and each turned or
// squeezed about its own joint by the animated values in RigValues. Every movement runs on the native animation thread
// (useNativeDriver), so he stays smooth while the screen behind him is busy. No new native library: react-native-svg and Animated.
import { memo, useRef, type ReactElement } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path, Ellipse, Circle, Rect, Polygon, G, Defs, LinearGradient, RadialGradient, Stop, ClipPath } from 'react-native-svg';
import {
  VIEWBOX, ASPECT, PIVOT, BODY, SPROUT, CHEEKS, CHEEKS_MAD, ANGER, SWEAT, arm, leg, eyeWhites, pupils, lids, otherEyes, brows, mouth, tears,
  type Layer, type Shape, type Def, type Face, type Glove,
} from './art';

const VB = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;
const CENTRE_Y = VIEWBOX.y + VIEWBOX.h / 2;

function shape(s: Shape, i: number, pre: string): ReactElement {
  if (s.k === 'g') {
    return <G key={i} transform={s.tf} opacity={s.op} clipPath={s.clip ? `url(#${pre}${s.clip})` : undefined}>{s.kids.map((k, j) => shape(k, j, pre))}</G>;
  }
  const fill = s.fill ?? (s.stroke ? 'none' : '#000');
  const paint = {
    fill: fill.startsWith('url(#') ? fill.replace('url(#', `url(#${pre}`) : fill,
    stroke: s.stroke, strokeWidth: s.sw, opacity: s.op, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (s.k) {
    case 'path': return <Path key={i} d={s.d} transform={s.tf} {...paint} />;
    case 'ellipse': return <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={s.tf} {...paint} />;
    case 'circle': return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
    case 'rect': return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} transform={s.tf} {...paint} />;
    case 'polygon': return <Polygon key={i} points={s.points} {...paint} />;
  }
}

function def(d: Def, pre: string): ReactElement {
  if (d.k === 'clip') return <ClipPath key={d.id} id={pre + d.id}>{d.kids.map((k, i) => shape(k, i, pre))}</ClipPath>;
  const stops = d.stops.map(([o, c, a], i) => <Stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />);
  if (d.k === 'linear') return <LinearGradient key={d.id} id={pre + d.id} gradientUnits="userSpaceOnUse" x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2}>{stops}</LinearGradient>;
  return <RadialGradient key={d.id} id={pre + d.id} cx="50%" cy="50%" r="50%">{stops}</RadialGradient>;
}

/** One part, drawn over the whole box. `pre` keeps its gradient and clip names apart from the other parts'. */
export const Part = memo(function Part({ layer, w, pre, box = VB }: { layer: Layer; w: number; pre: string; box?: string }) {
  if (!layer.shapes.length) return null;
  const [, , bw, bh] = box.split(' ').map(Number);
  return (
    <Svg width={w} height={(w * bh) / bw} viewBox={box}>
      {layer.defs?.length ? <Defs>{layer.defs.map((d) => def(d, pre))}</Defs> : null}
      {layer.shapes.map((s, i) => shape(s, i, pre))}
    </Svg>
  );
});

// The parts change only with the face or the hands, so each one is made once and reused (and React skips redrawing it).
const cache = new Map<string, Layer>();
function once(key: string, make: () => Layer): Layer {
  let l = cache.get(key);
  if (!l) { l = make(); cache.set(key, l); }
  return l;
}

export interface RigValues {
  armL: Animated.Value; armR: Animated.Value;   // degrees; more raises the arm (0 is straight out to the side, -62 hangs at rest)
  legL: Animated.Value; legR: Animated.Value;   // degrees; more swings the foot outwards
  sprout: Animated.Value;                        // degrees
  blink: Animated.Value;                         // 1 open, about 0.1 shut
  gazeX: Animated.Value; gazeY: Animated.Value;  // pupils' offset in drawing units (about 6 at most)
  talk: Animated.Value;                          // the mouth's height, 1 open to about 0.5
}

export function useRigValues(): RigValues {
  return useRef<RigValues>({
    armL: new Animated.Value(-62), armR: new Animated.Value(-62), legL: new Animated.Value(0), legR: new Animated.Value(0),
    sprout: new Animated.Value(0), blink: new Animated.Value(1), gazeX: new Animated.Value(0), gazeY: new Animated.Value(0),
    talk: new Animated.Value(1),
  }).current;
}

const deg = (v: Animated.Value | Animated.AnimatedInterpolation<number>, sign = 1) =>
  v.interpolate({ inputRange: [-360, 360], outputRange: [`${-360 * sign}deg`, `${360 * sign}deg`] });

/** Turns or squeezes about a joint: moves the joint to the box's centre, does it, and moves back (works everywhere, no transform origin). */
export function about(p: readonly number[], w: number, ...t: any[]): any[] {
  const s = w / VIEWBOX.w;
  const dx = (p[0] - (VIEWBOX.x + VIEWBOX.w / 2)) * s, dy = (p[1] - CENTRE_Y) * s;
  return [{ translateX: dx }, { translateY: dy }, ...t, { translateX: -dx }, { translateY: -dy }];
}

export interface Extras { tears?: 'sad' | 'cry'; anger?: boolean; sweat?: boolean }

/** Cuatro, `size` wide. `face` and the gloves pick the drawings; `v` moves them. */
export default function CuatroRig({ size, face, gloves, v, extras, id = 'c' }: {
  size: number; face: Face; gloves: [Glove, Glove]; v: RigValues; extras?: Extras; id?: string;
}) {
  const w = size, h = size * ASPECT;
  const layer = (style: any, l: Layer, key: string) => (
    <Animated.View key={key} pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Part layer={l} w={w} pre={`${id}${key}_`} />
    </Animated.View>
  );
  const scale = w / VIEWBOX.w;
  return (
    <View pointerEvents="none" style={{ width: w, height: h }}>
      {layer({ transform: about(PIVOT.armL, w, { rotate: deg(v.armL) }) }, once(`armL${gloves[0]}`, () => arm('L', gloves[0])), 'al')}
      {layer({ transform: about(PIVOT.armR, w, { rotate: deg(v.armR, -1) }) }, once(`armR${gloves[1]}`, () => arm('R', gloves[1])), 'ar')}
      {layer({ transform: about(PIVOT.legL, w, { rotate: deg(v.legL) }) }, once('legL', () => leg('L')), 'll')}
      {layer({ transform: about(PIVOT.legR, w, { rotate: deg(v.legR, -1) }) }, once('legR', () => leg('R')), 'lr')}
      {layer({ transform: about(PIVOT.sprout, w, { rotate: deg(v.sprout) }) }, SPROUT, 'sp')}
      {layer(null, BODY, 'bd')}
      {layer(null, face === 'mad' ? CHEEKS_MAD : CHEEKS, 'ck')}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: about(PIVOT.eyes, w, { scaleY: v.blink }) }]}>
        {layer(null, once(`ew${face}`, () => eyeWhites(face)), 'ew')}
        {layer({ transform: [{ translateX: Animated.multiply(v.gazeX, scale) }, { translateY: Animated.multiply(v.gazeY, scale) }] }, once(`pu${face}`, () => pupils(face)), 'pu')}
        {layer(null, once(`li${face}`, () => lids(face)), 'li')}
        {layer(null, once(`oe${face}`, () => otherEyes(face)), 'oe')}
      </Animated.View>
      {layer(null, once(`br${face}`, () => brows(face)), 'br')}
      {layer({ transform: about(PIVOT.mouth, w, { scaleY: v.talk }) }, once(`mo${face}`, () => mouth(face)), 'mo')}
      {extras?.tears ? layer(null, once(`te${extras.tears}`, () => tears(extras.tears!)), 'te') : null}
      {extras?.anger ? layer(null, ANGER, 'an') : null}
      {extras?.sweat ? layer(null, SWEAT, 'sw') : null}
    </View>
  );
}
