import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { failureMessage } from '../lib/apiError';
import { careersApi, jobOpeningsApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useAdminBadges } from '../hooks/useAdminBadges';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import CardSkeleton from '../components/CardSkeleton';
import { TEXT_MUTED, PRIMARY, INPUT } from '../lib/theme';
import { Page, PageHeader, Button, Tabs, Field } from '../components/kit';
import { Plus } from 'lucide-react';

const POSITION_LABELS: Record<string, string> = {
  CASHIER: 'Cashier',
  ASSISTANT_MANAGER: 'Assistant Manager',
  STORE_MANAGER: 'Store Manager',
  FOOD_PREP: 'Food Prep / Cook',
  NIGHT_SHIFT: 'Night Shift Attendant',
  FUEL_ATTENDANT: 'Fuel Attendant',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NEW:      { label: 'New',            color: PRIMARY, bg: '#eef2f7' },
  REVIEWED: { label: 'Reviewed',       color: '#4f6d8f', bg: '#eef2f7' },
  INTERVIEW:{ label: 'Interview',      color: '#8a5300', bg: '#fdf6e8' },
  HIRED:    { label: 'Hired',          color: '#17663a', bg: '#edf7f0' },
  REJECTED: { label: 'Rejected',       color: '#a51b28', bg: '#fdf2f2' },
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
  // Same "new" definition the sidebar's own Careers badge counts by, shown
  // here too so the Applications tab isn't a blank guess when that badge
  // pointed you at this page.
  // (2026-10-25) taken from the same badge source, not from the filtered list: filtered by Reviewed, the list has no new ones
  const { careersNewCount: newAppCount } = useAdminBadges();
  const filtered = activeTab !== 'ALL' || !!selectedPosition || !!selectedStore;
  const total: number = data?.data?.data?.total ?? 0;
  const stores = storesData?.data?.data ?? [];
  const openings: JobOpening[] = openingsData?.data?.data ?? [];

  const updateMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { status?: string; reviewNotes?: string } }) =>
      careersApi.update(id, updates),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['careers-applications'] });
      qc.invalidateQueries({ queryKey: ['admin-badge-counts'] });
      setSelectedApp(res.data.data);
      toast.success('Application updated');
    },
    onError: (err: any) => toast.error(failureMessage(err, 'Failed to update')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => careersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['careers-applications'] });
      qc.invalidateQueries({ queryKey: ['admin-badge-counts'] });
      setSelectedApp(null);
      toast.success('Application deleted');
    },
    onError: (err: any) => toast.error(failureMessage(err, 'Failed to delete')),
  });

  const createOpeningMut = useMutation({
    mutationFn: (data: object) => jobOpeningsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-openings-admin'] }); setShowOpeningForm(false); setOpeningForm(emptyForm); toast.success('Opening posted'); },
    onError: (err: any) => toast.error(failureMessage(err, 'Failed to post opening')),
  });

  const updateOpeningMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => jobOpeningsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-openings-admin'] }); setEditingOpening(null); setShowOpeningForm(false); toast.success('Opening updated'); },
    onError: (err: any) => toast.error(failureMessage(err, 'Failed to update opening')),
  });

  const deleteOpeningMut = useMutation({
    mutationFn: (id: string) => jobOpeningsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['job-openings-admin'] }); toast.success('Opening deleted'); },
    onError: (err: any) => toast.error(failureMessage(err, 'Failed to delete opening')),
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

  const savingOpening = createOpeningMut.isPending || updateOpeningMut.isPending;

  return (
    <Page>
      <ConfirmModal
        open={!!confirmDeleteOpening}
        title="Delete opening"
        message="This job opening will be permanently removed. Applicants already submitted won't be affected."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteOpening) deleteOpeningMut.mutate(confirmDeleteOpening); setConfirmDeleteOpening(null); }}
        onCancel={() => setConfirmDeleteOpening(null)}
      />
      <ConfirmModal
        open={!!confirmDeleteApp}
        title="Delete application"
        message="This application will be permanently deleted and cannot be recovered."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteApp) deleteMut.mutate(confirmDeleteApp); setConfirmDeleteApp(null); }}
        onCancel={() => setConfirmDeleteApp(null)}
      />
      {/* Header */}
      <PageHeader
        title="Careers"
        description={`${openings.length} opening${openings.length !== 1 ? 's' : ''} · ${total} application${total !== 1 ? 's' : ''}${filtered ? ' match the filters' : ''}`}
        actions={mainTab === 'openings' && (
          <Button variant="primary" icon={<Plus />} onClick={() => { setEditingOpening(null); setOpeningForm(emptyForm); setShowOpeningForm(true); }}>
            Post opening
          </Button>
        )}
      />
      <Tabs
        asButtons
        ariaLabel="Careers view"
        value={mainTab}
        onChange={setMainTab}
        tabs={[
          { value: 'openings', label: 'Job openings' },
          { value: 'applications', label: 'Applications', count: newAppCount > 0 ? newAppCount : undefined },
        ]}
      />

      {/* ── OPENINGS PANEL ── */}
      {mainTab === 'openings' && (
        openingsLoading ? <CardSkeleton count={3} /> :
        openings.length === 0 ? <div style={s.empty}>No openings posted yet. Click "Post opening" to add one.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {openings.map(op => (
              <div key={op.id} style={{ ...s.opCard, opacity: op.isActive ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={s.opTitle}>{op.title}</span>
                      <span style={{ ...s.badge, ...(op.isActive ? { color: '#17663a', background: '#edf7f0' } : { color: TEXT_MUTED, background: '#f7f8fa' }) }}>
                        {op.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={s.opMeta}>
                      {POSITION_LABELS[op.position] ?? op.position}
                      {op.store ? ` · ${op.store.name}, ${op.store.city}` : ' · Any location'}
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
          <option value="">All positions</option>
          {Object.entries(POSITION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select style={s.select} value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
          <option value="">All stores</option>
          {stores.map((st: any) => (
            <option key={st.id} value={st.id}>{st.name}, {st.city}</option>
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
                <TableHead style={s.th}>Preferred store</TableHead>
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
                      <button type="button" onClick={(e) => { e.stopPropagation(); openApp(app); }} style={{ ...s.appName, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', fontWeight: 700 }} aria-label={`Open the application from ${app.name}`}>{app.name}</button>
                      <div style={s.appPhone}>{app.phone}</div>
                    </TableCell>
                    <TableCell style={s.td}>{POSITION_LABELS[app.position] ?? app.position}</TableCell>
                    <TableCell style={s.td}>{app.store ? `${app.store.name}, ${app.store.city}` : 'Any'}</TableCell>
                    <TableCell style={s.td}>
                      <span style={s.avail}>{app.availability.type === 'FULL_TIME' ? 'Full-time' : 'Part-time'}</span>
                    </TableCell>
                    <TableCell style={s.td}>
                      <span style={{ ...s.badge, color: sc.color, background: sc.bg }}>{sc.label}</span>
                    </TableCell>
                    <TableCell style={{ ...s.td, color: TEXT_MUTED, fontSize: 14 }}>{timeAgo(app.createdAt)}</TableCell>
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
        <Modal title={editingOpening ? 'Edit opening' : 'Post job opening'} onClose={() => setShowOpeningForm(false)} busy={savingOpening} maxWidth={520}>
          <div style={s.form}>
            <Field label="Job title" htmlFor="opening-title" required>
              <input id="opening-title" className="ui-input" style={INPUT} value={openingForm.title} onChange={e => setOpeningForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Cashier needed, north location" />
            </Field>

            <div style={s.pair}>
              <Field label="Position" htmlFor="opening-position" required>
                <select id="opening-position" className="ui-input" style={INPUT} value={openingForm.position} onChange={e => setOpeningForm(f => ({ ...f, position: e.target.value }))}>
                  {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Employment type" htmlFor="opening-type">
                <select id="opening-type" className="ui-input" style={INPUT} value={openingForm.employType} onChange={e => setOpeningForm(f => ({ ...f, employType: e.target.value }))}>
                  <option value="BOTH">Full-time or part-time</option>
                  <option value="FULL_TIME">Full-time only</option>
                  <option value="PART_TIME">Part-time only</option>
                </select>
              </Field>
            </div>

            <div style={s.pair}>
              <Field label="Store (optional)" htmlFor="opening-store">
                <select id="opening-store" className="ui-input" style={INPUT} value={openingForm.storeId} onChange={e => setOpeningForm(f => ({ ...f, storeId: e.target.value }))}>
                  <option value="">Any location</option>
                  {stores.map((st: any) => <option key={st.id} value={st.id}>{st.name}, {st.city}</option>)}
                </select>
              </Field>
              <Field label="Pay range (optional)" htmlFor="opening-pay">
                <input id="opening-pay" className="ui-input" style={INPUT} value={openingForm.payRange} onChange={e => setOpeningForm(f => ({ ...f, payRange: e.target.value }))} placeholder="e.g. $15 to $18/hr" />
              </Field>
            </div>

            <Field label="Description (optional)" htmlFor="opening-description">
              <textarea id="opening-description" className="ui-input" style={{ ...INPUT, minHeight: 80, resize: 'vertical' }} value={openingForm.description} onChange={e => setOpeningForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the role, responsibilities…" />
            </Field>

            <Field label="Requirements (optional)" htmlFor="opening-requirements">
              <textarea id="opening-requirements" className="ui-input" style={{ ...INPUT, minHeight: 60, resize: 'vertical' }} value={openingForm.requirements} onChange={e => setOpeningForm(f => ({ ...f, requirements: e.target.value }))} placeholder="Experience, certifications, etc." />
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#111827' }}>
              <input type="checkbox" checked={openingForm.isActive} onChange={e => setOpeningForm(f => ({ ...f, isActive: e.target.checked }))} />
              Active (visible to customers)
            </label>

            <div style={s.footer}>
              <Button onClick={() => setShowOpeningForm(false)} disabled={savingOpening}>Cancel</Button>
              <Button variant="primary" onClick={submitOpeningForm} disabled={!openingForm.title || savingOpening}>
                {savingOpening ? 'Saving…' : editingOpening ? 'Save changes' : 'Post opening'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {selectedApp && (() => {
        const app = selectedApp;
        const sc = STATUS_CONFIG[app.status];
        const avail = app.availability;
        return (
          <Modal
            title={app.name}
            subtitle={<>{POSITION_LABELS[app.position] ?? app.position} <span style={{ ...s.badge, color: sc.color, background: sc.bg, marginLeft: 6 }}>{sc.label}</span></>}
            onClose={() => setSelectedApp(null)}
            busy={updateMut.isPending || deleteMut.isPending}
            maxWidth={520}
          >
            <div>
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
                  <span>{app.store ? `${app.store.name}, ${app.store.city}` : 'Any location'}</span>
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
                  <div style={s.sectionTitle}>Cover note</div>
                  <p style={s.text}>{app.message}</p>
                </div>
              )}

              {/* Status Update */}
              <div style={s.section}>
                <div style={s.sectionTitle} id="app-status-label">Update status</div>
                <div role="group" aria-labelledby="app-status-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                <label htmlFor="app-notes" style={{ ...s.sectionTitle, display: 'block' }}>Internal notes</label>
                <textarea
                  id="app-notes"
                  className="ui-input"
                  style={s.textarea}
                  rows={3}
                  placeholder="Add notes visible only to admins…"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                />
                <Button variant="primary" size="sm" style={{ marginTop: 8 }}
                  onClick={() => updateMut.mutate({ id: app.id, updates: { reviewNotes: editNotes } })}>
                  Save notes
                </Button>
              </div>

              {/* Applied info */}
              <div style={s.metaRow}>
                <span style={s.metaText}>Applied {new Date(app.createdAt).toLocaleString()}</span>
                {isDevAdmin && (
                  <Button variant="danger" size="sm"
                    onClick={() => setConfirmDeleteApp(app.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}
    </Page>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { margin: 0, fontSize: 26, fontWeight: 700, color: PRIMARY },
  subtitle: { margin: '4px 0 0', fontSize: 14, color: TEXT_MUTED },

  tabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: { padding: '7px 18px', borderRadius: 20, border: '1.5px solid #e4e7ec', background: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#374151' },
  tabActive: { background: PRIMARY, color: '#fff', border: '1.5px solid #1D3557' },
  tabBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, borderRadius: 9, padding: '0 4px', marginLeft: 6,
    background: '#c42130', color: '#fff', fontSize: 12, fontWeight: 700,
  },

  filters: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  select: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e4e7ec', fontSize: 15, background: '#fff', cursor: 'pointer', minWidth: 180 },

  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid #e4e7ec', background: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f7f8fa' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 14, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e4e7ec' },
  tr: { cursor: 'pointer', transition: 'background 0.15s' },
  td: { padding: '14px 16px', fontSize: 15, color: PRIMARY, borderBottom: '1px solid #e4e7ec', verticalAlign: 'middle' },
  appName: { fontWeight: 700, color: PRIMARY },
  appPhone: { fontSize: 14, color: TEXT_MUTED, marginTop: 2 },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 14, fontWeight: 700 },
  avail: { fontSize: 14, color: '#374151' },

  empty: { textAlign: 'center', padding: '60px 0', color: '#5a6472', fontSize: 15 },

  // Application details
  section: { marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #e4e7ec' },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  row: { display: 'flex', gap: 12, marginBottom: 6, fontSize: 14, color: '#111827' },
  rowLabel: { fontWeight: 600, color: TEXT_MUTED, minWidth: 70 },
  text: { fontSize: 14, color: '#111827', lineHeight: 1.6, margin: 0 },

  statusBtn: { padding: '6px 14px', borderRadius: 20, border: '1.5px solid #e4e7ec', background: '#f7f8fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151' },

  textarea: { width: '100%', borderRadius: 8, border: '1.5px solid #e4e7ec', padding: '10px 12px', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },

  metaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  metaText: { fontSize: 14, color: '#5a6472' },
  deleteBtn: { padding: '6px 14px', borderRadius: 8, border: '1.5px solid #c42130', background: '#fff', color: '#c42130', fontSize: 14, fontWeight: 700, cursor: 'pointer' },

  // Openings
  postBtn: { padding: '10px 20px', borderRadius: 10, border: 'none', background: '#1D3557', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  opCard: { background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e4e7ec' },
  opTitle: { fontSize: 17, fontWeight: 700, color: PRIMARY },
  opMeta: { fontSize: 14, color: '#5a6472', margin: '4px 0 6px' },
  opDesc: { fontSize: 14, color: '#374151', lineHeight: 1.5 },
  editBtn: { padding: '6px 14px', borderRadius: 8, border: '1.5px solid #1D3557', background: '#fff', color: PRIMARY, fontSize: 14, fontWeight: 700, cursor: 'pointer' },

  // Form
  form: { display: 'grid', gap: 12 },
  pair: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },   // side by side, one column on a phone
  footer: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
};
