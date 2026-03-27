import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { bannersApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Banners() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [storeTarget, setStoreTarget] = useState<'ALL_STORES' | 'SPECIFIC_STORE'>('ALL_STORES');
  const [storeId, setStoreId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['banners'],
    queryFn: () => bannersApi.getActive(),
  });

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });
  const stores: any[] = storesData?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => bannersApi.create(fd),
    onSuccess: () => {
      toast.success('Banner created');
      setShowForm(false);
      setTitle(''); setStoreTarget('ALL_STORES'); setStoreId(''); setImageFile(null);
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['banners'] });
    },
    onError: () => toast.error('Failed to create banner'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bannersApi.delete(id),
    onSuccess: () => { toast.success('Banner deleted'); qc.invalidateQueries({ queryKey: ['banners'] }); },
    onError: () => toast.error('Failed to delete banner'),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!imageFile) { toast.error('Image is required for banners'); return; }
    if (storeTarget === 'SPECIFIC_STORE' && !storeId) { toast.error('Select a store'); return; }
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('image', imageFile);
    if (storeTarget === 'SPECIFIC_STORE' && storeId) fd.append('storeId', storeId);
    createMutation.mutate(fd);
  }

  const banners = data?.data?.data || [];

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Banners</h1>
          <p style={s.sub}>Promotional images shown in the customer app — target all stores or one location</p>
        </div>
        <button style={s.addBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Banner'}
        </button>
      </div>

      {showForm && (
        <form style={s.form} onSubmit={handleCreate}>
          <h3 style={{ margin: '0 0 16px', color: '#1D3557' }}>Upload Banner</h3>

          <label style={s.label}>Title *</label>
          <input style={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. March Fuel Savings" />

          {isStoreManager ? (
            <div style={{ padding: '8px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 13, color: '#1D3557', fontWeight: 600 }}>
              📍 This banner will appear for your store only
            </div>
          ) : (
            <>
              <label style={s.label}>Apply To</label>
              <select style={s.input} value={storeTarget} onChange={(e) => { setStoreTarget(e.target.value as any); setStoreId(''); }}>
                <option value="ALL_STORES">🌐 All 14 Stores</option>
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

          <label style={s.label}>Banner Image * (recommended 1200×400px)</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} style={s.input} required />

          <button style={s.saveBtn} type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Uploading...' : 'Upload Banner'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div style={s.empty}>Loading...</div>
      ) : banners.length === 0 ? (
        <div style={s.empty}>No active banners. Upload one above.</div>
      ) : (
        <div style={s.list}>
          {banners.map((banner: any) => (
            <div key={banner.id} style={s.card}>
              <img src={banner.imageUrl} alt={banner.title} style={s.img} />
              <div style={s.cardInfo}>
                <h3 style={s.cardTitle}>{banner.title}</h3>
                <span style={banner.storeId ? s.tagStore : s.tagAll}>
                  {banner.storeId ? '📍 Specific Store' : '🌐 All Stores'}
                </span>
                <p style={s.cardDate}>Added {new Date(banner.createdAt).toLocaleDateString()}</p>
              </div>
              <button style={s.deleteBtn} onClick={() => deleteMutation.mutate(banner.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#9ca3af', marginTop: 4, fontSize: 13 },
  addBtn: { background: '#E63946', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13 },

  form: {
    background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 32,
    boxShadow: '0 4px 20px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: 12,
    maxWidth: 560, borderWidth: '1px', borderStyle: 'solid', borderColor: '#f0f1f2',
  },
  label: { fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { padding: '10px 14px', borderRadius: 9, borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', fontSize: 14, width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  saveBtn: { background: '#0f5132', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, cursor: 'pointer', marginTop: 4, fontSize: 14 },

  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    background: '#fff', borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 20, padding: '14px 18px',
  },
  img: { width: 220, height: 90, objectFit: 'cover' as const, borderRadius: 10, flexShrink: 0 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 8px' },
  cardDate: { color: '#9ca3af', fontSize: 12, margin: '6px 0 0', fontWeight: 600 },
  tagAll: { display: 'inline-block', background: '#eff6ff', color: '#1D3557', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 },
  tagStore: { display: 'inline-block', background: '#fffbeb', color: '#b45309', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 },
  deleteBtn: { background: '#fff1f2', color: '#E63946', borderWidth: '1px', borderStyle: 'solid', borderColor: '#fecaca', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', flexShrink: 0, fontWeight: 600, fontSize: 13 },
  empty: { color: '#9ca3af', textAlign: 'center', padding: 60, fontSize: 14 },
};
