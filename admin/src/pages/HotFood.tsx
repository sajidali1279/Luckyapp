import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { hotFoodApi, hotFoodCatalogApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Flame, Clock, CheckCircle, X, RefreshCw, ChevronDown,
  Plus, Pencil, Trash2, Building2, Search, ImageIcon,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type MainView   = 'orders' | 'catalog';
type OrderTab   = 'PENDING' | 'ACCEPTED' | 'READY' | 'ALL';
type OrderStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'CANCELLED';

interface OrderItem  { name: string; quantity: number; price: number }
interface FoodOrder  {
  id: string; orderNumber: string;
  store: { id: string; name: string };
  customer: { name: string; phone: string };
  items: OrderItem[]; note?: string; status: OrderStatus; createdAt: string;
}
interface CatalogItem {
  id: string; name: string; description?: string;
  price: number; imageUrl?: string; estimatedMinutes?: number; storeCount: number;
}
interface Store { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function toTitleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

const STATUS_CFG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pending',   color: '#F97316', bg: '#FFF7ED' },
  ACCEPTED:  { label: 'Preparing', color: '#3B82F6', bg: '#EFF6FF' },
  READY:     { label: 'Ready',     color: '#16A34A', bg: '#F0FDF4' },
  COMPLETED: { label: 'Done',      color: '#94A3B8', bg: '#F8FAFC' },
  CANCELLED: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2' },
};

const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: 'PENDING',  label: 'Pending'   },
  { key: 'ACCEPTED', label: 'Preparing' },
  { key: 'READY',    label: 'Ready'     },
  { key: 'ALL',      label: 'All'       },
];

