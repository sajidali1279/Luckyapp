import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerPushToken } from '../utils/pushRegistration';

// Whether this phone lets the app show notifications, and a way to turn them back on.
//
// Before, the app asked once at sign-in and, if the person said no (or later switched notifications off in the phone's settings), it never
// asked again and never said anything: they just stopped hearing about offers. Now the Profile row, the Notifications screen and the customer
// home show when notifications are off, and "Turn on" either asks again (while the phone still allows the app to ask) or opens the app's page
// in the phone's settings. The status is read again whenever the app comes back to the front, so returning from settings updates it, and the
// phone's push token is sent to the server as soon as notifications are on again.

export type NotificationPermission = 'granted' | 'off' | 'unknown';

export function useNotificationPermission() {
  const supported = Platform.OS !== 'web' && Device.isDevice;
  const [status, setStatus] = useState<NotificationPermission>('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const last = useRef<NotificationPermission>('unknown');

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const p = await Notifications.getPermissionsAsync();
      const next: NotificationPermission = p.status === 'granted' ? 'granted' : 'off';
      // Turned back on outside the app (in the phone's settings): make sure the server has this phone's token.
      if (next === 'granted' && last.current === 'off') registerPushToken().catch(() => {});
      last.current = next;
      setStatus(next);
      setCanAskAgain(p.canAskAgain !== false);
    } catch { /* leave the last known status */ }
  }, [supported]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  /** Asks again when the phone still allows it, otherwise opens this app's page in the phone's settings. */
  const turnOn = useCallback(async () => {
    if (!supported) return;
    try {
      if (canAskAgain) {
        const p = await Notifications.requestPermissionsAsync();
        if (p.status === 'granted') {
          last.current = 'granted';
          setStatus('granted');
          registerPushToken().catch(() => {});
          return;
        }
        setCanAskAgain(p.canAskAgain !== false);
        if (p.canAskAgain !== false) return;   // they said no to the prompt just now: respect it, do not jump to settings
      }
      await Linking.openSettings();
    } catch {
      Linking.openSettings().catch(() => {});
    }
  }, [supported, canAskAgain]);

  return { supported, status, isOff: supported && status === 'off', turnOn, refresh };
}
