import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersApi, disputesApi, storesApi, staffApi, CustomerFilters } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import DataTablePagination from '../components/DataTablePagination';
import Modal from '../components/Modal';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { showPhone } from '../lib/phoneText';
import { storeDayLong, storeDayTime, storeToday } from '../lib/storeDates';
import { useSingleFlight } from '../hooks/useSingleFlight';

function fmt$(n: number) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const AVATAR_PALETTE = ['#7c3aed','#0369a1','#16a34a','#b45309',PRIMARY,'#E63946','#0891b2','#be185d','#0f5132','#92400e'];
function avatarColor(name: string) {
  return AVATAR_PALETTE[(name?.charCodeAt(0) || 0) % AVATAR_PALETTE.length];
}

// Text colours dark enough to read on their tinted backgrounds (the brighter green and red were about 3.5 to 1)
const GREEN_TEXT = '#166534';
const RED_TEXT = '#b91c1c';
const AMBER_TEXT = '#92400e';

const CREDIT_MAX = 50;
/** The problem with an amount typed as a credit, or null when it is a good one (or still empty). Mirrors the server's rule. */
function creditProblem(text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  if (!/^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/.test(t) || !(Number(t) > 0)) return `Enter dollars and cents, from $0.01 to $${CREDIT_MAX}.`;
  if (Number(t) > CREDIT_MAX) return `The most one report can credit is $${CREDIT_MAX}.`;
  return null;
}

