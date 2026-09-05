import { useState, useEffect, ReactNode, useCallback } from 'react';
import { router } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, ActivityIndicator, Switch, Modal, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { authApi, promotionsApi, leaderboardApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';
import {
  EditIcon, LockClosedIcon, MailIcon, MegaphoneIcon, ShieldIcon, TrophyIcon,
  GiftIcon, MapPinIcon, BuildingIcon, PhoneIcon, ChevronRightIcon, ChevronDownIcon,
  CheckCircleIcon, RefreshIcon, Trash2Icon, ImageIcon, BookOpenIcon, CameraIcon,
  GlobeIcon,
} from './Icons';
import LegalDocModal from './LegalDocModal';
import PromoteBusinessModal from './PromoteBusinessModal';
import FadeSlideIn from './FadeSlideIn';
import { LANGUAGES, setLanguage, getLanguage, type LanguageCode } from '../i18n';

type Panel = null | 'name' | 'pin' | 'email';

interface InfoRowDef { icon: ReactNode; label: string; value: string }

interface Props {
  /** true = COLORS.primary header + balance badge + email panel */
  isCustomer?: boolean;
}

export default function ProfileScreen({ isCustomer = false }: Props) {
  const { t } = useTranslation();
  const { user, token, logout, setAuth, biometricEnabled, setBiometricEnabled, setAge21Confirmed } = useAuthStore();
  const [confirmingAge21, setConfirmingAge21] = useState(false);

  async function handleConfirmAge21() {
    if (confirmingAge21) return;
    setConfirmingAge21(true);
    try {
      await authApi.confirm21();
      setAge21Confirmed();
      Toast.show({ type: 'success', text1: t('profile.ageRestrictedConfirmedToast') });
    } catch {
      Toast.show({ type: 'error', text1: t('profile.ageRestrictedErrorToast') });
    } finally {
      setConfirmingAge21(false);
    }
  }
  const [bioAvailable, setBioAvailable] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(getLanguage());

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(async (hw) => {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBioAvailable(hw && enrolled);
    });
  }, []);

  const [panel, setPanel] = useState<Panel>(null);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [name, setName] = useState(user?.name || '');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [email, setEmail] = useState((user as any)?.email || '');
  const [loading, setLoading] = useState(false);

  // Business promotion modal state
  const [promoModalVisible, setPromoModalVisible] = useState(false);

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

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      await authApi.deleteAccount();
      await logout();
      router.replace('/(auth)/welcome');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to delete account. Try again.' });
    } finally {
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  }

  async function uploadAvatarAsset(uri: string, mimeType: string) {
    setAvatarUploading(true);
    setShowAvatarModal(false);
    try {
      await authApi.uploadAvatar(uri, mimeType);
      // Refresh user from server to get the real avatarUrl regardless of response shape
      const meRes = await authApi.getMe();
      const fresh = meRes.data?.data;
      if (fresh && user && token) {
        setAuth({ ...user, avatarUrl: fresh.avatarUrl }, token);
      }
      Toast.show({ type: 'success', text1: 'Profile photo updated!' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to upload photo' });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission needed', text2: 'Allow photo access to set a profile picture.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await uploadAvatarAsset(asset.uri, asset.mimeType || 'image/jpeg');
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission needed', text2: 'Allow camera access to take a profile photo.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await uploadAvatarAsset(asset.uri, asset.mimeType || 'image/jpeg');
  }

  async function handleRemoveAvatar() {
    setShowAvatarModal(false);
    setAvatarUploading(true);
    try {
      await authApi.removeAvatar();
      if (user && token) setAuth({ ...user, avatarUrl: undefined }, token);
      Toast.show({ type: 'success', text1: 'Profile photo removed' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to remove photo' });
    } finally {
      setAvatarUploading(false);
    }
  }

  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();
  const roleLabel = user?.role?.replace(/_/g, ' ') ?? '';
  const headerBg = isCustomer ? COLORS.primary
    : user?.role === 'STORE_MANAGER' ? COLORS.managerPrimary
    : COLORS.secondary;

  async function handleSaveLanguage() {
    await setLanguage(selectedLang);
    setShowLangModal(false);
  }

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

  const storeCount = user?.storeIds?.length ?? 0;
  // Role isn't repeated here — it's already shown as the colored pill badge
  // in the header above, so a plain-text row here would be pure duplication.
  const staffInfoRows: InfoRowDef[] = [
    { icon: <BuildingIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />, label: 'Store', value: storeCount > 0 ? t('profile.storeCount', { count: storeCount }) : t('profile.noStoreAssigned') },
    { icon: <PhoneIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />, label: 'Phone', value: user?.phone || ' - ' },
  ];

  const customerInfoRows: InfoRowDef[] = [
    { icon: <GiftIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />, label: 'Redeem', value: t('profile.redeem') },
    { icon: <MapPinIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />, label: 'Locations', value: t('profile.locations') },
  ];

  const infoRows = isCustomer ? customerInfoRows : staffInfoRows;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={headerBg} />

      {/* ── Header ── */}
      <SafeAreaView style={[s.headerBg, { backgroundColor: headerBg }]}>
        <View style={s.headerInner}>
          <TouchableOpacity
            onPress={() => setShowAvatarModal(true)}
            activeOpacity={0.8}
            style={s.avatarWrap}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            <View style={[s.avatarCircle, isCustomer ? s.avatarCustomer : s.avatarStaff]}>
              {user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl, cache: 'reload' }}
                  style={s.avatarImage}
                />
              ) : (
                <Text style={s.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={s.avatarCameraBtn}>
              {avatarUploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <ImageIcon size={12} color="#fff" strokeWidth={2.5} />
              }
            </View>
          </TouchableOpacity>
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{user?.name || 'No name set'}</Text>
            <Text style={s.headerPhone}>{user?.phone}</Text>
          </View>

          {/* Right badge - balance for customer, role pill for staff */}
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
        <FadeSlideIn>
        {/* ── Account Settings ── */}
        <Text style={s.sectionLabel}>{t('profile.accountSettings')}</Text>

        {/* Update Name */}
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => setPanel(panel === 'name' ? null : 'name')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Edit name"
        >
          <View style={[s.settingIconBg, { backgroundColor: COLORS.primary + '18' }]}>
            <EditIcon size={20} color={COLORS.primary} strokeWidth={1.75} />
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{t('profile.updateName')}</Text>
            <Text style={s.settingValue}>{user?.name || t('profile.notSet')}</Text>
          </View>
          {panel === 'name'
            ? <ChevronDownIcon size={18} color={COLORS.primary} strokeWidth={2} />
            : <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
          }
        </TouchableOpacity>

        {panel === 'name' && (
          <View style={s.panelCard}>
            <Text style={s.panelLabel}>{t('profile.displayName')}</Text>
            <TextInput
              style={s.panelInput} value={name} onChangeText={setName}
              placeholder={t('profile.yourFullName')} placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words" autoFocus
            />
            <TouchableOpacity
              style={s.panelBtn}
              onPress={handleUpdateName}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Save name"
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>{t('profile.saveName')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Change PIN */}
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => setPanel(panel === 'pin' ? null : 'pin')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Change PIN"
        >
          <View style={[s.settingIconBg, { backgroundColor: COLORS.secondary + '18' }]}>
            <LockClosedIcon size={20} color={COLORS.secondary} strokeWidth={1.75} />
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{t('profile.changePin')}</Text>
            <Text style={s.settingValue}>••••</Text>
          </View>
          {panel === 'pin'
            ? <ChevronDownIcon size={18} color={COLORS.primary} strokeWidth={2} />
            : <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
          }
        </TouchableOpacity>

        {panel === 'pin' && (
          <View style={s.panelCard}>
            <Text style={s.panelLabel}>{t('profile.currentPin')}</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4}
              value={currentPin} onChangeText={setCurrentPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted} autoFocus
            />
            <Text style={s.panelLabel}>{t('profile.newPin')}</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4}
              value={newPin} onChangeText={setNewPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted}
            />
            <Text style={s.panelLabel}>{t('profile.confirmNewPin')}</Text>
            <TextInput
              style={[s.panelInput, s.pinInput]} secureTextEntry keyboardType="number-pad" maxLength={4}
              value={confirmPin} onChangeText={setConfirmPin}
              placeholder="••••" placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity
              style={s.panelBtn}
              onPress={handleChangePin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Submit PIN change"
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>{t('profile.changePinAction')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Preferences ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>{t('profile.preferences')}</Text>

        {/* Language */}
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => { setSelectedLang(getLanguage()); setShowLangModal(true); }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Change language"
        >
          <View style={[s.settingIconBg, { backgroundColor: '#0EA5E918' }]}>
            <GlobeIcon size={20} color="#0EA5E9" strokeWidth={1.75} />
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{t('profile.language')}</Text>
            <Text style={s.settingValue}>{t('profile.languageCurrent')}</Text>
          </View>
          <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
        </TouchableOpacity>

        {/* Recovery Email - customers only */}
        {isCustomer && (
          <>
            <TouchableOpacity
              style={s.settingRow}
              onPress={() => setPanel(panel === 'email' ? null : 'email')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Edit recovery email"
            >
              <View style={[s.settingIconBg, { backgroundColor: '#00B4D818' }]}>
                <MailIcon size={20} color="#00B4D8" strokeWidth={1.75} />
              </View>
              <View style={s.settingBody}>
                <Text style={s.settingTitle}>{t('profile.recoveryEmail')}</Text>
                <Text style={s.settingValue}>{email || t('profile.notSetAddForRecovery')}</Text>
              </View>
              {panel === 'email'
                ? <ChevronDownIcon size={18} color={COLORS.primary} strokeWidth={2} />
                : <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
              }
            </TouchableOpacity>

            {panel === 'email' && (
              <View style={s.panelCard}>
                <Text style={s.panelLabel}>{t('profile.emailAddress')}</Text>
                <TextInput
                  style={s.panelInput} value={email} onChangeText={setEmail}
                  keyboardType="email-address" autoCapitalize="none"
                  placeholder="your@email.com" placeholderTextColor={COLORS.textMuted} autoFocus
                />
                <Text style={s.emailHint}>{t('profile.emailHint')}</Text>
                <TouchableOpacity
                  style={s.panelBtn}
                  onPress={handleUpdateEmail}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Save recovery email"
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.panelBtnText}>{t('profile.saveEmail')}</Text>}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Promote Your Business - customers only */}
        {isCustomer && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 8 }]}>{t('profile.advertising')}</Text>
            <TouchableOpacity
              style={s.settingRow}
              onPress={() => setPromoModalVisible(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Promote your business"
            >
              <View style={[s.settingIconBg, { backgroundColor: '#f9731618' }]}>
                <MegaphoneIcon size={20} color="#f97316" strokeWidth={1.75} />
              </View>
              <View style={s.settingBody}>
                <Text style={s.settingTitle}>{t('profile.promoteYourBusiness')}</Text>
                <Text style={s.settingValue}>
                  {myPromo?.status === 'PENDING'
                    ? t('profile.promoStatusPending')
                    : myPromo?.status === 'APPROVED'
                    ? t('profile.promoStatusApproved')
                    : myPromo?.status === 'REJECTED'
                    ? t('profile.promoStatusRejected')
                    : t('profile.promoStatusNone')}
                </Text>
              </View>
              {myPromo?.status === 'APPROVED'
                ? <CheckCircleIcon size={18} color="#2DC653" strokeWidth={2.5} />
                : myPromo?.status === 'PENDING'
                ? <Text style={s.pendingText}>{t('profile.pending')}</Text>
                : <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
              }
            </TouchableOpacity>
          </>
        )}

        {/* Biometric toggle */}
        {bioAvailable && (
          <View style={s.settingRow}>
            <View style={[s.settingIconBg, { backgroundColor: '#6C5CE718' }]}>
              <ShieldIcon size={20} color="#6C5CE7" strokeWidth={1.75} />
            </View>
            <View style={s.settingBody}>
              <Text style={s.settingTitle}>{t('profile.biometricLogin')}</Text>
              <Text style={s.settingValue}>{biometricEnabled ? t('profile.enabled') : t('profile.disabled')}</Text>
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
              accessibilityRole="switch"
              accessibilityLabel={t('profile.biometricLogin')}
              accessibilityState={{ checked: biometricEnabled }}
            />
          </View>
        )}

        {/* ── Leaderboard ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>{t('profile.community')}</Text>
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => {
            if (isCustomer) router.push('/(customer)/leaderboard');
            else if (user?.role === 'STORE_MANAGER') router.push('/(manager)/leaderboard' as any);
            else router.push('/(employee)/leaderboard');
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View leaderboard"
        >
          <View style={[s.settingIconBg, { backgroundColor: '#FFD70020' }]}>
            <TrophyIcon size={20} color="#b8860b" strokeWidth={1.75} />
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{isCustomer ? t('profile.customerLeaderboard') : t('profile.staffRankings')}</Text>
            <Text style={s.settingValue}>
              {isCustomer
                ? t('profile.customerLeaderboardSub')
                : myRating?.allTime?.count
                  ? `${myRating.allTime.avg.toFixed(1)} ★ avg · ${myRating.allTime.count} review${myRating.allTime.count !== 1 ? 's' : ''}`
                  : t('profile.staffRankingsSub')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
        </TouchableOpacity>

        {/* ── Info Card ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>{isCustomer ? t('profile.rewardsInfo') : t('profile.appInfo')}</Text>
        <View style={s.infoCard}>
          {infoRows.map((row, i) => (
            <View key={row.label}>
              <InfoRow {...row} />
              {i < infoRows.length - 1 && <View style={s.infoDivider} />}
            </View>
          ))}
        </View>

        {/* ── Help & Guide ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>{t('profile.support')}</Text>
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => {
            if (isCustomer) router.push('/(customer)/guide');
            else if (user?.role === 'STORE_MANAGER') router.push('/(manager)/guide' as any);
            else router.push('/(employee)/guide');
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open help guide"
        >
          <View style={[s.settingIconBg, { backgroundColor: COLORS.secondary + '18' }]}>
            <BookOpenIcon size={20} color={COLORS.secondary} strokeWidth={1.75} />
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{t('profile.helpGuide')}</Text>
            <Text style={s.settingValue}>
              {isCustomer
                ? t('profile.helpGuideCustomer')
                : user?.role === 'STORE_MANAGER'
                ? t('profile.helpGuideManager')
                : t('profile.helpGuideEmployee')}
            </Text>
          </View>
          <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
        </TouchableOpacity>

        {/* ── Missing Points Reports (customers only) - view + file reports live together on my-disputes ── */}
        {isCustomer && (
          <>
            <TouchableOpacity
              style={s.settingRow}
              onPress={() => router.push('/(customer)/my-disputes')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="View or report missing points"
            >
              <View style={[s.settingIconBg, { backgroundColor: '#fff7ed' }]}>
                <MegaphoneIcon size={20} color="#ea580c" strokeWidth={1.75} />
              </View>
              <View style={s.settingBody}>
                <Text style={s.settingTitle}>{t('profile.reportMissingPoints')}</Text>
                <Text style={s.settingValue}>{t('profile.reportMissingPointsSub')}</Text>
              </View>
              <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
            </TouchableOpacity>
          </>
        )}

        {/* ── Age-Restricted Content - customers only ── */}
        {isCustomer && (
          <TouchableOpacity
            style={s.settingRow}
            onPress={() => {
              if (user?.age21Confirmed) {
                Toast.show({ type: 'success', text1: t('profile.ageRestrictedAlreadyConfirmedToast') });
                return;
              }
              Alert.alert(
                t('profile.ageRestrictedContent'),
                t('profile.ageRestrictedLegalText'),
                [
                  { text: t('profile.ageRestrictedCancel'), style: 'cancel' },
                  { text: t('profile.ageRestrictedConfirmBtn'), onPress: handleConfirmAge21 },
                ]
              );
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={user?.age21Confirmed ? 'Age-restricted content confirmed' : 'Confirm you are 21 or older to see age-restricted content'}
          >
            <View style={[s.settingIconBg, { backgroundColor: '#fffbeb' }]}>
              <LockClosedIcon size={20} color="#92400e" strokeWidth={1.75} />
            </View>
            <View style={s.settingBody}>
              <Text style={s.settingTitle}>{t('profile.ageRestrictedContent')}</Text>
              <Text style={s.settingValue}>
                {confirmingAge21
                  ? t('profile.ageRestrictedConfirming')
                  : user?.age21Confirmed
                  ? t('profile.ageRestrictedConfirmedSub')
                  : t('profile.ageRestrictedNotConfirmedSub')}
              </Text>
            </View>
            {user?.age21Confirmed
              ? <CheckCircleIcon size={18} color="#15803d" strokeWidth={1.75} />
              : <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />}
          </TouchableOpacity>
        )}

        {/* ── Legal ── */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>{t('profile.legal')}</Text>
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => setLegalDoc('terms')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View terms of service"
        >
          <View style={[s.settingIconBg, { backgroundColor: '#eff6ff' }]}>
            <BookOpenIcon size={20} color="#1D3557" strokeWidth={1.75} />
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{t('profile.termsOfService')}</Text>
            <Text style={s.settingValue}>{t('profile.termsOfServiceSub')}</Text>
          </View>
          <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.settingRow}
          onPress={() => setLegalDoc('privacy')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="View privacy policy"
        >
          <View style={[s.settingIconBg, { backgroundColor: '#f0fdf9' }]}>
            <ShieldIcon size={20} color="#157A6E" strokeWidth={1.75} />
          </View>
          <View style={s.settingBody}>
            <Text style={s.settingTitle}>{t('profile.privacyPolicy')}</Text>
            <Text style={s.settingValue}>{t('profile.privacyPolicySub')}</Text>
          </View>
          <ChevronRightIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
        </TouchableOpacity>

        {/* ── Sign Out ── */}
        <TouchableOpacity
          style={s.signOutBtn}
          onPress={() => logout()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={s.signOutText}>{t('profile.signOut')}</Text>
        </TouchableOpacity>

        {/* ── Delete Account - customers only ── */}
        {isCustomer && (
          <TouchableOpacity
            style={s.deleteAccountBtn}
            onPress={() => setShowDeleteModal(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={s.deleteAccountText}>{t('profile.deleteMyAccount')}</Text>
          </TouchableOpacity>
        )}

        {/* ── App version & copyright footer ── */}
        <View style={s.appFooter}>
          <Text style={s.appFooterVersion}>
            Lucky Stop v{Constants.expoConfig?.version ?? '1.2.0'}
          </Text>
          <Text style={s.appFooterCopy}>
            © {new Date().getFullYear()} Cliff Industries. All rights reserved.
          </Text>
          <Text style={s.appFooterTrade}>
            Lucky Stop™ is a trademark of Lucky Stop Inc.
          </Text>
        </View>
        </FadeSlideIn>
      </ScrollView>

      {/* ── Delete Account confirmation modal ── */}
      {showDeleteModal && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
          <View style={s.deleteOverlay}>
            <View style={s.deleteCard}>
              <View style={s.deleteIconWrap}>
                <Trash2Icon size={28} color="#fff" strokeWidth={2} />
              </View>
              <Text style={s.deleteTitle}>{t('deleteModal.title')}</Text>
              <Text style={s.deleteBody}>{t('deleteModal.body')}</Text>
              <TouchableOpacity
                style={[s.deleteConfirmBtn, deletingAccount && { opacity: 0.6 }]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Confirm account deletion"
              >
                <Text style={s.deleteConfirmText}>{deletingAccount ? t('deleteModal.deleting') : t('deleteModal.confirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.deleteCancelBtn}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel account deletion"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text style={s.deleteCancelText}>{t('deleteModal.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <PromoteBusinessModal visible={promoModalVisible} onClose={() => setPromoModalVisible(false)} />

      {/* ── Avatar picker modal ── */}
      <Modal visible={showAvatarModal} transparent animationType="fade" onRequestClose={() => setShowAvatarModal(false)}>
        <TouchableOpacity
          style={s.avatarModalBackdrop}
          activeOpacity={1}
          onPress={() => setShowAvatarModal(false)}
          accessibilityRole="button"
          accessibilityLabel="Close profile photo options"
        >
          <View style={s.avatarModalSheet} onStartShouldSetResponder={() => true}>
            {/* Preview */}
            <View style={s.avatarModalPreview}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={s.avatarModalImage} />
              ) : (
                <View style={[s.avatarModalImage, s.avatarModalPlaceholder, { backgroundColor: headerBg }]}>
                  <Text style={s.avatarModalInitial}>{initial}</Text>
                </View>
              )}
            </View>
            <Text style={s.avatarModalName}>{user?.name || user?.phone}</Text>

            <View style={s.avatarModalDivider} />

            <TouchableOpacity
              style={s.avatarModalOption}
              onPress={handlePickAvatar}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Choose photo from library"
            >
              <View style={[s.avatarModalOptionIcon, { backgroundColor: '#eff6ff' }]}>
                <ImageIcon size={20} color="#1D3557" strokeWidth={1.75} />
              </View>
              <Text style={s.avatarModalOptionText}>{t('avatarModal.chooseFromLibrary')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.avatarModalOption}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <View style={[s.avatarModalOptionIcon, { backgroundColor: '#f0fdf4' }]}>
                <CameraIcon size={20} color="#16a34a" strokeWidth={1.75} />
              </View>
              <Text style={s.avatarModalOptionText}>{t('avatarModal.takePhoto')}</Text>
            </TouchableOpacity>

            {user?.avatarUrl && (
              <TouchableOpacity
                style={s.avatarModalOption}
                onPress={handleRemoveAvatar}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Remove profile photo"
              >
                <View style={[s.avatarModalOptionIcon, { backgroundColor: '#fff5f5' }]}>
                  <Trash2Icon size={20} color={COLORS.error} strokeWidth={1.75} />
                </View>
                <Text style={[s.avatarModalOptionText, { color: COLORS.error }]}>{t('avatarModal.removePhoto')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={s.avatarModalCancel}
              onPress={() => setShowAvatarModal(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={s.avatarModalCancelText}>{t('avatarModal.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Language picker modal ── */}
      <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
        <TouchableOpacity
          style={s.deleteOverlay}
          activeOpacity={1}
          onPress={() => setShowLangModal(false)}
          accessibilityRole="button"
          accessibilityLabel="Close language selection"
        >
          <View style={s.langModalCard} onStartShouldSetResponder={() => true}>
            <Text style={s.langModalTitle}>{t('langModal.title')}</Text>
            <Text style={s.langModalSubtitle}>{t('langModal.subtitle')}</Text>
            <View style={s.langOptions}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[s.langOption, selectedLang === lang.code && s.langOptionActive]}
                  onPress={() => setSelectedLang(lang.code)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Select language: ${lang.nativeLabel}`}
                >
                  <Text style={[s.langOptionText, selectedLang === lang.code && s.langOptionTextActive]}>
                    {lang.nativeLabel}
                  </Text>
                  {selectedLang === lang.code && (
                    <CheckCircleIcon size={18} color={COLORS.primary} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={s.langSaveBtn}
              onPress={handleSaveLanguage}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Save language selection"
            >
              <Text style={s.langSaveBtnText}>{t('langModal.save')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Legal doc modal */}
      <LegalDocModal
        visible={legalDoc !== null}
        doc={legalDoc ?? 'terms'}
        onClose={() => setLegalDoc(null)}
      />
    </View>
  );
}

function InfoRow({ icon, label, value }: InfoRowDef) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoRowIconWrap}>{icon}</View>
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
  avatarWrap: { position: 'relative' },
  avatarImage: { width: 62, height: 62, borderRadius: 31 },
  avatarCameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
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
  settingBody: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  settingValue: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  pendingText: { fontSize: 12, color: '#f97316', fontWeight: '700' },

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
  infoRowIconWrap: { width: 26, alignItems: 'center', justifyContent: 'center' },
  infoRowLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, flex: 1 },
  infoRowValue: { fontSize: 14, color: COLORS.text, fontWeight: '600', textTransform: 'capitalize' },
  infoDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 14 },

  signOutBtn: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 8,
    borderWidth: 1.5, borderColor: COLORS.error + '35',
  },
  signOutText: { color: COLORS.error, fontWeight: '800', fontSize: 16 },

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

  deleteAccountBtn: {
    alignItems: 'center', paddingVertical: 14, marginTop: 4,
  },
  deleteAccountText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },

  deleteOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  deleteCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 20,
  },
  deleteIconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  deleteTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 12 },
  deleteBody: { fontSize: 14, color: COLORS.textMuted, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  deleteConfirmBtn: {
    backgroundColor: COLORS.error, borderRadius: 16,
    paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  deleteConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  deleteCancelBtn: {
    paddingVertical: 12, width: '100%', alignItems: 'center',
  },
  deleteCancelText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '700' },

  // Avatar modal
  avatarModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  avatarModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: 36, paddingTop: 8,
    paddingHorizontal: 20,
  },
  avatarModalPreview: {
    alignItems: 'center', marginTop: 16, marginBottom: 10,
  },
  avatarModalImage: {
    width: 100, height: 100, borderRadius: 50,
  },
  avatarModalPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
  },
  avatarModalInitial: {
    fontSize: 38, fontWeight: '900', color: '#fff',
  },
  avatarModalName: {
    textAlign: 'center', fontSize: 17, fontWeight: '700',
    color: COLORS.text, marginBottom: 16,
  },
  avatarModalDivider: {
    height: 1, backgroundColor: '#f1f5f9', marginBottom: 8,
  },
  avatarModalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 4,
  },
  avatarModalOptionIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarModalOptionText: {
    fontSize: 16, fontWeight: '600', color: COLORS.text,
  },
  avatarModalCancel: {
    marginTop: 12, paddingVertical: 16,
    alignItems: 'center', backgroundColor: '#f8fafc',
    borderRadius: 16,
  },
  avatarModalCancelText: {
    fontSize: 15, fontWeight: '700', color: COLORS.textMuted,
  },

  // Language modal
  langModalCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 20,
  },
  langModalTitle: {
    fontSize: 20, fontWeight: '900', color: COLORS.text,
    textAlign: 'center', marginBottom: 6,
  },
  langModalSubtitle: {
    fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: 20,
  },
  langOptions: { gap: 10, marginBottom: 20 },
  langOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: '#f8fafc',
  },
  langOptionActive: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primary + '0D',
  },
  langOptionText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  langOptionTextActive: { color: COLORS.primary, fontWeight: '800' },
  langSaveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  langSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // App footer
  appFooter: {
    alignItems: 'center', paddingVertical: 28, gap: 4,
  },
  appFooterVersion: {
    fontSize: 13, fontWeight: '700', color: COLORS.textMuted,
  },
  appFooterCopy: {
    fontSize: 11, color: COLORS.textMuted, opacity: 0.7,
  },
  appFooterTrade: {
    fontSize: 11, color: COLORS.textMuted, opacity: 0.55,
  },
});
