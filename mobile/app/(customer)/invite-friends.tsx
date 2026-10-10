import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Share, ActivityIndicator, Animated } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import LargeTitleHeader, { useLargeTitleScroll } from '../../components/LargeTitleHeader';
import BackButton from '../../components/BackButton';
import ErrorState from '../../components/ErrorState';
import { referralsApi } from '../../services/api';
import { COLORS } from '../../constants';
import { haptic } from '../../utils/haptics';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { pendingInvite } from '../invite';

// Refer a friend (2026-10-09): the customer's code to share, the deal, the friends they invited, who invited them, and (in the first
// days, before a purchase) a box to add a friend's code. The paying is on the server (utils/referrals.ts) when a purchase is approved.
const INVITE_LINK = (code: string) => `https://luckystop.cliffindus.com/invite?code=${code}`;
const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default function InviteFriendsScreen() {
  const { t, i18n } = useTranslation();
  const largeTitle = useLargeTitleScroll();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-referrals'], queryFn: () => referralsApi.me() });
  const { refreshing, onRefresh } = usePullRefresh([() => q.refetch()]);
  const [code, setCode] = useState(pendingInvite.code);   // from an invite link opened while signed in
  const [adding, setAdding] = useState(false);
  const d: any = q.data?.data?.data;
  const s = d?.settings;
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

  async function share() {
    haptic.press();
    await Share.share({ message: t('invite.shareMessage', { amount: money(s.friendReward), code: d.code, link: INVITE_LINK(d.code) }) }).catch(() => {});
  }
  async function copy() {
    haptic.success();
    await Clipboard.setStringAsync(d.code);
    Toast.show({ type: 'success', text1: t('invite.copied') });
  }
  async function addCode() {
    if (!code.trim() || adding) return;
    setAdding(true);
    try {
      await referralsApi.claim(code.trim());
      haptic.success();
      Toast.show({ type: 'success', text1: t('invite.addCodeDone') });
      setCode('');
      qc.invalidateQueries({ queryKey: ['my-referrals'] });
    } catch (e: any) {
      haptic.error();
      Toast.show({ type: 'error', text1: e?.response?.data?.error ?? t('invite.loadError') });
    } finally {
      setAdding(false);
    }
  }

  const statusText = (f: any) => f.status === 'REWARDED'
    ? (f.overLimit ? t('invite.statusOverLimit') : t('invite.statusPaid', { amount: money(f.earned) }))
    : f.status === 'PENDING' ? t('invite.statusWaiting', { min: money(s.minPurchase) }) : t('invite.statusExpired');

  return (
    <View style={st.root}>
      <LargeTitleHeader
        title={t('invite.title')}
        subtitle={s ? t('invite.subtitle', { amount: money(s.friendReward) }) : undefined}
        scrollY={largeTitle.scrollY}
        icon={<Ionicons name="gift-outline" size={24} color="rgba(255,255,255,0.8)" />}
        left={<BackButton variant="light" />}
      />
      {q.isLoading ? (
        <View style={st.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : q.isError || !d ? (
        <ErrorState message={t('invite.loadError')} onRetry={() => q.refetch()} />
      ) : (
        <Animated.ScrollView
          contentContainerStyle={st.content}
          onScroll={largeTitle.onScroll}
          scrollEventThrottle={largeTitle.scrollEventThrottle}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          keyboardShouldPersistTaps="handled"
        >
          {!s.enabled && <View style={st.notice}><Text style={st.noticeText}>{t('invite.paused')}</Text></View>}

          <View style={st.hero}>
            <Text style={st.heroTitle} accessibilityRole="header">{t('invite.heroTitle', { friend: money(s.friendReward), you: money(s.referrerReward) })}</Text>
            <Text style={st.heroBody}>{t('invite.heroBody', { min: money(s.minPurchase), days: s.windowDays, you: money(s.referrerReward), friend: money(s.friendReward) })}</Text>
            <Text style={st.codeLabel}>{t('invite.yourCode')}</Text>
            <View style={st.codeRow}>
              <Text style={st.code} selectable accessibilityLabel={d.code.split('').join(' ')}>{d.code}</Text>
              <TouchableOpacity style={st.copyBtn} onPress={copy} accessibilityRole="button" accessibilityLabel={t('invite.copy')}>
                <Ionicons name="copy-outline" size={18} color={COLORS.secondary} />
                <Text style={st.copyText}>{t('invite.copy')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[st.shareBtn, !s.enabled && { opacity: 0.5 }]} onPress={share} disabled={!s.enabled} accessibilityRole="button" activeOpacity={0.85}>
              <Ionicons name="share-social" size={20} color={COLORS.white} />
              <Text style={st.shareText}>{t('invite.share')}</Text>
            </TouchableOpacity>
          </View>

          <View style={st.card}>
            {[t('invite.step1'), t('invite.step2'), t('invite.step3', { min: money(s.minPurchase), days: s.windowDays })].map((line, i) => (
              <View key={i} style={st.step}>
                <View style={st.stepNum}><Text style={st.stepNumText}>{i + 1}</Text></View>
                <Text style={st.stepText}>{line}</Text>
              </View>
            ))}
            <Text style={st.small}>{t('invite.limit', { count: s.monthlyLimit })}{d.limitLeft < s.monthlyLimit ? ` ${t('invite.limitLeft', { count: d.limitLeft })}` : ''}</Text>
          </View>

          {d.invitedBy && (
            <View style={[st.card, st.invitedCard]}>
              <Text style={st.cardTitle}>{t('invite.invitedByTitle', { name: d.invitedBy.name })}</Text>
              <Text style={st.cardBody}>
                {d.invitedBy.status === 'REWARDED' ? t('invite.invitedByPaid', { amount: money(d.invitedBy.reward) })
                  : d.invitedBy.status === 'PENDING' ? t('invite.invitedByWaiting', { min: money(s.minPurchase), date: date(d.invitedBy.deadline) })
                  : t('invite.invitedByExpired')}
              </Text>
            </View>
          )}

          {d.canAddCode && (
            <View style={st.card}>
              <Text style={st.cardTitle}>{t('invite.addCodeTitle')}</Text>
              <Text style={st.cardBody}>{t('invite.addCodeBody')}</Text>
              <View style={st.addRow}>
                <TextInput style={st.input} placeholder={t('invite.addCodePlaceholder')} placeholderTextColor={COLORS.textMuted} value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={10} returnKeyType="done" onSubmitEditing={addCode} />
                <TouchableOpacity style={[st.addBtn, (!code.trim() || adding) && { opacity: 0.5 }]} onPress={addCode} disabled={!code.trim() || adding} accessibilityRole="button">
                  {adding ? <ActivityIndicator color={COLORS.white} /> : <Text style={st.addText}>{t('invite.addCodeButton')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={st.card}>
            <Text style={st.cardTitle} accessibilityRole="header">{t('invite.friendsTitle')}</Text>
            {d.earned > 0 && <Text style={st.earned}>{t('invite.earned', { amount: money(d.earned) })}</Text>}
            {d.friends.length === 0 ? <Text style={st.cardBody}>{t('invite.noFriends')}</Text> : d.friends.map((f: any, i: number) => (
              <View key={i} style={[st.friend, i > 0 && st.friendBorder]}>
                <View style={[st.dot, { backgroundColor: f.status === 'REWARDED' && !f.overLimit ? COLORS.success : f.status === 'PENDING' ? COLORS.accent : COLORS.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={st.friendName}>{f.name}</Text>
                  <Text style={st.friendStatus}>{statusText(f)}</Text>
                </View>
                <Text style={st.friendDate}>{date(f.joinedAt)}</Text>
              </View>
            ))}
          </View>
        </Animated.ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  notice: { backgroundColor: '#FDF6E8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F1DCAF' },
  noticeText: { color: '#8A5300', fontWeight: '600' },
  // A white card on the light page (2026-10-10): on navy it ran into the navy header above it
  hero: { backgroundColor: COLORS.white, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 5, borderTopColor: COLORS.primary,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  heroTitle: { color: COLORS.secondary, fontSize: 24, fontWeight: '900' },
  heroBody: { color: COLORS.textMuted, fontSize: 15, lineHeight: 21, marginTop: 6 },
  codeLabel: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700', marginTop: 18, textTransform: 'uppercase', letterSpacing: 0.6 },
  codeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F3F5', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7CED6', paddingLeft: 16, paddingRight: 6, paddingVertical: 6, marginTop: 6 },
  code: { flex: 1, fontSize: 28, fontWeight: '900', letterSpacing: 5, color: COLORS.secondary },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#D3DCEA' },
  copyText: { color: COLORS.secondary, fontWeight: '800' },
  shareBtn: { marginTop: 14, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  shareText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  invitedCard: { borderColor: '#C8E6D2', backgroundColor: '#F2FAF5' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  cardBody: { fontSize: 14, color: COLORS.textMuted, marginTop: 4, lineHeight: 20 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: COLORS.secondary, fontWeight: '900' },
  stepText: { flex: 1, fontSize: 15, color: COLORS.text, lineHeight: 21 },
  small: { fontSize: 13, color: COLORS.textMuted },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontWeight: '700', letterSpacing: 2, color: COLORS.text },
  addBtn: { backgroundColor: COLORS.secondary, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  addText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  earned: { fontSize: 14, fontWeight: '700', color: COLORS.success, marginTop: 4 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginTop: 4 },
  friendBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  dot: { width: 10, height: 10, borderRadius: 5 },
  friendName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  friendStatus: { fontSize: 13, color: COLORS.textMuted, marginTop: 1 },
  friendDate: { fontSize: 13, color: COLORS.textMuted },
});
