import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Modal, Alert, RefreshControl,
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

const SHIFT_ORDER = ['OPENING', 'MIDDLE', 'CLOSING'];
const SHIFT_LABELS: Record<string, string> = {
  OPENING: 'Opening', MIDDLE: 'Middle', CLOSING: 'Closing',
};
const SHIFT_COLORS: Record<string, string> = {
  OPENING: '#F4A261', MIDDLE: COLORS.success, CLOSING: COLORS.secondary,
};
const SHIFT_TIMES: Record<string, string> = {
  OPENING: '6am–2pm', MIDDLE: '10am–6pm', CLOSING: '2pm–10pm',
};

const JS_DAY_TO_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getTodayKey(): string {
  return JS_DAY_TO_ENUM[new Date().getDay()];
}

function fmtDateFull(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = 'roster' | 'week' | 'requests';

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ManagerScheduleScreen() {
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('roster');
  const [confirmModal, setConfirmModal] = useState<{
    requestId: string; employeeName: string; type: string;
    date: string; shift: string; action: 'APPROVED' | 'DENIED';
  } | null>(null);

  // ── Today's roster ──
  const {
    data: rosterData, isLoading: rosterLoading,
    refetch: refetchRoster, isRefetching: rosterRefetching,
  } = useQuery({
    queryKey: ['manager-roster', storeId],
    queryFn: () => schedulingApi.getTodayRoster(storeId!),
    enabled: !!storeId && tab === 'roster',
    refetchInterval: 5 * 60_000,
  });

  // ── Weekly schedule ──
  const {
    data: weekData, isLoading: weekLoading,
    refetch: refetchWeek, isRefetching: weekRefetching,
  } = useQuery({
    queryKey: ['manager-schedule', storeId],
    queryFn: () => schedulingApi.getStoreSchedule(storeId!),
    enabled: !!storeId && tab === 'week',
  });

  // ── Requests ──
  const {
    data: reqData, isLoading: reqLoading,
    refetch: refetchReqs, isRefetching: reqsRefetching,
  } = useQuery({
    queryKey: ['manager-requests', storeId],
    queryFn: () => schedulingApi.getStoreRequests(storeId!),
    enabled: !!storeId && tab === 'requests',
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'DENIED' }) =>
      schedulingApi.updateRequest(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-requests', storeId] });
      qc.invalidateQueries({ queryKey: ['manager-roster', storeId] });
      setConfirmModal(null);
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update request');
    },
  });

  const roster: any[] = rosterData?.data?.data?.roster || [];
  const todayKey = getTodayKey();

  const grouped: Record<string, any[]> = weekData?.data?.data?.grouped || {};

  const pendingReqs: any[] = reqData?.data?.data?.grouped?.PENDING || [];
  const historyReqs: any[] = [
    ...(reqData?.data?.data?.grouped?.APPROVED || []),
    ...(reqData?.data?.data?.grouped?.DENIED || []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   .slice(0, 20);

  const pendingCount = pendingReqs.length;

  function confirmAction(req: any, action: 'APPROVED' | 'DENIED') {
    setConfirmModal({
      requestId: req.id,
      employeeName: req.employee?.name || req.employee?.phone || 'Employee',
      type: req.requestType,
      date: req.date,
      shift: req.shiftType,
      action,
    });
  }

  const isRefreshing = rosterRefetching || weekRefetching || reqsRefetching;
  function onRefresh() {
    if (tab === 'roster') refetchRoster();
    else if (tab === 'week') refetchWeek();
    else refetchReqs();
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerSub}>⛽ Store Management</Text>
            <Text style={s.headerTitle}>Schedule</Text>
          </View>
          <View style={s.headerIcon}>
            <Text style={{ fontSize: 24 }}>📅</Text>
          </View>
        </View>

        {/* Tab bar */}
        <View style={s.tabs}>
          {(['roster', 'week', 'requests'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'roster' ? "Today's Roster" : t === 'week' ? 'Weekly View' : `Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
            tintColor={COLORS.primary} colors={[COLORS.primary]} />
        }
      >
        {/* ════ TODAY'S ROSTER ════ */}
        {tab === 'roster' && (
          rosterLoading ? <LoadingView /> : (
            <>
              <View style={s.rosterHeader}>
                <Text style={s.rosterDay}>{DAY_LABELS[todayKey]}</Text>
                <Text style={s.rosterDate}>
                  {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>

              {roster.length === 0 ? (
                <EmptyState message="No staff scheduled today" />
              ) : (
                SHIFT_ORDER.map((shift) => {
                  const staffOnShift = roster.filter((r: any) => r.shiftType === shift);
                  if (staffOnShift.length === 0) return null;
                  const color = SHIFT_COLORS[shift];
                  return (
                    <View key={shift} style={s.shiftSection}>
                      <View style={[s.shiftSectionHeader, { borderLeftColor: color }]}>
                        <Text style={[s.shiftSectionLabel, { color }]}>{SHIFT_LABELS[shift]}</Text>
                        <Text style={s.shiftSectionTime}>{SHIFT_TIMES[shift]}</Text>
                      </View>
                      {staffOnShift.map((item: any) => (
                        <View key={item.templateId} style={s.staffCard}>
                          <View style={[s.staffAvatar, { backgroundColor: color + '20' }]}>
                            <Text style={[s.staffAvatarText, { color }]}>
                              {(item.employee?.name || item.employee?.phone || '?')[0].toUpperCase()}
                            </Text>
                          </View>
                          <View style={s.staffInfo}>
                            <Text style={s.staffName}>{item.employee?.name || 'Unnamed'}</Text>
                            <Text style={s.staffPhone}>{item.employee?.phone}</Text>
                          </View>
                          <Text style={s.staffTime}>{item.startTime}–{item.endTime}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </>
          )
        )}

        {/* ════ WEEKLY VIEW ════ */}
        {tab === 'week' && (
          weekLoading ? <LoadingView /> : (
            <>
              <Text style={s.sectionNote}>
                Weekly recurring schedule. Manage staff assignments from the admin dashboard.
              </Text>
              {DAY_ORDER.map((day) => {
                const dayTemplates: any[] = grouped[day] || [];
                const isToday = day === todayKey;
                return (
                  <View key={day} style={[s.weekDayCard, isToday && s.weekDayCardToday]}>
                    <View style={s.weekDayHeader}>
                      <Text style={[s.weekDayName, isToday && s.weekDayNameToday]}>
                        {DAY_LABELS[day]}
                      </Text>
                      {isToday && <View style={s.todayPill}><Text style={s.todayPillText}>Today</Text></View>}
                      <Text style={s.weekDayCount}>
                        {dayTemplates.length} {dayTemplates.length === 1 ? 'person' : 'people'}
                      </Text>
                    </View>

                    {dayTemplates.length === 0 ? (
                      <Text style={s.noStaffText}>No staff scheduled</Text>
                    ) : (
                      SHIFT_ORDER.map((shift) => {
                        const onShift = dayTemplates.filter((t: any) => t.shiftType === shift);
                        if (onShift.length === 0) return null;
                        const color = SHIFT_COLORS[shift];
                        return (
                          <View key={shift} style={s.weekShiftRow}>
                            <View style={[s.weekShiftDot, { backgroundColor: color }]} />
                            <Text style={[s.weekShiftLabel, { color }]}>{SHIFT_LABELS[shift]}</Text>
                            <Text style={s.weekShiftNames}>
                              {onShift.map((t: any) => t.employee?.name || t.employee?.phone || '?').join(', ')}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              })}
            </>
          )
        )}

        {/* ════ REQUESTS ════ */}
        {tab === 'requests' && (
          reqLoading ? <LoadingView /> : (
            <>
              {/* Pending */}
              <Text style={s.reqSectionLabel}>
                Pending {pendingCount > 0 ? `(${pendingCount})` : ''}
              </Text>
              {pendingReqs.length === 0 ? (
                <EmptyState message="No pending requests" />
              ) : (
                pendingReqs.map((req: any) => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    onApprove={() => confirmAction(req, 'APPROVED')}
                    onDeny={() => confirmAction(req, 'DENIED')}
                    showActions
                  />
                ))
              )}

              {/* History */}
              {historyReqs.length > 0 && (
                <>
                  <Text style={[s.reqSectionLabel, { marginTop: 24 }]}>Recent History</Text>
                  {historyReqs.map((req: any) => (
                    <RequestCard key={req.id} req={req} showActions={false} />
                  ))}
                </>
              )}
            </>
          )
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Confirm Modal ── */}
      <Modal
        visible={!!confirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModal(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            {confirmModal && (
              <>
                <Text style={s.modalTitle}>
                  {confirmModal.action === 'APPROVED' ? '✅ Approve Request?' : '❌ Deny Request?'}
                </Text>
                <View style={s.modalInfo}>
                  <Text style={s.modalInfoRow}>👤 {confirmModal.employeeName}</Text>
                  <Text style={s.modalInfoRow}>
                    {confirmModal.type === 'TIME_OFF' ? '🏖️ Time Off' : '🔄 Fill-In'}
                  </Text>
                  <Text style={s.modalInfoRow}>📅 {fmtDateFull(confirmModal.date)}</Text>
                  <Text style={s.modalInfoRow}>🕐 {SHIFT_LABELS[confirmModal.shift]}</Text>
                </View>
                {confirmModal.action === 'APPROVED' && confirmModal.type === 'TIME_OFF' && (
                  <Text style={s.modalNote}>
                    ℹ️ Other scheduled employees will be notified of this open shift.
                  </Text>
                )}
                {confirmModal.action === 'APPROVED' && confirmModal.type === 'FILL_IN' && (
                  <Text style={s.modalNote}>
                    ℹ️ {confirmModal.employeeName} will be added to this shift on the weekly schedule.
                  </Text>
                )}
                <View style={s.modalActions}>
                  <TouchableOpacity
                    style={[s.modalBtn, confirmModal.action === 'APPROVED' ? s.approveBtn : s.denyBtn]}
                    onPress={() => updateMutation.mutate({ id: confirmModal.requestId, status: confirmModal.action })}
                    activeOpacity={0.8}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.modalBtnText}>
                          {confirmModal.action === 'APPROVED' ? 'Yes, Approve' : 'Yes, Deny'}
                        </Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.cancelBtn}
                    onPress={() => setConfirmModal(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <View style={s.loadingWrap}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={s.emptyWrap}>
      <Text style={s.emptyText}>{message}</Text>
    </View>
  );
}

function RequestCard({ req, onApprove, onDeny, showActions }: {
  req: any; onApprove?: () => void; onDeny?: () => void; showActions: boolean;
}) {
  const isTimeOff = req.requestType === 'TIME_OFF';
  const statusColor = req.status === 'APPROVED' ? COLORS.success : req.status === 'DENIED' ? '#E63946' : '#F4A261';
  const typeColor = isTimeOff ? '#E63946' : COLORS.success;

  return (
    <View style={[s.reqCard, { borderLeftColor: typeColor }]}>
      <View style={s.reqCardTop}>
        <View>
          <Text style={s.reqEmpName}>{req.employee?.name || req.employee?.phone || 'Employee'}</Text>
          <Text style={s.reqPhone}>{req.employee?.phone}</Text>
        </View>
        <View style={[s.reqTypeBadge, { backgroundColor: typeColor + '15' }]}>
          <Text style={[s.reqTypeText, { color: typeColor }]}>
            {isTimeOff ? 'Time Off' : 'Fill-In'}
          </Text>
        </View>
      </View>
      <View style={s.reqDetail}>
        <Text style={s.reqDateText}>
          📅 {new Date(req.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </Text>
        <Text style={s.reqShiftText}>🕐 {SHIFT_LABELS[req.shiftType]}</Text>
      </View>
      {req.notes ? <Text style={s.reqNotes}>"{req.notes}"</Text> : null}

      {showActions ? (
        <View style={s.reqActions}>
          <TouchableOpacity style={s.approveSmallBtn} onPress={onApprove} activeOpacity={0.8}>
            <Text style={s.approveSmallText}>✓ Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.denySmallBtn} onPress={onDeny} activeOpacity={0.8}>
            <Text style={s.denySmallText}>✕ Deny</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[s.statusChip, { backgroundColor: statusColor + '15' }]}>
          <Text style={[s.statusChipText, { color: statusColor }]}>{req.status}</Text>
        </View>
      )}
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
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11,
    fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 3 },
  headerIcon: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Tabs
  tabs: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  tab: {
    flex: 1, paddingVertical: 7, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)' },
  tabTextActive: { color: COLORS.secondary },

  // Body
  body: { padding: 16, paddingBottom: 32 },
  loadingWrap: { alignItems: 'center', paddingVertical: 80 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: COLORS.textMuted, fontSize: 15, fontStyle: 'italic' },

  // Roster
  rosterHeader: { marginBottom: 16 },
  rosterDay: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  rosterDate: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  shiftSection: { marginBottom: 16 },
  shiftSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 4, paddingLeft: 10, marginBottom: 8,
  },
  shiftSectionLabel: { fontSize: 14, fontWeight: '800' },
  shiftSectionTime: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },

  staffCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  staffAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  staffAvatarText: { fontSize: 16, fontWeight: '800' },
  staffInfo: { flex: 1 },
  staffName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  staffPhone: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  staffTime: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },

  // Weekly view
  sectionNote: {
    fontSize: 12, color: COLORS.textMuted, marginBottom: 14,
    textAlign: 'center', fontStyle: 'italic',
  },
  weekDayCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  weekDayCardToday: { borderWidth: 2, borderColor: COLORS.primary },
  weekDayHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8,
  },
  weekDayName: { fontSize: 15, fontWeight: '800', color: COLORS.text, flex: 1 },
  weekDayNameToday: { color: COLORS.primary },
  weekDayCount: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  todayPill: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  todayPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  noStaffText: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', paddingLeft: 4 },

  weekShiftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5,
  },
  weekShiftDot: { width: 8, height: 8, borderRadius: 4 },
  weekShiftLabel: { fontSize: 12, fontWeight: '800', width: 60 },
  weekShiftNames: { fontSize: 12, color: COLORS.text, flex: 1 },

  // Requests
  reqSectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10,
  },
  reqCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    marginBottom: 10, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  reqCardTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 8,
  },
  reqEmpName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  reqPhone: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  reqTypeBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  reqTypeText: { fontSize: 11, fontWeight: '800' },
  reqDetail: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  reqDateText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  reqShiftText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  reqNotes: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 8 },

  reqActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  approveSmallBtn: {
    flex: 1, backgroundColor: COLORS.success + '15',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.success + '40',
  },
  approveSmallText: { color: COLORS.success, fontSize: 13, fontWeight: '800' },
  denySmallBtn: {
    flex: 1, backgroundColor: '#E6394615',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#E6394640',
  },
  denySmallText: { color: '#E63946', fontSize: 13, fontWeight: '800' },

  statusChip: {
    alignSelf: 'flex-start', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 6,
  },
  statusChipText: { fontSize: 11, fontWeight: '800' },

  // Confirm modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modal: {
    backgroundColor: COLORS.white, borderRadius: 20,
    padding: 24, width: '100%',
  },
  modalTitle: {
    fontSize: 18, fontWeight: '800', color: COLORS.text,
    textAlign: 'center', marginBottom: 16,
  },
  modalInfo: {
    backgroundColor: COLORS.background, borderRadius: 12,
    padding: 14, gap: 6, marginBottom: 12,
  },
  modalInfoRow: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  modalNote: {
    fontSize: 13, color: COLORS.textMuted,
    textAlign: 'center', marginBottom: 16, lineHeight: 20,
  },
  modalActions: { gap: 10 },
  modalBtn: {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  approveBtn: { backgroundColor: COLORS.success },
  denyBtn: { backgroundColor: '#E63946' },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
});
