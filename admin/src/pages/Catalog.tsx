import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { catalogApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { PageHeader, Button, HeaderStat, Badge, Chip, Field, Notice } from '../components/kit';
import Modal from '../components/Modal';
import { INPUT } from '../lib/theme';
import { Plus } from 'lucide-react';
import Glyph from '../components/Glyph';

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
  /** One store's own reward; null = every store (HQ's) */
  storeId?: string | null;
  store?: { id: string; name: string } | null;
  /** false = HQ's reward, shown to a manager read-only */
  canManage?: boolean;
  redeemedTotal?: number;
  redeemed30d?: number;
}
type StoreOption = { id: string; name: string; city?: string };

const CATEGORY_OPTIONS = [
  { value: 'IN_STORE',     label: 'In-Store',     desc: 'General in-store items' },
  { value: 'GAS',          label: 'Gas',           desc: 'Fuel & pump rewards' },
  { value: 'HOT_FOODS',    label: 'Hot Foods',     desc: 'Hot food items (select locations)' },
  { value: 'GROCERIES',    label: 'Groceries',    desc: 'Grocery & packaged goods' },
  { value: 'FROZEN_FOODS', label: 'Frozen Foods',  desc: 'Frozen food items' },
  { value: 'FRESH_FOODS',  label: 'Fresh Foods',   desc: 'Fresh produce & deli items' },
];

const KNOWN_CHAINS = ['Lucky Stop'];

