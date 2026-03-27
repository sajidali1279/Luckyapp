import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Modal,
  TextInput, RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulingApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
  THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};
const DAY_LETTER: Record<string, string> = {
  MON: 'M', TUE: 'T', WED: 'W', THU: 'T', FRI: 'F', SAT: 'S', SUN: 'S',
};

const SHIFT_COLORS: Record<string, string> = {
  OPENING: '#F4A261',
  MIDDLE:  '#2DC653',
  CLOSING: '#1D3557',
};
const SHIFT_LABELS: Record<string, string> = {
  OPENING: 'Opening', MIDDLE: 'Middle', CLOSING: 'Closing',
};
const SHIFT_TIMES: Record<string, string> = {
  OPENING: '6:00 am – 2:00 pm',
  MIDDLE:  '10:00 am – 6:00 pm',
  CLOSING: '2:00 pm – 10:00 pm',
};

const JS_DAY_TO_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getTodayDayKey(): string {
  return JS_DAY_TO_ENUM[new Date().getDay()];
}

function getCurrentWeekDates(): { key: string; date: Date }[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return DAY_ORDER.map((key, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { key, date: d };
  });
}

function fmtDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateFull(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const todayKey = getTodayDayKey();
  const weekDates = getCurrentWeekDates();

  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);

  const [requestModal, setRequestModal] = useState<{
    storeId: string; storeName: string; shiftType: string; date: Date;
    requestType: 'TIME_OFF' | 'FILL_IN';
    availableStores?: { id: string; name: string; city?: string }[];
  } | null>(null);
  const [notes, setNotes] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-schedule'],
    queryFn: () => schedulingApi.getMySchedule(),
  });

  const { data: dayRosterData, isLoading: dayRosterLoading } = useQuery({
    queryKey: ['day-roster', requestModal?.storeId, requestModal?.date?.toISOString()],
    queryFn: () => schedulingApi.getDayRoster(requestModal!.storeId, requestModal!.date.toISOString()),
    enabled: !!requestModal && requestModal.requestType === 'FILL_IN',
  });

  const createRequestMutation = useMutation({
    mutationFn: (payload: object) => schedulingApi.createRequest(payload),
    onSuccess: (_, vars: any) => {
      const isTimeOff = (vars as any).requestType === 'TIME_OFF';
      Alert.alert(
        'Request Submitted',
        isTimeOff
          ? 'Your time-off request has been sent to your manager.'
          : 'Your fill-in request has been submitted. Your manager will review it.'
      );
      qc.invalidateQueries({ queryKey: ['my-schedule'] });
      setRequestModal(null);
      setNotes('');
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to submit request');
    },
  });

  const templates: any[] = data?.data?.data?.templates || [];
  const requests: any[] = data?.data?.data?.requests || [];
  const myStores: { id: string; name: string; city?: string }[] = data?.data?.data?.stores || [];

  const templateByDay: Record<string, any> = {};
  for (const t of templates) templateByDay[t.dayOfWeek] = t;

  const pendingRequests = requests.filter((r: any) => r.status === 'PENDING');

  const selectedDayData = weekDates.find((w) => w.key === selectedDayKey)!;
  const selectedTemplate = templateByDay[selectedDayKey];
  const selectedDayISO = selectedDayData ? fmtDateISO(selectedDayData.date) : '';

  const hasPendingTimeOff = (dayISO: string) => requests.some(
    (r: any) => r.requestType === 'TIME_OFF' && r.status === 'PENDING' && fmtDateISO(new Date(r.date)) === dayISO
  );
  const hasApprovedTimeOff = (dayISO: string) => requests.some(
    (r: any) => r.requestType === 'TIME_OFF' && r.status === 'APPROVED' && fmtDateISO(new Date(r.date)) === dayISO
  );
  const hasPendingFillIn = (dayISO: string) => requests.some(
    (r: any) => r.requestType === 'FILL_IN' && r.status === 'PENDING' && fmtDateISO(new Date(r.date)) === dayISO
  );

  function handleRequestOff(template: any, date: Date) {
    setRequestModal({ storeId: template.storeId, storeName: template.store?.name || 'Store', shiftType: template.shiftType, date, requestType: 'TIME_OFF' });
    setNotes('');
  }

  function handleFillIn(storeId: string, storeName: string, date: Date) {
    setRequestModal({ storeId, storeName, shiftType: 'OPENING', date, requestType: 'FILL_IN', availableStores: myStores.length > 1 ? myStores : undefined });
    setNotes('');
  }

  function submitRequest() {
    if (!requestModal) return;
    createRequestMutation.mutate({
      storeId: requestModal.storeId,
      requestType: requestModal.requestType,
      date: requestModal.date.toISOString(),
      shiftType: requestModal.shiftType,
      notes: notes.trim() || undefined,
    });
  }

  // Count scheduled days for summary
  const scheduledDays = DAY_ORDER.filter((k) => !!templateByDay[k]).length;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>⛽ LUCKY STOP STAFF</Text>
            <Text style={s.headerTitle}>My Schedule</Text>
          </View>
          <View style={s.scheduleSummary}>
            <Text style={s.summaryNum}>{scheduledDays}</Text>
            <Text style={s.summaryLbl}>shifts/wk</Text>
          </View>
        </View>

        {/* ── Week Calendar Strip ── */}
        {!isLoading && (
          <View style={s.calendarStrip}>
            {weekDates.map(({ key, date }) => {
              const isSelected = key === selectedDayKey;
              const isToday = key === todayKey;
              const template = templateByDay[key];
              const shiftColor = template ? SHIFT_COLORS[template.shiftType] : null;
              const dayISO = fmtDateISO(date);
              const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

              return (
                <TouchableOpacity
                  key={key}
                  style={s.calCell}
                  onPress={() => setSelectedDayKey(key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.calLetter, isSelected && s.calLetterSelected, isToday && !isSelected && s.calLetterToday]}>
                    {DAY_LETTER[key]}
                  </Text>
                  <View style={[
                    s.calDateCircle,
                    isSelected && s.calDateCircleSelected,
                    isToday && !isSelected && s.calDateCircleToday,
                  ]}>
                    <Text style={[
                      s.calDate,
                      isSelected && s.calDateSelected,
                      isToday && !isSelected && s.calDateToday,
                      isPast && !isSelected && s.calDatePast,
                    ]}>
                      {date.getDate()}
                    </Text>
                  </View>
                  {/* Shift dot */}
                  {shiftColor ? (
                    <View style={[s.calDot, { backgroundColor: isSelected ? '#fff' : shiftColor }]} />
                  ) : (
                    <View style={s.calDotEmpty} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />
        }
      >
        {isLoading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={s.loadingText}>Loading your schedule…</Text>
          </View>
        ) : (
          <>
            {/* ── Selected Day Detail ── */}
            {selectedDayData && (
              <View style={[s.dayCard, selectedDayKey === todayKey && s.dayCardToday]}>
                {/* Day header */}
                <View style={s.dayCardHeader}>
                  <View>
                    <Text style={[s.dayName, selectedDayKey === todayKey && s.dayNameToday]}>
                      {DAY_LABELS[selectedDayKey]}
                    </Text>
                    <Text style={s.dayDate}>{fmtMonthDay(selectedDayData.date)}</Text>
                  </View>
                  {selectedDayKey === todayKey && (
                    <View style={s.todayBadge}><Text style={s.todayBadgeText}>Today</Text></View>
                  )}
                </View>

                {selectedTemplate ? (
                  <View style={s.shiftDetail}>
                    {/* Shift badge */}
                    <View style={[s.shiftBadge, { backgroundColor: SHIFT_COLORS[selectedTemplate.shiftType] + '18', borderColor: SHIFT_COLORS[selectedTemplate.shiftType] + '50' }]}>
                      <View style={[s.shiftDot, { backgroundColor: SHIFT_COLORS[selectedTemplate.shiftType] }]} />
                      <Text style={[s.shiftBadgeLabel, { color: SHIFT_COLORS[selectedTemplate.shiftType] }]}>
                        {SHIFT_LABELS[selectedTemplate.shiftType]}
                      </Text>
                      <Text style={[s.shiftBadgeTime, { color: SHIFT_COLORS[selectedTemplate.shiftType] }]}>
                        {selectedTemplate.startTime} – {selectedTemplate.endTime}
                      </Text>
                    </View>

                    {/* Store */}
                    <View style={s.storeRow}>
                      <Text style={s.storePin}>📍</Text>
                      <Text style={s.storeName}>
                        {selectedTemplate.store?.name || 'Store'}{selectedTemplate.store?.city ? `, ${selectedTemplate.store.city}` : ''}
                      </Text>
                    </View>

                    {/* Time off status / button */}
                    {hasApprovedTimeOff(selectedDayISO) ? (
                      <View style={s.statusPill}>
                        <Text style={s.statusPillText}>✅  Time Off Approved</Text>
                      </View>
                    ) : hasPendingTimeOff(selectedDayISO) ? (
                      <View style={[s.statusPill, s.statusPillAmber]}>
                        <Text style={[s.statusPillText, s.statusPillAmberText]}>⏳  Time Off Pending</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={s.actionBtn}
                        onPress={() => handleRequestOff(selectedTemplate, selectedDayData.date)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.actionBtnText}>Request Off</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={s.dayOffDetail}>
                    <View style={s.dayOffIconWrap}>
                      <Text style={s.dayOffIcon}>😴</Text>
                    </View>
                    <Text style={s.dayOffLabel}>Day Off</Text>
                    {/* Fill-in */}
                    {(() => {
                      const isPast = selectedDayData.date < new Date(new Date().setHours(0, 0, 0, 0));
                      if (isPast) return <Text style={s.pastDayNote}>Past day</Text>;
                      const storeId = templates[0]?.storeId || user?.storeIds?.[0];
                      const storeName = templates[0]?.store?.name || 'Your Store';
                      if (!storeId) return null;
                      return hasPendingFillIn(selectedDayISO) ? (
                        <View style={[s.statusPill, s.statusPillGreen]}>
                          <Text style={[s.statusPillText, s.statusPillGreenText]}>⏳  Fill-In Requested</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[s.actionBtn, s.actionBtnGreen]}
                          onPress={() => handleFillIn(storeId, storeName, selectedDayData.date)}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.actionBtnText, s.actionBtnGreenText]}>+ Request Extra Shift</Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
                )}
              </View>
            )}

            {/* ── Week Overview ── */}
            <Text style={s.sectionLabel}>This Week</Text>
            <View style={s.weekOverview}>
              {weekDates.map(({ key, date }) => {
                const template = templateByDay[key];
                const isToday = key === todayKey;
                const shiftColor = template ? SHIFT_COLORS[template.shiftType] : null;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[s.weekDot, isToday && s.weekDotToday]}
                    onPress={() => setSelectedDayKey(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.weekDotDay, isToday && s.weekDotDayToday]}>{key.slice(0, 2)}</Text>
                    {shiftColor ? (
                      <View style={[s.weekDotShift, { backgroundColor: shiftColor }]}>
                        <Text style={s.weekDotShiftLabel}>{SHIFT_LABELS[template.shiftType][0]}</Text>
                      </View>
                    ) : (
                      <View style={s.weekDotOff}><Text style={s.weekDotOffText}>–</Text></View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Pending Requests ── */}
            {pendingRequests.length > 0 && (
              <>
                <View style={s.sectionRow}>
                  <Text style={s.sectionLabel}>Pending Requests</Text>
                  <View style={s.sectionBadge}><Text style={s.sectionBadgeText}>{pendingRequests.length}</Text></View>
                </View>
                {pendingRequests.map((r: any) => {
                  const isTimeOff = r.requestType === 'TIME_OFF';
                  const typeColor = isTimeOff ? '#E63946' : '#2DC653';
                  return (
                    <View key={r.id} style={[s.requestCard, { borderLeftColor: typeColor }]}>
                      <View style={s.requestCardTop}>
                        <View style={[s.requestTypePill, { backgroundColor: typeColor + '18' }]}>
                          <Text style={[s.requestTypeText, { color: typeColor }]}>
                            {isTimeOff ? '🏖️ Time Off' : '🙋 Fill-In'}
                          </Text>
                        </View>
                        <View style={s.pendingTag}>
                          <View style={s.pendingDot} />
                          <Text style={s.pendingTagText}>Pending</Text>
                        </View>
                      </View>
                      <Text style={s.requestDate}>{fmtDateFull(r.date)}</Text>
                      <Text style={s.requestShift}>
                        {SHIFT_LABELS[r.shiftType]}{r.store?.name ? ` · ${r.store.name}` : ''}
                      </Text>
                      {r.notes ? <Text style={s.requestNotes}>"{r.notes}"</Text> : null}
                    </View>
                  );
                })}
              </>
            )}

            {/* ── Tips ── */}
            <View style={s.infoBox}>
              <Text style={s.infoTitle}>💡 How it works</Text>
              <Text style={s.infoText}>
                On your <Text style={{ fontWeight: '700' }}>days off</Text>, tap{' '}
                <Text style={{ fontWeight: '700' }}>+ Request Extra Shift</Text> to volunteer for an open slot.
              </Text>
              <Text style={[s.infoText, { marginTop: 6 }]}>
                On your <Text style={{ fontWeight: '700' }}>scheduled days</Text>, tap{' '}
                <Text style={{ fontWeight: '700' }}>Request Off</Text> to submit a time-off request.
              </Text>
            </View>

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>

      {/* ── Request Modal ── */}
      <Modal visible={!!requestModal} transparent animationType="slide" onRequestClose={() => setRequestModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.modalDrag} />
            <Text style={s.modalTitle}>
              {requestModal?.requestType === 'FILL_IN' ? 'Request Extra Shift' : 'Request Time Off'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {requestModal && (
                <>
                  {/* Fill-in: shift picker */}
                  {requestModal.requestType === 'FILL_IN' && (
                    <View style={{ marginBottom: 16 }}>
                      {requestModal.availableStores && requestModal.availableStores.length > 1 && (
                        <View style={{ marginBottom: 14 }}>
                          <Text style={s.modalLabel}>Store</Text>
                          <View style={s.chipRow}>
                            {requestModal.availableStores.map((store) => {
                              const isActive = requestModal.storeId === store.id;
                              return (
                                <TouchableOpacity
                                  key={store.id}
                                  style={[s.chip, isActive && s.chipActive]}
                                  onPress={() => setRequestModal({ ...requestModal, storeId: store.id, storeName: store.name })}
                                  activeOpacity={0.8}
                                >
                                  <Text style={[s.chipText, isActive && s.chipTextActive]}>
                                    {store.name}{store.city ? ` · ${store.city}` : ''}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      <Text style={s.modalLabel}>
                        {fmtMonthDay(requestModal.date)} · {requestModal.storeName} — Pick a shift
                      </Text>
                      {dayRosterLoading ? (
                        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 12 }} />
                      ) : (
                        (['OPENING', 'MIDDLE', 'CLOSING'] as const).map((st) => {
                          const slot = dayRosterData?.data?.data?.shifts?.[st];
                          const staff: any[] = slot?.employees || [];
                          const isEmpty = staff.length === 0;
                          const isSelected = requestModal.shiftType === st;
                          const color = SHIFT_COLORS[st];
                          return (
                            <TouchableOpacity
                              key={st}
                              style={[s.shiftSlot, isSelected && { borderColor: color, backgroundColor: color + '10' }]}
                              onPress={() => setRequestModal({ ...requestModal, shiftType: st })}
                              activeOpacity={0.8}
                            >
                              <View style={[s.shiftSlotIconWrap, { backgroundColor: color + '20' }]}>
                                <View style={[s.shiftSlotDot, { backgroundColor: color }]} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[s.shiftSlotName, isSelected && { color }]}>{SHIFT_LABELS[st]}</Text>
                                <Text style={s.shiftSlotTime}>{SHIFT_TIMES[st]}</Text>
                              </View>
                              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                {isEmpty ? (
                                  <View style={s.emptyShiftBadge}><Text style={s.emptyShiftText}>Empty ⚠️</Text></View>
                                ) : (
                                  <Text style={s.shiftStaffNames} numberOfLines={1}>{staff.map((e: any) => e.name || e.phone).join(', ')}</Text>
                                )}
                                {isSelected && (
                                  <View style={[s.selectedCheck, { backgroundColor: color }]}>
                                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✓</Text>
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}

                  {/* Time off: summary */}
                  {requestModal.requestType === 'TIME_OFF' && (
                    <View style={s.summaryCard}>
                      <Text style={s.summaryCardRow}>📅 {fmtMonthDay(requestModal.date)} ({JS_DAY_TO_ENUM[requestModal.date.getDay()]})</Text>
                      <Text style={s.summaryCardRow}>🕐 {SHIFT_LABELS[requestModal.shiftType]} · {SHIFT_TIMES[requestModal.shiftType]}</Text>
                      <Text style={s.summaryCardRow}>📍 {requestModal.storeName}</Text>
                    </View>
                  )}

                  <Text style={s.modalLabel}>Notes <Text style={s.optionalTag}>(optional)</Text></Text>
                  <TextInput
                    style={s.modalInput}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={requestModal.requestType === 'FILL_IN' ? 'Any notes for your manager…' : 'Reason for time off…'}
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />

                  <TouchableOpacity
                    style={s.submitBtn}
                    onPress={submitRequest}
                    activeOpacity={0.8}
                    disabled={createRequestMutation.isPending}
                  >
                    {createRequestMutation.isPending
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.submitBtnText}>Submit Request →</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setRequestModal(null)} activeOpacity={0.8}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  headerBg: { backgroundColor: '#1D3557' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 12,
  },
  headerEyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  scheduleSummary: {
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  summaryNum: { color: '#fff', fontSize: 20, fontWeight: '900' },
  summaryLbl: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700' },

  // Calendar strip
  calendarStrip: {
    flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 16, paddingTop: 4,
  },
  calCell: { flex: 1, alignItems: 'center', gap: 4 },
  calLetter: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' },
  calLetterSelected: { color: '#fff' },
  calLetterToday: { color: 'rgba(255,255,255,0.75)' },
  calDateCircle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  calDateCircleSelected: { backgroundColor: '#fff' },
  calDateCircleToday: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  calDate: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  calDateSelected: { color: '#1D3557', fontWeight: '900' },
  calDateToday: { color: '#fff' },
  calDatePast: { color: 'rgba(255,255,255,0.3)' },
  calDot: { width: 5, height: 5, borderRadius: 3 },
  calDotEmpty: { width: 5, height: 5 },

  // Body
  body: { padding: 16, paddingBottom: 32 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { color: '#9ca3af', fontSize: 14 },

  // Day card
  dayCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  dayCardToday: {
    borderColor: '#1D3557', borderWidth: 2,
    shadowColor: '#1D3557', shadowOpacity: 0.12,
  },
  dayCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  dayName: { fontSize: 20, fontWeight: '800', color: '#111827' },
  dayNameToday: { color: '#1D3557' },
  dayDate: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  todayBadge: { backgroundColor: '#1D3557', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  todayBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  shiftDetail: { gap: 12 },
  shiftBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  shiftDot: { width: 9, height: 9, borderRadius: 5 },
  shiftBadgeLabel: { fontSize: 14, fontWeight: '800' },
  shiftBadgeTime: { fontSize: 13, fontWeight: '600' },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storePin: { fontSize: 14 },
  storeName: { fontSize: 13, color: '#6b7280', fontWeight: '600' },

  statusPill: {
    backgroundColor: '#f0fdf4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#bbf7d0', alignSelf: 'flex-start',
  },
  statusPillText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  statusPillAmber: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusPillAmberText: { color: '#b45309' },
  statusPillGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statusPillGreenText: { color: '#16a34a' },

  actionBtn: {
    backgroundColor: '#E63946' + '12', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: '#E63946' + '30', alignSelf: 'flex-start',
  },
  actionBtnText: { color: '#E63946', fontSize: 13, fontWeight: '700' },
  actionBtnGreen: { backgroundColor: '#2DC653' + '12', borderColor: '#2DC653' + '30' },
  actionBtnGreenText: { color: '#2DC653' },

  dayOffDetail: { alignItems: 'center', paddingVertical: 10, gap: 8 },
  dayOffIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  dayOffIcon: { fontSize: 26 },
  dayOffLabel: { fontSize: 15, color: '#9ca3af', fontWeight: '600', marginBottom: 4 },
  pastDayNote: { fontSize: 12, color: '#d1d5db' },

  // Week overview
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8 },
  sectionBadge: { backgroundColor: '#1D3557', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  sectionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  weekOverview: {
    flexDirection: 'row', gap: 6, marginBottom: 24,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  weekDot: { flex: 1, alignItems: 'center', gap: 6 },
  weekDotToday: {},
  weekDotDay: { fontSize: 10, fontWeight: '700', color: '#9ca3af' },
  weekDotDayToday: { color: '#1D3557' },
  weekDotShift: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  weekDotShiftLabel: { color: '#fff', fontSize: 12, fontWeight: '900' },
  weekDotOff: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  weekDotOffText: { color: '#d1d5db', fontSize: 14, fontWeight: '700' },

  // Pending requests
  requestCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    gap: 6,
  },
  requestCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  requestTypePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  requestTypeText: { fontSize: 12, fontWeight: '700' },
  pendingTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fffbeb', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  pendingTagText: { fontSize: 10, fontWeight: '800', color: '#b45309' },
  requestDate: { fontSize: 14, fontWeight: '700', color: '#111827' },
  requestShift: { fontSize: 12, color: '#6b7280' },
  requestNotes: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },

  // Info box
  infoBox: {
    backgroundColor: '#eff6ff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#bfdbfe', marginTop: 8, gap: 4,
  },
  infoTitle: { fontSize: 13, fontWeight: '800', color: '#1d4ed8', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#1e40af', lineHeight: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '92%',
  },
  modalDrag: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 18, textAlign: 'center' },
  modalLabel: { fontSize: 11, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  optionalTag: { fontSize: 10, fontWeight: '500', textTransform: 'none', color: '#9ca3af' },

  summaryCard: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, gap: 8, marginBottom: 18, borderWidth: 1, borderColor: '#e5e7eb' },
  summaryCardRow: { fontSize: 14, fontWeight: '600', color: '#374151' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#1D3557', borderColor: '#1D3557' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },

  shiftSlot: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f8fafc', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e5e7eb',
    padding: 12, marginBottom: 8,
  },
  shiftSlotIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  shiftSlotDot: { width: 10, height: 10, borderRadius: 5 },
  shiftSlotName: { fontSize: 13, fontWeight: '800', color: '#111827' },
  shiftSlotTime: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  shiftStaffNames: { fontSize: 11, color: '#6b7280', textAlign: 'right', maxWidth: 120 },
  emptyShiftBadge: { backgroundColor: '#fff1f2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  emptyShiftText: { fontSize: 11, fontWeight: '700', color: '#E63946' },
  selectedCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  modalInput: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#111827', borderWidth: 1.5, borderColor: '#e5e7eb',
    minHeight: 80, marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: '#1D3557', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 10,
    shadowColor: '#1D3557', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  cancelBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
});
