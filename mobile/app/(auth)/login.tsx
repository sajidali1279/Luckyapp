import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Screen = 'login' | 'register';

export default function LoginScreen() {
  const [screen, setScreen] = useState<Screen>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  function formatPhone(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function rawPhone() {
    return phone.replace(/\D/g, '');
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
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Registration failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 36, fontWeight: '800', color: COLORS.primary },
  tagline: { fontSize: 16, color: COLORS.textMuted, marginTop: 8 },
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
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 16, fontSize: 16, color: COLORS.text,
  },
  pinInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  pinHint: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    padding: 18, alignItems: 'center', marginTop: 20,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
