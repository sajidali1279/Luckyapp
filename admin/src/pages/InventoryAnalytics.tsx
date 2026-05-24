import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { inventoryAnalyticsApi, storesApi, orderCategoriesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

const PERIODS = [
  { value: '7',   label: '7 days'   },
  { value: '30',  label: '30 days'  },
  { value: '90',  label: '90 days'  },
  { value: 'all', label: 'All time' },
];

const CHART_COLORS = [
  '#E63946', '#1D3557', '#F4A261', '#2DC653', '#6A4C93',
  '#1CBEC0', '#F7B731', '#FC5C65', '#45AAF2', '#26DE81',
];

function PctBar({ label, pct, count, color }: { label: string; pct: number; count: number; color: string }) {
  return (
    <div style={b.row}>
      <span style={b.label}>{label}</span>
      <div style={b.track}>
        <div style={{ ...b.fill, width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
      </div>
      <span style={b.count}>{count} ({pct}%)</span>
    </div>
  );
}

export default function InventoryAnalytics() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = isDevAdmin || isSuperAdmin;

  const [storeId,  setStoreId]  = useState('');
  const [period,   setPeriod]   = useState('30');
  const [category, setCategory] = useState('');

  // Stores list for filter
  const { data: storesData } = useQuery({
    queryKey: ['all-stores'],
    queryFn: storesApi.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data || [];

  // Categories for filter
  const { data: catData } = useQuery({
    queryKey: ['order-categories-admin'],
    queryFn: () => orderCategoriesApi.adminGetAll('APPROVED'),
    staleTime: 10 * 60 * 1000,
  });
  const categories: { id: string; name: string }[] = catData?.data?.data || [];

  // Inventory analytics
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory-analytics-admin', storeId, period, category],
    queryFn: () => inventoryAnalyticsApi.get({
      storeId: storeId || undefined,
      period,
      category: category || undefined,
    }),
  });
  const analytics = data?.data?.data;

  const topItems:     { name: string; category: string | null; orderCount: number }[] = analytics?.topItems     || [];
  const catBreakdown: { category: string; count: number; pct: number }[]              = analytics?.categoryBreakdown || [];
  const storeBrkdown: { storeId: string; storeName: string; itemCount: number }[]     = analytics?.storeBreakdown || [];
  const totalItems: number = analytics?.totalItems ?? 0;

  // Recharts data
  const chartData = topItems.slice(0, 15).map(i => ({ name: i.name, orders: i.orderCount }));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Inventory Intelligence</h1>
          <p style={s.sub}>Order history across {stores.length} stores — {totalItems} items tracked</p>
        </div>
        <button style={s.refreshBtn} onClick={() => refetch()} aria-label="Refresh analytics data">↺ Refresh</button>
      </div>

      {/* Filters */}
      <div style={s.filterBar}>
        {/* Period */}
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Period</label>
          <div style={s.segmented}>
            {PERIODS.map((p, idx) => (
              <button
                key={p.value}
                style={{ ...s.seg, ...(period === p.value ? s.segActive : {}), ...(idx === PERIODS.length - 1 ? { borderRight: 'none' } : {}) }}
                onClick={() => setPeriod(p.value)}
                aria-pressed={period === p.value}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Store filter (admin only) */}
        {isAdmin && (
          <div style={s.filterGroup}>
            <label style={s.filterLabel}>Store</label>
            <select style={s.select} value={storeId} onChange={e => setStoreId(e.target.value)}>
              <option value="">All stores</option>
              {stores.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Category filter */}
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Category</label>
          <select style={s.select} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={s.loading}>Loading analytics…</div>
      ) : (
        <div style={s.grid}>
          {/* Top Items Chart */}
          <div style={{ ...s.card, gridColumn: '1 / -1' }}>
            <h2 style={s.cardTitle}>Most Ordered Items (Top 15)</h2>
            {chartData.length === 0 ? (
              <p style={s.empty}>No order data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    formatter={(v: number) => [`${v} orders`, 'Orders']}
                  />
                  <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category Breakdown */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>By Category</h2>
            <p style={s.cardSub}>{totalItems} total order lines</p>
            {catBreakdown.length === 0 ? (
              <p style={s.empty}>No data</p>
            ) : (
              <div style={b.list}>
                {catBreakdown.map((cat, idx) => (
                  <PctBar
                    key={cat.category}
                    label={cat.category}
                    pct={cat.pct}
                    count={cat.count}
                    color={CHART_COLORS[idx % CHART_COLORS.length]}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Top Items Table */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>Top Items (Detail)</h2>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>#</th>
                  <th style={s.th}>Item</th>
                  <th style={s.th}>Category</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Orders</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} style={idx % 2 === 0 ? {} : s.rowAlt}>
                    <td style={s.td}>{idx + 1}</td>
                    <td style={s.td}>{item.name}</td>
                    <td style={{ ...s.td, color: '#6B7280' }}>{item.category || '—'}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{item.orderCount}</td>
                  </tr>
                ))}
                {topItems.length === 0 && (
                  <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color: '#9CA3AF' }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Store Breakdown (admin only) */}
          {isAdmin && storeBrkdown.length > 0 && (
            <div style={{ ...s.card, gridColumn: '1 / -1' }}>
              <h2 style={s.cardTitle}>By Store</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={storeBrkdown.map(s => ({ name: s.storeName, items: s.itemCount }))}
                  margin={{ top: 8, right: 16, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    formatter={(v: number) => [`${v}`, 'Order lines']}
                  />
                  <Bar dataKey="items" fill="#1D3557" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '24px 32px', maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title:  { margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' },
  sub:    { margin: '4px 0 0', fontSize: 13, color: '#6B7280' },
  refreshBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151',
  },
  filterBar:   { display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  segmented: { display: 'flex', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' },
  seg: {
    padding: '7px 14px', border: 'none', backgroundColor: '#fff',
    cursor: 'pointer', fontSize: 13, color: '#6B7280', fontWeight: 500,
    borderRight: '1px solid #E5E7EB',
  },
  segActive: { backgroundColor: '#1D3557', color: '#fff', fontWeight: 700 },
  select: {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB',
    backgroundColor: '#fff', fontSize: 13, color: '#374151', minWidth: 160,
  },
  loading: { textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 15 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E5E7EB',
    padding: '20px 24px',
  },
  cardTitle: { margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#111827' },
  cardSub:   { margin: '0 0 16px', fontSize: 12, color: '#6B7280' },
  empty: { textAlign: 'center', color: '#9CA3AF', padding: '32px 0', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11,
    color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid #F3F4F6',
  },
  td: { padding: '9px 12px', borderBottom: '1px solid #F9FAFB', color: '#374151', verticalAlign: 'middle' },
  rowAlt: { backgroundColor: '#FAFAFA' },
};

const b: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  row:  { display: 'flex', alignItems: 'center', gap: 10 },
  label:{ fontSize: 13, color: '#374151', width: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  track:{ flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, transition: 'width 0.3s ease' },
  count:{ fontSize: 12, color: '#6B7280', width: 90, textAlign: 'right' as const },
};
