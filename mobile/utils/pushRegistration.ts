import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { authApi } from '../services/api';
import { EXPO_PROJECT_ID } from '../constants';

/**
 * Asks for notification permission (only if it has never been decided), creates the Android channel the server sends to
 * ('default', MAX importance, named in backend/src/utils/pushSend.ts), and sends this phone's push token to the server.
 * Does nothing when permission is not granted. Called after sign-in and again when the person turns notifications back on.
 */
export async function registerPushToken() {
  if (!Device.isDevice) return;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: EXPO_PROJECT_ID,
  });
  await authApi.registerPushToken(tokenData.data, Platform.OS);
}
