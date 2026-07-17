import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import type { Href } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/api';
import AppLoader from '../components/AppLoader';
import ErrorBoundary from '../components/ErrorBoundary';
import { loadSavedLanguage } from '../i18n';

// Hold the splash until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    loadFromStorage();
    loadSavedLanguage();
  }, []);

  // Hide splash + navigate once auth state is resolved
  useEffect(() => {
    if (isLoading) return;

    SplashScreen.hideAsync().catch(() => {});
    // Keep loader visible for at least 1.2 s so the animation plays through
    setTimeout(() => setShowLoader(false), 1200);

    async function navigate() {
      if (!user) {
        // Check if first-time user — show welcome/onboarding
        const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
        if (!onboardingDone) {
          router.replace('/(auth)/welcome');
        } else {
          router.replace('/(auth)/login');
        }
        return;
      }

      // Logged in — check if role tour has been shown
      const tourSeen = await AsyncStorage.getItem(`tour_seen_${user.role}`);
      if (!tourSeen) {
        router.replace('/role-tour');
        return;
      }

      if (['STORE_MANAGER', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        router.replace('/(manager)/home');
      } else if (user.role === 'EMPLOYEE') {
        router.replace('/(employee)/home');
      } else {
        router.replace('/(customer)/home');
      }

      // Cold start via notification tap: the app just launched because the
      // user tapped a push while it was fully killed. Override the default
      // landing route above with wherever that notification actually points.
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const actionUrl = lastResponse?.notification.request.content.data?.actionUrl as string | undefined;
      if (actionUrl) router.push(actionUrl as Href);
    }

    navigate();
  }, [user, isLoading]);

  useEffect(() => {
    if (user) {
      registerPushToken().catch(() => {});
    }
  }, [user?.id]);

  // Catch OS-level notification taps while the app is foregrounded or
  // backgrounded (process still alive). The cold-start case (app was fully
  // killed) is handled separately below, inside the auth-resolved navigate().
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const actionUrl = response.notification.request.content.data?.actionUrl as string | undefined;
      if (actionUrl) router.push(actionUrl as Href);
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
        {(isLoading || showLoader) && <AppLoader />}
        <Toast />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
