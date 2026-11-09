// Christmas (2026-11-08, the owner's pick): Cuatro sleds across the bottom bar, a bump throws a gift off the sled onto the bar, and a tap
// on the gift pops its lid with sparkles and opens the Rewards catalog. No prize and no points in it (clear of lottery and contest
// rules). The sled faces left, the way he rides; the colours are the Christmas opening's (seasonal/art.ts), so the gifts match.
// Drawn with react-native-svg; everything moves on the native thread.
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Text } from '../ScaledText';
import { COLORS_CHRISTMAS as C } from '../seasonal/art';
import { haptic } from '../../utils/haptics';

export const SLED_W = 100;
export const SLED_H = 34;
export const SLED_DECK = 20;   // how far above the bar his feet are when he stands on the sled
export const GIFT_W = 46;
export const GIFT_H = 52;      // the gift with its bow
const N = { useNativeDriver: true } as const;

/** The sled: a red body on two curled gold runners, the curl in front (on the left). viewBox 0 0 100 34. */
function SledArt() {
  return (
    <Svg width={SLED_W} height={SLED_H} viewBox="0 0 100 34">
      {/* the runner: along the ground, curled up at the front */}
      <Path d="M8 10 C0 14 0 30 12 30 L92 30" fill="none" stroke={C.ribbonDark} strokeWidth={4} strokeLinecap="round" />
      <Path d="M30 22 L30 30 M70 22 L70 30" stroke={C.ribbonDark} strokeWidth={3.5} strokeLinecap="round" />
      {/* the body, with a gold stripe */}
      <Path d="M14 8 L94 8 C97 8 98 10 97 13 L94 22 L20 22 C14 22 12 16 14 8 Z" fill={C.boxLight} stroke={C.boxDark} strokeWidth={2} />
      <Rect x={20} y={13} width={70} height={3.5} rx={1.5} fill={C.ribbon} />
    </Svg>
  );
}

/** The snow it kicks up behind (on the right), puffing while it moves. */
function Spray() {
  const p = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const runs = p.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 110),
      Animated.timing(v, { toValue: 1, duration: 330, easing: Easing.out(Easing.quad), ...N }),
      Animated.timing(v, { toValue: 0, duration: 0, ...N }),
    ])));
    runs.forEach((r) => r.start());
    return () => runs.forEach((r) => r.stop());
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {p.map((v, i) => (
        <Animated.View key={i} style={[s.puff, {
          left: SLED_W - 10, top: SLED_H - 14 - i * 3,
          opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 18 + i * 6] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -10 - i * 4] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.4] }) }],
        }]} />
      ))}
    </>
  );
}