export default function Customers() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const isDevAdmin = user?.role === 'DEV_ADMIN';

  const [searchParams] = useSearchParams();
  // Seeded from ?search= (the Command Palette's "Search customers" jumps here with a query already typed)
  const [search, setSearch] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [page, setPage] = useState(1);
  const [restrictTarget, setRestrictTarget] = useState<{ id: string; name: string; isActive: boolean } | null>(null);
  const [restrictError, setRestrictError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [fraudNote, setFraudNote] = useState('');
  const [activeTab, setActiveTab] = useState<'customers' | 'disputes'>(
    searchParams.get('tab') === 'disputes' ? 'disputes' : 'customers'
  );
  const highlightId = searchParams.get('highlightId');
  const [disputeStore, setDisputeStore] = useState('');
  const [disputeStatus, setDisputeStatus] = useState('PENDING');
  const [resolveTarget, setResolveTarget] = useState<any | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [creditAmt, setCreditAmt] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [exportingCustomers, setExportingCustomers] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filters, setFilters] = useState<CustomerFilters>({ sort: 'joined_desc' });
  const [detailTarget, setDetailTarget] = useState<{ id: string; name: string } | null>(null);
  const [goodwillAmt, setGoodwillAmt] = useState('');
  const [goodwillReason, setGoodwillReason] = useState('');
  const [goodwillError, setGoodwillError] = useState('');
  const activeFilterCount = [filters.status, filters.hasBalance, filters.hasNote, filters.joinedWithin, filters.hideTest].filter(Boolean).length;

  async function handleExportCustomers() {
    setExportingCustomers(true);
    try {
      const res = await customersApi.exportCsv(search, undefined, filters);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers-${storeToday()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(failureMessage(e, 'Could not export the customers.'));
    } finally {
      setExportingCustomers(false);
    }
  }

  const { data, isLoading, isError, refetch, error } = useQuery({
    queryKey: ['customers', search, page, filters],
    queryFn: () => customersApi.list(search, page, filters),
  });

  const detailQuery = useQuery({
    queryKey: ['customer-detail', detailTarget?.id],
    queryFn: () => customersApi.detail(detailTarget!.id),
    enabled: !!detailTarget,
  });
  const detail = detailQuery.data?.data?.data as
    | { customer: any; totals: { txCount: number; totalSpent: number }; sales: any[]; redemptions: any[]; disputes: any[] }
    | undefined;

  const goodwillIssue = (() => {
    const t = goodwillAmt.trim();
    if (t === '') return null;
    if (!/^(\d{1,2}(\.\d{1,2})?|\.\d{1,2})$/.test(t) || !(Number(t) > 0)) return 'Enter dollars and cents, from $0.01 to $25.';
    if (Number(t) > 25) return 'A goodwill credit can be at most $25. For more, use a missing-points report instead.';
    return null;
  })();
  const goodwillOk = goodwillAmt.trim() !== '' && goodwillIssue === null && goodwillReason.trim() !== '';

  const goodwillMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) => customersApi.goodwillCredit(id, amount, reason),
    onSuccess: () => {
      toast.success(`$${Number(goodwillAmt).toFixed(2)} credited to ${detailTarget?.name}.`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-detail', detailTarget?.id] });
      setGoodwillAmt(''); setGoodwillReason(''); setGoodwillError('');
    },
    onError: (e: any) => setGoodwillError(failureMessage(e, 'Could not add the credit. Nothing was changed.')),
  });
  const runGoodwill = useSingleFlight(goodwillMutation);

  function closeDetail() { setDetailTarget(null); setGoodwillAmt(''); setGoodwillReason(''); setGoodwillError(''); }

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
    enabled: isSuperAdmin,
  });

  // The Disputes tab's own count: every pending report, whatever the filters say
  const { data: pendingData } = useQuery({
    queryKey: ['disputes-pending-count'],
    queryFn: () => disputesApi.getPendingCount(),
  });
  const pendingCount: number = pendingData?.data?.data?.count ?? 0;

  const { data: disputesData, isLoading: disputesLoading, isError: disputesError, refetch: refetchDisputes } = useQuery({
    queryKey: ['disputes', disputeStore, disputeStatus],
    queryFn: () => disputesApi.getAll({ storeId: disputeStore || undefined, status: disputeStatus || undefined }),
  });

  // What Delete would do to this customer, asked before anyone types the confirmation
  const footprint = useQuery({
    queryKey: ['customer-footprint', deleteTarget?.id],
    queryFn: () => staffApi.footprint(deleteTarget!.id),
    enabled: !!deleteTarget,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const fp = footprint.data?.data?.data as { message: string } | undefined;

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive, note }: { id: string; name: string; isActive: boolean; note?: string }) =>
      customersApi.setActive(id, isActive, note),
    onSuccess: (res, v) => {
      const changed = res.data?.data?.changed !== false;
      toast.success(v.isActive
        ? (changed ? `${v.name} is restored and can use the app again.` : `${v.name} was already active.`)
        : (changed ? `${v.name} is restricted. They cannot sign in or earn points.` : `${v.name} was already restricted.`));
      qc.invalidateQueries({ queryKey: ['customers'] });
      setRestrictTarget(null);
      setFraudNote('');
      setRestrictError('');
    },
    onError: (e: any) => setRestrictError(failureMessage(e, 'Could not change the account. Nothing was changed.')),
  });
  const runToggle = useSingleFlight(toggleMutation);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: (res) => {
      const changed = res.data?.data?.changed !== false;
      toast.success(changed ? `${deleteTarget?.name}'s account was deleted. Their sales stay in the books.` : `${deleteTarget?.name}'s account was already deleted.`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      closeDelete();
    },
    onError: (e: any) => setDeleteError(failureMessage(e, 'Could not delete the account. Nothing was changed.')),
  });
  const runDelete = useSingleFlight(deleteMutation);

  const resolveMutation = useMutation({
    mutationFn: ({ id, action, note, amt }: { id: string; action: 'APPROVED' | 'REJECTED'; note: string; amt?: number }) =>
      disputesApi.resolve(id, { action, resolvedNote: note.trim() || undefined, creditedAmt: amt }),
    onSuccess: (_res, { action, amt }) => {
      const who = resolveTarget?.customer?.name || showPhone(resolveTarget?.customer?.phone);
      toast.success(action === 'APPROVED' ? `Approved: ${fmt$(amt ?? 0)} credited to ${who}.` : 'Report rejected. The customer was told.', { duration: 6000 });
      qc.invalidateQueries({ queryKey: ['disputes'] });
      qc.invalidateQueries({ queryKey: ['disputes-pending-count'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      closeResolve();
    },
    onError: (e: any) => {
      setResolveError(failureMessage(e, 'Could not save the decision. Nothing was changed.'));
      if (e?.response?.status === 409) { qc.invalidateQueries({ queryKey: ['disputes'] }); qc.invalidateQueries({ queryKey: ['disputes-pending-count'] }); }
    },
  });
  const runResolve = useSingleFlight(resolveMutation);

  const customers = data?.data?.data?.customers || [];
  const total: number = data?.data?.data?.total || 0;
  const activeTotal: number = data?.data?.data?.activeTotal ?? 0;
  const restrictedTotal: number = data?.data?.data?.restrictedTotal ?? 0;
  const totalCreditsOutstanding: number = data?.data?.data?.totalCreditsOutstanding ?? 0;
  const totalPages: number = data?.data?.data?.totalPages ?? Math.max(1, Math.ceil(total / 50));
  const badSearch = (error as any)?.response?.status === 400 ? failureMessage(error, '') : '';

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function updateFilters(patch: Partial<CustomerFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }

  function closeRestrict() { setRestrictTarget(null); setFraudNote(''); setRestrictError(''); }
  function closeDelete() { setDeleteTarget(null); setDeleteTyped(''); setDeleteError(''); }
  function closeResolve() { setResolveTarget(null); setResolveNote(''); setCreditAmt(''); setResolveError(''); }

  const stores = storesData?.data?.data || [];
  const disputes = disputesData?.data?.data || [];
  const disputesTotal: number = disputesData?.data?.total ?? disputes.length;

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => {
      document.querySelector('.ls-highlight-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(timer);
  }, [highlightId, disputes, customers]);

  const creditIssue = creditProblem(creditAmt);
  const creditNumber = Number(creditAmt);
  const creditOk = creditAmt.trim() !== '' && creditIssue === null;
  const lastFour = deleteTarget ? deleteTarget.phone.replace(/\D/g, '').slice(-4) : '';

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
            <span style={s.statNum}>{(activeTotal + restrictedTotal).toLocaleString()}</span>
            <span style={s.statLbl}>Total</span>
          </div>
          <div style={{ ...s.statChip, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <span style={{ ...s.statNum, color: GREEN_TEXT }}>{activeTotal.toLocaleString()}</span>
            <span style={s.statLbl}>Active</span>
          </div>
          <div style={{ ...s.statChip, ...(restrictedTotal > 0 ? { background: '#fff1f2', borderColor: '#fecaca' } : {}) }}>
            <span style={{ ...s.statNum, color: restrictedTotal > 0 ? RED_TEXT : PRIMARY }}>{restrictedTotal.toLocaleString()}</span>
            <span style={s.statLbl}>Restricted</span>
          </div>
          <div style={{ ...s.statChip, background: '#fffbeb', borderColor: '#fde68a' }}>
            <span style={{ ...s.statNum, color: AMBER_TEXT }}>{fmt$(totalCreditsOutstanding)}</span>
            <span style={s.statLbl}>Credits Out</span>
          </div>
          {isSuperAdmin && total > 0 && (
            <button style={s.exportBtn} onClick={handleExportCustomers} disabled={exportingCustomers}>
              {exportingCustomers ? 'Exporting…' : '⬇ Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs} role="tablist" aria-label="Customers and disputes">
        <button role="tab" aria-selected={activeTab === 'customers'} style={{ ...s.tab, ...(activeTab === 'customers' ? s.tabActive : {}) }} onClick={() => setActiveTab('customers')}>
          Customers
        </button>
        <button role="tab" aria-selected={activeTab === 'disputes'} style={{ ...s.tab, ...(activeTab === 'disputes' ? s.tabActive : {}) }} onClick={() => setActiveTab('disputes')}>
          Disputes{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
        </button>
      </div>

      {/* ── Disputes tab ── */}
      {activeTab === 'disputes' && (
        <div role="tabpanel" aria-label="Disputes">
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {isSuperAdmin && (
              <select style={s.filterSelect} aria-label="Filter disputes by store" value={disputeStore} onChange={e => setDisputeStore(e.target.value)}>
                <option value="">All Stores</option>
                {stores.map((st: any) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            )}
            <select style={s.filterSelect} aria-label="Filter disputes by status" value={disputeStatus} onChange={e => setDisputeStatus(e.target.value)}>
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
            <div style={s.emptyState}><div style={{ fontSize: 48 }} aria-hidden="true">✅</div><div style={s.emptyTitle}>No disputes</div><div style={s.emptySub}>All clear - no missing points reports</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {disputesTotal > disputes.length && <div style={s.disputeMeta}>Showing the newest {disputes.length} of {disputesTotal.toLocaleString()} reports. Use the filters to narrow the list.</div>}
              {disputes.map((d: any) => (
                <div key={d.id} className={d.id === highlightId ? 'ls-highlight-pulse' : undefined} style={s.disputeCard}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ ...s.disputeStatusPill, background: d.status === 'PENDING' ? '#fffbeb' : d.status === 'APPROVED' ? '#f0fdf4' : '#fff1f2', color: d.status === 'PENDING' ? AMBER_TEXT : d.status === 'APPROVED' ? GREEN_TEXT : RED_TEXT }}>
                        {d.status}
                      </span>
                      <span style={s.disputeMeta}>{d.store?.name || 'Unknown store'} · {storeDayLong(d.createdAt)}</span>
                    </div>
                    <div style={s.disputeCustomer}>{d.customer?.name || showPhone(d.customer?.phone)}</div>
                    <div style={s.disputeDesc}>{d.description}</div>
                    {d.estimatedAmt && <div style={s.disputeMeta}>Estimated purchase: ${Number(d.estimatedAmt).toFixed(2)}</div>}
                    {d.resolvedNote && <div style={{ ...s.disputeMeta, marginTop: 4, fontStyle: 'italic' }}>Note: {d.resolvedNote}</div>}
                    {d.creditedAmt && <div style={{ ...s.disputeMeta, color: GREEN_TEXT }}>Credited: ${Number(d.creditedAmt).toFixed(2)}</div>}
                  </div>
                  {d.status === 'PENDING' && (
                    <button style={s.resolveBtn} aria-label={`Review the report from ${d.customer?.name || showPhone(d.customer?.phone)}`} onClick={() => { setResolveTarget(d); setResolveNote(''); setCreditAmt(''); setResolveError(''); }}>
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
      {activeTab === 'customers' && (<div role="tabpanel" aria-label="Customers">
      <form style={s.searchRow} onSubmit={handleSearch} role="search">
        <div style={s.searchWrap}>
          <span style={s.searchIcon} aria-hidden="true">🔍</span>
          <input
            style={s.searchInput}
            aria-label="Search customers by name or phone number"
            placeholder="Search by name or phone…"
            value={searchInput}
            maxLength={60}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button style={s.searchBtn} type="submit">Search</button>
        {search && (
          <button style={s.clearBtn} type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>
            ✕ Clear
          </button>
        )}
        <select style={s.filterSelect} aria-label="Sort customers by" value={filters.sort} onChange={(e) => updateFilters({ sort: e.target.value as CustomerFilters['sort'] })}>
          <option value="joined_desc">Newest first</option>
          <option value="joined_asc">Oldest first</option>
          <option value="spend_desc">Highest spend</option>
          <option value="balance_desc">Highest balance</option>
        </select>
        <button type="button" style={{ ...s.moreFiltersBtn, ...(activeFilterCount > 0 ? s.moreFiltersBtnActive : {}) }} aria-expanded={showMoreFilters} onClick={() => setShowMoreFilters((v) => !v)}>
          {showMoreFilters ? '▲' : '▼'} Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </form>

      {showMoreFilters && (
        <div style={s.filterPanel}>
          <div>
            <div style={s.filterGroupLabel}>Status</div>
            <div style={s.filterChoices}>
              {(['', 'active', 'restricted'] as const).map((v) => (
                <label key={v || 'all'} style={s.radioLabel}>
                  <input type="radio" name="cust-status" checked={(filters.status ?? '') === v} onChange={() => updateFilters({ status: v || undefined })} />
                  {v === '' ? 'All' : v === 'active' ? 'Active' : 'Restricted'}
                </label>
              ))}
            </div>
          </div>
          <div style={s.filterChoices}>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={!!filters.hasBalance} onChange={(e) => updateFilters({ hasBalance: e.target.checked || undefined })} />
              Has a balance
            </label>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={!!filters.hasNote} onChange={(e) => updateFilters({ hasNote: e.target.checked || undefined })} />
              Has a fraud note
            </label>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={filters.joinedWithin === 'week'} onChange={(e) => updateFilters({ joinedWithin: e.target.checked ? 'week' : undefined })} />
              Joined this week
            </label>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={!!filters.hideTest} onChange={(e) => updateFilters({ hideTest: e.target.checked || undefined })} />
              Hide test accounts
            </label>
          </div>
          {activeFilterCount > 0 && (
            <button type="button" style={s.linkBtn} onClick={() => updateFilters({ status: undefined, hasBalance: undefined, hasNote: undefined, joinedWithin: undefined, hideTest: undefined })}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {badSearch ? (
        <div role="alert" style={s.errorBox}>{badSearch}</div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={4} />
      ) : customers.length === 0 ? (
        <div style={s.emptyState}>
          <div style={{ fontSize: 48 }} aria-hidden="true">🙋</div>
          <div style={s.emptyTitle}>{search ? `No results for "${search}"` : 'No customers yet'}</div>
          <div style={s.emptySub}>{search ? 'Try part of a name, or a phone number written any way' : 'Customers will appear here once they sign up'}</div>
        </div>
      ) : (
        <>
          <div style={s.cardGrid}>
            {customers.map((c: any) => {
              const displayName = c.name || showPhone(c.phone);
              const initial = (c.name || c.phone || '?')[0].toUpperCase();
              const color = avatarColor(c.name || c.phone || '');
              const balance = Number(c.pointsBalance || 0);
              return (
                <div key={c.id} className={c.id === highlightId ? 'ls-highlight-pulse' : undefined} style={{ ...s.card, ...(c.isActive ? {} : s.cardInactive) }}>
                  {/* Top row */}
                  <div style={s.cardTop}>
                    <div style={{ ...s.avatar, background: color }} aria-hidden="true">{initial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.customerName}>{c.name || <span style={{ color: TEXT_MUTED, fontStyle: 'italic' }}>No name</span>}</div>
                      <div style={s.customerPhone}>{showPhone(c.phone)}{c.isTest && <span style={s.testBadge}>TEST</span>}</div>
                      {!c.isActive && (
                        <div style={s.fraudBadge}>Restricted{c.fraudNote ? `: ${c.fraudNote}` : ''}</div>
                      )}
                    </div>
                    <div style={{ ...s.statusDot, background: c.isActive ? '#2DC653' : '#E63946' }} aria-hidden="true" />
                  </div>

                  {/* Balance */}
                  <div style={{ ...s.balancePill, background: balance > 0 ? '#f0fdf4' : '#f8fafc', borderColor: balance > 0 ? '#bbf7d0' : '#e5e7eb' }}>
                    <span style={{ ...s.balanceAmt, color: balance > 0 ? GREEN_TEXT : TEXT_MUTED }}>
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
                      <div style={s.statBlockNum}>{storeDayLong(c.createdAt)}</div>
                      <div style={s.statBlockLbl}>Joined</div>
                    </div>
                  </div>

                  <div style={s.cardDivider} />

                  {/* Action */}
                  <button
                    style={{ ...s.actionBtn, ...s.actionBtnView }}
                    aria-label={`View ${displayName}'s sales, redemptions and reports`}
                    onClick={() => setDetailTarget({ id: c.id, name: displayName })}
                  >
                    🔍 View Details
                  </button>
                  <button
                    style={{ ...s.actionBtn, ...(c.isActive ? s.actionBtnRestrict : s.actionBtnRestore) }}
                    aria-label={`${c.isActive ? 'Restrict' : 'Restore'} ${displayName}'s account`}
                    onClick={() => { setRestrictTarget({ id: c.id, name: displayName, isActive: c.isActive }); setFraudNote(''); setRestrictError(''); }}
                    disabled={toggleMutation.isPending}
                  >
                    {c.isActive ? '🚫 Restrict Account' : '✅ Restore Account'}
                  </button>

                  {isDevAdmin && (
                    <button
                      style={{ ...s.actionBtn, ...s.actionBtnDelete }}
                      aria-label={`Delete ${displayName}'s account`}
                      onClick={() => { setDeleteTarget({ id: c.id, name: displayName, phone: c.phone }); setDeleteTyped(''); setDeleteError(''); }}
                    >
                      🗑 Delete Account
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <DataTablePagination
            page={page}
            totalPages={totalPages}
            onPrevious={() => setPage(p => p - 1)}
            onNext={() => setPage(p => p + 1)}
            extraInfo={`· ${total.toLocaleString()} customers`}
          />
        </>
      )}
      </div>)}

      {/* ── Restrict / Restore ── */}
      {restrictTarget && (
        <Modal
          title={restrictTarget.isActive ? `Restrict ${restrictTarget.name}?` : `Restore ${restrictTarget.name}?`}
          subtitle={restrictTarget.isActive
            ? 'They cannot sign in or earn points until you restore them. Their balance and history stay as they are.'
            : 'They can sign in and earn points again. The reason on their card is cleared.'}
          onClose={closeRestrict}
          busy={toggleMutation.isPending}
        >
          <form style={s.modalForm} onSubmit={(e) => { e.preventDefault(); runToggle({ id: restrictTarget.id, name: restrictTarget.name, isActive: !restrictTarget.isActive, note: restrictTarget.isActive ? fraudNote.trim() || undefined : undefined }); }} noValidate>
            {restrictTarget.isActive && (
              <div>
                <label style={s.fieldLabel} htmlFor="restrict-reason">Reason (shown on their card)</label>
                <input
                  id="restrict-reason"
                  style={s.fieldInput}
                  value={fraudNote}
                  maxLength={300}
                  autoFocus
                  onChange={e => { setFraudNote(e.target.value); setRestrictError(''); }}
                  placeholder="e.g. Fake receipts, multiple accounts..."
                />
              </div>
            )}
            {restrictError && <div role="alert" style={s.errorBox}>{restrictError}</div>}
            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={closeRestrict} disabled={toggleMutation.isPending}>Cancel</button>
              <button type="submit" style={{ ...s.confirmBtn, background: restrictTarget.isActive ? '#b91c1c' : GREEN_TEXT }} disabled={toggleMutation.isPending}>
                {toggleMutation.isPending ? 'Updating…' : restrictTarget.isActive ? 'Restrict' : 'Restore'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Delete: removes personal details, keeps the sales ── */}
      {deleteTarget && (
        <Modal title={`Delete ${deleteTarget.name}'s account?`} onClose={closeDelete} busy={deleteMutation.isPending}>
          <form style={s.modalForm} onSubmit={(e) => { e.preventDefault(); if (deleteTyped.trim() === lastFour && fp) runDelete(deleteTarget.id); }} noValidate>
            {footprint.isLoading && <div style={s.modalText} role="status">Checking what this account has…</div>}
            {footprint.isError && (
              <div role="alert" style={s.errorBox}>
                Could not check the account, so nothing was changed. <button type="button" style={s.linkBtn} onClick={() => footprint.refetch()}>Try again</button>
              </div>
            )}
            {fp && <div style={s.modalText}>{fp.message} This cannot be undone, and unspent credit is forfeited.</div>}
            {fp && (
              <div>
                <label style={s.fieldLabel} htmlFor="delete-confirm">Type the last four digits of their phone number ({lastFour}) to confirm</label>
                <input
                  id="delete-confirm"
                  style={s.fieldInput}
                  value={deleteTyped}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  autoFocus
                  onChange={e => { setDeleteTyped(e.target.value.replace(/\D/g, '')); setDeleteError(''); }}
                />
              </div>
            )}
            {deleteError && <div role="alert" style={s.errorBox}>{deleteError}</div>}
            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={closeDelete} disabled={deleteMutation.isPending}>Cancel</button>
              <button type="submit" style={{ ...s.confirmBtn, background: '#7f1d1d', ...(!fp || deleteTyped.trim() !== lastFour ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} disabled={!fp || deleteTyped.trim() !== lastFour || deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Review a missing-points report ── */}
      {resolveTarget && (
        <Modal title="Review missing-points report" onClose={closeResolve} busy={resolveMutation.isPending} maxWidth={520}>
          <div>
            <div style={s.disputeCustomer}>{resolveTarget.customer?.name || showPhone(resolveTarget.customer?.phone)}</div>
            <div style={{ fontSize: 15, color: '#374151', marginTop: 4, lineHeight: 1.5 }}>{resolveTarget.description}</div>
            <div style={{ fontSize: 14, color: TEXT_MUTED, marginTop: 4 }}>{resolveTarget.store?.name || 'Unknown store'} · {storeDayLong(resolveTarget.createdAt)}</div>
            {resolveTarget.estimatedAmt && <div style={{ fontSize: 14, color: TEXT_MUTED, marginTop: 4 }}>The customer says the purchase was about ${Number(resolveTarget.estimatedAmt).toFixed(2)}.</div>}
            {resolveTarget.transaction && (
              <div style={s.linkedTxCard}>
                <div style={s.linkedTxHeader}>Linked Transaction</div>
                <div style={s.linkedTxRow}>
                  {storeDayTime(resolveTarget.transaction.createdAt)} · ${Number(resolveTarget.transaction.purchaseAmount).toFixed(2)} · {String(resolveTarget.transaction.category || '').replace(/_/g, ' ')}
                </div>
                <div style={s.linkedTxRow}>Granted by: {resolveTarget.transaction.grantedBy?.name || 'Unknown'} · Status: {resolveTarget.transaction.status}</div>
                {resolveTarget.transaction.receiptImageUrl ? (
                  <a href={resolveTarget.transaction.receiptImageUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the receipt photo in a new tab">
                    <img src={resolveTarget.transaction.receiptImageUrl} alt="Receipt photo" style={s.linkedTxReceipt} />
                  </a>
                ) : (
                  <div style={{ ...s.linkedTxRow, fontStyle: 'italic' }}>No receipt photo on file</div>
                )}
              </div>
            )}
          </div>
          <form style={s.modalForm} onSubmit={(e) => e.preventDefault()} noValidate>
            <div>
              <label style={s.fieldLabel} htmlFor="dispute-credit">Credit to award, from $0.01 to ${CREDIT_MAX} (needed to approve)</label>
              <input
                id="dispute-credit"
                style={s.fieldInput}
                inputMode="decimal"
                value={creditAmt}
                maxLength={6}
                aria-invalid={!!creditIssue}
                aria-describedby={creditIssue ? 'dispute-credit-err' : undefined}
                onChange={e => { setCreditAmt(e.target.value.replace(/[^0-9.]/g, '')); setResolveError(''); }}
                placeholder="e.g. 2.50 (= $2.50 in credits)"
              />
              {creditIssue && <div id="dispute-credit-err" role="alert" style={{ ...s.errorText }}>{creditIssue}</div>}
            </div>
            <div>
              <label style={s.fieldLabel} htmlFor="dispute-note">Note to customer (optional)</label>
              <input
                id="dispute-note"
                style={s.fieldInput}
                value={resolveNote}
                maxLength={300}
                onChange={e => { setResolveNote(e.target.value); setResolveError(''); }}
                placeholder="Explanation for your decision"
              />
            </div>
            {resolveError && <div role="alert" style={s.errorBox}>{resolveError}</div>}
            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={closeResolve} disabled={resolveMutation.isPending}>Cancel</button>
              <button
                type="button"
                style={{ ...s.confirmBtn, background: '#b91c1c' }}
                onClick={() => runResolve({ id: resolveTarget.id, action: 'REJECTED', note: resolveNote })}
                disabled={resolveMutation.isPending}
              >Reject</button>
              <button
                type="button"
                style={{ ...s.confirmBtn, background: GREEN_TEXT, ...(!creditOk ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                onClick={() => creditOk && runResolve({ id: resolveTarget.id, action: 'APPROVED', note: resolveNote, amt: creditNumber })}
                disabled={!creditOk || resolveMutation.isPending}
              >{creditOk ? `Approve and credit ${fmt$(creditNumber)}` : 'Approve'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Customer detail panel: their sales, redemptions and reports, plus a goodwill credit ── */}
      {detailTarget && (
        <Modal title={`${detailTarget.name} — Details`} onClose={closeDetail} maxWidth={640}>
          {detailQuery.isLoading ? (
            <div style={s.modalText} role="status">Loading…</div>
          ) : detailQuery.isError ? (
            <div role="alert" style={s.errorBox}>
              Could not load this customer. <button type="button" style={s.linkBtn} onClick={() => detailQuery.refetch()}>Try again</button>
            </div>
          ) : detail ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={s.detailSummaryRow}>
                <div style={s.detailStat}><div style={s.detailStatNum}>{fmt$(detail.customer.pointsBalance || 0)}</div><div style={s.detailStatLbl}>Balance</div></div>
                <div style={s.detailStat}><div style={s.detailStatNum}>{detail.totals.txCount}</div><div style={s.detailStatLbl}>Sales</div></div>
                <div style={s.detailStat}><div style={s.detailStatNum}>{fmt$(detail.totals.totalSpent)}</div><div style={s.detailStatLbl}>Total Spent</div></div>
                <div style={s.detailStat}><div style={s.detailStatNum}>{storeDayLong(detail.customer.createdAt)}</div><div style={s.detailStatLbl}>Joined</div></div>
              </div>
              {detail.customer.isTest && <div style={s.testNote}>This looks like a test account (a 111-555 area code).</div>}
              {!detail.customer.isActive && <div style={s.fraudBadge}>Restricted{detail.customer.fraudNote ? `: ${detail.customer.fraudNote}` : ''}</div>}

              <div>
                <div style={s.detailSectionTitle}>Recent Sales {detail.sales.length === 0 && <span style={s.detailEmpty}>— none yet</span>}</div>
                {detail.sales.map((t: any) => (
                  <div key={t.id} style={s.detailRow}>
                    <span>{storeDayTime(t.createdAt)} · {t.store?.name || 'Unknown store'}</span>
                    <span>${Number(t.purchaseAmount).toFixed(2)} · {statusWord(t.status)}{t.receiptImageUrl && <a href={t.receiptImageUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6 }}>📷</a>}</span>
                  </div>
                ))}
              </div>

              <div>
                <div style={s.detailSectionTitle}>Recent Redemptions {detail.redemptions.length === 0 && <span style={s.detailEmpty}>— none yet</span>}</div>
                {detail.redemptions.map((r: any) => (
                  <div key={r.id} style={s.detailRow}>
                    <span>{storeDayTime(r.createdAt)} · {r.store?.name || 'Unknown store'}</span>
                    <span>{fmt$(r.amount)}</span>
                  </div>
                ))}
              </div>

              <div>
                <div style={s.detailSectionTitle}>Missing-Points Reports {detail.disputes.length === 0 && <span style={s.detailEmpty}>— none yet</span>}</div>
                {detail.disputes.map((d: any) => (
                  <div key={d.id} style={s.detailRow}>
                    <span>{storeDayLong(d.createdAt)} · {d.description}</span>
                    <span>{d.status}{d.creditedAmt ? ` · ${fmt$(d.creditedAmt)}` : ''}</span>
                  </div>
                ))}
              </div>

              <div style={s.goodwillBox}>
                <div style={s.detailSectionTitle}>Goodwill Credit</div>
                <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 10 }}>For a case that is not a missing-points report — an apology, a one-off gesture. Up to $25, with a reason.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '0 0 120px' }}>
                    <input
                      style={s.fieldInput}
                      inputMode="decimal"
                      value={goodwillAmt}
                      maxLength={5}
                      aria-label="Goodwill credit amount in dollars"
                      placeholder="$0.00"
                      onChange={(e) => { setGoodwillAmt(e.target.value.replace(/[^0-9.]/g, '')); setGoodwillError(''); }}
                    />
                  </div>
                  <div style={{ flex: '1 1 180px' }}>
                    <input
                      style={s.fieldInput}
                      value={goodwillReason}
                      maxLength={300}
                      aria-label="Reason for the goodwill credit"
                      placeholder="Reason (required)"
                      onChange={(e) => { setGoodwillReason(e.target.value); setGoodwillError(''); }}
                    />
                  </div>
                  <button
                    type="button"
                    style={{ ...s.confirmBtn, flex: '0 0 auto', background: GREEN_TEXT, ...(!goodwillOk ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    disabled={!goodwillOk || goodwillMutation.isPending}
                    onClick={() => goodwillOk && runGoodwill({ id: detailTarget.id, amount: Number(goodwillAmt), reason: goodwillReason.trim() })}
                  >
                    {goodwillMutation.isPending ? 'Adding…' : 'Add Credit'}
                  </button>
                </div>
                {goodwillIssue && goodwillAmt.trim() !== '' && <div role="alert" style={s.errorText}>{goodwillIssue}</div>}
                {goodwillError && <div role="alert" style={{ ...s.errorBox, marginTop: 8 }}>{goodwillError}</div>}
              </div>
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
}

function statusWord(status: string): string {
  return status === 'APPROVED' ? 'Approved' : status === 'PENDING' ? 'Pending' : status === 'FLAGGED' ? 'Flagged' : status === 'VOIDED' ? 'Voided' : 'Rejected';
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' },
  eyebrow: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: PRIMARY },

  headerStats: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  statChip: {
    background: '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
    borderRadius: 12, padding: '10px 16px', textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  statNum: { display: 'block', fontSize: 18, fontWeight: 800, color: PRIMARY },
  statLbl: { display: 'block', fontSize: 12, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  exportBtn: { padding: '9px 18px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15 },

  searchRow: { display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' },
  searchWrap: { flex: '1 1 240px', position: 'relative' },
  searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb',
    fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, background: '#fff',
  },
  searchBtn: { padding: '10px 22px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15 },
  clearBtn: { padding: '10px 16px', background: '#f8fafc', color: TEXT_MUTED, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 10, cursor: 'pointer', fontSize: 15 },

  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 16, marginBottom: 24 },

  card: {
    background: '#fff', borderRadius: 18,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '18px 20px',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  cardInactive: { background: '#f3f4f6', border: '1px dashed #d1d5db' },

  cardTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: {
    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 18, fontWeight: 800,
  },
  customerName: { fontWeight: 700, fontSize: 15, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  customerPhone: { fontSize: 14, color: TEXT_MUTED, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  balancePill: {
    borderWidth: '1px', borderStyle: 'solid',
    borderRadius: 10, padding: '10px 14px', marginBottom: 14,
    display: 'flex', alignItems: 'baseline', gap: 6,
  },
  balanceAmt: { fontSize: 22, fontWeight: 800 },
  balanceLbl: { fontSize: 13, color: TEXT_MUTED, fontWeight: 600 },

  statsRow: { display: 'flex', alignItems: 'center', marginBottom: 14 },
  statBlock: { flex: 1, textAlign: 'center' },
  statBlockNum: { fontSize: 14, fontWeight: 800, color: '#111827' },
  statBlockLbl: { fontSize: 12, color: TEXT_MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  statDivider: { width: 1, height: 28, background: '#f0f1f2' },

  cardDivider: { height: 1, background: '#e5e7eb', marginBottom: 14 },

  actionBtn: { width: '100%', padding: '9px 0', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  actionBtnView: { background: '#eff6ff', color: '#1d4ed8', marginBottom: 8 },
  actionBtnRestrict: { background: '#fff1f2', color: RED_TEXT },
  actionBtnRestore: { background: '#f0fdf4', color: GREEN_TEXT },
  actionBtnDelete: { background: '#7f1d1d', color: '#fff', marginTop: 8 },

  // Test-account tag, next to a customer's phone
  testBadge: { marginLeft: 8, padding: '1px 7px', background: '#f3f4f6', color: TEXT_MUTED, fontSize: 11, fontWeight: 800, borderRadius: 6, letterSpacing: 0.5, verticalAlign: 'middle' },
  testNote: { fontSize: 13, color: TEXT_MUTED, fontStyle: 'italic' },

  // Filters
  moreFiltersBtn: { padding: '10px 16px', background: '#fff', color: '#374151', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 },
  moreFiltersBtnActive: { borderColor: PRIMARY, color: PRIMARY },
  filterPanel: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 24 },
  filterGroupLabel: { fontSize: 12, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  filterChoices: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' },
  radioLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#374151', cursor: 'pointer' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#374151', cursor: 'pointer' },

  // Customer detail panel
  detailSummaryRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  detailStat: { flex: '1 1 100px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', textAlign: 'center' },
  detailStatNum: { fontSize: 15, fontWeight: 800, color: '#111827' },
  detailStatLbl: { fontSize: 12, color: TEXT_MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  detailSectionTitle: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  detailEmpty: { fontStyle: 'italic', fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 },
  detailRow: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, color: '#374151', padding: '6px 0', borderBottom: '1px solid #f0f1f2', flexWrap: 'wrap' },
  goodwillBox: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 16px' },

  emptyState: { textAlign: 'center', padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#374151' },
  emptySub: { fontSize: 15, color: TEXT_MUTED },

  // Tabs
  tabs: { display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24, borderBottom: '2px solid #f0f1f2', paddingBottom: 0 },
  tab: {
    padding: '10px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, color: TEXT_MUTED, borderBottom: '2px solid transparent', marginBottom: -2,
  },
  tabActive: { color: PRIMARY, borderBottomColor: PRIMARY },

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
  disputeMeta: { fontSize: 14, color: TEXT_MUTED },
  disputeCustomer: { fontSize: 14, fontWeight: 700, color: '#111827' },
  disputeDesc: { fontSize: 15, color: '#374151', marginTop: 4, lineHeight: 1.5 },
  resolveBtn: {
    padding: '8px 18px', background: PRIMARY, color: '#fff', border: 'none',
    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, flexShrink: 0,
  },

  linkedTxCard: {
    marginTop: 10, padding: '12px 14px', background: '#f8fafc',
    borderRadius: 12, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
  },
  linkedTxHeader: { fontSize: 12, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  linkedTxRow: { fontSize: 14, color: '#374151', marginBottom: 4 },
  linkedTxReceipt: { width: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'cover' as const, marginTop: 6, cursor: 'pointer' },

  // The reason a customer was restricted, on their card
  fraudBadge: {
    display: 'inline-block', marginTop: 4, padding: '2px 8px', background: '#fff1f2',
    color: RED_TEXT, fontSize: 13, fontWeight: 700, borderRadius: 6,
    maxWidth: '100%', overflowWrap: 'anywhere' as const,
  },

  // Boxes
  modalForm: { display: 'flex', flexDirection: 'column', gap: 14 },
  modalText: { fontSize: 15, color: '#374151', lineHeight: 1.6 },
  fieldLabel: { display: 'block', fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  fieldInput: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 15, boxSizing: 'border-box' as const, outline: 'none' },
  errorBox: { fontSize: 15, color: '#7f1d1d', lineHeight: 1.5, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px' },
  errorText: { fontSize: 13, color: RED_TEXT, marginTop: 6 },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 15 },
  modalActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  cancelBtn: { flex: 1, minWidth: 90, padding: '11px 0', background: '#fff', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', color: '#374151', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  confirmBtn: { flex: 1, minWidth: 90, padding: '11px 12px', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
