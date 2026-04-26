import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { pointsApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

const CATEGORIES = [
  { value: 'GAS', label: '⛽ Gas' },
  { value: 'DIESEL', label: '🚛 Diesel' },
  { value: 'GROCERIES', label: '🛒 Groceries' },
  { value: 'HOT_FOODS', label: '🌮 Hot Foods' },
  { value: 'FROZEN_FOODS', label: '🧊 Frozen Foods' },
  { value: 'FRESH_FOODS', label: '🥗 Fresh Foods' },
  { value: 'TOBACCO_VAPES', label: '🚬 Tobacco/Vapes' },
  { value: 'ALCOHOL', label: '🍺 Alcohol' },
  { value: 'OTHER', label: '🏪 Other' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#F4A261',
  APPROVED: '#2DC653',
  REJECTED: '#E63946',
};

function fmt$(n: number) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function Transactions() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  // Filters
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [page, setPage] = useState(1);

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
    enabled: isSuperAdmin,
  });

  // For StoreManager: auto-select their store
  useEffect(() => {
    if (isSuperAdmin) return; // SuperAdmin starts with "All Stores"
    if (selectedStore) return;
    if (user?.storeIds?.length) {
      setSelectedStore(user.storeIds[0]);
    } else {
      const stores = storesData?.data?.data || [];
      if (stores.length) setSelectedStore(stores[0].id);
    }
  }, [storesData, user, selectedStore, isSuperAdmin]);

  useEffect(() => { setPage(1); }, [selectedStore, statusFilter, categoryFilter, from, to]);

  // SuperAdmin: use all-transactions endpoint
  const allTxParams: Record<string, string> = { page: String(page), limit: '25' };
  if (selectedStore)  allTxParams.storeId   = selectedStore;
  if (statusFilter)   allTxParams.status    = statusFilter;
  if (categoryFilter) allTxParams.category  = categoryFilter;
  if (from)           allTxParams.from      = new Date(from).toISOString();
  if (to)             allTxParams.to        = to;

  const { data: allTxData, isLoading: allTxLoading } = useQuery({
    queryKey: ['all-transactions', allTxParams],
    queryFn: () => pointsApi.getAllTransactions(allTxParams),
    enabled: isSuperAdmin,
  });

  // StoreManager: use per-store endpoint
  const { data: storeTxData, isLoading: storeTxLoading } = useQuery({
    queryKey: ['transactions', selectedStore, statusFilter, page],
    queryFn: () => pointsApi.getStoreTransactions(selectedStore, statusFilter || undefined, page),
    enabled: !isSuperAdmin && !!selectedStore,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => pointsApi.reject(id),
    onSuccess: () => {
      toast.success('Transaction rejected');
      qc.invalidateQueries({ queryKey: ['all-transactions'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => toast.error('Failed to reject'),
  });

  const stores = storesData?.data?.data || [];

  // Unified data
  const transactions = isSuperAdmin
    ? (allTxData?.data?.data?.transactions || [])
    : (storeTxData?.data?.data?.transactions || []);
  const total = isSuperAdmin
    ? (allTxData?.data?.data?.total || 0)
    : (storeTxData?.data?.data?.total || 0);
  const limit = isSuperAdmin ? 25 : (storeTxData?.data?.data?.limit || 20);
  const totalPages = Math.ceil(total / limit);
  const isLoading = isSuperAdmin ? allTxLoading : storeTxLoading;
  const summary = allTxData?.data?.data?.summary;

  function resetFilters() {
    setSelectedStore(''); setStatusFilter(''); setCategoryFilter('');
    setFrom(monthAgoStr()); setTo(todayStr()); setPage(1);
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🧾 Transactions</h1>
          <p style={s.sub}>Review and manage point grant activity</p>
        </div>
        {total > 0 && <div style={s.totalBadge}>{total.toLocaleString()} transaction{total !== 1 ? 's' : ''}</div>}
      </div>

      {/* ── Filters ── */}
      <div style={s.filterBar}>
        {isSuperAdmin && (
          <select style={s.select} value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}>
            <option value="">🌐 All Stores</option>
            {stores.map((store: any) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        )}

        <select style={s.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="PENDING">⏳ Pending</option>
          <option value="APPROVED">✓ Approved</option>
          <option value="REJECTED">✕ Rejected</option>
        </select>

        {isSuperAdmin && (
          <select style={s.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        )}

        {isSuperAdmin && (
          <>
            <input style={s.dateInput} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={{ color: '#6c757d', fontSize: 13 }}>to</span>
            <input style={s.dateInput} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button style={s.clearBtn} onClick={resetFilters}>Clear</button>
          </>
        )}
      </div>

      {/* ── Summary bar (SuperAdmin) ── */}
      {isSuperAdmin && summary && (
        <div style={s.summaryBar}>
          <div style={s.summaryItem}>
            <span style={s.summaryLabel}>Approved Volume</span>
            <span style={s.summaryValue}>{fmt$(summary.purchaseVolume)}</span>
          </div>
          <div style={s.summaryDivider} />
          <div style={s.summaryItem}>
            <span style={s.summaryLabel}>Cashback Issued</span>
            <span style={{ ...s.summaryValue, color: '#2DC653' }}>{fmt$(summary.cashbackIssued)}</span>
          </div>
          <div style={s.summaryDivider} />
          <div style={s.summaryItem}>
            <span style={s.summaryLabel}>Showing</span>
            <span style={s.summaryValue}>{total.toLocaleString()} records</span>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {!isSuperAdmin && !selectedStore ? (
        <div style={s.empty}>Select a store to view transactions.</div>
      ) : isLoading ? (
        <div style={s.empty}>Loading...</div>
      ) : transactions.length === 0 ? (
        <div style={s.empty}>No transactions found.</div>
      ) : (
        <>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Customer</th>
                <th style={s.th}>Amount</th>
                <th style={s.th}>Cashback</th>
                {isSuperAdmin && <th style={s.th}>Store</th>}
                <th style={s.th}>Category</th>
                <th style={s.th}>Employee</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Receipt</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx: any) => (
                <tr key={tx.id} style={tx.status === 'REJECTED' ? { opacity: 0.55 } : {}}>
                  <td style={s.td}>
                    <div>{format(new Date(tx.createdAt), 'MMM d')}</div>
                    <div style={{ fontSize: 11, color: '#adb5bd' }}>{format(new Date(tx.createdAt), 'h:mm a')}</div>
                  </td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{tx.customer?.name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#adb5bd' }}>{tx.customer?.phone}</div>
                  </td>
                  <td style={s.td}><strong>{fmt$(tx.purchaseAmount)}</strong></td>
                  <td style={s.td} ><span style={{ color: '#2DC653', fontWeight: 700 }}>{fmt$(tx.pointsAwarded)}</span></td>
                  {isSuperAdmin && (
                    <td style={s.td}><span style={{ fontSize: 13, color: '#1D3557', fontWeight: 600 }}>{tx.store?.name || '—'}</span></td>
                  )}
                  <td style={s.td}>
                    <span style={s.catBadge}>{tx.category?.replace(/_/g, ' ') || '—'}</span>
                  </td>
                  <td style={s.td}>{tx.grantedBy?.name || tx.grantedBy?.phone || '—'}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: STATUS_COLORS[tx.status] || '#dee2e6' }}>
                      {tx.status}
                    </span>
                  </td>
                  <td style={s.td}>
                    {tx.receiptImageUrl ? (
                      <a href={tx.receiptImageUrl} target="_blank" rel="noopener noreferrer" style={s.link}>View</a>
                    ) : '—'}
                  </td>
                  <td style={s.td}>
                    {tx.status === 'PENDING' && (
                      <button style={s.rejectBtn} onClick={() => rejectMutation.mutate(tx.id)}>Reject</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={s.pagination}>
              <button style={{ ...s.pageBtn, ...(page === 1 ? s.pageBtnDisabled : {}) }}
                onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span style={s.pageInfo}>Page {page} of {totalPages}</span>
              <button style={{ ...s.pageBtn, ...(page === totalPages ? s.pageBtnDisabled : {}) }}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1400, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4, marginBottom: 0 },
  totalBadge: { fontSize: 13, color: '#6c757d', fontWeight: 600, alignSelf: 'center' },

  filterBar: {
    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
    marginBottom: 16, padding: '14px 16px', background: '#f8f9fa', borderRadius: 12,
  },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, background: '#fff', cursor: 'pointer' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13 },
  clearBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6c757d', fontWeight: 600 },

  summaryBar: {
    display: 'flex', gap: 0, background: '#fff',
    borderRadius: 12, marginBottom: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2',
    overflow: 'hidden',
  },
  summaryItem: { flex: 1, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 2 },
  summaryDivider: { width: 1, background: '#f0f1f2' },
  summaryLabel: { fontSize: 11, color: '#6c757d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 20, fontWeight: 800, color: '#1D3557' },

  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  th: { background: '#f8f9fa', padding: '12px 14px', textAlign: 'left', fontSize: 12, color: '#6c757d', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderBottom: '1px solid #f0f1f2', fontSize: 13, verticalAlign: 'middle' },
  badge: { color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600 },
  catBadge: { background: '#f8f9fa', color: '#495057', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' },
  link: { color: '#1D3557', fontWeight: 600, fontSize: 13 },
  rejectBtn: { background: 'none', border: '1px solid #E63946', color: '#E63946', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 24 },
  pageBtn: { background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1D3557' },
  pageBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageInfo: { fontSize: 14, color: '#6c757d', fontWeight: 500 },
};
