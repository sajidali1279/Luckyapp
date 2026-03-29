import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { catalogApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface CatalogItem {
  id: string;
  chain: string;
  category: string;
  title: string;
  description?: string;
  emoji: string;
  pointsCost: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

const CATEGORY_OPTIONS = [
  { value: 'IN_STORE',  label: '🛒 In-Store',  desc: 'General in-store items' },
  { value: 'GAS',       label: '⛽ Gas',        desc: 'Fuel & pump rewards' },
  { value: 'HOT_FOODS', label: '🌮 Hot Foods',  desc: 'Hot food items (select locations)' },
];

const KNOWN_CHAINS = ['Lucky Stop'];

function CatalogModal({
  item,
  isDevAdmin,
  onClose,
  onSave,
}: {
  item?: CatalogItem | null;
  isDevAdmin: boolean;
  onClose: () => void;
  onSave: (data: Partial<CatalogItem>) => void;
}) {
  const [chain, setChain]           = useState(item?.chain || 'Lucky Stop');
  const [customChain, setCustomChain] = useState('');
  const [category, setCategory]     = useState(item?.category || 'IN_STORE');
  const [title, setTitle]           = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [emoji, setEmoji]           = useState(item?.emoji || '🎁');
  const [pointsCost, setPointsCost] = useState(item ? String(item.pointsCost) : '');
  const [sortOrder, setSortOrder]   = useState(item ? String(item.sortOrder) : '0');
  const [isActive, setIsActive]     = useState(item?.isActive ?? true);

  const showCustomChain = isDevAdmin && chain === '__custom__';
  const finalChain = chain === '__custom__' ? customChain.trim() : chain;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pts = parseInt(pointsCost, 10);
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (isNaN(pts) || pts <= 0) { toast.error('Enter a valid points cost'); return; }
    if (!finalChain) { toast.error('Company name is required'); return; }
    onSave({
      chain: finalChain,
      category,
      title: title.trim(),
      description: description.trim(),
      emoji: emoji.trim() || '🎁',
      pointsCost: pts,
      sortOrder: parseInt(sortOrder) || 0,
      isActive,
    });
  }

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        <div style={m.header}>
          <h2 style={m.title}>{item ? 'Edit Catalog Item' : 'New Catalog Item'}</h2>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={m.form}>

          {/* Company selector — DevAdmin sees all options; SuperAdmin locked to Lucky Stop */}
          <label style={m.label}>Company / Store Chain *</label>
          {isDevAdmin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select
                style={m.input}
                value={chain}
                onChange={e => setChain(e.target.value)}
              >
                {KNOWN_CHAINS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__custom__">+ Add new company…</option>
              </select>
              {showCustomChain && (
                <input
                  style={m.input}
                  value={customChain}
                  onChange={e => setCustomChain(e.target.value)}
                  placeholder="e.g. Shell Express"
                  autoFocus
                />
              )}
            </div>
          ) : (
            <div style={{ ...m.input, background: '#f5f5f5', color: '#666', cursor: 'default' }}>
              Lucky Stop
            </div>
          )}

          <label style={m.label}>Category *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {CATEGORY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${category === opt.value ? '#1D3557' : '#ddd'}`,
                  background: category === opt.value ? '#1D3557' : '#fff',
                  color: category === opt.value ? '#fff' : '#444',
                  fontWeight: 700, fontSize: 12, textAlign: 'center' as const,
                  lineHeight: 1.4,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={m.label}>Emoji</label>
              <input
                style={{ ...m.input, width: 72, textAlign: 'center', fontSize: 22 }}
                value={emoji}
                onChange={e => setEmoji(e.target.value)}
                maxLength={4}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={m.label}>Sort Order</label>
              <input
                style={m.input}
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value)}
                type="number"
                min={0}
                placeholder="0"
              />
            </div>
          </div>

          <label style={m.label}>Item Title *</label>
          <input
            style={m.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Free Fountain Drink"
            autoFocus={!isDevAdmin}
          />

          <label style={m.label}>Description (optional)</label>
          <input
            style={m.input}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Any size fountain drink"
          />

          <label style={m.label}>Points Cost *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              style={{ ...m.input, flex: 1 }}
              value={pointsCost}
              onChange={e => setPointsCost(e.target.value)}
              placeholder="e.g. 400"
              type="number"
              min={1}
            />
            <span style={m.hint}>
              = ${(parseInt(pointsCost || '0') / 100).toFixed(2)} value
            </span>
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

// ─── Chain Section ─────────────────────────────────────────────────────────────

const CHAIN_META: Record<string, { icon: string; color: string }> = {
  'Lucky Stop': { icon: '⛽', color: '#1D3557' },
};

function ChainSection({
  chain,
  items,
  onEdit,
  onDelete,
  deletingId,
}: {
  chain: string;
  items: CatalogItem[];
  onEdit: (item: CatalogItem) => void;
  onDelete: (item: CatalogItem) => void;
  deletingId: string | null;
}) {
  const meta = CHAIN_META[chain] || { icon: '🏪', color: '#555' };
  return (
    <div style={cs.section}>
      <div style={{ ...cs.chainHeader, borderLeftColor: meta.color }}>
        <span style={cs.chainIcon}>{meta.icon}</span>
        <div>
          <div style={cs.chainName}>{chain}</div>
          <div style={cs.chainCount}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div style={cs.emptyChain}>No items in this company yet</div>
      ) : (
        <div style={cs.tableWrap}>
          <table style={cs.table}>
            <thead>
              <tr>
                {['', 'Title', 'Category', 'Description', 'Points Cost', 'Value', 'Status', 'Actions'].map(h => (
                  <th key={h} style={cs.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                  <td style={{ ...cs.td, fontSize: 22, width: 40, textAlign: 'center' }}>{item.emoji}</td>
                  <td style={cs.td}><span style={cs.itemTitle}>{item.title}</span></td>
                  <td style={cs.td}>
                    <span style={cs.catBadge}>
                      {{ IN_STORE: '🛒 In-Store', GAS: '⛽ Gas', HOT_FOODS: '🌮 Hot Foods' }[item.category as string] || item.category}
                    </span>
                  </td>
                  <td style={cs.td}><span style={cs.itemDesc}>{item.description || '—'}</span></td>
                  <td style={cs.td}>
                    <span style={cs.ptsBadge}>{item.pointsCost.toLocaleString()} pts</span>
                  </td>
                  <td style={cs.td}>
                    <span style={cs.valueBadge}>${(item.pointsCost / 100).toFixed(2)}</span>
                  </td>
                  <td style={cs.td}>
                    <span style={{ ...cs.statusBadge, ...(item.isActive ? cs.statusActive : cs.statusInactive) }}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={cs.td}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={cs.editBtn} onClick={() => onEdit(item)}>Edit</button>
                      <button
                        style={cs.deleteBtn}
                        onClick={() => onDelete(item)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? '…' : 'Delete'}
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
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const qc = useQueryClient();
  const [modalItem, setModalItem] = useState<CatalogItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog-all'],
    queryFn: () => catalogApi.getAll(),
  });
  const items: CatalogItem[] = data?.data?.data || [];

  // Group by chain
  const chains = Array.from(new Set(items.map(i => i.chain))).sort();
  // DevAdmin sees all chains; SuperAdmin sees only Lucky Stop
  const visibleChains = isDevAdmin ? chains : ['Lucky Stop'];
  const itemsByChain = (chain: string) => items.filter(i => i.chain === chain);

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog-all'] }); toast.success('Item deactivated'); setDeletingId(null); },
    onError: (e: any) => { toast.error(e.response?.data?.error || 'Failed'); setDeletingId(null); },
  });

  function openCreate() { setModalItem(null); setShowModal(true); }
  function openEdit(item: CatalogItem) { setModalItem(item); setShowModal(true); }
  function handleDelete(item: CatalogItem) {
    if (!window.confirm(`Deactivate "${item.title}"?`)) return;
    setDeletingId(item.id);
    deleteMutation.mutate(item.id);
  }
  function handleSave(formData: Partial<CatalogItem>) {
    if (modalItem) {
      updateMutation.mutate({ id: modalItem.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  }
  const isMutating = createMutation.isPending || updateMutation.isPending;

  // Total stats across visible chains
  const visibleItems = items.filter(i => isDevAdmin || i.chain === 'Lucky Stop');
  const activeCount = visibleItems.filter(i => i.isActive).length;

  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* Header */}
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>🎁 Redemption Catalog</h1>
            <p style={s.pageSub}>
              Fixed reward items customers redeem with their points
              {isDevAdmin && chains.length > 0 && ` · ${chains.length} compan${chains.length > 1 ? 'ies' : 'y'}`}
            </p>
          </div>
          <button style={s.createBtn} onClick={openCreate}>+ New Item</button>
        </div>

        {/* Stats bar */}
        {!isLoading && visibleItems.length > 0 && (
          <div style={s.statsRow}>
            <div style={s.statCard}>
              <div style={s.statVal}>{visibleItems.length}</div>
              <div style={s.statLabel}>Total Items</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statVal}>{activeCount}</div>
              <div style={s.statLabel}>Active</div>
            </div>
            <div style={s.statCard}>
              <div style={s.statVal}>{visibleItems.length - activeCount}</div>
              <div style={s.statLabel}>Inactive</div>
            </div>
            {isDevAdmin && (
              <div style={s.statCard}>
                <div style={s.statVal}>{chains.length}</div>
                <div style={s.statLabel}>Companies</div>
              </div>
            )}
          </div>
        )}

        {/* Info banner */}
        <div style={s.infoBanner}>
          <span>ℹ️</span>
          <span style={s.infoText}>
            100 pts = $1.00 value · customers earn 5 pts per $1 spent · cashiers process redemptions by scanning the customer's QR code
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={s.loadingBox}>Loading…</div>
        ) : visibleItems.length === 0 ? (
          <div style={s.emptyBox}>
            <div style={s.emptyIcon}>🏷️</div>
            <div style={s.emptyTitle}>No catalog items yet</div>
            <div style={s.emptySub}>Create your first reward item to get started</div>
            <button style={s.createBtn} onClick={openCreate}>+ Create First Item</button>
          </div>
        ) : (
          <>
            {visibleChains.map(chain => (
              <ChainSection
                key={chain}
                chain={chain}
                items={itemsByChain(chain)}
                onEdit={openEdit}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            ))}
            {/* Show chains that exist in DB but aren't in our visible list (shouldn't happen but safety) */}
            {isDevAdmin && chains.filter(c => !visibleChains.includes(c)).map(chain => (
              <ChainSection
                key={chain}
                chain={chain}
                items={itemsByChain(chain)}
                onEdit={openEdit}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            ))}
          </>
        )}
      </div>

      {showModal && (
        <CatalogModal
          item={modalItem}
          isDevAdmin={isDevAdmin}
          onClose={() => !isMutating && setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6fb', padding: '32px 0' },
  inner: { maxWidth: 1000, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 28, fontWeight: 900, color: '#1D3557', margin: 0 },
  pageSub: { color: '#666', marginTop: 4, fontSize: 14 },
  createBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 20px', cursor: 'pointer',
    fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
  },

  statsRow: { display: 'flex', gap: 12 },
  statCard: {
    background: '#fff', borderRadius: 14, padding: '14px 20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center', minWidth: 90,
  },
  statVal: { fontSize: 26, fontWeight: 900, color: '#1D3557' },
  statLabel: { fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  infoBanner: {
    background: '#EBF5FF', border: '1px solid #bee3f8', borderRadius: 12,
    padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
    fontSize: 18,
  },
  infoText: { fontSize: 13, color: '#2c5282', lineHeight: 1.6 },

  loadingBox: { textAlign: 'center', padding: 40, color: '#888', fontSize: 16 },
  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557' },
  emptySub: { color: '#888', fontSize: 14 },
};

const cs: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 0 },
  chainHeader: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#fff', borderRadius: '14px 14px 0 0',
    padding: '16px 20px', borderLeft: '5px solid #1D3557',
    borderBottom: '1px solid #eee',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  chainIcon: { fontSize: 28 },
  chainName: { fontSize: 18, fontWeight: 800, color: '#1D3557' },
  chainCount: { fontSize: 12, color: '#888', fontWeight: 600, marginTop: 2 },
  emptyChain: {
    background: '#fff', borderRadius: '0 0 14px 14px',
    padding: '24px', textAlign: 'center', color: '#aaa', fontSize: 14,
    borderBottom: '1px solid #eee', borderLeft: '1px solid #eee', borderRight: '1px solid #eee',
  },
  tableWrap: {
    background: '#fff', borderRadius: '0 0 14px 14px', overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: '1px solid #eee', borderTop: 'none',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#888', background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle' },
  itemTitle: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  itemDesc: { fontSize: 13, color: '#888' },
  catBadge: {
    background: '#f0f4ff', color: '#1D3557',
    borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600,
  },
  ptsBadge: {
    background: '#1D3557', color: '#fff',
    borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 700,
  },
  valueBadge: {
    background: '#d4edda', color: '#155724',
    borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 700,
  },
  orderBadge: { fontSize: 13, color: '#888', fontWeight: 600 },
  statusBadge: { borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  statusActive: { background: '#d4edda', color: '#155724' },
  statusInactive: { background: '#f8d7da', color: '#721c24' },
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
    maxHeight: '90vh', overflowY: 'auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #eee',
    position: 'sticky', top: 0, background: '#fff', zIndex: 1,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#1D3557' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: '#888', lineHeight: 1,
  },
  form: { padding: 24, display: 'flex', flexDirection: 'column', gap: 14 },
  label: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: -6 },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
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
