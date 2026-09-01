import { useState, useRef, useEffect, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { customersApi, staffApi, storesApi } from '../services/api';
import { PRIMARY, TEXT_MUTED } from '../lib/theme';

// Dashboard-level search across the three things an owner most often needs
// to jump straight to: a customer by name/phone, a staff member, a store.
// Customers use the real server-side search endpoint (Customers.tsx already
// has one); staff/stores are small, already-cached lists (Dashboard.tsx
// fetches both under the same query keys) so filtering client-side avoids
// a second network round trip for either.
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const active = debouncedQuery.length >= 2;

  const { data: customerData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers', debouncedQuery],
    queryFn: () => customersApi.list(debouncedQuery),
    enabled: active,
  });
  const customers = (customerData?.data?.data?.customers || []).slice(0, 5);

  const { data: staffData } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list() });
  const allStaff: any[] = staffData?.data?.data || [];
  const staffResults = active
    ? allStaff.filter(s =>
        s.name?.toLowerCase().includes(debouncedQuery.toLowerCase()) || s.phone?.includes(debouncedQuery)
      ).slice(0, 5)
    : [];

  const { data: storesData } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });
  const allStores: any[] = storesData?.data?.data || [];
  const storeResults = active
    ? allStores.filter(st => st.name?.toLowerCase().includes(debouncedQuery.toLowerCase())).slice(0, 5)
    : [];

  const hasResults = customers.length > 0 || staffResults.length > 0 || storeResults.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function goCustomer(id: string) {
    navigate(`/customers?highlightId=${id}`);
    setQuery('');
    setOpen(false);
  }
  function goStaff(name: string) {
    navigate(`/staff?search=${encodeURIComponent(name)}`);
    setQuery('');
    setOpen(false);
  }
  function goStore() {
    navigate('/stores');
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} style={s.wrap}>
      <input
        style={s.input}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="🔍 Search customers, staff, stores…"
      />
      {open && active && (
        <div style={s.dropdown}>
          {!hasResults && !customersLoading ? (
            <div style={s.emptyRow}>No matches for "{debouncedQuery}"</div>
          ) : (
            <>
              {customersLoading && customers.length === 0 && <div style={s.emptyRow}>Searching…</div>}
              {customers.length > 0 && (
                <div style={s.group}>
                  <div style={s.groupLabel}>Customers</div>
                  {customers.map((c: any) => (
                    <button key={c.id} style={s.resultRow} onClick={() => goCustomer(c.id)}>
                      <span style={s.resultName}>{c.name || 'Unnamed'}</span>
                      <span style={s.resultSub}>{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {staffResults.length > 0 && (
                <div style={s.group}>
                  <div style={s.groupLabel}>Staff</div>
                  {staffResults.map((st: any) => (
                    <button key={st.id} style={s.resultRow} onClick={() => goStaff(st.name || st.phone)}>
                      <span style={s.resultName}>{st.name}</span>
                      <span style={s.resultSub}>{st.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {storeResults.length > 0 && (
                <div style={s.group}>
                  <div style={s.groupLabel}>Stores</div>
                  {storeResults.map((st: any) => (
                    <button key={st.id} style={s.resultRow} onClick={goStore}>
                      <span style={s.resultName}>{st.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { position: 'relative', width: '100%', maxWidth: 420 },
  input: {
    width: '100%', border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
    background: '#fff',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
    background: '#fff', borderRadius: 12, border: '1px solid #eee',
    boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 50, overflow: 'hidden',
    maxHeight: 400, overflowY: 'auto',
  },
  emptyRow: { padding: '16px', fontSize: 13, color: TEXT_MUTED, textAlign: 'center' as const },
  group: { padding: '6px 0' },
  groupLabel: {
    padding: '6px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: 0.5, color: TEXT_MUTED,
  },
  resultRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
    padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const,
  },
  resultName: { fontSize: 14, fontWeight: 600, color: PRIMARY },
  resultSub: { fontSize: 12.5, color: TEXT_MUTED },
};
