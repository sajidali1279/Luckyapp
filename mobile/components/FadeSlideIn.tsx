import { useEffect, useRef } from 'react';
import { Animated, StyleProp, View, ViewStyle } from 'react-native';
import { useReduceMotion } from '../utils/motion';

export default function FadeSlideIn({
  children,
  delay = 0,
  distance = 10,
  duration = 320,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduceMotion]);

  if (reduceMotion) return <View style={style}>{children}</View>;   // Reduce Motion: just appear

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
          }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
