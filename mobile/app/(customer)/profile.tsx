import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
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

  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();

  async function handleUpdateName() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Name cannot be empty' }); return; }
    setLoading(true);
    try {
      await authApi.updateProfile(name.trim());
      if (user && token) setAuth({ ...user, name: name.trim() }, token);
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

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerInner}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{user?.name || 'No name set'}</Text>
            <Text style={s.headerPhone}>{user?.phone}</Text>
          </View>
          <View style={s.memberBadge}>
            <Text style={s.memberBadgeText}>Member</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={s.fill}
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Account Settings ── */}
        <Text style={s.sectionLabel}>Account Settings</Text>

        {/* Update Name */}
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => setPanel(panel === 'name' ? null : 'name')}
          activeOpacity={0.8}
        >
          <View style={[s.settingIconBg, { backgroundColor: COLORS.primary + '18' }]}>
            <Text style={s.settingEmoji}>✏️</Text>
          </View>
          <View style={s.settingBody}>
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

        {/* Change PIN */}
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => setPanel(panel === 'pin' ? null : 'pin')}
          activeOpacity={0.8}
        >
          <View style={[s.settingIconBg, { backgroundColor: COLORS.secondary + '18' }]}>
            <Text style={s.settingEmoji}>🔒</Text>
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>Change PIN</Text>
            <Text style={s.settingValue}>••••</Text>
          </View>
          <Text style={s.chevron}>{panel === 'pin' ? '∧' : '›'}</Text>
        </TouchableOpacity>

        {panel === 'pin' && (
          <View style={s.panelCard}>
            <Text style={s.panelLabel}>Current PIN</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]}
              secureTextEntry keyboardType="number-pad" maxLength={4}
              value={currentPin} onChangeText={setCurrentPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted} autoFocus
            />
            <Text style={s.panelLabel}>New PIN</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]}
              secureTextEntry keyboardType="number-pad" maxLength={4}
              value={newPin} onChangeText={setNewPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted}
            />
            <Text style={s.panelLabel}>Confirm New PIN</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]}
              secureTextEntry keyboardType="number-pad" maxLength={4}
              value={confirmPin} onChangeText={setConfirmPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity style={s.panelBtn} onPress={handleChangePin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>Change PIN</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── App Info ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>Rewards Info</Text>

        <View style={s.infoCard}>
          <InfoRow icon="💵" label="Earn rate" value="5¢ per $1 spent" />
          <View style={s.infoDivider} />
          <InfoRow icon="🎁" label="Redeem" value="Use balance in-store" />
          <View style={s.infoDivider} />
          <InfoRow icon="📍" label="Locations" value="All Lucky Stop stores" />
        </View>

        {/* ── Sign Out ── */}
        <TouchableOpacity style={s.signOutBtn} onPress={() => logout()} activeOpacity={0.85}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoRowIcon}>{icon}</Text>
      <Text style={s.infoRowLabel}>{label}</Text>
      <Text style={s.infoRowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  fill: { flex: 1 },

  // Header
  headerBg: { backgroundColor: COLORS.primary },
  headerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20,
  },
  avatarCircle: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerInfo: { flex: 1 },
  headerName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerPhone: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 3 },
  memberBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  memberBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Body
  body: { padding: 16, gap: 10, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2,
  },

  // Setting rows
  settingRow: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  settingIconBg: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  settingEmoji: { fontSize: 20 },
  settingBody: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  settingValue: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  chevron: { fontSize: 20, color: COLORS.textMuted, fontWeight: '300' },

  // Panel
  panelCard: {
    backgroundColor: COLORS.white, borderRadius: 16,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    padding: 16, gap: 8, marginTop: -10, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  panelLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  panelInput: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.background,
  },
  pinInput: { fontSize: 28, letterSpacing: 12, textAlign: 'center' },
  panelBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    padding: 15, alignItems: 'center', marginTop: 4,
  },
  panelBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Info card
  infoCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  infoRowIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  infoRowLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, flex: 1 },
  infoRowValue: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  infoDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 },

  // Sign out
  signOutBtn: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 8,
    borderWidth: 1.5, borderColor: COLORS.error + '35',
  },
  signOutText: { color: COLORS.error, fontWeight: '800', fontSize: 16 },
});
