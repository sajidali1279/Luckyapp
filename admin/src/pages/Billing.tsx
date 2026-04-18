import { Fragment, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { billingApi } from '../services/api';

interface BillNotes {
  txCount: number; purchaseVolume: number;
  cashbackIssued: number; devCutEarned: number; customerCashback: number;
  effectiveCashbackRate: number; effectiveDevCutRate: number;
  categories: { category: string; txCount: number; purchaseVolume: number; cashbackIssued: number; devCutEarned: number; customerCashback: number }[];
  subscriptionFee: number; transactionFeeRate: number; transactionFee: number;
  cashbackFee: number; totalAmountOwed: number; periodStart: string; periodEnd: string;
}

type Tab = 'stores' | 'monthly' | 'settings';

const BILLING_TYPES = ['MONTHLY_SUBSCRIPTION', 'PER_TRANSACTION', 'HYBRID'] as const;
const TIER_EMOJI: Record<string, string> = { BRONZE: '🥉', SILVER: '🥈', GOLD: '🥇', DIAMOND: '💎', PLATINUM: '👑' };

function needsSubscription(type: string) { return type === 'MONTHLY_SUBSCRIPTION' || type === 'HYBRID'; }
function needsTransactionFee(type: string) { return type === 'PER_TRANSACTION' || type === 'HYBRID'; }
function fmt$(n: number) { return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

function downloadBillsCSV(invoices: any[]) {
  const headers = ['Period', 'Stores', 'Transactions', 'Purchase Volume', 'Dev Cut Owed', 'Status', 'Paid At'];
  const rows = invoices.map((inv: any) => [
    inv.period, inv.stores.length, inv.totalTxns,
    inv.totalVolume.toFixed(2), inv.totalDevCut.toFixed(2),
    inv.isPaid ? 'PAID' : 'UNPAID', inv.isPaid && inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '',
  ]);
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `luckystop-bills-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


export default function Billing() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('stores');

  // ── Store billing state ──────────────────────────────────────────────────────
  const [editingStore, setEditingStore] = useState<string | null>(null);
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState({ billingType: '', subscriptionPrice: '', transactionFeeRate: '' });

  // ── Monthly billing state ────────────────────────────────────────────────────
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'unpaid'>('all');

  // ── Settings state ───────────────────────────────────────────────────────────
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  // Tier rates inline editing: { tier → { cashbackRate: string, gasCentsPerGallon: string } }
  const [tierEdits, setTierEdits] = useState<Record<string, { cashbackRate: string; gasCentsPerGallon: string }>>({});

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data, isLoading: storesLoading } = useQuery({
    queryKey: ['billing-stores'],
    queryFn: () => billingApi.getAllStores(),
  });

  const { data: revenueData } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => billingApi.getRevenue(),
  });

  const { data: devCutData, isLoading: rateLoading } = useQuery({
    queryKey: ['dev-cut-rate'],
    queryFn: () => billingApi.getDevCutRate(),
  });

  const { data: tierRatesData, isLoading: tierRatesLoading } = useQuery({
    queryKey: ['tier-rates'],
    queryFn: () => billingApi.getTierRates(),
    enabled: tab === 'settings',
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['monthly-records', selectedPeriod, filterPaid],
    queryFn: () => billingApi.getMonthlyRecords(
      selectedPeriod || undefined,
      undefined,
      filterPaid === 'all' ? undefined : filterPaid === 'paid',
    ),
    enabled: tab === 'monthly',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const updateBilling = useMutation({
    mutationFn: ({ storeId, data }: { storeId: string; data: object }) =>
      billingApi.updateStoreBilling(storeId, data),
    onSuccess: () => { toast.success('Billing updated'); setEditingStore(null); qc.invalidateQueries({ queryKey: ['billing-stores'] }); },
    onError: () => toast.error('Failed to update billing'),
  });

  const updateRate = useMutation({
    mutationFn: (rate: number) => billingApi.updateDevCutRate(rate),
    onSuccess: () => { toast.success('Dev cut rate updated'); setEditingRate(false); qc.invalidateQueries({ queryKey: ['dev-cut-rate'] }); qc.invalidateQueries({ queryKey: ['revenue'] }); },
    onError: () => toast.error('Failed to update rate'),
  });

  const updateTierRate = useMutation({
    mutationFn: ({ tier, data }: { tier: string; data: { cashbackRate?: number; gasCentsPerGallon?: number | null } }) =>
      billingApi.updateTierRate(tier, data),
    onSuccess: (_res, vars) => {
      toast.success(`${vars.tier} tier updated`);
      setTierEdits(prev => { const n = { ...prev }; delete n[vars.tier]; return n; });
      qc.invalidateQueries({ queryKey: ['tier-rates'] });
    },
    onError: () => toast.error('Failed to update tier rate'),
  });

  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [invoiceView, setInvoiceView] = useState<{ record: any; period: string } | null>(null);
  const [combinedInvoiceView, setCombinedInvoiceView] = useState<any | null>(null);

  const generateBills = useMutation({
    mutationFn: () => billingApi.generateMonthlyBilling(selectedPeriod || undefined),
    onSuccess: (res) => { toast.success(res.data?.message || 'Done'); qc.invalidateQueries({ queryKey: ['monthly-records'] }); },
    onError: () => toast.error('Failed to generate bills'),
  });

  const generateAllBills = useMutation({
    mutationFn: () => billingApi.generateAllMissingBills(),
    onSuccess: (res) => { toast.success(res.data?.message || 'Done'); qc.invalidateQueries({ queryKey: ['monthly-records'] }); },
    onError: () => toast.error('Failed to generate all bills'),
  });

  const seedData = useMutation({
    mutationFn: () => billingApi.seedTestData(),
    onSuccess: (res) => { toast.success(res.data?.message || 'Test data seeded!'); qc.invalidateQueries({ queryKey: ['billing-stores'] }); qc.invalidateQueries({ queryKey: ['revenue'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to seed test data'),
  });

  const sendReport = useMutation({
    mutationFn: () => billingApi.sendReport(selectedPeriod || undefined),
    onSuccess: (res) => toast.success(res.data?.message || 'Report sent'),
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to send report'),
  });

  const markPeriodPaid = useMutation({
    mutationFn: (period: string) => billingApi.markPeriodPaid(period),
    onSuccess: () => { toast.success('Invoice marked as paid'); qc.invalidateQueries({ queryKey: ['monthly-records'] }); qc.invalidateQueries({ queryKey: ['revenue'] }); },
    onError: () => toast.error('Failed to mark paid'),
  });

  const stores = data?.data?.data || [];
  const revenue = revenueData?.data?.data;
  const devCutRate = devCutData?.data?.data?.rate ?? 0.02;
  const tierRates: { tier: string; cashbackRate: number; gasCentsPerGallon: number | null }[] = tierRatesData?.data?.data || [];
  const monthlyRecords: any[] = monthlyData?.data?.data?.records || [];

  // Consolidate per-store records into one invoice per period
  const consolidatedInvoices = Object.values(
    monthlyRecords.reduce((acc: Record<string, any>, r: any) => {
      if (!acc[r.period]) {
        acc[r.period] = { period: r.period, totalDevCut: 0, totalCashback: 0, totalTxns: 0, totalVolume: 0, stores: [], isPaid: true, paidAt: null };
      }
      const n: BillNotes | null = r.notes;
      acc[r.period].totalDevCut    += r.amount;
      acc[r.period].totalCashback  += n?.cashbackIssued ?? 0;
      acc[r.period].totalTxns      += n?.txCount ?? 0;
      acc[r.period].totalVolume    += n?.purchaseVolume ?? 0;
      acc[r.period].stores.push(r);
      if (!r.isPaid) acc[r.period].isPaid = false;
      if (r.isPaid && r.paidAt && !acc[r.period].paidAt) acc[r.period].paidAt = r.paidAt;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.period.localeCompare(a.period));

  // ── Store billing handlers ────────────────────────────────────────────────────
  function startEdit(store: any) {
    setEditingStore(store.id);
    setExpandedStore(store.id);
    setBillingForm({ billingType: store.billingType, subscriptionPrice: String(store.subscriptionPrice), transactionFeeRate: String(store.transactionFeeRate) });
  }

  function saveEdit(storeId: string) {
    const { billingType, subscriptionPrice, transactionFeeRate } = billingForm;
    if (!billingType) { toast.error('Billing type is required'); return; }
    const payload: Record<string, any> = { billingType };
    if (needsSubscription(billingType)) {
      const price = parseFloat(subscriptionPrice);
      if (isNaN(price) || price <= 0) { toast.error('Enter a valid monthly price'); return; }
      payload.subscriptionPrice = price;
    }
    if (needsTransactionFee(billingType)) {
      const fee = parseFloat(transactionFeeRate);
      if (isNaN(fee) || fee < 0 || fee > 1) { toast.error('Transaction fee must be 0–1'); return; }
      payload.transactionFeeRate = fee;
    }
    updateBilling.mutate({ storeId, data: payload });
  }

  function saveRate() {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 0.5) { toast.error('Rate must be between 0 and 0.5 (50%)'); return; }
    updateRate.mutate(rate);
  }

  return (
    <div style={s.container}>
      <h1 style={s.title}>💳 Billing</h1>

      {/* ── Revenue summary ─────────────────────────────────────────────────── */}
      {revenue && (
        <div style={s.revenueBox}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1D3557' }}>Platform Revenue Summary</h3>
          <div style={s.revenueGrid}>
            <RevenueCard label="Dev Cut Earned" value={fmt$(revenue.totalDevCut ?? 0)} highlight />
            <RevenueCard label="Subscription Revenue" value={fmt$(revenue.totalSubscriptionRevenue ?? 0)} highlight />
            <RevenueCard label="Credits Redeemed" value={fmt$(revenue.totalRedeemedAmount ?? 0)} />
            <RevenueCard label="Purchase Volume" value={fmt$(revenue.totalPurchaseVolume ?? 0)} />
            <RevenueCard label="Approved Transactions" value={revenue.totalTransactions} />
          </div>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div style={s.tabs}>
        <button style={tab === 'stores' ? s.tabActive : s.tab} onClick={() => setTab('stores')}>🏪 Stores</button>
        <button style={tab === 'monthly' ? s.tabActive : s.tab} onClick={() => setTab('monthly')}>🗓️ Monthly Bills</button>
        <button style={tab === 'settings' ? s.tabActive : s.tab} onClick={() => setTab('settings')}>⚙️ Platform Settings</button>
      </div>

      {/* ══════════════════ STORES TAB ══════════════════ */}
      {tab === 'stores' && (
        storesLoading ? <div style={s.loading}>Loading stores…</div> : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Store</th>
                <th style={s.th}>Billing Type</th>
                <th style={s.th}>Monthly Price</th>
                <th style={s.th}>Tx Fee</th>
                <th style={s.th}>30-day Volume</th>
                <th style={s.th}>Avg/Month (90d)</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store: any) => {
                const isEditing = editingStore === store.id;
                const isExpanded = expandedStore === store.id;
                const activeType = isEditing ? billingForm.billingType : store.billingType;
                const rev = store.revenue ?? {
                  last30Days: { transactions: 0, purchaseVolume: 0, pointsAwarded: 0 },
                  last90Days: { transactions: 0, purchaseVolume: 0, avgMonthlyVolume: 0 },
                  allTime: { redemptions: 0, redeemedAmount: 0, devCut: 0 },
                };

                return (
                  <Fragment key={store.id}>
                    <tr style={isExpanded ? s.rowExpanded : undefined}>
                      <td style={s.td}>
                        <button style={s.expandBtn} onClick={() => setExpandedStore(isExpanded ? null : store.id)}>
                          {isExpanded ? '▾' : '▸'} {store.name}
                        </button>
                        <div style={s.cityLabel}>{store.city}</div>
                      </td>
                      <td style={s.td}>
                        {isEditing ? (
                          <select value={billingForm.billingType} onChange={(e) => setBillingForm((f) => ({ ...f, billingType: e.target.value }))} style={s.select}>
                            {BILLING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                          </select>
                        ) : <span style={s.badge}>{store.billingType.replace(/_/g, ' ')}</span>}
                      </td>
                      <td style={s.td}>
                        {isEditing ? (
                          needsSubscription(activeType)
                            ? <input type="number" min="0" step="0.01" placeholder="e.g. 99" value={billingForm.subscriptionPrice} onChange={(e) => setBillingForm((f) => ({ ...f, subscriptionPrice: e.target.value }))} style={s.input} />
                            : <span style={s.na}>—</span>
                        ) : needsSubscription(store.billingType) ? `${fmt$(store.subscriptionPrice)}/mo` : <span style={s.na}>—</span>}
                      </td>
                      <td style={s.td}>
                        {isEditing ? (
                          needsTransactionFee(activeType)
                            ? <input type="number" min="0" max="1" step="0.001" placeholder="e.g. 0.02" value={billingForm.transactionFeeRate} onChange={(e) => setBillingForm((f) => ({ ...f, transactionFeeRate: e.target.value }))} style={s.input} />
                            : <span style={s.na}>—</span>
                        ) : needsTransactionFee(store.billingType) ? fmtPct(store.transactionFeeRate) : <span style={s.na}>—</span>}
                      </td>
                      <td style={s.td}>
                        <span style={s.volValue}>{fmt$(rev.last30Days.purchaseVolume)}</span>
                        <div style={s.volSub}>{rev.last30Days.transactions} txns</div>
                      </td>
                      <td style={s.td}>
                        <span style={s.volValue}>{fmt$(rev.last90Days.avgMonthlyVolume)}</span>
                        <div style={s.volSub}>90-day avg</div>
                      </td>
                      <td style={s.td}>
                        {isEditing ? (
                          <>
                            <button style={s.saveBtn} onClick={() => saveEdit(store.id)} disabled={updateBilling.isPending}>{updateBilling.isPending ? '…' : 'Save'}</button>
                            <button style={s.cancelBtn} onClick={() => setEditingStore(null)}>Cancel</button>
                          </>
                        ) : <button style={s.editBtn} onClick={() => startEdit(store)}>Edit</button>}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${store.id}-exp`}>
                        <td colSpan={7} style={s.expandedCell}>
                          <div style={s.statsRow}>
                            <div style={s.statBox}>
                              <div style={s.statBoxLabel}>Last 30 Days</div>
                              <StatItem label="Purchase Volume" value={fmt$(rev.last30Days.purchaseVolume)} />
                              <StatItem label="Transactions" value={rev.last30Days.transactions} />
                              <StatItem label="Points Awarded" value={fmt$(rev.last30Days.pointsAwarded)} />
                            </div>
                            <div style={s.statBox}>
                              <div style={s.statBoxLabel}>Last 90 Days</div>
                              <StatItem label="Purchase Volume" value={fmt$(rev.last90Days.purchaseVolume)} />
                              <StatItem label="Transactions" value={rev.last90Days.transactions} />
                              <StatItem label="Avg Monthly Volume" value={fmt$(rev.last90Days.avgMonthlyVolume)} highlight />
                            </div>
                            {isEditing && (
                              <div style={{ ...s.statBox, borderColor: '#1D3557', background: '#f0f4ff' }}>
                                <div style={{ ...s.statBoxLabel, color: '#1D3557' }}>💡 Suggested Pricing</div>
                                <p style={s.suggestionLine}><strong>Flat fee:</strong> {fmt$(rev.last90Days.avgMonthlyVolume)} avg → 1% = {fmt$(rev.last90Days.avgMonthlyVolume * 0.01)}/mo</p>
                                <p style={s.suggestionLine}><strong>Per-transaction:</strong> ~{rev.last90Days.transactions / 3 | 0} txns/mo → at $0.30 = {fmt$((rev.last90Days.transactions / 3) * 0.30)}/mo</p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {/* ══════════════════ MONTHLY BILLS TAB ══════════════════ */}
      {tab === 'monthly' && (
        <div>
          {/* ── Toolbar ── */}
          <div style={s.monthlyToolbar}>
            <div style={s.monthlyFilters}>
              <div>
                <label style={s.filterLabel}>Period</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="month" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} style={s.input} />
                  {selectedPeriod && <button style={s.cancelBtn} onClick={() => setSelectedPeriod('')} title="Show all periods">✕ All</button>}
                </div>
              </div>
              <div>
                <label style={s.filterLabel}>Status</label>
                <select value={filterPaid} onChange={(e) => setFilterPaid(e.target.value as any)} style={s.select}>
                  <option value="all">All</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={s.generateBtn} onClick={() => generateBills.mutate()} disabled={generateBills.isPending}>
                {generateBills.isPending ? '⏳ Generating…' : `⚡ Generate ${selectedPeriod || 'Current Month'}`}
              </button>
              <button style={s.backfillBtn} onClick={() => generateAllBills.mutate()} disabled={generateAllBills.isPending}>
                {generateAllBills.isPending ? '⏳ Recalculating All…' : '🔄 Regenerate All'}
              </button>
              <button style={s.exportBtn} onClick={() => consolidatedInvoices.length ? downloadBillsCSV(consolidatedInvoices) : toast.error('No records to export')} disabled={monthlyLoading}>
                ⬇️ Export CSV
              </button>
              <button style={s.sendBtn} onClick={() => sendReport.mutate()} disabled={sendReport.isPending}>
                {sendReport.isPending ? '⏳ Sending…' : '📨 Notify Super Admin'}
              </button>
              <button style={s.clearBtn} onClick={() => { if (confirm('Seed 90 days of random test transactions? This adds data to the DB.')) seedData.mutate(); }} disabled={seedData.isPending}>
                {seedData.isPending ? '⏳ Seeding…' : '🧪 Seed Test Data'}
              </button>
            </div>
          </div>

          <p style={s.monthlyHint}>
            Each bill is one compound record per store — subscription fee + transaction fee + full cashback breakdown. Rates are captured from actual transaction data so changing rates later won't alter historical bills. "Backfill All Missing" generates every month since each store's creation date.
          </p>

          {monthlyLoading ? (
            <div style={s.loading}>Loading records…</div>
          ) : monthlyRecords.length === 0 ? (
            <div style={s.emptyBox}>
              <p style={{ margin: 0, color: '#6c757d' }}>No billing records for this filter.</p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#adb5bd' }}>Click "Generate" or "Backfill All Missing" to create compound bills.</p>
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Invoice Period</th>
                  <th style={s.th}>Stores</th>
                  <th style={s.th}>Transactions</th>
                  <th style={s.th}>Purchase Volume</th>
                  <th style={s.th}>Dev Cut</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedInvoices.map((inv: any) => {
                  const isExp = expandedBill === inv.period;
                  return (
                    <Fragment key={inv.period}>
                      <tr style={isExp ? s.rowExpanded : undefined}>
                        <td style={s.td}>
                          <button style={s.expandBtn} onClick={() => setExpandedBill(isExp ? null : inv.period)}>
                            {isExp ? '▾' : '▸'} {inv.period}
                          </button>
                        </td>
                        <td style={s.td}>{inv.stores.length} stores</td>
                        <td style={s.td}>{inv.totalTxns}</td>
                        <td style={s.td}>{fmt$(inv.totalVolume)}</td>
                        <td style={s.td}>
                          <strong style={{ color: '#E63946', fontSize: 16 }}>{fmt$(inv.totalDevCut)}</strong>
                          {inv.totalCashback > 0 && (
                            <div style={s.cityLabel}>{fmtPct(devCutRate)} of {fmt$(inv.totalCashback)} cashback</div>
                          )}
                        </td>
                        <td style={s.td}>
                          <span style={inv.isPaid ? s.paidBadge : s.unpaidBadge}>{inv.isPaid ? '✓ Paid' : '⏳ Unpaid'}</span>
                          {inv.isPaid && inv.paidAt && <div style={s.cityLabel}>{new Date(inv.paidAt).toLocaleDateString()}</div>}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              style={{ ...s.editBtn, background: '#457B9D', fontSize: 12 }}
                              onClick={() => setCombinedInvoiceView(inv)}
                            >📄 Invoice</button>
                            {!inv.isPaid && (
                              <button style={{ ...s.saveBtn, marginRight: 0 }} onClick={() => markPeriodPaid.mutate(inv.period)} disabled={markPeriodPaid.isPending}>
                                Mark Paid
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded: per-store breakdown ── */}
                      {isExp && (
                        <tr>
                          <td colSpan={7} style={s.expandedCell}>
                            <div style={{ padding: '16px 20px' }}>
                              <div style={s.billSectionTitle}>Per-Store Breakdown — {inv.period}</div>
                              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 8 }}>
                                <thead>
                                  <tr>
                                    {['Store', 'Txns', 'Purchase Volume', 'Cashback Issued', 'Dev Cut', ''].map((h) => (
                                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#6c757d', fontWeight: 700, borderBottom: '1px solid #e9ecef' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {inv.stores
                                    .sort((a: any, b: any) => b.amount - a.amount)
                                    .map((r: any) => {
                                      const n: BillNotes | null = r.notes;
                                      return (
                                        <tr key={r.id}>
                                          <td style={s.catTd}>
                                            <strong>{r.store?.name}</strong>
                                            <div style={s.cityLabel}>{r.store?.city}</div>
                                          </td>
                                          <td style={s.catTd}>{n?.txCount ?? 0}</td>
                                          <td style={s.catTd}>{n ? fmt$(n.purchaseVolume) : '—'}</td>
                                          <td style={s.catTd}>{n ? <>{fmt$(n.cashbackIssued)}<div style={s.cityLabel}>{fmtPct(n.effectiveCashbackRate)} of volume</div></> : '—'}</td>
                                          <td style={{ ...s.catTd, color: '#2DC653', fontWeight: 700 }}>{fmt$(r.amount)}</td>
                                          <td style={s.catTd}>
                                            <button
                                              style={{ padding: '4px 10px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
                                              onClick={() => setInvoiceView({ record: r, period: inv.period })}
                                            >📄 Invoice</button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td style={{ ...s.catTd, fontWeight: 800 }}>Total</td>
                                    <td style={{ ...s.catTd, fontWeight: 800 }}>{inv.totalTxns}</td>
                                    <td style={{ ...s.catTd, fontWeight: 800 }}>{fmt$(inv.totalVolume)}</td>
                                    <td style={s.catTd}></td>
                                    <td style={{ ...s.catTd, color: '#E63946', fontWeight: 800, fontSize: 14 }}>{fmt$(inv.totalDevCut)}</td>
                                    <td style={s.catTd}></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Totals footer */}
          {consolidatedInvoices.length > 0 && (
            <div style={s.monthlyTotals}>
              <span>
                <strong>{consolidatedInvoices.length}</strong> invoices ·{' '}
                Total Dev Cut: <strong>{fmt$((consolidatedInvoices as any[]).reduce((s, i) => s + i.totalDevCut, 0))}</strong> ·{' '}
                Collected: <strong style={{ color: '#2DC653' }}>{fmt$((consolidatedInvoices as any[]).filter((i) => i.isPaid).reduce((s, i) => s + i.totalDevCut, 0))}</strong> ·{' '}
                Outstanding: <strong style={{ color: '#E63946' }}>{fmt$((consolidatedInvoices as any[]).filter((i) => !i.isPaid).reduce((s, i) => s + i.totalDevCut, 0))}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Invoice Modal ── */}
      {invoiceView && (
        <InvoiceModal
          record={invoiceView.record}
          period={invoiceView.period}
          onClose={() => setInvoiceView(null)}
        />
      )}
      {combinedInvoiceView && (
        <CombinedInvoiceModal
          inv={combinedInvoiceView}
          onClose={() => setCombinedInvoiceView(null)}
        />
      )}

      {/* ══════════════════ SETTINGS TAB ══════════════════ */}
      {tab === 'settings' && (
        <div style={s.settingsGrid}>

          {/* Tier Cashback Rates card */}
          <div style={{ ...s.settingsCard, gridColumn: '1 / -1' }}>
            <h3 style={s.settingsCardTitle}>🏆 Tier Cashback Rates</h3>
            <p style={s.settingsCardDesc}>
              Base cashback rate per customer tier. Promotions add on top of these rates.
              For GAS/DIESEL, you can optionally set a flat <strong>¢ per gallon</strong> rate instead of a percentage.
              Leave blank to use the percentage rate for gas too.
            </p>
            {tierRatesLoading ? <div style={s.loading}>Loading…</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    <th style={s.th}>Tier</th>
                    <th style={s.th}>Cashback %</th>
                    <th style={s.th}>Gas ¢/gallon <span style={{ fontWeight: 400, color: '#6c757d', fontSize: 11 }}>(optional — overrides % for gas)</span></th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {tierRates.map((r) => {
                    const edit = tierEdits[r.tier];
                    const isEditing = !!edit;
                    return (
                      <tr key={r.tier} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={s.td}><strong>{TIER_EMOJI[r.tier]} {r.tier[0] + r.tier.slice(1).toLowerCase()}</strong></td>
                        <td style={s.td}>
                          {isEditing ? (
                            <input type="number" min="0" max="1" step="0.01" value={edit.cashbackRate}
                              onChange={(e) => setTierEdits(p => ({ ...p, [r.tier]: { ...p[r.tier], cashbackRate: e.target.value } }))}
                              style={{ ...s.input, width: 80 }} placeholder="e.g. 0.03" />
                          ) : (
                            <span style={{ fontWeight: 600, color: '#2DC653' }}>{fmtPct(r.cashbackRate)}</span>
                          )}
                        </td>
                        <td style={s.td}>
                          {isEditing ? (
                            <input type="number" min="0" step="0.5" value={edit.gasCentsPerGallon}
                              onChange={(e) => setTierEdits(p => ({ ...p, [r.tier]: { ...p[r.tier], gasCentsPerGallon: e.target.value } }))}
                              style={{ ...s.input, width: 80 }} placeholder="e.g. 3" />
                          ) : (
                            r.gasCentsPerGallon != null
                              ? <span style={{ fontWeight: 600, color: '#F4A261' }}>{r.gasCentsPerGallon}¢/gal</span>
                              : <span style={{ color: '#adb5bd', fontStyle: 'italic' }}>use %</span>
                          )}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          {isEditing ? (
                            <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button style={s.saveBtn} disabled={updateTierRate.isPending} onClick={() => {
                                const cr = parseFloat(edit.cashbackRate);
                                const cpg = edit.gasCentsPerGallon === '' ? null : parseFloat(edit.gasCentsPerGallon);
                                if (isNaN(cr) || cr < 0 || cr > 1) { toast.error('Rate must be 0–1 (e.g. 0.03 for 3%)'); return; }
                                if (cpg !== null && isNaN(cpg)) { toast.error('Enter a valid ¢/gallon or leave blank'); return; }
                                updateTierRate.mutate({ tier: r.tier, data: { cashbackRate: cr, gasCentsPerGallon: cpg } });
                              }}>{updateTierRate.isPending ? '…' : 'Save'}</button>
                              <button style={s.cancelBtn} onClick={() => setTierEdits(p => { const n = { ...p }; delete n[r.tier]; return n; })}>Cancel</button>
                            </span>
                          ) : (
                            <button style={s.editBtn} onClick={() => setTierEdits(p => ({
                              ...p, [r.tier]: { cashbackRate: String(r.cashbackRate), gasCentsPerGallon: r.gasCentsPerGallon != null ? String(r.gasCentsPerGallon) : '' }
                            }))}>Edit</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Dev Cut Rate card */}
          <div style={s.settingsCard}>
            <h3 style={s.settingsCardTitle}>💰 Dev Cut Rate (Global Default)</h3>
            <p style={s.settingsCardDesc}>
              Your cut billed to each store — a % of <strong>total purchase amount</strong> per transaction.
              Each store can have its own rate (set in the Stores tab). This is the fallback default.
            </p>

            <div style={s.rateExampleBox}>
              <div style={s.rateExampleTitle}>How it works on a $20 purchase (Bronze tier, 1% cashback)</div>
              <div style={s.rateExampleRow}>
                <span>Customer (Bronze tier, 1%) gets</span>
                <span style={{ color: '#2DC653' }}>= <strong>$0.20</strong> cashback credits</span>
              </div>
              <div style={s.rateExampleRow}>
                <span>Your dev cut ({fmtPct(rateLoading ? 0.02 : devCutRate)} × $0.20 cashback)</span>
                <span style={{ color: '#E63946' }}>= <strong>{fmt$(0.20 * (rateLoading ? 0.02 : devCutRate))}</strong></span>
              </div>
              <div style={{ ...s.rateExampleRow, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #dee2e6' }}>
                <span style={{ color: '#6c757d', fontSize: 12 }}>Store pays you monthly: sum of dev cut per transaction</span>
                <span style={{ color: '#6c757d', fontSize: 12 }}>Cashback is store's loyalty cost (redeemed as free products)</span>
              </div>
            </div>

            {rateLoading ? (
              <div style={s.loading}>Loading…</div>
            ) : editingRate ? (
              <div style={s.rateEditRow}>
                <input
                  type="number"
                  min="0"
                  max="0.5"
                  step="0.001"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  style={{ ...s.input, width: 120 }}
                  placeholder="e.g. 0.04"
                  autoFocus
                />
                <span style={{ color: '#6c757d', fontSize: 13 }}>= {rateInput ? fmtPct(parseFloat(rateInput) || 0) : '—'}</span>
                <button style={s.saveBtn} onClick={saveRate} disabled={updateRate.isPending}>{updateRate.isPending ? '…' : 'Save'}</button>
                <button style={s.cancelBtn} onClick={() => setEditingRate(false)}>Cancel</button>
              </div>
            ) : (
              <div style={s.rateDisplayRow}>
                <div>
                  <div style={s.rateValue}>{fmtPct(devCutRate)}</div>
                  <div style={s.rateSub}>current dev cut rate</div>
                </div>
                <button
                  style={s.editBtn}
                  onClick={() => { setEditingRate(true); setRateInput(String(devCutRate)); }}
                >
                  Change Rate
                </button>
              </div>
            )}
          </div>

          {/* Info card */}
          <div style={s.settingsCard}>
            <h3 style={s.settingsCardTitle}>ℹ️ Billing Model</h3>
            <p style={s.settingsCardDesc}>How revenue flows in Lucky Stop:</p>
            <div style={s.infoList}>
              <InfoItem icon="🏪" text="Stores pay a fixed monthly subscription fee (set per store on the Stores tab)." />
              <InfoItem icon="💵" text="When an employee grants points, the store 'owes' the cashback amount to the customer." />
              <InfoItem icon="💰" text={`Dev cut (${fmtPct(devCutRate)} of the cashback issued) is tracked per transaction and billed to the store monthly. Customer always receives their full tier-rate cashback. You earn a slice of the cashback pool — not the full purchase amount.`} />
              <InfoItem icon="🎁" text="When a customer redeems credits in-store, no additional cut is taken — the cut was already collected at grant time." />
              <InfoItem icon="📅" text="Use the Monthly Bills tab to generate and track subscription invoices for each store." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RevenueCard({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div style={s.revCard}>
      <div style={s.revLabel}>{label}</div>
      <div style={{ ...s.revValue, color: highlight ? '#2DC653' : '#1D3557' }}>{value}</div>
    </div>
  );
}

function StatItem({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: highlight ? '#2DC653' : '#1D3557' }}>{value}</div>
    </div>
  );
}

function InfoItem({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 14, color: '#495057', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function CombinedInvoiceModal({ inv, onClose }: { inv: any; onClose: () => void }) {
  const invNum = `INV-${inv.period.replace('-', '')}-ALL`;
  const stores: any[] = [...inv.stores].sort((a: any, b: any) => (a.store?.name ?? '').localeCompare(b.store?.name ?? ''));

  // Aggregate totals from BillNotes
  const totalSubscription = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.subscriptionFee ?? 0), 0);
  const totalDevCut = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.devCutEarned ?? r.amount), 0);
  const totalCashback = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.customerCashback ?? 0), 0);
  const grandTotal = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.totalAmountOwed ?? r.amount), 0);

  const issueDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const [year, month] = inv.period.split('-');
  const periodStart = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodEnd = new Date(Number(year), Number(month), 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  function handlePrint() {
    const el = document.getElementById('combined-invoice-print-area');
    if (!el) return;
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invNum}</title><style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif}
      body{padding:48px;color:#1a1a1a;background:#fff;font-size:13px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #1D3557;margin-bottom:26px}
      .brand{font-size:22px;font-weight:900;color:#1D3557}.brand-sub{font-size:11px;color:#6c757d;margin-top:4px}
      h1{font-size:30px;font-weight:900;color:#1D3557;letter-spacing:2px}.inv-num{font-size:12px;color:#6c757d;font-family:monospace;margin-top:4px}
      .meta-row{display:flex;gap:20px;margin-bottom:26px}
      .meta-box{flex:1;background:#f8f9fa;border-radius:8px;padding:14px 16px}
      .meta-label{font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
      .meta-value{font-size:15px;font-weight:800;color:#1D3557}.meta-sub{font-size:11px;color:#6c757d;margin-top:2px}
      .meta-detail{display:flex;justify-content:space-between;font-size:12px;color:#495057;padding:2px 0}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      thead tr{background:#1D3557;color:#fff}
      th{text-align:left;padding:9px 12px;font-size:11px;font-weight:700}
      th.text-right,td.text-right{text-align:right}
      td{padding:9px 12px;font-size:12px;border-bottom:1px solid #eee;color:#1D3557;vertical-align:top}
      tr.store-alt{background:#fafafa}
      tr.subtotal td{background:#f0f4f8;font-weight:700;font-size:13px}
      tr.grand-total td{background:#1D3557;color:#fff;font-weight:800;font-size:14px}
      .store-name{font-weight:700}.store-city{font-size:11px;color:#6c757d}
      .paid-tag{background:#d1fae5;color:#065f46;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:700;display:inline-block}
      .unpaid-tag{background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:700;display:inline-block}
      .summary-box{background:#f8f9fa;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:flex;gap:16px;flex-wrap:wrap}
      .summary-item{flex:1 1 120px;text-align:center;padding:10px;background:#fff;border-radius:6px;border:1px solid #e9ecef}
      .summary-label{font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:4px}
      .summary-value{font-size:16px;font-weight:800;color:#1D3557}
      .paid-banner{background:#d1fae5;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:16px}
      .unpaid-banner{background:#fef3c7;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:16px}
      .footer{margin-top:28px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#6c757d;text-align:center}
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  return (
    <div style={inv2.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={inv2.paper}>
        {/* Screen header */}
        <div style={inv2.header}>
          <div>
            <div style={inv2.headerBrand}>⛽ Lucky Stop</div>
            <div style={inv2.headerSub}>Gas Station Loyalty Platform</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={inv2.invTitle}>INVOICE</div>
            <div style={inv2.invNum}>{invNum}</div>
          </div>
        </div>

        {/* Printable area */}
        <div id="combined-invoice-print-area">
          <div className="header" style={{ display: 'none' }}>
            <div><div className="brand">⛽ Lucky Stop</div><div className="brand-sub">Gas Station Loyalty Platform</div></div>
            <div style={{ textAlign: 'right' }}><h1>INVOICE</h1><div className="inv-num">{invNum}</div></div>
          </div>

          {/* Meta */}
          <div style={inv2.metaRow}>
            <div style={inv2.metaBox}>
              <div style={inv2.metaLabel}>Bill To</div>
              <div style={inv2.metaValue}>Lucky Stop — All Stores</div>
              <div style={inv2.metaSub}>{stores.length} locations — consolidated invoice</div>
            </div>
            <div style={inv2.metaBox}>
              <div style={inv2.metaLabel}>Invoice Details</div>
              <div style={inv2.metaDetail}><span>Invoice #</span><strong style={{ fontFamily: 'monospace' }}>{invNum}</strong></div>
              <div style={inv2.metaDetail}><span>Issue Date</span><span>{issueDate}</span></div>
              <div style={inv2.metaDetail}><span>Billing Period</span><span>{periodStart} – {periodEnd}</span></div>
              <div style={inv2.metaDetail}><span>Stores Covered</span><span>{stores.length}</span></div>
              <div style={inv2.metaDetail}>
                <span>Status</span>
                <span style={inv.isPaid ? inv2.paidTag : inv2.unpaidTag}>
                  {inv.isPaid ? '✓ ALL PAID' : '⏳ OUTSTANDING'}
                </span>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div style={inv2.summaryRow}>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Total Transactions</div><div style={inv2.summaryValue}>{inv.totalTxns}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Purchase Volume</div><div style={inv2.summaryValue}>{fmt$(inv.totalVolume)}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Subscription Fees</div><div style={inv2.summaryValue}>{fmt$(totalSubscription)}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Dev Cut</div><div style={{ ...inv2.summaryValue, color: '#E63946' }}>{fmt$(totalDevCut)}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Cashback Covered</div><div style={{ ...inv2.summaryValue, color: '#F4A261' }}>{fmt$(totalCashback)}</div></div>
          </div>

          {/* Per-store line items */}
          <table style={inv2.table}>
            <thead>
              <tr>
                <th style={inv2.tableTh}>Store</th>
                <th style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Txns</th>
                <th style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Volume</th>
                <th style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Subscription</th>
                <th style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Dev Cut</th>
                <th style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Cashback</th>
                <th style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Total Owed</th>
                <th style={{ ...inv2.tableTh, textAlign: 'center' as const }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((r: any, i: number) => {
                const n: BillNotes | null = r.notes;
                return (
                  <tr key={r.id} style={i % 2 === 1 ? { background: '#fafafa' } : undefined}>
                    <td style={inv2.tableTd}>
                      <div style={{ fontWeight: 700 }}>{r.store?.name ?? '—'}</div>
                      {r.store?.city && <div style={{ fontSize: 11, color: '#6c757d', marginTop: 1 }}>{r.store.city}</div>}
                    </td>
                    <td style={{ ...inv2.tableTd, textAlign: 'right' }}>{n?.txCount ?? 0}</td>
                    <td style={{ ...inv2.tableTd, textAlign: 'right' }}>{n ? fmt$(n.purchaseVolume) : '—'}</td>
                    <td style={{ ...inv2.tableTd, textAlign: 'right' }}>{n?.subscriptionFee ? fmt$(n.subscriptionFee) : <span style={{ color: '#adb5bd' }}>—</span>}</td>
                    <td style={{ ...inv2.tableTd, textAlign: 'right', color: '#E63946', fontWeight: 600 }}>{fmt$(n?.devCutEarned ?? r.amount)}</td>
                    <td style={{ ...inv2.tableTd, textAlign: 'right', color: '#F4A261' }}>{n ? fmt$(n.customerCashback) : '—'}</td>
                    <td style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 700 }}>{fmt$(n?.totalAmountOwed ?? r.amount)}</td>
                    <td style={{ ...inv2.tableTd, textAlign: 'center' }}>
                      <span style={r.isPaid ? inv2.paidTag : inv2.unpaidTag}>{r.isPaid ? '✓' : '⏳'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f0f4f8' }}>
                <td style={{ ...inv2.tableTd, fontWeight: 800 }}>Subtotal ({stores.length} stores)</td>
                <td style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{inv.totalTxns}</td>
                <td style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{fmt$(inv.totalVolume)}</td>
                <td style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{fmt$(totalSubscription)}</td>
                <td style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800, color: '#E63946' }}>{fmt$(totalDevCut)}</td>
                <td style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800, color: '#F4A261' }}>{fmt$(totalCashback)}</td>
                <td style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{fmt$(grandTotal)}</td>
                <td style={inv2.tableTd}></td>
              </tr>
              <tr style={{ background: '#1D3557' }}>
                <td colSpan={6} style={{ ...inv2.tableTd, color: '#fff', fontWeight: 800, fontSize: 15, textAlign: 'right' }}>
                  Grand Total — All Stores
                </td>
                <td style={{ ...inv2.tableTd, color: '#fff', fontWeight: 900, fontSize: 16 }}>{fmt$(grandTotal)}</td>
                <td style={inv2.tableTd}></td>
              </tr>
            </tfoot>
          </table>

          {/* Payment status banner */}
          {inv.isPaid ? (
            <div style={{ background: '#d1fae5', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>✓</span>
              <div>
                <div style={{ fontWeight: 800, color: '#065f46', fontSize: 15 }}>All Stores — Payment Confirmed</div>
                {inv.paidAt && <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>Paid on {new Date(inv.paidAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>}
              </div>
            </div>
          ) : (
            <div style={{ background: '#fef3c7', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>⏳</span>
              <div>
                <div style={{ fontWeight: 800, color: '#92400e', fontSize: 15 }}>Payment Outstanding</div>
                <div style={{ fontSize: 13, color: '#b45309', marginTop: 2 }}>
                  {stores.filter((r: any) => !r.isPaid).length} of {stores.length} stores unpaid — use "Mark Paid" to confirm receipt
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: '#6c757d', textAlign: 'center', padding: '14px 0 4px', borderTop: '1px solid #e9ecef' }}>
            Lucky Stop Loyalty Platform · Invoice {invNum} · Generated {issueDate} · For questions contact your account manager
          </div>
        </div>

        {/* Actions */}
        <div style={inv2.actions}>
          <button style={inv2.printBtn} onClick={handlePrint}>🖨️ Print / Save PDF</button>
          <button style={inv2.closeBtn} onClick={onClose}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ record, period, onClose }: { record: any; period: string; onClose: () => void }) {
  const n: BillNotes | null = record.notes;
  const store = record.store;
  const invNum = `INV-${period.replace('-', '')}-${record.id.slice(-6).toUpperCase()}`;

  const periodLabel = n?.periodStart && n?.periodEnd
    ? `${new Date(n.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(n.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : period;

  const issueDate = n?.periodEnd
    ? new Date(n.periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  function handlePrint() {
    const el = document.getElementById('invoice-print-area');
    if (!el) return;
    const win = window.open('', '_blank', 'width=820,height=1000');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invNum}</title><style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif}
      body{padding:48px;color:#1a1a1a;background:#fff;font-size:14px}
      h1{font-size:28px;font-weight:900;color:#1D3557;letter-spacing:2px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #1D3557;margin-bottom:28px}
      .brand{font-size:20px;font-weight:900;color:#1D3557}.brand-sub{font-size:12px;color:#6c757d;margin-top:4px}
      .inv-num{font-size:12px;color:#6c757d;font-family:monospace;margin-top:4px}
      .meta-row{display:flex;gap:24px;margin-bottom:28px}
      .meta-box{flex:1;background:#f8f9fa;border-radius:8px;padding:16px}
      .meta-label{font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
      .meta-value{font-size:16px;font-weight:700;color:#1D3557}.meta-sub{font-size:12px;color:#6c757d;margin-top:3px}
      .meta-row-detail{display:flex;justify-content:space-between;font-size:13px;color:#495057;padding:3px 0}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead tr{background:#1D3557;color:#fff}
      th{text-align:left;padding:10px 14px;font-size:12px;font-weight:700}
      td{padding:10px 14px;font-size:13px;border-bottom:1px solid #eee;color:#1D3557}
      .text-right{text-align:right}.text-muted{color:#6c757d;font-size:11px;margin-top:2px}
      .subtotal td{background:#f8f9fa;font-weight:800}
      .total-row td{background:#1D3557;color:#fff;font-weight:800;font-size:15px}
      .notes-box{background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px}
      .notes-title{font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px}
      .note-row{display:flex;justify-content:space-between;font-size:13px;color:#495057;padding:4px 0;border-bottom:1px solid #e9ecef}
      .paid-tag{background:#d1fae5;color:#065f46;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700}
      .unpaid-tag{background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700}
      .footer{margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#6c757d;text-align:center}
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  return (
    <div style={inv.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={inv.paper}>
        {/* Header */}
        <div style={inv.header}>
          <div>
            <div style={inv.headerBrand}>⛽ Lucky Stop</div>
            <div style={inv.headerSub}>Gas Station Loyalty Platform</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={inv.invTitle}>INVOICE</div>
            <div style={inv.invNum}>{invNum}</div>
          </div>
        </div>

        {/* Printable area */}
        <div id="invoice-print-area">
          <div className="header" style={{ display: 'none' }}>
            <div><div className="brand">⛽ Lucky Stop</div><div className="brand-sub">Gas Station Loyalty Platform</div></div>
            <div style={{ textAlign: 'right' }}><h1>INVOICE</h1><div className="inv-num">{invNum}</div></div>
          </div>

          {/* Bill To / Invoice Details */}
          <div style={inv.metaRow}>
            <div style={inv.metaBox}>
              <div style={inv.metaLabel}>Bill To</div>
              <div style={inv.metaValue}>{store?.name || 'Store'}</div>
              {store?.city && <div style={inv.metaSub}>{store.city}</div>}
              {store?.address && <div style={inv.metaSub}>{store.address}</div>}
            </div>
            <div style={inv.metaBox}>
              <div style={inv.metaLabel}>Invoice Details</div>
              <div style={inv.metaDetail}><span>Invoice #</span><strong style={{ fontFamily: 'monospace' }}>{invNum}</strong></div>
              <div style={inv.metaDetail}><span>Issue Date</span><span>{issueDate}</span></div>
              <div style={inv.metaDetail}><span>Billing Period</span><span>{periodLabel}</span></div>
              <div style={inv.metaDetail}>
                <span>Status</span>
                <span style={record.isPaid ? inv.paidTag : inv.unpaidTag}>
                  {record.isPaid ? '✓ PAID' : '⏳ UNPAID'}
                </span>
              </div>
              {record.isPaid && record.paidAt && (
                <div style={inv.metaDetail}><span>Payment Date</span><span>{new Date(record.paidAt).toLocaleDateString()}</span></div>
              )}
            </div>
          </div>

          {/* Line items */}
          <table style={inv.table}>
            <thead>
              <tr>
                <th style={inv.tableTh}>Description</th>
                <th style={{ ...inv.tableTh, textAlign: 'right' }}>Transactions</th>
                <th style={{ ...inv.tableTh, textAlign: 'right' }}>Purchase Volume</th>
                <th style={{ ...inv.tableTh, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {n?.subscriptionFee != null && n.subscriptionFee > 0 && (
                <tr>
                  <td style={inv.tableTd}>Monthly Subscription Fee</td>
                  <td style={{ ...inv.tableTd, textAlign: 'right', color: '#6c757d' }}>—</td>
                  <td style={{ ...inv.tableTd, textAlign: 'right', color: '#6c757d' }}>—</td>
                  <td style={{ ...inv.tableTd, textAlign: 'right', fontWeight: 700 }}>{fmt$(n.subscriptionFee)}</td>
                </tr>
              )}
              {n && n.categories.length > 0
                ? n.categories.map((cat) => (
                    <tr key={cat.category}>
                      <td style={inv.tableTd}>
                        <div style={{ fontWeight: 600 }}>Transaction Fee — {cat.category}</div>
                        <div style={{ fontSize: 11, color: '#6c757d', marginTop: 2 }}>
                          Dev cut ({fmtPct(n.effectiveDevCutRate)}) + customer cashback ({fmtPct(n.effectiveCashbackRate)})
                        </div>
                      </td>
                      <td style={{ ...inv.tableTd, textAlign: 'right' }}>{cat.txCount}</td>
                      <td style={{ ...inv.tableTd, textAlign: 'right' }}>{fmt$(cat.purchaseVolume)}</td>
                      <td style={{ ...inv.tableTd, textAlign: 'right', fontWeight: 600 }}>{fmt$(cat.devCutEarned + cat.cashbackIssued)}</td>
                    </tr>
                  ))
                : n && (
                    <tr>
                      <td style={inv.tableTd}>
                        <div style={{ fontWeight: 600 }}>Transaction Processing Fee</div>
                        <div style={{ fontSize: 11, color: '#6c757d', marginTop: 2 }}>
                          Dev cut ({fmtPct(n.effectiveDevCutRate)}) + customer cashback ({fmtPct(n.effectiveCashbackRate)}) × {n.txCount} transactions
                        </div>
                      </td>
                      <td style={{ ...inv.tableTd, textAlign: 'right' }}>{n.txCount}</td>
                      <td style={{ ...inv.tableTd, textAlign: 'right' }}>{fmt$(n.purchaseVolume)}</td>
                      <td style={{ ...inv.tableTd, textAlign: 'right', fontWeight: 600 }}>{fmt$(n.transactionFee + n.cashbackFee)}</td>
                    </tr>
                  )
              }
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa' }}>
                <td colSpan={3} style={{ ...inv.tableTd, fontWeight: 800, textAlign: 'right' }}>Subtotal</td>
                <td style={{ ...inv.tableTd, fontWeight: 800 }}>{n ? fmt$(n.totalAmountOwed) : fmt$(record.amount)}</td>
              </tr>
              <tr style={{ background: '#1D3557' }}>
                <td colSpan={3} style={{ ...inv.tableTd, fontWeight: 800, color: '#fff', textAlign: 'right', fontSize: 15 }}>Total Amount Owed</td>
                <td style={{ ...inv.tableTd, fontWeight: 800, color: '#fff', fontSize: 15 }}>{n ? fmt$(n.totalAmountOwed) : fmt$(record.amount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Summary box */}
          {n && (
            <div style={inv.notesBox}>
              <div style={inv.notesTitle}>Bill Breakdown</div>
              <div style={inv.noteRow}><span>Purchase Volume</span><strong>{fmt$(n.purchaseVolume)}</strong></div>
              <div style={inv.noteRow}><span>Total Transactions Processed</span><strong>{n.txCount}</strong></div>
              {n.subscriptionFee > 0 && <div style={inv.noteRow}><span>Subscription Fee</span><strong>{fmt$(n.subscriptionFee)}</strong></div>}
              <div style={inv.noteRow}><span>Dev Cut ({fmtPct(n.effectiveDevCutRate)} of volume)</span><strong style={{ color: '#E63946' }}>{fmt$(n.devCutEarned)}</strong></div>
              <div style={inv.noteRow}><span>Customer Cashback Covered ({fmtPct(n.effectiveCashbackRate)} of volume)</span><strong style={{ color: '#F4A261' }}>{fmt$(n.customerCashback)}</strong></div>
              <div style={{ ...inv.noteRow, fontWeight: 800, fontSize: 14, borderBottom: 'none', paddingTop: 8 }}>
                <span>Total Amount Owed</span><strong style={{ color: '#1D3557' }}>{fmt$(n.totalAmountOwed)}</strong>
              </div>
            </div>
          )}

          {/* Payment confirmation */}
          {record.isPaid && (
            <div style={{ background: '#d1fae5', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>✓</span>
              <div>
                <div style={{ fontWeight: 800, color: '#065f46', fontSize: 15 }}>Payment Confirmed</div>
                {record.paidAt && <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>
                  Paid on {new Date(record.paidAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: '#6c757d', textAlign: 'center', padding: '16px 0 4px', borderTop: '1px solid #e9ecef' }}>
            Lucky Stop Loyalty Platform · Invoice generated {new Date().toLocaleDateString()} · For questions contact your account manager
          </div>
        </div>

        {/* Action buttons */}
        <div style={inv.actions}>
          <button style={inv.printBtn} onClick={handlePrint}>🖨️ Print / Save PDF</button>
          <button style={inv.closeBtn} onClick={onClose}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1300, margin: '0 auto' },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: '0 0 20px' },
  loading: { padding: 32, textAlign: 'center', color: '#6c757d' },

  // Revenue summary
  revenueBox: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  revenueGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 },
  revCard: { padding: '12px 0' },
  revLabel: { color: '#6c757d', fontSize: 12, margin: 0, fontWeight: 600 },
  revValue: { fontSize: 22, fontWeight: 800, margin: '4px 0 0' },

  // Tabs
  tabs: { display: 'flex', gap: 6, marginBottom: 20 },
  tab: { padding: '9px 18px', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#6c757d' },
  tabActive: { padding: '9px 18px', background: '#1D3557', border: '1px solid #1D3557', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff' },

  // Table
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  th: { background: '#f8f9fa', padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6c757d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f1f2', fontSize: 14, verticalAlign: 'middle' },
  rowExpanded: { background: '#f8faff' },
  expandedCell: { padding: 0, background: '#f8faff', borderBottom: '2px solid #e9ecef' },
  statsRow: { display: 'flex', gap: 12, padding: '16px 20px', flexWrap: 'wrap' },
  statBox: { flex: '1 1 180px', background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e9ecef' },
  statBoxLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  expandBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#1D3557', padding: 0 },
  cityLabel: { fontSize: 12, color: '#adb5bd', marginTop: 2 },
  badge: { background: '#E63946', color: '#fff', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  paidBadge: { background: '#2DC653', color: '#fff', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 },
  unpaidBadge: { background: '#fff3cd', color: '#856404', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 },
  na: { color: '#adb5bd', fontSize: 13 },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6', fontSize: 14 },
  select: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6', fontSize: 13 },
  volValue: { fontWeight: 700, color: '#1D3557' },
  volSub: { fontSize: 11, color: '#adb5bd', marginTop: 2 },
  editBtn: { padding: '6px 14px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  saveBtn: { padding: '6px 14px', background: '#2DC653', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginRight: 6, fontSize: 13 },
  cancelBtn: { padding: '6px 14px', background: '#dee2e6', color: '#212529', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  suggestionLine: { margin: '0 0 8px', fontSize: 13, color: '#495057', lineHeight: 1.5 },

  // Monthly bills
  monthlyToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 12 },
  monthlyFilters: { display: 'flex', gap: 16, alignItems: 'flex-end' },
  filterLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#6c757d', marginBottom: 4 },
  generateBtn: { padding: '10px 20px', background: '#E63946', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  backfillBtn: { padding: '10px 20px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  exportBtn: { padding: '10px 20px', background: '#2DC653', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  sendBtn: { padding: '10px 20px', background: '#F4A261', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  clearBtn: { padding: '10px 20px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  monthlyHint: { fontSize: 13, color: '#6c757d', margin: '0 0 16px', padding: '10px 14px', background: '#f8f9fa', borderRadius: 8 },
  emptyBox: { background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', border: '1px dashed #dee2e6' },
  monthlyTotals: { background: '#fff', borderRadius: 8, padding: '12px 16px', marginTop: 12, fontSize: 14, color: '#495057' },

  // Compound bill detail
  billDetail: { display: 'flex', flexWrap: 'wrap', gap: 16, padding: '16px 20px' },
  billSection: { flex: '1 1 260px', background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e9ecef' },
  billSectionTitle: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 },
  feeGrid: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  feeRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#495057', padding: '4px 0' },
  catTd: { padding: '5px 8px', borderBottom: '1px solid #f0f1f2', fontSize: 13, color: '#495057' },

  // Settings
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 20 },
  settingsCard: { background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  settingsCardTitle: { fontSize: 18, fontWeight: 800, color: '#1D3557', margin: '0 0 8px' },
  settingsCardDesc: { fontSize: 14, color: '#6c757d', margin: '0 0 20px', lineHeight: 1.6 },

  rateExampleBox: { background: '#f8f9fa', borderRadius: 10, padding: '14px 16px', marginBottom: 20 },
  rateExampleTitle: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  rateExampleRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#495057', marginBottom: 6 },

  rateDisplayRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rateValue: { fontSize: 36, fontWeight: 800, color: '#1D3557' },
  rateSub: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  rateEditRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

  infoList: { marginTop: 8 },
};

// ─── Invoice styles ───────────────────────────────────────────────────────────

const inv: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 300, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '32px 20px', overflowY: 'auto',
  },
  paper: {
    background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780,
    boxShadow: '0 24px 64px rgba(0,0,0,0.28)', padding: '40px',
    position: 'relative', flexShrink: 0,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #1D3557',
  },
  headerBrand: { fontSize: 22, fontWeight: 900, color: '#1D3557' },
  headerSub: { fontSize: 12, color: '#6c757d', marginTop: 4 },
  invTitle: { fontSize: 32, fontWeight: 900, color: '#1D3557', letterSpacing: 2 },
  invNum: { fontSize: 13, color: '#6c757d', marginTop: 4, fontFamily: 'monospace' },

  metaRow: { display: 'flex', gap: 20, marginBottom: 28 },
  metaBox: { flex: 1, background: '#f8f9fa', borderRadius: 10, padding: '16px 20px' },
  metaLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  metaValue: { fontSize: 17, fontWeight: 800, color: '#1D3557' },
  metaSub: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  metaDetail: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#495057', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' },
  paidTag: { background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  unpaidTag: { background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 },

  table: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 24, borderRadius: 10, overflow: 'hidden' },
  tableTh: { background: '#1D3557', color: '#fff', padding: '10px 14px', fontSize: 12, fontWeight: 700, textAlign: 'left' as const },
  tableTd: { padding: '10px 14px', fontSize: 13, borderBottom: '1px solid #f0f1f2', color: '#1D3557', verticalAlign: 'top' as const },

  notesBox: { background: '#f8f9fa', borderRadius: 10, padding: '16px 20px', marginBottom: 20 },
  notesTitle: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  noteRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#495057', padding: '5px 0', borderBottom: '1px solid #e9ecef' },

  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, marginTop: 8, borderTop: '1px solid #e9ecef' },
  printBtn: { padding: '10px 22px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  closeBtn: { padding: '10px 22px', background: '#e9ecef', color: '#495057', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
};

// ─── Combined invoice styles ──────────────────────────────────────────────────

const inv2: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 300, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '32px 20px', overflowY: 'auto',
  },
  paper: {
    background: '#fff', borderRadius: 16, width: '100%', maxWidth: 960,
    boxShadow: '0 24px 64px rgba(0,0,0,0.28)', padding: '40px',
    position: 'relative', flexShrink: 0,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #1D3557',
  },
  headerBrand: { fontSize: 22, fontWeight: 900, color: '#1D3557' },
  headerSub: { fontSize: 12, color: '#6c757d', marginTop: 4 },
  invTitle: { fontSize: 32, fontWeight: 900, color: '#1D3557', letterSpacing: 2 },
  invNum: { fontSize: 13, color: '#6c757d', marginTop: 4, fontFamily: 'monospace' },

  metaRow: { display: 'flex', gap: 20, marginBottom: 24 },
  metaBox: { flex: 1, background: '#f8f9fa', borderRadius: 10, padding: '16px 20px' },
  metaLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  metaValue: { fontSize: 17, fontWeight: 800, color: '#1D3557' },
  metaSub: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  metaDetail: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#495057', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' },
  paidTag: { background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  unpaidTag: { background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 },

  summaryRow: { display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' as const },
  summaryCard: { flex: '1 1 120px', background: '#f8f9fa', borderRadius: 10, padding: '12px 14px', textAlign: 'center' as const, border: '1px solid #e9ecef' },
  summaryLabel: { fontSize: 10, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: 800, color: '#1D3557' },

  table: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 20, borderRadius: 10, overflow: 'hidden' },
  tableTh: { background: '#1D3557', color: '#fff', padding: '10px 12px', fontSize: 11, fontWeight: 700, textAlign: 'left' as const },
  tableTd: { padding: '9px 12px', fontSize: 13, borderBottom: '1px solid #f0f1f2', color: '#1D3557', verticalAlign: 'middle' as const },

  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, marginTop: 8, borderTop: '1px solid #e9ecef' },
  printBtn: { padding: '10px 22px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  closeBtn: { padding: '10px 22px', background: '#e9ecef', color: '#495057', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
};
