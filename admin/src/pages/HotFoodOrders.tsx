import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { hotFoodApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ErrorState from '../components/ErrorState';
import { Flame, Clock, CheckCircle, X, RefreshCw, ChevronDown } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'CANCELLED';
type Tab = 'PENDING' | 'ACCEPTED' | 'READY' | 'ALL';

interface OrderItem { name: string; quantity: number; price: number }
interface FoodOrder {
  id: string;
  orderNumber: string;
  store: { id: string; name: string };
  customer: { name: string; phone: string };
  items: OrderItem[];
  note?: string;
  status: OrderStatus;
  createdAt: string;
  estimatedMinutes?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

const STATUS_CFG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pending',   color: '#F97316', bg: '#FFF7ED' },
  ACCEPTED:  { label: 'Preparing', color: '#3B82F6', bg: '#EFF6FF' },
  READY:     { label: 'Ready',     color: '#16A34A', bg: '#F0FDF4' },
  COMPLETED: { label: 'Done',      color: '#94A3B8', bg: '#F8FAFC' },
  CANCELLED: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2' },
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'PENDING',  label: 'Pending'   },
  { key: 'ACCEPTED', label: 'Preparing' },
  { key: 'READY',    label: 'Ready'     },
  { key: 'ALL',      label: 'All'       },
];

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order, onUpdate, updatingId,
}: { order: FoodOrder; onUpdate: (id: string, status: OrderStatus) => void; updatingId: string | null }) {
  const cfg   = STATUS_CFG[order.status];
  const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const busy  = updatingId === order.id;

  return (
    <div style={c.card}>
      <div style={c.cardTop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={c.orderNum}>#{order.orderNumber}</span>
          <span style={{ ...c.statusBadge, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
        </div>
        <div style={c.meta}>
          <Clock size={12} color="#9CA3AF" />
          <span style={c.metaText}>{timeAgo(order.createdAt)}</span>
          <span style={c.dot} />
          <span style={c.metaText}>{order.store.name}</span>
        </div>
      </div>

      <div style={c.customer}>
        <span style={c.customerName}>{order.customer.name}</span>
        <span style={c.customerPhone}>{order.customer.phone}</span>
      </div>

      <div style={c.itemsList}>
        {order.items.map((item, i) => (
          <div key={i} style={c.itemRow}>
            <span style={c.itemQty}>{item.quantity}×</span>
            <span style={c.itemName}>{item.name}</span>
            <span style={c.itemPrice}>${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div style={c.totalRow}>
          <span style={c.totalLabel}>Total</span>
          <span style={c.totalValue}>${total.toFixed(2)}</span>
        </div>
      </div>

      {order.note && (
        <div style={c.noteBox}>
          <span style={c.noteLabel}>Note</span>
          <span style={c.noteText}>{order.note}</span>
        </div>
      )}

      <div style={c.actions}>
        {order.status === 'PENDING' && (
          <button style={{ ...c.actionBtn, background: '#F97316', opacity: busy ? 0.6 : 1 }} onClick={() => onUpdate(order.id, 'ACCEPTED')} disabled={busy}>
            {busy ? 'Updating…' : 'Accept Order'}
          </button>
        )}
        {order.status === 'ACCEPTED' && (
          <button style={{ ...c.actionBtn, background: '#3B82F6', opacity: busy ? 0.6 : 1 }} onClick={() => onUpdate(order.id, 'READY')} disabled={busy}>
            {busy ? 'Updating…' : 'Mark Ready'}
          </button>
        )}
        {order.status === 'READY' && (
          <>
            <button style={{ ...c.actionBtn, background: '#16A34A', flex: 1, opacity: busy ? 0.6 : 1 }} onClick={() => onUpdate(order.id, 'COMPLETED')} disabled={busy}>
              <CheckCircle size={14} color="#fff" />
              {busy ? 'Updating…' : 'Complete'}
            </button>
            <button style={{ ...c.cancelBtn, opacity: busy ? 0.6 : 1 }} onClick={() => onUpdate(order.id, 'CANCELLED')} disabled={busy} title="Cancel order">
              <X size={14} color="#EF4444" />
            </button>
          </>
        )}
        {(order.status === 'COMPLETED' || order.status === 'CANCELLED') && (
          <div style={c.doneLine}>
            <CheckCircle size={14} color={order.status === 'COMPLETED' ? '#16A34A' : '#D1D5DB'} />
            <span style={{ fontSize: 15, color: order.status === 'COMPLETED' ? '#16A34A' : '#9CA3AF', fontWeight: 600 }}>
              {order.status === 'COMPLETED' ? 'Completed' : 'Cancelled'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HotFoodOrders() {
  const { user }     = useAuthStore();
  const qc           = useQueryClient();
  const isManager    = user?.role === 'STORE_MANAGER';
  const myStoreId    = isManager ? user?.storeIds?.[0] : undefined;

  const [activeTab,   setActiveTab]   = useState<Tab>('PENDING');
  const [filterStore, setFilterStore] = useState(myStoreId ?? '');
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: storesApi.getAll,
    enabled: !isManager,
  });
  const stores = (storesData?.data?.data ?? []) as { id: string; name: string }[];

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['hot-food-orders-admin', filterStore],
    queryFn: () => hotFoodApi.getAllOrders(filterStore ? { storeId: filterStore } : undefined),
    refetchInterval: 20_000,
  });
  const allOrders: FoodOrder[] = data?.data?.data ?? [];

  const counts = {
    PENDING:  allOrders.filter(o => o.status === 'PENDING').length,
    ACCEPTED: allOrders.filter(o => o.status === 'ACCEPTED').length,
    READY:    allOrders.filter(o => o.status === 'READY').length,
    ALL:      allOrders.length,
  };

  const filtered = useMemo(() => {
    if (activeTab === 'ALL') return allOrders;
    return allOrders.filter(o => o.status === activeTab);
  }, [allOrders, activeTab]);

  async function handleUpdate(orderId: string, status: OrderStatus) {
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

  return (
    <div style={pg.container}>
      {/* Header */}
      <div style={pg.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={pg.iconWrap}><Flame size={18} color="#fff" /></div>
          <div>
            <h1 style={pg.title}>Hot Food Orders</h1>
            <p style={pg.sub}>Live order board — auto-refreshes every 20 seconds</p>
          </div>
        </div>
        <button style={pg.refreshBtn} onClick={() => refetch()} title="Refresh now">
          <RefreshCw size={14} style={isRefetching ? { animation: 'spin 1s linear infinite' } : {}} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={pg.toolbar}>
        {/* Tab pills */}
        <div style={pg.tabs}>
          {TABS.map(t => (
            <button
              key={t.key}
              style={{ ...pg.tab, ...(activeTab === t.key ? pg.tabActive : {}) }}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {counts[t.key] > 0 && (
                <span style={{ ...pg.tabBadge, ...(activeTab === t.key ? pg.tabBadgeActive : {}) }}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Store filter */}
        {!isManager && (
          <div style={pg.selectWrap}>
            <select style={pg.select} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
              <option value="">All stores</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <ChevronDown size={13} style={pg.selectIcon} />
          </div>
        )}
      </div>

      {/* Order grid */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <div style={pg.empty}>Loading orders…</div>
      ) : filtered.length === 0 ? (
        <div style={pg.empty}>
          <Flame size={36} color="#E5E7EB" />
          <p style={{ color: '#9CA3AF', marginTop: 8 }}>
            No {activeTab === 'ALL' ? '' : activeTab.toLowerCase() + ' '}orders right now
          </p>
        </div>
      ) : (
        <div style={pg.grid}>
          {filtered.map(order => (
            <OrderCard key={order.id} order={order} onUpdate={handleUpdate} updatingId={updatingId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pg: Record<string, React.CSSProperties> = {
  container:  { padding: '24px 28px' },
  header:     { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  iconWrap:   { width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #EA580C, #F97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:      { fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 },
  sub:        { fontSize: 15, color: '#6B7280', marginTop: 2 },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer', color: '#374151' },
  toolbar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  tabs:       { display: 'flex', gap: 6 },
  tab:        { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: 'none', background: '#F1F5F9', color: '#64748B', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  tabActive:  { background: '#EA580C', color: '#fff' },
  tabBadge:   { background: '#E2E8F0', borderRadius: 8, padding: '1px 6px', fontSize: 13, fontWeight: 700, color: '#64748B' },
  tabBadgeActive: { background: 'rgba(255,255,255,0.25)', color: '#fff' },
  selectWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
  select:     { appearance: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 32px 7px 12px', fontSize: 15, color: '#374151', background: '#fff', cursor: 'pointer', outline: 'none' },
  selectIcon: { position: 'absolute', right: 10, pointerEvents: 'none', color: '#9CA3AF' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  empty:      { padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
};

const c: Record<string, React.CSSProperties> = {
  card:         { background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  cardTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderNum:     { fontSize: 15, fontWeight: 800, color: '#0F172A' },
  statusBadge:  { borderRadius: 20, padding: '3px 10px', fontSize: 14, fontWeight: 700 },
  meta:         { display: 'flex', alignItems: 'center', gap: 5 },
  metaText:     { fontSize: 14, color: '#9CA3AF' },
  dot:          { width: 3, height: 3, borderRadius: '50%', background: '#D1D5DB' },
  customer:     { display: 'flex', flexDirection: 'column', gap: 2 },
  customerName: { fontSize: 14, fontWeight: 700, color: '#0F172A' },
  customerPhone:{ fontSize: 14, color: '#9CA3AF' },
  itemsList:    { borderTop: '1px solid #F1F5F9', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  itemRow:      { display: 'flex', alignItems: 'center', gap: 6 },
  itemQty:      { fontSize: 15, fontWeight: 700, color: '#EA580C', width: 24, flexShrink: 0 },
  itemName:     { flex: 1, fontSize: 15, color: '#374151' },
  itemPrice:    { fontSize: 15, fontWeight: 600, color: '#0F172A' },
  totalRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: 8, marginTop: 2 },
  totalLabel:   { fontSize: 14, color: '#9CA3AF', fontWeight: 600 },
  totalValue:   { fontSize: 15, fontWeight: 800, color: '#0F172A' },
  noteBox:      { background: '#FFFBEB', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 },
  noteLabel:    { fontSize: 12, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' },
  noteText:     { fontSize: 15, color: '#78350F', lineHeight: '1.4' },
  actions:      { display: 'flex', gap: 8 },
  actionBtn:    { flex: 1, border: 'none', borderRadius: 10, padding: '10px 0', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cancelBtn:    { width: 38, height: 38, borderRadius: 8, border: 'none', background: '#FEF2F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  doneLine:     { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', paddingTop: 4 },
};
