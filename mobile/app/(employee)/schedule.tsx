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
const DAY_SHORT: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed',
  THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

const SHIFT_COLORS: Record<string, string> = {
  OPENING: '#F4A261',
  MIDDLE:  COLORS.success,
  CLOSING: COLORS.secondary,
};

const SHIFT_SLOT_COLORS = SHIFT_COLORS;
const SHIFT_SLOT_TIMES: Record<string, string> = {
  OPENING: '6:00 am – 2:00 pm',
  MIDDLE:  '10:00 am – 6:00 pm',
  CLOSING: '2:00 pm – 10:00 pm',
};

const SHIFT_LABELS: Record<string, string> = {
  OPENING: 'Opening',
  MIDDLE:  'Middle',
  CLOSING: 'Closing',
};

const JS_DAY_TO_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getTodayDayKey(): string {
  return JS_DAY_TO_ENUM[new Date().getDay()];
}

// Build the current week Mon–Sun with actual dates
function getCurrentWeekDates(): { key: string; date: Date }[] {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  // Monday of this week
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

  // Request modal — handles both TIME_OFF and FILL_IN
  const [requestModal, setRequestModal] = useState<{
    storeId: string; storeName: string; shiftType: string; date: Date;
    requestType: 'TIME_OFF' | 'FILL_IN';
  } | null>(null);
  const [notes, setNotes] = useState('');

  const {
    data, isLoading, refetch, isRefetching,
  } = useQuery({
    queryKey: ['my-schedule'],
    queryFn: () => schedulingApi.getMySchedule(),
  });

  // Fetch day roster when fill-in modal is open
  const {
    data: dayRosterData, isLoading: dayRosterLoading,
  } = useQuery({
    queryKey: ['day-roster', requestModal?.storeId, requestModal?.date?.toISOString()],
    queryFn: () => schedulingApi.getDayRoster(
      requestModal!.storeId,
      requestModal!.date.toISOString()
    ),
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

  // Build a map: dayKey → template
  const templateByDay: Record<string, any> = {};
  for (const t of templates) {
    templateByDay[t.dayOfWeek] = t;
  }

  // Pending requests for quick display
  const pendingRequests = requests.filter((r: any) => r.status === 'PENDING');

  function handleRequestOff(template: any, date: Date) {
    setRequestModal({
      storeId: template.storeId,
      storeName: template.store?.name || 'Store',
      shiftType: template.shiftType,
      date,
      requestType: 'TIME_OFF',
    });
    setNotes('');
  }

  function handleFillIn(storeId: string, storeName: string, shiftType: string, date: Date) {
    setRequestModal({
      storeId,
      storeName,
      shiftType,
      date,
      requestType: 'FILL_IN',
    });
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

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerSub}>⛽ Lucky Stop Staff</Text>
            <Text style={s.headerTitle}>My Schedule</Text>
          </View>
          <View style={s.calendarIcon}>
            <Text style={{ fontSize: 24 }}>📅</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {isLoading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={s.loadingText}>Loading your schedule...</Text>
          </View>
        ) : (
          <>
            {/* ── Week Header ── */}
            <View style={s.weekHeader}>
              <Text style={s.weekLabel}>
                Week of {fmtMonthDay(weekDates[0].date)} – {fmtMonthDay(weekDates[6].date)}
              </Text>
            </View>

            {/* ── Day Cards ── */}
            {weekDates.map(({ key, date }) => {
              const template = templateByDay[key];
              const isToday = key === todayKey;
              const shiftColor = template ? SHIFT_COLORS[template.shiftType] : COLORS.border;

              // Check if there's a pending time-off request for this day
              const dayISO = fmtDateISO(date);
              const hasPendingTimeOff = requests.some(
                (r: any) =>
                  r.requestType === 'TIME_OFF' &&
                  r.status === 'PENDING' &&
                  fmtDateISO(new Date(r.date)) === dayISO
              );
              const hasApprovedTimeOff = requests.some(
                (r: any) =>
                  r.requestType === 'TIME_OFF' &&
                  r.status === 'APPROVED' &&
                  fmtDateISO(new Date(r.date)) === dayISO
              );

              return (
                <View
                  key={key}
                  style={[
                    s.dayCard,
                    isToday && s.dayCardToday,
                    !template && s.dayCardOff,
                  ]}
                >
                  {/* Day label row */}
                  <View style={s.dayRow}>
                    <View>
                      <Text style={[s.dayName, isToday && s.dayNameToday]}>
                        {DAY_LABELS[key]}
                      </Text>
                      <Text style={s.dayDate}>{fmtMonthDay(date)}</Text>
                    </View>
                    {isToday && (
                      <View style={s.todayBadge}>
                        <Text style={s.todayBadgeText}>Today</Text>
                      </View>
                    )}
                  </View>

                  {template ? (
                    <View style={s.shiftInfo}>
                      {/* Shift badge */}
                      <View style={[s.shiftBadge, { backgroundColor: shiftColor + '18', borderColor: shiftColor + '40' }]}>
                        <Text style={[s.shiftBadgeLabel, { color: shiftColor }]}>
                          {SHIFT_LABELS[template.shiftType]}
                        </Text>
                        <Text style={[s.shiftBadgeTime, { color: shiftColor }]}>
                          {template.startTime} – {template.endTime}
                        </Text>
                      </View>

                      {/* Store */}
                      <Text style={s.storeName}>
                        📍 {template.store?.name || 'Store'}{template.store?.city ? `, ${template.store.city}` : ''}
                      </Text>

                      {/* Request off button / status */}
                      {hasApprovedTimeOff ? (
                        <View style={s.timeOffApproved}>
                          <Text style={s.timeOffApprovedText}>✅ Time Off Approved</Text>
                        </View>
                      ) : hasPendingTimeOff ? (
                        <View style={s.timeOffPending}>
                          <Text style={s.timeOffPendingText}>⏳ Time Off Pending</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={s.requestOffBtn}
                          onPress={() => handleRequestOff(template, date)}
                          activeOpacity={0.8}
                        >
                          <Text style={s.requestOffBtnText}>Request Off</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <View style={s.dayOffInfo}>
                      <Text style={s.dayOffText}>Day off</Text>
                      {(() => {
                        // Only allow fill-in requests for today or future days
                        const isPastDay = date < new Date(new Date().setHours(0, 0, 0, 0));
                        if (isPastDay) return null;
                        // Use any assigned template's store, or fall back to user's first store
                        const primaryTemplate = templates[0];
                        const storeId = primaryTemplate?.storeId || user?.storeIds?.[0];
                        const storeName = primaryTemplate?.store?.name || 'Your Store';
                        if (!storeId) return null;
                        const hasPendingFillIn = requests.some(
                          (r: any) =>
                            r.requestType === 'FILL_IN' &&
                            r.status === 'PENDING' &&
                            fmtDateISO(new Date(r.date)) === dayISO
                        );
                        return hasPendingFillIn ? (
                          <View style={s.fillInPending}>
                            <Text style={s.fillInPendingText}>⏳ Fill-In Requested</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={s.fillInBtn}
                            onPress={() => handleFillIn(storeId, storeName, 'OPENING', date)}
                            activeOpacity={0.8}
                          >
                            <Text style={s.fillInBtnText}>+ Request Extra Shift</Text>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  )}
                </View>
              );
            })}

            {/* ── Pending Requests ── */}
            {pendingRequests.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Pending Requests</Text>
                {pendingRequests.map((r: any) => (
                  <View key={r.id} style={s.requestCard}>
                    <View style={s.requestRow}>
                      <View style={[s.requestTypeDot, { backgroundColor: r.requestType === 'TIME_OFF' ? '#E63946' : COLORS.success }]} />
                      <Text style={s.requestType}>
                        {r.requestType === 'TIME_OFF' ? 'Time Off' : 'Fill-In'}
                      </Text>
                      <View style={s.pendingTag}>
                        <Text style={s.pendingTagText}>PENDING</Text>
                      </View>
                    </View>
                    <Text style={s.requestDate}>{fmtDateFull(r.date)} · {SHIFT_LABELS[r.shiftType]}</Text>
                    {r.store?.name && <Text style={s.requestStore}>📍 {r.store.name}</Text>}
                    {r.notes && <Text style={s.requestNotes}>"{r.notes}"</Text>}
                  </View>
                ))}
              </>
            )}

            {/* ── Tips ── */}
            <View style={s.infoBox}>
              <Text style={s.infoTitle}>💡 How it works</Text>
              <Text style={s.infoText}>
                On your days off, tap <Text style={{ fontWeight: '700' }}>+ Request Extra Shift</Text> to volunteer for an open shift.
                Your manager and supervisor will be notified to approve or deny.
              </Text>
              <Text style={[s.infoText, { marginTop: 6 }]}>
                On your scheduled days, tap <Text style={{ fontWeight: '700' }}>Request Off</Text> to submit a time-off request.
              </Text>
            </View>

            <View style={{ height: 24 }} />
          </>
        )}
      </ScrollView>

      {/* ── Request Modal (Time Off + Fill-In) ── */}
      <Modal
        visible={!!requestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setRequestModal(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.modal}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitle}>
              {requestModal?.requestType === 'FILL_IN' ? 'Request Extra Shift' : 'Request Time Off'}
            </Text>
            {requestModal && (
              <>
                {/* Fill-in: show shift slots with current staff */}
                {requestModal.requestType === 'FILL_IN' && (
                  <View style={s.fillInShiftPicker}>
                    <Text style={s.fillInPickerLabel}>
                      📅 {fmtMonthDay(requestModal.date)} — Pick a shift to request
                    </Text>
                    {dayRosterLoading ? (
                      <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 12 }} />
                    ) : (
                      (['OPENING', 'MIDDLE', 'CLOSING'] as const).map((st) => {
                        const slot = dayRosterData?.data?.data?.shifts?.[st];
                        const staff: any[] = slot?.employees || [];
                        const isEmpty = staff.length === 0;
                        const isSelected = requestModal.shiftType === st;
                        const color = SHIFT_SLOT_COLORS[st];
                        return (
                          <TouchableOpacity
                            key={st}
                            style={[s.shiftSlot, isSelected && { borderColor: color, backgroundColor: color + '10' }]}
                            onPress={() => setRequestModal({ ...requestModal, shiftType: st })}
                            activeOpacity={0.8}
                          >
                            <View style={s.shiftSlotLeft}>
                              <View style={[s.shiftSlotDot, { backgroundColor: color }]} />
                              <View>
                                <Text style={[s.shiftSlotName, isSelected && { color }]}>{SHIFT_LABELS[st]}</Text>
                                <Text style={s.shiftSlotTime}>{SHIFT_SLOT_TIMES[st]}</Text>
                              </View>
                            </View>
                            <View style={s.shiftSlotRight}>
                              {isEmpty ? (
                                <View style={s.emptyShiftBadge}>
                                  <Text style={s.emptyShiftText}>Empty ⚠️</Text>
                                </View>
                              ) : (
                                <Text style={s.shiftStaffNames} numberOfLines={2}>
                                  {staff.map((e: any) => e.name || e.phone).join(', ')}
                                </Text>
                              )}
                              {isSelected && (
                                <View style={[s.selectedCheck, { backgroundColor: color }]}>
                                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>✓</Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}

                {/* Time-off: show date/shift/store summary */}
                {requestModal.requestType === 'TIME_OFF' && (
                  <View style={s.modalInfo}>
                    <Text style={s.modalInfoText}>
                      📅 {fmtMonthDay(requestModal.date)} ({DAY_SHORT[JS_DAY_TO_ENUM[requestModal.date.getDay()]]})
                    </Text>
                    <Text style={s.modalInfoText}>
                      🕐 {SHIFT_LABELS[requestModal.shiftType]}
                    </Text>
                    <Text style={s.modalInfoText}>
                      📍 {requestModal.storeName}
                    </Text>
                  </View>
                )}
                <Text style={s.modalLabel}>Notes (optional)</Text>
                <TextInput
                  style={s.modalInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={requestModal.requestType === 'FILL_IN' ? 'Any notes for your manager...' : 'Reason for time off...'}
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <View style={s.modalActions}>
                  <TouchableOpacity
                    style={s.submitBtn}
                    onPress={submitRequest}
                    activeOpacity={0.8}
                    disabled={createRequestMutation.isPending}
                  >
                    {createRequestMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.submitBtnText}>Submit Request</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.cancelBtn}
                    onPress={() => setRequestModal(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
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
  root: { flex: 1, backgroundColor: COLORS.background },

  // Header
  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11,
    fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 3 },
  calendarIcon: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Body
  body: { padding: 16, paddingBottom: 32 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },

  // Week header
  weekHeader: { marginBottom: 12 },
  weekLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Day cards
  dayCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  dayCardToday: {
    borderWidth: 2, borderColor: COLORS.primary,
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  dayCardOff: { opacity: 0.7 },

  dayRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  dayName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  dayNameToday: { color: COLORS.primary },
  dayDate: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  todayBadge: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  todayBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Shift info
  shiftInfo: { gap: 8 },
  shiftBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
  },
  shiftBadgeLabel: { fontSize: 13, fontWeight: '800' },
  shiftBadgeTime: { fontSize: 12, fontWeight: '600' },

  storeName: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },

  requestOffBtn: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  requestOffBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },

  timeOffPending: {
    backgroundColor: '#F4A26120', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  timeOffPendingText: { color: '#b07720', fontSize: 12, fontWeight: '700' },

  timeOffApproved: {
    backgroundColor: COLORS.success + '15', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  timeOffApprovedText: { color: COLORS.success, fontSize: 12, fontWeight: '700' },

  // Day off + fill-in
  dayOffInfo: { paddingTop: 2, gap: 8 },
  dayOffText: { color: COLORS.textMuted, fontSize: 14, fontStyle: 'italic' },
  fillInBtn: {
    backgroundColor: COLORS.success + '15',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.success + '40',
  },
  fillInBtnText: { color: COLORS.success, fontSize: 12, fontWeight: '700' },
  fillInPending: {
    backgroundColor: COLORS.success + '12', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  fillInPendingText: { color: COLORS.success, fontSize: 12, fontWeight: '700' },

  // Pending requests
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginTop: 20, marginBottom: 10,
  },
  requestCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    marginBottom: 8, borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  requestTypeDot: { width: 8, height: 8, borderRadius: 4 },
  requestType: { fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1 },
  pendingTag: {
    backgroundColor: '#F4A26120', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  pendingTagText: { fontSize: 10, fontWeight: '800', color: '#b07720' },
  requestDate: { fontSize: 13, color: COLORS.text },
  requestStore: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  requestNotes: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 },

  // Info box
  infoBox: {
    backgroundColor: COLORS.secondary + '0d', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.secondary + '18', marginTop: 20,
  },
  infoTitle: { fontSize: 13, fontWeight: '800', color: COLORS.secondary, marginBottom: 6 },
  infoText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
  fillInRow: { marginTop: 4 },
  fillInText: { fontSize: 12, color: COLORS.textMuted },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 20, fontWeight: '800', color: COLORS.text,
    marginBottom: 16, textAlign: 'center',
  },
  modalInfo: {
    backgroundColor: COLORS.background, borderRadius: 12,
    padding: 14, gap: 6, marginBottom: 16,
  },
  modalInfoText: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  modalLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  modalInput: {
    backgroundColor: COLORS.background, borderRadius: 12,
    padding: 14, fontSize: 15, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
    minHeight: 80, marginBottom: 16,
  },
  // Shift slot picker (fill-in modal)
  fillInShiftPicker: { marginBottom: 14 },
  fillInPickerLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 10 },

  shiftSlot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.background, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: 12, marginBottom: 8,
  },
  shiftSlotLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shiftSlotDot: { width: 10, height: 10, borderRadius: 5 },
  shiftSlotName: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  shiftSlotTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  shiftSlotRight: { alignItems: 'flex-end', gap: 4, flex: 1, paddingLeft: 10 },
  shiftStaffNames: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
  emptyShiftBadge: {
    backgroundColor: '#E6394615', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  emptyShiftText: { fontSize: 11, fontWeight: '700', color: '#E63946' },
  selectedCheck: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  // Legacy picker styles (unused but kept to avoid errors)
  shiftPickerRow: { flexDirection: 'row', gap: 8 },
  shiftPickerBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center',
  },
  shiftPickerBtnActive: {
    backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary,
  },
  shiftPickerText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  shiftPickerTextActive: { color: COLORS.primary },

  modalActions: { gap: 10 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    backgroundColor: COLORS.background, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },
});