function CatalogModal({
  item,
  isDevAdmin,
  isHQ,
  stores,
  onClose,
  onSave,
  saving,
}: {
  item?: CatalogItem | null;
  isDevAdmin: boolean;
  isHQ: boolean;
  stores: StoreOption[];
  onClose: () => void;
  onSave: (data: Partial<CatalogItem>) => void;
  saving: boolean;
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
  // Where it can be redeemed: every store (HQ only) or one store. A manager's reward is always one of their stores.
  const [storeId, setStoreId]       = useState<string>(item ? (item.storeId ?? '') : isHQ ? '' : (stores[0]?.id ?? ''));

  const showCustomChain = isDevAdmin && chain === '__custom__';
  const finalChain = chain === '__custom__' ? customChain.trim() : chain;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pts = parseInt(pointsCost, 10);
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (isNaN(pts) || pts <= 0) { toast.error('Enter a valid points cost'); return; }
    if (!finalChain) { toast.error('Company name is required'); return; }
    if (!isHQ && !storeId) { toast.error('Pick which of your stores this reward is for'); return; }
    onSave({
      chain: finalChain,
      category,
      title: title.trim(),
      description: description.trim(),
      emoji: emoji.trim() || '🎁',
      pointsCost: pts,
      sortOrder: parseInt(sortOrder) || 0,
      isActive,
      storeId: storeId || null,
    });
  }

  return (
    <Modal title={item ? 'Edit reward' : 'New reward'} subtitle="Customers redeem rewards with their points." onClose={onClose} busy={saving} maxWidth={620}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Company selector - DevAdmin sees all options; SuperAdmin locked to Lucky Stop */}
        <Field label="Company / store chain" htmlFor="reward-chain">
          {isDevAdmin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select id="reward-chain" className="ui-input" style={INPUT} value={chain} onChange={e => setChain(e.target.value)}>
                {KNOWN_CHAINS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__custom__">+ Add new company…</option>
              </select>
              {showCustomChain && (
                <input className="ui-input" style={INPUT} aria-label="New company name" value={customChain}
                  onChange={e => setCustomChain(e.target.value)} placeholder="e.g. Shell Express" autoFocus />
              )}
            </div>
          ) : (
            <div id="reward-chain" style={{ ...INPUT, background: '#f7f8fa', color: '#5a6472' }}>Lucky Stop</div>
          )}
        </Field>

        <Field label="Where it can be redeemed" htmlFor="reward-store"
          hint={storeId ? 'Only at this store. Other stores refuse it and say where it can be used.' : 'At every store.'}>
          <select id="reward-store" className="ui-input" style={INPUT} value={storeId} onChange={e => setStoreId(e.target.value)}>
            {isHQ && <option value="">Every store</option>}
            {!isHQ && stores.length > 1 && !storeId && <option value="">Pick one of your stores</option>}
            {stores.map(st => <option key={st.id} value={st.id}>{st.name}{st.city ? ` - ${st.city}` : ''}</option>)}
          </select>
        </Field>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Category</div>
          <div role="radiogroup" aria-label="Category" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORY_OPTIONS.map(opt => (
              <Chip key={opt.value} role="radio" selected={category === opt.value} onClick={() => setCategory(opt.value)} title={opt.desc}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 12 }}>
          <Field label="Emoji" htmlFor="reward-emoji" hint="Shown to customers">
            <input id="reward-emoji" className="ui-input" style={{ ...INPUT, textAlign: 'center', fontSize: 20 }} value={emoji}
              onChange={e => setEmoji(e.target.value)} maxLength={4} />
          </Field>
          <Field label="Item title" htmlFor="reward-title" required>
            <input id="reward-title" className="ui-input" style={INPUT} value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Free Fountain Drink" autoFocus={!isDevAdmin} maxLength={60} />
          </Field>
        </div>

        <Field label="Description (optional)" htmlFor="reward-desc">
          <input id="reward-desc" className="ui-input" style={INPUT} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Any size fountain drink" maxLength={200} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Field label="Points cost" htmlFor="reward-points" required hint={`= $${(parseInt(pointsCost || '0') / 100).toFixed(2)} value`}>
            <input id="reward-points" className="ui-input" style={INPUT} value={pointsCost} onChange={e => setPointsCost(e.target.value)}
              placeholder="e.g. 400" type="number" min={1} />
          </Field>
          <Field label="Sort order" htmlFor="reward-sort" hint="Lower numbers show first">
            <input id="reward-sort" className="ui-input" style={INPUT} value={sortOrder} onChange={e => setSortOrder(e.target.value)} type="number" min={0} placeholder="0" />
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: '#111827' }}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16, accentColor: PRIMARY }} />
          Active (visible to customers)
        </label>

        {!isHQ && <Notice tone="info" style={{ fontSize: 13 }}>HQ is told about rewards you add or change.</Notice>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : item ? 'Save changes' : 'Create reward'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Chain Section ─────────────────────────────────────────────────────────────

const CHAIN_META: Record<string, { icon: string; color: string }> = {
  'Lucky Stop': { icon: '⛽', color: PRIMARY },
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
  const meta = CHAIN_META[chain] || { icon: '🏪', color: '#374151' };
  return (
    <div style={cs.section}>
      <div style={{ ...cs.chainHeader, borderLeftColor: meta.color }}>
        <span style={cs.chainIcon}><Glyph e={meta.icon} size={18} /></span>
        <div>
          <div style={cs.chainName}>{chain}</div>
          <div style={cs.chainCount}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div style={cs.emptyChain}>No items in this company yet</div>
      ) : (
        <div style={cs.tableWrap}>
          <Table style={cs.table}>
            <TableHeader>
              <TableRow>
                {['', 'Title', 'Where', 'Category', 'Description', 'Points Cost', 'Value', 'Redeemed', 'Status', 'Actions'].map(h => (
                  <TableHead key={h} style={cs.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
                  <TableCell style={{ ...cs.td, fontSize: 22, width: 40, textAlign: 'center' }}>{item.emoji}</TableCell>
                  <TableCell style={cs.td}><span style={cs.itemTitle}>{item.title}</span></TableCell>
                  <TableCell style={cs.td}>
                    {item.store ? <Badge tone="info">Only {item.store.name}</Badge> : <Badge>Every store</Badge>}
                  </TableCell>
                  <TableCell style={cs.td}>
                    <span style={cs.catBadge}>
                      {CATEGORY_OPTIONS.find((c) => c.value === item.category)?.label || item.category}
                    </span>
                  </TableCell>
                  <TableCell style={cs.td}><span style={cs.itemDesc}>{item.description || ' - '}</span></TableCell>
                  <TableCell style={cs.td}>
                    <span style={cs.ptsBadge}>{item.pointsCost.toLocaleString()} pts</span>
                  </TableCell>
                  <TableCell style={cs.td}>
                    <span style={cs.valueBadge}>${(item.pointsCost / 100).toFixed(2)}</span>
                  </TableCell>
                  <TableCell style={cs.td}>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{(item.redeemedTotal ?? 0).toLocaleString()}</span>
                    <span style={{ display: 'block', fontSize: 12, color: TEXT_MUTED }}>{(item.redeemed30d ?? 0).toLocaleString()} in 30 days</span>
                  </TableCell>
                  <TableCell style={cs.td}>
                    <span style={{ ...cs.statusBadge, ...(item.isActive ? cs.statusActive : cs.statusInactive) }}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell style={cs.td}>
                    {item.canManage === false ? (
                      <span style={{ fontSize: 12, color: TEXT_MUTED }} title="Chain-wide rewards are set by HQ">HQ only</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={cs.editBtn} onClick={() => onEdit(item)}>Edit</button>
                        <button
                          style={cs.deleteBtn}
                          onClick={() => onDelete(item)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? '…' : 'Deactivate'}
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isHQ = isDevAdmin || user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  // The stores a reward can be tied to: every store for HQ, a manager's own for a manager
  const { data: storesData } = useQuery({ queryKey: ['accessible-stores'], queryFn: () => storesApi.getAccessible() });
  const stores: StoreOption[] = storesData?.data?.data || [];
  const [modalItem, setModalItem] = useState<CatalogItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<CatalogItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
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
    setConfirmItem(item);
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

  if (isError) return <div style={{ padding: 32 }}><ErrorState message="Failed to load catalog." onRetry={refetch} /></div>;

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmItem}
        title="Deactivate Item"
        message={`Deactivate "${confirmItem?.title}"? It will be hidden from customers but not permanently deleted.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={() => { if (confirmItem) { setDeletingId(confirmItem.id); deleteMutation.mutate(confirmItem.id); } setConfirmItem(null); }}
        onCancel={() => setConfirmItem(null)}
      />
      <div style={s.inner}>

        {/* Header */}
      <PageHeader
        title="Redemption Catalog"
        description={<>Fixed reward items customers redeem with their points{isDevAdmin && chains.length > 0 && ` · ${chains.length} compan${chains.length > 1 ? 'ies' : 'y'}`}</>}
        actions={<Button variant="primary" icon={<Plus />} onClick={openCreate}>New Item</Button>}
      >
        {!isLoading && visibleItems.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <HeaderStat label="Total Items" value={visibleItems.length} />
            <HeaderStat label="Active" value={activeCount} tone="success" />
            <HeaderStat label="Inactive" value={visibleItems.length - activeCount} />
            {isDevAdmin && <HeaderStat label="Companies" value={chains.length} />}
          </div>
        )}
      </PageHeader>

        {/* Info banner */}
        <div style={s.infoBanner}>
          <Glyph e="ℹ️" size={16} style={{ marginTop: 2 }} />
          <span style={s.infoText}>
            100 pts = $1.00 value · cashback rate is tier-based (Bronze 1% → Platinum 5%) · cashiers process redemptions by scanning the customer's QR code
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <TableSkeleton columns={8} />
        ) : visibleItems.length === 0 ? (
          <div style={s.emptyBox}>
            <div style={s.emptyIcon}><Glyph e="🏷️" size={28} color="#5a6472" /></div>
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
          isHQ={isHQ}
          stores={stores}
          saving={isMutating}
          onClose={() => !isMutating && setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--background)', padding: '32px 0' },
  inner: { padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 26, fontWeight: 700, color: PRIMARY, margin: 0 },
  pageSub: { color: '#5a6472', marginTop: 4, fontSize: 14 },
  createBtn: {
    background: PRIMARY, color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 20px', cursor: 'pointer',
    fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
  },

  statsRow: { display: 'flex', gap: 12 },
  statCard: {
    background: '#fff', borderRadius: 12, padding: '14px 20px',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)', textAlign: 'center', minWidth: 90,
  },
  statVal: { fontSize: 26, fontWeight: 700, color: PRIMARY },
  statLabel: { fontSize: 13, color: TEXT_MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  infoBanner: {
    background: '#EBF5FF', border: '1px solid #bee3f8', borderRadius: 12,
    padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
    fontSize: 18,
  },
  infoText: { fontSize: 15, color: '#1D3557', lineHeight: 1.6 },

  loadingBox: { textAlign: 'center', padding: 40, color: TEXT_MUTED, fontSize: 16 },
  emptyBox: {
    background: '#fff', borderRadius: 12, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: PRIMARY },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const cs: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 0 },
  chainHeader: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#fff', borderRadius: '14px 14px 0 0',
    padding: '16px 20px', borderLeft: '5px solid #1D3557',
    borderBottom: '1px solid #e4e7ec',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
  },
  chainIcon: { fontSize: 28 },
  chainName: { fontSize: 18, fontWeight: 700, color: PRIMARY },
  chainCount: { fontSize: 14, color: TEXT_MUTED, fontWeight: 600, marginTop: 2 },
  emptyChain: {
    background: '#fff', borderRadius: '0 0 14px 14px',
    padding: '24px', textAlign: 'center', color: '#5a6472', fontSize: 14,
    borderBottom: '1px solid #e4e7ec', borderLeft: '1px solid #e4e7ec', borderRight: '1px solid #e4e7ec',
  },
  tableWrap: {
    background: '#fff', borderRadius: '0 0 14px 14px', overflowX: 'auto',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
    border: '1px solid #e4e7ec', borderTop: 'none',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: TEXT_MUTED, background: '#f7f8fa', borderBottom: '1px solid #e4e7ec',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f1f3f6', verticalAlign: 'middle' },
  itemTitle: { fontWeight: 700, fontSize: 14, color: PRIMARY, display: 'block', minWidth: 160 },
  itemDesc: { fontSize: 15, color: TEXT_MUTED, display: 'block', minWidth: 180 },
  catBadge: {
    background: '#eef2f7', color: PRIMARY,
    borderRadius: 8, padding: '3px 10px', fontSize: 14, fontWeight: 600,
  },
  ptsBadge: {
    background: PRIMARY, color: '#fff',
    borderRadius: 8, padding: '3px 10px', fontSize: 15, fontWeight: 700,
  },
  valueBadge: {
    background: '#edf7f0', color: '#17663a',
    borderRadius: 8, padding: '3px 10px', fontSize: 15, fontWeight: 700,
  },
  orderBadge: { fontSize: 15, color: TEXT_MUTED, fontWeight: 600 },
  statusBadge: { borderRadius: 8, padding: '3px 10px', fontSize: 14, fontWeight: 700 },
  statusActive: { background: '#edf7f0', color: '#17663a' },
  statusInactive: { background: '#f8d7da', color: '#721c24' },
  editBtn: {
    background: '#eef2f7', color: PRIMARY, border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15, fontWeight: 600,
  },
  deleteBtn: {
    background: '#fdf2f2', color: '#c42130', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 15, fontWeight: 600,
  },
};

const m: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
    maxHeight: '90vh', overflowY: 'auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #e4e7ec',
    position: 'sticky', top: 0, background: '#fff', zIndex: 1,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: PRIMARY },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: TEXT_MUTED, lineHeight: 1,
  },
  form: { padding: 24, display: 'flex', flexDirection: 'column', gap: 14 },
  label: { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: -6 },
  input: {
    border: '1.5px solid #d5dae1', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  hint: { fontSize: 15, color: TEXT_MUTED, whiteSpace: 'nowrap' },
  checkRow: { display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  cancelBtn: {
    background: '#f1f3f6', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151',
  },
  saveBtn: {
    background: PRIMARY, color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
};
