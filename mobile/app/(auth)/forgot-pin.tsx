import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, StatusBar, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAuth, signInWithPhoneNumber, signOut } from '@react-native-firebase/auth';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { authApi } from '../../services/api';
import { COLORS } from '../../constants';
import { ChevronLeftIcon, CheckCircleIcon } from '../../components/Icons';

type Step = 'phone' | 'verify' | 'reset' | 'done';

export default function ForgotPinScreen() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmation, setConfirmation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Auto-verify OTP once 6 digits are entered
  useEffect(() => {
    if (step === 'verify' && otp.length === 6 && !loading) {
      Keyboard.dismiss();
      handleVerifyOtp();
    }
  }, [otp]);

  function rawPhone() {
    return phone.replace(/\D/g, '');
  }

  function formatPhone(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  async function handleSendOtp() {
    if (rawPhone().length < 10) {
      Toast.show({ type: 'error', text1: 'Enter a valid 10-digit phone number' });
      return;
    }
    setSendingOtp(true);
    try {
      const result = await signInWithPhoneNumber(getAuth(), `+1${rawPhone()}`);
      setConfirmation(result);
      setOtp('');
      setResendCooldown(60);
      setStep('verify');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not send code', text2: err.message || 'Check the number and try again' });
    } finally {
      setSendingOtp(false);
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

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      Toast.show({ type: 'error', text1: 'Enter the 6-digit code' });
      return;
    }
    setLoading(true);
    try {
      const credential = await confirmation.confirm(otp);
      const firebaseToken = await credential.user.getIdToken();
      signOut(getAuth()).catch(() => {});
      const res = await authApi.verifyFirebaseReset(firebaseToken);
      setResetToken(res.data.resetToken);
      setStep('reset');
    } catch (err: any) {
      setOtp('');
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

  async function handleResetPin() {
    if (newPin.length !== 4) {
      Toast.show({ type: 'error', text1: 'PIN must be 4 digits' });
      return;
    }
    if (newPin !== confirmPin) {
      Toast.show({ type: 'error', text1: 'PINs do not match' });
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPin(resetToken, newPin);
      setStep('done');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to reset PIN' });
    } finally {
      setLoading(false);
    }
  }

  const displayPhone = rawPhone().length === 10
    ? `(${rawPhone().slice(0, 3)}) ${rawPhone().slice(3, 6)}-${rawPhone().slice(6)}`
    : phone;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <SafeAreaView style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ChevronLeftIcon size={22} color="rgba(255,255,255,0.85)" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Reset PIN</Text>
        <View style={{ width: 44 }} />
      </SafeAreaView>

      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

          {/* Step indicator — 3 steps */}
          {step !== 'done' && (
            <View style={s.steps}>
              {(['phone', 'verify', 'reset'] as Step[]).map((st, i) => {
                const stepIndex = ['phone', 'verify', 'reset'].indexOf(step);
                const isDone = i < stepIndex;
                const isActive = step === st;
                return (
                  <View key={st} style={s.stepRow}>
                    <View style={[s.stepDot, isActive && s.stepDotActive, isDone && s.stepDotDone]}>
                      <Text style={s.stepDotText}>{i + 1}</Text>
                    </View>
                    {i < 2 && <View style={[s.stepLine, isDone && s.stepLineDone]} />}
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Step 1: Phone number ── */}
          {step === 'phone' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Verify your number</Text>
              <Text style={s.cardSub}>We'll send a verification code to your phone via SMS.</Text>

              <Text style={s.label}>Phone Number</Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={(t) => setPhone(formatPhone(t))}
                keyboardType="phone-pad"
                placeholder="(555) 000-0000"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[s.btn, (sendingOtp || rawPhone().length < 10) && { opacity: 0.6 }]}
                onPress={handleSendOtp}
                disabled={sendingOtp || rawPhone().length < 10}
              >
                {sendingOtp
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Send Verification Code</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 2: Verify SMS code ── */}
          {step === 'verify' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Enter the code</Text>

              <View style={s.phoneBadge}>
                <Text style={s.phoneBadgeLabel}>Code sent to</Text>
                <Text style={s.phoneBadgeNumber}>{displayPhone}</Text>
              </View>

              <Text style={s.label}>6-Digit Code</Text>
              <TextInput
                style={[s.input, s.otpInput]}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[s.btn, (loading || otp.length < 6) && { opacity: 0.6 }]}
                onPress={handleVerifyOtp}
                disabled={loading || otp.length < 6}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Verify Code</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={s.linkBtn}
                onPress={resendCooldown > 0 || resending ? undefined : handleResendOtp}
                disabled={resendCooldown > 0 || resending}
              >
                <Text style={[s.linkBtnText, (resendCooldown > 0) && { color: COLORS.textMuted }]}>
                  {resending ? 'Sending…' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.linkBtn} onPress={() => { setStep('phone'); setOtp(''); setConfirmation(null); }}>
                <Text style={[s.linkBtnText, { color: COLORS.textMuted, fontSize: 13 }]}>← Change number</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 3: Set new PIN ── */}
          {step === 'reset' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Set a new PIN</Text>
              <Text style={s.cardSub}>Choose a 4-digit PIN you haven't used recently.</Text>

              <Text style={s.label}>New PIN</Text>
              <TextInput
                style={[s.input, s.pinInput]}
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />

              <Text style={s.label}>Confirm New PIN</Text>
              <TextInput
                style={[s.input, s.pinInput]}
                value={confirmPin}
                onChangeText={setConfirmPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
              />

              <TouchableOpacity
                style={[s.btn, loading && { opacity: 0.6 }]}
                onPress={handleResetPin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Reset PIN</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <View style={[s.card, s.doneCard]}>
              <View style={s.doneIconRing}>
                <CheckCircleIcon size={36} color="#2DC653" strokeWidth={1.75} />
              </View>
              <Text style={s.cardTitle}>PIN Reset!</Text>
              <Text style={s.cardSub}>Your PIN has been updated. You can now sign in with your new PIN.</Text>
              <TouchableOpacity style={s.btn} onPress={() => router.replace('/(auth)/login')}>
                <Text style={s.btnText}>Go to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  fill: { flex: 1 },
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  body: { padding: 20, gap: 20, paddingBottom: 40 },

  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: COLORS.primary },
  stepDotDone: { backgroundColor: '#2DC653' },
  stepDotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepLine: { width: 32, height: 2, backgroundColor: COLORS.border, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: '#2DC653' },

  card: {
    backgroundColor: COLORS.white, borderRadius: 20, padding: 20,
    gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },

  phoneBadge: {
    backgroundColor: COLORS.secondary + '12', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.secondary + '25',
  },
  phoneBadgeLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  phoneBadgeNumber: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginTop: 3 },

  label: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: -4,
  },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.background,
  },
  otpInput: { fontSize: 28, letterSpacing: 8, textAlign: 'center' },
  pinInput: { fontSize: 28, letterSpacing: 12, textAlign: 'center' },

  btn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },

  doneCard: { alignItems: 'center', paddingVertical: 32, gap: 16 },
  doneIconRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#2DC65315',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#2DC65330',
  },
});
