import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';

interface SkeletonBoxProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonBoxProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.75] });

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius, backgroundColor: '#DEE2E6', opacity }, style]}
    />
  );
}

export function SkeletonOfferCard() {
  return (
    <View style={sk.card}>
      <SkeletonBox width={84} height={84} borderRadius={0} />
      <View style={sk.content}>
        <SkeletonBox width="75%" height={14} borderRadius={6} />
        <SkeletonBox width="90%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
        <SkeletonBox width="90%" height={12} borderRadius={6} style={{ marginTop: 4 }} />
        <SkeletonBox width="50%" height={22} borderRadius={8} style={{ marginTop: 10 }} />
      </View>
    </View>
  );
}

export function SkeletonBannerCard() {
  return <SkeletonBox width="100%" height={190} borderRadius={20} />;
}

export function SkeletonGasPriceCard() {
  return (
    <View style={sk.gasCard}>
      <SkeletonBox width="70%" height={13} borderRadius={6} />
      <SkeletonBox width="100%" height={16} borderRadius={6} style={{ marginTop: 10 }} />
      <SkeletonBox width="80%" height={16} borderRadius={6} style={{ marginTop: 6 }} />
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 10,
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 0,
  },
  gasCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 14,
    width: 150,
  },
});
