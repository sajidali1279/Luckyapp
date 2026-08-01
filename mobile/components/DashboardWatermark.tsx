import { memo, useRef, useEffect } from 'react';
import { View, Animated, Easing, StyleSheet, ViewStyle } from 'react-native';
import { StarIcon, TagIcon, GiftIcon, PercentIcon } from './Icons';

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number; filled?: boolean }>;

type Item = {
  Icon: IconComponent;
  size: number;
  filled?: boolean;
  duration: number;
  driftRange: number;
  reverse?: boolean;
  position: ViewStyle;
};

const ITEMS: Item[] = [
  { Icon: StarIcon,   size: 220, filled: true, duration: 40000, driftRange: 16, position: { top: '9%',  left: '14%' } },
  { Icon: TagIcon,    size: 140, duration: 34000, driftRange: 20, reverse: true,  position: { top: '28%', right: '6%' } },
  { Icon: GiftIcon,   size: 170, duration: 47000, driftRange: 14, position: { top: '55%', left: '2%' } },
  { Icon: PercentIcon, size: 130, duration: 38000, driftRange: 18, reverse: true, position: { top: '76%', right: '12%' } },
];

const FloatingIcon = memo(function FloatingIcon({ item, color }: { item: Item; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: item.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
    ).start();
  }, [anim, item.duration]);

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: item.reverse ? ['360deg', '0deg'] : ['0deg', '360deg'],
  });
  const drift = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-item.driftRange, item.driftRange, -item.driftRange],
  });

  return (
    <Animated.View style={[styles.item, item.position, { transform: [{ rotate }, { translateY: drift }] }]}>
      <item.Icon size={item.size} color={color} strokeWidth={0.75} filled={item.filled} />
    </Animated.View>
  );
});

/** A few large, very-faint brand icons that slowly rotate and drift behind a
 * dashboard's content — a shared ambient background used across the
 * Customer, Employee, and Manager home screens. */
const DashboardWatermark = memo(function DashboardWatermark({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={styles.opacityLayer}>
        {ITEMS.map((item, i) => (
          <FloatingIcon key={i} item={item} color={color} />
        ))}
      </View>
    </View>
  );
});

export default DashboardWatermark;

const styles = StyleSheet.create({
  opacityLayer: { flex: 1, opacity: 0.045 },
  item: { position: 'absolute' },
});
