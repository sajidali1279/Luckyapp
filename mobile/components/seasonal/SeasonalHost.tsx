// Wraps the customer's Home. While HQ's seasonal theme is on (and its opening is switched on), the first time a phone opens Home each
// day the theme's opening plays over it, and the dashboard pops out at the end. Otherwise this is just a plain full-screen View.
// Halloween (2026-10-21): the jack-o'-lantern. Thanksgiving, Christmas and Game day (2026-10-25): the turkey, the gift, the field goal.
import { ComponentType, ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAppTheme } from '../../hooks/useAppTheme';
import PumpkinIntro from '../halloween/PumpkinIntro';
import TurkeyIntro from './TurkeyIntro';
import GiftIntro from './GiftIntro';
import KickoffIntro from './KickoffIntro';

type Intro = ComponentType<{ onPop: () => void; onDone: () => void }>;
/** Each preset's opening. One this version does not know (added by HQ after this build) plays nothing. */
const INTROS: Record<string, Intro | undefined> = { HALLOWEEN: PumpkinIntro, THANKSGIVING: TurkeyIntro, CHRISTMAS: GiftIntro, GAME_DAY: KickoffIntro };

const APP_START = Date.now();
const KEY = 'theme_intro_played';
const COLD_START_MS = 3300;   // the app's own loading screen (about 1.2 s after sign-in is read) is gone by then

export default function SeasonalHost({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  const [playing, setPlaying] = useState<Intro | null>(null);
  const decided = useRef(false);
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Wait for the server's answer: the one kept on the phone has yesterday's date, and deciding on it meant the opening played on the
    // first day only (it looked "already played today" and was never looked at again)
    const intro = INTROS[theme.preset];
    if (decided.current || !theme.settled || !intro || !theme.intro) return;
    decided.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [reduce, last] = await Promise.all([AccessibilityInfo.isReduceMotionEnabled(), SecureStore.getItemAsync(KEY)]);
        const stamp = `${theme.preset}:${theme.today}`;
        if (reduce || last === stamp) return;   // reduced motion: never; already played today on this phone: not again
        await SecureStore.setItemAsync(KEY, stamp).catch(() => {});
        const wait = Math.max(150, COLD_START_MS - (Date.now() - APP_START));
        setTimeout(() => { if (!cancelled) { pop.setValue(0.8); setPlaying(() => intro); } }, wait);
      } catch { /* the animation is a treat, never a reason to fail */ }
    })();
    return () => { cancelled = true; };
  }, [theme.preset, theme.intro, theme.today, theme.settled]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onPop = () => Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  const Playing = playing;

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ flex: 1, transform: [{ scale: pop }] }}>{children}</Animated.View>
      {Playing && <Playing onPop={onPop} onDone={() => setPlaying(null)} />}
    </View>
  );
}
