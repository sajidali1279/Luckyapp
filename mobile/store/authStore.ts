import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { authApi } from '../services/api';
import Toast from 'react-native-toast-message';
import i18next from 'i18next';
import { EXPO_PROJECT_ID } from '../constants';
import { queryClient } from '../services/queryClient';

// Best effort, never allowed to block or fail the actual sign-out: re-derives this device's own Expo push
// token (the same call _layout.tsx's registration makes - Expo returns the same token for this install
// unless permissions changed) and tells the server to forget it, so a phone that just signed out stops
// getting that account's pushes instead of keeping them until the token is naturally replaced.
async function removeThisDevicesPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    await authApi.removePushToken(tokenData.data);
  } catch {
    // Sign-out proceeds regardless
  }
}

let ending = false;   // endSession is running
let accountInFlight: Promise<void> | null = null;   // refreshAccount: one request at a time

export type UserRole = 'DEV_ADMIN' | 'SUPER_ADMIN' | 'STORE_MANAGER' | 'EMPLOYEE' | 'CUSTOMER';

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
  role: UserRole;
  qrCode?: string;
  pointsBalance?: number;
  storeIds?: string[];
  tier?: string;
  periodPoints?: number;
  tierPeriod?: string;
  avatarUrl?: string;
  age21Confirmed?: boolean;
  age21Declined?: boolean;
  birthMonth?: number | null;   // the birthday they gave (month and day only), for birthday-month promotions
  birthDay?: number | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  // Quick login
  quickLoginPhone: string | null;
  biometricEnabled: boolean;
  // Actions
  setAuth: (user: AuthUser, token: string) => Promise<void>;
  logout: () => Promise<void>;
  /** The server ended the session: sign out and say so once. */
  endSession: () => Promise<void>;
  /** Re-read the account; saves a renewed session when the server sends one. */
  refreshSession: () => Promise<void>;
  /** Re-read the balance, tier and the rest of the account from the server (2026-10-16): pull to refresh, the app coming back, a push
   *  arriving. Several calls at once share one request. */
  refreshAccount: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  updateBalance: (newBalance: number) => void;
  setAge21Confirmed: () => void;
  setAge21Declined: () => void;
  setQuickLoginPhone: (phone: string) => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  saveBiometricPin: (pin: string) => Promise<void>;
  getBiometricPin: () => Promise<string | null>;
  clearQuickLogin: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  quickLoginPhone: null,
  biometricEnabled: false,

  setAuth: async (user, token) => {
    await SecureStore.setItemAsync('jwt_token', token);
    await SecureStore.setItemAsync('user_data', JSON.stringify(user));
    // Save phone for quick login
    await SecureStore.setItemAsync('quick_login_phone', user.phone);
    if (get().user && get().user!.id !== user.id) queryClient.clear();   // another account signing in
    set({ user, token, isLoading: false, quickLoginPhone: user.phone });
  },

  logout: async () => {
    // The push-token call has no timeout of its own and the host may be waking up (30 to 60 s): signing out must not wait for it
    await Promise.race([removeThisDevicesPushToken(), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
    await SecureStore.deleteItemAsync('jwt_token');
    await SecureStore.deleteItemAsync('user_data');
    await SecureStore.deleteItemAsync('biometric_pin');
    // Keep quick_login_phone and biometric_enabled for next time
    queryClient.clear();   // the next account must not see this one's redemptions, codes or history for a moment
    set({ user: null, token: null, isLoading: false });
  },

  endSession: async () => {
    // The server already refused this session, so nothing is sent to it (removing the push token would be refused too, and
    // each refusal would come back here). Cleared locally, once, while several refused requests may arrive together.
    if (!get().user || ending) return;
    ending = true;
    try {
      await SecureStore.deleteItemAsync('jwt_token');
      await SecureStore.deleteItemAsync('user_data');
      await SecureStore.deleteItemAsync('biometric_pin');
      queryClient.clear();
      set({ user: null, token: null, isLoading: false });
    } finally { ending = false; }
    Toast.show({ type: 'error', text1: i18next.t('customerHome.signedOut'), text2: i18next.t('customerHome.signInAgain') });
  },

  refreshSession: async () => {
    const { user, token } = get();
    if (!user || !token) return;
    try {
      const { data } = await authApi.getMe();
      const fresh = data?.data?.token;
      const now = get().user;   // signed out while the request was out: nothing to renew
      if (fresh && now) get().setAuth(now, fresh);
    } catch { /* a refused session is handled by the API layer; no network leaves it as it is */ }
  },

  refreshAccount: () => {
    if (accountInFlight) return accountInFlight;
    const run = (async () => {
      if (!get().user || !get().token) return;
      try {
        const { data } = await authApi.getMe();
        // Read the store again: fields (like avatarUrl) may have changed while the request was out
        const { user: u, token: t } = get();
        if (!data?.data || !u || !t) return;
        await get().setAuth({
          ...u,
          pointsBalance: data.data.pointsBalance,
          tier: data.data.tier,
          periodPoints: data.data.periodPoints,
          tierPeriod: data.data.tierPeriod,
          avatarUrl: data.data.avatarUrl ?? u.avatarUrl,
          age21Confirmed: data.data.age21Confirmed,
          age21Declined: data.data.age21Declined,
          birthMonth: data.data.birthMonth ?? null,   // the birthday they gave (Profile), for birthday-month promotions
          birthDay: data.data.birthDay ?? null,
        }, data.data.token ?? t);   // a renewed session when the server sent one (GET /auth/me)
      } catch (err: any) {
        // Account no longer exists or was deactivated server-side: a locally cached session should not keep the app usable.
        // (A refused session, 401, is signed out by the API layer for every screen.) No network: the balance stays as it was.
        if (err?.response?.status === 404) await get().endSession();
      }
    })();
    accountInFlight = run.finally(() => { accountInFlight = null; });
    return accountInFlight;
  },

  loadFromStorage: async () => {
    try {
      const [token, userData, quickPhone, bioEnabled] = await Promise.all([
        SecureStore.getItemAsync('jwt_token'),
        SecureStore.getItemAsync('user_data'),
        SecureStore.getItemAsync('quick_login_phone'),
        SecureStore.getItemAsync('biometric_enabled'),
      ]);
      if (token && userData) {
        set({
          token,
          user: JSON.parse(userData),
          isLoading: false,
          quickLoginPhone: quickPhone,
          biometricEnabled: bioEnabled === 'true',
        });
      } else {
        set({
          isLoading: false,
          quickLoginPhone: quickPhone,
          biometricEnabled: bioEnabled === 'true',
        });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  updateBalance: (newBalance) =>
    set((state) => ({
      user: state.user ? { ...state.user, pointsBalance: newBalance } : null,
    })),

  setAge21Confirmed: () =>
    set((state) => ({
      user: state.user ? { ...state.user, age21Confirmed: true, age21Declined: false } : null,
    })),

  setAge21Declined: () =>
    set((state) => ({
      user: state.user ? { ...state.user, age21Declined: true } : null,
    })),

  setQuickLoginPhone: async (phone) => {
    await SecureStore.setItemAsync('quick_login_phone', phone);
    set({ quickLoginPhone: phone });
  },

  setBiometricEnabled: async (enabled) => {
    await SecureStore.setItemAsync('biometric_enabled', String(enabled));
    set({ biometricEnabled: enabled });
  },

  saveBiometricPin: async (pin) => {
    await SecureStore.setItemAsync('biometric_pin', pin);
  },

  getBiometricPin: async () => {
    return SecureStore.getItemAsync('biometric_pin');
  },

  clearQuickLogin: async () => {
    await SecureStore.deleteItemAsync('quick_login_phone');
    await SecureStore.deleteItemAsync('biometric_enabled');
    await SecureStore.deleteItemAsync('biometric_pin');
    set({ quickLoginPhone: null, biometricEnabled: false });
  },
}));

// Role helpers
export const isEmployee = (role?: UserRole) => ['EMPLOYEE', 'STORE_MANAGER', 'SUPER_ADMIN', 'DEV_ADMIN'].includes(role || '');
export const isAdmin = (role?: UserRole) => ['SUPER_ADMIN', 'DEV_ADMIN'].includes(role || '');
export const isDevAdmin = (role?: UserRole) => role === 'DEV_ADMIN';
export const isStoreManagerOrAbove = (role?: UserRole) => ['STORE_MANAGER', 'SUPER_ADMIN', 'DEV_ADMIN'].includes(role || '');
