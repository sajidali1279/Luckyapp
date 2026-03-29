import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { catalogApi } from '../services/api';

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  pointsCost: number;
  isActive: boolean;
  createdAt: string;
}

function CatalogModal({
  item,
  onClose,
  onSave,
}: {
  item?: CatalogItem | null;
  onClose: () => void;
  onSave: (data: { name: string; description: string; pointsCost: number; isActive: boolean }) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [pointsCost, setPointsCost] = useState(item ? String(item.pointsCost) : '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pts = parseInt(pointsCost, 10);
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (isNaN(pts) || pts <= 0) { toast.error('Enter a valid points cost'); return; }
    onSave({ name: name.trim(), description: description.trim(), pointsCost: pts, isActive });
  }

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        <div style={m.header}>
          <h2 style={m.title}>{item ? 'Edit Catalog Item' : 'New Catalog Item'}</h2>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={m.form}>
          <label style={m.label}>Item Name *</label>
          <input
            style={m.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Free Fountain Drink"
            autoFocus
          />

          <label style={m.label}>Description (optional)</label>
          <input
            style={m.input}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Any size fountain drink"
          />

          <label style={m.label}>Points Cost *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              style={{ ...m.input, flex: 1 }}
              value={pointsCost}
              onChange={e => setPointsCost(e.target.value)}
              placeholder="e.g. 400"
              type="number"
              min={1}
            />
            <span style={m.hint}>pts = ${(parseInt(pointsCost || '0') / 100).toFixed(2)} value</span>
          </div>

          <label style={m.checkRow}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16, marginRight: 8, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, color: '#333' }}>Active (visible to customers)</span>
          </label>

          <div style={m.actions}>
            <button type="button" style={m.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={m.saveBtn}>{item ? 'Save Changes' : 'Create Item'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const qc = useQueryClient();
  const [modalItem, setModalItem] = useState<CatalogItem | null | 'new'>('new' as any);
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog-all'],
    queryFn: () => catalogApi.getAll(),
  });
  const items: CatalogItem[] = data?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (d: object) => catalogApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-all'] }); toast.success('Item created'); setShowModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & object) => catalogApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-all'] }); toast.success('Item updated'); setShowModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-all'] }); toast.success('Item deleted'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete'),
  });

  function openCreate() { setModalItem(null); setShowModal(true); }
  function openEdit(item: CatalogItem) { setModalItem(item); setShowModal(true); }
  function handleDelete(item: CatalogItem) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(item.id);
  }
  function handleSave(formData: { name: string; description: string; pointsCost: number; isActive: boolean }) {
    if (modalItem) {
      updateMutation.mutate({ id: (modalItem as CatalogItem).id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div style={s.page}>
      <div style={s.inner}>
        {/* Header */}
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>🎁 Redemption Catalog</h1>
            <p style={s.pageSub}>Fixed reward items customers redeem with their points</p>
          </div>
          <button style={s.createBtn} onClick={openCreate}>+ New Item</button>
        </div>

        {/* Legend */}
        <div style={s.legendCard}>
          <span style={s.legendIcon}>ℹ️</span>
          <span style={s.legendText}>
            100 points = $1.00 value. Customers earn 5 pts per $1 spent.
            Items appear in the customer app — cashiers process redemptions by scanning the customer's QR code.
          </span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={s.loadingBox}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={s.emptyBox}>
            <div style={s.emptyIcon}>🏷️</div>
            <div style={s.emptyTitle}>No catalog items yet</div>
            <div style={s.emptySub}>Create your first reward item to get started</div>
            <button style={s.createBtn} onClick={openCreate}>+ Create First Item</button>
          </div>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Item', 'Description', 'Points Cost', 'Value', 'Status', 'Actions'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                    <td style={s.td}>
                      <span style={s.itemName}>{item.name}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.itemDesc}>{item.description || '—'}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.ptsBadge}>{item.pointsCost.toLocaleString()} pts</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.valueBadge}>${(item.pointsCost / 100).toFixed(2)}</span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.statusBadge, ...(item.isActive ? s.statusActive : s.statusInactive) }}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={s.actions}>
                        <button style={s.editBtn} onClick={() => openEdit(item)}>Edit</button>
                        <button
                          style={s.deleteBtn}
                          onClick={() => handleDelete(item)}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <CatalogModal
          item={modalItem as CatalogItem | null}
          onClose={() => !isMutating && setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6fb', padding: '32px 0' },
  inner: { maxWidth: 900, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 28, fontWeight: 900, color: '#1D3557', margin: 0 },
  pageSub: { color: '#666', marginTop: 4, fontSize: 14 },
  createBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 20px', cursor: 'pointer',
    fontSize: 14, fontWeight: 700,
  },

  legendCard: {
    background: '#EBF5FF', border: '1px solid #bee3f8', borderRadius: 12,
    padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
  },
  legendIcon: { fontSize: 18, flexShrink: 0 },
  legendText: { fontSize: 13, color: '#2c5282', lineHeight: 1.6 },

  loadingBox: { textAlign: 'center', padding: 40, color: '#888', fontSize: 16 },
  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557' },
  emptySub: { color: '#888', fontSize: 14 },

  tableWrap: { background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#888', background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '14px 16px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle' },

  itemName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  itemDesc: { fontSize: 13, color: '#888' },
  ptsBadge: {
    background: '#1D3557', color: '#fff',
    borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 700,
  },
  valueBadge: {
    background: '#d4edda', color: '#155724',
    borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 700,
  },
  statusBadge: { borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  statusActive: { background: '#d4edda', color: '#155724' },
  statusInactive: { background: '#f8d7da', color: '#721c24' },

  actions: { display: 'flex', gap: 8 },
  editBtn: {
    background: '#e8f0fe', color: '#1D3557', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  deleteBtn: {
    background: '#fff0f0', color: '#c53030', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
};

const m: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #eee',
  },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#1D3557' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: '#888', lineHeight: 1,
  },
  form: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  label: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: -8 },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none',
    transition: 'border-color 0.15s',
  },
  hint: { fontSize: 13, color: '#888', whiteSpace: 'nowrap' },
  checkRow: { display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  cancelBtn: {
    background: '#f4f4f4', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444',
  },
  saveBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
};
