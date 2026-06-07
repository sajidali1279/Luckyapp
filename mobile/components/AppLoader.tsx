import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, StatusBar, Easing, Image } from 'react-native';

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

        {/* ── Animated logo ── */}
        <Animated.View style={{ transform: [{ translateY: bobAnim }] }}>
          <Animated.View style={{ transform: [{ scale: glowScale }], opacity: glowOpacity }}>
            <Image
              source={require('../assets/store-icon-512.png')}
              style={{ width: 148, height: 148, borderRadius: 34 }}
            />
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
