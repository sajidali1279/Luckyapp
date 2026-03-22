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

function needsSubscription(type: string) { return type === 'MONTHLY_SUBSCRIPTION' || type === 'HYBRID'; }
function needsTransactionFee(type: string) { return type === 'PER_TRANSACTION' || type === 'HYBRID'; }
function fmt$(n: number) { return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

function downloadBillsCSV(records: any[]) {
  const headers = ['Store', 'City', 'Period', 'Billing Type', 'Txns', 'Purchase Volume', 'Cashback Issued', 'Dev Cut', 'Sub Fee', 'Platform Fee', 'Cashback Fee', 'Total Owed', 'Status', 'Paid At'];
  const rows = records.map((r: any) => {
    const n: BillNotes | null = r.notes;
    return [
      r.store?.name ?? '', r.store?.city ?? '', r.period, r.billingType,
      n?.txCount ?? 0, n?.purchaseVolume ?? 0, n?.cashbackIssued ?? 0, n?.devCutEarned ?? 0,
      n?.subscriptionFee ?? 0, n?.transactionFee ?? 0, n?.cashbackFee ?? 0,
      r.amount, r.isPaid ? 'PAID' : 'UNPAID', r.paidAt ? new Date(r.paidAt).toLocaleDateString() : '',
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `luckystop-bills-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
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

  const [expandedBill, setExpandedBill] = useState<string | null>(null);

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

  const markPaid = useMutation({
    mutationFn: (recordId: string) => billingApi.markPaid(recordId),
    onSuccess: () => { toast.success('Marked as paid'); qc.invalidateQueries({ queryKey: ['monthly-records'] }); qc.invalidateQueries({ queryKey: ['revenue'] }); },
    onError: () => toast.error('Failed to mark paid'),
  });

  const stores = data?.data?.data || [];
  const revenue = revenueData?.data?.data;
  const devCutRate = devCutData?.data?.data?.rate ?? 0.04;
  const monthlyRecords: any[] = monthlyData?.data?.data?.records || [];

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
            <RevenueCard label={`Dev Cut Rate (${fmtPct(revenue.devCutRate ?? devCutRate)})`} value={`${fmtPct(revenue.devCutRate ?? devCutRate)} of cashback`} />
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
              <button style={s.exportBtn} onClick={() => monthlyRecords.length ? downloadBillsCSV(monthlyRecords) : toast.error('No records to export')} disabled={monthlyLoading}>
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
                  <th style={s.th}>Store</th>
                  <th style={s.th}>Period</th>
                  <th style={s.th}>Billing Type</th>
                  <th style={s.th}>Txns</th>
                  <th style={s.th}>Purchase Volume</th>
                  <th style={s.th}>Cashback Issued</th>
                  <th style={s.th}>Dev Cut Earned</th>
                  <th style={s.th}>Total Owed</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRecords.map((r: any) => {
                  const n: BillNotes | null = r.notes;
                  const isExp = expandedBill === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr style={isExp ? s.rowExpanded : undefined}>
                        <td style={s.td}>
                          <button style={s.expandBtn} onClick={() => setExpandedBill(isExp ? null : r.id)}>
                            {isExp ? '▾' : '▸'} {r.store?.name}
                          </button>
                          <div style={s.cityLabel}>{r.store?.city}</div>
                        </td>
                        <td style={s.td}>{r.period}</td>
                        <td style={s.td}><span style={s.badge}>{r.billingType.replace(/_/g, ' ')}</span></td>
                        <td style={s.td}>{n?.txCount ?? '—'}</td>
                        <td style={s.td}>{n ? fmt$(n.purchaseVolume) : '—'}</td>
                        <td style={s.td}>
                          {n ? <><div>{fmt$(n.cashbackIssued)}</div><div style={s.cityLabel}>{fmtPct(n.effectiveCashbackRate)} rate</div></> : '—'}
                        </td>
                        <td style={s.td}>
                          {n ? <><div style={{ color: '#2DC653', fontWeight: 700 }}>{fmt$(n.devCutEarned)}</div><div style={s.cityLabel}>{fmtPct(n.effectiveDevCutRate)} of cashback</div></> : '—'}
                        </td>
                        <td style={s.td}><strong style={{ color: '#E63946' }}>{fmt$(r.amount)}</strong></td>
                        <td style={s.td}>
                          <span style={r.isPaid ? s.paidBadge : s.unpaidBadge}>{r.isPaid ? '✓ Paid' : '⏳ Unpaid'}</span>
                          {r.paidAt && <div style={s.cityLabel}>{new Date(r.paidAt).toLocaleDateString()}</div>}
                        </td>
                        <td style={s.td}>
                          {!r.isPaid && <button style={s.saveBtn} onClick={() => markPaid.mutate(r.id)} disabled={markPaid.isPending}>Mark Paid</button>}
                        </td>
                      </tr>

                      {/* ── Expanded compound bill detail ── */}
                      {isExp && n && (
                        <tr>
                          <td colSpan={10} style={s.expandedCell}>
                            <div style={s.billDetail}>

                              {/* Fee split summary */}
                              <div style={s.billSection}>
                                <div style={s.billSectionTitle}>Fee Breakdown</div>
                                <div style={s.feeGrid}>
                                  {n.subscriptionFee > 0 && (
                                    <div style={s.feeRow}>
                                      <span>Monthly Subscription</span>
                                      <span style={{ fontWeight: 700 }}>{fmt$(n.subscriptionFee)}</span>
                                    </div>
                                  )}
                                  {n.transactionFee > 0 && (
                                    <div style={s.feeRow}>
                                      <span>Platform Fee ({fmtPct(n.transactionFeeRate)} × {fmt$(n.purchaseVolume)})</span>
                                      <span style={{ fontWeight: 700 }}>{fmt$(n.transactionFee)}</span>
                                    </div>
                                  )}
                                  {(n.cashbackFee ?? n.cashbackIssued) > 0 && (
                                    <div style={s.feeRow}>
                                      <span>Cashback Funded ({fmtPct(n.effectiveCashbackRate)} of {fmt$(n.purchaseVolume)})</span>
                                      <span style={{ fontWeight: 700 }}>{fmt$(n.cashbackFee ?? n.cashbackIssued)}</span>
                                    </div>
                                  )}
                                  <div style={{ ...s.feeRow, borderTop: '2px solid #dee2e6', marginTop: 4, paddingTop: 8, fontWeight: 800, color: '#E63946' }}>
                                    <span>Total Owed to Platform</span>
                                    <span>{fmt$(n.totalAmountOwed)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Cashback split */}
                              <div style={s.billSection}>
                                <div style={s.billSectionTitle}>Cashback Split ({n.txCount} transactions)</div>
                                <div style={s.feeGrid}>
                                  <div style={s.feeRow}>
                                    <span>Total Purchase Volume</span>
                                    <span>{fmt$(n.purchaseVolume)}</span>
                                  </div>
                                  <div style={s.feeRow}>
                                    <span>Cashback Issued ({fmtPct(n.effectiveCashbackRate)} of volume)</span>
                                    <span>{fmt$(n.cashbackIssued)}</span>
                                  </div>
                                  <div style={s.feeRow}>
                                    <span style={{ color: '#2DC653' }}>→ Dev Cut ({fmtPct(n.effectiveDevCutRate)} of cashback)</span>
                                    <span style={{ color: '#2DC653', fontWeight: 700 }}>{fmt$(n.devCutEarned)}</span>
                                  </div>
                                  <div style={s.feeRow}>
                                    <span>→ Customer Cashback (net credited)</span>
                                    <span>{fmt$(n.customerCashback)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Category breakdown */}
                              {n.categories.length > 0 && (
                                <div style={{ ...s.billSection, flex: '2 1 400px' }}>
                                  <div style={s.billSectionTitle}>By Category</div>
                                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr>
                                        {['Category', 'Txns', 'Volume', 'Cashback', 'Dev Cut', 'Customer'].map((h) => (
                                          <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 11, color: '#6c757d', fontWeight: 700, borderBottom: '1px solid #e9ecef' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {n.categories.map((c) => (
                                        <tr key={c.category}>
                                          <td style={s.catTd}>{c.category.replace(/_/g, ' ')}</td>
                                          <td style={s.catTd}>{c.txCount}</td>
                                          <td style={s.catTd}>{fmt$(c.purchaseVolume)}</td>
                                          <td style={s.catTd}>{fmt$(c.cashbackIssued)}</td>
                                          <td style={{ ...s.catTd, color: '#2DC653', fontWeight: 600 }}>{fmt$(c.devCutEarned)}</td>
                                          <td style={s.catTd}>{fmt$(c.customerCashback)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                            <div style={{ padding: '6px 20px 12px', fontSize: 12, color: '#adb5bd' }}>
                              Period: {n.periodStart} → {n.periodEnd} · Rates captured from actual transaction data
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

          {/* Monthly totals */}
          {monthlyRecords.length > 0 && (
            <div style={s.monthlyTotals}>
              <span>
                <strong>{monthlyRecords.length}</strong> bills ·{' '}
                Total: <strong>{fmt$(monthlyRecords.reduce((acc: number, r: any) => acc + r.amount, 0))}</strong> ·{' '}
                Collected: <strong style={{ color: '#2DC653' }}>{fmt$(monthlyRecords.filter((r: any) => r.isPaid).reduce((acc: number, r: any) => acc + r.amount, 0))}</strong> ·{' '}
                Outstanding: <strong style={{ color: '#E63946' }}>{fmt$(monthlyRecords.filter((r: any) => !r.isPaid).reduce((acc: number, r: any) => acc + r.amount, 0))}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ SETTINGS TAB ══════════════════ */}
      {tab === 'settings' && (
        <div style={s.settingsGrid}>

          {/* Dev Cut Rate card */}
          <div style={s.settingsCard}>
            <h3 style={s.settingsCardTitle}>💰 Dev Cut Rate</h3>
            <p style={s.settingsCardDesc}>
              Percentage taken from every cashback issued at grant time.
              Customer receives the remainder — the store is <strong>not charged extra</strong>.
            </p>

            <div style={s.rateExampleBox}>
              <div style={s.rateExampleTitle}>How it works</div>
              <div style={s.rateExampleRow}>
                <span>$20 purchase × 5% cashback</span>
                <span>= <strong>$1.00</strong> cashback issued</span>
              </div>
              <div style={s.rateExampleRow}>
                <span>Customer receives ({fmtPct(1 - (rateLoading ? 0.04 : devCutRate))} of $1.00)</span>
                <span style={{ color: '#2DC653' }}>= <strong>{fmt$(1 * (1 - (rateLoading ? 0.04 : devCutRate)))}</strong></span>
              </div>
              <div style={s.rateExampleRow}>
                <span>Dev cut ({fmtPct(rateLoading ? 0.04 : devCutRate)} of $1.00)</span>
                <span style={{ color: '#E63946' }}>= <strong>{fmt$(1 * (rateLoading ? 0.04 : devCutRate))}</strong></span>
              </div>
              <div style={s.rateExampleRow}>
                <span>Store pays (same as before)</span>
                <span>= <strong>$1.00</strong></span>
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
              <InfoItem icon="💰" text={`Dev cut (${fmtPct(devCutRate)}) is silently taken from the cashback pool — customer balance is credited the net amount.`} />
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
