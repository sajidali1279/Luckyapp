// A screen's repeating check, only while that screen is the one shown (2026-10-31). The app's screens are tabs, and a tab stays mounted
// after you leave it, so its checks (orders every 15 seconds, chat every 8) kept running behind every other screen. Use it as
// `refetchInterval: usePoll(15_000)`, at the top of the component like any hook. The badge counts in the layouts keep their own
// intervals on purpose (the bar and the menu show them everywhere).
import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

/** True while the calling screen is the one shown (true outside a navigator, so a component used anywhere keeps working). */
export function useScreenShown(): boolean {
  const nav = useContext(NavigationContext);
  const [shown, setShown] = useState(() => nav?.isFocused() ?? true);
  useEffect(() => {
    if (!nav) return;
    setShown(nav.isFocused());
    const a = nav.addListener('focus', () => setShown(true));
    const b = nav.addListener('blur', () => setShown(false));
    return () => { a(); b(); };
  }, [nav]);
  return shown;
}

/** `ms` while the calling screen is shown, else no polling. */
export function usePoll(ms: number): number | false {
  return useScreenShown() ? ms : false;
}
