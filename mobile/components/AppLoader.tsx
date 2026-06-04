import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, StatusBar, Easing } from 'react-native';
import Svg, { Polygon, Circle, Path, G } from 'react-native-svg';

// Colors extracted from the physical Lucky Stop sign
const SIGN_RED       = '#CC2936';
const SIGN_RED_DARK  = '#8B1520';
const SIGN_RED_GLOW  = '#E8404D';
const WHITE          = '#FFFFFF';
const NAVY           = '#1D3557';

export default function AppLoader() {
  const scaleAnim   = useRef(new Animated.Value(0.55)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim    = useRef(new Animated.Value(0)).current;
  const bobAnim     = useRef(new Animated.Value(0)).current;
  const dot1        = useRef(new Animated.Value(0.2)).current;
  const dot2        = useRef(new Animated.Value(0.2)).current;
  const dot3        = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    // Entrance: spring scale + fade
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 85, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      // Glow pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
      // Gentle bob
      Animated.loop(
        Animated.sequence([
          Animated.timing(bobAnim, { toValue: -7, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(bobAnim, { toValue:  0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    });

    // Loading dots
    const pulseDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1,   duration: 340, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.2, duration: 340, useNativeDriver: true }),
          Animated.delay(Math.max(0, 680 - delay)),
        ])
      ).start();

    pulseDot(dot1,   0);
    pulseDot(dot2, 190);
    pulseDot(dot3, 380);
  }, []);

  const glowScale   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      <Animated.View style={[s.inner, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>

        {/* ── Animated hexagon logo ── */}
        <Animated.View style={{ transform: [{ translateY: bobAnim }] }}>
          <Animated.View style={{ transform: [{ scale: glowScale }], opacity: glowOpacity }}>
            <Svg width={148} height={148} viewBox="0 0 100 100">

              {/* Outer glow halo */}
              <Polygon
                points="50,1 97,25.5 97,74.5 50,99 3,74.5 3,25.5"
                fill={SIGN_RED_GLOW}
                opacity={0.18}
              />

              {/* Main hexagon body */}
              <Polygon
                points="50,7 91,30.5 91,69.5 50,93 9,69.5 9,30.5"
                fill={SIGN_RED}
              />

              {/* Bevel — darker bottom-right edges */}
              <Polygon
                points="50,7 91,30.5 91,69.5 50,93 9,69.5 9,30.5"
                fill="none"
                stroke={SIGN_RED_DARK}
                strokeWidth="2"
                opacity={0.5}
              />

              {/* Inner white ring */}
              <Polygon
                points="50,14 84,33.5 84,66.5 50,86 16,66.5 16,33.5"
                fill="none"
                stroke={WHITE}
                strokeWidth="2.5"
                opacity={0.9}
              />

              {/* ── Car silhouette (side view) ── */}
              <G>
                {/* Car body */}
                <Path
                  d="M20,65 L20,54 L27,42 L36,34 L58,34 L71,42 L80,54 L80,65 Z"
                  fill={WHITE}
                />
                {/* Window / cabin */}
                <Path
                  d="M30,53 L35,42 L58,42 L68,53 Z"
                  fill={SIGN_RED}
                  opacity={0.88}
                />
                {/* Front wheel arch cutout */}
                <Circle cx="32" cy="65" r="10" fill={SIGN_RED} />
                {/* Rear wheel arch cutout */}
                <Circle cx="68" cy="65" r="10" fill={SIGN_RED} />
                {/* Front tyre */}
                <Circle cx="32" cy="65" r="7.5" fill={SIGN_RED_DARK} />
                {/* Rear tyre */}
                <Circle cx="68" cy="65" r="7.5" fill={SIGN_RED_DARK} />
                {/* Front hub */}
                <Circle cx="32" cy="65" r="3" fill={WHITE} />
                {/* Rear hub */}
                <Circle cx="68" cy="65" r="3" fill={WHITE} />
                {/* Headlight */}
                <Circle cx="78" cy="51" r="2.5" fill={WHITE} opacity={0.9} />
                {/* Tail light */}
                <Circle cx="22" cy="51" r="2.5" fill={SIGN_RED_GLOW} opacity={0.9} />
              </G>

            </Svg>
          </Animated.View>
        </Animated.View>

        {/* Text */}
        <Text style={s.title}>Lucky Stop</Text>
        <Text style={s.subtitle}>Rewards & Loyalty</Text>

        {/* Loading dots */}
        <View style={s.dots}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[s.dot, { opacity: dot }]} />
          ))}
        </View>

      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  inner: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: WHITE,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SIGN_RED_GLOW,
  },
});
