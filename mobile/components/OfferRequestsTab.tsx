// A store manager asks HQ for a cashback promotion at their store (they post deals themselves, but cashback is set by HQ). HQ sees the request
// with its cost, can change it, then approves it (it goes live for the store's customers) or declines it with a reason; the manager gets a
// push either way and sees the answer here. A waiting request can be withdrawn. (backend offerRequests.controller.ts)
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { offerRequestsApi, offersApi } from '../services/api';
import { COLORS } from '../constants';
import { XIcon, PlusIcon } from './Icons';
import FadeSlideIn from './FadeSlideIn';
import ErrorState from './ErrorState';
import KeyboardSafe from './KeyboardSafe';
import ModalToastHost from './ModalToastHost';
import { HHMM, hoursText, dayShort } from '../utils/offerHours';

// No tobacco or alcohol: cashback on those is on hold (store policy)
const CATEGORIES = [
  { value: 'GAS', key: 'categoryGas' },
  { value: 'DIESEL', key: 'categoryDiesel' },
  { value: 'HOT_FOODS', key: 'categoryHotFoods' },
  { value: 'GROCERIES', key: 'categoryGroceries' },
  { value: 'FROZEN_FOODS', key: 'categoryFrozenFoods' },
  { value: 'FRESH_FOODS', key: 'categoryFreshFoods' },
];
const CATEGORY_KEY: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.key]));
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const STARTS = [0, 1, 7];
const LENGTHS = [1, 3, 7, 14, 30];
const MAX_CPG = 40;
const MAX_PCT = 10;

type Form = {
  title: string; category: string; mode: 'pct' | 'cpg'; bonus: string; startIn: number; days: number;
  hoursOn: boolean; from: string; to: string; weekdays: number[]; note: string;
};
const blank = (): Form => ({ title: '', category: '', mode: 'pct', bonus: '', startIn: 0, days: 7, hoursOn: false, from: '15:00', to: '18:00', weekdays: [], note: '' });

/** First and last instant: from now (or the start of a later day) to the end of the last day, on the phone's clock (the store's, in Texas). */
function datesOf(f: Form) {
  const start = new Date();
  if (f.startIn > 0) { start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + f.startIn); }
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + f.days - 1);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/** "+5% on groceries" / "+4¢ a gallon on gas", worded in the app's language. */
function bonusLine(o: { bonusRate?: number | null; gasBonusCentsPerGallon?: number | null; category?: string | null }, t: (k: string, o?: any) => string) {
  const amount = o.gasBonusCentsPerGallon != null ? t('offerRequests.centsPerGallon', { cents: o.gasBonusCentsPerGallon }) : `+${Math.round((o.bonusRate ?? 0) * 1000) / 10}%`;
  if (!o.category || !CATEGORY_KEY[o.category]) return t('offerRequests.bonusAll', { amount });
  return t('offerRequests.bonusOn', { amount, what: t(`managerOffers.${CATEGORY_KEY[o.category]}`) });
}

const fmtDay = (iso: string, lang: string) => new Date(iso).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' });

