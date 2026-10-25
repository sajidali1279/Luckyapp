// A ring that fills to `progress` (0 to 1), with whatever you put inside it in the middle. Used for "X points to your next reward".
// With Reduce Motion on it simply draws at the final size.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReduceMotion } from '../utils/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ProgressRing({ size = 84, stroke = 9, progress, color, track = '#E8ECF1', children }: {
  size?: number; stroke?: number; progress: number; color: string; track?: string; children?: ReactNode;
}) {
  const reduce = useReduceMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, progress));
  const v = useRef(new Animated.Value(reduce ? target : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(target); return; }
    Animated.timing(v, { toValue: target, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, reduce, v]);
  const offset = v.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={offset as any} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}
