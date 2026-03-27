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
const DAY_LETTER: Record<string, string> = {
  MON: 'M', TUE: 'T', WED: 'W', THU: 'T', FRI: 'F', SAT: 'S', SUN: 'S',
};

const SHIFT_ORDER = ['OPENING', 'MIDDLE', 'CLOSING'];
const SHIFT_LABELS: Record<string, string> = { OPENING: 'Opening', MIDDLE: 'Middle', CLOSING: 'Closing' };
const SHIFT_COLORS: Record<string, string> = { OPENING: '#F4A261', MIDDLE: '#2DC653', CLOSING: '#1D3557' };
const SHIFT_TIMES: Record<string, string> = { OPENING: '6am–2pm', MIDDLE: '10am–6pm', CLOSING: '2pm–10pm' };

const AVATAR_COLORS = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', '#1D3557', '#E63946'];

const JS_DAY_TO_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getTodayKey(): string { return JS_DAY_TO_ENUM[new Date().getDay()]; }

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

function fmtDateFull(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type Tab = 'roster' | 'week' | 'requests';

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ManagerScheduleScreen() {
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const qc = useQueryClient();
  const todayKey = getTodayKey();
  const weekDates = getCurrentWeekDates();

  const [tab, setTab] = useState<Tab>('roster');
  const [selectedWeekDay, setSelectedWeekDay] = useState(todayKey);
  const [confirmModal, setConfirmModal] = useState<{
    requestId: string; employeeName: string; type: string;
    date: string; shift: string; action: 'APPROVED' | 'DENIED';
  } | null>(null);

  const {
    data: rosterData, isLoading: rosterLoading,
    refetch: refetchRoster, isRefetching: rosterRefetching,
  } = useQuery({
    queryKey: ['manager-roster', storeId],
    queryFn: () => schedulingApi.getTodayRoster(storeId!),
    enabled: !!storeId && tab === 'roster',
    refetchInterval: 5 * 60_000,
  });

  const {
    data: weekData, isLoading: weekLoading,
    refetch: refetchWeek, isRefetching: weekRefetching,
  } = useQuery({
    queryKey: ['manager-schedule', storeId],
    queryFn: () => schedulingApi.getStoreSchedule(storeId!),
    enabled: !!storeId && tab === 'week',
  });

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
  const grouped: Record<string, any[]> = weekData?.data?.data?.grouped || {};
  const pendingReqs: any[] = reqData?.data?.data?.grouped?.PENDING || [];
  const historyReqs: any[] = [
    ...(reqData?.data?.data?.grouped?.APPROVED || []),
    ...(reqData?.data?.data?.grouped?.DENIED || []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
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

  // Week tab: selected day data
  const selectedDayTemplates: any[] = grouped[selectedWeekDay] || [];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>🏪 STORE MANAGER</Text>
            <Text style={s.headerTitle}>Schedule</Text>
          </View>
          {pendingCount > 0 && (
            <TouchableOpacity style={s.pendingBadge} onPress={() => setTab('requests')} activeOpacity={0.8}>
              <Text style={s.pendingBadgeNum}>{pendingCount}</Text>
              <Text style={s.pendingBadgeLbl}>pending</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab bar */}
        <View style={s.tabBar}>
          {(['roster', 'week', 'requests'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'roster' ? "Today's Roster"
                  : t === 'week' ? 'Weekly'
                  : `Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
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
              <View style={s.rosterHeading}>
                <Text style={s.rosterDay}>
                  {DAY_LABELS[getTodayKey()]}
                </Text>
                <Text style={s.rosterDate}>
                  {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>

              {roster.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyEmoji}>📭</Text>
                  <Text style={s.emptyTitle}>No staff scheduled today</Text>
                  <Text style={s.emptySub}>Go to the admin panel to manage the weekly schedule</Text>
                </View>
              ) : (
                SHIFT_ORDER.map((shift) => {
                  const staffOnShift = roster.filter((r: any) => r.shiftType === shift);
                  if (staffOnShift.length === 0) return null;
                  const color = SHIFT_COLORS[shift];
                  return (
                    <View key={shift} style={s.shiftSection}>
                      {/* Shift header */}
                      <View style={[s.shiftHeader, { borderLeftColor: color }]}>
                        <View style={[s.shiftHeaderDot, { backgroundColor: color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.shiftHeaderLabel, { color }]}>{SHIFT_LABELS[shift]}</Text>
                          <Text style={s.shiftHeaderTime}>{SHIFT_TIMES[shift]}</Text>
                        </View>
                        <View style={[s.shiftCountBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                          <Text style={[s.shiftCountText, { color }]}>{staffOnShift.length}</Text>
                        </View>
                      </View>
                      {/* Staff cards */}
                      {staffOnShift.map((item: any, idx: number) => {
                        const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                        const name = item.employee?.name || item.employee?.phone || '?';
                        return (
                          <View key={item.templateId} style={s.staffCard}>
                            <View style={[s.staffAvatar, { backgroundColor: avatarColor }]}>
                              <Text style={s.staffAvatarText}>{name[0].toUpperCase()}</Text>
                            </View>
                            <View style={s.staffInfo}>
                              <Text style={s.staffName}>{name}</Text>
                              <Text style={s.staffPhone}>{item.employee?.phone}</Text>
                            </View>
                            <View style={[s.staffTimePill, { backgroundColor: color + '12' }]}>
                              <Text style={[s.staffTimeText, { color }]}>{item.startTime}–{item.endTime}</Text>
                            </View>
                          </View>
                        );
                      })}
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
              {/* Day selector strip */}
              <View style={s.weekStrip}>
                {weekDates.map(({ key, date }) => {
                  const isSelected = key === selectedWeekDay;
                  const isToday = key === todayKey;
                  const count = (grouped[key] || []).length;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.weekStripCell, isSelected && s.weekStripCellActive]}
                      onPress={() => setSelectedWeekDay(key)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.weekStripLetter, isSelected && s.weekStripLetterActive, isToday && !isSelected && s.weekStripLetterToday]}>
                        {DAY_LETTER[key]}
                      </Text>
                      <Text style={[s.weekStripDate, isSelected && s.weekStripDateActive]}>
                        {date.getDate()}
                      </Text>
                      {count > 0 ? (
                        <View style={[s.weekStripDot, isSelected && s.weekStripDotActive]} />
                      ) : (
                        <View style={s.weekStripDotEmpty} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selected day detail */}
              <View style={s.weekDayCard}>
                <View style={s.weekDayCardHeader}>
                  <Text style={s.weekDayName}>{DAY_LABELS[selectedWeekDay]}</Text>
                  {selectedWeekDay === todayKey && <View style={s.todayPill}><Text style={s.todayPillText}>Today</Text></View>}
                  <Text style={s.weekDayCount}>{selectedDayTemplates.length} {selectedDayTemplates.length === 1 ? 'person' : 'people'}</Text>
                </View>

                {selectedDayTemplates.length === 0 ? (
                  <View style={s.dayEmptyWrap}>
                    <Text style={s.dayEmptyText}>No staff scheduled</Text>
                  </View>
                ) : (
                  SHIFT_ORDER.map((shift) => {
                    const onShift = selectedDayTemplates.filter((t: any) => t.shiftType === shift);
                    if (onShift.length === 0) return null;
                    const color = SHIFT_COLORS[shift];
                    return (
                      <View key={shift} style={s.weekShiftRow}>
                        <View style={[s.weekShiftIcon, { backgroundColor: color + '18' }]}>
                          <View style={[s.weekShiftDot, { backgroundColor: color }]} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.weekShiftLabel, { color }]}>{SHIFT_LABELS[shift]}</Text>
                          <Text style={s.weekShiftNames}>
                            {onShift.map((t: any) => t.employee?.name || t.employee?.phone || '?').join(', ')}
                          </Text>
                        </View>
                        <Text style={s.weekShiftTime}>{SHIFT_TIMES[shift]}</Text>
                      </View>
                    );
                  })
                )}
              </View>

              {/* All days overview */}
              <Text style={s.sectionLabel}>Full Week Overview</Text>
              {DAY_ORDER.map((day) => {
                const dayTemplates: any[] = grouped[day] || [];
                const isToday = day === todayKey;
                return (
                  <TouchableOpacity
                    key={day}
                    style={[s.overviewRow, isToday && s.overviewRowToday]}
                    onPress={() => setSelectedWeekDay(day)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.overviewDay, isToday && s.overviewDayToday]}>{DAY_SHORT[day]}</Text>
                    <View style={s.overviewShifts}>
                      {dayTemplates.length === 0 ? (
                        <Text style={s.overviewEmpty}>—</Text>
                      ) : (
                        SHIFT_ORDER.map((shift) => {
                          const onShift = dayTemplates.filter((t: any) => t.shiftType === shift);
                          if (onShift.length === 0) return null;
                          const color = SHIFT_COLORS[shift];
                          return (
                            <View key={shift} style={[s.overviewShiftPill, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                              <Text style={[s.overviewShiftText, { color }]}>{SHIFT_LABELS[shift][0]} · {onShift.length}</Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                    <Text style={s.overviewCount}>{dayTemplates.length}</Text>
                  </TouchableOpacity>
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
              <View style={s.reqSectionRow}>
                <Text style={s.sectionLabel}>Pending</Text>
                {pendingCount > 0 && (
                  <View style={s.pendingCountBadge}><Text style={s.pendingCountBadgeText}>{pendingCount}</Text></View>
                )}
              </View>
              {pendingReqs.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyEmoji}>✅</Text>
                  <Text style={s.emptyTitle}>All clear!</Text>
                  <Text style={s.emptySub}>No pending requests from your team</Text>
                </View>
              ) : (
                pendingReqs.map((req: any, idx: number) => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    avatarColor={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
                    onApprove={() => confirmAction(req, 'APPROVED')}
                    onDeny={() => confirmAction(req, 'DENIED')}
                    showActions
                  />
                ))
              )}

              {/* History */}
              {historyReqs.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { marginTop: 28 }]}>Recent History</Text>
                  {historyReqs.map((req: any, idx: number) => (
                    <RequestCard
                      key={req.id}
                      req={req}
                      avatarColor={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
                      showActions={false}
                    />
                  ))}
                </>
              )}
            </>
          )
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Confirm Modal ── */}
      <Modal visible={!!confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            {confirmModal && (
              <>
                <View style={[s.modalIconWrap, { backgroundColor: confirmModal.action === 'APPROVED' ? '#f0fdf4' : '#fff1f2' }]}>
                  <Text style={s.modalIconEmoji}>{confirmModal.action === 'APPROVED' ? '✅' : '❌'}</Text>
                </View>
                <Text style={s.modalTitle}>
                  {confirmModal.action === 'APPROVED' ? 'Approve Request?' : 'Deny Request?'}
                </Text>
                <View style={s.modalPreview}>
                  <Text style={s.modalPreviewRow}>👤 <Text style={{ fontWeight: '700' }}>{confirmModal.employeeName}</Text></Text>
                  <Text style={s.modalPreviewRow}>
                    {confirmModal.type === 'TIME_OFF' ? '🏖️ Time Off' : '🔄 Fill-In'}
                  </Text>
                  <Text style={s.modalPreviewRow}>📅 {fmtDateFull(confirmModal.date)}</Text>
                  <Text style={s.modalPreviewRow}>🕐 {SHIFT_LABELS[confirmModal.shift]}</Text>
                </View>
                {confirmModal.action === 'APPROVED' && (
                  <Text style={s.modalNote}>
                    {confirmModal.type === 'TIME_OFF'
                      ? 'Other scheduled employees will be notified of this open shift.'
                      : `${confirmModal.employeeName} will be added to this shift.`}
                  </Text>
                )}
                <TouchableOpacity
                  style={[s.modalActionBtn, { backgroundColor: confirmModal.action === 'APPROVED' ? '#0f5132' : '#E63946' }]}
                  onPress={() => updateMutation.mutate({ id: confirmModal.requestId, status: confirmModal.action })}
                  activeOpacity={0.8}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.modalActionText}>
                        {confirmModal.action === 'APPROVED' ? 'Yes, Approve' : 'Yes, Deny'}
                      </Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setConfirmModal(null)} activeOpacity={0.8}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
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
    <View style={s.emptyWrap}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

function RequestCard({ req, avatarColor, onApprove, onDeny, showActions }: {
  req: any; avatarColor: string; onApprove?: () => void; onDeny?: () => void; showActions: boolean;
}) {
  const isTimeOff = req.requestType === 'TIME_OFF';
  const typeColor = isTimeOff ? '#E63946' : '#2DC653';
  const statusColor = req.status === 'APPROVED' ? '#2DC653' : req.status === 'DENIED' ? '#E63946' : '#f59e0b';
  const name = req.employee?.name || req.employee?.phone || 'Employee';

  return (
    <View style={[s.reqCard, { borderLeftColor: typeColor }]}>
      <View style={s.reqCardTop}>
        <View style={[s.reqAvatar, { backgroundColor: avatarColor }]}>
          <Text style={s.reqAvatarText}>{name[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.reqName}>{name}</Text>
          <Text style={s.reqPhone}>{req.employee?.phone}</Text>
        </View>
        <View style={[s.reqTypeBadge, { backgroundColor: typeColor + '18' }]}>
          <Text style={[s.reqTypeText, { color: typeColor }]}>
            {isTimeOff ? '🏖️ Time Off' : '🙋 Fill-In'}
          </Text>
        </View>
      </View>
      <View style={s.reqDetail}>
        <Text style={s.reqDetailText}>📅 {new Date(req.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
        <Text style={s.reqDetailText}>🕐 {SHIFT_LABELS[req.shiftType]}</Text>
      </View>
      {req.notes ? <Text style={s.reqNotes}>"{req.notes}"</Text> : null}

      {showActions ? (
        <View style={s.reqActions}>
          <TouchableOpacity style={s.approveBtn} onPress={onApprove} activeOpacity={0.8}>
            <Text style={s.approveBtnText}>✓  Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.denyBtn} onPress={onDeny} activeOpacity={0.8}>
            <Text style={s.denyBtnText}>✕  Deny</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[s.statusChip, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusChipText, { color: statusColor }]}>{req.status}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  headerBg: { backgroundColor: '#0f5132' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 12,
  },
  headerEyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  pendingBadge: {
    backgroundColor: '#E63946', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 14, alignItems: 'center',
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 4,
  },
  pendingBadgeNum: { color: '#fff', fontSize: 17, fontWeight: '900' },
  pendingBadgeLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700' },

  // Tab bar
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  tabTextActive: { color: '#0f5132' },

  // Body
  body: { padding: 16, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  reqSectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  pendingCountBadge: { backgroundColor: '#E63946', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  pendingCountBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyEmoji: { fontSize: 44, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', paddingHorizontal: 20 },

  // Roster
  rosterHeading: { marginBottom: 20 },
  rosterDay: { fontSize: 24, fontWeight: '800', color: '#111827' },
  rosterDate: { fontSize: 13, color: '#6b7280', marginTop: 3 },

  shiftSection: { marginBottom: 20 },
  shiftHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 4, paddingLeft: 12, marginBottom: 10,
  },
  shiftHeaderDot: { width: 10, height: 10, borderRadius: 5 },
  shiftHeaderLabel: { fontSize: 15, fontWeight: '800' },
  shiftHeaderTime: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  shiftCountBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  shiftCountText: { fontSize: 12, fontWeight: '800' },

  staffCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  staffAvatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  staffAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  staffInfo: { flex: 1 },
  staffName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  staffPhone: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  staffTimePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  staffTimeText: { fontSize: 12, fontWeight: '700' },

  // Weekly view
  weekStrip: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    padding: 12, gap: 4, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  weekStripCell: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, gap: 4 },
  weekStripCellActive: { backgroundColor: '#0f5132' },
  weekStripLetter: { fontSize: 9, fontWeight: '800', color: '#9ca3af' },
  weekStripLetterActive: { color: 'rgba(255,255,255,0.7)' },
  weekStripLetterToday: { color: '#0f5132' },
  weekStripDate: { fontSize: 15, fontWeight: '700', color: '#374151' },
  weekStripDateActive: { color: '#fff' },
  weekStripDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9ca3af' },
  weekStripDotActive: { backgroundColor: 'rgba(255,255,255,0.6)' },
  weekStripDotEmpty: { width: 5, height: 5 },

  weekDayCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: '#f0f1f2',
    gap: 10,
  },
  weekDayCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  weekDayName: { fontSize: 17, fontWeight: '800', color: '#111827', flex: 1 },
  todayPill: { backgroundColor: '#0f5132', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  todayPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  weekDayCount: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  dayEmptyWrap: { alignItems: 'center', paddingVertical: 12 },
  dayEmptyText: { fontSize: 13, color: '#d1d5db', fontStyle: 'italic' },
  weekShiftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 10,
  },
  weekShiftIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  weekShiftDot: { width: 8, height: 8, borderRadius: 4 },
  weekShiftLabel: { fontSize: 12, fontWeight: '800' },
  weekShiftNames: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  weekShiftTime: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },

  overviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  overviewRowToday: { borderColor: '#0f5132', borderWidth: 1.5 },
  overviewDay: { fontSize: 13, fontWeight: '800', color: '#6b7280', width: 32 },
  overviewDayToday: { color: '#0f5132' },
  overviewShifts: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  overviewEmpty: { fontSize: 13, color: '#d1d5db' },
  overviewShiftPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  overviewShiftText: { fontSize: 11, fontWeight: '700' },
  overviewCount: { fontSize: 13, fontWeight: '700', color: '#9ca3af', width: 20, textAlign: 'right' },

  // Requests
  reqCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderLeftWidth: 4, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  reqCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqAvatar: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  reqAvatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  reqName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reqPhone: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  reqTypeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  reqTypeText: { fontSize: 12, fontWeight: '700' },
  reqDetail: { flexDirection: 'row', gap: 16 },
  reqDetailText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  reqNotes: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  reqActions: { flexDirection: 'row', gap: 10 },
  approveBtn: {
    flex: 1, backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  approveBtnText: { color: '#16a34a', fontSize: 13, fontWeight: '800' },
  denyBtn: {
    flex: 1, backgroundColor: '#fff1f2', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#fecaca',
  },
  denyBtnText: { color: '#E63946', fontSize: 13, fontWeight: '800' },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusChipText: { fontSize: 11, fontWeight: '800' },

  // Confirm modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', gap: 12 },
  modalIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  modalIconEmoji: { fontSize: 28 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  modalPreview: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
    alignSelf: 'stretch', gap: 6, borderWidth: 1, borderColor: '#e5e7eb',
  },
  modalPreviewRow: { fontSize: 14, color: '#374151', fontWeight: '600' },
  modalNote: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  modalActionBtn: {
    alignSelf: 'stretch', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  modalActionText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalCancelBtn: {
    alignSelf: 'stretch', borderRadius: 14, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  modalCancelText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
});
