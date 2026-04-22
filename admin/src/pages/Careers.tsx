import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { careersApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

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

export default function Careers() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';

  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const params: Record<string, string> = {};
  if (activeTab !== 'ALL') params.status = activeTab;
  if (selectedPosition) params.position = selectedPosition;
  if (selectedStore) params.storeId = selectedStore;

  const { data, isLoading } = useQuery({
    queryKey: ['careers-applications', params],
    queryFn: () => careersApi.getApplications(params),
  });

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: storesApi.getAll,
  });

  const applications: Application[] = data?.data?.data?.applications ?? [];
  const total: number = data?.data?.data?.total ?? 0;
  const stores = storesData?.data?.data ?? [];

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

  function openApp(app: Application) {
    setSelectedApp(app);
    setEditNotes(app.reviewNotes ?? '');
    if (app.status === 'NEW') {
      updateMut.mutate({ id: app.id, updates: { status: 'REVIEWED' } });
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>💼 Job Applications</h1>
          <p style={s.subtitle}>{total} total application{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

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
      {isLoading ? (
        <div style={s.empty}>Loading…</div>
      ) : applications.length === 0 ? (
        <div style={s.empty}>No applications found.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Applicant</th>
                <th style={s.th}>Position</th>
                <th style={s.th}>Preferred Store</th>
                <th style={s.th}>Availability</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Applied</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(app => {
                const sc = STATUS_CONFIG[app.status];
                return (
                  <tr key={app.id} style={s.tr} onClick={() => openApp(app)}>
                    <td style={s.td}>
                      <div style={s.appName}>{app.name}</div>
                      <div style={s.appPhone}>{app.phone}</div>
                    </td>
                    <td style={s.td}>{POSITION_LABELS[app.position] ?? app.position}</td>
                    <td style={s.td}>{app.store ? `${app.store.name} — ${app.store.city}` : 'Any'}</td>
                    <td style={s.td}>
                      <span style={s.avail}>{app.availability.type === 'FULL_TIME' ? 'Full-time' : 'Part-time'}</span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, color: sc.color, background: sc.bg }}>{sc.label}</span>
                    </td>
                    <td style={{ ...s.td, color: '#888', fontSize: 12 }}>{timeAgo(app.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                <span style={{ ...s.badge, color: sc.color, background: sc.bg, fontSize: 13 }}>{sc.label}</span>
              </div>

              {/* Contact */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Contact</div>
                <div style={s.row}><span style={s.label}>Phone</span><span>{app.phone}</span></div>
                {app.email && <div style={s.row}><span style={s.label}>Email</span><span>{app.email}</span></div>}
              </div>

              {/* Preferred Store */}
              <div style={s.section}>
                <div style={s.sectionTitle}>Preferences</div>
                <div style={s.row}>
                  <span style={s.label}>Store</span>
                  <span>{app.store ? `${app.store.name} — ${app.store.city}` : 'Any location'}</span>
                </div>
                <div style={s.row}>
                  <span style={s.label}>Type</span>
                  <span>{avail.type === 'FULL_TIME' ? 'Full-time' : 'Part-time'}</span>
                </div>
                <div style={s.row}>
                  <span style={s.label}>Shifts</span>
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
                    onClick={() => { if (confirm('Delete this application?')) deleteMut.mutate(app.id); }}>
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
  page: { padding: '32px 24px', maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: '4px 0 0', fontSize: 14, color: '#888' },

  tabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: { padding: '7px 18px', borderRadius: 20, border: '1.5px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#555' },
  tabActive: { background: '#1D3557', color: '#fff', borderColor: '#1D3557' },

  filters: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  select: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, background: '#fff', cursor: 'pointer', minWidth: 180 },

  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid #e0e0e0', background: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8fafc' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e0e0e0' },
  tr: { cursor: 'pointer', transition: 'background 0.15s' },
  td: { padding: '14px 16px', fontSize: 13, color: '#1D3557', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' },
  appName: { fontWeight: 700, color: '#1D3557' },
  appPhone: { fontSize: 12, color: '#888', marginTop: 2 },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 },
  avail: { fontSize: 12, color: '#555' },

  empty: { textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 15 },

  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 20 },
  modal: { background: '#fff', borderRadius: 16, width: 480, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 28 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalName: { fontSize: 20, fontWeight: 800, color: '#1D3557' },
  modalSub: { fontSize: 13, color: '#888', marginTop: 3 },

  section: { marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #f0f0f0' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  row: { display: 'flex', gap: 12, marginBottom: 6, fontSize: 14, color: '#333' },
  label: { fontWeight: 600, color: '#888', minWidth: 70 },
  text: { fontSize: 14, color: '#333', lineHeight: 1.6, margin: 0 },

  statusBtn: { padding: '6px 14px', borderRadius: 20, border: '1.5px solid #e0e0e0', background: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#555' },

  textarea: { width: '100%', borderRadius: 8, border: '1.5px solid #e0e0e0', padding: '10px 12px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },
  saveBtn: { marginTop: 8, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1D3557', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },

  metaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  metaText: { fontSize: 12, color: '#aaa' },
  deleteBtn: { padding: '6px 14px', borderRadius: 8, border: '1.5px solid #E63946', background: '#fff', color: '#E63946', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
};
