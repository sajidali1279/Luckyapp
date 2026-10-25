// The Game day opening (2026-10-25), for the big football weekend: under the stadium lights the ball sits at the bottom, is kicked and
// tumbles away through the goal posts, the posts and lights flash, confetti flies, and the camera flies through the posts: white light
// floods the screen and the dashboard pops out. No team, league or game name anywhere. Drawn with react-native-svg and Animated only.
// Tap anywhere to skip.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Line, Circle, Path } from 'react-native-svg';
import { FIELD, FIELD_BOX, BALL, BALL_BOX, CONFETTI, COLORS_GAME_DAY as C } from './art';
import { IntroFrame, T, buzz, useIntro, type IntroProps } from './introKit';

const ZOOM = 10;   // how far the camera flies through the posts
const PIECES = Array.from({ length: 24 }, (_, i) => ({ angle: (i / 24) * Math.PI * 2 + (i % 2 ? 0.2 : 0), dist: 110 + (i % 4) * 30, color: CONFETTI[i % CONFETTI.length], spin: i % 2 ? 540 : -540 }));

export default function KickoffIntro(props: IntroProps) {
  const { width, height } = useWindowDimensions();
  const W = Math.min(width, 420);
  const k = W / FIELD_BOX.w;
  const H = FIELD_BOX.h * k;
  const boxTop = (height - H) / 2;
  const { goal: G, ballStart: B } = FIELD;
  const goalDy = (G.y - FIELD_BOX.h / 2) * k;   // the posts' gap above the drawing's centre
  const { fade, later, run, skip, pop } = useIntro(props);

  const enter = useRef(new Animated.Value(0)).current;
  const kick = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    run(Animated.sequence([
      // the lights come up on the field
      T(enter, 1, 500, Easing.out(Easing.quad)),
      Animated.delay(150),
      // the kick: the ball squashes, then tumbles away towards the posts
      T(kick, 1, 110, Easing.out(Easing.quad)),
      Animated.parallel([T(kick, 0, 140), T(fly, 1, 950, Easing.out(Easing.quad))]),
      // it is good: the posts and the lights flash, confetti flies
      Animated.parallel([Animated.sequence([T(flash, 1, 160, Easing.out(Easing.quad)), T(flash, 0.35, 420)]), T(burst, 1, 900, Easing.out(Easing.quad))]),
      Animated.delay(100),
      // flies through the posts: white light floods the screen, then the overlay lets go
      Animated.parallel([
        T(zoom, 1, 1000, Easing.in(Easing.cubic)),
        Animated.sequence([Animated.delay(620), T(fade, 0, 420, Easing.linear)]),
      ]),
    ]));
    later(650, () => buzz('medium'));   // the kick
    later(1710, () => buzz('heavy'));   // it is good
    later(1910, () => buzz('light'));
    later(2110, () => buzz('light'));
    later(1710 + 900 + 100 + 560, () => { pop(); buzz('medium'); });   // the dashboard starts to pop as the light floods in
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const scale = zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ZOOM] });
  const moveY = zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -goalDy * ZOOM] });
  const flood = zoom.interpolate({ inputRange: [0.06, 0.35], outputRange: [0, 1], extrapolate: 'clamp' });   // early: the zoom eases in, and the overlay fades from 620 ms

  return (
    <IntroFrame fade={fade} onSkip={skip} background={C.night} skipColor={C.skip}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: enter, transform: [{ translateY: moveY }, { scale }] }]} pointerEvents="none">
        {/* the grass runs on below the drawing to the bottom of the screen */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: boxTop + FIELD.horizon * k, bottom: 0, backgroundColor: C.fieldBottom }} />
        <View style={{ position: 'absolute', left: (width - W) / 2, top: boxTop, width: W, height: H }}>
          {/* the stadium lights, brighter when the kick is good */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]}>
            <Svg width={W} height={H} viewBox={`0 0 ${FIELD_BOX.w} ${FIELD_BOX.h}`}>
              <Defs>
                <RadialGradient id="stadiumLight" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={C.light} stopOpacity={1} />
                  <Stop offset="1" stopColor={C.light} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              {FIELD.lights.map((l, i) => <Circle key={i} cx={l.cx} cy={l.cy} r={96} fill="url(#stadiumLight)" />)}
            </Svg>
          </Animated.View>
          {/* the field, its lines and the posts */}
          <Svg width={W} height={H} viewBox={`0 0 ${FIELD_BOX.w} ${FIELD_BOX.h}`} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="field" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.fieldTop} />
                <Stop offset="1" stopColor={C.fieldBottom} />
              </LinearGradient>
            </Defs>
            <Rect x={-200} y={FIELD.horizon} width={FIELD_BOX.w + 400} height={FIELD_BOX.h - FIELD.horizon} fill="url(#field)" />
            {FIELD.yardLines.map((y) => <Line key={y} x1={-200} y1={y} x2={FIELD_BOX.w + 200} y2={y} stroke={C.line} strokeWidth={1 + (y - FIELD.horizon) / 90} opacity={0.3} />)}
            <Path d={FIELD.sidelines} stroke={C.line} strokeWidth={3} opacity={0.45} />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }) }]}>
            <Svg width={W} height={H} viewBox={`0 0 ${FIELD_BOX.w} ${FIELD_BOX.h}`}>
              <Path d={FIELD.posts} stroke={C.postGlow} strokeWidth={18} fill="none" strokeLinecap="round" />
            </Svg>
          </Animated.View>
          <Svg width={W} height={H} viewBox={`0 0 ${FIELD_BOX.w} ${FIELD_BOX.h}`} style={StyleSheet.absoluteFill}>
            <Path d={FIELD.posts} stroke={C.post} strokeWidth={7} fill="none" strokeLinecap="round" />
          </Svg>
          {/* the ball: squashed by the kick, then away it tumbles, smaller and smaller, through the gap */}
          <Animated.View style={{
            position: 'absolute', left: (B.x - BALL_BOX.w / 2) * k, top: (B.y - BALL_BOX.h / 2) * k, width: BALL_BOX.w * k, height: BALL_BOX.h * k,
            opacity: fly.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, (G.y - B.y) * k] }) },
              { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0.14] }) },
              { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '875deg'] }) },
              { scaleX: kick.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
              { scaleY: kick.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
            ],
          }}>
            <Svg width={BALL_BOX.w * k} height={BALL_BOX.h * k} viewBox={`0 0 ${BALL_BOX.w} ${BALL_BOX.h}`}>
              <Defs>
                <LinearGradient id="ball" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={C.ballLight} />
                  <Stop offset="1" stopColor={C.ballDark} />
                </LinearGradient>
              </Defs>
              <Path d={BALL.body} fill="url(#ball)" />
              <Path d={BALL.stripes} stroke={C.laces} strokeWidth={5} fill="none" />
              <Path d={BALL.laces} stroke={C.laces} strokeWidth={3.5} fill="none" strokeLinecap="round" />
            </Svg>
          </Animated.View>
          {/* confetti bursts out of the posts and falls */}
          {PIECES.map((c, i) => (
            <Animated.View key={i} style={{
              position: 'absolute', left: (G.x - 4) * k, top: (G.y - 7) * k, width: 8 * k, height: 14 * k, backgroundColor: c.color, borderRadius: 1.5,
              opacity: burst.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: burst.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, Math.cos(c.angle) * c.dist * k, Math.cos(c.angle) * c.dist * 1.15 * k] }) },
                { translateY: burst.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, Math.sin(c.angle) * c.dist * k, (Math.sin(c.angle) * c.dist + 140) * k] }) },
                { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${c.spin}deg`] }) },
              ],
            }} />
          ))}
        </View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.flood, opacity: flood }]} pointerEvents="none" />
    </IntroFrame>
  );
}
