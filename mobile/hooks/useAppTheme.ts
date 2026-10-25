// The app's seasonal theme (2026-10-21, GET /app/theme, set by HQ in admin Settings > App): which preset is on today, and whether its
// opening animation and background shapes are on. The last answer is kept on the phone, so a holiday still shows without a connection;
// one that has passed its end date is dropped even then. No connection and nothing kept: no theme.
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { appThemeApi } from '../services/api';

export type ThemePreset = 'NONE' | 'HALLOWEEN' | 'THANKSGIVING' | 'CHRISTMAS' | 'GAME_DAY';
export interface AppTheme { preset: ThemePreset; intro: boolean; background: boolean; today: string; until: string | null; settled?: boolean }
export const NO_THEME: AppTheme = { preset: 'NONE', intro: false, background: false, today: '', until: null };
const KEY = 'app_theme_last';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function useAppTheme(): AppTheme {
  const [kept, setKept] = useState<AppTheme | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => { if (v) { try { setKept(JSON.parse(v)); } catch { /* unreadable: ignore */ } } }).catch(() => {});
  }, []);
  const q = useQuery({
    queryKey: ['app-theme'],
    queryFn: async () => (await appThemeApi.get()).data.data as AppTheme,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  useEffect(() => { if (q.data) SecureStore.setItemAsync(KEY, JSON.stringify(q.data)).catch(() => {}); }, [q.data]);

  const theme: AppTheme = { ...(q.data ?? kept ?? NO_THEME), settled: q.isSuccess || q.isError };   // settled: the server has answered (or could not)
  // A kept answer that is past its end date (by the phone's own day, with a day of slack for the time zone) is no longer true
  if (!q.data && theme.until && theme.until < dayKey(new Date(Date.now() - 86_400_000))) return NO_THEME;
  return theme;
}
