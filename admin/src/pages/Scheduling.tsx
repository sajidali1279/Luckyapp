import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { schedulingApi, storesApi } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', '#1D3557', '#E63946', '#0891b2', '#be185d'];

const STORE_GRADIENTS = [
  ['#1D3557', '#457B9D'],
  ['#0369a1', '#0ea5e9'],
  ['#166534', '#2DC653'],
  ['#7c3aed', '#a78bfa'],
  ['#b45309', '#f59e0b'],
  ['#be123c', '#f43f5e'],
  ['#0f766e', '#14b8a6'],
  ['#1e40af', '#3b82f6'],
];

const DAYS: { key: string; label: string }[] = [
  { key: 'MON', label: 'Monday' },
  { key: 'TUE', label: 'Tuesday' },
  { key: 'WED', label: 'Wednesday' },
  { key: 'THU', label: 'Thursday' },
  { key: 'FRI', label: 'Friday' },
  { key: 'SAT', label: 'Saturday' },
  { key: 'SUN', label: 'Sunday' },
];

const ALL_SHIFTS: { key: string; label: string; time: string; color: string }[] = [
  { key: 'OPENING', label: 'Opening', time: '06:00–14:00', color: '#F4A261' },
  { key: 'MIDDLE',  label: 'Middle',  time: '10:00–18:00', color: '#2DC653' },
  { key: 'CLOSING', label: 'Closing', time: '14:00–22:00', color: '#1D3557' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Scheduling() {
  const qc = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ day: string; shiftType: string } | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [activeTab, setActiveTab] = useState<'schedule' | 'requests'>('schedule');

  // ── Queries ──
  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['schedule', selectedStoreId],
    queryFn: () => schedulingApi.getStoreSchedule(selectedStoreId!),
    enabled: !!selectedStoreId,
  });

  const { data: rosterData } = useQuery({
    queryKey: ['roster', selectedStoreId],
    queryFn: () => schedulingApi.getTodayRoster(selectedStoreId!),
    enabled: !!selectedStoreId,
  });

  const { data: requestsData } = useQuery({
    queryKey: ['schedule-requests', selectedStoreId],
    queryFn: () => schedulingApi.getStoreRequests(selectedStoreId!),
    enabled: !!selectedStoreId,
  });

  const { data: employeesData } = useQuery({
    queryKey: ['store-employees', selectedStoreId],
    queryFn: () => schedulingApi.getStoreEmployees(selectedStoreId!),
    enabled: !!selectedStoreId,
  });

  const { data: vacanciesData } = useQuery({
    queryKey: ['schedule-vacancies'],
    queryFn: () => schedulingApi.getVacancies(),
    refetchInterval: 60000,
  });

  // ── Mutations ──
  const assignMutation = useMutation({
    mutationFn: (data: object) => schedulingApi.assignShift(data),
    onSuccess: () => {
      toast.success('Shift assigned');
      qc.invalidateQueries({ queryKey: ['schedule', selectedStoreId] });
      qc.invalidateQueries({ queryKey: ['roster', selectedStoreId] });
      setAddModal(null);
      setSelectedEmployeeId('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to assign shift'),
  });

  const removeMutation = useMutation({
    mutationFn: (shiftId: string) => schedulingApi.removeShift(shiftId),
    onSuccess: () => {
      toast.success('Shift removed');
      qc.invalidateQueries({ queryKey: ['schedule', selectedStoreId] });
      qc.invalidateQueries({ queryKey: ['roster', selectedStoreId] });
    },
    onError: () => toast.error('Failed to remove shift'),
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: string }) =>
      schedulingApi.updateRequest(requestId, status),
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'APPROVED' ? 'Request approved' : 'Request denied');
      qc.invalidateQueries({ queryKey: ['schedule-requests', selectedStoreId] });
      qc.invalidateQueries({ queryKey: ['roster', selectedStoreId] });
    },
    onError: () => toast.error('Failed to update request'),
  });

  // ── Data ──
  const stores: any[] = storesData?.data?.data || [];
  const grouped: Record<string, any[]> = scheduleData?.data?.data?.grouped || {};
  const roster: any[] = rosterData?.data?.data?.roster || [];
  const todayDay: string = rosterData?.data?.data?.day || '';
  const requests: any[] = requestsData?.data?.data?.requests || [];
  const pendingRequests = requests.filter((r: any) => r.status === 'PENDING');
  const allEmployees: any[] = employeesData?.data?.data || [];
  const vacancyStores: any[] = vacanciesData?.data?.data?.stores || [];
  const totalVacancies: number = vacanciesData?.data?.data?.totalVacancies || 0;
  const vacancyByStoreId: Record<string, number> = Object.fromEntries(vacancyStores.map((v: any) => [v.storeId, v.vacantCount]));
  const selectedStoreVacancies = vacancyStores.find((v: any) => v.storeId === selectedStoreId);

  const selectedStore = stores.find((s: any) => s.id === selectedStoreId);
  const SHIFTS = selectedStore?.shiftsPerDay === 2
    ? ALL_SHIFTS.filter((sh) => sh.key !== 'MIDDLE')
    : ALL_SHIFTS;

  // ── Shift count toggle ──
  const shiftToggleMutation = useMutation({
    mutationFn: (n: 2 | 3) => storesApi.update(selectedStoreId!, { shiftsPerDay: n }),
    onSuccess: (_data, n) => {
      // Immediately update the cache so the grid reacts without waiting for a refetch
      qc.setQueryData(['stores'], (old: any) => {
        if (!old?.data?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            data: old.data.data.map((st: any) =>
              st.id === selectedStoreId ? { ...st, shiftsPerDay: n } : st
            ),
          },
        };
      });
      toast.success(`Switched to ${n}-shift mode`);
      qc.invalidateQueries({ queryKey: ['schedule-vacancies'] });
    },
    onError: () => toast.error('Failed to update shift mode'),
  });

  function handleAddShift() {
    if (!addModal || !selectedEmployeeId || !selectedStoreId) return;
    assignMutation.mutate({
      employeeId: selectedEmployeeId,
      storeId: selectedStoreId,
      dayOfWeek: addModal.day,
      shiftType: addModal.shiftType,
    });
  }

  // Employees NOT already assigned to ANY shift that day (backend enforces one shift/day/store)
  function getAvailableEmployees(day: string): any[] {
    const assignedThatDay = (grouped[day] || []).map((t: any) => t.employee.id);
    return allEmployees.filter((e: any) => !assignedThatDay.includes(e.id));
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const storeIdx = stores.findIndex((st: any) => st.id === selectedStoreId);
  const gradient = STORE_GRADIENTS[storeIdx % STORE_GRADIENTS.length] || STORE_GRADIENTS[0];

  return (
    <div style={s.page}>
      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        <div style={s.sidebarTop}>
          <div style={s.sidebarTitle}>Scheduling</div>
          <div style={s.sidebarSubtitle}>{stores.length} store{stores.length !== 1 ? 's' : ''}</div>
        </div>
        {totalVacancies > 0 && (
          <div style={s.vacSummary}>
            <span style={s.vacSummaryDot} />
            {totalVacancies} open shift{totalVacancies !== 1 ? 's' : ''} across stores
          </div>
        )}
        <div style={s.storeList}>
          {storesLoading ? (
            <div style={s.loadingText}>Loading...</div>
          ) : (
            stores.map((store: any, i: number) => {
              const active = selectedStoreId === store.id;
              const g = STORE_GRADIENTS[i % STORE_GRADIENTS.length];
              const vac = vacancyByStoreId[store.id] || 0;
              return (
                <button
                  key={store.id}
                  style={{ ...s.storeBtn, ...(active ? s.storeBtnActive : {}) }}
                  onClick={() => { setSelectedStoreId(store.id); setActiveTab('schedule'); }}
                >
                  <div style={{ ...s.storeAvatar, background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}>
                    {(store.name || '?')[0].toUpperCase()}
                  </div>
                  <div style={s.storeBtnInfo}>
                    <div style={{ ...s.storeBtnName, color: active ? '#1D3557' : '#212529' }}>{store.name}</div>
                    <div style={s.storeBtnCity}>{store.city}</div>
                  </div>
                  {vac > 0 && <span style={s.vacBadge}>{vac}</span>}
                  {active && <div style={s.activeIndicator} />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Panel ── */}
      <div style={s.chatPanel}>
        {!selectedStoreId ? (
          <div style={s.emptyState}>
            <div style={s.emptyEmoji}>📅</div>
            <div style={s.emptyTitle}>Select a Store</div>
            <div style={s.emptyDesc}>Choose a store from the sidebar to manage its schedule.</div>
          </div>
        ) : (
          <>
            {/* Gradient Header */}
            <div style={{ ...s.chatHeader, background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
              <div style={s.chatHeaderAvatar}>{(selectedStore?.name || '?')[0].toUpperCase()}</div>
              <div style={s.chatHeaderInfo}>
                <div style={s.chatHeaderName}>{selectedStore?.name}</div>
                <div style={s.chatHeaderSub}>
                  <span style={s.onlineDot} />
                  {selectedStore?.city}, {selectedStore?.state}
                </div>
              </div>
              {/* Shift toggle */}
              <div style={s.shiftToggle}>
                <button
                  style={{ ...s.shiftToggleBtn, ...(selectedStore?.shiftsPerDay !== 2 ? s.shiftToggleBtnActive : {}) }}
                  onClick={() => shiftToggleMutation.mutate(3)}
                  disabled={shiftToggleMutation.isPending}
                >3 shifts</button>
                <button
                  style={{ ...s.shiftToggleBtn, ...(selectedStore?.shiftsPerDay === 2 ? s.shiftToggleBtnActive : {}) }}
                  onClick={() => shiftToggleMutation.mutate(2)}
                  disabled={shiftToggleMutation.isPending}
                >2 shifts</button>
              </div>
              {/* Tabs */}
              <div style={s.tabRow}>
                <button style={{ ...s.tab, ...(activeTab === 'schedule' ? s.tabActive : {}) }} onClick={() => setActiveTab('schedule')}>
                  📅 Schedule
                </button>
                <button style={{ ...s.tab, ...(activeTab === 'requests' ? s.tabActive : {}), position: 'relative' as const }} onClick={() => setActiveTab('requests')}>
                  🙋 Requests
                  {pendingRequests.length > 0 && <span style={s.badge}>{pendingRequests.length}</span>}
                </button>
              </div>
            </div>

            {/* Vacancy Banner */}
            {selectedStoreVacancies && selectedStoreVacancies.vacantCount > 0 && (
              <div style={s.vacancyBanner}>
                <span style={s.vacancyBannerIcon}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <strong>{selectedStoreVacancies.vacantCount} open shift{selectedStoreVacancies.vacantCount !== 1 ? 's' : ''}</strong> —{' '}
                  {selectedStoreVacancies.vacancies.slice(0, 4).map((v: any) => `${v.dayOfWeek} ${v.shiftType.toLowerCase()}`).join(', ')}
                  {selectedStoreVacancies.vacancies.length > 4 ? ` +${selectedStoreVacancies.vacancies.length - 4} more` : ''}
                </div>
              </div>
            )}

            {activeTab === 'schedule' && (
              <>
                {/* Today's Roster */}
                <div style={s.section}>
                  <h2 style={s.sectionTitle}>Today's Roster {todayDay ? `(${todayDay})` : ''}</h2>
                  {roster.length === 0 ? (
                    <div style={s.emptyCard}>No staff scheduled for today.</div>
                  ) : (
                    <div style={s.rosterGrid}>
                      {roster.map((r: any, i: number) => {
                        const shift = SHIFTS.find((sh) => sh.key === r.shiftType);
                        const avatarColor = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                        const name = r.employee.name || r.employee.phone || '?';
                        return (
                          <div key={r.templateId} style={{ ...s.rosterCard, borderTopColor: shift?.color || '#ccc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                              <div style={{ ...s.rosterAvatar, background: avatarColor }}>
                                {name[0].toUpperCase()}
                              </div>
                              <div style={s.rosterName}>{name}</div>
                            </div>
                            <div style={{ ...s.rosterShiftTag, backgroundColor: (shift?.color || '#ccc') + '18', color: shift?.color || '#666', borderColor: (shift?.color || '#ccc') + '40' }}>
                              {shift?.label}
                            </div>
                            <div style={s.rosterTime}>{r.startTime} – {r.endTime}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Weekly Grid */}
                <div style={s.section}>
                  <h2 style={s.sectionTitle}>Weekly Template</h2>
                  {scheduleLoading ? (
                    <div style={s.loadingText}>Loading schedule...</div>
                  ) : (
                    <div style={s.gridWrapper}>
                      <table style={s.grid}>
                        <thead>
                          <tr>
                            <th style={s.gridHeaderCell}>Shift</th>
                            {DAYS.map((d) => (
                              <th key={d.key} style={{ ...s.gridHeaderCell, ...(d.key === todayDay ? s.todayCol : {}) }}>
                                {d.label.slice(0, 3)}
                                {d.key === todayDay && <span style={s.todayBadge}>Today</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {SHIFTS.map((shift) => (
                            <tr key={shift.key}>
                              <td style={s.shiftLabelCell}>
                                <div style={{ ...s.shiftLabel, borderLeftColor: shift.color }}>
                                  <div style={s.shiftLabelName}>{shift.label}</div>
                                  <div style={s.shiftLabelTime}>{shift.time}</div>
                                </div>
                              </td>
                              {DAYS.map((day) => {
                                const assignedHere = (grouped[day.key] || []).filter(
                                  (t: any) => t.shiftType === shift.key
                                );
                                const available = getAvailableEmployees(day.key);
                                const noEmployees = allEmployees.length === 0;
                                return (
                                  <td key={day.key} style={{ ...s.cell, ...(day.key === todayDay ? s.todayCellBg : {}) }}>
                                    <div style={s.cellContent}>
                                      {assignedHere.map((t: any) => (
                                        <div key={t.id} style={{ ...s.chip, borderColor: shift.color + '60' }}>
                                          <span style={s.chipName}>{t.employee.name || t.employee.phone}</span>
                                          <button
                                            style={s.chipRemove}
                                            onClick={() => removeMutation.mutate(t.id)}
                                            title="Remove shift"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                      <button
                                        style={{
                                          ...s.addChipBtn,
                                          ...(available.length === 0 ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
                                        }}
                                        disabled={available.length === 0}
                                        onClick={() => {
                                          setAddModal({ day: day.key, shiftType: shift.key });
                                          setSelectedEmployeeId('');
                                        }}
                                        title={noEmployees ? 'No staff assigned to this store yet — add staff first' : available.length === 0 ? 'All employees already scheduled this day' : 'Add employee to this shift'}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'requests' && (
              <div style={s.section}>
                <h2 style={s.sectionTitle}>Shift Requests</h2>

                {/* Pending */}
                <h3 style={s.subTitle}>Pending ({pendingRequests.length})</h3>
                {pendingRequests.length === 0 ? (
                  <div style={s.emptyCard}>No pending requests.</div>
                ) : (
                  <div style={s.requestList}>
                    {pendingRequests.map((r: any) => (
                      <RequestCard
                        key={r.id}
                        request={r}
                        onApprove={() => updateRequestMutation.mutate({ requestId: r.id, status: 'APPROVED' })}
                        onDeny={() => updateRequestMutation.mutate({ requestId: r.id, status: 'DENIED' })}
                        isPending
                        fmtDate={fmtDate}
                      />
                    ))}
                  </div>
                )}

                {/* Resolved */}
                {requests.filter((r: any) => r.status !== 'PENDING').length > 0 && (
                  <>
                    <h3 style={{ ...s.subTitle, marginTop: 24 }}>
                      Resolved ({requests.filter((r: any) => r.status !== 'PENDING').length})
                    </h3>
                    <div style={s.requestList}>
                      {requests
                        .filter((r: any) => r.status !== 'PENDING')
                        .map((r: any) => (
                          <RequestCard key={r.id} request={r} fmtDate={fmtDate} />
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add Shift Modal ── */}

      {addModal && (
        <div style={s.modalOverlay} onClick={() => setAddModal(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={s.modalTitle}>
              Assign Employee — {DAYS.find((d) => d.key === addModal.day)?.label},{' '}
              {SHIFTS.find((sh) => sh.key === addModal.shiftType)?.label}{' '}
              ({SHIFTS.find((sh) => sh.key === addModal.shiftType)?.time})
            </h3>
            {allEmployees.length === 0 ? (
              <div style={{ padding: '12px 16px', background: '#fff3cd', borderRadius: 8, fontSize: 13, color: '#856404' }}>
                ⚠️ No staff are assigned to this store yet. Go to <strong>Staff</strong> to create employee accounts and assign them to this store first.
              </div>
            ) : getAvailableEmployees(addModal.day).length === 0 ? (
              <div style={{ padding: '12px 16px', background: '#e2e3e5', borderRadius: 8, fontSize: 13, color: '#495057' }}>
                All employees are already scheduled on this day. Each employee can only have one shift per day.
              </div>
            ) : (
              <>
                <label style={s.label}>Select Employee</label>
                <select
                  style={s.select}
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                >
                  <option value="">-- Choose an employee --</option>
                  {getAvailableEmployees(addModal.day).map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || emp.phone}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div style={s.modalActions}>
              <button
                style={s.saveBtn}
                onClick={handleAddShift}
                disabled={!selectedEmployeeId || assignMutation.isPending}
              >
                {assignMutation.isPending ? 'Assigning...' : 'Assign Shift'}
              </button>
              <button style={s.cancelBtn} onClick={() => setAddModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  request, onApprove, onDeny, isPending, fmtDate,
}: {
  request: any;
  onApprove?: () => void;
  onDeny?: () => void;
  isPending?: boolean;
  fmtDate: (d: string) => string;
}) {
  const isTimeOff = request.requestType === 'TIME_OFF';
  const isApproved = request.status === 'APPROVED';
  const typeColor = isTimeOff ? '#E63946' : '#2DC653';
  const statusColor = request.status === 'PENDING' ? '#f59e0b' : isApproved ? '#2DC653' : '#E63946';
  const name = request.employee?.name || request.employee?.phone || 'Employee';
  const avatarColor = AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];

  return (
    <div style={{ ...s.requestCard, borderLeftColor: typeColor, opacity: isPending ? 1 : 0.72 }}>
      <div style={s.requestTop}>
        {/* Avatar + name */}
        <div style={{ ...s.reqAvatar, background: avatarColor }}>{name[0].toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={s.requestEmployee}>{name}</div>
          {request.employee?.phone && request.employee?.name && (
            <div style={s.requestPhone}>{request.employee.phone}</div>
          )}
        </div>
        {/* Type badge */}
        <span style={{ ...s.requestTypeBadge, background: typeColor + '15', color: typeColor }}>
          {isTimeOff ? '🏖️ Time Off' : '🙋 Fill-In'}
        </span>
        {/* Status chip */}
        <span style={{ ...s.statusBadge, background: statusColor + '18', color: statusColor, borderColor: statusColor + '40' }}>
          {request.status}
        </span>
      </div>
      <div style={s.requestDetails}>
        <span>📅 {fmtDate(request.date)}</span>
        <span style={s.dot}>·</span>
        <span>🕐 {request.shiftType}</span>
        {request.notes && (
          <>
            <span style={s.dot}>·</span>
            <span style={s.requestNotes}>"{request.notes}"</span>
          </>
        )}
      </div>
      {isPending && (
        <div style={s.requestActions}>
          <button style={s.approveBtn} onClick={onApprove}>✓  Approve</button>
          <button style={s.denyBtn} onClick={onDeny}>✕  Deny</button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#f0f2f5' },

  // ── Sidebar (Chat style) ──
  sidebar: {
    width: 272, flexShrink: 0, background: '#fff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex', flexDirection: 'column',
  },
  sidebarTop: { padding: '20px 18px 8px' },
  sidebarTitle: { fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: -0.3 },
  sidebarSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  vacSummary: {
    margin: '6px 14px 4px',
    padding: '7px 12px',
    background: '#fffbeb', borderRadius: 10,
    border: '1px solid #fde68a',
    fontSize: 12, color: '#b45309', fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: 7,
  },
  vacSummaryDot: { width: 7, height: 7, borderRadius: 4, background: '#f59e0b', display: 'inline-block', flexShrink: 0 },
  storeList: { flex: 1, overflowY: 'auto', padding: '4px 8px 12px' },
  storeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 10px', background: 'none', border: 'none', cursor: 'pointer',
    borderRadius: 10, textAlign: 'left', position: 'relative',
    transition: 'background 0.15s',
  },
  storeBtnActive: { background: '#eff6ff' },
  storeAvatar: {
    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 16, fontWeight: 800,
  },
  storeBtnInfo: { flex: 1, minWidth: 0 },
  storeBtnName: { fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  storeBtnCity: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, background: '#2DC653', flexShrink: 0 },
  vacBadge: { background: '#E63946', color: '#fff', borderRadius: 8, padding: '2px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0 },

  // ── Chat Panel ──
  chatPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  chatHeader: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 22px', flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  chatHeaderAvatar: {
    width: 42, height: 42, borderRadius: 14, flexShrink: 0,
    background: 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, fontWeight: 800, color: '#fff',
    border: '2px solid rgba(255,255,255,0.35)',
  },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: -0.2 },
  chatHeaderSub: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, background: '#4ade80', border: '1.5px solid rgba(255,255,255,0.5)', display: 'inline-block' },

  vacancyBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#fffbeb', borderBottom: '1px solid #fde68a',
    padding: '12px 24px', fontSize: 13, color: '#b45309', flexShrink: 0,
  },
  vacancyBannerIcon: { fontSize: 18, flexShrink: 0 },

  shiftToggle: { display: 'flex', background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 3, gap: 2 },
  shiftToggleBtn: {
    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, background: 'transparent', color: 'rgba(255,255,255,0.7)',
  },
  shiftToggleBtnActive: { background: 'rgba(255,255,255,0.25)', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },

  tabRow: { display: 'flex', gap: 6 },
  tab: {
    padding: '7px 14px', borderRadius: 10,
    border: '1.5px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  tabActive: { background: 'rgba(255,255,255,0.25)', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' },
  badge: {
    background: '#E63946', color: '#fff',
    borderRadius: 10, padding: '1px 7px',
    fontSize: 10, fontWeight: 800,
  },

  // Sections
  section: { flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#f8fafc' },
  sectionTitle: { fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 16px' },
  subTitle: { fontSize: 13, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' },

  // Today's roster
  rosterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 12,
  },
  rosterCard: {
    background: '#fff', borderRadius: 14, padding: 16,
    borderTop: '4px solid #ccc',
    border: '1px solid #f0f1f2',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
  },
  rosterAvatar: {
    width: 32, height: 32, borderRadius: 9,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0,
  },
  rosterName: { fontWeight: 700, fontSize: 14, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rosterShiftTag: {
    display: 'inline-block', borderRadius: 8,
    padding: '3px 10px', fontSize: 11, fontWeight: 700,
    border: '1px solid', marginBottom: 6,
  },
  rosterTime: { fontSize: 12, color: '#9ca3af' },

  // Grid
  gridWrapper: { overflowX: 'auto' },
  grid: { width: '100%', borderCollapse: 'collapse', minWidth: 700 },
  gridHeaderCell: {
    padding: '10px 8px', textAlign: 'center',
    fontSize: 11, fontWeight: 800, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    background: '#f8fafc', borderBottom: '2px solid #f0f1f2',
  },
  todayCol: { color: '#1D3557', background: '#eff6ff' },
  todayBadge: {
    display: 'block', fontSize: 9, fontWeight: 800,
    color: '#1D3557', textTransform: 'uppercase', marginTop: 2,
  },
  shiftLabelCell: {
    padding: '8px 14px', background: '#fafafa',
    borderRight: '2px solid #f0f1f2', borderBottom: '1px solid #f0f1f2',
  },
  shiftLabel: { borderLeft: '3px solid #ccc', paddingLeft: 10 },
  shiftLabelName: { fontWeight: 800, fontSize: 13, color: '#111827' },
  shiftLabelTime: { fontSize: 11, color: '#9ca3af', marginTop: 3 },
  cell: {
    padding: '6px 8px', verticalAlign: 'top',
    borderBottom: '1px solid #f0f1f2', borderRight: '1px solid #f0f1f2',
    minWidth: 90,
  },
  todayCellBg: { background: '#eff6ff' },
  cellContent: { display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 32 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#f0f4ff', border: '1px solid',
    borderRadius: 8, padding: '3px 4px 3px 8px',
    fontSize: 11, fontWeight: 600, color: '#1D3557',
  },
  chipName: { maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chipRemove: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#E63946', fontSize: 14, fontWeight: 700,
    padding: '0 2px', lineHeight: 1,
  },
  addChipBtn: {
    background: 'none', border: '1.5px dashed #d1d5db',
    borderRadius: 8, width: 26, height: 26,
    cursor: 'pointer', color: '#9ca3af', fontSize: 16, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, transition: 'border-color 0.15s',
  },

  // Requests
  requestList: { display: 'flex', flexDirection: 'column', gap: 10 },
  requestCard: {
    background: '#fff', borderRadius: 14, padding: 16,
    borderLeft: '4px solid #ccc',
    border: '1px solid #f0f1f2',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  requestTop: { display: 'flex', gap: 10, alignItems: 'center' },
  reqAvatar: {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 14,
  },
  requestEmployee: { fontWeight: 700, fontSize: 14, color: '#111827' },
  requestPhone: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  requestTypeBadge: {
    borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700,
  },
  statusBadge: {
    borderRadius: 8, padding: '3px 10px', fontSize: 10, fontWeight: 800,
    textTransform: 'uppercase', border: '1px solid',
  },
  requestDetails: { display: 'flex', gap: 10, fontSize: 13, color: '#374151', flexWrap: 'wrap', fontWeight: 600 },
  dot: { color: '#e5e7eb' },
  requestNotes: { fontStyle: 'italic', color: '#9ca3af', fontWeight: 400 },
  requestActions: { display: 'flex', gap: 10, marginTop: 2 },
  approveBtn: {
    background: '#f0fdf4', color: '#16a34a',
    border: '1px solid #bbf7d0',
    borderRadius: 10, padding: '8px 20px', fontWeight: 800,
    cursor: 'pointer', fontSize: 13,
  },
  denyBtn: {
    background: '#fff1f2', color: '#E63946',
    border: '1px solid #fecaca',
    borderRadius: 10, padding: '8px 20px', fontWeight: 800,
    cursor: 'pointer', fontSize: 13,
  },

  // Modal
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, backdropFilter: 'blur(2px)',
  },
  modal: {
    background: '#fff', borderRadius: 20, padding: 28,
    width: 420, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  modalTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' },
  label: { fontWeight: 700, fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' },
  select: {
    padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: 14, width: '100%',
    boxSizing: 'border-box' as const, background: '#f9fafb', color: '#111827',
  },
  modalActions: { display: 'flex', gap: 10, marginTop: 4 },
  saveBtn: {
    background: '#0f5132', color: '#fff', border: 'none',
    borderRadius: 10, padding: '11px 24px', fontWeight: 800,
    cursor: 'pointer', fontSize: 14,
    boxShadow: '0 4px 12px rgba(15,81,50,0.3)',
  },
  cancelBtn: {
    background: '#f3f4f6', color: '#6b7280',
    border: '1.5px solid #e5e7eb', borderRadius: 10,
    padding: '11px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14,
  },

  // Empty / loading
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', gap: 12, padding: 60,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: 800, color: '#1D3557' },
  emptyDesc: { fontSize: 14, color: '#6c757d', textAlign: 'center', maxWidth: 300 },
  emptyCard: {
    color: '#6c757d', background: '#f8f9fa',
    borderRadius: 12, padding: '16px 20px', fontSize: 14,
  },
  loadingText: { color: '#6c757d', padding: 20, fontSize: 14 },
};
