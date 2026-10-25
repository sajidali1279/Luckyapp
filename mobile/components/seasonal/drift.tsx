// The moving pieces of the seasonal backgrounds (2026-10-25): a shape that bobs in place, one that flies across, and one that falls
// from the top and drifts down again and again (leaves, snow). Each draws a Drawing from art.ts; the watermarks place them.
import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, ViewStyle, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Drawing } from './art';

export function Shape({ d, size, color }: { d: Drawing; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {d.fill ? <Path d={d.fill} fill={color} fillRule="evenodd" /> : null}
      {d.line ? <Path d={d.line} stroke={color} strokeWidth={d.width ?? 4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </Svg>
  );
}

/** One value that runs 0 to 1 and back, forever, slowly. */
export function useSwing(ms: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), delay, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [v, ms, delay]);
  return v;
}

/** One value that runs 0 to 1 in a straight line, then starts again, forever. */
function useLoop(ms: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [v, ms]);
  return v;
}

/** Bobs up and down in place, with a little tilt. */
export const Bobber = memo(function Bobber({ d, size, color, pos, ms, lift = 12, tilt = 4 }: { d: Drawing; size: number; color: string; pos: ViewStyle; ms: number; lift?: number; tilt?: number }) {
  const v = useSwing(ms);
  const y = v.interpolate({ inputRange: [0, 1], outputRange: [-lift, lift] });
  const r = v.interpolate({ inputRange: [0, 1], outputRange: [`-${tilt}deg`, `${tilt}deg`] });
  return <Animated.View style={[st.item, pos, { transform: [{ translateY: y }, { rotate: r }] }]}><Shape d={d} size={size} color={color} /></Animated.View>;
});

/** Flies across the screen from left to right with a gentle rise and fall, again and again; spin: whole turns per crossing. */
export const Flyer = memo(function Flyer({ d, size, top, color, secs, spin = 0 }: { d: Drawing; size: number; top: `${number}%`; color: string; secs: number; spin?: number }) {
  const { width } = useWindowDimensions();
  const x = useLoop(secs * 1000);
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [-size * 1.5, width + size] });
  const ty = x.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -26, 6, -20, 0] });
  const r = x.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin * 360}deg`] });
  return <Animated.View style={[st.item, { top, left: 0, transform: [{ translateX: tx }, { translateY: ty }, { rotate: r }] }]}><Shape d={d} size={size} color={color} /></Animated.View>;
});

/** Falls from above the top to below the bottom, swaying and turning, again and again. phase (0 to 1) staggers several of them. */
export const Faller = memo(function Faller({ d, size, left, color, secs, phase = 0, sway = 20, spin = 180 }: { d: Drawing; size: number; left: `${number}%`; color: string; secs: number; phase?: number; sway?: number; spin?: number }) {
  const { height } = useWindowDimensions();
  const v = useLoop(secs * 1000);
  const swing = useSwing(2200 + Math.round(secs * 90));
  const p = Animated.modulo(Animated.add(v, phase), 1);
  const ty = p.interpolate({ inputRange: [0, 1], outputRange: [-size * 1.5, height + size] });
  const tx = swing.interpolate({ inputRange: [0, 1], outputRange: [-sway, sway] });
  const r = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin}deg`] });
  return <Animated.View style={[st.item, { top: 0, left, transform: [{ translateY: ty }, { translateX: tx }, { rotate: r }] }]}><Shape d={d} size={size} color={color} /></Animated.View>;
});

const st = StyleSheet.create({
  item: { position: 'absolute' },
});
