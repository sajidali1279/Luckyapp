import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Image, Linking } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import LargeTitleHeader, { useLargeTitleScroll } from '../../components/LargeTitleHeader';
import BackButton from '../../components/BackButton';
import ErrorState from '../../components/ErrorState';
import { receiptScanApi, authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import { haptic } from '../../utils/haptics';
import { usePullRefresh } from '../../hooks/usePullRefresh';

// Scan a receipt (2026-10-11, in testing): the customer photographs a paper receipt that did not get points at the register. The server
// reads it and holds it for the store to approve; nothing is credited here. Only customers HQ allows see this (receipt-scan/access).
type Result = { status: 'HELD' | 'APPROVED'; store: string; date: string; total: number; points: number; lines: { category: string; amount: number }[] };
const CAT_KEYS: Record<string, string> = {
  GAS: 'catGas', DIESEL: 'catDiesel', HOT_FOODS: 'catHotFoods', GROCERIES: 'catGroceries',
  FROZEN_FOODS: 'catFrozenFoods', FRESH_FOODS: 'catFreshFoods', OTHER: 'catOther',
};
const money = (n: number) => `$${Number(n).toFixed(2)}`;

export default function ReceiptPhotoScreen() {
  const { t, i18n } = useTranslation();
  const largeTitle = useLargeTitleScroll();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ['receipt-scan-access'], queryFn: () => receiptScanApi.access() });
  const mine = useQuery({ queryKey: ['receipt-scan-mine'], queryFn: () => receiptScanApi.mine(), enabled: access.data?.data?.data?.enabled === true });
  const { refreshing, onRefresh } = usePullRefresh([() => access.refetch(), () => mine.refetch()]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const enabled = access.data?.data?.data?.enabled === true;
  const scans: any[] = Array.isArray(mine.data?.data?.data) ? mine.data!.data.data : [];
  const day = (iso: string) => new Date(iso).toLocaleDateString(i18n.language === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

  async function takePhoto() {
    haptic.tap();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) await Linking.openSettings().catch(() => {});
      return;
    }
    // Camera only (not the photo library): a receipt in hand, today
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, exif: false });
    if (shot.canceled) return;
    const a = shot.assets[0];
    if (a.fileSize && a.fileSize > 5 * 1024 * 1024) { setProblem(t('receiptPhoto.tooLarge')); return; }
    setProblem(null); setResult(null); setPhoto(a.uri);
  }

  async function send() {
    if (!photo || sending) return;
    setSending(true); setProblem(null);
    try {
      const { data } = await receiptScanApi.send(photo);
      haptic.success();
      setResult(data.data); setPhoto(null);
      if (data.data?.status === 'APPROVED') {
        // credited at once: the balance shown in the app is read again
        authApi.getMe().then(({ data: me }) => { if (typeof me?.data?.pointsBalance === 'number') useAuthStore.getState().updateBalance(me.data.pointsBalance); }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ['receipt-scan-mine'] });
    } catch (e: any) {
      haptic.error();
      setProblem(e?.response?.data?.error ?? (e?.name === 'AbortError' ? t('receiptPhoto.slow') : t('receiptPhoto.sendFailed')));
      if (e?.response?.status === 422 || e?.response?.status === 409) { setPhoto(null); qc.invalidateQueries({ queryKey: ['receipt-scan-mine'] }); }
    } finally {
      setSending(false);
    }
  }

  const statusWord = (s: string) => ({ WAITING: t('receiptPhoto.stWaiting'), APPROVED: t('receiptPhoto.stApproved'), REJECTED: t('receiptPhoto.stRejected'), REFUSED: t('receiptPhoto.stRefused'), ERROR: t('receiptPhoto.stError') } as Record<string, string>)[s] ?? s;
  const statusColor = (s: string) => (s === 'APPROVED' ? '#17663A' : s === 'WAITING' ? '#8A5300' : COLORS.textMuted);

  return (
    <View style={st.root}>
      <LargeTitleHeader
        title={t('receiptPhoto.title')}
        subtitle={t('receiptPhoto.subtitle')}
        scrollY={largeTitle.scrollY}
        icon={<Ionicons name="receipt-outline" size={24} color="rgba(255,255,255,0.8)" />}
        left={<BackButton variant="light" />}
      />
      {access.isLoading ? (
        <View style={st.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : access.isError ? (
        <ErrorState message={t('receiptPhoto.loadError')} onRetry={() => access.refetch()} />
      ) : (
        <Animated.ScrollView
          contentContainerStyle={st.content}
          onScroll={largeTitle.onScroll}
          scrollEventThrottle={largeTitle.scrollEventThrottle}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        >
          {!enabled ? (
            <View style={st.card}><Text style={st.body}>{t('receiptPhoto.notAvailable')}</Text></View>
          ) : (
            <>
              <View style={st.testing}><Text style={st.testingText}>{t('receiptPhoto.testingNote')}</Text></View>

              {result ? (
                <View style={[st.card, st.doneCard]} accessibilityLiveRegion="polite">
                  <Ionicons name="checkmark-circle" size={40} color="#17663A" />
                  <Text style={st.cardTitle} accessibilityRole="header">{result.status === 'APPROVED' ? t('receiptPhoto.approvedTitle') : t('receiptPhoto.sentTitle')}</Text>
                  <Text style={st.body}>{result.status === 'APPROVED' ? t('receiptPhoto.approvedBody', { store: result.store, total: money(result.total) }) : t('receiptPhoto.sentBody', { store: result.store, total: money(result.total) })}</Text>
                  {result.lines.map((l, i) => (
                    <View key={i} style={st.lineRow}>
                      <Text style={st.lineName}>{t(`customerScanReceipt.${CAT_KEYS[l.category] ?? 'catOther'}`)}</Text>
                      <Text style={st.lineAmt}>{money(l.amount)}</Text>
                    </View>
                  ))}
                  <Text style={st.estimate}>{result.status === 'APPROVED' ? t('receiptPhoto.added', { points: result.points }) : t('receiptPhoto.estimate', { points: result.points })}</Text>
                  <TouchableOpacity style={st.secondaryBtn} onPress={() => setResult(null)} accessibilityRole="button">
                    <Text style={st.secondaryBtnText}>{t('receiptPhoto.another')}</Text>
                  </TouchableOpacity>
                </View>
              ) : photo ? (
                <View style={st.card}>
                  <Image source={{ uri: photo }} style={st.preview} resizeMode="contain" accessibilityLabel={t('receiptPhoto.previewA11y')} />
                  <Text style={st.body}>{t('receiptPhoto.checkPhoto')}</Text>
                  <TouchableOpacity style={[st.primaryBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending} accessibilityRole="button" accessibilityState={{ busy: sending }}>
                    {sending ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryBtnText}>{t('receiptPhoto.send')}</Text>}
                  </TouchableOpacity>
                  {sending && <Text style={st.hint}>{t('receiptPhoto.reading')}</Text>}
                  {!sending && (
                    <TouchableOpacity style={st.secondaryBtn} onPress={takePhoto} accessibilityRole="button">
                      <Text style={st.secondaryBtnText}>{t('receiptPhoto.retake')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={st.card}>
                  <Text style={st.cardTitle} accessibilityRole="header">{t('receiptPhoto.howTitle')}</Text>
                  {(['tip1', 'tip2', 'tip3', 'tip4'] as const).map((k) => (
                    <View key={k} style={st.tipRow}>
                      <Ionicons name="checkmark" size={18} color={COLORS.secondary} />
                      <Text style={st.tip}>{t(`receiptPhoto.${k}`, { days: access.data?.data?.data?.maxDays ?? 3, perDay: access.data?.data?.data?.perDay ?? 3 })}</Text>
                    </View>
                  ))}
                  <TouchableOpacity style={st.primaryBtn} onPress={takePhoto} accessibilityRole="button">
                    <Ionicons name="camera-outline" size={20} color="#fff" />
                    <Text style={st.primaryBtnText}>{t('receiptPhoto.take')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {problem && <View style={st.problem} accessibilityLiveRegion="assertive"><Text style={st.problemText}>{problem}</Text></View>}

              {scans.length > 0 && (
                <View style={st.card}>
                  <Text style={st.cardTitle} accessibilityRole="header">{t('receiptPhoto.mine')}</Text>
                  {scans.map((sc) => (
                    <View key={sc.id} style={st.scanRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.lineName}>{[sc.store, sc.total != null ? money(sc.total) : null].filter(Boolean).join(' · ') || t('receiptPhoto.unknownReceipt')}</Text>
                        <Text style={st.hint}>{day(sc.createdAt)}{sc.status === 'REFUSED' && sc.reason ? ` · ${sc.reason}` : ''}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[st.status, { color: statusColor(sc.status) }]}>{statusWord(sc.status)}</Text>
                        {sc.status === 'APPROVED' && <Text style={st.hint}>{t('receiptPhoto.points', { points: sc.points })}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </Animated.ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  testing: { backgroundColor: '#FDF6E8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F1DCAF' },
  testingText: { color: '#8A5300', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 10 },
  doneCard: { alignItems: 'stretch' },
  cardTitle: { color: COLORS.secondary, fontSize: 18, fontWeight: '800' },
  body: { color: COLORS.textMuted, fontSize: 15, lineHeight: 21 },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tip: { flex: 1, color: COLORS.secondary, fontSize: 15, lineHeight: 21 },
  primaryBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, marginTop: 6, minHeight: 50 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#D3DCEA', backgroundColor: COLORS.white, minHeight: 46 },
  secondaryBtnText: { color: COLORS.secondary, fontSize: 15, fontWeight: '700' },
  preview: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#F1F3F5' },
  hint: { color: COLORS.textMuted, fontSize: 13, lineHeight: 18 },
  problem: { backgroundColor: '#FDF2F2', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F5C2C7' },
  problemText: { color: '#A51B28', fontWeight: '600', fontSize: 14, lineHeight: 20 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  lineName: { color: COLORS.secondary, fontSize: 15, fontWeight: '600' },
  lineAmt: { color: COLORS.secondary, fontSize: 15, fontWeight: '700' },
  estimate: { color: COLORS.secondary, fontSize: 15, fontWeight: '700', marginTop: 4 },
  scanRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F3F5' },
  status: { fontSize: 13, fontWeight: '800' },
});
