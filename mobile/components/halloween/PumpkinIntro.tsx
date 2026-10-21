// The Halloween opening (2026-10-21): a jack-o'-lantern fades in out of the dark, laughs (the mouth chomps, the face shakes, the light
// flickers), opens its mouth wide, and the camera falls into it: the light floods the screen and the dashboard pops out of the mouth.
// Drawn with react-native-svg and Animated only (no new native library). Tap anywhere to skip.
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Text } from '../ScaledText';
import { PUMPKIN, PUMPKIN_BOX, MOUTH, MOUTH_BOX, COLORS_HALLOWEEN as C } from './art';

const ZOOM = 16;   // how far the camera falls into the mouth

function Glow({ d }: { d: string }) {
  return (
    <>
      <Path d={d} fill={C.glowEdge} opacity={0.35} stroke={C.glowEdge} strokeWidth={16} strokeLinejoin="round" />
      <Path d={d} fill={C.glow} stroke={C.glow} strokeWidth={3} strokeLinejoin="round" />
    </>
  );
}

export default function PumpkinIntro({ onPop, onDone }: { onPop: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const W = Math.min(width * 0.88, 400);
  const k = W / PUMPKIN_BOX.w;
  const H = PUMPKIN_BOX.h * k;
  const mouthW = MOUTH_BOX.w * k;
  const mouthH = MOUTH_BOX.h * k;
  const mouthDy = (MOUTH_BOX.y + MOUTH_BOX.h * 0.5 - PUMPKIN_BOX.h / 2) * k;   // the mouth's centre below the pumpkin's centre

  const enter = useRef(new Animated.Value(0)).current;
  const mouth = useRef(new Animated.Value(0.35)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(1)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const buzz = (kind: 'light' | 'heavy' | 'medium') => {
    try {
      Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch { /* no haptics on this phone */ }
  };
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  const finish = (popFirst: boolean) => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    if (popFirst) onPop();
    onDone();
  };

  useEffect(() => {
    const T = (v: Animated.Value, to: number, ms: number, easing = Easing.inOut(Easing.quad)) =>
      Animated.timing(v, { toValue: to, duration: ms, easing, useNativeDriver: true });

    const chomps = Array.from({ length: 4 }, () => Animated.sequence([T(mouth, 0.95, 130), T(mouth, 0.4, 130)]));
    const shakes = Array.from({ length: 8 }, (_, i) => T(shake, i % 2 ? -1 : 1, 130, Easing.linear));
    const flickers = [1, 0.55, 1, 0.7, 1, 0.5, 1, 0.8, 1].map((v) => T(flicker, v, 110, Easing.linear));

    running.current = Animated.sequence([
      // appears out of the dark
      Animated.parallel([T(enter, 1, 650, Easing.out(Easing.back(1.5)))]),
      // laughs
      Animated.parallel([Animated.sequence(chomps), Animated.sequence(shakes), Animated.sequence(flickers)]),
      Animated.parallel([T(shake, 0, 120), T(flicker, 1, 120)]),
      // opens wide and holds
      T(mouth, 1, 320, Easing.out(Easing.cubic)),
      Animated.delay(300),
      // falls into the mouth: the light floods the screen, then the overlay lets go and the dashboard pops out
      Animated.parallel([
        T(zoom, 1, 1000, Easing.in(Easing.cubic)),
        Animated.sequence([Animated.delay(620), T(fade, 0, 420, Easing.linear)]),
      ]),
    ]);

    // the phone buzzes with each laugh, the big open and the pop
    [0, 1, 2, 3].forEach((i) => later(650 + i * 260, () => buzz('light')));
    later(650 + 1040 + 120, () => buzz('heavy'));
    later(650 + 1040 + 120 + 320 + 300 + 560, () => { onPop(); buzz('medium'); });   // the dashboard starts to pop as the light floods in

    running.current.start(({ finished: ok }) => { if (ok) finish(false); });
    return () => { running.current?.stop(); timers.current.forEach(clearTimeout); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    if (finished.current) return;
    running.current?.stop();
    timers.current.forEach(clearTimeout);
    onPop();
    Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => finish(false));
  };

  const scale = Animated.multiply(
    enter.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
    zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ZOOM] }),
  );
  const moveY = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -mouthDy * ZOOM] });
  const rotate = shake.interpolate({ inputRange: [-1, 1], outputRange: ['-3.5deg', '3.5deg'] });
  const bobY = shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [3, 0, -3] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, st.overlay, { opacity: fade }]} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" accessibilityLabel={t('halloween.skip')}>
        <View style={st.night} />
        <View style={st.center}>
          <Animated.View style={{ width: W, height: H, opacity: enter, transform: [{ translateY: moveY }, { scale }, { translateY: bobY }, { rotate }] }}>
            {/* the pumpkin itself */}
            <Svg width={W} height={H} viewBox={`0 0 ${PUMPKIN_BOX.w} ${PUMPKIN_BOX.h}`}>
              <Defs>
                <RadialGradient id="skin" cx="50%" cy="42%" r="65%">
                  <Stop offset="0" stopColor={C.skinLight} />
                  <Stop offset="0.6" stopColor={C.skinMid} />
                  <Stop offset="1" stopColor={C.skinDark} />
                </RadialGradient>
              </Defs>
              {PUMPKIN.lobes.map((l, i) => <Ellipse key={i} cx={l.cx} cy={l.cy} rx={l.rx} ry={l.ry} fill="url(#skin)" />)}
              {PUMPKIN.ribs.map((d, i) => <Path key={i} d={d} stroke={C.rib} strokeWidth={5} fill="none" opacity={0.55} strokeLinecap="round" />)}
              <Path d={PUMPKIN.stem} fill={C.stem} />
              <Path d={PUMPKIN.stemShade} fill={C.stemShade} />
            </Svg>
            {/* the eyes and nose glow, and the candle flickers */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: flicker }]} pointerEvents="none">
              <Svg width={W} height={H} viewBox={`0 0 ${PUMPKIN_BOX.w} ${PUMPKIN_BOX.h}`}>
                {PUMPKIN.eyes.map((d, i) => <Glow key={i} d={d} />)}
                <Glow d={PUMPKIN.nose} />
              </Svg>
            </Animated.View>
            {/* the mouth opens and closes from its top edge */}
            <Animated.View
              pointerEvents="none"
              style={{ position: 'absolute', left: MOUTH_BOX.x * k, top: MOUTH_BOX.y * k, width: mouthW, height: mouthH,
                transform: [{ translateY: -mouthH / 2 }, { scaleY: mouth }, { translateY: mouthH / 2 }] }}
            >
              <Svg width={mouthW} height={mouthH} viewBox={`0 0 ${MOUTH_BOX.w} ${MOUTH_BOX.h}`} style={{ overflow: 'visible' }}>
                <Glow d={MOUTH} />
              </Svg>
            </Animated.View>
          </Animated.View>
        </View>
        <Text style={st.skip} maxFontSizeMultiplier={1.1}>{t('halloween.skip')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  overlay: { zIndex: 9999, elevation: 9999 },
  night: { ...StyleSheet.absoluteFillObject, backgroundColor: C.night },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  skip: { position: 'absolute', bottom: 48, alignSelf: 'center', color: '#cdb8e6', opacity: 0.55, fontSize: 13, fontWeight: '600' },
});
