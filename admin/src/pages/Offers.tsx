import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { offersApi } from '../services/api';

export default function Offers() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bonusRate, setBonusRate] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: () => offersApi.getActive(),
  });

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => offersApi.create(fd),
    onSuccess: () => {
      toast.success('Offer created');
      setShowForm(false);
      setTitle(''); setDescription(''); setBonusRate(''); setImageFile(null);
      qc.invalidateQueries({ queryKey: ['offers'] });
    },
    onError: () => toast.error('Failed to create offer'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => offersApi.delete(id),
    onSuccess: () => { toast.success('Offer deleted'); qc.invalidateQueries({ queryKey: ['offers'] }); },
    onError: () => toast.error('Failed to delete offer'),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', description.trim());
    if (bonusRate) fd.append('bonusRate', (parseFloat(bonusRate) / 100).toString());
    if (imageFile) fd.append('image', imageFile);
    createMutation.mutate(fd);
  }

  const offers = data?.data?.data || [];

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>📢 Offers</h1>
          <p style={s.sub}>Promotions visible to all customers</p>
        </div>
        <button style={s.addBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Offer'}
        </button>
      </div>

      {showForm && (
        <form style={s.form} onSubmit={handleCreate}>
          <h3 style={{ margin: '0 0 16px' }}>Create Offer</h3>
          <label style={s.label}>Title *</label>
          <input style={s.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Gas Deal" />
          <label style={s.label}>Description</label>
          <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details..." />
          <label style={s.label}>Bonus Cashback % (optional)</label>
          <input style={s.input} type="number" min="0" max="100" value={bonusRate} onChange={(e) => setBonusRate(e.target.value)} placeholder="e.g. 10 for 10% extra" />
          <label style={s.label}>Image (optional)</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} style={s.input} />
          <button style={s.saveBtn} type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Offer'}
          </button>
        </form>
      )}

      {isLoading ? <div style={s.empty}>Loading...</div> : offers.length === 0 ? (
        <div style={s.empty}>No active offers. Create one above.</div>
      ) : (
        <div style={s.grid}>
          {offers.map((offer: any) => (
            <div key={offer.id} style={s.card}>
              {offer.imageUrl && <img src={offer.imageUrl} alt={offer.title} style={s.img} />}
              <div style={s.cardBody}>
                <h3 style={s.cardTitle}>{offer.title}</h3>
                {offer.description && <p style={s.cardDesc}>{offer.description}</p>}
                {offer.bonusRate && (
                  <span style={s.badge}>🔥 {Math.round(offer.bonusRate * 100)}% bonus cashback</span>
                )}
                <button style={s.deleteBtn} onClick={() => deleteMutation.mutate(offer.id)}>Delete</button>
              </div>
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 },
  card: { background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  img: { width: '100%', height: 160, objectFit: 'cover' },
  cardBody: { padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#1D3557', margin: '0 0 8px' },
  cardDesc: { color: '#6c757d', fontSize: 14, margin: '0 0 8px' },
  badge: { display: 'inline-block', background: '#E63946', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  deleteBtn: { display: 'block', marginTop: 12, background: 'none', border: '1px solid #dee2e6', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', color: '#6c757d', fontSize: 13 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
};
