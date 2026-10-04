import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { catalogApi, storesApi, labelsApi } from '../services/api';
import { pointsForPrice, matchReward, GOOD_MATCH, RewardMatchItem } from '../lib/rewardPoints';
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
  /** The Labels catalog item it is: its points follow that item's price (shelf price x 100, rounded up to the next 25) */
  labelId?: string | null;
  label?: { id: string; productName: string; priceText: string | null; category: string | null } | null;
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
  catalog,
  onClose,
  onSave,
  saving,
}: {
  item?: CatalogItem | null;
  isDevAdmin: boolean;
  isHQ: boolean;
  stores: StoreOption[];
  catalog: RewardMatchItem[];
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
  // The Labels catalog item it is (its points then follow that item's price), found by name
  const [labelId, setLabelId]       = useState<string | null>(item?.labelId ?? null);
  const [find, setFind]             = useState('');
  const linked = labelId ? catalog.find(c => c.id === labelId) ?? (item?.label && item.label.id === labelId ? item.label : null) : null;
  const linkedPts = linked ? pointsForPrice(linked.priceText) : null;
  const found = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (q) {
      const qw = q.split(/\s+/);
      return catalog.filter(c => qw.every(w => c.productName.toLowerCase().includes(w))).slice(0, 6);
    }
    return title.trim() && !labelId ? matchReward(title, catalog, 3).filter(m => m.score >= 0.4).map(m => m.item) : [];
  }, [find, catalog, title, labelId]);
  function link(c: RewardMatchItem) {
    setLabelId(c.id);
    setFind('');
    if (!title.trim()) setTitle(c.productName.slice(0, 60));
    const pts = pointsForPrice(c.priceText);
    if (pts != null) setPointsCost(String(pts));
  }

  const showCustomChain = isDevAdmin && chain === '__custom__';
  const finalChain = chain === '__custom__' ? customChain.trim() : chain;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pts = linkedPts ?? parseInt(pointsCost, 10);
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
      labelId,
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

        <Field label="Catalog item (sets the points from its price)" htmlFor="reward-label"
          hint={linked ? undefined : 'Pick the item from Labels and the points follow its shelf price: price x 100, rounded up to the next 25. Leave it empty for something with no label (a fountain drink, coffee) and set the points by hand.'}>
          {linked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: '#eef2f7', border: '1px solid #d5dde8' }} data-testid="reward-linked">
              <span style={{ fontWeight: 700, color: '#111827' }}>{linked.productName}</span>
              <span style={{ color: '#374151' }}>{linked.priceText ? `$${linked.priceText} = ${linkedPts!.toLocaleString()} pts` : 'no price yet: set the points by hand'}</span>
              <span style={{ flex: 1 }} />
              <Button size="sm" onClick={() => setLabelId(null)}>Unlink</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input id="reward-label" className="ui-input" style={INPUT} value={find} onChange={e => setFind(e.target.value)} placeholder="Type to find the item, e.g. Coca Cola 20oz" autoComplete="off" />
              {found.length > 0 && (
                <div role="listbox" aria-label="Catalog items" style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e4e7ec', borderRadius: 8, overflow: 'hidden' }}>
                  {!find.trim() && <div style={{ fontSize: 12, color: TEXT_MUTED, padding: '6px 10px', background: '#f7f8fa' }}>Looks like</div>}
                  {found.map(c => (
                    <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => link(c)}
                      style={{ display: 'flex', gap: 8, padding: '7px 10px', border: 'none', borderTop: '1px solid #f0f2f5', background: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 14 }}>
                      <span style={{ flex: 1, color: '#111827' }}>{c.productName}</span>
                      <span style={{ color: TEXT_MUTED }}>{c.priceText ? `$${c.priceText} = ${pointsForPrice(c.priceText)!.toLocaleString()} pts` : 'no price'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
          <Field label="Points cost" htmlFor="reward-points" required
            hint={linkedPts != null ? `Follows the price of ${linked!.productName}. Change the price in Labels to change it.` : `= $${(parseInt(pointsCost || '0') / 100).toFixed(2)} value`}>
            <input id="reward-points" className="ui-input" style={{ ...INPUT, ...(linkedPts != null ? { background: '#f7f8fa', color: '#5a6472' } : {}) }}
              value={linkedPts != null ? String(linkedPts) : pointsCost} onChange={e => setPointsCost(e.target.value)} disabled={linkedPts != null}
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
                  <TableCell style={cs.td}>
                    <span style={cs.itemTitle}>{item.title}</span>
                    {item.label && <span style={{ display: 'block', fontSize: 12, color: TEXT_MUTED }}>Linked: {item.label.productName}{item.label.priceText ? ` · $${item.label.priceText}` : ''}</span>}
                  </TableCell>
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
                    {item.label && <span style={{ display: 'block', fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>follows the price</span>}
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
  // The Labels catalog: what a reward can be linked to (its price sets the points)
  const { data: labelsData } = useQuery({ queryKey: ['labels'], queryFn: () => labelsApi.getAll(), staleTime: 60_000 });
  const catalog: RewardMatchItem[] = useMemo(() => (labelsData?.data?.data || []).map((l: any) => ({ id: l.id, productName: l.productName, priceText: l.priceText, category: l.category })), [labelsData]);

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
            100 pts = $1.00 value · a reward linked to a Labels item costs its shelf price in points, rounded up to the next 25 ($2.29 = 250 pts), and follows that price · cashback rate is tier-based (Bronze 1% → Platinum 5%) · cashiers process redemptions by scanning the customer's QR code
          </span>
        </div>

        {!isLoading && catalog.length > 0 && <MatchPanel items={visibleItems} catalog={catalog} onEdit={openEdit} />}

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
          catalog={catalog}
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

// ─── Matching rewards to the Labels catalog ───────────────────────────────────
// The rewards not linked to a catalog item yet, each with the item it most likely is and the points its price makes. Link sets the
// link (the server then keeps the points following the price); Turn off hides one from customers (nothing is deleted); Keep as is
// hides it here, on this computer, for a reward with no label (a fountain drink, coffee) whose points are set by hand.

const KEPT_KEY = 'luckystop-reward-match-kept';
function readKept(): string[] { try { return JSON.parse(localStorage.getItem(KEPT_KEY) || '[]'); } catch { return []; } }

function MatchPanel({ items, catalog, onEdit }: { items: CatalogItem[]; catalog: RewardMatchItem[]; onEdit: (item: CatalogItem) => void }) {
  const qc = useQueryClient();
  const [kept, setKept] = useState<string[]>(readKept);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const rows = useMemo(() => items
    .filter(i => !i.labelId && i.isActive && i.canManage !== false && !kept.includes(i.id))
    .map(i => ({ item: i, matches: matchReward(i.title, catalog, 3) })), [items, catalog, kept]);
  if (rows.length === 0) return null;
  const choice = (r: (typeof rows)[number]) => {
    // only a sure match starts picked: an unsure one (another size, a loose word) waits for a choice, so one click cannot link the wrong item
    const id = picked[r.item.id] ?? (r.matches[0] && r.matches[0].score >= GOOD_MATCH ? r.matches[0].item.id : '');
    return catalog.find(c => c.id === id) ?? null;
  };
  const sure = rows.filter(r => r.matches[0]?.score >= GOOD_MATCH && (picked[r.item.id] ?? r.matches[0].item.id));
  const keep = (id: string) => { const next = [...kept, id]; setKept(next); try { localStorage.setItem(KEPT_KEY, JSON.stringify(next)); } catch { /* kept for this visit */ } };
  async function link(r: (typeof rows)[number]) {
    const c = choice(r);
    if (!c) return;
    setBusy(r.item.id);
    try {
      const res = await catalogApi.update(r.item.id, { labelId: c.id });
      toast.success(`${r.item.title}: linked to ${c.productName}, ${(res.data?.data?.pointsCost ?? pointsForPrice(c.priceText) ?? r.item.pointsCost).toLocaleString()} pts.`);
      qc.invalidateQueries({ queryKey: ['catalog-all'] });
    } catch (e: any) { toast.error(e.response?.data?.error || 'Could not link it.'); }
    finally { setBusy(null); }
  }
  async function turnOff(r: (typeof rows)[number]) {
    setBusy(r.item.id);
    try { await catalogApi.delete(r.item.id); toast.success(`${r.item.title} is off (hidden from customers, not deleted).`); qc.invalidateQueries({ queryKey: ['catalog-all'] }); }
    catch (e: any) { toast.error(e.response?.data?.error || 'Could not turn it off.'); }
    finally { setBusy(null); }
  }
  async function linkAll() {
    setConfirmAll(false);
    setBusy('*');
    let done = 0;
    for (const r of sure) {
      const c = choice(r);
      if (!c) continue;
      try { await catalogApi.update(r.item.id, { labelId: c.id }); done += 1; } catch { /* counted below */ }
    }
    toast[done === sure.length ? 'success' : 'error'](`${done} of ${sure.length} rewards linked; their points follow the price now.`);
    qc.invalidateQueries({ queryKey: ['catalog-all'] });
    setBusy(null);
  }
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }} data-testid="reward-match">
      <ConfirmModal
        open={confirmAll}
        title={`Link ${sure.length} rewards?`}
        message={`Each gets the item shown next to it and its price in points (${sure.slice(0, 3).map(r => `${r.item.title}: ${choice(r)?.productName}`).join('; ')}${sure.length > 3 ? '; ...' : ''}). Their points then follow the price.`}
        confirmLabel="Link them"
        onConfirm={linkAll}
        onCancel={() => setConfirmAll(false)}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #eef0f3', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 15 }}>Price rewards from the catalog <Badge>{rows.length}</Badge></div>
          <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>These rewards have points set by hand. Link each to the item it is in Labels and it costs that item's shelf price in points, following any price change. Turn off the ones you do not sell; keep the ones with no label (fountain drinks, coffee) as they are.</div>
        </div>
        {sure.length > 0 && <Button variant="primary" disabled={busy !== null} onClick={() => setConfirmAll(true)}>Link every sure match ({sure.length})</Button>}
      </div>
      {rows.map(r => {
        const c = choice(r);
        const pts = c ? pointsForPrice(c.priceText) : null;
        const isSure = r.matches[0]?.score >= GOOD_MATCH;
        return (
          <div key={r.item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }} data-testid="reward-match-row">
            <div style={{ minWidth: 220, flex: '1 1 220px' }}>
              <div style={{ fontWeight: 600, color: '#111827' }}>{r.item.emoji} {r.item.title}</div>
              <div style={{ fontSize: 12, color: TEXT_MUTED }}>now {r.item.pointsCost.toLocaleString()} pts{isSure ? '' : r.matches.length ? ' · not sure which item it is' : ' · nothing like it in Labels'}</div>
            </div>
            {r.matches.length > 0 ? (
              <select className="ui-input" style={{ ...INPUT, maxWidth: 360, flex: '1 1 240px' }} aria-label={`Catalog item for ${r.item.title}`}
                value={c?.id ?? ''} onChange={e => setPicked(p => ({ ...p, [r.item.id]: e.target.value }))}>
                <option value="">Pick an item…</option>
                {r.matches.map(m => <option key={m.item.id} value={m.item.id}>{m.item.productName}{m.item.priceText ? ` · $${m.item.priceText}` : ''}</option>)}
              </select>
            ) : <span style={{ flex: '1 1 240px', fontSize: 13, color: TEXT_MUTED }}>Find it with Edit, or keep the points set by hand.</span>}
            <span style={{ minWidth: 120, fontSize: 13, color: '#111827' }}>{c ? (pts != null ? <>to <strong>{pts.toLocaleString()} pts</strong></> : 'no price in Labels') : ''}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="primary" disabled={!c || busy !== null} onClick={() => link(r)} aria-label={`Link ${r.item.title}`}>{busy === r.item.id ? 'Saving…' : 'Link'}</Button>
              <Button size="sm" disabled={busy !== null} onClick={() => onEdit(r.item)}>Edit</Button>
              <Button size="sm" disabled={busy !== null} onClick={() => turnOff(r)} aria-label={`Turn off ${r.item.title}`}>Turn off</Button>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => keep(r.item.id)} aria-label={`Keep ${r.item.title} as it is`}>Keep as is</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
