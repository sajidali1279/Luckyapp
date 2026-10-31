// Where staff are (2026-10-11), the manager app's Schedule tab: for each day of the week, each person scheduled at the store or checked
// in at it, where the schedule had them and where they checked in. "At #7 instead" stands out, so an empty store is noticed. The schedule
// shown is the weekly one in use now. Data: GET /staff/attendance (backend controllers/staffCheckIn.controller.ts).
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { staffApi } from '../services/api';
import ErrorState from './ErrorState';

type Status = 'ON_SITE' | 'ELSEWHERE' | 'NO_CHECK_IN' | 'UNSCHEDULED' | 'OFF' | 'UPCOMING';
interface Entry {
  userId: string; name: string | null; status: Status;
  scheduled: { storeId: string; storeName: string; startTime: string; endTime: string } | null;
  checkIns: { storeId: string; storeName: string; at: string; method: string }[];
}

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Monday to Sunday of the week `offset` weeks from this one */
function weekRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: key(monday), to: key(sunday) };
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayTitle = (day: string, locale?: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });

const TONE: Record<Status, { fg: string; bg: string; border: string }> = {
  ON_SITE: { fg: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  ELSEWHERE: { fg: '#9F1239', bg: '#FFF1F2', border: '#FECDD3' },
  NO_CHECK_IN: { fg: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  UNSCHEDULED: { fg: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  OFF: { fg: '#475569', bg: '#F1F5F9', border: '#E2E8F0' },
  UPCOMING: { fg: '#475569', bg: '#F8FAFC', border: '#E2E8F0' },
};

export default function WhereStaffAre({ storeId, accent = COLORS.managerPrimary }: { storeId: string; accent?: string }) {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);
  const range = weekRange(offset);
  const q = useQuery({
    queryKey: ['staff-attendance', storeId, range.from],
    queryFn: () => staffApi.attendance({ ...range, storeId }),
    enabled: !!storeId,
    refetchInterval: 60_000,
  });
  const data = q.data?.data?.data as { today: string; days: { day: string; entries: Entry[] }[] } | undefined;

  const statusText = (e: Entry) => {
    const last = e.checkIns[e.checkIns.length - 1];
    switch (e.status) {
      case 'ON_SITE': return t('whereStaff.onSite');
      case 'ELSEWHERE': return t('whereStaff.elsewhere', { store: last?.storeName ?? '' });
      case 'NO_CHECK_IN': return t('whereStaff.noCheckIn');
      case 'UNSCHEDULED': return t('whereStaff.unscheduled');
      case 'OFF': return t('whereStaff.off');
      default: return t('whereStaff.upcoming');
    }
  };
  const todayEntries = data?.days.find((d) => d.day === data.today)?.entries ?? [];
  const away = todayEntries.filter((e) => e.status === 'ELSEWHERE').length;
  const missing = todayEntries.filter((e) => e.status === 'NO_CHECK_IN').length;

  return (
    <View>
      <View style={w.toggle}>
        {[0, -1].map((o) => (
          <TouchableOpacity key={o} style={[w.toggleBtn, offset === o && { backgroundColor: accent }]} onPress={() => setOffset(o)} accessibilityRole="tab" accessibilityState={{ selected: offset === o }}>
            <Text style={[w.toggleText, offset === o && { color: '#fff' }]}>{o === 0 ? t('whereStaff.thisWeek') : t('whereStaff.lastWeek')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={w.note}>{t('whereStaff.note')}</Text>

      {q.isLoading ? <ActivityIndicator style={{ marginTop: 24 }} color={accent} />
        : q.isError || !data ? <ErrorState message={t('whereStaff.loadError')} onRetry={() => q.refetch()} />
        : (
          <>
            {offset === 0 && (away > 0 || missing > 0) && (
              <View style={w.summary} accessibilityRole="alert">
                <Text style={w.summaryText}>{[away ? t('whereStaff.summaryAway', { count: away }) : null, missing ? t('whereStaff.summaryMissing', { count: missing }) : null].filter(Boolean).join(' · ')}</Text>
              </View>
            )}
            {data.days.map(({ day, entries }) => (
              <View key={day} style={w.day}>
                <Text style={[w.dayTitle, day === data.today && { color: accent }]}>
                  {dayTitle(day, i18n.language)}{day === data.today ? ` · ${t('whereStaff.today')}` : ''}
                </Text>
                {entries.length === 0 ? <Text style={w.empty}>{t('whereStaff.nobody')}</Text> : entries.map((e) => {
                  const tone = TONE[e.status];
                  const last = e.checkIns[e.checkIns.length - 1];
                  return (
                    <View key={e.userId} style={[w.row, e.status === 'ELSEWHERE' && w.rowAlert]}
                      accessible accessibilityLabel={[e.name, statusText(e), e.scheduled ? t('whereStaff.scheduledLine', { store: e.scheduled.storeName, from: e.scheduled.startTime, to: e.scheduled.endTime }) : null, last ? t('whereStaff.checkedInLine', { store: last.storeName, time: timeOf(last.at) }) : null].filter(Boolean).join('. ')}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={w.name} numberOfLines={1}>{e.name ?? ''}</Text>
                        {e.scheduled && <Text style={w.line}>{t('whereStaff.scheduledLine', { store: e.scheduled.storeName, from: e.scheduled.startTime, to: e.scheduled.endTime })}</Text>}
                        {last && <Text style={w.line}>{t('whereStaff.checkedInLine', { store: last.storeName, time: timeOf(last.at) })}{last.method === 'CHOSEN' ? ` · ${t('whereStaff.chosen')}` : ''}</Text>}
                      </View>
                      <View style={[w.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                        <Text style={[w.pillText, { color: tone.fg }]}>{statusText(e)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}
    </View>
  );
}

const w = StyleSheet.create({
  toggle: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  toggleText: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  note: { fontSize: 12, color: COLORS.textMuted, marginBottom: 12, lineHeight: 17 },
  summary: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  summaryText: { color: '#9F1239', fontWeight: '800', fontSize: 14 },
  day: { marginBottom: 16 },
  dayTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  empty: { fontSize: 13, color: COLORS.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12, marginBottom: 8 },
  rowAlert: { borderColor: '#FECDD3', borderWidth: 2 },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  line: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 150 },
  pillText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
});
