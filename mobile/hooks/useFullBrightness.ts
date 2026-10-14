import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Brightness from 'expo-brightness';

/**
 * Full brightness while `on` (the My QR card, so the cashier's scanner reads it), and the phone's own brightness back the moment it is
 * off, the app goes to the background, or the screen closes (2026-10-14).
 *
 * Before: brightness was raised after asking the phone for its level, so closing the QR quickly undid nothing and the raise landed
 * afterwards. On Android that left the app pinned to its own level, so the phone's brightness slider and auto-brightness stopped
 * working inside the app; on iPhone the whole phone stayed at full brightness, also when the app was closed with the QR open.
 */
export function useFullBrightness(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let active = true;            // false once this QR showing is over: a late answer from the phone must not raise it again
    let before: number | null = null;
    let raised = false;

    const raise = async () => {
      try {
        if (raised) return;
        // iPhone: the level to put back, read again each time (the person may have changed it while away from the app)
        if (Platform.OS === 'ios') before = await Brightness.getBrightnessAsync();
        if (!active || AppState.currentState !== 'active') return;
        await Brightness.setBrightnessAsync(1);
        raised = true;
        if (!active) await giveBack();   // closed while it was being raised
      } catch { /* brightness is a nicety: never block the QR */ }
    };
    const giveBack = async () => {
      if (!raised) return;
      raised = false;
      try {
        // Android: the app stops overriding, so the phone's level and auto-brightness apply again. iPhone: the level it had.
        if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync();
        else if (before != null) await Brightness.setBrightnessAsync(before);
      } catch { /* nothing to undo */ }
    };

    raise();
    // Leaving the app with the QR open hands brightness back (an iPhone would otherwise stay at full); coming back raises it again
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') raise();
      else giveBack();
    });
    return () => {
      active = false;
      sub.remove();
      giveBack();
    };
  }, [on]);
}
