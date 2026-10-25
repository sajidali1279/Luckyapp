// A short burst of coins and sparkles over its parent when `fire` changes (a check-in just paid). Draws nothing at rest, never takes touches,
// and is skipped entirely with Reduce Motion on.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from '../ScaledText';
import { useReduceMotion } from '../../utils/motion';

const PIECES = ['🪙', '✨', '🪙', '⭐', '🪙', '✨', '🪙', '⭐', '🪙', '✨', '🪙', '⭐'];

export default function Burst({ fire, pieces = PIECES }: { fire: number; pieces?: string[] }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!fire || reduce) return;
    setOn(true);
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => setOn(false));
  }, [fire, reduce, t]);
  if (!on) return null;
  return (
    <View pointerEvents="none" style={s.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pieces.map((p, i) => {
        const angle = (i / pieces.length) * Math.PI * 2 + (i % 2 ? 0.25 : 0);
        const dist = 70 + (i % 3) * 22;
        return (
          <Animated.View key={i} style={{
            position: 'absolute',
            opacity: t.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
              { translateY: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, Math.sin(angle) * dist, Math.sin(angle) * dist + 26] }) },
              { scale: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.15, 0.8] }) },
            ],
          }}>
            <Text style={s.piece}>{p}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  piece: { fontSize: 20 },
});
