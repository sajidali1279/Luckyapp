import { useCallback, useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { useCameraPermissions } from 'expo-camera';

// Camera permission with a way back after "Don't allow".
//
// Every "Allow camera" button called requestPermission(). Once the person has said no (twice on Android, once on iPhone) the phone no
// longer shows the question, so the button silently did nothing and a cashier could not reach Scan at all. `ask` now opens the app's page
// in the phone's settings when asking is no longer possible, and the permission is read again when the app comes back to the front, so
// turning the camera on in settings takes effect without restarting the app.

export function useCameraAccess() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') getPermission().catch(() => {}); });
    return () => sub.remove();
  }, [getPermission]);

  const ask = useCallback(async () => {
    if (permission && !permission.granted && permission.canAskAgain === false) {
      await Linking.openSettings().catch(() => {});
      return;
    }
    const result = await requestPermission();
    if (!result.granted && result.canAskAgain === false) await Linking.openSettings().catch(() => {});
  }, [permission, requestPermission]);

  /** True when tapping "Allow" will open the phone's settings rather than ask. */
  const needsSettings = !!permission && !permission.granted && permission.canAskAgain === false;

  return { permission, ask, needsSettings };
}
