import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, router } from 'expo-router';
import type { Href } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../components/toastConfig';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { registerPushToken } from '../utils/pushRegistration';
import AppLoader from '../components/AppLoader';
import { queryClient } from '../services/queryClient';
import ErrorBoundary from '../components/ErrorBoundary';
import UpdatePrompt from '../components/UpdatePrompt';
import { loadSavedLanguage } from '../i18n';

// Hold the splash until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {});


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
      // getLastNotificationResponseAsync() returns the OS's cached last-tapped
      // response and does NOT consume it, so we must explicitly clear it
      // afterward — otherwise a later re-run of this effect (user object
      // changes on login/profile update/token refresh) or a later unrelated
      // relaunch would silently replay this same stale destination.
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const actionUrl = lastResponse?.notification.request.content.data?.actionUrl as string | undefined;
      if (actionUrl) router.push(actionUrl as Href);
      if (lastResponse) await Notifications.clearLastNotificationResponseAsync();
    }

    navigate();
    // Who is signed in (and as what), not the user object: refreshAccount hands back a NEW object each time it reads the balance, and
    // depending on the object sent a customer back to Home a second or two after opening Rewards (2026-10-21)
  }, [user?.id, user?.role, isLoading]);

  useEffect(() => {
    if (user) {
      registerPushToken().catch(() => {});
    }
  }, [user?.id]);

  // Keep a signed-in session alive and notice one that has ended, for every role: on open and whenever the app comes back
  // to the front (at most every 6 hours). The server renews a session more than a day old; one it refuses signs out.
  const lastSessionCheck = useRef(0);
  useEffect(() => {
    if (!user?.id) return;
    const check = () => {
      if (Date.now() - lastSessionCheck.current < 6 * 3600_000) return;
      lastSessionCheck.current = Date.now();
      useAuthStore.getState().refreshSession();
    };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [user?.id]);

  // A customer's balance as it is now (2026-10-16): points an employee granted only showed after the app was closed and opened again.
  // Re-read when the app comes back to the front (at most every 15 seconds) and as soon as a notification arrives while it is open
  // ("Points credited", a redemption, a hot food order paid with points).
  const lastAccountRead = useRef(0);
  useEffect(() => {
    if (!user?.id || user.role !== 'CUSTOMER') return;
    const read = (force = false) => {
      if (!force && Date.now() - lastAccountRead.current < 15_000) return;
      lastAccountRead.current = Date.now();
      useAuthStore.getState().refreshAccount();
      // and the lists that change with it (2026-10-17): History, redemptions, the tier benefit, the bell, welcome week, challenges,
      // receipt scans. Only these: reloading every screen's data could wipe a half-filled form.
      for (const key of ['my-history', 'my-redemptions', 'my-benefit-status', 'unread-count', 'welcome-bonus', 'my-challenges', 'receipt-scan-mine', 'my-expiry', 'engagement', 'engagement-flags', 'flash-deal', 'friends-board']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') read(); });
    const push = Notifications.addNotificationReceivedListener(() => read(true));
    return () => { app.remove(); push.remove(); };
  }, [user?.id, user?.role]);

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
        <UpdatePrompt />
        <Toast config={toastConfig} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
