import { useContext, useEffect, useState } from 'react';
import { StatusBar, type StatusBarProps } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

// The status bar style (clock, battery) for the screen on top only. A plain <StatusBar> stays in force while its screen
// sits behind another tab or page, and the last one mounted wins: Labels showed a white clock on its light page because
// Home had set white (2026-10-16). Outside a navigator (a pop-up over everything) it always applies.
export default function FocusStatusBar(props: StatusBarProps) {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { offFocus(); offBlur(); };
  }, [navigation]);
  return focused ? <StatusBar {...props} /> : null;
}
