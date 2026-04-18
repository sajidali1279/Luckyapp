import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, ActivityIndicator, Switch, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as LocalAuthentication from 'expo-local-authentication';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { authApi, promotionsApi, leaderboardApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';

type Panel = null | 'name' | 'pin' | 'email';

interface InfoRowDef { icon: string; label: string; value: string }

interface Props {
  /** true = COLORS.primary header + balance badge + email panel */
  isCustomer?: boolean;
}

export default function ProfileScreen({ isCustomer = false }: Props) {
  const { user, token, logout, setAuth, biometricEnabled, setBiometricEnabled } = useAuthStore();
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(async (hw) => {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBioAvailable(hw && enrolled);
    });
  }, []);

  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState(user?.name || '');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [email, setEmail] = useState((user as any)?.email || '');
  const [loading, setLoading] = useState(false);

  // Business promotion modal state
  const [promoModalVisible, setPromoModalVisible] = useState(false);
  const [promoName, setPromoName] = useState(user?.name || '');
  const [promoPhone, setPromoPhone] = useState(user?.phone || '');
  const [promoBusinessName, setPromoBusinessName] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [promoWebsite, setPromoWebsite] = useState('');
  const [promoImageUri, setPromoImageUri] = useState<string | null>(null);

  const { data: myPromoData } = useQuery({
    queryKey: ['my-promo-request'],
    queryFn: () => promotionsApi.getMy(),
    enabled: isCustomer,
  });
  const myPromo = myPromoData?.data?.data;

  // Employee: show rating summary for first assigned store
  const primaryStoreId = !isCustomer ? (user?.storeIds?.[0] ?? null) : null;
  const { data: ratingData } = useQuery({
    queryKey: ['my-rating-summary', primaryStoreId],
    queryFn: () => leaderboardApi.getMyRatingSummary(primaryStoreId!),
    enabled: !isCustomer && !!primaryStoreId,
  });
  const myRating = ratingData?.data?.data;

  const qc = useQueryClient();

  const submitPromoMutation = useMutation({
    mutationFn: () => promotionsApi.submit({
      requesterName: promoName.trim(),
      requesterPhone: promoPhone.trim(),
      businessName: promoBusinessName.trim(),
      businessDescription: promoDesc.trim(),
      website: promoWebsite.trim() || undefined,
      imageUri: promoImageUri || undefined,
    }),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Request submitted!', text2: "We'll reach out soon." });
      qc.invalidateQueries({ queryKey: ['my-promo-request'] });
      setPromoModalVisible(false);
      setPromoImageUri(null);
    },
    onError: (err: any) => {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to submit request' });
    },
  });

  async function pickPromoImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission needed', text2: 'Allow photo access to upload a business image.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPromoImageUri(result.assets[0].uri);
    }
  }

  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();
  const roleLabel = user?.role?.replace(/_/g, ' ') ?? '';
  const headerBg = isCustomer ? COLORS.primary : COLORS.secondary;

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
    } finally { setLoading(false); }
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
    } finally { setLoading(false); }
  }

  async function handleUpdateEmail() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Toast.show({ type: 'error', text1: 'Enter a valid email address' });
      return;
    }
    setLoading(true);
    try {
      await authApi.updateEmail(email.trim());
      Toast.show({ type: 'success', text1: 'Recovery email saved!' });
      setPanel(null);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to save email' });
    } finally { setLoading(false); }
  }

  const staffInfoRows: InfoRowDef[] = [
    { icon: '⛽', label: 'Store', value: user?.storeIds?.length ? `${user.storeIds.length} store(s) assigned` : 'No store assigned' },
    { icon: '🛡️', label: 'Role', value: roleLabel },
    { icon: '📱', label: 'Phone', value: user?.phone || '—' },
  ];

  const customerInfoRows: InfoRowDef[] = [
    { icon: '🎁', label: 'Redeem', value: 'Use points at any location' },
    { icon: '📍', label: 'Locations', value: 'All Lucky Stop stores' },
  ];

  const infoRows = isCustomer ? customerInfoRows : staffInfoRows;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={headerBg} />

      {/* ── Header ── */}
      <SafeAreaView style={[s.headerBg, { backgroundColor: headerBg }]}>
        <View style={s.headerInner}>
          <View style={[s.avatarCircle, isCustomer ? s.avatarCustomer : s.avatarStaff]}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{user?.name || 'No name set'}</Text>
            <Text style={s.headerPhone}>{user?.phone}</Text>
          </View>

          {/* Right badge — balance for customer, role pill for staff */}
          {isCustomer ? (
            <View style={s.balanceBadge}>
              <Text style={s.balanceBadgeAmt}>{Math.round(Number(user?.pointsBalance || 0) * 100).toLocaleString()}</Text>
              <Text style={s.balanceBadgeLbl}>pts</Text>
            </View>
          ) : (
            <View style={s.rolePill}>
              <Text style={s.rolePillText}>{roleLabel}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView style={s.fill} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* ── Account Settings ── */}
        <Text style={s.sectionLabel}>Account Settings</Text>

        {/* Update Name */}
        <TouchableOpacity style={s.settingRow} onPress={() => setPanel(panel === 'name' ? null : 'name')} activeOpacity={0.8}>
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
              style={s.panelInput} value={name} onChangeText={setName}
              placeholder="Your full name" placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words" autoFocus
            />
            <TouchableOpacity style={s.panelBtn} onPress={handleUpdateName} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>Save Name</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Change PIN */}
        <TouchableOpacity style={s.settingRow} onPress={() => setPanel(panel === 'pin' ? null : 'pin')} activeOpacity={0.8}>
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
              style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4}
              value={currentPin} onChangeText={setCurrentPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted} autoFocus
            />
            <Text style={s.panelLabel}>New PIN</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4}
              value={newPin} onChangeText={setNewPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted}
            />
            <Text style={s.panelLabel}>Confirm New PIN</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4}
              value={confirmPin} onChangeText={setConfirmPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity style={s.panelBtn} onPress={handleChangePin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>Change PIN</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Recovery Email — customers only */}
        {isCustomer && (
          <>
            <TouchableOpacity style={s.settingRow} onPress={() => setPanel(panel === 'email' ? null : 'email')} activeOpacity={0.8}>
              <View style={[s.settingIconBg, { backgroundColor: '#00B4D818' }]}>
                <Text style={s.settingEmoji}>📧</Text>
              </View>
              <View style={s.settingBody}>
                <Text style={s.settingTitle}>Recovery Email</Text>
                <Text style={s.settingValue}>{email || 'Not set — add for PIN recovery'}</Text>
              </View>
              <Text style={s.chevron}>{panel === 'email' ? '∧' : '›'}</Text>
            </TouchableOpacity>

            {panel === 'email' && (
              <View style={s.panelCard}>
                <Text style={s.panelLabel}>Email Address</Text>
                <TextInput
                  style={s.panelInput} value={email} onChangeText={setEmail}
                  keyboardType="email-address" autoCapitalize="none"
                  placeholder="your@email.com" placeholderTextColor={COLORS.textMuted} autoFocus
                />
                <Text style={s.emailHint}>Used to recover your account if you forget your PIN.</Text>
                <TouchableOpacity style={s.panelBtn} onPress={handleUpdateEmail} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>Save Email</Text>}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Promote Your Business — customers only */}
        {isCustomer && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 8 }]}>Advertising</Text>
            <TouchableOpacity
              style={s.settingRow}
              onPress={() => setPromoModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={[s.settingIconBg, { backgroundColor: '#f9731618' }]}>
                <Text style={s.settingEmoji}>📣</Text>
              </View>
              <View style={s.settingBody}>
                <Text style={s.settingTitle}>Promote Your Business</Text>
                <Text style={s.settingValue}>
                  {myPromo?.status === 'PENDING'
                    ? 'Request submitted — under review'
                    : myPromo?.status === 'APPROVED'
                    ? 'Your ad is live!'
                    : myPromo?.status === 'REJECTED'
                    ? 'Request not approved — tap to reapply'
                    : 'Advertise to Lucky Stop customers'}
                </Text>
              </View>
              {myPromo?.status === 'APPROVED'
                ? <Text style={[s.chevron, { color: '#2DC653', fontSize: 18 }]}>✓</Text>
                : myPromo?.status === 'PENDING'
                ? <Text style={[s.chevron, { color: '#f97316', fontSize: 14 }]}>Pending</Text>
                : <Text style={s.chevron}>›</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* Biometric toggle */}
        {bioAvailable && (
          <View style={s.settingRow}>
            <View style={[s.settingIconBg, { backgroundColor: '#6C5CE718' }]}>
              <Text style={s.settingEmoji}>🔐</Text>
            </View>
            <View style={s.settingBody}>
              <Text style={s.settingTitle}>Biometric Login</Text>
              <Text style={s.settingValue}>{biometricEnabled ? 'Enabled' : 'Disabled'}</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={async (val) => {
                if (val) {
                  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to enable' });
                  if (r.success) { await setBiometricEnabled(true); Toast.show({ type: 'success', text1: 'Biometric login enabled' }); }
                } else {
                  await setBiometricEnabled(false);
                }
              }}
              trackColor={{ false: COLORS.border, true: COLORS.primary + '80' }}
              thumbColor={biometricEnabled ? COLORS.primary : '#f4f3f4'}
            />
          </View>
        )}

        {/* ── Leaderboard ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>Community</Text>
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => router.push(isCustomer ? '/(customer)/leaderboard' : '/(employee)/leaderboard')}
          activeOpacity={0.8}
        >
          <View style={[s.settingIconBg, { backgroundColor: '#FFD70020' }]}>
            <Text style={s.settingEmoji}>🏆</Text>
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{isCustomer ? 'Customer Leaderboard' : 'Staff Rankings'}</Text>
            <Text style={s.settingValue}>
              {isCustomer
                ? 'See how you rank among all Lucky Stop customers'
                : myRating?.allTime?.count
                  ? `${myRating.allTime.avg.toFixed(1)} ★ avg · ${myRating.allTime.count} review${myRating.allTime.count !== 1 ? 's' : ''}`
                  : 'See employee rankings at your store'}
            </Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        {/* ── Info Card ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>{isCustomer ? 'Rewards Info' : 'App Info'}</Text>
        <View style={s.infoCard}>
          {infoRows.map((row, i) => (
            <View key={row.label}>
              <InfoRow {...row} />
              {i < infoRows.length - 1 && <View style={s.infoDivider} />}
            </View>
          ))}
        </View>

        {/* ── Sign Out ── */}
        <TouchableOpacity style={s.signOutBtn} onPress={() => logout()} activeOpacity={0.85}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Promote Your Business Modal ── */}
      <Modal visible={promoModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPromoModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalRoot}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Promote Your Business</Text>
              <TouchableOpacity onPress={() => setPromoModalVisible(false)} style={s.modalClose}>
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.modalSubtitle}>Tell us about your business and we'll be in touch to set up your advertisement.</Text>
            <ScrollView style={s.modalBody} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
              <Text style={s.panelLabel}>Your Name</Text>
              <TextInput style={s.panelInput} value={promoName} onChangeText={setPromoName} placeholder="Full name" placeholderTextColor={COLORS.textMuted} autoCapitalize="words" />
              <Text style={s.panelLabel}>Contact Phone</Text>
              <TextInput style={s.panelInput} value={promoPhone} onChangeText={setPromoPhone} placeholder="Phone number" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" />
              <Text style={s.panelLabel}>Business Name *</Text>
              <TextInput style={s.panelInput} value={promoBusinessName} onChangeText={setPromoBusinessName} placeholder="Your business name" placeholderTextColor={COLORS.textMuted} autoCapitalize="words" />
              <Text style={s.panelLabel}>Business Description *</Text>
              <TextInput
                style={[s.panelInput, { minHeight: 90, textAlignVertical: 'top' }]}
                value={promoDesc}
                onChangeText={setPromoDesc}
                placeholder="What does your business do? Products, services, location..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={4}
              />
              <Text style={s.panelLabel}>Website (optional)</Text>
              <TextInput style={s.panelInput} value={promoWebsite} onChangeText={setPromoWebsite} placeholder="https://yourbusiness.com" placeholderTextColor={COLORS.textMuted} keyboardType="url" autoCapitalize="none" />

              <Text style={s.panelLabel}>Business Image / Logo (optional)</Text>
              {promoImageUri ? (
                <View style={s.promoImgWrap}>
                  <Image source={{ uri: promoImageUri }} style={s.promoImgPreview} resizeMode="cover" />
                  <View style={s.promoImgActions}>
                    <TouchableOpacity style={s.promoImgBtn} onPress={pickPromoImage} activeOpacity={0.8}>
                      <Text style={s.promoImgBtnText}>🔄 Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.promoImgBtn, { borderColor: COLORS.error + '60' }]} onPress={() => setPromoImageUri(null)} activeOpacity={0.8}>
                      <Text style={[s.promoImgBtnText, { color: COLORS.error }]}>🗑 Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.promoImgPicker} onPress={pickPromoImage} activeOpacity={0.8}>
                  <Text style={{ fontSize: 28 }}>🖼️</Text>
                  <Text style={s.promoImgPickerText}>Tap to add a photo or logo</Text>
                  <Text style={s.promoImgPickerSub}>Shown with your ad — JPG, PNG</Text>
                </TouchableOpacity>
              )}

              <Text style={s.emailHint}>Our team will review your request and reach out with pricing and details. You can also visit any Lucky Stop location to speak with the manager.</Text>
              <TouchableOpacity
                style={[s.panelBtn, { marginTop: 4, backgroundColor: '#f97316' }]}
                onPress={() => submitPromoMutation.mutate()}
                disabled={submitPromoMutation.isPending || !promoBusinessName.trim() || !promoDesc.trim()}
              >
                {submitPromoMutation.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.panelBtnText}>Submit Request</Text>
                }
              </TouchableOpacity>
              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, label, value }: InfoRowDef) {
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

  headerBg: {},
  headerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20,
  },
  avatarCircle: {
    width: 62, height: 62, borderRadius: 31,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCustomer: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarStaff: {
    backgroundColor: COLORS.primary,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerInfo: { flex: 1 },
  headerName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerPhone: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 3 },

  balanceBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
  },
  balanceBadgeAmt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  balanceBadgeLbl: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },

  rolePill: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  rolePillText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  body: { padding: 16, gap: 10, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2,
  },

  settingRow: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  settingIconBg: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  settingEmoji: { fontSize: 20 },
  settingBody: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  settingValue: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  chevron: { fontSize: 20, color: COLORS.textMuted, fontWeight: '300' },

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
  panelBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  panelBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emailHint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },

  infoCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  infoRowIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  infoRowLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, flex: 1 },
  infoRowValue: { fontSize: 14, color: COLORS.text, fontWeight: '600', textTransform: 'capitalize' },
  infoDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 },

  signOutBtn: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 8,
    borderWidth: 1.5, borderColor: COLORS.error + '35',
  },
  signOutText: { color: COLORS.error, fontWeight: '800', fontSize: 16 },

  // Image picker in promo modal
  promoImgWrap: { gap: 8 },
  promoImgPreview: { width: '100%', height: 160, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  promoImgActions: { flexDirection: 'row', gap: 8 },
  promoImgBtn: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 10, paddingVertical: 9, alignItems: 'center',
  },
  promoImgBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  promoImgPicker: {
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 20,
    alignItems: 'center', gap: 6, backgroundColor: COLORS.background,
  },
  promoImgPickerText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  promoImgPickerSub: { fontSize: 12, color: COLORS.border },

  // Promote Your Business modal
  modalRoot: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 12,
    backgroundColor: '#f97316',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalSubtitle: { fontSize: 14, color: COLORS.textMuted, paddingHorizontal: 20, paddingVertical: 12, lineHeight: 20 },
  modalBody: { flex: 1, paddingHorizontal: 20 },
});
