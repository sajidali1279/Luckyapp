import { useRef, type ReactNode } from 'react';
import { Animated, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { MAX_FONT_SCALE } from './ScaledText';

// The iPhone "large title": a big bold title under a slim bar, which shrinks into a small centered title in that bar as the list
// scrolls (Settings, Mail, App Store). A brand-colored band by default, or a plain light one. A screen passes the scroll position
// from useLargeTitleScroll() to both this header and its list.
const TITLE = 52;   // the large-title row at rest
const SUB = 22;     // room for an optional subtitle under it
const SUB2 = 38;    // ... when it needs two lines
const BAR = 44;     // the slim bar, always there (iOS standard height)

export function useLargeTitleScroll() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useRef(Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })).current;
  return { scrollY, onScroll, scrollEventThrottle: 16 as const };
}

export default function LargeTitleHeader({
  title, subtitle, scrollY, color = COLORS.secondary, tone = 'brand', icon, left, right, children,
}: {
  title: string;
  subtitle?: string;
  scrollY: Animated.Value;
  color?: string;
  tone?: 'brand' | 'plain';
  icon?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const plain = tone === 'plain';
  const ink = plain ? COLORS.text : '#fff';
  const twoLines = !!subtitle && subtitle.length > 40;
  const large = TITLE + (subtitle ? (twoLines ? SUB2 : SUB) : 0);
  const clamp = 'clamp' as const;
  const largeHeight = scrollY.interpolate({ inputRange: [0, large], outputRange: [large, 0], extrapolate: clamp });
  const largeOpacity = scrollY.interpolate({ inputRange: [0, large * 0.6], outputRange: [1, 0], extrapolate: clamp });
  const smallOpacity = scrollY.interpolate({ inputRange: [large * 0.55, large], outputRange: [0, 1], extrapolate: clamp });
  const hairline = scrollY.interpolate({ inputRange: [large * 0.8, large], outputRange: [0, 1], extrapolate: clamp });
  return (
    <SafeAreaView style={{ backgroundColor: plain ? COLORS.background : color }} edges={['top']}>
      <StatusBar barStyle={plain ? 'dark-content' : 'light-content'} />
      <View style={s.bar}>
        <View style={s.side}>{left}</View>
        <Animated.Text style={[s.smallTitle, { color: ink, opacity: smallOpacity }]} numberOfLines={1} maxFontSizeMultiplier={1.2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {title}
        </Animated.Text>
        <View style={[s.side, { justifyContent: 'flex-end' }]}>{right}</View>
      </View>
      <Animated.View style={{ height: largeHeight, opacity: largeOpacity, overflow: 'hidden' }}>
        <View style={s.largeRow}>
          {icon}
          <Animated.Text style={[s.largeTitle, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header">
            {title}
          </Animated.Text>
        </View>
        {subtitle ? (
          <Animated.Text style={[s.subtitle, { height: twoLines ? SUB2 : SUB, color: plain ? COLORS.textMuted : 'rgba(255,255,255,0.72)' }]} numberOfLines={twoLines ? 2 : 1} maxFontSizeMultiplier={1.2}>
            {subtitle}
          </Animated.Text>
        ) : null}
      </Animated.View>
      {children}
      {plain && <Animated.View style={[s.hairline, { opacity: hairline }]} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bar: { height: BAR, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  side: { minWidth: 72, flexDirection: 'row', alignItems: 'center' },
  smallTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  largeRow: { height: TITLE, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  largeTitle: { flex: 1, fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 20, marginTop: -6 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
});
