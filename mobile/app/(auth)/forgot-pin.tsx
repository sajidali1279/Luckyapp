import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { authApi } from '../../services/api';
import { COLORS } from '../../constants';

type Step = 'request' | 'verify' | 'reset' | 'done';

export default function ForgotPinScreen() {
  const [step, setStep] = useState<Step>('request');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp() {
    if (phone.length < 10) {
      Toast.show({ type: 'error', text1: 'Enter a valid phone number' });
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPin(phone.trim(), email.trim() || undefined);
      Toast.show({ type: 'success', text1: 'OTP sent!', text2: 'Check your email for the 6-digit code.' });
      setStep('verify');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to send OTP' });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      Toast.show({ type: 'error', text1: 'Enter the 6-digit code' });
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(phone.trim(), otp.trim());
      setResetToken(res.data.data?.resetToken ?? res.data.resetToken);
      setStep('reset');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Invalid or expired code' });
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

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <SafeAreaView style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Forgot PIN</Text>
        <View style={{ width: 60 }} />
      </SafeAreaView>

      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

          {/* ── Step indicator ── */}
          <View style={s.steps}>
            {(['request', 'verify', 'reset'] as Step[]).map((st, i) => (
              <View key={st} style={s.stepRow}>
                <View style={[s.stepDot, step === st && s.stepDotActive, (step === 'verify' && i === 0) || (step === 'reset' && i < 2) || step === 'done' ? s.stepDotDone : {}]}>
                  <Text style={s.stepDotText}>{i + 1}</Text>
                </View>
                {i < 2 && <View style={s.stepLine} />}
              </View>
            ))}
          </View>

          {/* ── Step: Request OTP ── */}
          {step === 'request' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Enter your phone number</Text>
              <Text style={s.cardSub}>We'll send a 6-digit code to your recovery email.</Text>

              <Text style={s.label}>Phone Number</Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+1 555 000 0000"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />

              <Text style={s.label}>Recovery Email (optional)</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="your@email.com"
                placeholderTextColor={COLORS.textMuted}
              />

              <TouchableOpacity style={s.btn} onPress={handleRequestOtp} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send Code</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step: Verify OTP ── */}
          {step === 'verify' && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Enter the 6-digit code</Text>
              <Text style={s.cardSub}>Check your email for the OTP. It expires in 10 minutes.</Text>

              <Text style={s.label}>OTP Code</Text>
              <TextInput
                style={[s.input, s.otpInput]}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="······"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />

              <TouchableOpacity style={s.btn} onPress={handleVerifyOtp} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Verify Code</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={s.linkBtn} onPress={() => setStep('request')}>
                <Text style={s.linkBtnText}>Didn't receive it? Go back</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step: Reset PIN ── */}
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

              <TouchableOpacity style={s.btn} onPress={handleResetPin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Reset PIN</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <View style={[s.card, s.doneCard]}>
              <Text style={s.doneIcon}>✅</Text>
              <Text style={s.cardTitle}>PIN Reset!</Text>
              <Text style={s.cardSub}>Your PIN has been updated. You can now log in with your new PIN.</Text>
              <TouchableOpacity style={s.btn} onPress={() => router.replace('/(auth)/login')}>
                <Text style={s.btnText}>Go to Login</Text>
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
  backBtn: { width: 60 },
  backBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  body: { padding: 20, gap: 20, paddingBottom: 40 },

  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 4 },
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

  card: {
    backgroundColor: COLORS.white, borderRadius: 20, padding: 20,
    gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },

  label: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: -4 },
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
  doneIcon: { fontSize: 56 },
});
