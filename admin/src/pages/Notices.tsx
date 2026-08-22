import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { noticesApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function oneWeekOutStr() { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

function noticeStatus(notice: any): { label: string; color: string; bg: string } {
  if (!notice.isActive) return { label: 'Deactivated', color: '#6c757d', bg: '#f1f3f5' };
  if (new Date(notice.endDate) < new Date()) return { label: 'Expired', color: '#6c757d', bg: '#f1f3f5' };
  return { label: 'Active', color: '#16a34a', bg: '#f0fdf4' };
}

export default function Notices() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const ownStoreIds: string[] = user?.storeIds || [];
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [storeTarget, setStoreTarget] = useState<'ALL_STORES' | 'SPECIFIC_STORE'>('ALL_STORES');
  const [storeId, setStoreId] = useState('');
  const [endDate, setEndDate] = useState(oneWeekOutStr());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-notices'],
    queryFn: () => noticesApi.getAll(),
  });

  const { data: storesData } = useQuery({ queryKey: ['accessible-stores'], queryFn: () => storesApi.getAccessible() });
  const stores: any[] = storesData?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: { title: string; body: string; storeId?: string; endDate: string }) => noticesApi.create(data),
    onSuccess: () => {
      toast.success('Notice posted');
      resetForm();
      qc.invalidateQueries({ queryKey: ['admin-notices'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to post notice'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => noticesApi.deactivate(id),
    onSuccess: () => { toast.success('Notice deactivated'); qc.invalidateQueries({ queryKey: ['admin-notices'] }); },
    onError: () => toast.error('Failed to deactivate notice'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => noticesApi.delete(id),
    onSuccess: () => { toast.success('Notice deleted'); qc.invalidateQueries({ queryKey: ['admin-notices'] }); },
    onError: () => toast.error('Failed to delete notice'),
  });

  function resetForm() {
    setShowForm(false);
    setTitle(''); setBody(''); setStoreTarget('ALL_STORES'); setStoreId(''); setEndDate(oneWeekOutStr());
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!body.trim()) { toast.error('Notice text is required'); return; }
    if (!endDate) { toast.error('End date is required'); return; }
    if (!isStoreManager && storeTarget === 'SPECIFIC_STORE' && !storeId) { toast.error('Select a store'); return; }
    if (isStoreManager && ownStoreIds.length > 1 && !storeId) { toast.error('Select which of your stores'); return; }

    createMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      endDate: new Date(endDate + 'T23:59:59').toISOString(),
      ...(isStoreManager
        ? (ownStoreIds.length > 1 && storeId ? { storeId } : {})
        : (storeTarget === 'SPECIFIC_STORE' && storeId ? { storeId } : {})),
    });
  }

  const notices: any[] = data?.data?.data || [];
  const storeMap: Record<string, string> = Object.fromEntries(stores.map((st: any) => [st.id, st.name]));

  if (isError) return <div style={s.container}><ErrorState message="Failed to load notices." onRetry={refetch} /></div>;

  return (
    <div style={s.container}>
      <ConfirmModal
        open={!!confirmDeactivateId}
        title="Deactivate Notice"
        message="Employees will stop seeing this notice in chat immediately. This cannot be undone."
        confirmLabel="Deactivate"
        danger
        onConfirm={() => { if (confirmDeactivateId) deactivateMutation.mutate(confirmDeactivateId); setConfirmDeactivateId(null); }}
        onCancel={() => setConfirmDeactivateId(null)}
      />
      <ConfirmModal
        open={!!confirmDeleteId}
        title="Delete Notice"
        message="This will permanently remove the notice from the list. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <div style={s.header}>
        <div>
          <h1 style={s.title}>📌 Important Notices</h1>
          <p style={s.sub}>Posted as a pinned banner at the top of store chat — for time-sensitive HQ announcements</p>
        </div>
        <button style={s.addBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Notice'}
        </button>
      </div>

      {showForm && (
        <form style={s.form} onSubmit={handleCreate}>
          <h3 style={{ margin: '0 0 16px', color: '#1D3557' }}>Post a Notice</h3>

          <label style={s.label}>Title *</label>
          <input style={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Health Inspection Tomorrow" maxLength={100} />

          <label style={s.label}>Notice Text *</label>
          <textarea style={{ ...s.input, height: 90, resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What employees need to know..." maxLength={500} />

          <label style={s.label}>Expires *</label>
          <input style={{ ...s.input, maxWidth: 200 }} type="date" value={endDate} min={todayStr()} onChange={(e) => setEndDate(e.target.value)} />

          {isStoreManager && ownStoreIds.length <= 1 ? (
            <div style={{ padding: '8px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 15, color: '#1D3557', fontWeight: 600 }}>
              📍 This notice will appear for your store only
            </div>
          ) : isStoreManager ? (
            <>
              <label style={s.label}>Post To *</label>
              <select style={s.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">-- Choose your store --</option>
                {stores.map((store: any) => (
                  <option key={store.id} value={store.id}>{store.name}{store.city ? ` — ${store.city}` : ''}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label style={s.label}>Apply To</label>
              <select style={s.input} value={storeTarget} onChange={(e) => { setStoreTarget(e.target.value as any); setStoreId(''); }}>
                <option value="ALL_STORES">🌐 All {stores.length || ''} Stores</option>
                <option value="SPECIFIC_STORE">📍 Specific Store Only</option>
              </select>
              {storeTarget === 'SPECIFIC_STORE' && (
                <>
                  <label style={s.label}>Select Store *</label>
                  <select style={s.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">-- Choose a store --</option>
                    {stores.map((store: any) => (
                      <option key={store.id} value={store.id}>{store.name} — {store.city}, {store.state}</option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}

          <button style={s.saveBtn} type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Posting...' : 'Post Notice'}
          </button>
        </form>
      )}

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : notices.length === 0 ? (
        <div style={s.empty}>No notices posted yet.</div>
      ) : (
        <div style={s.list}>
          {notices.map((notice: any) => {
            const status = noticeStatus(notice);
            return (
              <div key={notice.id} style={s.card}>
                <div style={s.cardInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h3 style={s.cardTitle}>{notice.title}</h3>
                    <span style={{ ...s.tagStatus, color: status.color, background: status.bg }}>{status.label}</span>
                  </div>
                  <p style={s.cardBody}>{notice.body}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={notice.storeId ? s.tagStore : s.tagAll}>
                      {notice.storeId ? `📍 ${storeMap[notice.storeId] || 'Specific Store'}` : '🌐 All Stores'}
                    </span>
                    <span style={s.tagDate}>Expires {fmtDate(notice.endDate)}</span>
                  </div>
                </div>
                {(!isStoreManager || (notice.storeId && ownStoreIds.includes(notice.storeId))) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {status.label === 'Active' && (
                      <button style={s.deactivateBtn} onClick={() => setConfirmDeactivateId(notice.id)}>Deactivate</button>
                    )}
                    <button style={s.deleteBtn} onClick={() => setConfirmDeleteId(notice.id)}>Delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#5a6472', marginTop: 4, fontSize: 15 },
  addBtn: { background: '#E63946', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 15 },

  form: {
    background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 32,
    boxShadow: '0 4px 20px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: 12,
    borderWidth: '1px', borderStyle: 'solid', borderColor: '#f0f1f2',
  },
  label: { fontWeight: 700, fontSize: 14, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { padding: '10px 14px', borderRadius: 9, borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', fontSize: 14, width: '100%', boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit' },
  saveBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, cursor: 'pointer', marginTop: 4, fontSize: 14 },

  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    background: '#fff', borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 20, padding: '18px 20px',
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 },
  cardBody: { fontSize: 14, color: '#374151', margin: '0 0 4px', lineHeight: 1.5 },
  tagStatus: { display: 'inline-block', borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 },
  tagAll: { display: 'inline-block', background: '#eff6ff', color: '#1D3557', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  tagStore: { display: 'inline-block', background: '#fffbeb', color: '#b45309', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  tagDate: { display: 'inline-block', background: '#f8f9fa', color: '#5a6472', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 600 },
  deactivateBtn: { background: '#fffbeb', color: '#b45309', borderWidth: '1px', borderStyle: 'solid', borderColor: '#fde68a', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', flexShrink: 0, fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' },
  deleteBtn: { background: '#fff1f2', color: '#E63946', borderWidth: '1px', borderStyle: 'solid', borderColor: '#fecaca', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', flexShrink: 0, fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' },
  empty: { color: '#5a6472', textAlign: 'center', padding: 60, fontSize: 14 },
};
