// The Christmas opening (2026-10-25): snow falls on a dark night, a gift box drops in and bounces, shakes twice as if something inside wants
// out, then its lid pops off, light and sparkles pour out, and the camera falls into the box: the light floods the screen and the dashboard
// pops out. Drawn with react-native-svg and Animated only. Tap anywhere to skip.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Ellipse, Path } from 'react-native-svg';
import { GIFT, GIFT_BOX, SPARKLE, COLORS_CHRISTMAS as C } from './art';
import { IntroFrame, T, buzz, useIntro, type IntroProps } from './introKit';

const ZOOM = 12;   // how far the camera falls into the box
const FLAKES = Array.from({ length: 16 }, (_, i) => ({ left: (i * 37) % 100, r: 1.5 + (i % 3), phase: (i * 0.137) % 1, drift: (i % 2 ? 1 : -1) * (6 + (i % 4) * 3) }));
const SPARKS = Array.from({ length: 10 }, (_, i) => ({ angle: ((-160 + i * (140 / 9)) * Math.PI) / 180, dist: 90 + (i % 3) * 40, size: i % 2 ? 1.4 : 0.8 }));
const GLOW = { w: 380, h: 300 };

export default function GiftIntro(props: IntroProps) {
  const { width, height } = useWindowDimensions();
  const W = Math.min(width * 0.88, 400);
  const k = W / GIFT_BOX.w;
  const H = GIFT_BOX.h * k;
  const { box, lid: LID, ribbonV: RV, ribbonH: RH, knot, opening: O } = GIFT;
  const openDy = (O.y - GIFT_BOX.h / 2) * k;   // the box's opening below the drawing's centre
  const { fade, later, run, skip, pop } = useIntro(props);

  const enter = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const wiggle = useRef(new Animated.Value(0)).current;
  const lid = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const snow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const falling = Animated.loop(Animated.timing(snow, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true }));
    falling.start();
    const shake = () => Animated.sequence([
      T(hop, 1, 110, Easing.out(Easing.quad)),
      Animated.parallel([T(hop, 0, 180, Easing.bounce), Animated.sequence([T(wiggle, 1, 60), T(wiggle, -1, 60), T(wiggle, 0, 60)])]),
    ]);
    run(Animated.sequence([
      // drops in and bounces
      T(enter, 1, 700, Easing.bounce),
      Animated.delay(120),
      // shakes twice: something inside wants out
      shake(),
      Animated.delay(140),
      shake(),
      Animated.delay(120),
      // the lid pops off, the light and the sparkles pour out
      Animated.parallel([T(lid, 1, 520, Easing.out(Easing.cubic)), T(glow, 1, 420, Easing.out(Easing.quad)), T(burst, 1, 900, Easing.out(Easing.quad))]),
      Animated.delay(150),
      // falls into the box: the light floods the screen, then the overlay lets go
      Animated.parallel([
        T(zoom, 1, 1000, Easing.in(Easing.cubic)),
        Animated.sequence([Animated.delay(620), T(fade, 0, 420, Easing.linear)]),
      ]),
    ]));
    later(260, () => buzz('light'));   // lands
    later(820 + 110 + 80, () => buzz('light'));   // first shake
    later(1250 + 110 + 80, () => buzz('light'));   // second shake
    later(1660, () => buzz('heavy'));   // the lid pops
    later(1660 + 900 + 150 + 560, () => { pop(); buzz('medium'); });   // the dashboard starts to pop as the light floods in
    return () => falling.stop();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ZOOM] });
  const moveY = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -openDy * ZOOM] });
  const drop = enter.interpolate({ inputRange: [0, 1], outputRange: [-220 * k, 0] });
  const lift = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -16 * k] });
  const tilt = wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] });
  const flood = zoom.interpolate({ inputRange: [0.06, 0.35], outputRange: [0, 1], extrapolate: 'clamp' });   // early: the zoom eases in, and the overlay fades from 620 ms

  return (
    <IntroFrame fade={fade} onSkip={skip} background={C.night} skipColor={C.skip}>
      {/* the snow, behind everything */}
      {FLAKES.map((f, i) => {
        const p = Animated.modulo(Animated.add(snow, f.phase), 1);
        return (
          <Animated.View key={i} pointerEvents="none" style={{
            position: 'absolute', left: `${f.left}%` as `${number}%`, top: 0, width: f.r * 2, height: f.r * 2, borderRadius: f.r, backgroundColor: C.snow, opacity: 0.75,
            transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-10, height + 10] }) }, { translateX: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, f.drift, 0] }) }],
          }} />
        );
      })}
      <View style={st.center} pointerEvents="none">
        <Animated.View style={{ width: W, height: H, opacity: enter.interpolate({ inputRange: [0, 0.15], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateY: moveY }, { scale }, { translateY: drop }, { translateY: lift }, { rotate: tilt }] }}>
          {/* the light, behind the box so it seems to pour up out of it */}
          <Animated.View style={{ position: 'absolute', left: (O.x - GLOW.w / 2) * k, top: (O.y - GLOW.h / 2) * k, width: GLOW.w * k, height: GLOW.h * k, opacity: glow,
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.4] }) }] }}>
            <Svg width={GLOW.w * k} height={GLOW.h * k} viewBox={`0 0 ${GLOW.w} ${GLOW.h}`}>
              <Defs>
                <RadialGradient id="giftGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={C.glow} stopOpacity={1} />
                  <Stop offset="0.55" stopColor={C.glow} stopOpacity={0.55} />
                  <Stop offset="1" stopColor={C.glow} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse cx={GLOW.w / 2} cy={GLOW.h / 2} rx={GLOW.w / 2} ry={GLOW.h / 2} fill="url(#giftGlow)" />
            </Svg>
          </Animated.View>
          {/* the box and its ribbons */}
          <Svg width={W} height={H} viewBox={`0 0 ${GIFT_BOX.w} ${GIFT_BOX.h}`} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="giftBox" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.boxLight} />
                <Stop offset="1" stopColor={C.boxDark} />
              </LinearGradient>
            </Defs>
            <Rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.r} fill="url(#giftBox)" />
            <Rect x={RV.x} y={box.y} width={RV.w} height={box.h} fill={C.ribbon} />
            <Rect x={box.x} y={RH.y} width={box.w} height={RH.h} fill={C.ribbon} />
          </Svg>
          {/* the lid and the bow fly off together */}
          <Animated.View style={[StyleSheet.absoluteFill, {
            opacity: lid.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -40 * k] }) },
              { translateY: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -260 * k] }) },
              { rotate: lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-30deg'] }) },
            ],
          }]}>
            <Svg width={W} height={H} viewBox={`0 0 ${GIFT_BOX.w} ${GIFT_BOX.h}`}>
              <Defs>
                <LinearGradient id="giftLid" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={C.lidLight} />
                  <Stop offset="1" stopColor={C.lidDark} />
                </LinearGradient>
              </Defs>
              <Rect x={LID.x} y={LID.y} width={LID.w} height={LID.h} rx={LID.r} fill="url(#giftLid)" />
              <Rect x={RV.x} y={LID.y} width={RV.w} height={LID.h} fill={C.ribbon} />
              {GIFT.bowTails.map((d, i) => <Path key={`t${i}`} d={d} fill={C.ribbonDark} />)}
              {GIFT.bowLoops.map((d, i) => <Path key={`l${i}`} d={d} fill={C.ribbon} />)}
              {GIFT.bowInner.map((d, i) => <Path key={`n${i}`} d={d} fill={C.ribbonDark} />)}
              <Ellipse cx={knot.cx} cy={knot.cy} rx={knot.rx} ry={knot.ry} fill={C.knot} />
            </Svg>
          </Animated.View>
          {/* sparkles shoot up out of the box */}
          {SPARKS.map((s, i) => (
            <Animated.View key={i} style={{
              position: 'absolute', left: O.x * k - 12, top: O.y * k - 12, width: 24, height: 24,
              opacity: burst.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(s.angle) * s.dist * k] }) },
                { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(s.angle) * s.dist * k] }) },
                { scale: s.size },
                { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) },
              ],
            }}>
              <Svg width={24} height={24} viewBox="-12 -12 24 24"><Path d={SPARKLE} fill={C.sparkle} /></Svg>
            </Animated.View>
          ))}
        </Animated.View>
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.flood, opacity: flood }]} pointerEvents="none" />
    </IntroFrame>
  );
}

const st = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
