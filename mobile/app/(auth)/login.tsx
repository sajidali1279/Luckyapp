import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Screen = 'quick' | 'login' | 'register';

export default function LoginScreen() {
  const { setAuth, quickLoginPhone, biometricEnabled, setBiometricEnabled, saveBiometricPin, getBiometricPin } = useAuthStore();

  // Determine initial screen
  const [screen, setScreen] = useState<Screen>(quickLoginPhone ? 'quick' : 'login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [showBioOffer, setShowBioOffer] = useState(false);

  useEffect(() => {
    checkBiometrics();
  }, []);

  // Auto-trigger biometric when on quick screen and biometric is enabled
  useEffect(() => {
    if (screen === 'quick' && biometricEnabled && bioAvailable) {
      triggerBiometric();
    }
  }, [screen, biometricEnabled, bioAvailable]);

  async function checkBiometrics() {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBioAvailable(compatible && enrolled);
  }

  const triggerBiometric = useCallback(async () => {
    if (!quickLoginPhone) return;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Lucky Stop',
      fallbackLabel: 'Use PIN instead',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (!result.success) return;
    // Biometric passed — retrieve saved PIN and auto-login
    const savedPin = await getBiometricPin();
    if (!savedPin) {
      Toast.show({ type: 'error', text1: 'Biometric setup incomplete', text2: 'Please sign in with your PIN once to re-enable' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login(quickLoginPhone, savedPin);
      await setAuth(data.data.user, data.data.token);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Login failed', text2: 'Please sign in with your PIN' });
    } finally {
      setLoading(false);
    }
  }, [quickLoginPhone, getBiometricPin, setAuth]);

  function formatPhone(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function rawPhone(formatted?: string) {
    return (formatted ?? phone).replace(/\D/g, '');
  }

  async function handleQuickLogin() {
    if (!quickLoginPhone) return;
    if (pin.length !== 4) {
      Toast.show({ type: 'error', text1: 'Enter your 4-digit PIN' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login(quickLoginPhone, pin);
      await setAuth(data.data.user, data.data.token);
      if (biometricEnabled) await saveBiometricPin(pin); // keep saved PIN in sync
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Login failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (rawPhone().length < 10) {
      Toast.show({ type: 'error', text1: 'Enter a valid 10-digit phone number' });
      return;
    }
    if (pin.length !== 4) {
      Toast.show({ type: 'error', text1: 'PIN must be 4 digits' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login(rawPhone(), pin);
      await setAuth(data.data.user, data.data.token);
      // Offer biometric enrollment after successful login
      if (bioAvailable && !biometricEnabled) setShowBioOffer(true);
      else if (bioAvailable && biometricEnabled) await saveBiometricPin(pin); // refresh saved PIN
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Login failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Enter your name' }); return; }
    if (rawPhone().length < 10) { Toast.show({ type: 'error', text1: 'Enter a valid phone number' }); return; }
    if (pin.length !== 4) { Toast.show({ type: 'error', text1: 'PIN must be 4 digits' }); return; }
    if (pin !== confirmPin) { Toast.show({ type: 'error', text1: 'PINs do not match' }); return; }
    setLoading(true);
    try {
      const { data } = await authApi.register(rawPhone(), pin, name.trim());
      await setAuth(data.data.user, data.data.token);
      if (bioAvailable && !biometricEnabled) setShowBioOffer(true);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  }

  async function enableBiometric() {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm your identity to enable biometric login',
      cancelLabel: 'Skip',
    });
    if (result.success) {
      await saveBiometricPin(pin);
      await setBiometricEnabled(true);
      Toast.show({ type: 'success', text1: 'Biometric login enabled!' });
    }
    setShowBioOffer(false);
  }

  // ── Biometric enrollment offer ──
  if (showBioOffer) {
    const bioType = Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'Fingerprint / Face unlock';
    return (
      <View style={styles.bioOfferRoot}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <View style={styles.bioOfferCard}>
          <Text style={styles.bioOfferIcon}>🔐</Text>
          <Text style={styles.bioOfferTitle}>Enable {bioType}?</Text>
          <Text style={styles.bioOfferDesc}>
            Skip typing your PIN next time. Use {bioType} to sign in instantly.
          </Text>
          <TouchableOpacity style={styles.bioOfferBtn} onPress={enableBiometric}>
            <Text style={styles.bioOfferBtnText}>Enable {bioType}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bioOfferSkip} onPress={() => setShowBioOffer(false)}>
            <Text style={styles.bioOfferSkipText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Quick login (phone saved, just enter PIN) ──
  if (screen === 'quick') {
    const displayPhone = quickLoginPhone
      ? `(${quickLoginPhone.slice(0, 3)}) ${quickLoginPhone.slice(3, 6)}-${quickLoginPhone.slice(6)}`
      : '';
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <SafeAreaView style={styles.safeTop} />
        <ScrollView contentContainerStyle={styles.scrollQuick} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>⛽ Lucky Stop</Text>
            <Text style={styles.tagline}>Welcome back</Text>
          </View>

          <View style={styles.quickCard}>
            <View style={styles.quickAvatar}>
              <Text style={styles.quickAvatarIcon}>👤</Text>
            </View>
            <Text style={styles.quickPhone}>{displayPhone}</Text>

            {biometricEnabled && bioAvailable ? (
              <>
                <TouchableOpacity style={styles.bioBtn} onPress={triggerBiometric} disabled={loading}>
                  <Text style={styles.bioBtnIcon}>{Platform.OS === 'ios' ? '🔒' : '👆'}</Text>
                  <Text style={styles.bioBtnText}>
                    {Platform.OS === 'ios' ? 'Use Face ID / Touch ID' : 'Use Fingerprint'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or enter PIN</Text>
                  <View style={styles.orLine} />
                </View>
              </>
            ) : null}

            <Text style={styles.label}>4-Digit PIN</Text>
            <TextInput
              style={[styles.input, styles.pinInput]}
              placeholder="••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              value={pin}
              onChangeText={setPin}
              maxLength={4}
              autoFocus={!biometricEnabled}
            />

            <TouchableOpacity style={styles.button} onPress={handleQuickLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => { setScreen('login'); setPin(''); }}
            >
              <Text style={styles.switchLinkText}>Use a different account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => router.push('/(auth)/forgot-pin')}
            >
              <Text style={[styles.switchLinkText, { color: COLORS.textMuted, fontSize: 13 }]}>Forgot PIN?</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Full login / register ──
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeTop} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>⛽ Lucky Stop</Text>
          <Text style={styles.tagline}>Earn rewards every visit</Text>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, screen === 'login' && styles.tabActive]}
            onPress={() => { setScreen('login'); setPin(''); setConfirmPin(''); }}
          >
            <Text style={[styles.tabText, screen === 'login' && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, screen === 'register' && styles.tabActive]}
            onPress={() => { setScreen('register'); setPin(''); setConfirmPin(''); }}
          >
            <Text style={[styles.tabText, screen === 'register' && styles.tabTextActive]}>Create Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {screen === 'register' && (
            <>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Smith"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 000-0000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
          />

          <Text style={styles.label}>4-Digit PIN</Text>
          <TextInput
            style={[styles.input, styles.pinInput]}
            placeholder="••••"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            maxLength={4}
          />

          {screen === 'register' && (
            <>
              <Text style={styles.label}>Confirm PIN</Text>
              <TextInput
                style={[styles.input, styles.pinInput]}
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                value={confirmPin}
                onChangeText={setConfirmPin}
                maxLength={4}
              />
              <Text style={styles.pinHint}>
                Remember your PIN — it replaces a password. You'll need it every time you sign in.
              </Text>
            </>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={screen === 'login' ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{screen === 'login' ? 'Sign In' : 'Create Account'}</Text>
            }
          </TouchableOpacity>

          {screen === 'login' && (
            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => router.push('/(auth)/forgot-pin')}
            >
              <Text style={styles.switchLinkText}>Forgot PIN?</Text>
            </TouchableOpacity>
          )}

          {quickLoginPhone && (
            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => { setScreen('quick'); setPin(''); setPhone(''); }}
            >
              <Text style={styles.switchLinkText}>← Back to quick login</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeTop: { backgroundColor: COLORS.background },
  scroll: { padding: 24, paddingTop: 16, paddingBottom: 40 },
  scrollQuick: { padding: 24, paddingTop: 16, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 36, fontWeight: '800', color: COLORS.primary },
  tagline: { fontSize: 16, color: COLORS.textMuted, marginTop: 8 },

  // Full login tabs
  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.border, borderRadius: 12,
    padding: 4, marginBottom: 24,
  },
  tab: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.white },
  tabText: { color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary },
  form: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 8 },
  input: {
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.text,
  },
  pinInput: { fontSize: 28, letterSpacing: 12, textAlign: 'center' },
  pinHint: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    padding: 18, alignItems: 'center', marginTop: 20,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchLink: { alignItems: 'center', marginTop: 16 },
  switchLinkText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },

  // Quick login card
  quickCard: {
    backgroundColor: COLORS.white, borderRadius: 24, padding: 28,
    alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  quickAvatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: COLORS.primary + '30',
  },
  quickAvatarIcon: { fontSize: 36 },
  quickPhone: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  // Biometric button
  bioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.secondary + '12', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 24,
    borderWidth: 1.5, borderColor: COLORS.secondary + '25',
    width: '100%', justifyContent: 'center',
  },
  bioBtnIcon: { fontSize: 22 },
  bioBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.secondary },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  orLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  orText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },

  // Biometric offer screen
  bioOfferRoot: {
    flex: 1, backgroundColor: COLORS.background,
    justifyContent: 'center', padding: 24,
  },
  bioOfferCard: {
    backgroundColor: COLORS.white, borderRadius: 24, padding: 32,
    alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 6,
  },
  bioOfferIcon: { fontSize: 64 },
  bioOfferTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  bioOfferDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21 },
  bioOfferBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 32, width: '100%', alignItems: 'center',
    marginTop: 8,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  bioOfferBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  bioOfferSkip: { paddingVertical: 10 },
  bioOfferSkipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
});
