import { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '../constants';

export default function PulseHighlight({
  active,
  children,
  style,
}: {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false, // borderColor/shadowOpacity aren't supported by the native driver
    });
    anim.start();
    return () => anim.stop();
  }, [active]);

  if (!active) return <>{children}</>;

  const shadowOpacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] });
  const borderColor = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: ['rgba(0,0,0,0)', COLORS.accent, 'rgba(0,0,0,0)'] });

  return (
    <Animated.View
      style={[
        style,
        {
          borderWidth: 2,
          borderColor,
          borderRadius: 16,
          shadowColor: COLORS.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity,
          shadowRadius: 10,
          elevation: 4,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
