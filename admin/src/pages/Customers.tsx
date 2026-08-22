import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersApi, disputesApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
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
  const { user } = useAuthStore();
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const isDevAdmin = user?.role === 'DEV_ADMIN';

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; isActive: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [fraudNote, setFraudNote] = useState('');
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'customers' | 'disputes'>(
    searchParams.get('tab') === 'disputes' ? 'disputes' : 'customers'
  );
  const highlightId = searchParams.get('highlightId');
  const [disputeStore, setDisputeStore] = useState('');
  const [disputeStatus, setDisputeStatus] = useState('PENDING');
  const [resolveTarget, setResolveTarget] = useState<any | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [creditAmt, setCreditAmt] = useState('');
  const [exportingCustomers, setExportingCustomers] = useState(false);

  async function handleExportCustomers() {
    setExportingCustomers(true);
    try {
      const res = await customersApi.exportCsv(search);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExportingCustomers(false);
    }
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => customersApi.list(search, page),
  });

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
    enabled: isSuperAdmin,
  });

  // Fetch regardless of which tab is active — otherwise the Disputes tab's
  // own pending badge below reads 0 until the user has already clicked into
  // it once, hiding the exact thing the sidebar's badge was pointing at.
  const { data: disputesData, isLoading: disputesLoading, isError: disputesError, refetch: refetchDisputes } = useQuery({
    queryKey: ['disputes', disputeStore, disputeStatus],
    queryFn: () => disputesApi.getAll({ storeId: disputeStore || undefined, status: disputeStatus || undefined }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      customersApi.toggleActive(id, note),
    onSuccess: (res) => {
      const active = res.data?.data?.isActive;
      toast.success(active ? 'Account reactivated' : 'Account restricted');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setConfirmTarget(null);
      setFraudNote('');
    },
    onError: () => toast.error('Failed to update account'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: () => {
      toast.success('Account deleted');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setDeleteTarget(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to delete account'),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, action, note, amt }: { id: string; action: 'APPROVED' | 'REJECTED'; note: string; amt?: number }) =>
      disputesApi.resolve(id, { action, resolvedNote: note, creditedAmt: amt }),
    onSuccess: (_res, { action }) => {
      toast.success(action === 'APPROVED' ? 'Dispute approved — points credited' : 'Dispute rejected');
      qc.invalidateQueries({ queryKey: ['disputes'] });
      setResolveTarget(null);
      setResolveNote('');
      setCreditAmt('');
    },
    onError: () => toast.error('Failed to resolve dispute'),
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

  const stores = storesData?.data?.data || [];
  const disputes = disputesData?.data?.data || [];

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => {
      document.querySelector('.ls-highlight-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(timer);
  }, [highlightId, disputes]);

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
          {isSuperAdmin && total > 0 && (
            <button style={s.exportBtn} onClick={handleExportCustomers} disabled={exportingCustomers}>
              {exportingCustomers ? '…' : '⬇ Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(activeTab === 'customers' ? s.tabActive : {}) }} onClick={() => setActiveTab('customers')}>
          Customers
        </button>
        <button style={{ ...s.tab, ...(activeTab === 'disputes' ? s.tabActive : {}) }} onClick={() => setActiveTab('disputes')}>
          Disputes {disputes.filter((d: any) => d.status === 'PENDING').length > 0 && `(${disputes.filter((d: any) => d.status === 'PENDING').length})`}
        </button>
      </div>

      {/* ── Disputes tab ── */}
      {activeTab === 'disputes' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {isSuperAdmin && (
              <select style={s.filterSelect} value={disputeStore} onChange={e => setDisputeStore(e.target.value)}>
                <option value="">All Stores</option>
                {stores.map((st: any) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            )}
            <select style={s.filterSelect} value={disputeStatus} onChange={e => setDisputeStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          {disputesError ? (
            <ErrorState onRetry={refetchDisputes} />
          ) : disputesLoading ? (
            <CardSkeleton count={3} />
          ) : disputes.length === 0 ? (
            <div style={s.emptyState}><div style={{ fontSize: 48 }}>✅</div><div style={s.emptyTitle}>No disputes</div><div style={s.emptySub}>All clear — no missing points reports</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {disputes.map((d: any) => (
                <div key={d.id} className={d.id === highlightId ? 'ls-highlight-pulse' : undefined} style={s.disputeCard}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ ...s.disputeStatusPill, background: d.status === 'PENDING' ? '#fffbeb' : d.status === 'APPROVED' ? '#f0fdf4' : '#fff1f2', color: d.status === 'PENDING' ? '#b45309' : d.status === 'APPROVED' ? '#16a34a' : '#E63946' }}>
                        {d.status}
                      </span>
                      <span style={s.disputeMeta}>{d.store?.name || 'Unknown store'} · {format(new Date(d.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    <div style={s.disputeCustomer}>{d.customer?.name || d.customer?.phone}</div>
                    <div style={s.disputeDesc}>{d.description}</div>
                    {d.estimatedAmt && <div style={s.disputeMeta}>Estimated purchase: ${Number(d.estimatedAmt).toFixed(2)}</div>}
                    {d.resolvedNote && <div style={{ ...s.disputeMeta, marginTop: 4, fontStyle: 'italic' }}>Note: {d.resolvedNote}</div>}
                    {d.creditedAmt && <div style={{ ...s.disputeMeta, color: '#16a34a' }}>Credited: ${Number(d.creditedAmt).toFixed(2)}</div>}
                  </div>
                  {d.status === 'PENDING' && (
                    <button style={s.resolveBtn} onClick={() => { setResolveTarget(d); setResolveNote(''); setCreditAmt(''); }}>
                      Review
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Search ── */}
      {activeTab === 'customers' && (<>
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
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={4} />
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
                      {c.fraudNote && <div style={s.fraudBadge}>⚠ Fraud: {c.fraudNote}</div>}
                    </div>
                    <div style={{ ...s.statusDot, background: c.isActive ? '#2DC653' : '#E63946' }} title={c.isActive ? 'Active' : 'Restricted'} />
                  </div>

                  {/* Balance */}
                  <div style={{ ...s.balancePill, background: balance > 0 ? '#f0fdf4' : '#f8fafc', borderColor: balance > 0 ? '#bbf7d0' : '#e5e7eb' }}>
                    <span style={{ ...s.balanceAmt, color: balance > 0 ? '#16a34a' : '#5a6472' }}>
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
                    onClick={() => { setConfirmTarget({ id: c.id, name: c.name || c.phone, isActive: c.isActive }); setFraudNote(''); }}
                    disabled={toggleMutation.isPending}
                  >
                    {c.isActive ? '🚫 Restrict Account' : '✅ Restore Account'}
                  </button>

                  {isDevAdmin && (
                    <button
                      style={{ ...s.actionBtn, ...s.actionBtnDelete }}
                      onClick={() => setDeleteTarget({ id: c.id, name: c.name || c.phone })}
                      disabled={deleteMutation.isPending}
                    >
                      🗑 Delete Account
                    </button>
                  )}
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
      </>)}

      {/* ── Confirm Modal ── */}
      {confirmTarget && (
        <div style={s.backdrop} onClick={() => { setConfirmTarget(null); setFraudNote(''); }}>
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
            {confirmTarget.isActive && (
              <div style={{ marginBottom: 16, textAlign: 'left' }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Reason (optional — shown as fraud flag)
                </label>
                <input
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 15, boxSizing: 'border-box' as const, outline: 'none' }}
                  value={fraudNote}
                  onChange={e => setFraudNote(e.target.value)}
                  placeholder="e.g. Fake receipts, multiple accounts..."
                />
              </div>
            )}
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => { setConfirmTarget(null); setFraudNote(''); }}>Cancel</button>
              <button
                style={{ ...s.confirmBtn, background: confirmTarget.isActive ? '#E63946' : '#16a34a' }}
                onClick={() => toggleMutation.mutate({ id: confirmTarget.id, note: fraudNote || undefined })}
                disabled={toggleMutation.isPending}
              >
                {toggleMutation.isPending ? 'Updating…' : confirmTarget.isActive ? 'Restrict' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account Modal ── */}
      {deleteTarget && (
        <div style={s.backdrop} onClick={() => setDeleteTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.dragHandle} />
            <div style={{ ...s.modalIcon, background: '#fff1f2' }}>🗑</div>
            <div style={s.modalTitle}>Permanently Delete Account?</div>
            <div style={s.modalSub}>
              Permanently delete {deleteTarget.name}? This erases their points balance, transaction history, and redemptions. This cannot be undone.
            </div>
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                style={{ ...s.confirmBtn, background: '#7f1d1d' }}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolve Dispute Modal ── */}
      {resolveTarget && (
        <div style={s.backdrop} onClick={() => setResolveTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.dragHandle} />
            <div style={s.modalTitle}>Resolve Dispute</div>
            <div style={{ textAlign: 'left', marginBottom: 16 }}>
              <div style={s.disputeCustomer}>{resolveTarget.customer?.name || resolveTarget.customer?.phone}</div>
              <div style={{ fontSize: 15, color: '#5a6472', marginTop: 4, lineHeight: 1.5 }}>{resolveTarget.description}</div>
              {resolveTarget.estimatedAmt && <div style={{ fontSize: 14, color: '#5a6472', marginTop: 4 }}>Estimated: ${Number(resolveTarget.estimatedAmt).toFixed(2)}</div>}
              {resolveTarget.transaction && (
                <div style={s.linkedTxCard}>
                  <div style={s.linkedTxHeader}>Linked Transaction</div>
                  <div style={s.linkedTxRow}>
                    {format(new Date(resolveTarget.transaction.createdAt), 'MMM d, yyyy · h:mm a')} · ${Number(resolveTarget.transaction.purchaseAmount).toFixed(2)} · {String(resolveTarget.transaction.category || '').replace(/_/g, ' ')}
                  </div>
                  <div style={s.linkedTxRow}>Granted by: {resolveTarget.transaction.grantedBy?.name || 'Unknown'} · Status: {resolveTarget.transaction.status}</div>
                  {resolveTarget.transaction.receiptImageUrl ? (
                    <a href={resolveTarget.transaction.receiptImageUrl} target="_blank" rel="noopener noreferrer">
                      <img src={resolveTarget.transaction.receiptImageUrl} alt="Receipt" style={s.linkedTxReceipt} />
                    </a>
                  ) : (
                    <div style={{ ...s.linkedTxRow, fontStyle: 'italic' }}>No receipt photo on file</div>
                  )}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'left', marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Credits to Award (if approving)</label>
              <input
                type="number" min="0" step="0.01"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 15, boxSizing: 'border-box' as const, outline: 'none', marginBottom: 10 }}
                value={creditAmt} onChange={e => setCreditAmt(e.target.value)}
                placeholder="e.g. 2.50 (= $2.50 in credits)"
              />
              <label style={{ fontSize: 13, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Note to customer (optional)</label>
              <input
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 15, boxSizing: 'border-box' as const, outline: 'none' }}
                value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                placeholder="Explanation for your decision"
              />
            </div>
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setResolveTarget(null)}>Cancel</button>
              <button
                style={{ ...s.confirmBtn, background: '#E63946' }}
                onClick={() => resolveMutation.mutate({ id: resolveTarget.id, action: 'REJECTED', note: resolveNote })}
                disabled={resolveMutation.isPending}
              >Reject</button>
              <button
                style={{ ...s.confirmBtn, background: '#16a34a' }}
                onClick={() => resolveMutation.mutate({ id: resolveTarget.id, action: 'APPROVED', note: resolveNote, amt: creditAmt ? parseFloat(creditAmt) : undefined })}
                disabled={resolveMutation.isPending}
              >Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  eyebrow: { fontSize: 13, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557' },

  headerStats: { display: 'flex', gap: 10, alignItems: 'center' },
  statChip: {
    background: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 12, padding: '10px 16px', textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  statNum: { display: 'block', fontSize: 18, fontWeight: 800, color: '#1D3557' },
  statLbl: { display: 'block', fontSize: 12, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  exportBtn: { padding: '9px 18px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15 },

  searchRow: { display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' },
  searchWrap: { flex: 1, position: 'relative' },
  searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb',
    fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, background: '#fff',
  },
  searchBtn: { padding: '10px 22px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15 },
  clearBtn: { padding: '10px 16px', background: '#f8fafc', color: '#5a6472', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 10, cursor: 'pointer', fontSize: 15 },

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
  customerPhone: { fontSize: 14, color: '#5a6472', marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  balancePill: {
    borderWidth: '1px', borderStyle: 'solid',
    borderRadius: 10, padding: '10px 14px', marginBottom: 14,
    display: 'flex', alignItems: 'baseline', gap: 6,
  },
  balanceAmt: { fontSize: 22, fontWeight: 800 },
  balanceLbl: { fontSize: 13, color: '#5a6472', fontWeight: 600 },

  statsRow: { display: 'flex', alignItems: 'center', marginBottom: 14 },
  statBlock: { flex: 1, textAlign: 'center' },
  statBlockNum: { fontSize: 14, fontWeight: 800, color: '#111827' },
  statBlockLbl: { fontSize: 12, color: '#5a6472', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  statDivider: { width: 1, height: 28, background: '#f0f1f2' },

  cardDivider: { height: 1, background: '#f0f1f2', marginBottom: 14 },

  actionBtn: { width: '100%', padding: '9px 0', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  actionBtnRestrict: { background: '#fff1f2', color: '#E63946' },
  actionBtnRestore: { background: '#f0fdf4', color: '#16a34a' },
  actionBtnDelete: { background: '#7f1d1d', color: '#fff', marginTop: 8 },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 8 },
  pageBtn: {
    padding: '9px 20px', background: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, color: '#374151',
  },
  pageInfo: { color: '#5a6472', fontSize: 15 },

  emptyState: { textAlign: 'center', padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#374151' },
  emptySub: { fontSize: 15, color: '#5a6472' },

  // Tabs
  tabs: { display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 24, borderBottom: '2px solid #f0f1f2', paddingBottom: 0 },
  tab: {
    padding: '10px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, color: '#5a6472', borderBottom: '2px solid transparent', marginBottom: -2,
  },
  tabActive: { color: '#1D3557', borderBottomColor: '#1D3557' },

  // Disputes
  filterSelect: {
    padding: '9px 14px', borderRadius: 10, borderWidth: '1.5px', borderStyle: 'solid',
    borderColor: '#e5e7eb', fontSize: 15, background: '#fff', color: '#374151', outline: 'none', cursor: 'pointer',
  },
  disputeCard: {
    background: '#fff', borderRadius: 14, padding: '16px 18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'flex-start', gap: 14,
    borderWidth: '1px', borderStyle: 'solid', borderColor: '#f0f1f2',
  },
  disputeStatusPill: {
    display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  disputeMeta: { fontSize: 14, color: '#5a6472' },
  disputeCustomer: { fontSize: 14, fontWeight: 700, color: '#111827' },
  disputeDesc: { fontSize: 15, color: '#374151', marginTop: 4, lineHeight: 1.5 },
  resolveBtn: {
    padding: '8px 18px', background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, flexShrink: 0,
  },

  linkedTxCard: {
    marginTop: 10, padding: '12px 14px', background: '#f8fafc',
    borderRadius: 12, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
  },
  linkedTxHeader: { fontSize: 12, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  linkedTxRow: { fontSize: 14, color: '#374151', marginBottom: 4 },
  linkedTxReceipt: { width: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'cover' as const, marginTop: 6, cursor: 'pointer' },

  // Fraud badge
  fraudBadge: {
    display: 'inline-block', marginTop: 4, padding: '2px 8px', background: '#fff1f2',
    color: '#E63946', fontSize: 13, fontWeight: 700, borderRadius: 6,
    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
  },

  // Confirm modal
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#fff', borderRadius: 22, padding: '28px 28px 24px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' },
  dragHandle: { width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' },
  modalIcon: { width: 60, height: 60, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' },
  modalTitle: { fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 8 },
  modalSub: { fontSize: 15, color: '#5a6472', marginBottom: 24, lineHeight: 1.5 },
  modalActions: { display: 'flex', gap: 10 },
  cancelBtn: { flex: 1, padding: '11px 0', background: '#fff', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', color: '#5a6472', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  confirmBtn: { flex: 1, padding: '11px 0', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
