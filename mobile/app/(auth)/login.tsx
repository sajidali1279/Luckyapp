import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  Animated,
  Keyboard,
} from 'react-native';
import { Text, TextInput } from '../../components/ScaledText';
import { Image } from 'expo-image';
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
import KeyboardSafe from '../../components/KeyboardSafe';
import LanguageSwitch from '../../components/LanguageSwitch';
import { useTranslation } from 'react-i18next';
import { phoneAuthErrorText } from '../../utils/phoneAuthError';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { referralsApi } from '../../services/api';
import { PENDING_INVITE_KEY, pendingInvite } from '../invite';

type Screen = 'quick' | 'login' | 'register' | 'verify-phone';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { setAuth, quickLoginPhone, biometricEnabled, setBiometricEnabled, saveBiometricPin, getBiometricPin } = useAuthStore();

  // Determine initial screen
  const [screen, setScreen] = useState<Screen>(quickLoginPhone ? 'quick' : 'login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  // Refer a friend: an optional invite code, filled in for them when they came from an invite link (app/invite.tsx)
  const [inviteCode, setInviteCode] = useState(pendingInvite.code);
  const [invite, setInvite] = useState<{ state: 'idle' | 'checking' | 'valid' | 'invalid'; name?: string; amount?: number; min?: number }>({ state: 'idle' });
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [showBioOffer, setShowBioOffer] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [tabsWidth, setTabsWidth] = useState(0);
  const tabAnim = useRef(new Animated.Value(screen === 'register' ? 1 : 0)).current;
  const quickPinRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  useEffect(() => { AsyncStorage.getItem(PENDING_INVITE_KEY).then((c) => { if (c) setInviteCode((v) => v || c); }).catch(() => {}); }, []);
  useEffect(() => {
    const c = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c) { setInvite({ state: 'idle' }); return; }
    if (c.length !== 6) { setInvite({ state: c.length > 6 ? 'invalid' : 'idle' }); return; }
    setInvite({ state: 'checking' });
    let live = true;
    const timer = setTimeout(() => {
      referralsApi.check(c).then(({ data }) => {
        if (!live) return;
        const r = data?.data;
        setInvite(r?.valid ? { state: 'valid', name: r.name, amount: r.friendReward, min: r.minPurchase } : { state: 'invalid' });
      }).catch(() => { if (live) setInvite({ state: 'idle' }); });   // no network: the server checks it again at sign-up
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [inviteCode]);
  const phoneRef = useRef<TextInput>(null);
  const mainPinRef = useRef<TextInput>(null);
  const confirmPinRef = useRef<TextInput>(null);
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

  // Auto-submit quick-login PIN once 4 digits are entered
  useEffect(() => {
    if (screen === 'quick' && pin.length === 4 && !loading) {
      Keyboard.dismiss();
      handleQuickLogin();
    }
  }, [pin]);

  // Auto-verify OTP once 6 digits are entered
  useEffect(() => {
    if (screen === 'verify-phone' && otp.length === 6 && !loading) {
      Keyboard.dismiss();
      handleVerifyAndCreate();
    }
  }, [otp]);

  // Auto-submit login PIN once 4 digits are entered (login mode only — register mode has Confirm PIN after it)
  useEffect(() => {
    if (screen === 'login' && pin.length === 4 && !loading) {
      Keyboard.dismiss();
      handleLogin();
    }
  }, [pin]);

  // Auto-submit register form once Confirm PIN reaches 4 digits (register mode only)
  useEffect(() => {
    if (screen === 'register' && confirmPin.length === 4 && !sendingOtp) {
      Keyboard.dismiss();
      handleRegister();
    }
  }, [confirmPin]);

  async function checkBiometrics() {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBioAvailable(compatible && enrolled);
  }

  const triggerBiometric = useCallback(async () => {
    if (!quickLoginPhone) return;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('auth.unlockPrompt'),
      fallbackLabel: t('auth.usePinInstead'),
      cancelLabel: t('auth.cancel'),
      disableDeviceFallback: false,
    });
    if (!result.success) return;
    // Biometric passed — retrieve saved PIN and auto-login
    const savedPin = await getBiometricPin();
    if (!savedPin) {
      Toast.show({ type: 'error', text1: t('auth.bioIncomplete'), text2: t('auth.signInWithPinOnce') });
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login(quickLoginPhone, savedPin);
      await setAuth(data.data.user, data.data.token);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('auth.loginFailed'), text2: t('auth.signInWithPin') });
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
      Toast.show({ type: 'error', text1: t('auth.enterPin') });
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.login(quickLoginPhone, pin);
      await setAuth(data.data.user, data.data.token);
      if (biometricEnabled) await saveBiometricPin(pin); // keep saved PIN in sync
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setPin('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('auth.loginFailed') });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (rawPhone().length < 10) {
      Toast.show({ type: 'error', text1: t('auth.enterValidPhone10') });
      return;
    }
    if (pin.length !== 4) {
      Toast.show({ type: 'error', text1: t('auth.pinMust4') });
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
      setPin('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Toast.show({ type: 'error', text1: err.response?.data?.error || t('auth.loginFailed') });
    } finally {
      setLoading(false);
    }
  }

  // Step 1: validate form then send OTP via Firebase
  // One code request at a time, set on the first tap: a second request while one is running can hang on iOS (fixed only in
  // Firebase iOS SDK 13), and the auto-send on the 4th PIN digit can land together with a tap
  const otpBusyRef = useRef(false);
  async function handleRegister() {
    if (otpBusyRef.current) return;
    if (!name.trim()) { Toast.show({ type: 'error', text1: t('auth.enterName') }); return; }
    if (rawPhone().length < 10) { Toast.show({ type: 'error', text1: t('auth.enterValidPhone') }); return; }
    if (pin.length !== 4) { Toast.show({ type: 'error', text1: t('auth.pinMust4') }); return; }
    if (pin !== confirmPin) { Toast.show({ type: 'error', text1: t('auth.pinsNoMatch') }); return; }
    setSendingOtp(true);
    otpBusyRef.current = true;
    try {
      const result = await signInWithPhoneNumber(getAuth(), `+1${rawPhone()}`);
      setConfirmation(result);
      setOtp('');
      setResendCooldown(60);
      setScreen('verify-phone');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: t('auth.couldNotSendCode'), text2: phoneAuthErrorText(err, t) });
    } finally {
      otpBusyRef.current = false;
      setSendingOtp(false);
    }
  }

  // Step 2: verify OTP then create account
  async function handleVerifyAndCreate() {
    if (otp.length !== 6) { Toast.show({ type: 'error', text1: t('auth.enterCode6') }); return; }
    setLoading(true);
    try {
      const credential = await confirmation.confirm(otp);
      const firebaseToken = await credential.user.getIdToken();
      const code = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const { data } = await authApi.register(rawPhone(), pin, name.trim(), firebaseToken, code || undefined);
      AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => {});
      pendingInvite.code = '';
      const ref = data.data.referral;
      if (ref?.invitedBy) Toast.show({ type: 'success', text1: t('invite.signupAdded', { name: ref.invitedBy }), text2: t('invite.signupAddedBody', { min: invite.min ?? 10 }) });
      else if (ref?.error) Toast.show({ type: 'info', text1: t('invite.signupNotAdded'), text2: ref.error });
      signOut(getAuth()).catch(() => {});
      await setAuth(data.data.user, data.data.token);
      if (bioAvailable && !biometricEnabled) setShowBioOffer(true);
    } catch (err: any) {
      setOtp('');
      const code = err.code as string | undefined;
      if (code === 'auth/invalid-verification-code') {
        Toast.show({ type: 'error', text1: t('auth.wrongCode') });
      } else if (code === 'auth/code-expired') {
        Toast.show({ type: 'error', text1: t('auth.codeExpired'), text2: t('auth.tapResend') });
      } else {
        Toast.show({ type: 'error', text1: err.response?.data?.error || t('auth.verifyFailed') });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (otpBusyRef.current) return;
    otpBusyRef.current = true;
    setResending(true);
    try {
      const result = await signInWithPhoneNumber(getAuth(), `+1${rawPhone()}`);
      setConfirmation(result);
      setOtp('');
      setResendCooldown(60);
      Toast.show({ type: 'success', text1: t('auth.newCodeSent') });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: t('auth.resendFailed'), text2: phoneAuthErrorText(err, t) });
    } finally {
      otpBusyRef.current = false;
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
      promptMessage: t('auth.confirmIdentityBio'),
      cancelLabel: t('auth.skip'),
    });
    if (result.success) {
      await saveBiometricPin(pin);
      await setBiometricEnabled(true);
      Toast.show({ type: 'success', text1: t('auth.bioEnabled') });
    }
    setShowBioOffer(false);
  }

  // ── Biometric enrollment offer ──
  if (showBioOffer) {
    const bioType = Platform.OS === 'ios' ? t('auth.bioTypeIos') : t('auth.bioTypeAndroid');
    return (
      <View style={styles.bioOfferRoot}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.bioOfferCard}>
          <View style={styles.bioIconRing}>
            <ShieldIcon size={38} color={COLORS.primary} strokeWidth={1.75} />
          </View>
          <Text style={styles.bioOfferTitle}>{t('auth.enableBioQ', { type: bioType })}</Text>
          <Text style={styles.bioOfferDesc}>{t('auth.enableBioDesc', { type: bioType })}</Text>
          <TouchableOpacity style={styles.bioOfferBtn} onPress={enableBiometric}>
            <Text style={styles.bioOfferBtnText}>{t('auth.enableBio', { type: bioType })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bioOfferSkip} onPress={() => setShowBioOffer(false)}>
            <Text style={styles.bioOfferSkipText}>{t('auth.notNow')}</Text>
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
      <KeyboardSafe style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.safeTop} />
        <ScrollView contentContainerStyle={styles.scrollQuick} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require('../../assets/store-icon-512.png')} style={styles.logoMark} />
            <Text style={styles.logo}>Lucky Stop</Text>
            <Text style={styles.tagline}>{t('auth.welcomeBack')}</Text>
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
                    {Platform.OS === 'ios' ? t('auth.useFaceId') : t('auth.useFingerprint')}
                  </Text>
                </TouchableOpacity>
                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>{t('auth.orEnterPin')}</Text>
                  <View style={styles.orLine} />
                </View>
              </>
            ) : null}

            <Text style={styles.label}>{t('auth.pinLabel')}</Text>
            <TextInput
              ref={quickPinRef}
              style={[styles.input, styles.pinInput, focusedInput === 'quickPin' && styles.inputFocused]}
              placeholder="••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              value={pin}
              onChangeText={setPin}
              maxLength={4}
              autoFocus={!biometricEnabled}
              returnKeyType="done"
              onFocus={() => setFocusedInput('quickPin')}
              onBlur={() => setFocusedInput(null)}
            />

            <TouchableOpacity style={styles.button} onPress={handleQuickLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => { setScreen('login'); setPin(''); }}
            >
              <Text style={styles.switchLinkText}>{t('auth.useDifferentAccount')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => router.push('/(auth)/forgot-pin')}
            >
              <Text style={[styles.switchLinkText, { color: COLORS.textMuted, fontSize: 13 }]}>{t('auth.forgotPin')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardSafe>
    );
  }

  // ── Verify phone (OTP entry) ──
  if (screen === 'verify-phone') {
    const displayPhone = rawPhone().length === 10
      ? `(${rawPhone().slice(0, 3)}) ${rawPhone().slice(3, 6)}-${rawPhone().slice(6)}`
      : phone;
    return (
      <KeyboardSafe style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.safeTop} />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require('../../assets/store-icon-512.png')} style={styles.logoMark} />
            <Text style={styles.logo}>Lucky Stop</Text>
            <Text style={styles.tagline}>{t('auth.verifyNumber')}</Text>
          </View>

          <View style={styles.form}>
            <View style={vp.phoneBadge}>
              <Text style={vp.phoneBadgeLabel}>{t('auth.codeSentTo')}</Text>
              <Text style={vp.phoneBadgeNumber}>{displayPhone}</Text>
            </View>

            <Text style={styles.label}>{t('auth.codeLabel')}</Text>
            <TextInput
              style={[styles.input, vp.otpInput, focusedInput === 'otp' && styles.inputFocused]}
              placeholder="••••••"
              placeholderTextColor={COLORS.textMuted}
keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              autoFocus
              returnKeyType="done"
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
                : <Text style={styles.buttonText}>{t('auth.verifyCreate')}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={resendCooldown > 0 || resending ? undefined : handleResendOtp}
              disabled={resendCooldown > 0 || resending}
            >
              <Text style={[styles.switchLinkText, (resendCooldown > 0) && { color: COLORS.textMuted }]}>
                {resending ? t('auth.sending') : resendCooldown > 0 ? t('auth.resendIn', { seconds: resendCooldown }) : t('auth.resendCode')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => { setScreen('register'); setOtp(''); setConfirmation(null); }}
            >
              <Text style={[styles.switchLinkText, { color: COLORS.textMuted, fontSize: 13 }]}>{t('auth.changeNumber')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardSafe>
    );
  }

  // ── Full login / register ──
  return (
    <KeyboardSafe style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeTop} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/store-icon-512.png')} style={styles.logoMark} />
          <Text style={styles.logo}>Lucky Stop</Text>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          <View style={{ marginTop: 14 }}><LanguageSwitch /></View>
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
            <Text style={[styles.tabText, screen === 'login' && styles.tabTextActive]}>{t('auth.signIn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => switchTab('register')}>
            <Text style={[styles.tabText, screen === 'register' && styles.tabTextActive]}>{t('auth.createAccount')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {screen === 'register' && (
            <>
              <Text style={styles.label}>{t('auth.yourName')}</Text>
              <TextInput
                ref={nameRef}
                style={[styles.input, focusedInput === 'name' && styles.inputFocused]}
                placeholder={t('auth.namePlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                onFocus={() => setFocusedInput('name')}
                onBlur={() => setFocusedInput(null)}
              />
              <Text style={styles.label}>{t('invite.signupLabel')}</Text>
              <TextInput
                style={[styles.input, focusedInput === 'invite' && styles.inputFocused, { letterSpacing: inviteCode ? 2 : 0 }]}
                placeholder="ABC234"
                placeholderTextColor={COLORS.textMuted}
                value={inviteCode}
                onChangeText={(v) => setInviteCode(v.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                onFocus={() => setFocusedInput('invite')}
                onBlur={() => setFocusedInput(null)}
                accessibilityHint={t('invite.signupLabel')}
              />
              {invite.state !== 'idle' && (
                <Text style={[styles.pinHint, { color: invite.state === 'valid' ? COLORS.success : invite.state === 'invalid' ? COLORS.error : COLORS.textMuted }]} accessibilityLiveRegion="polite">
                  {invite.state === 'checking' ? t('invite.signupChecking')
                    : invite.state === 'valid' ? t('invite.signupValid', { name: invite.name, amount: invite.amount, min: invite.min })
                    : t('invite.signupInvalid')}
                </Text>
              )}
            </>
          )}

          <Text style={styles.label}>{t('auth.phoneLabel')}</Text>
          <TextInput
            ref={phoneRef}
            style={[styles.input, focusedInput === 'phone' && styles.inputFocused]}
            placeholder="(555) 000-0000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            returnKeyType="next"
            onSubmitEditing={() => mainPinRef.current?.focus()}
            onFocus={() => setFocusedInput('phone')}
            onBlur={() => setFocusedInput(null)}
          />

          <Text style={styles.label}>{t('auth.pinLabel')}</Text>
          <TextInput
            ref={mainPinRef}
            style={[styles.input, styles.pinInput, focusedInput === 'pin' && styles.inputFocused]}
            placeholder="••••"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            maxLength={4}
            returnKeyType={screen === 'register' ? 'next' : 'done'}
            onSubmitEditing={() => { if (screen === 'register') confirmPinRef.current?.focus(); }}
            onFocus={() => setFocusedInput('pin')}
            onBlur={() => setFocusedInput(null)}
          />

          {screen === 'register' && (
            <>
              <Text style={styles.label}>{t('auth.confirmPin')}</Text>
              <TextInput
                ref={confirmPinRef}
                style={[styles.input, styles.pinInput, focusedInput === 'confirmPin' && styles.inputFocused]}
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                value={confirmPin}
                onChangeText={setConfirmPin}
                maxLength={4}
                returnKeyType="done"
                onFocus={() => setFocusedInput('confirmPin')}
                onBlur={() => setFocusedInput(null)}
              />
              <Text style={styles.pinHint}>{t('auth.pinHint')}</Text>
            </>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={screen === 'login' ? handleLogin : handleRegister}
            disabled={loading || sendingOtp}
          >
            {loading || sendingOtp
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{screen === 'login' ? t('auth.signIn') : t('auth.sendCode')}</Text>
            }
          </TouchableOpacity>

          {screen === 'login' && (
            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => router.push('/(auth)/forgot-pin')}
            >
              <Text style={styles.switchLinkText}>{t('auth.forgotPin')}</Text>
            </TouchableOpacity>
          )}

          {quickLoginPhone && (
            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => { setScreen('quick'); setPin(''); setPhone(''); }}
            >
              <Text style={styles.switchLinkText}>{t('auth.backToQuick')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardSafe>
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
