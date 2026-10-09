import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants';

// Google Play and the App Store never ask anyone to update, so the app asks the server (GET /app/version) when it opens and
// when it comes back to the front. Below the newest version it offers the update; below the oldest version allowed it shows a
// screen that only opens the store. Anything that goes wrong (no network, an old server) means no prompt: the app never blocks
// itself on a failed check.

export type UpdateState = { kind: 'none' } | { kind: 'available' | 'required'; latest: string; storeUrl: string };

const DISMISS_KEY = 'app_update_dismissed';     // { version, at }: "Not now" for this version
const ASK_AGAIN_MS = 3 * 24 * 3600_000;         // ask again about the same version after 3 days

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

export async function checkForUpdate(): Promise<UpdateState> {
  const mine = installedVersion();
  if (!mine || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return { kind: 'none' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${API_URL}/app/version`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { kind: 'none' };
    const p = (await res.json())?.data?.[Platform.OS];
    if (!p?.storeUrl) return { kind: 'none' };
    if (p.minimum && compareVersions(mine, p.minimum) < 0) return { kind: 'required', latest: p.latest ?? p.minimum, storeUrl: p.storeUrl };
    if (p.latest && compareVersions(mine, p.latest) < 0) {
      const raw = await AsyncStorage.getItem(DISMISS_KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d?.version === p.latest && Date.now() - d.at < ASK_AGAIN_MS) return { kind: 'none' };
      return { kind: 'available', latest: p.latest, storeUrl: p.storeUrl };
    }
  } catch { /* no prompt */ }
  return { kind: 'none' };
}

export async function dismissUpdate(version: string) {
  await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify({ version, at: Date.now() })).catch(() => {});
}

/** The store page: the Play Store or App Store app itself when it can, the web page otherwise. */
export async function openStore(storeUrl: string) {
  const native = Platform.OS === 'android'
    ? 'market://details?id=com.luckystop.app'
    : storeUrl.replace(/^https:\/\//, 'itms-apps://');
  try { await Linking.openURL(native); } catch { await Linking.openURL(storeUrl).catch(() => {}); }
}
