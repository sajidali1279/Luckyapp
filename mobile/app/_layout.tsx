import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/api';
import AppLoader from '../components/AppLoader';

// Hold the splash until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerPushToken() {
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
    projectId: 'c13d7114-4241-4e51-ad30-d69096d570ee',
  });
  await authApi.registerPushToken(tokenData.data, Platform.OS);
}

export default function RootLayout() {
  const { loadFromStorage, user, isLoading } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  // Hide splash + navigate once auth state is resolved
  useEffect(() => {
    if (isLoading) return;

    SplashScreen.hideAsync().catch(() => {});

    if (!user) {
      router.replace('/(auth)/login');
    } else if (user.role === 'STORE_MANAGER') {
      router.replace('/(manager)/home');
    } else if (['EMPLOYEE', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.replace('/(employee)/home');
    } else {
      router.replace('/(customer)/home');
    }
  }, [user, isLoading]);

  useEffect(() => {
    if (user) {
      registerPushToken().catch(() => {});
    }
  }, [user?.id]);

  return (
    <QueryClientProvider client={queryClient}>
      {isLoading ? (
        <AppLoader />
      ) : (
        <Stack screenOptions={{ headerShown: false }} />
      )}
      <Toast />
    </QueryClientProvider>
  );
}
