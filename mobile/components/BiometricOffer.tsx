// "Sign in with your fingerprint next time?" (2026-10-31, moved here from the sign-in screen). The sign-in screen used to show it, but
// signing in takes the app straight to the home screen and the sign-in screen goes away, so the offer was almost never seen. The sign-in
// screen now hands it here; it shows over the first screen once the app has moved on. The PIN it saves is kept only in memory until the
// customer answers. An in-tree overlay, not a native Modal (those fail to draw on this app's Android build).
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { ShieldIcon } from './Icons';
import { COLORS } from '../constants';
import { useAuthStore } from '../store/authStore';

let pending: { pin: string } | null = null;
const listeners = new Set<() => void>();

/** After a PIN sign-in on a phone with a fingerprint or face set up and not yet used for this app: offer it on the next screen. */
export function offerBiometricAfterSignIn(pin: string) {
  pending = { pin };
  listeners.forEach((f) => f());
}

export default function BiometricOffer() {
  const { t } = useTranslation();
  const saveBiometricPin = useAuthStore((st) => st.saveBiometricPin);
  const setBiometricEnabled = useAuthStore((st) => st.setBiometricEnabled);
  const signedIn = useAuthStore((s) => !!s.user);
  const [offer, setOffer] = useState<{ pin: string } | null>(null);

  useEffect(() => {
    const f = () => {
      // a moment after the sign-in, so it lands on the home screen instead of flashing during the change of screen
      setTimeout(() => setOffer(pending), 700);
    };
    listeners.add(f);
    if (pending) f();
    return () => { listeners.delete(f); };
  }, []);

  const done = () => { pending = null; setOffer(null); };
  if (!offer || !signedIn) return null;

  const enable = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('auth.confirmIdentityBio'), cancelLabel: t('auth.skip') });
      if (result.success) {
        await saveBiometricPin(offer.pin);
        await setBiometricEnabled(true);
        Toast.show({ type: 'success', text1: t('auth.bioEnabled') });
      }
    } catch { /* the phone said no: nothing changes */ }
    done();
  };

  const bioType = Platform.OS === 'ios' ? t('auth.bioTypeIos') : t('auth.bioTypeAndroid');
  return (
    <View style={s.root}>
      <View style={s.card} accessibilityViewIsModal>
        <View style={s.iconRing}>
          <ShieldIcon size={38} color={COLORS.primary} strokeWidth={1.75} />
        </View>
        <Text style={s.title}>{t('auth.enableBioQ', { type: bioType })}</Text>
        <Text style={s.desc}>{t('auth.enableBioDesc', { type: bioType })}</Text>
        <TouchableOpacity style={s.btn} onPress={enable} accessibilityRole="button">
          <Text style={s.btnText}>{t('auth.enableBio', { type: bioType })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.skip} onPress={done} accessibilityRole="button">
          <Text style={s.skipText}>{t('auth.notNow')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 32, 56, 0.55)', justifyContent: 'center', padding: 24, zIndex: 50, elevation: 50 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 24, padding: 32, alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 6,
  },
  iconRing: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.primary + '30',
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  desc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21 },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, width: '100%', alignItems: 'center',
    marginTop: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  skip: { paddingVertical: 10 },
  skipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
});