export default function OfferRequestsTab({ storeId, storeName }: { storeId?: string; storeName?: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['offer-requests'], queryFn: () => offerRequestsApi.list() });
  const all: any[] = data?.data?.data ?? [];
  const requests = storeId ? all.filter((r) => r.storeId === storeId) : all;

  const withdraw = useMutation({
    mutationFn: (id: string) => offerRequestsApi.withdraw(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['offer-requests'] }); Toast.show({ type: 'success', text1: t('offerRequests.withdrawn') }); },
    onError: (err: any) => {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : t('offerRequests.withdrawError') });
      qc.invalidateQueries({ queryKey: ['offer-requests'] });
    },
  });

  function confirmWithdraw(r: any) {
    Alert.alert(t('offerRequests.withdrawTitle'), t('offerRequests.withdrawConfirm', { title: r.title }), [
      { text: t('managerOffers.cancel'), style: 'cancel' },
      { text: t('offerRequests.withdraw'), style: 'destructive', onPress: () => withdraw.mutate(r.id) },
    ]);
  }

  const STATUS: Record<string, { label: string; color: string }> = {
    PENDING: { label: t('offerRequests.statusPending'), color: COLORS.accent },
    APPROVED: { label: t('offerRequests.statusApproved'), color: COLORS.success },
    DECLINED: { label: t('offerRequests.statusDeclined'), color: COLORS.error },
    WITHDRAWN: { label: t('offerRequests.statusWithdrawn'), color: COLORS.textMuted },
  };

  return (
    <View>
      <View style={s.intro}>
        <Text style={s.introText}>{t('offerRequests.intro')}</Text>
        <TouchableOpacity style={s.askBtn} onPress={() => setShowForm(true)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('offerRequests.ask')}>
          <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
          <Text style={s.askBtnText}>{t('offerRequests.ask')}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.card}><ActivityIndicator color={COLORS.primary} /></View>
      ) : isError ? (
        <ErrorState message={t('offerRequests.loadError')} onRetry={() => refetch()} />
      ) : requests.length === 0 ? (
        <View style={s.card}><Text style={s.empty}>{t('offerRequests.empty')}</Text></View>
      ) : (
        requests.map((r, i) => {
          const st = STATUS[r.status] ?? STATUS.PENDING;
          const shown = r.status === 'APPROVED' && r.offer ? r.offer : r;   // what HQ approved, which may differ from the ask
          const hours = hoursText(shown, t);
          return (
            <FadeSlideIn key={r.id} delay={Math.min(i * 40, 200)}>
              <View style={s.card}>
                <View style={s.row}>
                  <View style={[s.pill, { backgroundColor: st.color + '1f' }]}><Text style={[s.pillText, { color: st.color }]}>{st.label}</Text></View>
                  {r.store?.name ? <Text style={s.meta}>{r.store.name}</Text> : null}
                </View>
                <Text style={s.title}>{shown.title}</Text>
                <Text style={s.bonus}>{bonusLine(shown, t)}</Text>
                <Text style={s.meta}>{t('offerRequests.dates', { from: fmtDay(shown.startDate, i18n.language), to: fmtDay(shown.endDate, i18n.language) })}</Text>
                {hours ? <Text style={s.meta}>{t('offerRequests.paysOnly', { hours })}</Text> : null}
                {r.status === 'APPROVED' && r.offer && (r.offer.bonusText !== r.bonusText || r.offer.hoursText !== r.hoursText
                  || r.offer.startDate !== r.startDate || r.offer.endDate !== r.endDate) ? (
                  <Text style={[s.meta, { color: COLORS.text }]}>{t('offerRequests.changedByHq')}</Text>
                ) : null}
                {r.status === 'DECLINED' && r.declineReason ? (
                  <View style={s.reason}><Text style={s.reasonText}>{t('offerRequests.reason', { reason: r.declineReason })}</Text></View>
                ) : null}
                {r.status === 'PENDING' ? (
                  <TouchableOpacity style={s.withdrawBtn} onPress={() => confirmWithdraw(r)} disabled={withdraw.isPending}
                    accessibilityRole="button" accessibilityLabel={t('offerRequests.withdrawLabel', { title: r.title })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={s.withdrawText}>{t('offerRequests.withdraw')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </FadeSlideIn>
          );
        })
      )}

      <RequestFormModal visible={showForm} storeId={storeId} storeName={storeName} onClose={() => setShowForm(false)} />
    </View>
  );
}

function RequestFormModal({ visible, storeId, storeName, onClose }: { visible: boolean; storeId?: string; storeName?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(blank());
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const isGas = f.category === 'GAS' || f.category === 'DIESEL';
  const cpgMode = isGas && f.mode === 'cpg';

  // What would be sent, or the sentence that stops it
  const n = parseFloat(f.bonus.replace(',', '.'));
  // Everything but the title: what the cost estimate needs
  let offerProblem: string | null = null;
  if (!(n > 0)) offerProblem = t('offerRequests.needBonus');
  else if (cpgMode && n > MAX_CPG) offerProblem = t('offerRequests.cpgTooBig', { max: MAX_CPG });
  else if (!cpgMode && n > MAX_PCT) offerProblem = t('offerRequests.pctTooBig', { max: MAX_PCT });
  else if (f.hoursOn && (!HHMM.test(f.from) || !HHMM.test(f.to))) offerProblem = t('offerRequests.badTime');
  else if (f.hoursOn && f.from === f.to) offerProblem = t('offerRequests.sameTime');
  const problem = !f.title.trim() ? t('offerRequests.needTitle') : offerProblem;
  const hours = f.hoursOn ? { happyDays: f.weekdays, happyFrom: f.from, happyTo: f.to } : { happyDays: [], happyFrom: '', happyTo: '' };
  const payload = {
    title: f.title.trim(), storeId, category: f.category || undefined,
    ...(cpgMode ? { gasBonusCentsPerGallon: n } : { bonusRate: parseFloat((n / 100).toFixed(4)) }),
    ...datesOf(f), ...hours,
  };

  // The cost, asked again a moment after the form stops changing
  const estKey = !offerProblem ? JSON.stringify({ ...payload, title: undefined, startDate: undefined, endDate: undefined, startIn: f.startIn, days: f.days }) : '';
  const [settled, setSettled] = useState(estKey);
  useEffect(() => { const h = setTimeout(() => setSettled(estKey), 500); return () => clearTimeout(h); }, [estKey]);
  const est = useQuery({
    queryKey: ['offer-estimate', settled],
    queryFn: () => offersApi.estimate({ ...payload, title: 'estimate' }),
    enabled: visible && !!settled && settled === estKey,
    staleTime: 5 * 60_000, retry: false,
  });
  const raw = est.data?.data?.data;
  const e = raw && typeof raw.estimatedExtra === 'number' && typeof raw.basisSales === 'number' ? raw : undefined;   // anything else: no estimate

  const create = useMutation({
    mutationFn: () => offerRequestsApi.create({ ...payload, note: f.note.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offer-requests'] });
      Toast.show({ type: 'success', text1: t('offerRequests.sent'), text2: t('offerRequests.sentSub') });
      setF(blank()); onClose();
    },
    onError: (err: any) => {
      const m = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof m === 'string' ? m : t('offerRequests.sendError') });
    },
  });

  const toggleDay = (d: number) => {
    const current = f.weekdays.length === 0 ? WEEK : f.weekdays;
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
    if (next.length === 0) return;
    set('weekdays', next.length === 7 ? [] : next);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardSafe style={{ flex: 1 }}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{t('offerRequests.formTitle')}</Text>
              {storeName ? <Text style={s.modalSub}>{storeName}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={s.modalClose} accessibilityRole="button" accessibilityLabel={t('managerOffers.closeFormLabel')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <XIcon size={20} color="rgba(255,255,255,0.8)" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={s.help}>{t('offerRequests.formHelp')}</Text>

            <Label text={t('managerOffers.titleFieldLabel')} />
            <TextInput style={s.input} value={f.title} onChangeText={(v) => set('title', v)} maxLength={100}
              placeholder={t('offerRequests.titlePlaceholder')} placeholderTextColor={COLORS.textMuted} />

            <Label text={t('managerOffers.categoryFieldLabel')} />
            <View style={s.wrap}>
              <Chip on={!f.category} label={t('offerRequests.storeWide')} onPress={() => setF((x) => ({ ...x, category: '', mode: 'pct' }))} />
              {CATEGORIES.map((c) => (
                <Chip key={c.value} on={f.category === c.value} label={t(`managerOffers.${c.key}`)}
                  onPress={() => setF((x) => ({ ...x, category: c.value, mode: c.value === 'GAS' || c.value === 'DIESEL' ? x.mode : 'pct' }))} />
              ))}
            </View>

            <Label text={t('offerRequests.bonusLabel')} />
            {isGas ? (
              <View style={[s.wrap, { marginBottom: 8 }]}>
                <Chip on={f.mode === 'pct'} label={t('offerRequests.modePct')} onPress={() => set('mode', 'pct')} />
                <Chip on={f.mode === 'cpg'} label={t('offerRequests.modeCpg')} onPress={() => set('mode', 'cpg')} />
              </View>
            ) : null}
            <View style={s.inline}>
              <TextInput style={[s.input, { width: 110 }]} value={f.bonus} onChangeText={(v) => set('bonus', v)} keyboardType="decimal-pad"
                placeholder={cpgMode ? '5' : '3'} placeholderTextColor={COLORS.textMuted} accessibilityLabel={t('offerRequests.bonusLabel')} />
              <Text style={s.unit}>{cpgMode ? t('offerRequests.unitCpg') : t('offerRequests.unitPct')}</Text>
            </View>

            <Label text={t('offerRequests.startsLabel')} />
            <View style={s.wrap}>
              {STARTS.map((d) => <Chip key={d} on={f.startIn === d} label={t(`offerRequests.start${d}`)} onPress={() => set('startIn', d)} />)}
            </View>

            <Label text={t('managerOffers.durationFieldLabel')} />
            <View style={s.wrap}>
              {LENGTHS.map((d) => <Chip key={d} on={f.days === d} label={t('offerRequests.daysShort', { count: d })} onPress={() => set('days', d)} />)}
            </View>

            <Label text={t('offerRequests.hoursLabel')} />
            <View style={s.wrap}>
              <Chip on={!f.hoursOn} label={t('offerRequests.allDay')} onPress={() => set('hoursOn', false)} />
              <Chip on={f.hoursOn} label={t('offerRequests.someHours')} onPress={() => set('hoursOn', true)} />
            </View>
            {f.hoursOn ? (
              <View style={{ marginTop: 10 }}>
                <View style={s.inline}>
                  <TextInput style={[s.input, { width: 90 }]} value={f.from} onChangeText={(v) => set('from', v)} keyboardType="numbers-and-punctuation" maxLength={5}
                    accessibilityLabel={t('offerRequests.fromLabel')} />
                  <Text style={s.unit}>{t('offerRequests.to')}</Text>
                  <TextInput style={[s.input, { width: 90 }]} value={f.to} onChangeText={(v) => set('to', v)} keyboardType="numbers-and-punctuation" maxLength={5}
                    accessibilityLabel={t('offerRequests.toLabel')} />
                </View>
                <View style={[s.wrap, { marginTop: 10 }]}>
                  {WEEK.map((d) => <Chip key={d} small on={f.weekdays.length === 0 || f.weekdays.includes(d)} label={dayShort(d, t)} onPress={() => toggleDay(d)} />)}
                </View>
                <Text style={s.note}>
                  {HHMM.test(f.from) && HHMM.test(f.to) && f.from !== f.to
                    ? t('offerRequests.hoursNote', { hours: hoursText({ happyDays: f.weekdays, happyFrom: f.from, happyTo: f.to }, t) })
                    : t('offerRequests.timeFormat')}
                </Text>
              </View>
            ) : null}

            <Label text={t('offerRequests.noteLabel')} />
            <TextInput style={[s.input, { height: 76, textAlignVertical: 'top' }]} value={f.note} onChangeText={(v) => set('note', v)} maxLength={300} multiline
              placeholder={t('offerRequests.notePlaceholder')} placeholderTextColor={COLORS.textMuted} />

            {!offerProblem ? (
              <View style={s.estimate} accessibilityLiveRegion="polite">
                <Text style={s.estimateTitle}>{t('offerRequests.estimateTitle')}</Text>
                <Text style={s.estimateText}>
                  {(est.isError || (est.isSuccess && !e)) && !est.isFetching ? t('offerRequests.estimateError')
                    : !e || est.isFetching ? t('offerRequests.estimating')
                    : e.basisSales === 0 ? t('offerRequests.estimateNone')
                    : t('offerRequests.estimate', { amount: e.estimatedExtra.toFixed(2), days: e.days, perDay: e.perDay.toFixed(2), sales: e.basisSales })}
                </Text>
              </View>
            ) : null}

            {problem ? <Text style={s.problem}>{problem}</Text> : null}
            <TouchableOpacity style={[s.sendBtn, (!!problem || create.isPending) && { opacity: 0.5 }]} disabled={!!problem || create.isPending}
              onPress={() => create.mutate()} accessibilityRole="button" accessibilityLabel={t('offerRequests.send')}>
              {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.sendText}>{t('offerRequests.send')}</Text>}
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardSafe>
      <ModalToastHost />
    </Modal>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={s.label}>{text}</Text>;
}

function Chip({ on, label, onPress, small }: { on: boolean; label: string; onPress: () => void; small?: boolean }) {
  return (
    <TouchableOpacity style={[s.chip, small && s.chipSmall, on && s.chipOn]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  intro: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 12, gap: 12 },
  introText: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
  askBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12 },
  askBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 10, gap: 4 },
  empty: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  pill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  bonus: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  meta: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  reason: { backgroundColor: COLORS.error + '12', borderRadius: 10, padding: 10, marginTop: 6 },
  reasonText: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  withdrawBtn: { alignSelf: 'flex-start', marginTop: 8, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  withdrawText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },

  modal: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 52, backgroundColor: COLORS.managerPrimary },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  modalSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  modalClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: 20 },
  help: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 12, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unit: { fontSize: 14, color: COLORS.textMuted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipSmall: { paddingHorizontal: 11 },
  chipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  chipTextOn: { color: COLORS.primary, fontWeight: '800' },
  note: { fontSize: 12, color: COLORS.textMuted, marginTop: 8, lineHeight: 17 },
  estimate: { marginTop: 18, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12 },
  estimateTitle: { fontSize: 12, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  estimateText: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  problem: { marginTop: 14, fontSize: 13, color: COLORS.error },
  sendBtn: { backgroundColor: COLORS.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
