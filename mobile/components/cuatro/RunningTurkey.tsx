// The turkey that chases Cuatro across the bottom bar on Thanksgiving (2026-11-08, the owner's idea): side on, facing left, its tail
// fanned behind it, legs running and the body bobbing, with a "Gobble gobble!" bubble. The colours are the Thanksgiving opening's
// (seasonal/art.ts), so the two turkeys look like the same bird. Drawn with react-native-svg; it moves only on the native thread.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { Text } from '../ScaledText';
import { COLORS_THANKSGIVING as C } from '../seasonal/art';

export const TURKEY_W = 92;
export const TURKEY_H = 80;
const N = { useNativeDriver: true } as const;
const FAN = [C.orange, C.red, C.gold, C.brown, C.orange, C.red, C.gold];

/** The bird itself (no legs: they are drawn on their own so they can run). viewBox 0 0 120 100, the head on the left. */
function Body() {
  return (
    <Svg width={TURKEY_W} height={TURKEY_W * 100 / 120} viewBox="0 0 120 100">
      {/* the tail fan behind, on the right */}
      <G>
        {FAN.map((col, i) => {
          const a = -70 + i * 23;
          return (
            <G key={i} rotation={a} origin="78, 58">
              <Ellipse cx={78} cy={22} rx={11} ry={30} fill={col} stroke={C.quill} strokeWidth={1.5} />
              <Ellipse cx={78} cy={0} rx={7} ry={8} fill={C.featherTip} opacity={0.9} />
            </G>
          );
        })}
      </G>
      {/* the body and its wing */}
      <Ellipse cx={66} cy={62} rx={30} ry={24} fill={C.bodyDark} stroke={C.quill} strokeWidth={2} />
      <Ellipse cx={58} cy={66} rx={20} ry={15} fill={C.belly} opacity={0.55} />
      <Path d="M58 52 C74 48 90 58 86 72 C78 70 66 66 58 52 Z" fill={C.wing} />
      {/* the neck, the head, the beak (pointing left, the way it runs) and the wattle */}
      <Path d="M44 54 C36 44 34 30 30 22 L40 18 C44 28 48 40 52 50 Z" fill={C.head} stroke={C.quill} strokeWidth={1.5} />
      <Circle cx={33} cy={18} r={10} fill={C.head} stroke={C.quill} strokeWidth={1.5} />
      <Path d="M24 16 L12 20 L24 22 Z" fill={C.beak} stroke={C.quill} strokeWidth={1} />
      <Path d="M24 22 C20 30 26 36 28 28 C28 26 26 24 24 22 Z" fill={C.wattle} />
      <Circle cx={31} cy={15} r={3.2} fill="#fff" />
      <Circle cx={30} cy={15} r={1.8} fill="#1a0e06" />
    </Svg>
  );
}

function Leg({ swing, left }: { swing: Animated.Value; left: number }) {
  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-32deg', '32deg'] });
  return (
    <Animated.View style={[s.leg, { left, transform: [{ translateY: -8 }, { rotate }, { translateY: 8 }] }]}>
      <View style={s.shin} />
      <View style={s.foot} />
    </Animated.View>
  );
}

/** The turkey, running in place: the parent moves it across the screen. `gobble` shows its bubble. */
export default function RunningTurkey({ gobble, gobbleText }: { gobble: boolean; gobbleText: string }) {
  const a = useRef(new Animated.Value(-1)).current;
  const b = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const step = (v: Animated.Value, from: number) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: -from, duration: 130, easing: Easing.inOut(Easing.quad), ...N }),
      Animated.timing(v, { toValue: from, duration: 130, easing: Easing.inOut(Easing.quad), ...N }),
    ]));
    const runs = [step(a, -1), step(b, 1), Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: -5, duration: 130, ...N }), Animated.timing(bob, { toValue: 0, duration: 130, ...N }),
    ]))];
    runs.forEach((r) => r.start());
    return () => runs.forEach((r) => r.stop());
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ width: TURKEY_W, height: TURKEY_H }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Leg swing={a} left={TURKEY_W * 0.42} />
      <Leg swing={b} left={TURKEY_W * 0.56} />
      <Animated.View style={{ transform: [{ translateY: bob }] }}>
        <Body />
      </Animated.View>
      {gobble ? (
        <View style={s.bubble}>
          <Text style={s.gobble} numberOfLines={1}>{gobbleText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  leg: { position: 'absolute', top: TURKEY_W * 100 / 120 - 14, width: 4, alignItems: 'center' },
  shin: { width: 4, height: 16, borderRadius: 2, backgroundColor: C.legs },
  foot: { width: 12, height: 4, borderRadius: 2, backgroundColor: C.legs, marginLeft: -8 },
  bubble: { position: 'absolute', top: -30, left: -6, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 2, borderColor: C.bodyDark },
  gobble: { fontSize: 14, fontWeight: '800', color: C.bodyDark },
});
