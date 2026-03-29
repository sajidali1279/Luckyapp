import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, StatusBar } from 'react-native';
import { COLORS } from '../constants';

export default function AppLoader() {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const dot1      = useRef(new Animated.Value(0.3)).current;
  const dot2      = useRef(new Animated.Value(0.3)).current;
  const dot3      = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Fade + scale in
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();

    // Bouncing dots
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1,   duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      ).start();

    pulse(dot1, 0);
    pulse(dot2, 200);
    pulse(dot3, 400);
  }, []);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>

        {/* Logo card */}
        <View style={s.logoCard}>
          <Text style={s.logoEmoji}>⛽</Text>
        </View>

        <Text style={s.title}>Lucky Stop</Text>
        <Text style={s.subtitle}>Rewards & Loyalty</Text>

        {/* Bouncing dots */}
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
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  content: {
    alignItems: 'center',
    gap: 12,
  },
  logoCard: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoEmoji: { fontSize: 48 },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
});
