import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en.json';
import es from './es.json';

export type LanguageCode = 'en' | 'es';
export const LANGUAGES: { code: LanguageCode; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
];
const LANG_KEY = 'app_language';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  interpolation: { escapeValue: false },
});

export async function loadSavedLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    if (saved && saved !== i18n.language) {
      await i18n.changeLanguage(saved);
    }
  } catch {}
}

export async function setLanguage(code: LanguageCode): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, code);
  await i18n.changeLanguage(code);
  // Promotion pushes come in this language: the server is told, when someone is signed in (a signed-out call would only fail)
  import('../store/authStore')
    .then(({ useAuthStore }) => (useAuthStore.getState().token ? import('../services/api').then(({ authApi }) => authApi.setLanguage(code)) : undefined))
    .catch(() => {});
}

export function getLanguage(): LanguageCode {
  return (i18n.language as LanguageCode) || 'en';
}

export default i18n;
