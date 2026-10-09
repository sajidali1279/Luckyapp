import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants';

// Google Play and the App Store never ask anyone to update, so the app asks when it opens and when it comes back to the front.
// Whether a newer version is out comes from the stores themselves, never from a number typed by hand: Google Play's in-app
// updates on Android (which also follow the rollout percentage) and the App Store lookup on iPhone (expo-in-app-updates). The
// server (GET /app/version) only adds the OLDEST VERSION ALLOWED: an app older than it shows a screen that only updates.
// Anything that goes wrong (no network, an app not installed from the store, an old server) means no prompt: the app never
// blocks itself on a failed check.

export type UpdateState =
  | { kind: 'none' }
  | { kind: 'available' | 'required'; storeVersion: string | null; storeUrl: string; immediateAllowed: boolean };

const DISMISS_KEY = 'app_update_dismissed';     // { version, at }: "Not now" for this store version
const ASK_AGAIN_MS = 3 * 24 * 3600_000;         // ask again about the same version after 3 days
const STORE_URLS = {
  android: 'https://play.google.com/store/apps/details?id=com.luckystop.app',
  ios: 'https://apps.apple.com/app/id6787270736',
};

// Loaded lazily: an app built before the library was added has no native part, and requiring it there would throw
function inAppUpdates(): typeof import('expo-in-app-updates') | null {
  try { return require('expo-in-app-updates'); } catch { return null; }
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
  try {
    const lib = inAppUpdates();
    if (!lib) return { available: false, storeVersion: null, immediateAllowed: false };
    const r = await lib.checkForUpdate();
    // On Android storeVersion is the build number (versionCode), not the 1.2.x name: not something to show
    const name = Platform.OS === 'ios' && r.storeVersion ? String(r.storeVersion) : null;
    return { available: !!r.updateAvailable, storeVersion: name, immediateAllowed: !!r.immediateAllowed };
  } catch { return { available: false, storeVersion: null, immediateAllowed: false }; }
}

export async function checkForUpdate(): Promise<UpdateState> {
  const mine = installedVersion();
  if (!mine || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return { kind: 'none' };
  const storeUrl = STORE_URLS[Platform.OS];
  const [minimum, store] = await Promise.all([oldestAllowed(), storeCheck()]);
  if (minimum && compareVersions(mine, minimum) < 0) {
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

/** Update now: Google Play's own update screen on Android, the App Store sheet on iPhone; the store page when those cannot start. */
export async function startUpdate(state: Exclude<UpdateState, { kind: 'none' }>) {
  const lib = inAppUpdates();
  try {
    if (lib && (Platform.OS === 'ios' || state.immediateAllowed)) {
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
