import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { careersApi, jobOpeningsApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';

const POSITION_LABELS: Record<string, string> = {
  CASHIER: 'Cashier',
  ASSISTANT_MANAGER: 'Assistant Manager',
  STORE_MANAGER: 'Store Manager',
  FOOD_PREP: 'Food Prep / Cook',
  NIGHT_SHIFT: 'Night Shift Attendant',
  FUEL_ATTENDANT: 'Fuel Attendant',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NEW:      { label: 'New',            color: '#1D3557', bg: '#eff6ff' },
  REVIEWED: { label: 'Reviewed',       color: '#7c3aed', bg: '#f5f3ff' },
  INTERVIEW:{ label: 'Interview',      color: '#b45309', bg: '#fffbeb' },
  HIRED:    { label: 'Hired',          color: '#166534', bg: '#f0fdf4' },
  REJECTED: { label: 'Rejected',       color: '#9f1239', bg: '#fff1f2' },
};

const SHIFT_LABELS: Record<string, string> = {
  MORNINGS: 'Mornings', AFTERNOONS: 'Afternoons', NIGHTS: 'Nights', WEEKENDS: 'Weekends',
};

interface Application {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  position: string;
  storeId: string | null;
  availability: { type: string; shifts: string[] };
  experience: string | null;
  message: string | null;
  status: string;
  reviewNotes: string | null;
  customerId: string | null;
  createdAt: string;
  store: { name: string; city: string } | null;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_TABS = ['ALL', 'NEW', 'REVIEWED', 'INTERVIEW', 'HIRED', 'REJECTED'];

const POSITIONS = [
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'FUEL_ATTENDANT', label: 'Fuel Attendant' },
  { value: 'FOOD_PREP', label: 'Food Prep / Cook' },
  { value: 'NIGHT_SHIFT', label: 'Night Shift Attendant' },
  { value: 'ASSISTANT_MANAGER', label: 'Assistant Manager' },
  { value: 'STORE_MANAGER', label: 'Store Manager' },
];

interface JobOpening {
  id: string;
  title: string;
  position: string;
  storeId: string | null;
  description: string | null;
  requirements: string | null;
  payRange: string | null;
  employType: string;
  isActive: boolean;
  createdAt: string;
  store: { name: string; city: string } | null;
  createdBy: { name: string };
}

const emptyForm = { title: '', position: 'CASHIER', storeId: '', description: '', requirements: '', payRange: '', employType: 'BOTH', isActive: true };

export default function Careers() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';

  const [mainTab, setMainTab] = useState<'openings' | 'applications'>('openings');
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [confirmDeleteOpening, setConfirmDeleteOpening] = useState<string | null>(null);
  const [confirmDeleteApp, setConfirmDeleteApp] = useState<string | null>(null);

  // Openings state
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [editingOpening, setEditingOpening] = useState<JobOpening | null>(null);
  const [openingForm, setOpeningForm] = useState(emptyForm);

  const params: Record<string, string> = {};
  if (activeTab !== 'ALL') params.status = activeTab;
  if (selectedPosition) params.position = selectedPosition;
  if (selectedStore) params.storeId = selectedStore;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['careers-applications', params],
    queryFn: () => careersApi.getApplications(params),
  });

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: storesApi.getAll,
  });

  const { data: openingsData, isLoading: openingsLoading } = useQuery({
    queryKey: ['job-openings-admin'],
    queryFn: jobOpeningsApi.getAll,
  });

  const applications: Application[] = data?.data?.data?.applications ?? [];
  const total: number = data?.data?.data?.total ?? 0;
  const stores = storesData?.data?.data ?? [];
  const openings: JobOpening[] = openingsData?.data?.data ?? [];

  const updateMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { status?: string; reviewNotes?: string } }) =>
      careersApi.update(id, updates),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['careers-applications'] });
      qc.invalidateQueries({ queryKey: ['careers-new-count'] });
      setSelectedApp(res.data.data);
      toast.success('Application updated');
    },
    onError: () => toast.error('Failed to update'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => careersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['careers-applications'] });
      qc.invalidateQueries({ queryKey: ['careers-new-count'] });
      setSelectedApp(null);
      toast.success('Application deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const createOpeningMut = useMutation({
    mutationFn: (data: object) => jobOpeningsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-openings-admin'] }); setShowOpeningForm(false); setOpeningForm(emptyForm); toast.success('Opening posted'); },
    onError: () => toast.error('Failed to post opening'),
  });

  const updateOpeningMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => jobOpeningsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-openings-admin'] }); setEditingOpening(null); setShowOpeningForm(false); toast.success('Opening updated'); },
    onError: () => toast.error('Failed to update opening'),
  });

  const deleteOpeningMut = useMutation({
    mutationFn: (id: string) => jobOpeningsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-openings-admin'] }); toast.success('Opening deleted'); },
    onError: () => toast.error('Failed to delete opening'),
  });

  function startEditOpening(op: JobOpening) {
    setEditingOpening(op);
    setOpeningForm({ title: op.title, position: op.position, storeId: op.storeId ?? '', description: op.description ?? '', requirements: op.requirements ?? '', payRange: op.payRange ?? '', employType: op.employType, isActive: op.isActive });
    setShowOpeningForm(true);
  }

  function submitOpeningForm() {
    const payload = { ...openingForm, storeId: openingForm.storeId || null, description: openingForm.description || null, requirements: openingForm.requirements || null, payRange: openingForm.payRange || null };
    if (editingOpening) updateOpeningMut.mutate({ id: editingOpening.id, data: payload });
    else createOpeningMut.mutate(payload);
  }

  function openApp(app: Application) {
    setSelectedApp(app);
    setEditNotes(app.reviewNotes ?? '');
  }

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmDeleteOpening}
        title="Delete Opening"
        message="This job opening will be permanently removed. Applicants already submitted won't be affected."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteOpening) deleteOpeningMut.mutate(confirmDeleteOpening); setConfirmDeleteOpening(null); }}
        onCancel={() => setConfirmDeleteOpening(null)}
      />
      <ConfirmModal
        open={!!confirmDeleteApp}
        title="Delete Application"
        message="This application will be permanently deleted and cannot be recovered."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteApp) deleteMut.mutate(confirmDeleteApp); setConfirmDeleteApp(null); }}
        onCancel={() => setConfirmDeleteApp(null)}
      />
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>💼 Careers</h1>
          <p style={s.subtitle}>{openings.length} opening{openings.length !== 1 ? 's' : ''} · {total} application{total !== 1 ? 's' : ''}</p>
        </div>
        {mainTab === 'openings' && (
          <button style={s.postBtn} onClick={() => { setEditingOpening(null); setOpeningForm(emptyForm); setShowOpeningForm(true); }}>
            + Post Opening
          </button>
        )}
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['openings', 'applications'] as const).map(tab => (
          <button key={tab} style={{ ...s.tab, ...(mainTab === tab ? s.tabActive : {}), fontSize: 16, padding: '9px 22px' }}
            onClick={() => setMainTab(tab)}>
            {tab === 'openings' ? '📋 Job Openings' : '📩 Applications'}
          </button>
        ))}
      </div>

      {/* ── OPENINGS PANEL ── */}
      {mainTab === 'openings' && (
        openingsLoading ? <div style={s.empty}>Loading…</div> :
        openings.length === 0 ? <div style={s.empty}>No openings posted yet. Click "Post Opening" to add one.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {openings.map(op => (
              <div key={op.id} style={{ ...s.opCard, opacity: op.isActive ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={s.opTitle}>{op.title}</span>
                      <span style={{ ...s.badge, ...(op.isActive ? { color: '#166534', background: '#f0fdf4' } : { color: '#888', background: '#f5f5f5' }) }}>
                        {op.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={s.opMeta}>
                      {POSITION_LABELS[op.position] ?? op.position}
                      {op.store ? ` · ${op.store.name} — ${op.store.city}` : ' · Any Location'}
                      {op.payRange ? ` · ${op.payRange}` : ''}
                      {op.employType !== 'BOTH' ? ` · ${op.employType === 'FULL_TIME' ? 'Full-time' : 'Part-time'}` : ''}
                    </div>
                    {op.description && <div style={s.opDesc}>{op.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                    <button style={s.editBtn} onClick={() => startEditOpening(op)}>Edit</button>
                    <button style={s.deleteBtn} onClick={() => setConfirmDeleteOpening(op.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── APPLICATIONS PANEL ── */}
      {mainTab === 'applications' && <>

      {/* Status Tabs */}
      <div style={s.tabs}>
        {STATUS_TABS.map(tab => (
          <button key={tab} style={{ ...s.tab, ...(activeTab === tab ? s.tabActive : {}) }}
            onClick={() => setActiveTab(tab)}>
            {tab === 'ALL' ? 'All' : STATUS_CONFIG[tab]?.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <select style={s.select} value={selectedPosition} onChange={e => setSelectedPosition(e.target.value)}>
          <option value="">All Positions</option>
          {Object.entries(POSITION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select style={s.select} value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
          <option value="">All Stores</option>
          {stores.map((st: any) => (
            <option key={st.id} value={st.id}>{st.name} — {st.city}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <TableSkeleton columns={6} />
      ) : applications.length === 0 ? (
        <div style={s.empty}>No applications found.</div>
      ) : (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow style={s.thead}>
                <TableHead style={s.th}>Applicant</TableHead>
                <TableHead style={s.th}>Position</TableHead>
                <TableHead style={s.th}>Preferred Store</TableHead>
                <TableHead style={s.th}>Availability</TableHead>
                <TableHead style={s.th}>Status</TableHead>
                <TableHead style={s.th}>Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map(app => {
                const sc = STATUS_CONFIG[app.status];
                return (
                  <TableRow key={app.id} style={s.tr} onClick={() => openApp(app)} aria-label={`Open application from ${app.name}`}>
                    <TableCell style={s.td}>
                      <div style={s.appName}>{app.name}</div>
                      <div style={s.appPhone}>{app.phone}</div>
                    </TableCell>
                    <TableCell style={s.td}>{POSITION_LABELS[app.position] ?? app.position}</TableCell>
                    <TableCell style={s.td}>{app.store ? `${app.store.name} — ${app.store.city}` : 'Any'}</TableCell>
                    <TableCell style={s.td}>
                      <span style={s.avail}>{app.availability.type === 'FULL_TIME' ? 'Full-time' : 'Part-time'}</span>
                    </TableCell>
                    <TableCell style={s.td}>
                      <span style={{ ...s.badge, color: sc.color, background: sc.bg }}>{sc.label}</span>
                    </TableCell>
                    <TableCell style={{ ...s.td, color: '#888', fontSize: 14 }}>{timeAgo(app.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      </>}

      {/* Opening Form Modal */}
      {showOpeningForm && (
        <div style={s.overlay} onClick={() => setShowOpeningForm(false)}>
          <div style={{ ...s.modal, width: 520 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 20, color: '#1D3557' }}>{editingOpening ? 'Edit Opening' : 'Post Job Opening'}</h2>

            <label style={s.label}>Job Title *</label>
            <input style={s.input} value={openingForm.title} onChange={e => setOpeningForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Cashier Needed – North Location" />

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Position *</label>
                <select style={s.input} value={openingForm.position} onChange={e => setOpeningForm(f => ({ ...f, position: e.target.value }))}>
                  {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Employment Type</label>
                <select style={s.input} value={openingForm.employType} onChange={e => setOpeningForm(f => ({ ...f, employType: e.target.value }))}>
                  <option value="BOTH">Full-time or Part-time</option>
                  <option value="FULL_TIME">Full-time only</option>
                  <option value="PART_TIME">Part-time only</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Store (optional)</label>
                <select style={s.input} value={openingForm.storeId} onChange={e => setOpeningForm(f => ({ ...f, storeId: e.target.value }))}>
                  <option value="">Any Location</option>
                  {stores.map((st: any) => <option key={st.id} value={st.id}>{st.name} — {st.city}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Pay Range (optional)</label>
                <input style={s.input} value={openingForm.payRange} onChange={e => setOpeningForm(f => ({ ...f, payRange: e.target.value }))} placeholder="e.g. $15–$18/hr" />
              </div>
            </div>

            <label style={s.label}>Description (optional)</label>
            <textarea style={{ ...s.input, minHeight: 80, resize: 'vertical' } as any} value={openingForm.description} onChange={e => setOpeningForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the role, responsibilities…" />

            <label style={s.label}>Requirements (optional)</label>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' } as any} value={openingForm.requirements} onChange={e => setOpeningForm(f => ({ ...f, requirements: e.target.value }))} placeholder="Experience, certifications, etc." />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', cursor: 'pointer', fontSize: 15 }}>
              <input type="checkbox" checked={openingForm.isActive} onChange={e => setOpeningForm(f => ({ ...f, isActive: e.target.checked }))} />
              Active (visible to customers)
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={s.cancelBtn} onClick={() => setShowOpeningForm(false)}>Cancel</button>
              <button style={s.saveBtn} onClick={submitOpeningForm} disabled={!openingForm.title}>
                {editingOpening ? 'Save Changes' : 'Post Opening'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedApp && (() => {
        const app = selectedApp;
        const sc = STATUS_CONFIG[app.status];
        const avail = app.availability;
        return (
          <div style={s.overlay} onClick={() => setSelectedApp(null)}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
              <div style={s.modalHeader}>
                <div>
                  <div style={s.modalName}>{app.name}</div>
                  <div style={s.modalSub}>{POSITION_LABELS[app.position] ?? app.position}</div>
                </div>
                <span style={{ ...s.badge, color: sc.color, background: sc.bg, fontSize: 15 }}>{sc.label}</span>
              </div>

              {/* Contact */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Contact</div>
                <div style={s.row}><span style={s.rowLabel}>Phone</span><span>{app.phone}</span></div>
                {app.email && <div style={s.row}><span style={s.rowLabel}>Email</span><span>{app.email}</span></div>}
              </div>

              {/* Preferred Store */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Preferences</div>
                <div style={s.row}>
                  <span style={s.rowLabel}>Store</span>
                  <span>{app.store ? `${app.store.name} — ${app.store.city}` : 'Any location'}</span>
                </div>
                <div style={s.row}>
                  <span style={s.rowLabel}>Type</span>
                  <span>{avail.type === 'FULL_TIME' ? 'Full-time' : 'Part-time'}</span>
                </div>
                <div style={s.row}>
                  <span style={s.rowLabel}>Shifts</span>
                  <span>{avail.shifts.map((sh: string) => SHIFT_LABELS[sh] ?? sh).join(', ')}</span>
                </div>
              </div>

              {/* Experience */}
              {app.experience && (
                <div style={s.section}>
                  <div style={s.sectionTitle}>Experience</div>
                  <p style={s.text}>{app.experience}</p>
                </div>
              )}

              {/* Message */}
              {app.message && (
                <div style={s.section}>
                  <div style={s.sectionTitle}>Cover Note</div>
                  <p style={s.text}>{app.message}</p>
                </div>
              )}

              {/* Status Update */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Update Status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(['NEW', 'REVIEWED', 'INTERVIEW', 'HIRED', 'REJECTED'] as const).map(st => (
                    <button key={st}
                      style={{ ...s.statusBtn, ...(app.status === st ? { background: STATUS_CONFIG[st].bg, color: STATUS_CONFIG[st].color, fontWeight: 700, border: `1.5px solid ${STATUS_CONFIG[st].color}` } : {}) }}
                      onClick={() => updateMut.mutate({ id: app.id, updates: { status: st } })}
                      disabled={app.status === st}>
                      {STATUS_CONFIG[st].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Notes */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Internal Notes</div>
                <textarea
                  style={s.textarea}
                  rows={3}
                  placeholder="Add notes visible only to admins…"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                />
                <button style={s.saveBtn}
                  onClick={() => updateMut.mutate({ id: app.id, updates: { reviewNotes: editNotes } })}>
                  Save Notes
                </button>
              </div>

              {/* Applied info */}
              <div style={s.metaRow}>
                <span style={s.metaText}>Applied {new Date(app.createdAt).toLocaleString()}</span>
                {isDevAdmin && (
                  <button style={s.deleteBtn}
                    onClick={() => setConfirmDeleteApp(app.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: '4px 0 0', fontSize: 14, color: '#888' },

  tabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: { padding: '7px 18px', borderRadius: 20, border: '1.5px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#555' },
  tabActive: { background: '#1D3557', color: '#fff', border: '1.5px solid #1D3557' },

  filters: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  select: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 15, background: '#fff', cursor: 'pointer', minWidth: 180 },

  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid #e0e0e0', background: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8fafc' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 14, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e0e0e0' },
  tr: { cursor: 'pointer', transition: 'background 0.15s' },
  td: { padding: '14px 16px', fontSize: 15, color: '#1D3557', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' },
  appName: { fontWeight: 700, color: '#1D3557' },
  appPhone: { fontSize: 14, color: '#888', marginTop: 2 },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 14, fontWeight: 700 },
  avail: { fontSize: 14, color: '#555' },

  empty: { textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 15 },

  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 20 },
  modal: { background: '#fff', borderRadius: 16, width: 480, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 28 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalName: { fontSize: 20, fontWeight: 800, color: '#1D3557' },
  modalSub: { fontSize: 15, color: '#888', marginTop: 3 },

  section: { marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #f0f0f0' },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  row: { display: 'flex', gap: 12, marginBottom: 6, fontSize: 14, color: '#333' },
  rowLabel: { fontWeight: 600, color: '#888', minWidth: 70 },
  text: { fontSize: 14, color: '#333', lineHeight: 1.6, margin: 0 },

  statusBtn: { padding: '6px 14px', borderRadius: 20, border: '1.5px solid #e0e0e0', background: '#f8fafc', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#555' },

  textarea: { width: '100%', borderRadius: 8, border: '1.5px solid #e0e0e0', padding: '10px 12px', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },
  saveBtn: { marginTop: 8, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1D3557', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },

  metaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  metaText: { fontSize: 14, color: '#aaa' },
  deleteBtn: { padding: '6px 14px', borderRadius: 8, border: '1.5px solid #E63946', background: '#fff', color: '#E63946', fontSize: 14, fontWeight: 700, cursor: 'pointer' },

  // Openings
  postBtn: { padding: '10px 20px', borderRadius: 10, border: 'none', background: '#CC2936', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  opCard: { background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e0e0e0' },
  opTitle: { fontSize: 17, fontWeight: 800, color: '#1D3557' },
  opMeta: { fontSize: 14, color: '#666', margin: '4px 0 6px' },
  opDesc: { fontSize: 14, color: '#444', lineHeight: 1.5 },
  editBtn: { padding: '6px 14px', borderRadius: 8, border: '1.5px solid #1D3557', background: '#fff', color: '#1D3557', fontSize: 14, fontWeight: 700, cursor: 'pointer' },

  // Form
  label: { fontSize: 13, fontWeight: 700, color: '#1D3557', display: 'block', marginBottom: 5, marginTop: 14 },
  input: { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' },
  cancelBtn: { padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e0e0e0', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', color: '#555' },
};
