import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { pointsApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

export default function Transactions() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const isAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
    enabled: isAdmin,
  });

  useEffect(() => {
    if (selectedStore) return;
    if (user?.storeIds?.length) {
      setSelectedStore(user.storeIds[0]);
    } else {
      const stores = storesData?.data?.data || [];
      if (stores.length) setSelectedStore(stores[0].id);
    }
  }, [storesData, user, selectedStore]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [selectedStore, statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', selectedStore, statusFilter, page],
    queryFn: () => pointsApi.getStoreTransactions(selectedStore, statusFilter || undefined, page),
    enabled: !!selectedStore,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => pointsApi.reject(id),
    onSuccess: () => {
      toast.success('Transaction rejected');
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => toast.error('Failed to reject'),
  });

  const stores = storesData?.data?.data || [];
  const transactions = data?.data?.data?.transactions || [];
  const total = data?.data?.data?.total || 0;
  const limit = data?.data?.data?.limit || 20;
  const totalPages = Math.ceil(total / limit);

  return (
    <div style={s.container}>
      <h1 style={s.title}>🧾 Transactions</h1>
      <p style={s.sub}>Review point grant activity and receipts</p>

      <div style={s.filters}>
        {isAdmin && (
          <select style={s.select} value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}>
            <option value="">Select a store</option>
            {stores.map((store: any) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        )}
        <select style={s.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        {total > 0 && (
          <div style={s.totalBadge}>{total} transaction{total !== 1 ? 's' : ''}</div>
        )}
      </div>

      {!selectedStore ? (
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
                <th style={s.th}>Points</th>
                <th style={s.th}>Employee</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Receipt</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx: any) => (
                <tr key={tx.id}>
                  <td style={s.td}>{format(new Date(tx.createdAt), 'MMM d, h:mm a')}</td>
                  <td style={s.td}>{tx.customer?.name || tx.customer?.phone || '—'}</td>
                  <td style={s.td}>${parseFloat(tx.purchaseAmount).toFixed(2)}</td>
                  <td style={s.td}>${parseFloat(tx.pointsAwarded).toFixed(2)}</td>
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
              <button
                style={{ ...s.pageBtn, ...(page === 1 ? s.pageBtnDisabled : {}) }}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Prev
              </button>
              <span style={s.pageInfo}>Page {page} of {totalPages}</span>
              <button
                style={{ ...s.pageBtn, ...(page === totalPages ? s.pageBtnDisabled : {}) }}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#F4A261',
  APPROVED: '#2DC653',
  REJECTED: '#E63946',
};

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1400, margin: '0 auto' },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginBottom: 24 },
  filters: { display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' },
  select: { padding: '10px 14px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14, minWidth: 200 },
  totalBadge: { marginLeft: 'auto', fontSize: 13, color: '#6c757d', fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  th: { background: '#f8f9fa', padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#6c757d', fontWeight: 600 },
  td: { padding: '14px 16px', borderBottom: '1px solid #dee2e6', fontSize: 14 },
  badge: { color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  link: { color: '#1D3557', fontWeight: 600 },
  rejectBtn: { background: 'none', border: '1px solid #E63946', color: '#E63946', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 24 },
  pageBtn: { background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1D3557' },
  pageBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageInfo: { fontSize: 14, color: '#6c757d', fontWeight: 500 },
};
