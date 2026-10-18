// Recent (2026-10-18): the cashier's own sales and redemptions today, a sale's lines together, with what happened to each (credited,
// held for a manager, not finished, rejected). A receipt the customer left behind can be added to their sale from here, without the QR:
// only within HQ's minutes of the sale (default 60), a few a day (default 3), always with a new receipt photo; HQ's amount and over
// (default $50) waits for a manager, and the customer is told who added it. Backend: getCashierRecent and initiateGrant (addToSaleId).
import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text, TextInput } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import KeyboardSafe from '../../components/KeyboardSafe';
import FocusStatusBar from '../../components/FocusStatusBar';
import { ClockIcon } from '../../components/Icons';
import { pointsApi } from '../../services/api';
import { COLORS } from '../../constants';
import { usePullRefresh } from '../../hooks/usePullRefresh';

type Line = { id: string; category: string; purchaseAmount: number; points: number; status: 'CREDITED' | 'HELD' | 'NOT_FINISHED' | 'REJECTED' | 'VOIDED'; addOn: boolean };
type Sale = { saleId: string; storeId: string; createdAt: string; store: string | null; customer: { name: string; last4: string }; lines: Line[]; canAddReceipt: boolean; addReceiptUntil: string };
type Redemption = { id: string; kind: 'CREDITS' | 'REWARD'; createdAt: string; customer: { name: string; last4: string }; points: number; title: string | null };
type Limits = { left: number; perDay: number; minutes: number; holdFrom: number };

