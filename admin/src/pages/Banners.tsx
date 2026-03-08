import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { bannersApi } from '../services/api';

export default function Banners() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['banners'],
    queryFn: () => bannersApi.getActive(),
  });

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => bannersApi.create(fd),
    onSuccess: () => {
      toast.success('Banner created');
      setShowForm(false);
      setTitle(''); setImageFile(null);
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
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('image', imageFile);
    createMutation.mutate(fd);
  }

  const banners = data?.data?.data || [];

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🖼️ Banners</h1>
          <p style={s.sub}>Promotional images shown in the customer app</p>
        </div>
        <button style={s.addBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Banner'}
        </button>
      </div>

      {showForm && (
        <form style={s.form} onSubmit={handleCreate}>
          <h3 style={{ margin: '0 0 16px' }}>Upload Banner</h3>
          <label style={s.label}>Title *</label>
          <input style={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. March Fuel Savings" />
          <label style={s.label}>Banner Image * (recommended 1200×400)</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} style={s.input} required />
          <button style={s.saveBtn} type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Uploading...' : 'Upload Banner'}
          </button>
        </form>
      )}

      {isLoading ? <div style={s.empty}>Loading...</div> : banners.length === 0 ? (
        <div style={s.empty}>No active banners. Upload one above.</div>
      ) : (
        <div style={s.list}>
          {banners.map((banner: any) => (
            <div key={banner.id} style={s.card}>
              <img src={banner.imageUrl} alt={banner.title} style={s.img} />
              <div style={s.cardInfo}>
                <h3 style={s.cardTitle}>{banner.title}</h3>
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4 },
  addBtn: { background: '#E63946', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' },
  form: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 },
  label: { fontWeight: 600, fontSize: 13, color: '#212529' },
  input: { padding: '10px 14px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15, width: '100%', boxSizing: 'border-box' as const },
  saveBtn: { background: '#2DC653', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 20, padding: 16 },
  img: { width: 200, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#1D3557', margin: 0 },
  cardDate: { color: '#6c757d', fontSize: 13, margin: '4px 0 0' },
  deleteBtn: { background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', color: '#6c757d', flexShrink: 0 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
};
