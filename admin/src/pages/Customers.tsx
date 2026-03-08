import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersApi } from '../services/api';
import { format } from 'date-fns';

export default function Customers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => customersApi.list(search, page),
  });

  const toggleMutation = useMutation({
    mutationFn: (userId: string) => customersApi.toggleActive(userId),
    onSuccess: (res) => {
      const active = res.data?.data?.isActive;
      toast.success(active ? 'Account reactivated' : 'Account restricted');
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: () => toast.error('Failed to update account'),
  });

  const customers = data?.data?.data?.customers || [];
  const total = data?.data?.data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🙋 Customers</h1>
          <p style={s.sub}>{total.toLocaleString()} registered customers</p>
        </div>
      </div>

      <form style={s.searchBar} onSubmit={handleSearch}>
        <input
          style={s.searchInput}
          placeholder="Search by name or phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button style={s.searchBtn} type="submit">Search</button>
        {search && (
          <button style={s.clearBtn} type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>
            Clear
          </button>
        )}
      </form>

      {isLoading ? (
        <div style={s.empty}>Loading...</div>
      ) : customers.length === 0 ? (
        <div style={s.empty}>{search ? `No customers found for "${search}"` : 'No customers yet.'}</div>
      ) : (
        <>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Phone</th>
                <th style={s.th}>Points Balance</th>
                <th style={s.th}>Joined</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer: any) => (
                <tr key={customer.id} style={customer.isActive ? {} : { opacity: 0.55 }}>
                  <td style={s.td}>{customer.name || <span style={{ color: '#6c757d' }}>No name set</span>}</td>
                  <td style={s.td}>{customer.phone}</td>
                  <td style={s.td}>
                    <strong style={{ color: '#2DC653' }}>${Number(customer.pointsBalance || 0).toFixed(2)}</strong>
                  </td>
                  <td style={s.td}>{format(new Date(customer.createdAt), 'MMM d, yyyy')}</td>
                  <td style={s.td}>
                    <span style={{ color: customer.isActive ? '#2DC653' : '#E63946', fontWeight: 600, fontSize: 13 }}>
                      {customer.isActive ? 'Active' : 'Restricted'}
                    </span>
                  </td>
                  <td style={s.td}>
                    <button
                      style={{
                        ...s.actionBtn,
                        color: customer.isActive ? '#E63946' : '#2DC653',
                        borderColor: customer.isActive ? '#E63946' : '#2DC653',
                      }}
                      onClick={() => {
                        if (customer.isActive && !confirm(`Restrict account for ${customer.name || customer.phone}? They won't be able to log in.`)) return;
                        toggleMutation.mutate(customer.id);
                      }}
                    >
                      {customer.isActive ? 'Restrict Access' : 'Restore Access'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div style={s.pagination}>
              <button style={s.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={s.pageInfo}>Page {page} of {totalPages} · {total} total</span>
              <button style={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4 },
  searchBar: { display: 'flex', gap: 10, marginBottom: 24 },
  searchInput: { flex: 1, maxWidth: 400, padding: '10px 14px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15 },
  searchBtn: { padding: '10px 20px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  clearBtn: { padding: '10px 16px', background: '#f8f9fa', color: '#6c757d', border: '1px solid #dee2e6', borderRadius: 8, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  th: { background: '#f8f9fa', padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#6c757d', fontWeight: 600 },
  td: { padding: '14px 16px', borderBottom: '1px solid #dee2e6', fontSize: 14 },
  actionBtn: { padding: '5px 12px', background: 'none', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 },
  pageBtn: { padding: '8px 16px', background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
  pageInfo: { color: '#6c757d', fontSize: 14 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
};
