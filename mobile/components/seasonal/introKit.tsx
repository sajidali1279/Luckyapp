// What every seasonal opening shares (2026-10-25): the full-screen overlay with "Tap to skip", the timers and the buzzes, and the promise
// that the dashboard pops back to full size however the opening ends (played out, skipped, or cut short). Halloween's PumpkinIntro came
// first and keeps its own copy.
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Text } from '../ScaledText';

export type IntroProps = { onPop: () => void; onDone: () => void };

export const T = (v: Animated.Value, to: number, ms: number, easing: (n: number) => number = Easing.inOut(Easing.quad)) =>
  Animated.timing(v, { toValue: to, duration: ms, easing, useNativeDriver: true });

export function buzz(kind: 'light' | 'medium' | 'heavy') {
  try {
    Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  } catch { /* no haptics on this phone */ }
}

/** Runs one opening: run(animation) starts it, later(ms, fn) times the buzzes and the pop, skip() ends it early. */
export function useIntro({ onPop, onDone }: IntroProps) {
  const fade = useRef(new Animated.Value(1)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const popped = useRef(false);
  const finished = useRef(false);
  const pop = () => { if (!popped.current) { popped.current = true; onPop(); } };
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    pop();
    onDone();
  };
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const run = (a: Animated.CompositeAnimation) => { running.current = a; a.start(({ finished: ok }) => { if (ok) finish(); }); };
  const skip = () => {
    if (finished.current) return;
    running.current?.stop();
    timers.current.forEach(clearTimeout);
    pop();
    Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => finish());
  };
  useEffect(() => () => { running.current?.stop(); timers.current.forEach(clearTimeout); }, []);
  return { fade, later, run, skip, pop };
}

/** The overlay: a full-screen colour, the drawing on top, and "Tap to skip" (a tap anywhere skips). */
export function IntroFrame({ fade, onSkip, background, skipColor, children }: { fade: Animated.Value; onSkip: () => void; background: string; skipColor: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st.overlay, { opacity: fade }]} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={onSkip} accessibilityRole="button" accessibilityLabel={t('seasonal.skip')}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} />
        {children}
        <Text style={[st.skip, { color: skipColor }]} maxFontSizeMultiplier={1.1}>{t('seasonal.skip')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  overlay: { zIndex: 9999, elevation: 9999 },
  skip: { position: 'absolute', bottom: 48, alignSelf: 'center', opacity: 0.55, fontSize: 13, fontWeight: '600' },
});
