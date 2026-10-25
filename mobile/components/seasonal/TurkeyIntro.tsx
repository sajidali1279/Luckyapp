// The Thanksgiving opening (2026-10-25): a turkey appears with its tail folded, fans its feathers out, gobbles three times (the head turns,
// the body sways), puffs up, and the camera flies into the fan: the body fades, the feathers become a burst of autumn colours, warm light
// floods the screen and the dashboard pops out. Drawn with react-native-svg and Animated only. Tap anywhere to skip.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse, Path, Circle } from 'react-native-svg';
import { TURKEY, TURKEY_BOX, COLORS_THANKSGIVING as C } from './art';
import { IntroFrame, T, buzz, useIntro, type IntroProps } from './introKit';

const ZOOM = 7;   // how far the camera flies into the fan
const ORDER = TURKEY.fan.map((_, i) => i).sort((x, y) => Math.abs(TURKEY.fan[y]) - Math.abs(TURKEY.fan[x]));   // outside in: the middle feather on top

export default function TurkeyIntro(props: IntroProps) {
  const { width } = useWindowDimensions();
  const W = Math.min(width * 0.9, 400);
  const k = W / TURKEY_BOX.w;
  const H = TURKEY_BOX.h * k;
  const { pivot: P, featherLength: L, head: HD } = TURKEY;
  const pivotDy = (P.y - TURKEY_BOX.h / 2) * k;   // the fan's centre below the drawing's centre
  const S = 2 * L * k;   // each feather sits in a square centred on the pivot, so turning the square turns the feather about the pivot
  const { fade, later, run, skip, pop } = useIntro(props);

  const enter = useRef(new Animated.Value(0)).current;
  const fan = useRef(new Animated.Value(0)).current;
  const gobble = useRef(new Animated.Value(0)).current;
  const puff = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const gobbles = Array.from({ length: 3 }, () => Animated.sequence([T(gobble, 1, 130), T(gobble, -1, 130)]));
    run(Animated.sequence([
      // appears with the tail folded
      T(enter, 1, 650, Easing.out(Easing.back(1.5))),
      // fans the tail out
      T(fan, 1, 600, Easing.out(Easing.back(1.8))),
      // gobbles
      Animated.sequence(gobbles),
      T(gobble, 0, 120),
      // puffs up and holds
      T(puff, 1, 250, Easing.out(Easing.quad)),
      Animated.delay(200),
      // flies into the fan: the colours fill the screen, the warm light floods in, then the overlay lets go
      Animated.parallel([
        T(zoom, 1, 1000, Easing.in(Easing.cubic)),
        Animated.sequence([Animated.delay(620), T(fade, 0, 420, Easing.linear)]),
      ]),
    ]));
    later(650 + 250, () => buzz('light'));   // the tail opens
    [0, 1, 2].forEach((i) => later(1250 + i * 260, () => buzz('light')));   // gobble, gobble, gobble
    later(1250 + 780 + 120, () => buzz('heavy'));   // puffs up
    later(1250 + 780 + 120 + 250 + 200 + 560, () => { pop(); buzz('medium'); });   // the dashboard starts to pop as the light floods in
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const scale = Animated.multiply(
    Animated.multiply(enter.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), puff.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })),
    zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ZOOM] }),
  );
  const moveY = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -pivotDy * ZOOM] });
  const sway = gobble.interpolate({ inputRange: [-1, 1], outputRange: ['-3deg', '3deg'] });
  const headTurn = gobble.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] });
  const headShift = gobble.interpolate({ inputRange: [-1, 1], outputRange: [-6 * k, 6 * k] });
  // the zoom eases in, so most of it happens while the overlay is already fading: the body goes and the light comes early to be seen
  const bodyFade = zoom.interpolate({ inputRange: [0, 0.12], outputRange: [1, 0], extrapolate: 'clamp' });
  const flood = zoom.interpolate({ inputRange: [0.06, 0.35], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <IntroFrame fade={fade} onSkip={skip} background={C.night} skipColor={C.skip}>
      <View style={st.center} pointerEvents="none">
        <Animated.View style={{ width: W, height: H, opacity: enter, transform: [{ translateY: moveY }, { scale }, { rotate: sway }] }}>
          {/* the tail: each feather turns from straight up to its place in the fan, a little further when it puffs up */}
          {ORDER.map((i) => {
            const a = TURKEY.fan[i];
            const turn = Animated.add(Animated.add(Animated.multiply(fan, a), Animated.multiply(puff, a * 0.12)), Animated.multiply(gobble, 2))
              .interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
            return (
              <Animated.View key={i} style={{ position: 'absolute', left: (P.x - L) * k, top: (P.y - L) * k, width: S, height: S, transform: [{ rotate: turn }] }}>
                <Svg width={S} height={S} viewBox={`${-L} ${-L} ${2 * L} ${2 * L}`}>
                  <Path d={TURKEY.feather} fill={TURKEY.feathers[i]} />
                  <Path d={TURKEY.featherTip} fill={C.featherTip} opacity={0.85} />
                  <Path d={TURKEY.quill} stroke={C.quill} strokeWidth={3} opacity={0.35} />
                </Svg>
              </Animated.View>
            );
          })}
          {/* the body, wings and legs, then the head; all fade as the camera flies into the fan */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: bodyFade }]}>
            <Svg width={W} height={H} viewBox={`0 0 ${TURKEY_BOX.w} ${TURKEY_BOX.h}`}>
              <Defs>
                <RadialGradient id="turkeyBody" cx="45%" cy="35%" r="70%">
                  <Stop offset="0" stopColor={C.bodyLight} />
                  <Stop offset="1" stopColor={C.bodyDark} />
                </RadialGradient>
              </Defs>
              <Path d={TURKEY.legs} stroke={C.legs} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Ellipse cx={TURKEY.body.cx} cy={TURKEY.body.cy} rx={TURKEY.body.rx} ry={TURKEY.body.ry} fill="url(#turkeyBody)" />
              <Ellipse cx={TURKEY.belly.cx} cy={TURKEY.belly.cy} rx={TURKEY.belly.rx} ry={TURKEY.belly.ry} fill={C.belly} opacity={0.55} />
              {TURKEY.wings.map((d, i) => <Path key={i} d={d} fill={C.wing} />)}
            </Svg>
            {/* the head turns about its centre while it gobbles */}
            <Animated.View style={{ position: 'absolute', left: (HD.cx - 60) * k, top: (HD.cy - 60) * k, width: 120 * k, height: 120 * k, transform: [{ translateX: headShift }, { rotate: headTurn }] }}>
              <Svg width={120 * k} height={120 * k} viewBox={`${HD.cx - 60} ${HD.cy - 60} 120 120`}>
                <Circle cx={HD.cx} cy={HD.cy} r={HD.r} fill={C.head} />
                {TURKEY.eyes.map((e, i) => <Circle key={`w${i}`} cx={e.cx} cy={e.cy} r={12} fill="#fff" />)}
                {TURKEY.eyes.map((e, i) => <Circle key={`p${i}`} cx={e.cx + (e.cx < HD.cx ? 2 : -2)} cy={e.cy + 2} r={6} fill="#1c1917" />)}
                <Path d={TURKEY.wattle} fill={C.wattle} />
                <Path d={TURKEY.beak} fill={C.beak} />
              </Svg>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.flood, opacity: flood }]} pointerEvents="none" />
    </IntroFrame>
  );
}

const st = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
