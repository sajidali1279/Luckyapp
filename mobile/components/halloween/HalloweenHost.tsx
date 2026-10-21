// Wraps the customer's Home. While the Halloween theme is on (and its opening is switched on), the first time a phone opens Home each
// day the jack-o'-lantern plays over it, and the dashboard pops out of its mouth. Otherwise this is just a plain full-screen View.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAppTheme } from '../../hooks/useAppTheme';
import PumpkinIntro from './PumpkinIntro';

const APP_START = Date.now();
const KEY = 'theme_intro_played';
const COLD_START_MS = 3300;   // the app's own loading screen (about 1.2 s after sign-in is read) is gone by then

export default function HalloweenHost({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const [playing, setPlaying] = useState(false);
  const decided = useRef(false);
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (decided.current || theme.preset !== 'HALLOWEEN' || !theme.intro) return;
    decided.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [reduce, last] = await Promise.all([AccessibilityInfo.isReduceMotionEnabled(), SecureStore.getItemAsync(KEY)]);
        const stamp = `${theme.preset}:${theme.today}`;
        if (reduce || last === stamp) return;   // reduced motion: never; already played today on this phone: not again
        await SecureStore.setItemAsync(KEY, stamp).catch(() => {});
        const wait = Math.max(150, COLD_START_MS - (Date.now() - APP_START));
        setTimeout(() => { if (!cancelled) { pop.setValue(0.8); setPlaying(true); } }, wait);
      } catch { /* the animation is a treat, never a reason to fail */ }
    })();
    return () => { cancelled = true; };
  }, [theme.preset, theme.intro, theme.today]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onPop = () => Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ flex: 1, transform: [{ scale: pop }] }}>{children}</Animated.View>
      {playing && <PumpkinIntro onPop={onPop} onDone={() => setPlaying(false)} />}
    </View>
  );
}
