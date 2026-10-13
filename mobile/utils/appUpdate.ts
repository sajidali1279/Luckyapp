import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants';

// Google Play and the App Store never ask anyone to update, so the app asks when it opens and when it comes back to the front.
// Whether a newer version is out comes from the stores themselves, never from a number typed by hand: Google Play's in-app
// updates on Android (which also follow the rollout percentage, expo-in-app-updates) and Apple's App Store lookup on iPhone. The
// server (GET /app/version) only adds the OLDEST VERSION ALLOWED: an app older than it shows a screen that only updates, as long as the
// store has the update for that phone.
// Anything that goes wrong (no network, an app not installed from the store, an old server) means no prompt: the app never
// blocks itself on a failed check.

export type UpdateState =
  | { kind: 'none' }
  | { kind: 'available' | 'required'; storeVersion: string | null; storeUrl: string; immediateAllowed: boolean };

const DISMISS_KEY = 'app_update_dismissed';     // { version, at }: "Not now" for this store version
const ASK_AGAIN_MS = 3 * 24 * 3600_000;         // ask again about the same version after 3 days
const APP_STORE_ID = '6787270736';
const STORE_URLS = {
  android: 'https://play.google.com/store/apps/details?id=com.luckystop.app',
  ios: `https://apps.apple.com/app/id${APP_STORE_ID}`,
};

// Android only, and only when its native part is in the build. Apple rejected 1.3.2 (2026-10-13): the library needs iOS 16.4 and
// the app targets 15.1, so Expo left it out of every iOS build, and requiring it at run time is reported as a FATAL error by the
// module loader before any try/catch here sees it (the app closed 0.2 s after opening, on every iPhone and iPad since 1.2.8).
// So iPhone never loads it (the App Store lookup below needs no native code), and Android asks first whether the native part is there.
function inAppUpdates(): typeof import('expo-in-app-updates') | null {
  if (Platform.OS !== 'android' || !requireOptionalNativeModule('ExpoInAppUpdates')) return null;
  try { return require('expo-in-app-updates'); } catch { return null; }
}

// What the library did on iPhone, in plain JavaScript: Apple's lookup for this app, newer than the installed version or not
async function appStoreCheck(): Promise<{ available: boolean; storeVersion: string | null; immediateAllowed: boolean }> {
  const none = { available: false, storeVersion: null, immediateAllowed: false };
  const mine = installedVersion();
  if (!mine) return none;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us&_=${Date.now()}`, { signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache' } });
    clearTimeout(timer);
    if (!res.ok) return none;
    const v = (await res.json())?.results?.[0]?.version;
    if (typeof v !== 'string' || !/^\d+(\.\d+)*$/.test(v)) return none;
    return { available: compareVersions(v, mine) > 0, storeVersion: v, immediateAllowed: false };
  } catch { return none; }
}

/** -1, 0 or 1, comparing "1.2.10" and "1.2.9" as numbers part by part. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export const installedVersion = (): string | null => Constants.expoConfig?.version ?? null;

async function oldestAllowed(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${API_URL}/app/version`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const p = (await res.json())?.data?.[Platform.OS];
    return typeof p?.minimum === 'string' ? p.minimum : null;
  } catch { return null; }
}

async function storeCheck(): Promise<{ available: boolean; storeVersion: string | null; immediateAllowed: boolean }> {
  if (Platform.OS === 'ios') return appStoreCheck();
  try {
    const lib = inAppUpdates();
    if (!lib) return { available: false, storeVersion: null, immediateAllowed: false };
    const r = await lib.checkForUpdate();
    // On Android storeVersion is the build number (versionCode), not the 1.2.x name: not something to show
    return { available: !!r.updateAvailable, storeVersion: null, immediateAllowed: !!r.immediateAllowed };
  } catch { return { available: false, storeVersion: null, immediateAllowed: false }; }
}

export async function checkForUpdate(): Promise<UpdateState> {
  const mine = installedVersion();
  if (!mine || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return { kind: 'none' };
  const storeUrl = STORE_URLS[Platform.OS];
  const [minimum, store] = await Promise.all([oldestAllowed(), storeCheck()]);
  // Blocked only when the store really has a newer version for this phone (2026-10-11): during a Play staged rollout, or before a
  // release is live, the store has nothing newer for many phones, and a block there would lock them out with nothing to update to.
  // Then they get in; the block starts the moment the store offers them the update.
  if (minimum && compareVersions(mine, minimum) < 0 && store.available) {
    return { kind: 'required', storeVersion: store.storeVersion, storeUrl, immediateAllowed: store.immediateAllowed };
  }
  if (store.available) {
    const key = store.storeVersion ?? 'any';
    try {
      const raw = await AsyncStorage.getItem(DISMISS_KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d?.version === key && Date.now() - d.at < ASK_AGAIN_MS) return { kind: 'none' };
    } catch { /* ask */ }
    return { kind: 'available', storeVersion: store.storeVersion, storeUrl, immediateAllowed: store.immediateAllowed };
  }
  return { kind: 'none' };
}

export async function dismissUpdate(storeVersion: string | null) {
  await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify({ version: storeVersion ?? 'any', at: Date.now() })).catch(() => {});
}

/** Update now: Google Play's own update screen on Android; the store page otherwise (the App Store app on iPhone). */
export async function startUpdate(state: Exclude<UpdateState, { kind: 'none' }>) {
  const lib = inAppUpdates();
  try {
    if (lib && state.immediateAllowed) {
      if (await lib.startUpdate(true)) return;
    }
  } catch { /* fall back to the store page */ }
  await openStore(state.storeUrl);
}

/** The store page: the Play Store or App Store app itself when it can, the web page otherwise. */
export async function openStore(storeUrl: string) {
  const native = Platform.OS === 'android'
    ? 'market://details?id=com.luckystop.app'
    : storeUrl.replace(/^https:\/\//, 'itms-apps://');
  try { await Linking.openURL(native); } catch { await Linking.openURL(storeUrl).catch(() => {}); }
}
