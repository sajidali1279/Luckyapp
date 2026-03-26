import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { schedulingApi, storesApi } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { key: string; label: string }[] = [
  { key: 'MON', label: 'Monday' },
  { key: 'TUE', label: 'Tuesday' },
  { key: 'WED', label: 'Wednesday' },
  { key: 'THU', label: 'Thursday' },
  { key: 'FRI', label: 'Friday' },
  { key: 'SAT', label: 'Saturday' },
  { key: 'SUN', label: 'Sunday' },
];

const SHIFTS: { key: string; label: string; time: string; color: string }[] = [
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

  return (
    <div style={s.page}>
      {/* ── Left Panel: Store List ── */}
      <div style={s.leftPanel}>
        <div style={s.leftHeader}>
          <span style={s.leftTitle}>📍 Stores</span>
          {totalVacancies > 0 && (
            <span style={s.totalVacBadge}>{totalVacancies} open</span>
          )}
        </div>
        {storesLoading ? (
          <div style={s.loadingText}>Loading...</div>
        ) : (
          stores.map((store: any) => (
            <button
              key={store.id}
              style={{ ...s.storeItem, ...(selectedStoreId === store.id ? s.storeItemActive : {}) }}
              onClick={() => { setSelectedStoreId(store.id); setActiveTab('schedule'); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={s.storeItemName}>{store.name}</div>
                {(vacancyByStoreId[store.id] || 0) > 0 && (
                  <span style={s.vacBadge}>{vacancyByStoreId[store.id]}</span>
                )}
              </div>
              <div style={s.storeItemCity}>{store.city}, {store.state}</div>
            </button>
          ))
        )}
      </div>

      {/* ── Right Panel ── */}
      <div style={s.rightPanel}>
        {!selectedStoreId ? (
          <div style={s.emptyState}>
            <div style={s.emptyEmoji}>📅</div>
            <div style={s.emptyTitle}>Select a Store</div>
            <div style={s.emptyDesc}>Choose a store from the left to manage its employee schedule.</div>
          </div>
        ) : (
          <>
            {/* Vacancy Banner */}
            {selectedStoreVacancies && selectedStoreVacancies.vacantCount > 0 && (
              <div style={s.vacancyBanner}>
                <span style={s.vacancyBannerIcon}>⚠️</span>
                <div>
                  <strong>{selectedStoreVacancies.vacantCount} open shift slot{selectedStoreVacancies.vacantCount !== 1 ? 's' : ''}</strong> at {selectedStore?.name} —
                  {' '}{selectedStoreVacancies.vacancies.slice(0, 4).map((v: any) => `${v.dayOfWeek} ${v.shiftType.toLowerCase()}`).join(', ')}
                  {selectedStoreVacancies.vacancies.length > 4 ? ` +${selectedStoreVacancies.vacancies.length - 4} more` : ''}
                </div>
              </div>
            )}

            {/* Store Header */}
            <div style={s.rightHeader}>
              <div>
                <h1 style={s.pageTitle}>📅 {selectedStore?.name} Schedule</h1>
                <p style={s.pageSub}>{selectedStore?.city}, {selectedStore?.state}</p>
              </div>
              <div style={s.tabRow}>
                <button
                  style={{ ...s.tab, ...(activeTab === 'schedule' ? s.tabActive : {}) }}
                  onClick={() => setActiveTab('schedule')}
                >
                  Weekly Schedule
                </button>
                <button
                  style={{ ...s.tab, ...(activeTab === 'requests' ? s.tabActive : {}), position: 'relative' }}
                  onClick={() => setActiveTab('requests')}
                >
                  Requests
                  {pendingRequests.length > 0 && (
                    <span style={s.badge}>{pendingRequests.length}</span>
                  )}
                </button>
              </div>
            </div>

            {activeTab === 'schedule' && (
              <>
                {/* Today's Roster */}
                <div style={s.section}>
                  <h2 style={s.sectionTitle}>Today's Roster {todayDay ? `(${todayDay})` : ''}</h2>
                  {roster.length === 0 ? (
                    <div style={s.emptyCard}>No staff scheduled for today.</div>
                  ) : (
                    <div style={s.rosterGrid}>
                      {roster.map((r: any) => {
                        const shift = SHIFTS.find((sh) => sh.key === r.shiftType);
                        return (
                          <div key={r.templateId} style={{ ...s.rosterCard, borderTopColor: shift?.color || '#ccc' }}>
                            <div style={s.rosterName}>{r.employee.name || r.employee.phone}</div>
                            <div style={{ ...s.rosterShiftTag, backgroundColor: (shift?.color || '#ccc') + '20', color: shift?.color || '#666' }}>
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

  return (
    <div style={{
      ...s.requestCard,
      borderLeftColor: isTimeOff ? '#E63946' : '#2DC653',
      opacity: isPending ? 1 : 0.75,
    }}>
      <div style={s.requestTop}>
        <span style={{
          ...s.requestTypeBadge,
          background: isTimeOff ? '#E6394615' : '#2DC65315',
          color: isTimeOff ? '#E63946' : '#2DC653',
        }}>
          {isTimeOff ? '🏖️ Time Off' : '🙋 Fill-In'}
        </span>
        <span style={{
          ...s.statusBadge,
          background: request.status === 'PENDING' ? '#F4A26120' : isApproved ? '#2DC65320' : '#E6394620',
          color: request.status === 'PENDING' ? '#b07720' : isApproved ? '#1a7a36' : '#E63946',
        }}>
          {request.status}
        </span>
      </div>
      <div style={s.requestEmployee}>
        {request.employee?.name || request.employee?.phone}
      </div>
      <div style={s.requestDetails}>
        <span>{fmtDate(request.date)}</span>
        <span style={s.dot}>·</span>
        <span>{request.shiftType}</span>
        {request.notes && (
          <>
            <span style={s.dot}>·</span>
            <span style={s.requestNotes}>"{request.notes}"</span>
          </>
        )}
      </div>
      {isPending && (
        <div style={s.requestActions}>
          <button style={s.approveBtn} onClick={onApprove}>Approve</button>
          <button style={s.denyBtn} onClick={onDeny}>Deny</button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' },

  // Left panel
  leftPanel: {
    width: 220, flexShrink: 0, background: '#f8f9fa',
    borderRight: '1px solid #e9ecef', overflowY: 'auto',
  },
  leftHeader: {
    padding: '16px 16px 10px', borderBottom: '1px solid #e9ecef',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  leftTitle: { fontWeight: 800, fontSize: 13, color: '#1D3557', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalVacBadge: { background: '#E63946', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  vacBadge: { background: '#E63946', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 700, flexShrink: 0 },
  vacancyBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#fff3cd', borderBottom: '1px solid #ffc107',
    padding: '12px 24px', fontSize: 13, color: '#856404',
  },
  vacancyBannerIcon: { fontSize: 16, flexShrink: 0 },
  storeItem: {
    width: '100%', padding: '12px 16px', textAlign: 'left',
    background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer',
  },
  storeItemActive: { background: '#1D355712', borderLeft: '3px solid #1D3557' },
  storeItemName: { fontWeight: 700, fontSize: 13, color: '#1D3557' },
  storeItemCity: { fontSize: 11, color: '#6c757d', marginTop: 2 },

  // Right panel
  rightPanel: { flex: 1, overflowY: 'auto', background: '#fff' },
  rightHeader: {
    padding: '24px 28px 0', display: 'flex',
    justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottom: '1px solid #e9ecef', paddingBottom: 16,
  },
  pageTitle: { fontSize: 24, fontWeight: 800, color: '#1D3557', margin: 0 },
  pageSub: { color: '#6c757d', margin: '4px 0 0', fontSize: 14 },

  // Tabs
  tabRow: { display: 'flex', gap: 4 },
  tab: {
    padding: '8px 18px', borderRadius: '8px 8px 0 0',
    border: '1px solid #e9ecef', borderBottom: 'none',
    background: '#f8f9fa', cursor: 'pointer',
    fontSize: 13, fontWeight: 700, color: '#6c757d',
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: -1,
  },
  tabActive: { background: '#fff', color: '#1D3557', borderBottomColor: '#fff' },
  badge: {
    background: '#E63946', color: '#fff',
    borderRadius: 10, padding: '1px 6px',
    fontSize: 10, fontWeight: 800,
  },

  // Sections
  section: { padding: '24px 28px' },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: '#1D3557', margin: '0 0 16px' },
  subTitle: { fontSize: 14, fontWeight: 700, color: '#495057', margin: '0 0 12px' },

  // Today's roster
  rosterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  rosterCard: {
    background: '#f8f9fa', borderRadius: 12, padding: 14,
    borderTop: '4px solid #ccc',
  },
  rosterName: { fontWeight: 700, fontSize: 14, color: '#1D3557', marginBottom: 6 },
  rosterShiftTag: {
    display: 'inline-block', borderRadius: 6,
    padding: '2px 8px', fontSize: 11, fontWeight: 700, marginBottom: 4,
  },
  rosterTime: { fontSize: 12, color: '#6c757d' },

  // Grid
  gridWrapper: { overflowX: 'auto' },
  grid: { width: '100%', borderCollapse: 'collapse', minWidth: 700 },
  gridHeaderCell: {
    padding: '10px 8px', textAlign: 'center',
    fontSize: 11, fontWeight: 800, color: '#6c757d',
    textTransform: 'uppercase', letterSpacing: 0.5,
    background: '#f8f9fa', borderBottom: '2px solid #e9ecef',
  },
  todayCol: { color: '#1D3557', background: '#1D355710' },
  todayBadge: {
    display: 'block', fontSize: 9, fontWeight: 800,
    color: '#1D3557', textTransform: 'uppercase', marginTop: 2,
  },
  shiftLabelCell: {
    padding: '8px 12px', background: '#fafafa',
    borderRight: '2px solid #e9ecef', borderBottom: '1px solid #f0f0f0',
  },
  shiftLabel: { borderLeft: '3px solid #ccc', paddingLeft: 8 },
  shiftLabelName: { fontWeight: 700, fontSize: 13, color: '#1D3557' },
  shiftLabelTime: { fontSize: 11, color: '#6c757d', marginTop: 2 },
  cell: {
    padding: '6px 8px', verticalAlign: 'top',
    borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0',
    minWidth: 90,
  },
  todayCellBg: { background: '#1D35570A' },
  cellContent: { display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 32 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: '#f0f4ff', border: '1px solid #d0d9f0',
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
    background: 'none', border: '1.5px dashed #adb5bd',
    borderRadius: 8, width: 26, height: 26,
    cursor: 'pointer', color: '#6c757d', fontSize: 16, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  },

  // Requests
  requestList: { display: 'flex', flexDirection: 'column', gap: 10 },
  requestCard: {
    background: '#f8f9fa', borderRadius: 12, padding: 14,
    borderLeft: '4px solid #ccc',
  },
  requestTop: { display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' },
  requestTypeBadge: {
    borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  statusBadge: {
    borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase',
  },
  requestEmployee: { fontWeight: 700, fontSize: 15, color: '#1D3557', marginBottom: 4 },
  requestDetails: { display: 'flex', gap: 8, fontSize: 13, color: '#495057', flexWrap: 'wrap' },
  dot: { color: '#dee2e6' },
  requestNotes: { fontStyle: 'italic', color: '#6c757d' },
  requestActions: { display: 'flex', gap: 8, marginTop: 10 },
  approveBtn: {
    background: '#2DC653', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 18px', fontWeight: 700,
    cursor: 'pointer', fontSize: 13,
  },
  denyBtn: {
    background: 'none', color: '#E63946',
    border: '1px solid #E63946', borderRadius: 8,
    padding: '7px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
  },

  // Modal
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: '#fff', borderRadius: 16, padding: 28,
    width: 400, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  modalTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: '#1D3557' },
  label: { fontWeight: 600, fontSize: 13, color: '#212529' },
  select: {
    padding: '10px 14px', borderRadius: 8,
    border: '1px solid #dee2e6', fontSize: 14, width: '100%',
    boxSizing: 'border-box' as const,
  },
  modalActions: { display: 'flex', gap: 10, marginTop: 4 },
  saveBtn: {
    background: '#2DC653', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 22px', fontWeight: 700,
    cursor: 'pointer', fontSize: 14,
  },
  cancelBtn: {
    background: '#f8f9fa', color: '#6c757d',
    border: '1px solid #dee2e6', borderRadius: 8,
    padding: '10px 22px', fontWeight: 600, cursor: 'pointer', fontSize: 14,
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
