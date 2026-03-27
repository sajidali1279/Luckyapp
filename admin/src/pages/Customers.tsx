import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersApi } from '../services/api';
import { format } from 'date-fns';

function fmt$(n: number) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const AVATAR_PALETTE = ['#7c3aed','#0369a1','#16a34a','#b45309','#1D3557','#E63946','#0891b2','#be185d','#0f5132','#92400e'];
function avatarColor(name: string) {
  return AVATAR_PALETTE[(name?.charCodeAt(0) || 0) % AVATAR_PALETTE.length];
}

export default function Customers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; isActive: boolean } | null>(null);

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
      setConfirmTarget(null);
    },
    onError: () => toast.error('Failed to update account'),
  });

  const customers = data?.data?.data?.customers || [];
  const total = data?.data?.data?.total || 0;
  const totalCreditsOutstanding: number = data?.data?.data?.totalCreditsOutstanding ?? 0;
  const totalPages = Math.ceil(total / 50);
  const activeCount = customers.filter((c: any) => c.isActive).length;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <div style={s.eyebrow}>Platform</div>
          <h1 style={s.title}>Customers</h1>
        </div>
        <div style={s.headerStats}>
          <div style={s.statChip}>
            <span style={s.statNum}>{total.toLocaleString()}</span>
            <span style={s.statLbl}>Total</span>
          </div>
          <div style={{ ...s.statChip, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <span style={{ ...s.statNum, color: '#16a34a' }}>{activeCount}</span>
            <span style={s.statLbl}>Active</span>
          </div>
          <div style={{ ...s.statChip, background: '#fffbeb', borderColor: '#fde68a' }}>
            <span style={{ ...s.statNum, color: '#b45309' }}>{fmt$(totalCreditsOutstanding)}</span>
            <span style={s.statLbl}>Credits Out</span>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <form style={s.searchRow} onSubmit={handleSearch}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>🔍</span>
          <input
            style={s.searchInput}
            placeholder="Search by name or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button style={s.searchBtn} type="submit">Search</button>
        {search && (
          <button style={s.clearBtn} type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>
            ✕ Clear
          </button>
        )}
      </form>

      {/* ── Content ── */}
      {isLoading ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: 32 }}>⏳</div>
          <div style={s.emptyTitle}>Loading customers…</div>
        </div>
      ) : customers.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: 48 }}>🙋</div>
          <div style={s.emptyTitle}>{search ? `No results for "${search}"` : 'No customers yet'}</div>
          <div style={s.emptySub}>{search ? 'Try a different search term' : 'Customers will appear here once they sign up'}</div>
        </div>
      ) : (
        <>
          <div style={s.cardGrid}>
            {customers.map((c: any) => {
              const initial = (c.name || c.phone || '?')[0].toUpperCase();
              const color = avatarColor(c.name || c.phone || '');
              const balance = Number(c.pointsBalance || 0);
              return (
                <div key={c.id} style={{ ...s.card, ...(c.isActive ? {} : s.cardInactive) }}>
                  {/* Top row */}
                  <div style={s.cardTop}>
                    <div style={{ ...s.avatar, background: color }}>{initial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.customerName}>{c.name || <span style={{ color: '#adb5bd', fontStyle: 'italic' }}>No name</span>}</div>
                      <div style={s.customerPhone}>{c.phone}</div>
                    </div>
                    <div style={{ ...s.statusDot, background: c.isActive ? '#2DC653' : '#E63946' }} title={c.isActive ? 'Active' : 'Restricted'} />
                  </div>

                  {/* Balance */}
                  <div style={{ ...s.balancePill, background: balance > 0 ? '#f0fdf4' : '#f8fafc', borderColor: balance > 0 ? '#bbf7d0' : '#e5e7eb' }}>
                    <span style={{ ...s.balanceAmt, color: balance > 0 ? '#16a34a' : '#9ca3af' }}>
                      {fmt$(balance)}
                    </span>
                    <span style={s.balanceLbl}>credit balance</span>
                  </div>

                  {/* Stats row */}
                  <div style={s.statsRow}>
                    <div style={s.statBlock}>
                      <div style={s.statBlockNum}>{c.txCount ?? 0}</div>
                      <div style={s.statBlockLbl}>Transactions</div>
                    </div>
                    <div style={s.statDivider} />
                    <div style={s.statBlock}>
                      <div style={s.statBlockNum}>{fmt$(c.totalSpent ?? 0)}</div>
                      <div style={s.statBlockLbl}>Total Spent</div>
                    </div>
                    <div style={s.statDivider} />
                    <div style={s.statBlock}>
                      <div style={s.statBlockNum}>{format(new Date(c.createdAt), 'MMM d')}</div>
                      <div style={s.statBlockLbl}>Joined</div>
                    </div>
                  </div>

                  <div style={s.cardDivider} />

                  {/* Action */}
                  <button
                    style={{ ...s.actionBtn, ...(c.isActive ? s.actionBtnRestrict : s.actionBtnRestore) }}
                    onClick={() => setConfirmTarget({ id: c.id, name: c.name || c.phone, isActive: c.isActive })}
                    disabled={toggleMutation.isPending}
                  >
                    {c.isActive ? '🚫 Restrict Account' : '✅ Restore Account'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={s.pagination}>
              <button style={s.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={s.pageInfo}>Page {page} of {totalPages} · {total.toLocaleString()} customers</span>
              <button style={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* ── Confirm Modal ── */}
      {confirmTarget && (
        <div style={s.backdrop} onClick={() => setConfirmTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.dragHandle} />
            <div style={{ ...s.modalIcon, background: confirmTarget.isActive ? '#fff1f2' : '#f0fdf4' }}>
              {confirmTarget.isActive ? '🚫' : '✅'}
            </div>
            <div style={s.modalTitle}>
              {confirmTarget.isActive ? 'Restrict Account?' : 'Restore Account?'}
            </div>
            <div style={s.modalSub}>
              {confirmTarget.isActive
                ? `${confirmTarget.name} won't be able to log in or earn points.`
                : `${confirmTarget.name} will be able to use the app again.`}
            </div>
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setConfirmTarget(null)}>Cancel</button>
              <button
                style={{ ...s.confirmBtn, background: confirmTarget.isActive ? '#E63946' : '#16a34a' }}
                onClick={() => toggleMutation.mutate(confirmTarget.id)}
                disabled={toggleMutation.isPending}
              >
                {toggleMutation.isPending ? 'Updating…' : confirmTarget.isActive ? 'Restrict' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1300, margin: '0 auto', padding: '32px 24px' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557' },

  headerStats: { display: 'flex', gap: 10, alignItems: 'center' },
  statChip: {
    background: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 12, padding: '10px 16px', textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  statNum: { display: 'block', fontSize: 18, fontWeight: 800, color: '#1D3557' },
  statLbl: { display: 'block', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  searchRow: { display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' },
  searchWrap: { flex: 1, maxWidth: 420, position: 'relative' },
  searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb',
    fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, background: '#fff',
  },
  searchBtn: { padding: '10px 22px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  clearBtn: { padding: '10px 16px', background: '#f8fafc', color: '#6b7280', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 10, cursor: 'pointer', fontSize: 13 },

  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 },

  card: {
    background: '#fff', borderRadius: 18,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '18px 20px',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  cardInactive: { opacity: 0.65 },

  cardTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: {
    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 18, fontWeight: 800,
  },
  customerName: { fontWeight: 700, fontSize: 15, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  customerPhone: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  balancePill: {
    borderWidth: '1px', borderStyle: 'solid',
    borderRadius: 10, padding: '10px 14px', marginBottom: 14,
    display: 'flex', alignItems: 'baseline', gap: 6,
  },
  balanceAmt: { fontSize: 22, fontWeight: 800 },
  balanceLbl: { fontSize: 11, color: '#9ca3af', fontWeight: 600 },

  statsRow: { display: 'flex', alignItems: 'center', marginBottom: 14 },
  statBlock: { flex: 1, textAlign: 'center' },
  statBlockNum: { fontSize: 14, fontWeight: 800, color: '#111827' },
  statBlockLbl: { fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  statDivider: { width: 1, height: 28, background: '#f0f1f2' },

  cardDivider: { height: 1, background: '#f0f1f2', marginBottom: 14 },

  actionBtn: { width: '100%', padding: '9px 0', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  actionBtnRestrict: { background: '#fff1f2', color: '#E63946' },
  actionBtnRestore: { background: '#f0fdf4', color: '#16a34a' },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 8 },
  pageBtn: {
    padding: '9px 20px', background: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#374151',
  },
  pageInfo: { color: '#6b7280', fontSize: 13 },

  emptyState: { textAlign: 'center', padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#374151' },
  emptySub: { fontSize: 13, color: '#9ca3af' },

  // Confirm modal
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#fff', borderRadius: 22, padding: '28px 28px 24px', width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' },
  dragHandle: { width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' },
  modalIcon: { width: 60, height: 60, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' },
  modalTitle: { fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 8 },
  modalSub: { fontSize: 13, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 },
  modalActions: { display: 'flex', gap: 10 },
  cancelBtn: { flex: 1, padding: '11px 0', background: '#fff', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', color: '#6b7280', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  confirmBtn: { flex: 1, padding: '11px 0', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