const CATEGORIES: { value: string; labelKey: string; icon: string }[] = [
  { value: 'GAS', labelKey: 'employeeScan.catGas', icon: '⛽' },
  { value: 'DIESEL', labelKey: 'employeeScan.catDiesel', icon: '🚛' },
  { value: 'HOT_FOODS', labelKey: 'employeeScan.catHotFoods', icon: '🌮' },
  { value: 'GROCERIES', labelKey: 'employeeScan.catGroceries', icon: '🛒' },
  { value: 'FROZEN_FOODS', labelKey: 'employeeScan.catFrozen', icon: '🧊' },
  { value: 'FRESH_FOODS', labelKey: 'employeeScan.catFresh', icon: '🥗' },
  { value: 'TOBACCO_VAPES', labelKey: 'employeeScan.catTobacco', icon: '🚬' },
  { value: 'ALCOHOL', labelKey: 'employeeScan.catAlcohol', icon: '🍺' },
  { value: 'OTHER', labelKey: 'employeeScan.catOther', icon: '🏪' },
];
const STATUS_STYLE: Record<Line['status'], { color: string; bg: string }> = {
  CREDITED: { color: '#166534', bg: '#DCFCE7' },
  HELD: { color: '#92400E', bg: '#FEF3C7' },
  NOT_FINISHED: { color: '#4B5563', bg: '#F3F4F6' },
  REJECTED: { color: '#B91C1C', bg: '#FEE2E2' },
  VOIDED: { color: '#4B5563', bg: '#F3F4F6' },
};
const time = (iso: string, lang: string) => new Date(iso).toLocaleTimeString(lang.startsWith('es') ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit' });
const who = (c: { name: string; last4: string }, t: (k: string, o?: any) => string) => (c.name ? `${c.name} ··${c.last4}` : t('employeeRecent.customerLast4', { last4: c.last4 }));

export default function RecentScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cashier-recent'], queryFn: () => pointsApi.getCashierRecent(), refetchInterval: 60_000 });
  const data = q.data?.data?.data;
  const sales: Sale[] = data?.sales ?? [];
  const redemptions: Redemption[] = data?.redemptions ?? [];
  const limits: Limits | undefined = data?.addReceipts;
  const { refreshing, onRefresh } = usePullRefresh([q.refetch]);
  useFocusEffect(useCallback(() => { q.refetch(); }, []));   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add a receipt the customer left ──
  const [adding, setAdding] = useState<Sale | null>(null);
  const [category, setCategory] = useState('GROCERIES');
  const [amount, setAmount] = useState('');
  const [gallons, setGallons] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);   // the line, once saved: a retried upload reuses it
  const [busy, setBusy] = useState(false);
  const isGas = category === 'GAS' || category === 'DIESEL';
  const amountNum = parseFloat(amount);
  const open = (s: Sale) => { setAdding(s); setCategory('GROCERIES'); setAmount(''); setGallons(''); setPhoto(null); setCreatedId(null); };
  const close = () => {
    // Saved but no photo: it is cancelled now (the server would after 30 minutes anyway)
    if (createdId) pointsApi.cancelGrant([createdId]).catch(() => {});
    setAdding(null);
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Toast.show({ type: 'error', text1: t('employeeRecent.cameraDenied') }); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled) setPhoto(r.assets[0].uri);
  };
  const submit = async () => {
    if (!adding) return;
    if (!(amountNum > 0)) { Toast.show({ type: 'error', text1: t('employeeRecent.needAmount') }); return; }
    if (isGas && !(parseFloat(gallons) > 0)) { Toast.show({ type: 'error', text1: t('employeeScan.enterGallons') }); return; }
    if (!photo) { Toast.show({ type: 'error', text1: t('employeeRecent.needPhoto') }); return; }
    setBusy(true);
    try {
      let id = createdId;
      let held = false;
      if (!id) {
        const r = await pointsApi.initiateGrant({
          addToSaleId: adding.saleId, storeId: adding.storeId, purchaseAmount: amountNum, category,
          ...(isGas ? { isGas: true, gasGallons: parseFloat(gallons) } : {}),
        });
        id = r.data.data.transactionId as string;
        held = !!r.data.flagged;
        setCreatedId(id);
      }
      const fd = new FormData();
      fd.append('receipt', { uri: photo, name: 'receipt.jpg', type: 'image/jpeg' } as any);
      const up = await pointsApi.uploadReceipt(id, fd);
      held = held || !!up.data?.flagged;
      setCreatedId(null);
      setAdding(null);
      Toast.show({ type: 'success', text1: held ? t('employeeRecent.addedHeld') : t('employeeRecent.addedCredited'), text2: t('employeeRecent.customerTold') });
      qc.invalidateQueries({ queryKey: ['cashier-recent'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.error || t('employeeRecent.failed') });
      if (e?.response?.data?.code === 'SALE_CANCELLED') setCreatedId(null);
    } finally { setBusy(false); }
  };
  const confirmClose = () => {
    if (!createdId && !photo && !amount) { close(); return; }
    Alert.alert(t('employeeRecent.discardTitle'), t('employeeRecent.discardBody'), [
      { text: t('employeeRecent.keepGoing'), style: 'cancel' },
      { text: t('employeeRecent.discard'), style: 'destructive', onPress: close },
    ]);
  };

  const empty = !q.isLoading && sales.length === 0 && redemptions.length === 0;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <FocusStatusBar barStyle="dark-content" />
      <View style={s.header}>
        <View style={s.iconWrap}><ClockIcon size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t('employeeRecent.title')}</Text>
          <Text style={s.headerSub}>{t('employeeRecent.sub')}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {q.isLoading ? <ActivityIndicator style={{ marginTop: 30 }} /> : empty ? (
          <Text style={s.empty}>{t('employeeRecent.empty')}</Text>
        ) : (
          <>
            {limits && limits.perDay > 0 && <Text style={s.limit}>{t('employeeRecent.addLeft', { left: limits.left, perDay: limits.perDay, minutes: limits.minutes })}</Text>}
            {sales.map((sale) => (
              <View key={sale.saleId} style={s.card}>
                <View style={s.cardTop}>
                  <Text style={s.who}>{who(sale.customer, t)}</Text>
                  <Text style={s.time}>{time(sale.createdAt, i18n.language)}</Text>
                </View>
                {sale.lines.map((l) => {
                  const st = STATUS_STYLE[l.status] ?? STATUS_STYLE.NOT_FINISHED;
                  const cat = CATEGORIES.find((c) => c.value === l.category);
                  return (
                    <View key={l.id} style={s.line}>
                      <Text style={s.lineText} numberOfLines={1}>{cat?.icon ?? '🏪'} {cat ? t(cat.labelKey) : l.category} · ${l.purchaseAmount.toFixed(2)}{l.addOn ? `  ${t('employeeRecent.addedTag')}` : ''}</Text>
                      <Text style={[s.status, { color: st.color, backgroundColor: st.bg }]}>{t(`employeeRecent.status.${l.status}`)}</Text>
                    </View>
                  );
                })}
                {sale.canAddReceipt && (
                  <TouchableOpacity style={s.addBtn} onPress={() => open(sale)} accessibilityRole="button" accessibilityLabel={t('employeeRecent.addA11y', { customer: who(sale.customer, t) })}>
                    <Text style={s.addBtnText}>+ {t('employeeRecent.addReceipt')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {redemptions.length > 0 && <Text style={s.section}>{t('employeeRecent.redemptions')}</Text>}
            {redemptions.map((r) => (
              <View key={r.id} style={[s.card, s.cardTop]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.who}>{who(r.customer, t)}</Text>
                  <Text style={s.lineText}>{r.kind === 'REWARD' ? `🎁 ${r.title ?? t('employeeRecent.reward')}` : `💵 ${t('employeeRecent.credits')}`} · {t('employeeRecent.points', { points: r.points.toLocaleString() })}</Text>
                </View>
                <Text style={s.time}>{time(r.createdAt, i18n.language)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!adding} animationType="slide" onRequestClose={confirmClose}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <KeyboardSafe style={{ flex: 1 }}>
            <View style={s.modalTop}>
              <TouchableOpacity onPress={confirmClose} accessibilityRole="button" style={{ paddingVertical: 4, paddingRight: 12 }}><Text style={s.back}>‹ {t('employeeRecent.back')}</Text></TouchableOpacity>
              <Text style={s.modalTitle}>{t('employeeRecent.addReceipt')}</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {adding && <Text style={s.forWho}>{t('employeeRecent.forCustomer', { customer: who(adding.customer, t), time: time(adding.createdAt, i18n.language) })}</Text>}
              <Text style={s.note}>{t('employeeRecent.rule')}</Text>
              <Text style={s.label}>{t('employeeRecent.category')}</Text>
              <View style={s.chips}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c.value} onPress={() => !createdId && setCategory(c.value)} disabled={!!createdId} style={[s.chip, category === c.value && s.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: category === c.value }}>
                    <Text style={[s.chipText, category === c.value && s.chipTextOn]}>{c.icon} {t(c.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>{t('employeeRecent.amount')}</Text>
              <TextInput style={s.input} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" editable={!createdId} placeholderTextColor="#9CA3AF" />
              {isGas && (
                <>
                  <Text style={s.label}>{t('employeeRecent.gallons')}</Text>
                  <TextInput style={s.input} value={gallons} onChangeText={(v) => setGallons(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.000" editable={!createdId} placeholderTextColor="#9CA3AF" />
                </>
              )}
              {limits && amountNum >= limits.holdFrom && <Text style={s.hold}>{t('employeeRecent.willHold', { amount: limits.holdFrom })}</Text>}
              <Text style={s.label}>{t('employeeRecent.photo')}</Text>
              <TouchableOpacity style={s.photoBtn} onPress={takePhoto} accessibilityRole="button" accessibilityLabel={t('employeeRecent.photo')}>
                {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Text style={s.photoHint}>📷 {t('employeeRecent.takePhoto')}</Text>}
              </TouchableOpacity>
              <Text style={s.hint}>{t('employeeRecent.photoHint')}</Text>
              <TouchableOpacity style={[s.send, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.sendText}>{createdId ? t('employeeRecent.retryUpload') : t('employeeRecent.addIt')}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardSafe>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 15, lineHeight: 21 },
  limit: { fontSize: 12, color: '#6B7280', marginBottom: 10, lineHeight: 17 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  who: { fontSize: 15, fontWeight: '800', color: '#111827' },
  time: { fontSize: 13, color: '#6B7280' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  lineText: { fontSize: 14, color: '#374151', flexShrink: 1 },
  status: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  addBtn: { marginTop: 10, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary },
  addBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  section: { fontSize: 13, fontWeight: '800', color: '#6B7280', marginTop: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  back: { fontSize: 16, fontWeight: '700', color: '#1D4ED8' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  forWho: { fontSize: 16, fontWeight: '800', color: '#111827' },
  note: { fontSize: 13, color: '#4B5563', marginTop: 6, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff' },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#fff' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: '#111827' },
  hold: { fontSize: 13, color: '#92400E', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, marginTop: 10, overflow: 'hidden', lineHeight: 18 },
  photoBtn: { height: 180, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9CA3AF', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoHint: { fontSize: 14, fontWeight: '700', color: '#1D4ED8' },
  hint: { fontSize: 12, color: '#6B7280', marginTop: 6, lineHeight: 17 },
  send: { marginTop: 20, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