const PLACEHOLDER_COLORS = ['#DBEAFE', '#DCF8C6', '#FEF9C3', '#FFE4E6', '#EDE9FE', '#FFEDD5', '#F0FDF4'];

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onUpdate, updatingId }: {
  order: FoodOrder;
  onUpdate: (id: string, s: OrderStatus) => void;
  updatingId: string | null;
}) {
  const cfg   = STATUS_CFG[order.status];
  const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const busy  = updatingId === order.id;

  return (
    <div style={oc.card}>
      <div style={oc.top}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={oc.num}>#{order.orderNumber}</span>
          <span style={{ ...oc.badge, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
        </div>
        <div style={oc.meta}>
          <Clock size={11} color="#9CA3AF" />
          <span style={oc.metaTxt}>{timeAgo(order.createdAt)}</span>
          <span style={oc.dot} />
          <span style={oc.metaTxt}>{order.store.name}</span>
        </div>
      </div>

      <div>
        <div style={oc.custName}>{order.customer.name}</div>
        <div style={oc.custPhone}>{order.customer.phone}</div>
      </div>

      <div style={oc.items}>
        {order.items.map((item, i) => (
          <div key={i} style={oc.itemRow}>
            <span style={oc.qty}>{item.quantity}×</span>
            <span style={oc.iname}>{item.name}</span>
            <span style={oc.iprice}>${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div style={oc.totalRow}>
          <span style={oc.totalLbl}>Total</span>
          <span style={oc.totalVal}>${total.toFixed(2)}</span>
        </div>
      </div>

      {order.note && (
        <div style={oc.note}>
          <span style={oc.noteLbl}>Note</span>
          <span style={oc.noteTxt}>{order.note}</span>
        </div>
      )}

      <div style={oc.actions}>
        {order.status === 'PENDING' && (
          <button style={{ ...oc.btn, background: '#F97316', opacity: busy ? 0.6 : 1 }}
            onClick={() => onUpdate(order.id, 'ACCEPTED')} disabled={busy}>
            {busy ? 'Updating…' : 'Accept Order'}
          </button>
        )}
        {order.status === 'ACCEPTED' && (
          <button style={{ ...oc.btn, background: '#3B82F6', opacity: busy ? 0.6 : 1 }}
            onClick={() => onUpdate(order.id, 'READY')} disabled={busy}>
            {busy ? 'Updating…' : 'Mark Ready'}
          </button>
        )}
        {order.status === 'READY' && (
          <>
            <button style={{ ...oc.btn, background: '#16A34A', flex: 1, opacity: busy ? 0.6 : 1 }}
              onClick={() => onUpdate(order.id, 'COMPLETED')} disabled={busy}>
              <CheckCircle size={13} color="#fff" />
              {busy ? 'Updating…' : 'Complete'}
            </button>
            <button style={{ ...oc.cancelBtn, opacity: busy ? 0.6 : 1 }}
              onClick={() => onUpdate(order.id, 'CANCELLED')} disabled={busy} title="Cancel order">
              <X size={13} color="#EF4444" />
            </button>
          </>
        )}
        {(order.status === 'COMPLETED' || order.status === 'CANCELLED') && (
          <div style={oc.done}>
            <CheckCircle size={13} color={order.status === 'COMPLETED' ? '#16A34A' : '#D1D5DB'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: order.status === 'COMPLETED' ? '#16A34A' : '#9CA3AF' }}>
              {order.status === 'COMPLETED' ? 'Completed' : 'Cancelled'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add / Edit Catalog Item Modal ────────────────────────────────────────────

function AddEditModal({ item, onClose, onSaved }: {
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,    setName]    = useState(item?.name ?? '');
  const [desc,    setDesc]    = useState(item?.description ?? '');
  const [price,   setPrice]   = useState(item ? String(item.price) : '');
  const [estMins, setEstMins] = useState(item?.estimatedMinutes ? String(item.estimatedMinutes) : '');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(item?.imageUrl ?? null);
  const [saving,  setSaving]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) { toast.error('Name is required'); return; }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) { toast.error('Enter a valid price'); return; }

    setSaving(true);
    try {
      const finalName = toTitleCase(trimmedName);
      const description = desc.trim() || null;
      const estimatedMinutes = estMins ? parseInt(estMins, 10) : null;

      if (item) {
        await hotFoodCatalogApi.update(item.id, { name: finalName, description, price: parsedPrice, estimatedMinutes });
        if (imgFile) {
          const fd = new FormData();
          fd.append('image', imgFile);
          await hotFoodCatalogApi.updateImage(item.id, fd);
        }
        toast.success('Item updated');
      } else {
        const fd = new FormData();
        fd.append('name', finalName);
        fd.append('price', String(parsedPrice));
        if (description) fd.append('description', description);
        if (estimatedMinutes) fd.append('estimatedMinutes', String(estimatedMinutes));
        if (imgFile) fd.append('image', imgFile);
        await hotFoodCatalogApi.create(fd);
        toast.success('Item added to catalog');
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
    <div style={md.overlay} onClick={onClose}>
      <div style={{ ...md.panel, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={md.head}>
          <span style={md.headTitle}>{item ? 'Edit Item' : 'New Catalog Item'}</span>
          <button style={md.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={md.body}>
          {/* Image picker */}
          <div
            style={md.imgWrap}
            onClick={() => fileRef.current?.click()}
            title="Click to change image"
          >
            {imgPreview ? (
              <img src={imgPreview} alt="" style={md.imgPreview} />
            ) : (
              <div style={md.imgPlaceholder}>
                <ImageIcon size={32} color="#CBD5E1" strokeWidth={1.5} />
                <span style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Click to add photo</span>
              </div>
            )}
            <div style={md.imgBadge}>
              <ImageIcon size={11} color="#fff" />
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

          <label style={f.label}>Item Name *</label>
          <input style={f.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Corn Dog" autoCapitalize="words" />

          <label style={f.label}>Description</label>
          <textarea style={{ ...f.input, minHeight: 60, resize: 'vertical' }} value={desc}
            onChange={e => setDesc(e.target.value)} placeholder="Brief description (optional)" />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={f.label}>Price ($) *</label>
              <input style={f.input} type="number" min="0" step="0.01" value={price}
                onChange={e => setPrice(e.target.value)} placeholder="2.99" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={f.label}>Est. wait (mins)</label>
              <input style={f.input} type="number" min="1" value={estMins}
                onChange={e => setEstMins(e.target.value)} placeholder="10" />
            </div>
          </div>
        </div>
        <div style={md.footer}>
          <button style={f.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={{ ...f.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Add to Catalog'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Store Assignment Modal ───────────────────────────────────────────────────

function AssignModal({ item, stores, onClose, onEdit }: {
  item: CatalogItem;
  stores: Store[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: assignData, isLoading: assignLoading } = useQuery({
    queryKey: ['catalog-store-assignments', item.id],
    queryFn: () => hotFoodCatalogApi.getStoreAssignments(item.id),
    enabled: true,
  });
  const assignedIds: string[] = assignData?.data?.data?.assignedStoreIds ?? [];

  useEffect(() => {
    setLocalSelected(new Set(assignedIds));
  }, [assignedIds.join(',')]);

  const hasChanges = useMemo(() => {
    const orig = new Set(assignedIds);
    if (orig.size !== localSelected.size) return true;
    for (const id of localSelected) if (!orig.has(id)) return true;
    return false;
  }, [localSelected, assignedIds]);

  function toggle(id: string) {
    setLocalSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    const orig = new Set(assignedIds);
    const toAdd    = stores.filter(s => localSelected.has(s.id)  && !orig.has(s.id));
    const toRemove = stores.filter(s => !localSelected.has(s.id) && orig.has(s.id));
    try {
      await Promise.all([
        ...toAdd.map(s    => hotFoodCatalogApi.assignToStore(item.id, s.id)),
        ...toRemove.map(s => hotFoodCatalogApi.removeFromStore(item.id, s.id)),
      ]);
      qc.invalidateQueries({ queryKey: ['catalog-store-assignments', item.id] });
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
      const n = localSelected.size;
      toast.success(`Assigned to ${n} store${n !== 1 ? 's' : ''}`);
      onClose();
    } catch {
      toast.error('Could not save store assignments');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove "${item.name}" from the catalog? It will be unassigned from all stores.`)) return;
    try {
      await hotFoodCatalogApi.delete(item.id);
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
      toast.success('Item removed from catalog');
      onClose();
    } catch {
      toast.error('Could not delete item');
    }
  }

  const allOn  = stores.length > 0 && localSelected.size === stores.length;
  const noneOn = localSelected.size === 0;

  return (
    <div style={md.overlay} onClick={onClose}>
      <div style={{ ...md.panel, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        {/* Item row */}
        <div style={am.itemRow}>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" style={am.thumb} />
          ) : (
            <div style={{ ...am.thumb, background: PLACEHOLDER_COLORS[(item.name.charCodeAt(0) || 0) % PLACEHOLDER_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(0,0,0,0.15)' }}>{item.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={am.itemName}>{item.name}</div>
            {item.description && <div style={am.itemDesc}>{item.description}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <span style={am.price}>${Number(item.price).toFixed(2)}</span>
              {item.estimatedMinutes && (
                <span style={am.est}><Clock size={10} color="#9CA3AF" /> ~{item.estimatedMinutes} min</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button style={am.iconBtn} onClick={onEdit} title="Edit item"><Pencil size={14} color="#1D4ED8" /></button>
            <button style={{ ...am.iconBtn, background: '#FEF2F2' }} onClick={handleDelete} title="Delete item"><Trash2 size={14} color="#EF4444" /></button>
          </div>
        </div>

        {/* Assign section */}
        <div style={am.sectionHead}>
          <span style={am.sectionTitle}>Assign to Stores</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button style={{ ...am.bulk, ...(allOn  ? am.bulkOn : {}) }} onClick={() => setLocalSelected(new Set(stores.map(s => s.id)))}>All</button>
            <button style={{ ...am.bulk, ...(noneOn ? am.bulkOn : {}) }} onClick={() => setLocalSelected(new Set())}>None</button>
            <span style={am.count}>{assignLoading ? '…' : `${localSelected.size} / ${stores.length}`}</span>
          </div>
        </div>

        {assignLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={am.storeList}>
            {stores.map(store => {
              const checked = localSelected.has(store.id);
              return (
                <label key={store.id} style={{ ...am.storeRow, ...(checked ? am.storeRowOn : {}) }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(store.id)}
                    style={{ display: 'none' }}
                  />
                  <div style={{ ...am.checkbox, ...(checked ? am.checkboxOn : {}) }}>
                    {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ ...am.storeName, ...(checked ? { fontWeight: 700, color: '#0F172A' } : {}) }}>{store.name}</span>
                </label>
              );
            })}
          </div>
        )}

        <div style={am.footer}>
          <button style={f.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...f.primaryBtn, opacity: (!hasChanges || saving) ? 0.5 : 1, cursor: (!hasChanges || saving) ? 'default' : 'pointer' }}
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? 'Saving…' : hasChanges ? `Save · ${localSelected.size} store${localSelected.size !== 1 ? 's' : ''}` : 'No changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HotFood() {
  const { user }  = useAuthStore();
  const qc        = useQueryClient();

  const [view,        setView]        = useState<MainView>('orders');
  const [orderTab,    setOrderTab]    = useState<OrderTab>('PENDING');
  const [filterStore, setFilterStore] = useState('');
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);

  // Catalog state
  const [search,       setSearch]       = useState('');
  const [assignItem,   setAssignItem]   = useState<CatalogItem | null>(null);
  const [editItem,     setEditItem]     = useState<CatalogItem | null | 'new'>(null);
  const [showAddEdit,  setShowAddEdit]  = useState(false);

  // Stores
  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: storesApi.getAll,
  });
  const stores: Store[] = storesData?.data?.data ?? [];

  // ── Orders ─────────────────────────────────────────────────────────────────

  const { data: ordersData, isLoading: ordersLoading, isRefetching, refetch } = useQuery({
    queryKey: ['hot-food-orders-admin', filterStore],
    queryFn: () => hotFoodApi.getAllOrders(filterStore ? { storeId: filterStore } : undefined),
    enabled: view === 'orders',
    refetchInterval: 20_000,
  });
  const allOrders: FoodOrder[] = ordersData?.data?.data ?? [];

  const orderCounts = {
    PENDING:  allOrders.filter(o => o.status === 'PENDING').length,
    ACCEPTED: allOrders.filter(o => o.status === 'ACCEPTED').length,
    READY:    allOrders.filter(o => o.status === 'READY').length,
    ALL:      allOrders.length,
  };

  const filteredOrders = useMemo(() => {
    if (orderTab === 'ALL') return allOrders;
    return allOrders.filter(o => o.status === orderTab);
  }, [allOrders, orderTab]);

  async function handleUpdateOrder(orderId: string, status: OrderStatus) {
    if (updatingId) return;
    setUpdatingId(orderId);
    try {
      await hotFoodApi.updateStatus(orderId, status);
      qc.invalidateQueries({ queryKey: ['hot-food-orders-admin'] });
      toast.success(`Order ${STATUS_CFG[status].label.toLowerCase()}`);
    } catch {
      toast.error('Failed to update order');
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Catalog ────────────────────────────────────────────────────────────────

  const { data: catalogData, isLoading: catalogLoading, refetch: refetchCatalog } = useQuery({
    queryKey: ['hot-food-catalog'],
    queryFn: hotFoodCatalogApi.getAll,
    enabled: view === 'catalog',
    staleTime: 2 * 60_000,
  });
  const catalogItems: CatalogItem[] = catalogData?.data?.data ?? [];

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalogItems;
    const q = search.trim().toLowerCase();
    return catalogItems.filter(i => i.name.toLowerCase().includes(q));
  }, [catalogItems, search]);

  const pendingCount = orderCounts.PENDING;

  return (
    <div style={pg.container}>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={pg.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={pg.iconWrap}><Flame size={18} color="#fff" /></div>
          <div>
            <h1 style={pg.title}>Hot Food</h1>
            <p style={pg.sub}>
              {view === 'orders'
                ? pendingCount > 0 ? `${pendingCount} pending order${pendingCount !== 1 ? 's' : ''} · auto-refreshes every 20s` : 'Live order board · auto-refreshes every 20s'
                : `${catalogItems.length} item${catalogItems.length !== 1 ? 's' : ''} in catalog`}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Orders / Catalog toggle */}
          <div style={pg.toggle}>
            <button
              style={{ ...pg.toggleBtn, ...(view === 'orders' ? pg.toggleBtnOn : {}) }}
              onClick={() => setView('orders')}
            >
              Orders
              {pendingCount > 0 && (
                <span style={{ ...pg.toggleBadge, ...(view === 'orders' ? pg.toggleBadgeOn : {}) }}>
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              style={{ ...pg.toggleBtn, ...(view === 'catalog' ? pg.toggleBtnOn : {}) }}
              onClick={() => setView('catalog')}
            >
              Catalog
            </button>
          </div>

          {view === 'orders' ? (
            <button style={pg.refreshBtn} onClick={() => refetch()}>
              <RefreshCw size={13} style={isRefetching ? { animation: 'spin 1s linear infinite' } : {}} />
              Refresh
            </button>
          ) : (
            <button style={pg.addBtn} onClick={() => { setEditItem(null); setShowAddEdit(true); }}>
              <Plus size={14} />
              Add Item
            </button>
          )}
        </div>
      </div>

      {/* ── Orders view ─────────────────────────────────────────────────── */}
      {view === 'orders' && (
        <>
          <div style={pg.toolbar}>
            {/* Tab pills */}
            <div style={pg.tabs}>
              {ORDER_TABS.map(t => (
                <button
                  key={t.key}
                  style={{ ...pg.tab, ...(orderTab === t.key ? pg.tabOn : {}) }}
                  onClick={() => setOrderTab(t.key)}
                >
                  {t.label}
                  {orderCounts[t.key] > 0 && (
                    <span style={{ ...pg.tabBadge, ...(orderTab === t.key ? pg.tabBadgeOn : {}) }}>
                      {orderCounts[t.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Store filter */}
            <div style={pg.selectWrap}>
              <select style={pg.select} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
                <option value="">All stores</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={13} style={pg.selectIcon} />
            </div>
          </div>

          {ordersLoading ? (
            <div style={pg.empty}>Loading orders…</div>
          ) : filteredOrders.length === 0 ? (
            <div style={pg.empty}>
              <Flame size={36} color="#E5E7EB" />
              <p style={{ color: '#9CA3AF', marginTop: 8 }}>
                No {orderTab === 'ALL' ? '' : orderTab.toLowerCase() + ' '}orders right now
              </p>
            </div>
          ) : (
            <div style={pg.orderGrid}>
              {filteredOrders.map(o => (
                <OrderCard key={o.id} order={o} onUpdate={handleUpdateOrder} updatingId={updatingId} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Catalog view ─────────────────────────────────────────────────── */}
      {view === 'catalog' && (
        <>
          <div style={pg.catalogBar}>
            <div style={pg.searchWrap}>
              <Search size={15} style={pg.searchIcon} color="#9CA3AF" />
              <input
                style={pg.searchInput}
                placeholder="Search catalog…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button style={pg.ghostBtn} onClick={() => refetchCatalog()}>
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>

          {catalogLoading ? (
            <div style={pg.empty}>Loading catalog…</div>
          ) : filteredCatalog.length === 0 ? (
            <div style={pg.empty}>
              <Flame size={36} color="#E5E7EB" />
              <p style={{ color: '#9CA3AF', marginTop: 8 }}>
                {search.trim() ? 'No items match your search' : 'No items yet. Add one to get started.'}
              </p>
            </div>
          ) : (
            <div style={pg.tileGrid}>
              {filteredCatalog.map(item => {
                const initial = item.name.charAt(0).toUpperCase();
                const placeholderBg = PLACEHOLDER_COLORS[(initial.charCodeAt(0) || 0) % PLACEHOLDER_COLORS.length];
                return (
                  <div
                    key={item.id}
                    style={pg.tile}
                    onClick={() => setAssignItem(item)}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = 'none'}
                    title="Click to manage store assignment"
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} style={pg.tileImg} />
                    ) : (
                      <div style={{ ...pg.tileImg, background: placeholderBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 40, fontWeight: 900, color: 'rgba(0,0,0,0.12)' }}>{initial}</span>
                      </div>
                    )}
                    <div style={pg.tileBody}>
                      <div style={pg.tileName}>{item.name}</div>
                      <div style={pg.tileBottom}>
                        <span style={pg.tilePrice}>${Number(item.price).toFixed(2)}</span>
                        <div style={{ ...pg.storeBadge, ...(item.storeCount === 0 ? pg.storeBadgeNone : {}) }}>
                          <Building2 size={9} color={item.storeCount > 0 ? '#3B82F6' : '#9CA3AF'} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: item.storeCount > 0 ? '#3B82F6' : '#9CA3AF' }}>
                            {item.storeCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showAddEdit && (
        <AddEditModal
          item={editItem === 'new' ? null : editItem}
          onClose={() => setShowAddEdit(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['hot-food-catalog'] })}
        />
      )}
      {assignItem && (
        <AssignModal
          item={assignItem}
          stores={stores}
          onClose={() => setAssignItem(null)}
          onEdit={() => {
            const i = assignItem;
            setAssignItem(null);
            setTimeout(() => { setEditItem(i); setShowAddEdit(true); }, 200);
          }}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pg: Record<string, React.CSSProperties> = {
  container:    { padding: '24px 28px', minHeight: '100%' },
  header:       { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  iconWrap:     { width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #EA580C, #F97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:        { fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 },
  sub:          { fontSize: 13, color: '#6B7280', marginTop: 2 },

  toggle:       { display: 'flex', background: '#F1F5F9', borderRadius: 10, padding: 3, gap: 2 },
  toggleBtn:    { border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: '#64748B', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 150ms, color 150ms' },
  toggleBtnOn:  { background: '#fff', color: '#1D4ED8', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  toggleBadge:  { background: '#E2E8F0', color: '#64748B', borderRadius: 8, padding: '1px 6px', fontSize: 11, fontWeight: 700 },
  toggleBadgeOn:{ background: '#EA580C', color: '#fff' },

  refreshBtn:   { display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#374151' },
  addBtn:       { display: 'flex', alignItems: 'center', gap: 6, background: '#EA580C', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  ghostBtn:     { display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#374151' },

  toolbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  tabs:         { display: 'flex', gap: 6 },
  tab:          { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: 'none', background: '#F1F5F9', color: '#64748B', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  tabOn:        { background: '#EA580C', color: '#fff' },
  tabBadge:     { background: '#E2E8F0', borderRadius: 8, padding: '1px 6px', fontSize: 11, fontWeight: 700, color: '#64748B' },
  tabBadgeOn:   { background: 'rgba(255,255,255,0.25)', color: '#fff' },
  selectWrap:   { position: 'relative', display: 'inline-flex', alignItems: 'center' },
  select:       { appearance: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 32px 7px 12px', fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none' },
  selectIcon:   { position: 'absolute', right: 10, pointerEvents: 'none', color: '#9CA3AF' },

  orderGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  empty:        { padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },

  catalogBar:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  searchWrap:   { position: 'relative', flex: 1, maxWidth: 340 },
  searchIcon:   { position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  searchInput:  { width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px 8px 34px', fontSize: 14, color: '#374151', outline: 'none', background: '#fff', boxSizing: 'border-box' },

  tileGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 },
  tile:         { background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden', cursor: 'pointer', transition: 'transform 150ms, box-shadow 150ms', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  tileImg:      { width: '100%', aspectRatio: '1', objectFit: 'cover' },
  tileBody:     { padding: '10px 12px' },
  tileName:     { fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 6, lineHeight: '1.3', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  tileBottom:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  tilePrice:    { fontSize: 13, fontWeight: 700, color: '#EA580C' },
  storeBadge:   { display: 'flex', alignItems: 'center', gap: 3, background: '#EFF6FF', borderRadius: 6, padding: '2px 6px' },
  storeBadgeNone:{ background: '#F1F5F9' },
};

const oc: Record<string, React.CSSProperties> = {
  card:      { background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  top:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  num:       { fontSize: 15, fontWeight: 800, color: '#0F172A' },
  badge:     { borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  meta:      { display: 'flex', alignItems: 'center', gap: 5 },
  metaTxt:   { fontSize: 12, color: '#9CA3AF' },
  dot:       { width: 3, height: 3, borderRadius: '50%', background: '#D1D5DB' },
  custName:  { fontSize: 14, fontWeight: 700, color: '#0F172A' },
  custPhone: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  items:     { borderTop: '1px solid #F1F5F9', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 },
  itemRow:   { display: 'flex', alignItems: 'center', gap: 5 },
  qty:       { fontSize: 13, fontWeight: 700, color: '#EA580C', width: 22, flexShrink: 0 },
  iname:     { flex: 1, fontSize: 13, color: '#374151' },
  iprice:    { fontSize: 13, fontWeight: 600, color: '#0F172A' },
  totalRow:  { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: 6, marginTop: 2 },
  totalLbl:  { fontSize: 12, color: '#9CA3AF', fontWeight: 600 },
  totalVal:  { fontSize: 14, fontWeight: 800, color: '#0F172A' },
  note:      { background: '#FFFBEB', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 },
  noteLbl:   { fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' },
  noteTxt:   { fontSize: 13, color: '#78350F', lineHeight: '1.4' },
  actions:   { display: 'flex', gap: 8 },
  btn:       { flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 },
  cancelBtn: { width: 34, height: 34, borderRadius: 8, border: 'none', background: '#FEF2F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  done:      { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', paddingTop: 2 },
};

const md: Record<string, React.CSSProperties> = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  panel:     { background: '#fff', borderRadius: 16, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  head:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #F3F4F6' },
  headTitle: { fontWeight: 700, fontSize: 16, color: '#111827' },
  closeBtn:  { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 },
  body:      { padding: '16px 20px 0' },
  footer:    { display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #F3F4F6', marginTop: 16 },
  imgWrap:   { position: 'relative', width: 140, height: 140, borderRadius: 16, overflow: 'hidden', margin: '0 auto 18px', border: '2px dashed #E2E8F0', cursor: 'pointer', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  imgPreview:{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  imgPlaceholder:{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  imgBadge:  { position: 'absolute', bottom: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: '#EA580C', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};

const am: Record<string, React.CSSProperties> = {
  itemRow:   { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: '1px solid #F3F4F6' },
  thumb:     { width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0 },
  itemName:  { fontSize: 16, fontWeight: 700, color: '#111827' },
  itemDesc:  { fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: '1.4' },
  price:     { fontSize: 13, fontWeight: 700, color: '#EA580C' },
  est:       { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#9CA3AF' },
  iconBtn:   { width: 30, height: 30, borderRadius: 8, border: 'none', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  sectionHead:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' },
  sectionTitle:{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' },
  bulk:      { padding: '4px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#F1F5F9', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#64748B' },
  bulkOn:    { background: '#1D3557', border: '1px solid #1D3557', color: '#fff' },
  count:     { fontSize: 13, fontWeight: 700, color: '#1D4ED8', minWidth: 40, textAlign: 'right' },
  storeList: { maxHeight: 240, overflowY: 'auto' },
  storeRow:  { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid #F9FAFB', cursor: 'pointer', transition: 'background 100ms' },
  storeRowOn:{ background: '#F0FDF4' },
  checkbox:  { width: 18, height: 18, borderRadius: 4, border: '2px solid #D1D5DB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxOn:{ background: '#16A34A', borderColor: '#16A34A' },
  storeName: { fontSize: 14, color: '#374151', fontWeight: 500 },
  footer:    { display: 'flex', gap: 10, padding: '14px 20px' },
};

const f: Record<string, React.CSSProperties> = {
  label:      { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4, marginTop: 12 },
  input:      { width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' },
  cancelBtn:  { flex: 1, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#374151' },
  primaryBtn: { flex: 1, background: '#EA580C', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#fff' },
};
