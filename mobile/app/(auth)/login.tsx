import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Animated, Image,
} from 'react-native';
import { getAuth, signInWithPhoneNumber, signOut } from '@react-native-firebase/auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ShieldIcon, UserIcon } from '../../components/Icons';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Screen = 'quick' | 'login' | 'register' | 'verify-phone';

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
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [tabsWidth, setTabsWidth] = useState(0);
  const tabAnim = useRef(new Animated.Value(screen === 'register' ? 1 : 0)).current;
  // Phone OTP state
  const [confirmation, setConfirmation] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    checkBiometrics();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Offer biometric enrollment after successful login
      if (bioAvailable && !biometricEnabled) setShowBioOffer(true);
      else if (bioAvailable && biometricEnabled) await saveBiometricPin(pin); // refresh saved PIN
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Login failed' });
    } finally {
      setLoading(false);
    }
  }

  // Step 1: validate form then send OTP via Firebase
  async function handleRegister() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Enter your name' }); return; }
    if (rawPhone().length < 10) { Toast.show({ type: 'error', text1: 'Enter a valid phone number' }); return; }
    if (pin.length !== 4) { Toast.show({ type: 'error', text1: 'PIN must be 4 digits' }); return; }
    if (pin !== confirmPin) { Toast.show({ type: 'error', text1: 'PINs do not match' }); return; }
    setSendingOtp(true);
    try {
      const result = await signInWithPhoneNumber(getAuth(), `+1${rawPhone()}`);
      setConfirmation(result);
      setOtp('');
      setResendCooldown(60);
      setScreen('verify-phone');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not send code', text2: err.message || 'Check the phone number and try again' });
    } finally {
      setSendingOtp(false);
    }
  }

  // Step 2: verify OTP then create account
  async function handleVerifyAndCreate() {
    if (otp.length !== 6) { Toast.show({ type: 'error', text1: 'Enter the 6-digit code' }); return; }
    setLoading(true);
    try {
      const credential = await confirmation.confirm(otp);
      const firebaseToken = await credential.user.getIdToken();
      const { data } = await authApi.register(rawPhone(), pin, name.trim(), firebaseToken);
      signOut(getAuth()).catch(() => {});
      await setAuth(data.data.user, data.data.token);
      if (bioAvailable && !biometricEnabled) setShowBioOffer(true);
    } catch (err: any) {
      const code = err.code as string | undefined;
      if (code === 'auth/invalid-verification-code') {
        Toast.show({ type: 'error', text1: 'Wrong code — try again' });
      } else if (code === 'auth/code-expired') {
        Toast.show({ type: 'error', text1: 'Code expired', text2: 'Tap Resend to get a new one' });
      } else {
        Toast.show({ type: 'error', text1: err.response?.data?.error || 'Verification failed' });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setResending(true);
    try {
      const result = await signInWithPhoneNumber(getAuth(), `+1${rawPhone()}`);
      setConfirmation(result);
      setOtp('');
      setResendCooldown(60);
      Toast.show({ type: 'success', text1: 'New code sent!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to resend — try again' });
    } finally {
      setResending(false);
    }
  }

  const switchTab = useCallback((s: 'login' | 'register') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(tabAnim, {
      toValue: s === 'register' ? 1 : 0,
      tension: 220, friction: 22, useNativeDriver: true,
    }).start();
    setScreen(s);
    setPin('');
    setConfirmPin('');
  }, [tabAnim]);

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
          <View style={styles.bioIconRing}>
            <ShieldIcon size={38} color={COLORS.primary} strokeWidth={1.75} />
          </View>
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
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <SafeAreaView style={styles.safeTop} />
        <ScrollView contentContainerStyle={styles.scrollQuick} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require('../../assets/store-icon-512.png')} style={styles.logoMark} />
            <Text style={styles.logo}>Lucky Stop</Text>
            <Text style={styles.tagline}>Welcome back</Text>
          </View>

          <View style={styles.quickCard}>
            <View style={styles.quickAvatar}>
              <UserIcon size={32} color="rgba(255,255,255,0.9)" strokeWidth={1.75} />
            </View>
            <Text style={styles.quickPhone}>{displayPhone}</Text>

            {biometricEnabled && bioAvailable ? (
              <>
                <TouchableOpacity style={styles.bioBtn} onPress={triggerBiometric} disabled={loading}>
                  <ShieldIcon size={16} color={COLORS.secondary} strokeWidth={2.5} />
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
              style={[styles.input, styles.pinInput, focusedInput === 'quickPin' && styles.inputFocused]}
              placeholder="••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              value={pin}
              onChangeText={setPin}
              maxLength={4}
              autoFocus={!biometricEnabled}
              onFocus={() => setFocusedInput('quickPin')}
              onBlur={() => setFocusedInput(null)}
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

  // ── Verify phone (OTP entry) ──
  if (screen === 'verify-phone') {
    const displayPhone = rawPhone().length === 10
      ? `(${rawPhone().slice(0, 3)}) ${rawPhone().slice(3, 6)}-${rawPhone().slice(6)}`
      : phone;
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <SafeAreaView style={styles.safeTop} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require('../../assets/store-icon-512.png')} style={styles.logoMark} />
            <Text style={styles.logo}>Lucky Stop</Text>
            <Text style={styles.tagline}>Verify your number</Text>
          </View>

          <View style={styles.form}>
            <View style={vp.phoneBadge}>
              <Text style={vp.phoneBadgeLabel}>Code sent to</Text>
              <Text style={vp.phoneBadgeNumber}>{displayPhone}</Text>
            </View>

            <Text style={styles.label}>6-Digit Code</Text>
            <TextInput
              style={[styles.input, vp.otpInput, focusedInput === 'otp' && styles.inputFocused]}
              placeholder="••••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              autoFocus
              onFocus={() => setFocusedInput('otp')}
              onBlur={() => setFocusedInput(null)}
            />

            <TouchableOpacity
              style={[styles.button, otp.length < 6 && { opacity: 0.6 }]}
              onPress={handleVerifyAndCreate}
              disabled={loading || otp.length < 6}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Verify & Create Account</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={resendCooldown > 0 || resending ? undefined : handleResendOtp}
              disabled={resendCooldown > 0 || resending}
            >
              <Text style={[styles.switchLinkText, (resendCooldown > 0) && { color: COLORS.textMuted }]}>
                {resending ? 'Sending…' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => { setScreen('register'); setOtp(''); setConfirmation(null); }}
            >
              <Text style={[styles.switchLinkText, { color: COLORS.textMuted, fontSize: 13 }]}>← Change number</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Full login / register ──
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.safeTop} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/store-icon-512.png')} style={styles.logoMark} />
          <Text style={styles.logo}>Lucky Stop</Text>
          <Text style={styles.tagline}>Earn rewards every visit</Text>
        </View>

        <View
          style={styles.tabs}
          onLayout={e => setTabsWidth(e.nativeEvent.layout.width - 8)}
        >
          {tabsWidth > 0 && (
            <Animated.View style={[
              styles.tabIndicator,
              {
                width: tabsWidth / 2,
                transform: [{ translateX: tabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, tabsWidth / 2] }) }],
              },
            ]} />
          )}
          <TouchableOpacity style={styles.tab} onPress={() => switchTab('login')}>
            <Text style={[styles.tabText, screen === 'login' && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => switchTab('register')}>
            <Text style={[styles.tabText, screen === 'register' && styles.tabTextActive]}>Create Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {screen === 'register' && (
            <>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={[styles.input, focusedInput === 'name' && styles.inputFocused]}
                placeholder="John Smith"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                onFocus={() => setFocusedInput('name')}
                onBlur={() => setFocusedInput(null)}
              />
            </>
          )}

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={[styles.input, focusedInput === 'phone' && styles.inputFocused]}
            placeholder="(555) 000-0000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            onFocus={() => setFocusedInput('phone')}
            onBlur={() => setFocusedInput(null)}
          />

          <Text style={styles.label}>4-Digit PIN</Text>
          <TextInput
            style={[styles.input, styles.pinInput, focusedInput === 'pin' && styles.inputFocused]}
            placeholder="••••"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            maxLength={4}
            onFocus={() => setFocusedInput('pin')}
            onBlur={() => setFocusedInput(null)}
          />

          {screen === 'register' && (
            <>
              <Text style={styles.label}>Confirm PIN</Text>
              <TextInput
                style={[styles.input, styles.pinInput, focusedInput === 'confirmPin' && styles.inputFocused]}
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                value={confirmPin}
                onChangeText={setConfirmPin}
                maxLength={4}
                onFocus={() => setFocusedInput('confirmPin')}
                onBlur={() => setFocusedInput(null)}
              />
              <Text style={styles.pinHint}>
                Remember your PIN — it replaces a password. You'll need it every time you sign in.
              </Text>
            </>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={screen === 'login' ? handleLogin : handleRegister}
            disabled={loading || sendingOtp}
          >
            {loading || sendingOtp
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{screen === 'login' ? 'Sign In' : 'Send Verification Code'}</Text>
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
  header: { alignItems: 'center', marginBottom: 32, paddingTop: 16 },
  logoMark: {
    width: 64, height: 64, borderRadius: 18,
    marginBottom: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  logo: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: COLORS.textMuted, marginTop: 6, fontWeight: '500' },

  // Full login tabs
  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.border, borderRadius: 12,
    padding: 4, marginBottom: 24, position: 'relative',
  },
  tabIndicator: {
    position: 'absolute', top: 4, left: 4, bottom: 4,
    backgroundColor: COLORS.white, borderRadius: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  tab: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', zIndex: 1 },
  tabText: { color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary },
  form: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 8 },
  input: {
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.text,
  },
  inputFocused: {
    borderColor: COLORS.primary, borderWidth: 2,
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
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 10, elevation: 5,
  },
  quickPhone: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  // Biometric button
  bioBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.secondary + '12', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 24,
    borderWidth: 1.5, borderColor: COLORS.secondary + '25',
    width: '100%',
  },
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
  bioIconRing: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.primary + '30',
  },
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

const vp = StyleSheet.create({
  phoneBadge: {
    backgroundColor: COLORS.secondary + '12', borderRadius: 16, padding: 18,
    alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.secondary + '25', marginBottom: 8,
  },
  phoneBadgeLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  phoneBadgeNumber: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  otpInput: { fontSize: 28, letterSpacing: 14, textAlign: 'center' },
});