/** The sled with its snow spray. The parent moves it across the bar. */
export function Sled() {
  return (
    <View style={{ width: SLED_W, height: SLED_H }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Spray />
      <SledArt />
    </View>
  );
}

/** The gift box: red, gold ribbon and bow. viewBox 0 0 46 52; the lid (0 to 22) is drawn on its own so it can pop off. */
function GiftBody() {
  return (
    <Svg width={GIFT_W} height={GIFT_H} viewBox="0 0 46 52" style={StyleSheet.absoluteFill}>
      <Rect x={4} y={22} width={38} height={30} rx={3} fill={C.boxLight} stroke={C.boxDark} strokeWidth={1.5} />
      <Rect x={19.5} y={22} width={7} height={30} fill={C.ribbon} />
    </Svg>
  );
}
function GiftLid() {
  return (
    <Svg width={GIFT_W} height={GIFT_H} viewBox="0 0 46 52" style={StyleSheet.absoluteFill}>
      <Path d="M23 13 C14 2 6 6 10 12 C12 15 18 15 23 13 Z" fill={C.ribbon} stroke={C.ribbonDark} strokeWidth={1.2} />
      <Path d="M23 13 C32 2 40 6 36 12 C34 15 28 15 23 13 Z" fill={C.ribbon} stroke={C.ribbonDark} strokeWidth={1.2} />
      <Rect x={1} y={13} width={44} height={10} rx={2.5} fill={C.lidLight} stroke={C.boxDark} strokeWidth={1.5} />
      <Rect x={19.5} y={13} width={7} height={10} fill={C.ribbon} />
    </Svg>
  );
}

const SPARKS = Array.from({ length: 8 }, (_, i) => ({ a: ((-170 + i * (160 / 7)) * Math.PI) / 180, d: 34 + (i % 3) * 12 }));

/**
 * The gift on the bar. It flies up off the sled where it was thrown (`from` px above the bar), lands with a bounce, wiggles now and then,
 * and fades away after `life` ms if nobody taps it. A tap pops the lid with sparkles, then `onOpened` (the parent opens Rewards).
 */
export function Gift({ from, life, label, onOpened, onGone }: { from: number; life: number; label: string; onOpened: () => void; onGone: () => void }) {
  const fly = useRef(new Animated.Value(0)).current;
  const wig = useRef(new Animated.Value(0)).current;
  const lid = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const opened = useRef(false);
  const cb = useRef({ onOpened, onGone });
  cb.current = { onOpened, onGone };
  useEffect(() => {
    let wiggles: Animated.CompositeAnimation | null = null;
    Animated.timing(fly, { toValue: 1, duration: 700, easing: Easing.linear, ...N }).start(({ finished }) => {
      if (!finished) return;
      wiggles = Animated.loop(Animated.sequence([
        Animated.delay(2200),
        Animated.timing(wig, { toValue: 1, duration: 70, ...N }), Animated.timing(wig, { toValue: -1, duration: 90, ...N }),
        Animated.timing(wig, { toValue: 1, duration: 90, ...N }), Animated.timing(wig, { toValue: 0, duration: 70, ...N }),
      ]));
      wiggles.start();
    });
    const t = setTimeout(() => {
      if (opened.current) return;
      Animated.timing(fade, { toValue: 0, duration: 600, ...N }).start(() => { if (!opened.current) cb.current.onGone(); });
    }, life);
    return () => { clearTimeout(t); wiggles?.stop(); fly.stopAnimation(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const open = () => {
    if (opened.current) return;
    opened.current = true;
    haptic.success();
    fade.stopAnimation(); fade.setValue(1);
    wig.stopAnimation(); wig.setValue(0);
    Animated.sequence([
      Animated.timing(lid, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), ...N }),
      Animated.timing(fade, { toValue: 0, duration: 300, ...N }),
    ]).start(() => cb.current.onOpened());
  };
  // thrown up off the sled and down onto the bar, turning over once, with a little bounce at the end
  const y = fly.interpolate({ inputRange: [0, 0.4, 0.8, 0.9, 1], outputRange: [-from, -from - 70, 0, -10, 0] });
  const turn = fly.interpolate({ inputRange: [0, 0.8, 1], outputRange: ['-200deg', '0deg', '0deg'] });
  const tilt = wig.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] });
  return (
    <Animated.View style={{ width: GIFT_W, height: GIFT_H, opacity: fade, transform: [{ translateY: y }, { rotate: turn }, { rotate: tilt }] }}>
      <Pressable onPress={open} style={StyleSheet.absoluteFill} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} testID="cuatro-gift">
        <GiftBody />
        {/* the lid and bow fly off */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          opacity: lid.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
          transform: [{ translateY: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }, { translateX: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
            { rotate: lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-35deg'] }) }],
        }]}>
          <GiftLid />
        </Animated.View>
        {/* light and sparkles pour out of the open box */}
        <Animated.View pointerEvents="none" style={[s.glow, { opacity: lid.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: lid.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.6] }) }] }]} />
        {SPARKS.map((p, i) => (
          <Animated.View key={i} pointerEvents="none" style={[s.spark, {
            opacity: lid.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
            transform: [{ translateX: lid.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.a) * p.d] }) }, { translateY: lid.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.a) * p.d] }) }],
          }]}>
            <Text style={s.sparkText} maxFontSizeMultiplier={1}>✦</Text>
          </Animated.View>
        ))}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  puff: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1' },
  glow: { position: 'absolute', left: GIFT_W / 2 - 22, top: 4, width: 44, height: 30, borderRadius: 22, backgroundColor: C.glow },
  spark: { position: 'absolute', left: GIFT_W / 2 - 6, top: 10 },
  sparkText: { fontSize: 13, color: '#F59E0B', fontWeight: '900' },
});
