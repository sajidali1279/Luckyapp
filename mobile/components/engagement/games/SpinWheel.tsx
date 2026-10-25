// Spin the wheel (2026-10-25): each slice is as big as its real chance (with a small minimum so the top prize can still be seen), so the
// wheel never looks fairer than it is. The server has already drawn the result before the wheel turns: the wheel only spins to it
// (landOn), then calls onDone. Reduce Motion: one short turn instead of a long spin.
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useReduceMotion } from '../../../utils/motion';
import Cuatro from '../Cuatro';
import type { Prize } from './types';

const COLORS = ['#CC2936', '#1D3557', '#F4A261', '#2DC653', '#457B9D', '#E9A23B', '#7B2CBF', '#E76F51'];
const MIN_SLICE = 9;   // degrees

/** Each slice's angle from its chance, with the small ones held at MIN_SLICE and the rest shrunk to make room (again, until shrinking
 *  pushes no other slice under the minimum). */
export function sliceAngles(chances: number[]): number[] {
  let held = chances.map(() => false);
  let out = chances.map(() => 360 / Math.max(1, chances.length));
  for (let pass = 0; pass <= chances.length; pass++) {
    const fixed = held.filter(Boolean).length * MIN_SLICE;
    const rest = chances.reduce((t, c, i) => t + (held[i] ? 0 : c), 0);
    out = chances.map((c, i) => (held[i] ? MIN_SLICE : rest > 0 ? (c * (360 - fixed)) / rest : (360 - fixed) / chances.length));
    const next = out.map((a, i) => held[i] || a < MIN_SLICE);
    if (next.every((h, i) => h === held[i])) break;
    held = next;
  }
  return out;
}

const point = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

export default function SpinWheel({ prizes, landOn, animate, onDone }: { prizes: Prize[]; landOn: number | null; animate: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const size = Math.min(width - 48, 340);
  const r = size / 2;
  const angles = useMemo(() => sliceAngles(prizes.map((p) => p.chance)), [prizes]);
  const starts = useMemo(() => angles.map((_, i) => angles.slice(0, i).reduce((t, a) => t + a, 0)), [angles]);
  const rot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (landOn == null || landOn < 0 || landOn >= prizes.length) return;
    // somewhere in the middle of the slice (never on a line), brought round under the pointer at the top
    const at = starts[landOn] + angles[landOn] * (0.3 + Math.random() * 0.4);
    const end = 360 - at;
    if (!animate) { rot.setValue(end); return; }
    rot.setValue(0);
    const a = Animated.timing(rot, { toValue: (reduce ? 360 : 360 * 6) + end, duration: reduce ? 700 : 4800, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start(({ finished }) => { if (finished) onDone(); });
    return () => a.stop();
  }, [landOn]);   // eslint-disable-line react-hooks/exhaustive-deps

  const spin = rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const label = (p: Prize) => (p.pts > 0 ? t('games.prizePts', { pts: p.pts }) : t('games.noPrizeShort'));

  return (
    <View style={{ width: size, height: size + 18, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ width: size, height: size, marginTop: 18, transform: [{ rotate: spin }] }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={r} cy={r} r={r - 1} fill="#0F2038" />
          {prizes.map((p, i) => {
            const a0 = starts[i], a1 = a0 + angles[i];
            const [x0, y0] = point(r, r, r - 8, a0);
            const [x1, y1] = point(r, r, r - 8, a1);
            const d = `M${r} ${r} L${x0} ${y0} A${r - 8} ${r - 8} 0 ${angles[i] > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
            return <Path key={i} d={d} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />;
          })}
          {/* the words run out along each slice, so even a thin slice has room for its prize */}
          {prizes.map((p, i) => {
            const mid = starts[i] + angles[i] / 2;
            return (
              <G key={`t${i}`} transform={`rotate(${mid - 90} ${r} ${r})`}>
                <SvgText x={r + r * 0.6} y={r} dy="0.35em" textAnchor="middle" fill="#fff" fontSize={angles[i] < 20 ? 11 : 14} fontWeight="800">{label(p)}</SvgText>
              </G>
            );
          })}
          {Array.from({ length: 24 }, (_, i) => { const [x, y] = point(r, r, r - 4, i * 15); return <Circle key={`d${i}`} cx={x} cy={y} r={2.2} fill={i % 2 ? '#FFE8A3' : '#fff'} />; })}
        </Svg>
      </Animated.View>
      {/* Cuatro sits still in the middle while the wheel turns */}
      <View style={[st.hub, { width: r * 0.62, height: r * 0.62, borderRadius: r * 0.31, top: 18 + r - r * 0.31 }]}>
        <Cuatro pose="wave" size={r * 0.52} />
      </View>
      {/* the pointer */}
      <Svg width={34} height={30} style={st.pointer}><Path d="M3 2 L31 2 L17 28 Z" fill="#CC2936" stroke="#fff" strokeWidth={3} strokeLinejoin="round" /></Svg>
    </View>
  );
}

const st = StyleSheet.create({
  hub: { position: 'absolute', backgroundColor: '#fff', borderWidth: 4, borderColor: '#CC2936', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pointer: { position: 'absolute', top: 2 },
});
