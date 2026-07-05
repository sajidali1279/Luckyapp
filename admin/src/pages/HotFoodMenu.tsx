import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { hotFoodApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Flame, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Store { id: string; name: string }
interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  isAvailable: boolean;
  estimatedMinutes?: number;
  storeId: string | null;
  store?: { id: string; name: string } | null;
  imageUrl?: string;
}

// ─── Item Form Modal ───────────────────────────────────────────────────────────

function ItemModal({
  item, stores, defaultStoreId, onClose, onSaved,
}: {
  item: MenuItem | null;
  stores: Store[];
  defaultStoreId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,       setName]       = useState(item?.name        ?? '');
  const [desc,       setDesc]       = useState(item?.description ?? '');
  const [price,      setPrice]      = useState(item ? String(item.price) : '');
  const [storeId,    setStoreId]    = useState(item?.storeId ?? defaultStoreId ?? '');
  const [estMins,    setEstMins]    = useState(item?.estimatedMinutes ? String(item.estimatedMinutes) : '');
  const [available,  setAvailable]  = useState(item?.isAvailable ?? true);
  const [saving,     setSaving]     = useState(false);

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) { toast.error('Enter a valid price'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: desc.trim() || undefined,
        price: parsedPrice,
        storeId: storeId || undefined,
        estimatedMinutes: estMins ? parseInt(estMins) : undefined,
        isAvailable: available,
      };
      if (item) {
        await hotFoodApi.updateItem(item.id, payload);
        toast.success('Item updated');
      } else {
        await hotFoodApi.createItem(payload);
        toast.success('Item created');
      }
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.panel} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <span style={modalStyles.headerTitle}>{item ? 'Edit Item' : 'Add Menu Item'}</span>
          <button style={modalStyles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={modalStyles.body}>
          <label style={f.label}>Name *</label>
          <input style={f.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hot Dog" />

          <label style={f.label}>Description</label>
          <textarea style={{ ...f.input, minHeight: 64, resize: 'vertical' }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description (optional)" />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={f.label}>Price ($) *</label>
              <input style={f.input} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="2.99" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={f.label}>Est. wait (mins)</label>
              <input style={f.input} type="number" min="1" value={estMins} onChange={e => setEstMins(e.target.value)} placeholder="5" />
            </div>
          </div>

          <label style={f.label}>Store</label>
          <select style={f.input} value={storeId} onChange={e => setStoreId(e.target.value)}>
            <option value="">All eligible stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <label style={{ ...f.label, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <span>Available now</span>
            <button
              type="button"
              onClick={() => setAvailable(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: available ? '#16A34A' : '#94A3B8' }}
            >
              {available
                ? <ToggleRight size={28} />
                : <ToggleLeft size={28} />}
            </button>
          </label>
        </div>

        <div style={modalStyles.footer}>
          <button style={f.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={{ ...f.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HotFoodMenu() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isManager = user?.role === 'STORE_MANAGER';
  const canWrite = user?.role === 'DEV_ADMIN' || user?.role === 'SUPER_ADMIN';
  const storeId = isManager ? user?.storeIds?.[0] : undefined;

  const [filterStore, setFilterStore] = useState(storeId ?? '');
  const [editItem, setEditItem]       = useState<MenuItem | null>(null);
  const [showModal, setShowModal]     = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [togglingId, setTogglingId]   = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: storesApi.getAll,
    enabled: !isManager,
  });
  const stores: Store[] = storesData?.data?.data ?? [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hot-food-menu-admin', filterStore],
    queryFn: () => hotFoodApi.getMenu(filterStore || undefined),
    refetchInterval: 60_000,
  });
  const items: MenuItem[] = data?.data?.data ?? [];

  async function handleToggle(item: MenuItem) {
    if (togglingId) return;
    setTogglingId(item.id);
    try {
      await hotFoodApi.updateItem(item.id, { isAvailable: !item.isAvailable });
      qc.invalidateQueries({ queryKey: ['hot-food-menu-admin'] });
      toast.success(item.isAvailable ? 'Marked unavailable' : 'Marked available');
    } catch {
      toast.error('Failed to update');
    } finally {
      setTogglingId(null);
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => hotFoodApi.deleteItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hot-food-menu-admin'] }); toast.success('Item deleted'); setDeletingId(null); },
    onError: () => { toast.error('Failed to delete'); setDeletingId(null); },
  });

  return (
    <div style={pg.container}>
      <ConfirmModal
        open={!!confirmDeleteId}
        title="Delete Menu Item"
        message="This item will be permanently removed from the menu. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteId) { setDeletingId(confirmDeleteId); deleteMutation.mutate(confirmDeleteId); } setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      {/* Page header */}
      <div style={pg.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={pg.iconWrap}><Flame size={18} color="#fff" /></div>
          <div>
            <h1 style={pg.title}>Hot Food Menu</h1>
            <p style={pg.sub}>Manage menu items · Enable hot food per store via <strong>Stores → Categories</strong></p>
          </div>
        </div>
        {canWrite && (
          <button style={pg.addBtn} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} />
            Add Item
          </button>
        )}
      </div>

      {/* Store filter (SuperAdmin/DevAdmin only) */}
      {!isManager && (
        <div style={pg.filterBar}>
          <label style={pg.filterLabel}>Store</label>
          <div style={pg.selectWrap}>
            <select style={pg.select} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
              <option value="">All stores</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <ChevronDown size={14} style={pg.selectIcon} />
          </div>
        </div>
      )}

      {/* Items table */}
      <div style={pg.card}>
        {isLoading ? (
          <div style={pg.empty}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={pg.empty}>
            <Flame size={32} color="#E5E7EB" />
            <p style={{ color: '#5a6472', marginTop: 8 }}>No menu items yet. Add one to get started.</p>
          </div>
        ) : (
          <table style={tbl.table}>
            <thead>
              <tr>
                <th style={tbl.th}>Item</th>
                <th style={tbl.th}>Price</th>
                <th style={tbl.th}>Store</th>
                <th style={tbl.th}>Wait</th>
                <th style={tbl.th}>Status</th>
                {canWrite && <th style={tbl.th}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={tbl.tr}>
                  <td style={tbl.td}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: 14, color: '#5a6472', marginTop: 2 }}>{item.description}</div>}
                  </td>
                  <td style={tbl.td}>
                    <span style={{ fontWeight: 700, color: '#111827' }}>${Number(item.price).toFixed(2)}</span>
                  </td>
                  <td style={tbl.td}>
                    <span style={tbl.pill}>{item.store?.name ?? 'All Stores'}</span>
                  </td>
                  <td style={tbl.td}>
                    {item.estimatedMinutes ? `${item.estimatedMinutes} min` : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </td>
                  <td style={tbl.td}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: togglingId === item.id ? 'wait' : 'pointer', padding: 0, color: item.isAvailable ? '#16A34A' : '#D1D5DB' }}
                      onClick={() => handleToggle(item)}
                      title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                    >
                      {item.isAvailable ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    </button>
                  </td>
                  {canWrite && (
                    <td style={{ ...tbl.td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button style={tbl.iconBtn} onClick={() => { setEditItem(item); setShowModal(true); }} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button
                          style={{ ...tbl.iconBtn, color: '#EF4444', opacity: deletingId === item.id ? 0.5 : 1 }}
                          onClick={() => setConfirmDeleteId(item.id)}
                          disabled={deletingId === item.id}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ItemModal
          item={editItem === null ? null : (editItem as MenuItem)}
          stores={stores}
          defaultStoreId={storeId}
          onClose={() => setShowModal(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['hot-food-menu-admin'] }); refetch(); }}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pg: Record<string, React.CSSProperties> = {
  container: { padding: '24px 28px' },
  header:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  iconWrap:  { width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #EA580C, #F97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:     { fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 },
  sub:       { fontSize: 15, color: '#5a6472', marginTop: 2 },
  addBtn:    { display: 'flex', alignItems: 'center', gap: 6, background: '#EA580C', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  filterBar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  filterLabel:{ fontSize: 15, fontWeight: 600, color: '#374151' },
  selectWrap:{ position: 'relative', display: 'inline-flex', alignItems: 'center' },
  select:    { appearance: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 32px 7px 12px', fontSize: 15, color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none' },
  selectIcon:{ position: 'absolute', right: 10, pointerEvents: 'none', color: '#5a6472' },
  card:      { background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' },
  empty:     { padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
};

const tbl: Record<string, React.CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse' },
  th:    { padding: '10px 16px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#5a6472', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' },
  tr:    { borderBottom: '1px solid #F9FAFB' },
  td:    { padding: '12px 16px', fontSize: 14, color: '#374151', verticalAlign: 'middle' },
  pill:  { display: 'inline-block', background: '#F3F4F6', borderRadius: 6, padding: '2px 8px', fontSize: 14, fontWeight: 500, color: '#4B5563' },
  iconBtn:{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 6, color: '#5a6472', display: 'flex', alignItems: 'center' },
};

const f: Record<string, React.CSSProperties> = {
  label:     { display: 'block', fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 4, marginTop: 14 },
  input:     { width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' },
  cancelBtn: { flex: 1, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#374151' },
  primaryBtn:{ flex: 1, background: '#EA580C', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#fff' },
};

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  panel:   { background: '#fff', borderRadius: 16, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #F3F4F6' },
  headerTitle: { fontWeight: 700, fontSize: 16, color: '#111827' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#5a6472', lineHeight: 1 },
  body:    { padding: '4px 20px 12px' },
  footer:  { display: 'flex', gap: 10, padding: '16px 20px', borderTop: '1px solid #F3F4F6' },
};
