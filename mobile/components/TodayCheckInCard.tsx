// My Schedule, today (2026-10-11): where the staff member is checked in, or a Check in button. The button looks at where the phone is
// (components/ShiftCheckIn.tsx); when it cannot tell (location off, or not at one of their stores), they choose the store themselves, and
// that is recorded as chosen, with no distance.
import { useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { staffApi } from '../services/api';
import { CheckCircleIcon, MapPinIcon } from './Icons';
import { runCheckIn, AskModal, type Ask } from './ShiftCheckIn';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function TodayCheckInCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['staff-today'], queryFn: () => staffApi.today(), staleTime: 60_000 });
  const today = q.data?.data?.data as undefined | {
    shifts: { storeId: string; storeName: string | null; startTime: string; endTime: string; now: boolean }[];
    checkIn: { storeId: string; storeName: string | null; at: string } | null;
    stores: { id: string; name: string }[];
  };
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [choosing, setChoosing] = useState(false);

  if (!today || (today.shifts.length === 0 && !today.checkIn)) return null;   // nothing scheduled and not checked in: nothing to show

  const refresh = () => { qc.invalidateQueries({ queryKey: ['staff-today'] }); qc.invalidateQueries({ queryKey: ['staff-attendance'] }); };

  async function checkIn() {
    setBusy(true);
    try {
      const outcome = await runCheckIn(setAsk, true);
      if (outcome === 'checked-in') { Toast.show({ type: 'success', text1: t('staffCheckIn.checkedIn') }); refresh(); }
      else if (outcome === 'already') Toast.show({ type: 'info', text1: t('staffCheckIn.alreadyHere') });
      else if (outcome === 'not-at-store' || outcome === 'no-location') setChoosing(true);
    } catch { Toast.show({ type: 'error', text1: t('staffCheckIn.failed') }); }
    setBusy(false);
  }

  async function record(storeId: string, method: 'AUTO' | 'CHOSEN', distanceFeet: number | null, name: string) {
    try {
      await staffApi.checkIn({ storeId, method, distanceFeet });
      Toast.show({ type: 'success', text1: t('staffCheckIn.checkedInAt', { store: name }) });
      refresh();
    } catch (e: any) { Toast.show({ type: 'error', text1: e?.response?.data?.error || t('staffCheckIn.failed') }); }
  }

  const shift = today.shifts.find((s) => s.now) ?? today.shifts[0];
  const c = today.checkIn;
  const elsewhere = !!c && !!shift && c.storeId !== shift.storeId;
  return (
    <View style={[k.card, c ? (elsewhere ? k.cardWarn : k.cardOk) : null]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={k.label}>{t('staffCheckIn.todayLabel')}</Text>
        {c ? (
          <View style={k.row}>
            <CheckCircleIcon size={16} color={elsewhere ? '#92400E' : '#166534'} />
            <Text style={[k.main, { color: elsewhere ? '#92400E' : '#166534' }]}>{t('staffCheckIn.checkedInLine', { store: c.storeName ?? '', time: timeOf(c.at) })}</Text>
          </View>
        ) : (
          <Text style={k.main}>{t('staffCheckIn.notCheckedIn')}</Text>
        )}
        {shift && <Text style={k.sub}>{t('staffCheckIn.scheduledLine', { store: shift.storeName ?? '', from: shift.startTime, to: shift.endTime })}</Text>}
      </View>
      {!c && (
        <TouchableOpacity style={k.btn} onPress={checkIn} disabled={busy} accessibilityRole="button" accessibilityLabel={t('staffCheckIn.checkInA11y')}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <><MapPinIcon size={14} color="#fff" /><Text style={k.btnText}>{t('staffCheckIn.checkIn')}</Text></>}
        </TouchableOpacity>
      )}

      {ask && <AskModal ask={ask} onChoose={(yes) => { const a = ask; setAsk(null); if (yes) record(a.atStore.id, 'CHOSEN', a.distanceFeet, a.atStore.name); }} />}

      {choosing && (
        <Modal transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
          <View style={k.overlay}>
            <View style={k.sheet}>
              <Text style={k.sheetTitle}>{t('staffCheckIn.chooseTitle')}</Text>
              <Text style={k.sheetSub}>{t('staffCheckIn.chooseSub')}</Text>
              {today.stores.map((st) => (
                <TouchableOpacity key={st.id} style={k.storeBtn} onPress={() => { setChoosing(false); record(st.id, 'CHOSEN', null, st.name); }} accessibilityRole="button">
                  <Text style={k.storeBtnText}>{st.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setChoosing(false)} style={{ paddingVertical: 10 }} accessibilityRole="button">
                <Text style={k.cancel}>{t('staffCheckIn.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const k = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 16 },
  cardOk: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  cardWarn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  main: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  sub: { fontSize: 13, color: COLORS.textMuted, marginTop: 3 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.secondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minWidth: 104, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  sheetSub: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20, marginBottom: 6 },
  storeBtn: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14 },
  storeBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cancel: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
});
