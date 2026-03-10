import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Panel = null | 'name' | 'pin';

export default function ProfileScreen() {
  const { user, token, logout, setAuth } = useAuthStore();
  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState(user?.name || '');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleUpdateName() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Name cannot be empty' }); return; }
    setLoading(true);
    try {
      const { data } = await authApi.updateProfile(name.trim());
      if (user && token) {
        await setAuth({ ...user, name: name.trim() }, token);
      }
      Toast.show({ type: 'success', text1: 'Name updated!' });
      setPanel(null);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to update name' });
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePin() {
    if (currentPin.length !== 4) { Toast.show({ type: 'error', text1: 'Enter your current 4-digit PIN' }); return; }
    if (newPin.length !== 4) { Toast.show({ type: 'error', text1: 'New PIN must be 4 digits' }); return; }
    if (newPin !== confirmPin) { Toast.show({ type: 'error', text1: 'PINs do not match' }); return; }
    setLoading(true);
    try {
      await authApi.changePin(currentPin, newPin);
      Toast.show({ type: 'success', text1: 'PIN changed successfully!' });
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
      setPanel(null);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to change PIN' });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profile</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {/* Avatar + info */}
        <View style={s.avatarCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(user?.name || user?.phone || '?')[0].toUpperCase()}</Text>
          </View>
          <Text style={s.profileName}>{user?.name || 'No name set'}</Text>
          <Text style={s.profilePhone}>{user?.phone}</Text>
        </View>

        {/* Settings items */}
        <Text style={s.sectionLabel}>Account Settings</Text>

        <TouchableOpacity style={s.settingRow} onPress={() => setPanel(panel === 'name' ? null : 'name')}>
          <Text style={s.settingIcon}>✏️</Text>
          <View style={s.settingText}>
            <Text style={s.settingTitle}>Update Name</Text>
            <Text style={s.settingValue}>{user?.name || 'Not set'}</Text>
          </View>
          <Text style={s.chevron}>{panel === 'name' ? '∧' : '›'}</Text>
        </TouchableOpacity>

        {panel === 'name' && (
          <View style={s.panelCard}>
            <Text style={s.panelLabel}>Display Name</Text>
            <TextInput
              style={s.panelInput}
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
              autoFocus
            />
            <TouchableOpacity style={s.panelBtn} onPress={handleUpdateName} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>Save Name</Text>}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={s.settingRow} onPress={() => setPanel(panel === 'pin' ? null : 'pin')}>
          <Text style={s.settingIcon}>🔒</Text>
          <View style={s.settingText}>
            <Text style={s.settingTitle}>Change PIN</Text>
            <Text style={s.settingValue}>••••</Text>
          </View>
          <Text style={s.chevron}>{panel === 'pin' ? '∧' : '›'}</Text>
        </TouchableOpacity>

        {panel === 'pin' && (
          <View style={s.panelCard}>
            <Text style={s.panelLabel}>Current PIN</Text>
            <TextInput style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4} value={currentPin} onChangeText={setCurrentPin} placeholder="••••" placeholderTextColor={COLORS.textMuted} autoFocus />
            <Text style={s.panelLabel}>New PIN</Text>
            <TextInput style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4} value={newPin} onChangeText={setNewPin} placeholder="••••" placeholderTextColor={COLORS.textMuted} />
            <Text style={s.panelLabel}>Confirm New PIN</Text>
            <TextInput style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4} value={confirmPin} onChangeText={setConfirmPin} placeholder="••••" placeholderTextColor={COLORS.textMuted} />
            <TouchableOpacity style={s.panelBtn} onPress={handleChangePin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>Change PIN</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Sign out */}
        <View style={s.divider} />
        <TouchableOpacity style={s.signOutBtn} onPress={handleLogout}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: COLORS.primary },
  backBtn: { padding: 8 },
  backText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  body: { padding: 20, gap: 10, paddingBottom: 40 },

  avatarCard: { backgroundColor: COLORS.white, borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  profileName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  profilePhone: { color: COLORS.textMuted, marginTop: 4, fontSize: 14 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },

  settingRow: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { fontSize: 22 },
  settingText: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  settingValue: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  chevron: { fontSize: 18, color: COLORS.textMuted },

  panelCard: { backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 8, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -10, paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.border },
  panelLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  panelInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 14, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.background },
  pinInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  panelBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  panelBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  signOutBtn: { backgroundColor: COLORS.white, borderRadius: 14, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: COLORS.error + '40' },
  signOutText: { color: COLORS.error, fontWeight: '700', fontSize: 16 },
});
