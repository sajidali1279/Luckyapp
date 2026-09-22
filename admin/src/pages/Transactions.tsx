import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { pointsApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import DataTablePagination from '../components/DataTablePagination';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { storeToday, addDays, storeDay, storeTime } from '../lib/storeDates';
import { badgeInk } from './dashboard/shared';
import { serverMessage } from '../lib/apiError';
import { useDialog } from '../hooks/useDialog';

const CATEGORIES = [
  { value: 'GAS', label: '⛽ Gas' },
  { value: 'DIESEL', label: '🚛 Diesel' },
  { value: 'GROCERIES', label: '🛒 Groceries' },
  { value: 'HOT_FOODS', label: '🌮 Hot Foods' },
  { value: 'FROZEN_FOODS', label: '🧊 Frozen Foods' },
  { value: 'FRESH_FOODS', label: '🥗 Fresh Foods' },
  { value: 'OTHER', label: '🏪 Other' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING:  '#F4A261',
  FLAGGED:  '#9B2335',
  APPROVED: '#2DC653',
  REJECTED: '#C1121F',
};

// Text-safe greens and reds: #2DC653 and #E63946 are fine as badge backgrounds but not as small text on white.
const APPROVED_TEXT = '#157A3E';
const DANGER = '#C1121F';

const FRAUD_FLAG_LABELS: Record<string, string> = {
  HIGH_AMOUNT:       'High amount (non-gas)',
  LARGE_PURCHASE:    'Very large purchase (>$800)',
  CUSTOMER_VELOCITY: 'Customer has 4+ transactions today',
  EMPLOYEE_VELOCITY: 'Cashier granted 15+ times this hour',
  REPEAT_PAIR:       'Same cashier → same customer 2×+ today',
};

function fmt$(n: number) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The stores are in Texas: default dates and the times in the table use the store calendar and clock,
// wherever the admin is opened.
const todayStr = () => storeToday();
const monthAgoStr = () => addDays(storeToday(), -30);

// One row with unreadable flag text must not take the whole table down.
function parseFlags(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

type DecisionKind = 'REJECT_PENDING' | 'APPROVE_FLAGGED' | 'REJECT_FLAGGED';
interface Decision { kind: DecisionKind; tx: any }

export default function Transactions() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const location = useLocation();
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  const [decision, setDecision] = useState<Decision | null>(null);

  // Filters live in the URL (so a view — a store's flagged sales, a customer's last month — can be bookmarked
  // or shared) and are only READ from it once, on the first render; after that, this state is the source of
  // truth and a dedicated effect below keeps the URL in sync with it, one direction, so typing never fights
  // with the address bar. Platform admins open on "Needs review": flagged sales first, then sales still
  // waiting for a receipt. That is exactly what the sidebar badge counts, so the badge and this page agree.
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = useRef(searchParams);
  const paramOr = (key: string, fallback: string) => { const v = initial.current.get(key); return v !== null ? v : fallback; };

  const [selectedStore, setSelectedStore] = useState<string>(() => paramOr('store', ''));
  const [statusFilter, setStatusFilter] = useState<string>(() => paramOr('status', isSuperAdmin ? 'NEEDS_REVIEW' : 'PENDING'));
  const [categoryFilter, setCategoryFilter] = useState<string>(() => paramOr('category', ''));
  const [from, setFrom] = useState<string>(() => paramOr('from', monthAgoStr()));
  const [to, setTo] = useState<string>(() => paramOr('to', todayStr()));
  const [searchInput, setSearchInput] = useState<string>(() => paramOr('search', ''));
  const [search, setSearch] = useState<string>(() => paramOr('search', ''));
  const [minAmountInput, setMinAmountInput] = useState<string>(() => paramOr('minAmount', ''));
  const [maxAmountInput, setMaxAmountInput] = useState<string>(() => paramOr('maxAmount', ''));
  const [minAmount, setMinAmount] = useState<string>(() => paramOr('minAmount', ''));
  const [maxAmount, setMaxAmount] = useState<string>(() => paramOr('maxAmount', ''));
  const [includeTestData, setIncludeTestData] = useState<boolean>(() => paramOr('includeTestData', '') === 'true');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState<boolean>(() => !!minAmount || !!maxAmount || includeTestData);
  const [page, setPage] = useState<number>(() => { const p = Number(paramOr('page', '1')); return Number.isInteger(p) && p >= 1 ? p : 1; });

  // The search and amount boxes commit 300ms after the last keystroke, so a fetch does not fire on every character.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setMinAmount(minAmountInput); setMaxAmount(maxAmountInput); setPage(1); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, minAmountInput, maxAmountInput]);

  // Keeps the address bar in sync, one direction only (state -> URL); empty/default values are left out so the
  // URL stays short and clean.
  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedStore) next.set('store', selectedStore);
    if (statusFilter) next.set('status', statusFilter);
    if (categoryFilter) next.set('category', categoryFilter);
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    if (search) next.set('search', search);
    if (minAmount) next.set('minAmount', minAmount);
    if (maxAmount) next.set('maxAmount', maxAmount);
    if (includeTestData) next.set('includeTestData', 'true');
    if (page > 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore, statusFilter, categoryFilter, from, to, search, minAmount, maxAmount, includeTestData, page]);

  // Changing a filter always goes back to page 1 in the same step, so the old page number is never sent with the new filter.
  const withPageReset = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1); };
  const changeStore = withPageReset(setSelectedStore);
  const changeStatus = withPageReset(setStatusFilter);
  const changeCategory = withPageReset(setCategoryFilter);
  const changeFrom = withPageReset(setFrom);
  const changeTo = withPageReset(setTo);
  const changeIncludeTestData = (v: boolean) => { setIncludeTestData(v); setPage(1); };

  // Pre-fill status filter from notification deep-link (e.g. navigate('/transactions', { state: { statusFilter: 'REJECTED' } }))
  useEffect(() => {
    const nav = location.state as { statusFilter?: string } | null;
    if (nav?.statusFilter) {
      setStatusFilter(nav.statusFilter);
      window.history.replaceState({}, '');
    }
  }, []);

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

  const badRange = !!from && !!to && from > to;
  const badAmounts = !!minAmount && !!maxAmount && Number(minAmount) > Number(maxAmount);

  // SuperAdmin: use all-transactions endpoint. Dates travel as plain store dates (YYYY-MM-DD).
  const allTxParams: Record<string, string> = { page: String(page), limit: '25' };
  if (selectedStore)   allTxParams.storeId  = selectedStore;
  if (statusFilter)    allTxParams.status   = statusFilter;
  if (categoryFilter)  allTxParams.category = categoryFilter;
  if (from)             allTxParams.from    = from;
  if (to)               allTxParams.to      = to;
  if (search)           allTxParams.search  = search;
  if (minAmount)        allTxParams.minAmount = minAmount;
  if (maxAmount)        allTxParams.maxAmount = maxAmount;
  if (includeTestData)  allTxParams.includeTestData = 'true';

  const { data: allTxData, isLoading: allTxLoading, isError: allTxError, refetch: refetchAll } = useQuery({
    queryKey: ['all-transactions', allTxParams],
    queryFn: () => pointsApi.getAllTransactions(allTxParams),
    enabled: isSuperAdmin && !badRange && !badAmounts,
  });

  // StoreManager: use per-store endpoint
  const { data: storeTxData, isLoading: storeTxLoading, isError: storeTxError, refetch: refetchStore } = useQuery({
    queryKey: ['transactions', selectedStore, statusFilter, page],
    queryFn: () => pointsApi.getStoreTransactions(selectedStore, statusFilter || undefined, page),
    enabled: !isSuperAdmin && !!selectedStore,
  });

  // After any decision (or a refusal because someone else decided first) the list and the sidebar badge are reloaded.
  function refreshLists() {
    qc.invalidateQueries({ queryKey: ['all-transactions'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['transactions-pending-count'] });
  }

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => pointsApi.reject(id, reason),
    onSuccess: () => toast.success('Transaction rejected'),
    onError: (e: any) => toast.error(serverMessage(e, 'Failed to reject')),
    onSettled: refreshLists,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'APPROVE' | 'REJECT'; reason?: string }) =>
      pointsApi.reviewFlagged(id, action, reason),
    onSuccess: (_res, { action }) => {
      toast.success(action === 'APPROVE' ? 'Transaction approved - points credited' : 'Flagged transaction rejected');
    },
    onError: (e: any) => toast.error(serverMessage(e, 'Failed to review transaction')),
    onSettled: refreshLists,
  });

  // While a decision is being sent, the dialog stays open with its buttons disabled, so it cannot be sent twice.
  const busy = rejectMutation.isPending || reviewMutation.isPending;

  // The button only disables after React re-renders, and a fast double click can land before that: this lock is immediate.
  const sending = useRef(false);

  function confirmDecision(reasonInput?: string) {
    if (!decision || sending.current) return;
    sending.current = true;
    const reason = reasonInput?.trim() || undefined;
    const closeWhenDone = { onSettled: () => { sending.current = false; setDecision(null); setPanelId(null); } };
    if (decision.kind === 'REJECT_PENDING') {
      rejectMutation.mutate({ id: decision.tx.id, reason }, closeWhenDone);
    } else {
      reviewMutation.mutate({ id: decision.tx.id, action: decision.kind === 'APPROVE_FLAGGED' ? 'APPROVE' : 'REJECT', reason }, closeWhenDone);
    }
  }

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
  const isError = isSuperAdmin ? allTxError : storeTxError;
  const refetch = isSuperAdmin ? refetchAll : refetchStore;
  const summary = allTxData?.data?.data?.summary;

  // Deciding the last row on the last page leaves that page empty: step back instead of showing "nothing found".
  useEffect(() => {
    if (!isLoading && !isError && transactions.length === 0 && page > 1) setPage((p) => Math.max(1, p - 1));
  }, [isLoading, isError, transactions.length, page]);

  function resetFilters() {
    setSelectedStore(''); setStatusFilter(''); setCategoryFilter('');
    setFrom(monthAgoStr()); setTo(todayStr());
    setSearchInput(''); setSearch(''); setMinAmountInput(''); setMaxAmountInput(''); setMinAmount(''); setMaxAmount('');
    setIncludeTestData(false); setPage(1);
  }

  // ── Keyboard queue: J/K move a highlighted row, Enter opens its details panel, A approves and R rejects
  // whichever sale is active (the one open in the panel, or the highlighted one if the panel is closed).
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [panelId, setPanelId] = useState<string | null>(null);
  useEffect(() => { setFocusedIndex(-1); setPanelId(null); }, [selectedStore, statusFilter, categoryFilter, from, to, search, minAmount, maxAmount, includeTestData, page]);
  useEffect(() => {
    // A decided sale leaves the current filtered view once the list refetches: close a panel pointed at it.
    if (panelId && !transactions.some((t: any) => t.id === panelId)) setPanelId(null);
  }, [transactions, panelId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing || decision) return; // typing in a box, or a confirm dialog already owns the keyboard
      const activeTx = panelId ? transactions.find((t: any) => t.id === panelId) : (focusedIndex >= 0 ? transactions[focusedIndex] : null);
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocusedIndex((i) => Math.min(transactions.length - 1, i + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocusedIndex((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Enter' && !panelId && focusedIndex >= 0 && transactions[focusedIndex]) { e.preventDefault(); setPanelId(transactions[focusedIndex].id); }
      else if ((e.key === 'a' || e.key === 'A') && activeTx?.status === 'FLAGGED' && activeTx.receiptImageUrl) { e.preventDefault(); setDecision({ kind: 'APPROVE_FLAGGED', tx: activeTx }); }
      else if ((e.key === 'r' || e.key === 'R') && activeTx?.status === 'FLAGGED') { e.preventDefault(); setDecision({ kind: 'REJECT_FLAGGED', tx: activeTx }); }
      else if ((e.key === 'r' || e.key === 'R') && activeTx?.status === 'PENDING') { e.preventDefault(); setDecision({ kind: 'REJECT_PENDING', tx: activeTx }); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [transactions, focusedIndex, decision, panelId]);

  const panelTx = panelId ? transactions.find((t: any) => t.id === panelId) : null;
  const panelActive = isSuperAdmin && !!panelTx;
  const { data: panelCustTx } = useQuery({
    queryKey: ['tx-panel-customer', panelTx?.customer?.id],
    queryFn: () => pointsApi.getAllTransactions({ customerId: panelTx.customer.id, limit: '5', includeTestData: 'true' }),
    enabled: panelActive && !!panelTx?.customer?.id,
  });
  const { data: panelEmpTx } = useQuery({
    queryKey: ['tx-panel-employee', panelTx?.grantedBy?.id],
    queryFn: () => pointsApi.getAllTransactions({ grantedById: panelTx.grantedBy.id, limit: '5', includeTestData: 'true' }),
    enabled: panelActive && !!panelTx?.grantedBy?.id,
  });
  const panelDialogRef = useRef<HTMLDivElement>(null);
  useDialog(!!panelTx, panelDialogRef, () => setPanelId(null), false);

  const [exporting, setExporting] = useState(false);
  async function handleExportCsv() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (selectedStore)  params.storeId  = selectedStore;
      if (statusFilter)   params.status   = statusFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (from) params.from = from;
      if (to)   params.to   = to;
      if (search)          params.search  = search;
      if (minAmount)       params.minAmount = minAmount;
      if (maxAmount)       params.maxAmount = maxAmount;
      if (includeTestData) params.includeTestData = 'true';
      const res = await api.get('/points/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="(.+?)"/);
      a.download = match ? match[1] : 'transactions.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed - try again');
    } finally {
      setExporting(false);
    }
  }

  function copyId(id: string) {
    const write = navigator.clipboard?.writeText(id);
    if (!write) { toast.error('Copying is not available in this browser'); return; }
    write.then(() => toast.success('Transaction ID copied')).catch(() => toast.error('Could not copy the transaction ID'));
  }

  // What the confirmation dialog says: who, how much, why it was flagged, and exactly what will happen.
  const dTx = decision?.tx;
  const dFlags = dTx ? parseFlags(dTx.fraudFlags) : [];
  const dCredit = dTx ? Number(dTx.pointsAwarded || 0) + Number(dTx.gasBonusPoints || 0) : 0;
  const dCopy = decision ? {
    APPROVE_FLAGGED: {
      title: 'Approve and credit points?', confirmLabel: 'Approve and credit', danger: false,
      effect: `${fmt$(dCredit)} (${Math.round(dCredit * 100).toLocaleString()} pts) will be added to the customer's balance now and they will be notified. This cannot be undone.`,
    },
    REJECT_FLAGGED: {
      title: 'Reject this flagged sale?', confirmLabel: 'Reject sale', danger: true,
      effect: 'The customer will not receive points and will be told the sale was reviewed and rejected. This cannot be undone.',
    },
    REJECT_PENDING: {
      title: 'Reject this transaction?', confirmLabel: 'Reject', danger: true,
      effect: 'It will be marked as rejected, the customer will not receive points for it, and they will be told it could not be verified.',
    },
  }[decision.kind] : null;

  return (
    <div style={s.container}>
      <ConfirmModal
        open={!!decision && !!dCopy}
        title={dCopy?.title ?? ''}
        message={dTx && dCopy ? (
          <>
            <div style={{ fontWeight: 700, color: '#111827' }}>{dTx.customer?.name || 'Customer'}{dTx.customer?.phone ? ` (${dTx.customer.phone})` : ''}</div>
            <div>{fmt$(dTx.purchaseAmount)} {String(dTx.category || '').replace(/_/g, ' ').toLowerCase()} at {dTx.store?.name || 'the store'}</div>
            <div style={{ fontSize: 13 }}>{storeDay(dTx.createdAt)}, {storeTime(dTx.createdAt)} (Central)</div>
            {dFlags.length > 0 && (
              <ul style={s.dialogFlags}>
                {dFlags.map((f) => <li key={f}>{FRAUD_FLAG_LABELS[f] || f}</li>)}
              </ul>
            )}
            <div style={{ marginTop: 10 }}>{dCopy.effect}</div>
          </>
        ) : ''}
        confirmLabel={dCopy?.confirmLabel}
        danger={dCopy?.danger}
        busy={busy}
        withInput={decision?.kind === 'REJECT_PENDING' || decision?.kind === 'REJECT_FLAGGED'}
        inputLabel="Reason (optional)"
        inputPlaceholder="Kept in the activity log; the customer is told it too"
        onConfirm={confirmDecision}
        onCancel={() => setDecision(null)}
      />
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🧾 Transactions</h1>
          <p style={s.sub}>Review and manage point grant activity</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {total > 0 && <div style={s.totalBadge}>{total.toLocaleString()} transaction{total !== 1 ? 's' : ''}</div>}
          {total > 0 && (
            <button
              style={s.exportBtn}
              onClick={handleExportCsv}
              disabled={exporting}
              title="Download filtered transactions as CSV"
            >
              {exporting ? '⏳ Exporting…' : '⬇ Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={s.filterBar}>
        {isSuperAdmin && (
          <select aria-label="Store" style={s.select} value={selectedStore} onChange={(e) => changeStore(e.target.value)}>
            <option value="">🌐 All Stores</option>
            {stores.map((store: any) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        )}

        <select aria-label="Status" style={s.select} value={statusFilter} onChange={(e) => changeStatus(e.target.value)}>
          {isSuperAdmin && <option value="NEEDS_REVIEW">🚨 Needs review</option>}
          <option value="">All Statuses</option>
          <option value="PENDING">⏳ Pending</option>
          <option value="FLAGGED">🚨 Flagged</option>
          <option value="APPROVED">✓ Approved</option>
          <option value="REJECTED">✕ Rejected</option>
        </select>

        {isSuperAdmin && (
          <select aria-label="Category" style={s.select} value={categoryFilter} onChange={(e) => changeCategory(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        )}

        {isSuperAdmin && (
          <>
            <input aria-label="From date" style={s.dateInput} type="date" value={from} onChange={(e) => changeFrom(e.target.value)} />
            <span style={{ color: TEXT_MUTED, fontSize: 15 }}>to</span>
            <input aria-label="To date" style={s.dateInput} type="date" value={to} onChange={(e) => changeTo(e.target.value)} />
          </>
        )}

        {isSuperAdmin && (
          <input
            aria-label="Search"
            style={s.searchInput}
            type="search"
            placeholder="Search customer, employee, phone or transaction ID"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        )}

        {isSuperAdmin && (
          <button style={s.clearBtn} onClick={() => setMoreFiltersOpen((v) => !v)} aria-expanded={moreFiltersOpen}>
            More filters {moreFiltersOpen ? '▴' : '▾'}
          </button>
        )}
        {isSuperAdmin && <button style={s.clearBtn} onClick={resetFilters}>Clear</button>}
      </div>

      {isSuperAdmin && moreFiltersOpen && (
        <div style={s.moreFiltersBar}>
          <label style={s.moreFiltersLabel}>
            Amount
            <input aria-label="Minimum amount" style={s.amountInput} type="number" min="0" step="0.01" placeholder="Min" value={minAmountInput} onChange={(e) => setMinAmountInput(e.target.value)} />
          </label>
          <span style={{ color: TEXT_MUTED, fontSize: 15 }}>to</span>
          <input aria-label="Maximum amount" style={s.amountInput} type="number" min="0" step="0.01" placeholder="Max" value={maxAmountInput} onChange={(e) => setMaxAmountInput(e.target.value)} />
          {badAmounts && <span style={{ color: '#C1121F', fontSize: 13 }}>The minimum is more than the maximum.</span>}
          <label style={s.testDataLabel}>
            <input type="checkbox" checked={includeTestData} onChange={(e) => changeIncludeTestData(e.target.checked)} />
            Include test data
          </label>
        </div>
      )}

      {/* ── Summary bar (SuperAdmin) ── */}
      {isSuperAdmin && summary && !badRange && (
        <>
          <div style={s.summaryBar}>
            <div style={s.summaryItem}>
              <span style={s.summaryLabel}>Approved Volume</span>
              <span style={s.summaryValue}>{fmt$(summary.purchaseVolume)}</span>
            </div>
            <div style={s.summaryDivider} />
            <div style={s.summaryItem}>
              <span style={s.summaryLabel}>Cashback Issued</span>
              <span style={{ ...s.summaryValue, color: APPROVED_TEXT }}>{fmt$(summary.cashbackIssued)}</span>
            </div>
            <div style={s.summaryDivider} />
            <div style={s.summaryItem}>
              <span style={s.summaryLabel}>Showing</span>
              <span style={s.summaryValue}>{total.toLocaleString()} records</span>
            </div>
          </div>
          {statusFilter && statusFilter !== 'APPROVED' && (
            <p style={s.summaryNote}>Approved volume and cashback always count approved sales for the store, category and dates chosen, whatever status is selected.</p>
          )}
        </>
      )}

      {isSuperAdmin && transactions.length > 0 && (
        <p style={s.keyboardHint}>
          <kbd style={s.kbd}>J</kbd> <kbd style={s.kbd}>K</kbd> move · <kbd style={s.kbd}>Enter</kbd> details · <kbd style={s.kbd}>A</kbd> approve · <kbd style={s.kbd}>R</kbd> reject a highlighted sale
        </p>
      )}

      {/* ── Table ── */}
      {!isSuperAdmin && !selectedStore ? (
        <div style={s.empty}>Select a store to view transactions.</div>
      ) : badRange ? (
        <div style={s.empty} role="alert">The start date is after the end date. Choose a start date on or before the end date.</div>
      ) : badAmounts ? (
        <div style={s.empty} role="alert">The minimum amount is more than the maximum. Choose a minimum at or below the maximum.</div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <TableSkeleton columns={isSuperAdmin ? 10 : 9} />
      ) : transactions.length === 0 ? (
        statusFilter === 'NEEDS_REVIEW' ? (
          <div style={s.empty}>
            <div style={{ fontSize: 34 }} aria-hidden="true">✅</div>
            <div style={{ fontWeight: 700, color: PRIMARY, margin: '8px 0 4px' }}>Nothing needs review right now</div>
            <div style={{ marginBottom: 16 }}>Flagged sales, and sales still waiting for a receipt, will appear here.</div>
            <button style={s.clearBtn} onClick={() => changeStatus('')}>Show all transactions</button>
          </div>
        ) : (
          <div style={s.empty}>No transactions found.</div>
        )
      ) : (
        <>
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                <TableHead style={s.th}>Date (Central)</TableHead>
                <TableHead style={s.th}>Customer</TableHead>
                <TableHead style={s.th}>Amount</TableHead>
                <TableHead style={s.th}>Cashback</TableHead>
                {isSuperAdmin && <TableHead style={s.th}>Store</TableHead>}
                <TableHead style={s.th}>Category</TableHead>
                <TableHead style={s.th}>Employee</TableHead>
                <TableHead style={s.th}>Status</TableHead>
                <TableHead style={s.th}>Receipt</TableHead>
                <TableHead style={s.th}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx: any, i: number) => {
                const flags = parseFlags(tx.fraudFlags);
                const hasReceipt = !!tx.receiptImageUrl;
                const who = tx.customer?.name || tx.customer?.phone || 'customer';
                const badgeBg = STATUS_COLORS[tx.status] || '#dee2e6';
                return (
                <TableRow
                  key={tx.id}
                  style={{
                    background: i === focusedIndex ? '#eef4ff' : tx.status === 'FLAGGED' ? '#fff5f5' : tx.status === 'REJECTED' ? '#f8f9fa' : undefined,
                    boxShadow: i === focusedIndex ? 'inset 3px 0 0 ' + PRIMARY : undefined,
                  }}
                >
                  <TableCell style={s.td}>
                    <div>{storeDay(tx.createdAt)}{tx.isTestData && <span style={s.testBadge} title="Marked as test data">TEST</span>}</div>
                    <div style={{ fontSize: 13, color: TEXT_MUTED }}>{storeTime(tx.createdAt)}</div>
                    <button
                      type="button"
                      style={s.copyId}
                      title="Click to copy full transaction ID"
                      aria-label={`Copy transaction ID ${tx.id}`}
                      onClick={() => copyId(tx.id)}
                    >
                      #{tx.id.slice(0, 8)}
                    </button>
                    <button
                      type="button"
                      style={s.detailsBtn}
                      aria-label={`Details for ${fmt$(tx.purchaseAmount)} sale for ${who}`}
                      onClick={() => { setFocusedIndex(i); setPanelId(tx.id); }}
                    >
                      Details
                    </button>
                  </TableCell>
                  <TableCell style={s.td}>
                    <div style={{ fontWeight: 600 }}>{tx.customer?.name || ' - '}</div>
                    <div style={{ fontSize: 13, color: TEXT_MUTED }}>{tx.customer?.phone}</div>
                  </TableCell>
                  <TableCell style={s.td}><strong>{fmt$(tx.purchaseAmount)}</strong></TableCell>
                  <TableCell style={s.td}>
                    <span
                      style={{
                        color: tx.status === 'APPROVED' ? APPROVED_TEXT : TEXT_MUTED,
                        fontWeight: 700,
                        textDecoration: tx.status === 'REJECTED' ? 'line-through' : undefined,
                      }}
                      title={tx.status === 'APPROVED' ? 'Credited to the customer' : tx.status === 'REJECTED' ? 'Not credited: rejected' : 'Not credited yet'}
                    >
                      {fmt$(tx.pointsAwarded)}
                    </span>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell style={s.td}><span style={{ fontSize: 15, color: PRIMARY, fontWeight: 600 }}>{tx.store?.name || ' - '}</span></TableCell>
                  )}
                  <TableCell style={s.td}>
                    <span style={s.catBadge}>{tx.category?.replace(/_/g, ' ') || ' - '}</span>
                  </TableCell>
                  <TableCell style={s.td}>{tx.grantedBy?.name || tx.grantedBy?.phone || ' - '}</TableCell>
                  <TableCell style={s.td}>
                    <div>
                      <span style={{ ...s.badge, background: badgeBg, color: badgeInk(badgeBg) }}>
                        {tx.status === 'FLAGGED' ? '🚨 FLAGGED' : tx.status}
                      </span>
                    </div>
                    {flags.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {flags.map((f: string) => (
                          <div key={f} style={{ fontSize: 12, color: '#9B2335', fontWeight: 600 }}>• {FRAUD_FLAG_LABELS[f] || f}</div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell style={s.td}>
                    {hasReceipt ? (
                      <a href={tx.receiptImageUrl} target="_blank" rel="noopener noreferrer" style={s.link}>View</a>
                    ) : tx.status === 'FLAGGED' ? (
                      <span style={{ fontSize: 13, color: '#9B2335', fontWeight: 600 }}>None yet</span>
                    ) : ' - '}
                  </TableCell>
                  <TableCell style={s.td}>
                    {tx.status === 'PENDING' && (
                      <button
                        style={s.rejectBtn}
                        aria-label={`Reject ${fmt$(tx.purchaseAmount)} transaction for ${who}`}
                        onClick={() => setDecision({ kind: 'REJECT_PENDING', tx })}
                      >
                        Reject
                      </button>
                    )}
                    {tx.status === 'FLAGGED' && (
                      <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                        <button
                          style={{ ...s.rejectBtn, ...s.approveBtn, ...(hasReceipt ? {} : s.approveOff) }}
                          disabled={!hasReceipt}
                          title={hasReceipt ? undefined : 'A receipt must be uploaded before this sale can be approved'}
                          aria-label={`Approve ${fmt$(tx.purchaseAmount)} sale for ${who}`}
                          onClick={() => setDecision({ kind: 'APPROVE_FLAGGED', tx })}
                        >
                          ✓ Approve
                        </button>
                        <button
                          style={s.rejectBtn}
                          aria-label={`Reject ${fmt$(tx.purchaseAmount)} sale for ${who}`}
                          onClick={() => setDecision({ kind: 'REJECT_FLAGGED', tx })}
                        >
                          ✕ Reject
                        </button>
                        {!hasReceipt && <div style={s.actionNote}>Waiting for the cashier's receipt</div>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <DataTablePagination
            page={page}
            totalPages={totalPages}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </>
      )}

      {panelTx && (
        <div style={s.panelOverlay} onClick={() => setPanelId(null)}>
          <div ref={panelDialogRef} role="dialog" aria-modal="true" aria-label="Transaction details" tabIndex={-1} style={s.panel} onClick={(e) => e.stopPropagation()}>
            <div style={s.panelHeader}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: PRIMARY }}>{panelTx.customer?.name || panelTx.customer?.phone || 'Customer'}</div>
                <div style={{ fontSize: 13, color: TEXT_MUTED }}>{panelTx.customer?.phone}</div>
              </div>
              <button type="button" style={s.panelClose} aria-label="Close details" onClick={() => setPanelId(null)}>✕</button>
            </div>

            <div style={s.panelBody}>
              <div style={s.panelSummary}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{fmt$(panelTx.purchaseAmount)}</span>
                <span style={{ ...s.badge, background: STATUS_COLORS[panelTx.status] || '#dee2e6', color: badgeInk(STATUS_COLORS[panelTx.status] || '#dee2e6') }}>
                  {panelTx.status === 'FLAGGED' ? '🚨 FLAGGED' : panelTx.status}
                </span>
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 4 }}>
                {panelTx.store?.name || 'the store'} · {panelTx.category?.replace(/_/g, ' ')} · {storeDay(panelTx.createdAt)}, {storeTime(panelTx.createdAt)} (Central)
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 14 }}>Granted by {panelTx.grantedBy?.name || panelTx.grantedBy?.phone || 'an employee'}</div>

              {parseFlags(panelTx.fraudFlags).length > 0 && (
                <ul style={s.dialogFlags}>
                  {parseFlags(panelTx.fraudFlags).map((f: string) => <li key={f}>{FRAUD_FLAG_LABELS[f] || f}</li>)}
                </ul>
              )}

              <div style={s.panelSectionTitle}>Receipt</div>
              {panelTx.receiptImageUrl ? (
                <a href={panelTx.receiptImageUrl} target="_blank" rel="noopener noreferrer">
                  <img src={panelTx.receiptImageUrl} alt="Receipt" style={s.panelReceiptImg} />
                </a>
              ) : (
                <div style={s.panelEmptyNote}>{panelTx.status === 'FLAGGED' ? 'Waiting for the cashier to upload a receipt.' : 'No receipt on file.'}</div>
              )}

              <div style={s.panelSectionTitle}>This customer's last sales</div>
              {(panelCustTx?.data?.data?.transactions ?? []).length === 0 ? (
                <div style={s.panelEmptyNote}>Nothing else on file.</div>
              ) : (
                (panelCustTx?.data?.data?.transactions ?? []).map((t: any) => (
                  <div key={t.id} style={{ ...s.panelMiniRow, ...(t.id === panelTx.id ? s.panelMiniRowSelf : {}) }}>
                    <span>{storeDay(t.createdAt)}</span>
                    <span>{fmt$(t.purchaseAmount)}</span>
                    <span style={{ ...s.badge, background: STATUS_COLORS[t.status] || '#dee2e6', color: badgeInk(STATUS_COLORS[t.status] || '#dee2e6'), fontSize: 11 }}>{t.status}</span>
                  </div>
                ))
              )}

              <div style={s.panelSectionTitle}>{panelTx.grantedBy?.name || 'This employee'}'s recent grants</div>
              {(panelEmpTx?.data?.data?.transactions ?? []).length === 0 ? (
                <div style={s.panelEmptyNote}>Nothing else on file.</div>
              ) : (
                (panelEmpTx?.data?.data?.transactions ?? []).map((t: any) => (
                  <div key={t.id} style={{ ...s.panelMiniRow, ...(t.id === panelTx.id ? s.panelMiniRowSelf : {}) }}>
                    <span>{storeDay(t.createdAt)}</span>
                    <span>{fmt$(t.purchaseAmount)}</span>
                    <span style={{ ...s.badge, background: STATUS_COLORS[t.status] || '#dee2e6', color: badgeInk(STATUS_COLORS[t.status] || '#dee2e6'), fontSize: 11 }}>{t.status}</span>
                  </div>
                ))
              )}
            </div>

            {panelTx.status === 'FLAGGED' && (
              <div style={s.panelActions}>
                <button
                  style={s.rejectBtn}
                  aria-label={`Reject ${fmt$(panelTx.purchaseAmount)} sale for ${panelTx.customer?.name || 'customer'}`}
                  onClick={() => setDecision({ kind: 'REJECT_FLAGGED', tx: panelTx })}
                >
                  ✕ Reject
                </button>
                <button
                  style={{ ...s.rejectBtn, ...s.approveBtn, ...(panelTx.receiptImageUrl ? {} : s.approveOff) }}
                  disabled={!panelTx.receiptImageUrl}
                  title={panelTx.receiptImageUrl ? undefined : 'A receipt must be uploaded before this sale can be approved'}
                  aria-label={`Approve ${fmt$(panelTx.purchaseAmount)} sale for ${panelTx.customer?.name || 'customer'}`}
                  onClick={() => setDecision({ kind: 'APPROVE_FLAGGED', tx: panelTx })}
                >
                  ✓ Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 800, color: PRIMARY, margin: 0 },
  sub: { color: TEXT_MUTED, marginTop: 4, marginBottom: 0 },
  totalBadge: { fontSize: 15, color: TEXT_MUTED, fontWeight: 600, alignSelf: 'center' },

  filterBar: {
    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
    marginBottom: 16, padding: '14px 16px', background: '#f8f9fa', borderRadius: 12,
  },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15, background: '#fff', cursor: 'pointer' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15 },
  clearBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontSize: 15, color: TEXT_MUTED, fontWeight: 600 },
  exportBtn: { padding: '8px 14px', borderRadius: 8, border: '1.5px solid #1D3557', background: PRIMARY, color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' as const },

  summaryBar: {
    display: 'flex', gap: 0, background: '#fff',
    borderRadius: 12, marginBottom: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2',
    overflow: 'hidden',
  },
  summaryItem: { flex: 1, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 2 },
  summaryDivider: { width: 1, background: '#f0f1f2' },
  summaryLabel: { fontSize: 13, color: TEXT_MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 20, fontWeight: 800, color: PRIMARY },
  summaryNote: { fontSize: 13, color: TEXT_MUTED, margin: '-12px 0 16px' },

  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  th: { background: '#f8f9fa', padding: '12px 14px', textAlign: 'left', fontSize: 14, color: TEXT_MUTED, fontWeight: 600, whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', borderBottom: '1px solid #f0f1f2', fontSize: 15, verticalAlign: 'middle' },
  badge: { borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 600 },
  catBadge: { background: '#f8f9fa', color: '#495057', borderRadius: 6, padding: '3px 8px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  link: { color: PRIMARY, fontWeight: 600, fontSize: 15 },
  copyId: { display: 'block', background: 'none', border: 'none', padding: 0, marginTop: 2, fontSize: 12, color: TEXT_MUTED, cursor: 'pointer', fontFamily: 'inherit' },
  rejectBtn: { background: 'none', border: `1px solid ${DANGER}`, color: DANGER, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 14 },
  approveBtn: { background: APPROVED_TEXT, border: `1px solid ${APPROVED_TEXT}`, color: '#fff' },
  approveOff: { background: '#e9ecef', border: '1px solid #ced4da', color: '#6c757d', cursor: 'not-allowed' },
  actionNote: { fontSize: 12, color: TEXT_MUTED, maxWidth: 130 },
  dialogFlags: { textAlign: 'left', color: '#9B2335', fontSize: 13, fontWeight: 600, margin: '8px auto 0', paddingLeft: 20, maxWidth: 320 },
  empty: { color: TEXT_MUTED, textAlign: 'center', padding: 60 },

  searchInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15, minWidth: 240, flex: '1 1 240px' },
  moreFiltersBar: {
    display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
    marginTop: -8, marginBottom: 16, padding: '12px 16px', background: '#f8f9fa', borderRadius: 12,
  },
  moreFiltersLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: TEXT_MUTED, fontWeight: 600 },
  amountInput: { width: 100, padding: '8px 10px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15, boxSizing: 'border-box' },
  testDataLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: TEXT_MUTED, fontWeight: 600, cursor: 'pointer' },
  testBadge: { marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px', letterSpacing: 0.3 },
  detailsBtn: { display: 'block', background: 'none', border: 'none', padding: 0, marginTop: 3, fontSize: 12, color: PRIMARY, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, textDecoration: 'underline' },

  keyboardHint: { fontSize: 13, color: TEXT_MUTED, margin: '-6px 0 12px' },
  kbd: { fontSize: 11, fontWeight: 700, color: TEXT_MUTED, background: '#f4f4f7', border: '1px solid #e5e5ea', borderRadius: 4, padding: '1px 5px' },

  panelOverlay: { position: 'fixed', inset: 0, background: 'rgba(15,20,30,0.4)', zIndex: 1100, display: 'flex', justifyContent: 'flex-end' },
  panel: {
    width: '100%', maxWidth: 420, height: '100%', background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column', outline: 'none',
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid #f0f1f2' },
  panelClose: { background: 'none', border: 'none', fontSize: 18, color: TEXT_MUTED, cursor: 'pointer', padding: 4, lineHeight: 1 },
  panelBody: { padding: '16px 20px', overflowY: 'auto', flex: 1 },
  panelSummary: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 },
  panelSectionTitle: { fontSize: 12.5, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, margin: '18px 0 8px' },
  panelReceiptImg: { width: '100%', borderRadius: 10, border: '1px solid #f0f1f2', display: 'block' },
  panelEmptyNote: { fontSize: 13.5, color: TEXT_MUTED },
  panelMiniRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5, borderBottom: '1px solid #f7f7f8' },
  panelMiniRowSelf: { background: '#eef4ff', borderRadius: 6, padding: '6px 8px', margin: '0 -8px' },
  panelActions: { display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid #f0f1f2' },
};
