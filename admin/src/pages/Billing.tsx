import { Fragment, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { billingApi, type PaymentBody } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeToday, storeDayLong } from '../lib/storeDates';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import InvoiceModal from '../components/InvoiceModal';
import CombinedInvoiceModal from '../components/CombinedInvoiceModal';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { Link } from 'react-router-dom';
import { BillNotes, fmt$, fmtPct } from '../utils/billingFormat';

type Tab = 'stores' | 'monthly' | 'manual' | 'settings';

const BILLING_TYPES = ['MONTHLY_SUBSCRIPTION', 'PER_TRANSACTION', 'HYBRID'] as const;

function needsSubscription(type: string) { return type === 'MONTHLY_SUBSCRIPTION' || type === 'HYBRID'; }

// The most a store's fee can be set to (MAX_STORE_FEE_RATE on the server), so a slip cannot bill 100% of a store's cashback
const MAX_FEE_PERCENT = 25;
const PAY_METHODS: [string, string][] = [['CHECK', 'Check'], ['BANK_TRANSFER', 'Bank transfer'], ['CASH', 'Cash'], ['CARD', 'Card'], ['OTHER', 'Other']];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAY_METHODS);
const PLAN_LABEL: Record<string, string> = { MONTHLY_SUBSCRIPTION: 'Monthly subscription', PER_TRANSACTION: 'Per transaction', HYBRID: 'Hybrid' };
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  // Default straight to the Monthly Bills tab, pre-filtered to Unpaid — the
  // same thing the sidebar's own Billing badge is counting, so opening this
  // page from that badge doesn't land on an unrelated tab/filter.
  const [tab, setTab] = useState<Tab>('monthly');
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [confirmDeleteChargeId, setConfirmDeleteChargeId] = useState<string | null>(null);
  // Payments: the box that records how and when a bill was paid, and the way back from a mistake
  const [payTarget, setPayTarget] = useState<{ title: string; period: string; records: any[]; single: boolean } | null>(null);
  const [payForm, setPayForm] = useState({ paidOn: '', method: 'CHECK', note: '' });
  const [undoTarget, setUndoTarget] = useState<any | null>(null);
  const [recalcTarget, setRecalcTarget] = useState<{ record: any; current: number; recalculated: number; difference: number } | null>(null);
  const [confirmFill, setConfirmFill] = useState(false);
  const [confirmNotify, setConfirmNotify] = useState(false);
  const [feeConfirm, setFeeConfirm] = useState<{ store: any; payload: Record<string, any>; lines: string[] } | null>(null);
  // A fast double click on a confirm button must send once: the box only locks after the next render, this lock is instant
  const actionLock = useRef(false);
  const once = (fn: () => void) => { if (actionLock.current) return; actionLock.current = true; fn(); };

  // ── Store billing state ──────────────────────────────────────────────────────
  const [editingStore, setEditingStore] = useState<string | null>(null);
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState({ billingType: '', subscriptionPrice: '', feePercent: '' });

  // ── Monthly billing state ────────────────────────────────────────────────────
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'unpaid'>('unpaid');

  const { data: billingPendingData } = useQuery({
    queryKey: ['billing-pending-count'],
    queryFn: () => billingApi.getPendingCount(),
  });
  const billingPendingCount: number = billingPendingData?.data?.data?.count ?? 0;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data, isLoading: storesLoading, isError: storesError, refetch: refetchStores } = useQuery({
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

  const { data: monthlyData, isLoading: monthlyLoading, isError: monthlyError, refetch: refetchMonthly } = useQuery({
    queryKey: ['monthly-records', selectedPeriod, filterPaid],
    queryFn: () => billingApi.getMonthlyRecords(
      selectedPeriod || undefined,
      undefined,
      filterPaid === 'all' ? undefined : filterPaid === 'paid',
    ),
    enabled: tab === 'monthly',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const refreshBilling = () => {
    qc.invalidateQueries({ queryKey: ['monthly-records'] });
    qc.invalidateQueries({ queryKey: ['extra-charges'] });
    qc.invalidateQueries({ queryKey: ['revenue'] });
    qc.invalidateQueries({ queryKey: ['billing-pending-count'] });
  };

  const updateBilling = useMutation({
    mutationFn: ({ storeId, data }: { storeId: string; data: object }) =>
      billingApi.updateStoreBilling(storeId, data),
    onSuccess: () => { toast.success('Billing updated'); setEditingStore(null); qc.invalidateQueries({ queryKey: ['billing-stores'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Failed to update billing')),
    onSettled: () => { actionLock.current = false; setFeeConfirm(null); },
  });

  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [invoiceView, setInvoiceView] = useState<{ record: any; period: string } | null>(null);
  const [combinedInvoiceView, setCombinedInvoiceView] = useState<any | null>(null);

  const generateBills = useMutation({
    mutationFn: () => billingApi.generateMonthlyBilling(selectedPeriod || undefined),
    onSuccess: (res) => { toast.success(res.data?.message || 'Done'); refreshBilling(); },
    onError: (e) => toast.error(serverMessage(e, 'Failed to generate bills')),
    onSettled: () => { actionLock.current = false; },
  });

  // Only makes bills that do not exist yet; never changes or deletes a bill or a charge
  const fillMissing = useMutation({
    mutationFn: () => billingApi.generateAllMissingBills(),
    onSuccess: (res) => { toast.success(res.data?.message || 'Done'); refreshBilling(); },
    onError: (e) => toast.error(serverMessage(e, 'Failed to fill in the missing bills')),
    onSettled: () => { actionLock.current = false; setConfirmFill(false); },
  });

  const seedData = useMutation({
    mutationFn: () => billingApi.seedTestData(),
    onSuccess: (res) => { toast.success(res.data?.message || 'Test data seeded!'); qc.invalidateQueries({ queryKey: ['billing-stores'] }); qc.invalidateQueries({ queryKey: ['revenue'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Failed to seed test data')),
  });

  const sendReport = useMutation({
    mutationFn: () => billingApi.sendReport(selectedPeriod || undefined),
    onSuccess: (res) => toast.success(res.data?.message || 'Report sent'),
    onError: (e) => toast.error(serverMessage(e, 'Failed to send report')),
    onSettled: () => { actionLock.current = false; setConfirmNotify(false); },
  });

  // One mutation for "this bill" and "this whole month". What the person saw is sent along; if it changed, nothing is marked.
  const payMutation = useMutation({
    mutationFn: (v: { kind: 'one' | 'period'; id?: string; period?: string; body: PaymentBody }) =>
      v.kind === 'one' ? billingApi.markPaid(v.id!, v.body) : billingApi.markPeriodPaid(v.period!, v.body),
    onSuccess: (res, v) => {
      const d = res.data?.data;
      toast.success(v.kind === 'period' ? `${d?.updated ?? 0} marked paid, ${fmt$(d?.total ?? 0)}` : 'Marked paid');
      refreshBilling();
    },
    onError: (e) => { toast.error(serverMessage(e, 'Could not mark it paid')); refreshBilling(); },
    onSettled: () => { actionLock.current = false; setPayTarget(null); },
  });

  const undoMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => billingApi.unmarkPaid(id, reason),
    onSuccess: () => { toast.success('Payment undone. The bill is unpaid again.'); refreshBilling(); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not undo the payment')); refreshBilling(); },
    onSettled: () => { actionLock.current = false; setUndoTarget(null); },
  });

  // Recalculate one UNPAID usage bill: first ask what it would become, then confirm
  const previewRecalc = useMutation({
    mutationFn: (record: any) => billingApi.recalculateRecord(record.id, true).then((res) => ({ record, ...res.data.data })),
    onSuccess: (r: any) => { if (Math.abs(r.difference) < 0.005) toast.success('Already up to date: this bill matches its month\'s sales.'); else setRecalcTarget(r); },
    onError: (e) => toast.error(serverMessage(e, 'Could not check the bill')),
  });
  const recalcMutation = useMutation({
    mutationFn: (id: string) => billingApi.recalculateRecord(id, false),
    onSuccess: (res) => { const d = res.data.data; toast.success(`Recalculated: ${fmt$(d.current)} to ${fmt$(d.recalculated)}`); refreshBilling(); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not recalculate the bill')); refreshBilling(); },
    onSettled: () => { actionLock.current = false; setRecalcTarget(null); },
  });

  function openPay(title: string, period: string, records: any[], single: boolean) {
    setPayForm({ paidOn: storeToday(), method: 'CHECK', note: '' });
    setPayTarget({ title, period, records, single });
  }
  function confirmPay() {
    if (!payTarget) return;
    const body: PaymentBody = { paidOn: payForm.paidOn || undefined, method: payForm.method, note: payForm.note.trim() || undefined };
    if (payTarget.single) once(() => payMutation.mutate({ kind: 'one', id: payTarget.records[0].id, body: { ...body, expectedAmount: payTarget.records[0].amount } }));
    else once(() => payMutation.mutate({ kind: 'period', period: payTarget.period, body: { ...body, expectedTotal: round2(payTarget.records.reduce((sum: number, r: any) => sum + r.amount, 0)) } }));
  }

  // ── Manual charge state ───────────────────────────────────────────────────────
  const [manualForm, setManualForm] = useState({ storeId: '', amount: '', description: '', period: storeToday().slice(0, 7) });
  const [manualDone, setManualDone] = useState<any>(null);
  // Extra charges list filters
  const [ecStoreFilter, setEcStoreFilter] = useState('');
  const [ecPeriodFilter, setEcPeriodFilter] = useState('');
  const [ecPaidFilter, setEcPaidFilter] = useState<'' | 'paid' | 'unpaid'>('');
  // Inline edit state: recordId → { description, amount }
  const [editingCharge, setEditingCharge] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount: '' });

  const { data: extraChargesData, isLoading: ecLoading, refetch: refetchCharges } = useQuery({
    queryKey: ['extra-charges', ecStoreFilter, ecPeriodFilter, ecPaidFilter],
    queryFn: () => billingApi.getExtraCharges(
      ecStoreFilter || undefined,
      ecPeriodFilter || undefined,
      ecPaidFilter ? ecPaidFilter === 'paid' : undefined,
    ),
    enabled: tab === 'manual',
  });
  const extraCharges: any[] = extraChargesData?.data?.data ?? [];

  const addManualCharge = useMutation({
    mutationFn: () => billingApi.createRecord(manualForm.storeId, {
      amount: parseFloat(manualForm.amount),
      billingType: 'CUSTOM',
      period: manualForm.period,
      description: manualForm.description.trim(),
    }),
    onSuccess: (res) => {
      toast.success('Extra charge added');
      setManualDone(res.data?.data);
      setManualForm(f => ({ ...f, storeId: '', amount: '', description: '' }));
      qc.invalidateQueries({ queryKey: ['monthly-records'] });
      qc.invalidateQueries({ queryKey: ['extra-charges'] });
      qc.invalidateQueries({ queryKey: ['revenue'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to add charge'),
  });

  const updateCharge = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { description?: string; amount?: number } }) =>
      billingApi.updateRecord(id, data),
    onSuccess: () => {
      toast.success('Charge updated');
      setEditingCharge(null);
      qc.invalidateQueries({ queryKey: ['extra-charges'] });
      qc.invalidateQueries({ queryKey: ['monthly-records'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update'),
  });

  const deleteCharge = useMutation({
    mutationFn: (id: string) => billingApi.deleteRecord(id),
    onSuccess: () => {
      toast.success('Charge deleted');
      qc.invalidateQueries({ queryKey: ['extra-charges'] });
      qc.invalidateQueries({ queryKey: ['monthly-records'] });
      qc.invalidateQueries({ queryKey: ['revenue'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to delete'),
  });

  const stores = data?.data?.data || [];
  const revenue = revenueData?.data?.data;
  const devCutRate = devCutData?.data?.data?.rate ?? 0.02;
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
    setBillingForm({ billingType: store.billingType, subscriptionPrice: String(store.subscriptionPrice), feePercent: String(parseFloat((store.transactionFeeRate * 100).toFixed(2))) });
  }

  // Checks the form, then shows exactly what will change before anything is saved
  function saveEdit(store: any) {
    const { billingType, subscriptionPrice, feePercent } = billingForm;
    if (!billingType) { toast.error('Billing type is required'); return; }
    const payload: Record<string, any> = { billingType };
    if (needsSubscription(billingType)) {
      const price = parseFloat(subscriptionPrice);
      if (isNaN(price) || price <= 0) { toast.error('Enter a valid monthly price'); return; }
      payload.subscriptionPrice = price;
    }
    const pct = parseFloat(feePercent);
    if (isNaN(pct) || pct < 0) { toast.error('Enter the fee as a percent of the cashback, like 10'); return; }
    if (pct > MAX_FEE_PERCENT) { toast.error(`The fee can be at most ${MAX_FEE_PERCENT}% of the cashback.`); return; }
    payload.transactionFeeRate = parseFloat((pct / 100).toFixed(4));
    const lines: string[] = [];
    if (billingType !== store.billingType) lines.push(`Plan: ${PLAN_LABEL[store.billingType] ?? store.billingType} to ${PLAN_LABEL[billingType] ?? billingType}`);
    if (payload.subscriptionPrice !== undefined && Math.abs(payload.subscriptionPrice - store.subscriptionPrice) > 0.004) lines.push(`Monthly price: ${fmt$(store.subscriptionPrice)} to ${fmt$(payload.subscriptionPrice)}`);
    if (Math.abs(payload.transactionFeeRate - store.transactionFeeRate) > 1e-9) lines.push(`Fee: ${fmtPct(store.transactionFeeRate)} to ${fmtPct(payload.transactionFeeRate)} of the cashback`);
    if (lines.length === 0) { setEditingStore(null); toast('Nothing changed'); return; }
    setFeeConfirm({ store, payload, lines });
  }

  return (
    <div style={s.container}>
      {import.meta.env.DEV && (
        <ConfirmModal
          open={showSeedConfirm}
          title="Seed Test Data"
          message="This will add 90 days of random test transactions to the live database. Only use this in a development environment. This cannot be undone."
          confirmLabel="Seed Data"
          danger
          onConfirm={() => { seedData.mutate(); setShowSeedConfirm(false); }}
          onCancel={() => setShowSeedConfirm(false)}
        />
      )}
      <ConfirmModal
        open={!!confirmDeleteChargeId}
        title="Delete Charge"
        message="This charge will be permanently removed."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteChargeId) deleteCharge.mutate(confirmDeleteChargeId); setConfirmDeleteChargeId(null); }}
        onCancel={() => setConfirmDeleteChargeId(null)}
      />
      <ConfirmModal
        open={!!payTarget}
        title={payTarget?.single ? 'Record this payment' : `Record payment for ${payTarget?.period ?? ''}`}
        message={payTarget && (
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, color: '#111827', marginBottom: 6 }}>{payTarget.title}</div>
            {payTarget.records.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                <span>{r.store?.name ?? 'All stores (chain-wide)'}{r.billingType === 'CUSTOM' ? ` (${r.notes?.description || 'extra charge'})` : ''}</span>
                <strong>{fmt$(r.amount)}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 800, borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6 }}>
              <span>Total</span><span>{fmt$(round2(payTarget.records.reduce((sum: number, r: any) => sum + r.amount, 0)))}</span>
            </div>
            <label style={{ ...s.fieldLabel, display: 'block', marginTop: 12 }} htmlFor="pay-date">Payment date</label>
            <input id="pay-date" type="date" style={s.input} max={storeToday()} value={payForm.paidOn} onChange={(e) => setPayForm((f) => ({ ...f, paidOn: e.target.value }))} />
            <label style={{ ...s.fieldLabel, display: 'block', marginTop: 8 }} htmlFor="pay-method">How was it paid?</label>
            <select id="pay-method" style={s.input} value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
              {PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label style={{ ...s.fieldLabel, display: 'block', marginTop: 8 }} htmlFor="pay-note">Note (optional)</label>
            <input id="pay-note" type="text" maxLength={200} style={s.input} placeholder="e.g. check number" value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} />
            <div style={{ marginTop: 10, fontSize: 13, color: TEXT_MUTED }}>Each bill can be undone later, one at a time, with a reason. Who marked it and when is kept in the Activity Log.</div>
          </div>
        )}
        confirmLabel={payMutation.isPending ? 'Saving…' : `Mark ${fmt$(round2((payTarget?.records ?? []).reduce((sum: number, r: any) => sum + r.amount, 0)))} paid`}
        busy={payMutation.isPending}
        onConfirm={confirmPay}
        onCancel={() => setPayTarget(null)}
      />
      <ConfirmModal
        open={!!undoTarget}
        title="Undo this payment?"
        message={undoTarget && (
          <span>{undoTarget.store?.name ?? 'This charge'}: {fmt$(undoTarget.amount)} for {undoTarget.period} goes back to unpaid. The old payment stays in its history.</span>
        )}
        withInput inputRequired
        inputLabel="Why is this being undone?"
        inputPlaceholder="e.g. the check bounced"
        confirmLabel="Undo payment"
        danger
        busy={undoMutation.isPending}
        onConfirm={(reason) => { if (undoTarget) once(() => undoMutation.mutate({ id: undoTarget.id, reason: (reason ?? '').trim() })); }}
        onCancel={() => setUndoTarget(null)}
      />
      <ConfirmModal
        open={!!recalcTarget}
        title="Recalculate this bill?"
        message={recalcTarget && (
          <span>
            {recalcTarget.record.store?.name}, {recalcTarget.record.period}: it reads {fmt$(recalcTarget.current)} now. Rebuilt from that month's approved sales, on the plan it was made with,
            it would be <strong>{fmt$(recalcTarget.recalculated)}</strong> ({recalcTarget.difference > 0 ? '+' : ''}{fmt$(recalcTarget.difference)}). Only this unpaid bill changes.
          </span>
        )}
        confirmLabel="Recalculate"
        busy={recalcMutation.isPending}
        onConfirm={() => { if (recalcTarget) once(() => recalcMutation.mutate(recalcTarget.record.id)); }}
        onCancel={() => setRecalcTarget(null)}
      />
      <ConfirmModal
        open={confirmFill}
        title="Fill in missing bills?"
        message="Makes any bill that does not exist yet, for every finished month since each store was created. It never changes or deletes a bill or a charge that already exists, and a month that is still running is left for after it ends."
        confirmLabel="Fill in missing bills"
        busy={fillMissing.isPending}
        onConfirm={() => once(() => fillMissing.mutate())}
        onCancel={() => setConfirmFill(false)}
      />
      <ConfirmModal
        open={confirmNotify}
        title="Notify every Super Admin?"
        message={`Sends the ${selectedPeriod || 'last month'} billing report now: every Super Admin gets a push notification and, if they have an email, the invoices for their stores.`}
        confirmLabel="Send now"
        busy={sendReport.isPending}
        onConfirm={() => once(() => sendReport.mutate())}
        onCancel={() => setConfirmNotify(false)}
      />
      <ConfirmModal
        open={!!feeConfirm}
        title={`Change billing for ${feeConfirm?.store?.name ?? ''}?`}
        message={feeConfirm && (
          <div style={{ textAlign: 'left' }}>
            {feeConfirm.lines.map((l) => <div key={l} style={{ fontWeight: 700 }}>{l}</div>)}
            <div style={{ marginTop: 8 }}>This applies to sales from now on. Each sale keeps the fee it was granted at, and a bill that is already made keeps its amount.</div>
          </div>
        )}
        confirmLabel="Save change"
        busy={updateBilling.isPending}
        onConfirm={() => { if (feeConfirm) once(() => updateBilling.mutate({ storeId: feeConfirm.store.id, data: feeConfirm.payload })); }}
        onCancel={() => setFeeConfirm(null)}
      />
      <h1 style={s.title}>💳 Billing</h1>

      {/* ── Revenue summary ─────────────────────────────────────────────────── */}
      {revenue && (
        <div style={s.revenueBox}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: PRIMARY }}>Platform Revenue Summary</h3>
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
        <button style={tab === 'monthly' ? s.tabActive : s.tab} onClick={() => setTab('monthly')}>
          🗓️ Monthly Bills
          {billingPendingCount > 0 && <span style={s.tabBadge}>{billingPendingCount}</span>}
        </button>
        <button style={tab === 'manual' ? s.tabActive : s.tab} onClick={() => setTab('manual')}>🧾 Manual Charges</button>
        <button style={tab === 'settings' ? s.tabActive : s.tab} onClick={() => setTab('settings')}>⚙️ Platform Settings</button>
      </div>

      {/* ══════════════════ STORES TAB ══════════════════ */}
      {tab === 'stores' && (
        storesError ? <ErrorState onRetry={refetchStores} /> :
        storesLoading ? <TableSkeleton columns={7} /> : (
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                <TableHead style={s.th}>Store</TableHead>
                <TableHead style={s.th}>Billing Type</TableHead>
                <TableHead style={s.th}>Monthly Price</TableHead>
                <TableHead style={s.th}>Fee (of cashback)</TableHead>
                <TableHead style={s.th}>30-day Volume</TableHead>
                <TableHead style={s.th}>Avg/Month (90d)</TableHead>
                <TableHead style={s.th}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    <TableRow style={isExpanded ? s.rowExpanded : undefined}>
                      <TableCell style={s.td}>
                        <button style={s.expandBtn} onClick={() => setExpandedStore(isExpanded ? null : store.id)}>
                          {isExpanded ? '▾' : '▸'} {store.name}
                        </button>
                        <div style={s.cityLabel}>{store.city}</div>
                      </TableCell>
                      <TableCell style={s.td}>
                        {isEditing ? (
                          <select value={billingForm.billingType} onChange={(e) => setBillingForm((f) => ({ ...f, billingType: e.target.value }))} style={s.select}>
                            {BILLING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                          </select>
                        ) : <span style={s.badge}>{store.billingType.replace(/_/g, ' ')}</span>}
                      </TableCell>
                      <TableCell style={s.td}>
                        {isEditing ? (
                          needsSubscription(activeType)
                            ? <input type="number" min="0" step="0.01" placeholder="e.g. 99" value={billingForm.subscriptionPrice} onChange={(e) => setBillingForm((f) => ({ ...f, subscriptionPrice: e.target.value }))} style={s.input} />
                            : <span style={s.na}> - </span>
                        ) : needsSubscription(store.billingType) ? `${fmt$(store.subscriptionPrice)}/mo` : <span style={s.na}> - </span>}
                      </TableCell>
                      <TableCell style={s.td}>
                        {isEditing ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="number" min="0" max={MAX_FEE_PERCENT} step="0.1" placeholder="e.g. 10" aria-label="Fee, percent of the cashback" value={billingForm.feePercent} onChange={(e) => setBillingForm((f) => ({ ...f, feePercent: e.target.value }))} style={{ ...s.input, width: 80 }} />
                            <span style={s.na}>%</span>
                          </span>
                        ) : fmtPct(store.transactionFeeRate)}
                      </TableCell>
                      <TableCell style={s.td}>
                        <span style={s.volValue}>{fmt$(rev.last30Days.purchaseVolume)}</span>
                        <div style={s.volSub}>{rev.last30Days.transactions} txns</div>
                      </TableCell>
                      <TableCell style={s.td}>
                        <span style={s.volValue}>{fmt$(rev.last90Days.avgMonthlyVolume)}</span>
                        <div style={s.volSub}>90-day avg</div>
                      </TableCell>
                      <TableCell style={s.td}>
                        {isEditing ? (
                          <>
                            <button style={s.saveBtn} onClick={() => saveEdit(store)} disabled={updateBilling.isPending}>{updateBilling.isPending ? '…' : 'Save'}</button>
                            <button style={s.cancelBtn} onClick={() => setEditingStore(null)}>Cancel</button>
                          </>
                        ) : <button style={s.editBtn} onClick={() => startEdit(store)}>Edit</button>}
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow key={`${store.id}-exp`}>
                        <TableCell colSpan={7} style={s.expandedCell}>
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
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
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
              <button style={s.generateBtn} onClick={() => once(() => generateBills.mutate())} disabled={generateBills.isPending || (!!selectedPeriod && selectedPeriod >= storeToday().slice(0, 7))}
                title="Makes the bills that do not exist yet for a finished month (default: last month). It never changes an existing bill.">
                {generateBills.isPending ? '⏳ Generating…' : `⚡ Generate ${selectedPeriod || 'last month'}`}
              </button>
              <button style={s.backfillBtn} onClick={() => setConfirmFill(true)} disabled={fillMissing.isPending}
                title="Makes every missing bill for every finished month. It never changes or deletes an existing bill or charge.">
                {fillMissing.isPending ? '⏳ Filling in…' : '🧩 Fill in missing bills'}
              </button>
              <button style={s.exportBtn} onClick={() => consolidatedInvoices.length ? downloadBillsCSV(consolidatedInvoices) : toast.error('No records to export')} disabled={monthlyLoading}>
                ⬇️ Export CSV
              </button>
              <button style={s.sendBtn} onClick={() => setConfirmNotify(true)} disabled={sendReport.isPending}>
                {sendReport.isPending ? '⏳ Sending…' : '📨 Notify Super Admin'}
              </button>
              {/* Development builds only. On the live site this one click filled the real database with fake sales
                  and gave every real customer fake cashback. */}
              {import.meta.env.DEV && (
                <button style={s.clearBtn} onClick={() => setShowSeedConfirm(true)} disabled={seedData.isPending}>
                  {seedData.isPending ? '⏳ Seeding…' : '🧪 Seed Test Data'}
                </button>
              )}
            </div>
          </div>

          <p style={s.monthlyHint}>
            Each bill is one record per store for a finished month (Central time): the subscription fee, if the plan has one, plus the platform fee recorded on each sale, with the full cashback breakdown. Bills are made automatically after a month ends and are never changed or deleted by the buttons on this page. A paid bill never changes: a correction is a new extra charge.
          </p>

          {monthlyLoading ? (
            <TableSkeleton columns={7} />
          ) : monthlyError ? (
            <ErrorState message="Could not load the bills." onRetry={refetchMonthly} />
          ) : monthlyRecords.length === 0 ? (
            <div style={s.emptyBox}>
              <p style={{ margin: 0, color: TEXT_MUTED }}>No billing records for this filter.</p>
              <p style={{ margin: '8px 0 0', fontSize: 15, color: TEXT_MUTED }}>Click "Generate" or "Backfill All Missing" to create compound bills.</p>
            </div>
          ) : (
            <Table style={s.table}>
              <TableHeader>
                <TableRow>
                  <TableHead style={s.th}>Invoice Period</TableHead>
                  <TableHead style={s.th}>Stores</TableHead>
                  <TableHead style={s.th}>Transactions</TableHead>
                  <TableHead style={s.th}>Purchase Volume</TableHead>
                  <TableHead style={s.th}>Dev Cut</TableHead>
                  <TableHead style={s.th}>Status</TableHead>
                  <TableHead style={s.th}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consolidatedInvoices.map((inv: any) => {
                  const isExp = expandedBill === inv.period;
                  const paidCount = inv.stores.filter((r: any) => r.isPaid).length;
                  return (
                    <Fragment key={inv.period}>
                      <TableRow style={isExp ? s.rowExpanded : undefined}>
                        <TableCell style={s.td}>
                          <button style={s.expandBtn} onClick={() => setExpandedBill(isExp ? null : inv.period)}>
                            {isExp ? '▾' : '▸'} {inv.period}
                          </button>
                        </TableCell>
                        <TableCell style={s.td}>{inv.stores.length} stores</TableCell>
                        <TableCell style={s.td}>{inv.totalTxns}</TableCell>
                        <TableCell style={s.td}>{fmt$(inv.totalVolume)}</TableCell>
                        <TableCell style={s.td}>
                          <strong style={{ color: '#E63946', fontSize: 16 }}>{fmt$(inv.totalDevCut)}</strong>
                          {inv.totalCashback > 0 && (
                            <div style={s.cityLabel}>{fmtPct(devCutRate)} of {fmt$(inv.totalCashback)} cashback</div>
                          )}
                        </TableCell>
                        <TableCell style={s.td}>
                          <span style={inv.isPaid ? s.paidBadge : s.unpaidBadge}>
                            {inv.isPaid ? '✓ Paid' : paidCount > 0 ? `◐ ${paidCount}/${inv.stores.length} Paid` : '⏳ Unpaid'}
                          </span>
                          {inv.isPaid && inv.paidAt && <div style={s.cityLabel}>{new Date(inv.paidAt).toLocaleDateString()}</div>}
                        </TableCell>
                        <TableCell style={s.td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              style={{ ...s.editBtn, background: '#457B9D', fontSize: 14 }}
                              onClick={() => setCombinedInvoiceView(inv)}
                            >📄 Invoice</button>
                            {!inv.isPaid && (
                              <button style={{ ...s.saveBtn, marginRight: 0 }} onClick={() => openPay(`${inv.period} invoice`, inv.period, inv.stores.filter((r: any) => !r.isPaid), false)} disabled={payMutation.isPending}>
                                Mark Paid
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* ── Expanded: per-store breakdown ── */}
                      {isExp && (
                        <TableRow>
                          <TableCell colSpan={7} style={s.expandedCell}>
                            <div style={{ padding: '16px 20px' }}>
                              <div style={s.billSectionTitle}>Per-Store Breakdown - {inv.period}</div>
                              <Table style={{ width: '100%', fontSize: 15 }}>
                                <TableHeader>
                                  <TableRow>
                                    {['Store', 'Txns', 'Purchase Volume', 'Cashback Issued', 'Dev Cut', 'Status', 'Actions'].map((h) => (
                                      <TableHead key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, color: TEXT_MUTED, fontWeight: 700, borderBottom: '1px solid #e9ecef' }}>{h}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {inv.stores
                                    .sort((a: any, b: any) => b.amount - a.amount)
                                    .map((r: any) => {
                                      const isManual = r.billingType === 'CUSTOM';
                                      const n: BillNotes | null = isManual ? null : r.notes;
                                      const manualDescription: string = isManual ? (r.notes?.description ?? '') : '';
                                      return (
                                        <TableRow key={r.id}>
                                          <TableCell style={s.catTd}>
                                            <strong>{r.store?.name ?? '🔗 All Stores (Chain-wide)'}</strong>
                                            <div style={s.cityLabel}>{r.store?.city}</div>
                                            {n?.generatedBy === 'cron' && (
                                              <span style={{ display: 'inline-block', marginTop: 3, padding: '1px 7px', background: '#eef2ff', color: '#4338ca', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>🤖 Auto</span>
                                            )}
                                            {n?.generatedBy === 'manual' && (
                                              <span style={{ display: 'inline-block', marginTop: 3, padding: '1px 7px', background: '#f0fdf4', color: '#166534', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✋ Manual</span>
                                            )}
                                            {isManual && (
                                              <div style={s.cityLabel}>{manualDescription || 'Manual charge'}</div>
                                            )}
                                          </TableCell>
                                          <TableCell style={s.catTd}>{n?.txCount ?? 0}</TableCell>
                                          <TableCell style={s.catTd}>{n ? fmt$(n.purchaseVolume) : ' - '}</TableCell>
                                          <TableCell style={s.catTd}>{n ? <>{fmt$(n.cashbackIssued)}<div style={s.cityLabel}>{fmtPct(n.effectiveCashbackRate)} of volume</div></> : ' - '}</TableCell>
                                          <TableCell style={{ ...s.catTd, color: '#2DC653', fontWeight: 700 }}>{fmt$(r.amount)}</TableCell>
                                          <TableCell style={s.catTd}>
                                            <span style={r.isPaid ? s.paidBadge : s.unpaidBadge}>{r.isPaid ? '✓ Paid' : '⏳ Unpaid'}</span>
                                            {r.isPaid && (
                                              <div style={s.cityLabel}>
                                                {r.paidAt ? storeDayLong(r.paidAt) : ''}{r.notes?.payment?.method ? ` · ${METHOD_LABEL[r.notes.payment.method] ?? r.notes.payment.method}` : ''}{r.notes?.payment?.note ? ` · ${r.notes.payment.note}` : ''}
                                              </div>
                                            )}
                                          </TableCell>
                                          <TableCell style={s.catTd}>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                              <button
                                                style={{ padding: '4px 10px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
                                                onClick={() => setInvoiceView({ record: r, period: inv.period })}
                                              >📄 Invoice</button>
                                              {!r.isPaid && (
                                                <button style={s.rowBtn} onClick={() => openPay(`${r.store?.name ?? 'Chain-wide'} - ${inv.period}`, inv.period, [r], true)} disabled={payMutation.isPending}>Mark paid</button>
                                              )}
                                              {!r.isPaid && !isManual && (
                                                <button style={s.rowBtn} onClick={() => previewRecalc.mutate(r)} disabled={previewRecalc.isPending}>Recalculate</button>
                                              )}
                                              {r.isPaid && (
                                                <button style={{ ...s.rowBtn, color: '#b91c1c', borderColor: '#fca5a5' }} onClick={() => setUndoTarget(r)}>Undo payment</button>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                </TableBody>
                                <TableFooter>
                                  <TableRow>
                                    <TableCell style={{ ...s.catTd, fontWeight: 800 }}>Total</TableCell>
                                    <TableCell style={{ ...s.catTd, fontWeight: 800 }}>{inv.totalTxns}</TableCell>
                                    <TableCell style={{ ...s.catTd, fontWeight: 800 }}>{fmt$(inv.totalVolume)}</TableCell>
                                    <TableCell style={s.catTd}></TableCell>
                                    <TableCell style={{ ...s.catTd, color: '#E63946', fontWeight: 800, fontSize: 14 }}>{fmt$(inv.totalDevCut)}</TableCell>
                                    <TableCell style={s.catTd}></TableCell>
                                    <TableCell style={s.catTd}></TableCell>
                                  </TableRow>
                                </TableFooter>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Totals footer */}
          {consolidatedInvoices.length > 0 && (
            <div style={s.monthlyTotals}>
              <span>
                <strong>{consolidatedInvoices.length}</strong> invoices ·{' '}
                Total Dev Cut: <strong>{fmt$((consolidatedInvoices as any[]).reduce((s, i) => s + i.totalDevCut, 0))}</strong> ·{' '}
                Collected: <strong style={{ color: '#2DC653' }}>{fmt$((consolidatedInvoices as any[]).reduce((s, i) => s + i.stores.filter((r: any) => r.isPaid).reduce((a: number, r: any) => a + r.amount, 0), 0))}</strong> ·{' '}
                Outstanding: <strong style={{ color: '#E63946' }}>{fmt$((consolidatedInvoices as any[]).reduce((s, i) => s + i.stores.filter((r: any) => !r.isPaid).reduce((a: number, r: any) => a + r.amount, 0), 0))}</strong>
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

      {/* ══════════════════ MANUAL / EXTRA CHARGES TAB ══════════════════ */}
      {tab === 'manual' && (() => {
        const allStores: any[] = data?.data?.data ?? [];
        const canSubmit = manualForm.storeId && manualForm.amount && parseFloat(manualForm.amount) > 0 && manualForm.description.trim() && manualForm.period;

        const SERVICE_TEMPLATES = [
          'Setup & Onboarding Fee',
          'Custom Feature Development',
          'Hardware / Printer Setup',
          'Support Contract',
          'Training Session',
          'Emergency Support Call',
          'Data Migration',
          'Custom Report',
        ];

        function startEditCharge(charge: any) {
          setEditingCharge(charge.id);
          setEditForm({ description: charge.description ?? '', amount: String(charge.amount) });
        }
        function saveEditCharge(id: string) {
          const amount = parseFloat(editForm.amount);
          if (!editForm.description.trim()) { toast.error('Description required'); return; }
          if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
          updateCharge.mutate({ id, data: { description: editForm.description.trim(), amount } });
        }

        return (
          <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── Add form ── */}
            <div style={ec.card}>
              <h2 style={ec.cardTitle}>➕ Add Extra Charge</h2>
              <p style={ec.cardSub}>One-time charges for setup fees, custom work, extra services, or anything outside the standard billing plan. A charge is billed in addition to the store's usage bill for that month; it never replaces it.</p>

              {/* Service templates */}
              <div style={ec.templateRow}>
                <span style={ec.templateLabel}>Quick fill:</span>
                {SERVICE_TEMPLATES.map(t => (
                  <button
                    key={t}
                    style={ec.templateBtn}
                    onClick={() => setManualForm(f => ({ ...f, description: t }))}
                  >{t}</button>
                ))}
              </div>

              <div style={ec.formGrid}>
                <div style={ec.formField}>
                  <label style={s.fieldLabel}>Store *</label>
                  <select style={s.input} value={manualForm.storeId}
                    onChange={e => { setManualForm(f => ({ ...f, storeId: e.target.value })); setManualDone(null); }}>
                    <option value="">- Select a store -</option>
                    <option value="chain">🔗 All Stores (Chain-wide) - one charge to SuperAdmin</option>
                    {allStores.map((st: any) => <option key={st.id} value={st.id}>{st.name} - {st.city}</option>)}
                  </select>
                </div>
                <div style={ec.formField}>
                  <label style={s.fieldLabel}>Billing Period *</label>
                  <input style={s.input} type="month" value={manualForm.period}
                    onChange={e => { setManualForm(f => ({ ...f, period: e.target.value })); setManualDone(null); }} />
                </div>
              </div>

              <label style={s.fieldLabel}>Service Description *</label>
              <input style={s.input} placeholder="e.g. Custom feature development, Printer setup fee…"
                value={manualForm.description}
                onChange={e => { setManualForm(f => ({ ...f, description: e.target.value })); setManualDone(null); }} />

              <label style={s.fieldLabel}>Amount (USD) *</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: TEXT_MUTED, fontWeight: 700 }}>$</span>
                <input style={{ ...s.input, paddingLeft: 26 }} placeholder="0.00" type="number" min="0.01" step="0.01"
                  value={manualForm.amount}
                  onChange={e => { setManualForm(f => ({ ...f, amount: e.target.value })); setManualDone(null); }} />
              </div>

              <button
                style={{ ...s.btn, marginTop: 8, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
                disabled={!canSubmit || addManualCharge.isPending}
                onClick={() => addManualCharge.mutate()}
              >
                {addManualCharge.isPending ? 'Adding…' : '+ Add Charge'}
              </button>

              {manualDone && (
                <div style={ec.successBox}>
                  <strong>✅ Charge added</strong> - {manualDone.storeId ? allStores.find((st: any) => st.id === manualDone.storeId)?.name : 'All Stores (Chain-wide)'},{' '}
                  {fmt$(parseFloat(manualDone.amount))} for <strong>{manualDone.period}</strong>
                </div>
              )}
            </div>

            {/* ── Existing charges list ── */}
            <div style={ec.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 style={{ ...ec.cardTitle, marginBottom: 2 }}>📋 Existing Extra Charges</h2>
                  <p style={ec.cardSub}>All custom charges across stores. Paid charges cannot be edited or deleted: for a correction, add a new charge.</p>
                </div>
                <button style={s.editBtn} onClick={() => refetchCharges()}>↻ Refresh</button>
              </div>

              {/* Filters */}
              <div style={ec.filterRow}>
                <select style={ec.filterSelect} value={ecStoreFilter} onChange={e => setEcStoreFilter(e.target.value)}>
                  <option value="">All Stores</option>
                  {allStores.map((st: any) => <option key={st.id} value={st.id}>{st.name} - {st.city}</option>)}
                </select>
                <input style={ec.filterSelect} type="month" value={ecPeriodFilter}
                  onChange={e => setEcPeriodFilter(e.target.value)}
                  title="Filter by billing period" />
                {ecPeriodFilter && <button style={s.cancelBtn} onClick={() => setEcPeriodFilter('')}>✕ Period</button>}
                <select style={ec.filterSelect} value={ecPaidFilter} onChange={e => setEcPaidFilter(e.target.value as any)}>
                  <option value="">All Status</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
                {(ecStoreFilter || ecPeriodFilter || ecPaidFilter) && (
                  <button style={s.cancelBtn} onClick={() => { setEcStoreFilter(''); setEcPeriodFilter(''); setEcPaidFilter(''); }}>
                    ✕ Clear filters
                  </button>
                )}
              </div>

              {ecLoading ? (
                <TableSkeleton columns={6} />
              ) : extraCharges.length === 0 ? (
                <div style={ec.emptyBox}>
                  No extra charges found{ecStoreFilter || ecPeriodFilter || ecPaidFilter ? ' for this filter' : ''}. Add one above.
                </div>
              ) : (
                <Table style={s.table}>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={s.th}>Store</TableHead>
                      <TableHead style={s.th}>Description</TableHead>
                      <TableHead style={s.th}>Amount</TableHead>
                      <TableHead style={s.th}>Period</TableHead>
                      <TableHead style={s.th}>Status</TableHead>
                      <TableHead style={s.th}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extraCharges.map((charge: any) => {
                      const isEditing = editingCharge === charge.id;
                      return (
                        <TableRow key={charge.id}>
                          <TableCell style={s.td}>
                            <strong>{charge.store?.name ?? '🔗 All Stores (Chain-wide)'}</strong>
                            {charge.store?.city && <div style={s.cityLabel}>{charge.store.city}</div>}
                          </TableCell>
                          <TableCell style={s.td}>
                            {isEditing ? (
                              <input style={{ ...s.input, margin: 0 }} value={editForm.description}
                                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                            ) : (
                              <span style={{ color: '#374151' }}>{charge.description || <em style={{ color: TEXT_MUTED }}>No description</em>}</span>
                            )}
                          </TableCell>
                          <TableCell style={s.td}>
                            {isEditing ? (
                              <div style={{ position: 'relative', width: 110 }}>
                                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: TEXT_MUTED }}>$</span>
                                <input style={{ ...s.input, paddingLeft: 20, margin: 0 }} type="number" min="0.01" step="0.01"
                                  value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                              </div>
                            ) : (
                              <strong style={{ color: '#E63946', fontSize: 15 }}>{fmt$(parseFloat(charge.amount))}</strong>
                            )}
                          </TableCell>
                          <TableCell style={s.td}>{charge.period}</TableCell>
                          <TableCell style={s.td}>
                            <span style={charge.isPaid ? s.paidBadge : s.unpaidBadge}>
                              {charge.isPaid ? `✓ Paid` : '⏳ Unpaid'}
                            </span>
                            {charge.isPaid && charge.paidAt && (
                              <div style={s.cityLabel}>{new Date(charge.paidAt).toLocaleDateString()}</div>
                            )}
                          </TableCell>
                          <TableCell style={s.td}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button style={s.saveBtn} disabled={updateCharge.isPending}
                                  onClick={() => saveEditCharge(charge.id)}>
                                  {updateCharge.isPending ? '…' : 'Save'}
                                </button>
                                <button style={s.cancelBtn} onClick={() => setEditingCharge(null)}>Cancel</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {!charge.isPaid && (
                                  <>
                                    <button style={s.editBtn} onClick={() => startEditCharge(charge)}>Edit</button>
                                    <button style={{ ...s.saveBtn, marginRight: 0 }}
                                      disabled={payMutation.isPending}
                                      onClick={() => openPay(charge.description || 'Extra charge', charge.period, [charge], true)}>
                                      Mark Paid
                                    </button>
                                    <button
                                      style={{ ...s.cancelBtn, borderColor: '#fca5a5', color: '#dc2626' }}
                                      disabled={deleteCharge.isPending}
                                      onClick={() => setConfirmDeleteChargeId(charge.id)}>
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} style={{ ...s.catTd, fontWeight: 800 }}>
                        Total ({extraCharges.length} charge{extraCharges.length !== 1 ? 's' : ''})
                      </TableCell>
                      <TableCell style={{ ...s.catTd, fontWeight: 800, color: '#E63946' }}>
                        {fmt$(extraCharges.reduce((sum: number, c: any) => sum + parseFloat(c.amount), 0))}
                      </TableCell>
                      <TableCell colSpan={3} style={s.catTd}>
                        <span style={{ color: '#2DC653', fontWeight: 700 }}>
                          {fmt$(extraCharges.filter((c: any) => c.isPaid).reduce((sum: number, c: any) => sum + parseFloat(c.amount), 0))} collected
                        </span>
                        {' · '}
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                          {fmt$(extraCharges.filter((c: any) => !c.isPaid).reduce((sum: number, c: any) => sum + parseFloat(c.amount), 0))} outstanding
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════ SETTINGS TAB ══════════════════ */}
      {tab === 'settings' && (
        <div style={s.settingsGrid}>

          {/* Cashback rates live on one page only (a second editor here used fractions and skipped the checks) */}
          <div style={{ ...s.settingsCard, gridColumn: '1 / -1' }}>
            <h3 style={s.settingsCardTitle}>🏆 Cashback rates</h3>
            <p style={s.settingsCardDesc}>
              Tier cashback, gas cents per gallon, points to reach a tier and category bonuses are all set on the{' '}
              <Link to="/rates" style={{ color: PRIMARY, fontWeight: 700 }}>Cashback Rates page</Link>,
              where every change is confirmed and recorded.
            </p>
          </div>

          {/* Default fee card (read only: no bill reads this number; each store has its own fee on the Stores tab) */}
          <div style={s.settingsCard}>
            <h3 style={s.settingsCardTitle}>💰 Default fee for new stores</h3>
            <p style={s.settingsCardDesc}>
              The platform fee is a share of the <strong>cashback issued</strong> on each sale, not of the purchase amount. Every store has its own fee
              (set on the Stores tab) and that is the one billed. A store added later starts at this default. Changing a store's fee never rewrites
              sales already made or bills already created.
            </p>

            <div style={s.rateExampleBox}>
              <div style={s.rateExampleTitle}>How it works on a $20 purchase (Bronze tier, 1% cashback)</div>
              <div style={s.rateExampleRow}>
                <span>Customer (Bronze tier, 1%) gets</span>
                <span style={{ color: '#157A3E' }}>= <strong>$0.20</strong> cashback credits</span>
              </div>
              <div style={s.rateExampleRow}>
                <span>Platform fee ({fmtPct(rateLoading ? 0.1 : devCutRate)} of the $0.20 cashback)</span>
                <span style={{ color: '#D62839' }}>= <strong>{fmt$(0.20 * (rateLoading ? 0.1 : devCutRate))}</strong></span>
              </div>
              <div style={{ ...s.rateExampleRow, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #dee2e6' }}>
                <span style={{ color: TEXT_MUTED, fontSize: 14 }}>The store is billed monthly: the sum of the platform fee recorded on each sale</span>
                <span style={{ color: TEXT_MUTED, fontSize: 14 }}>Cashback is the store's loyalty cost (redeemed as free products)</span>
              </div>
            </div>

            {rateLoading ? (
              <div style={s.loading}>Loading…</div>
            ) : (
              <div style={s.rateDisplayRow}>
                <div>
                  <div style={s.rateValue}>{fmtPct(devCutRate)}</div>
                  <div style={s.rateSub}>default for new stores</div>
                </div>
                <div style={{ ...s.rateSub, textAlign: 'right' }}>
                  Fees in use today: {Object.entries(stores.reduce((acc: Record<string, number>, st: any) => { const k = fmtPct(st.transactionFeeRate); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}))
                    .map(([pct, n]) => `${pct} at ${n} store${n === 1 ? '' : 's'}`).join(', ') || 'none'}
                </div>
              </div>
            )}
          </div>

          {/* Info card */}
          <div style={s.settingsCard}>
            <h3 style={s.settingsCardTitle}>ℹ️ Billing Model</h3>
            <p style={s.settingsCardDesc}>How revenue flows in Lucky Stop:</p>
            <div style={s.infoList}>
              <InfoItem icon="🏪" text="Each store is billed a share of the cashback it issues (its fee, set on the Stores tab). A Monthly or Hybrid plan adds a fixed monthly subscription on top." />
              <InfoItem icon="💵" text="When an employee grants points, the customer earns cashback and the platform fee is recorded on that sale at the store's fee at that moment." />
              <InfoItem icon="📅" text="Bills are made automatically after each month ends (Central time). The buttons here never change or delete an existing bill or charge, and a paid bill never changes: a correction is a new extra charge." />
              <InfoItem icon="🎁" text="When a customer redeems credits in-store, no additional cut is taken: the cut was already recorded when the cashback was granted." />
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
      <div style={{ ...s.revValue, color: highlight ? '#2DC653' : PRIMARY }}>{value}</div>
    </div>
  );
}

function StatItem({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: highlight ? '#2DC653' : PRIMARY }}>{value}</div>
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
  container: { padding: 32 },
  title: { fontSize: 26, fontWeight: 800, color: PRIMARY, margin: '0 0 20px' },
  loading: { padding: 32, textAlign: 'center', color: TEXT_MUTED },

  // Revenue summary
  revenueBox: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  revenueGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 },
  revCard: { padding: '12px 0' },
  revLabel: { color: TEXT_MUTED, fontSize: 14, margin: 0, fontWeight: 600 },
  revValue: { fontSize: 22, fontWeight: 800, margin: '4px 0 0' },

  // Tabs
  tabs: { display: 'flex', gap: 6, marginBottom: 20 },
  tab: { padding: '9px 18px', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: TEXT_MUTED },
  tabActive: { padding: '9px 18px', background: PRIMARY, border: '1px solid #1D3557', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff' },
  tabBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, borderRadius: 9, padding: '0 4px', marginLeft: 6,
    background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 800,
  },

  // Table
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  th: { background: '#f8f9fa', padding: '12px 16px', textAlign: 'left', fontSize: 14, color: TEXT_MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f1f2', fontSize: 14, verticalAlign: 'middle' },
  rowExpanded: { background: '#f8faff' },
  expandedCell: { padding: 0, background: '#f8faff', borderBottom: '2px solid #e9ecef' },
  statsRow: { display: 'flex', gap: 12, padding: '16px 20px', flexWrap: 'wrap' },
  statBox: { flex: '1 1 180px', background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e9ecef' },
  statBoxLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

  expandBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: PRIMARY, padding: 0 },
  cityLabel: { fontSize: 14, color: TEXT_MUTED, marginTop: 2 },
  badge: { background: '#E63946', color: '#fff', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  paidBadge: { background: '#2DC653', color: '#fff', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  unpaidBadge: { background: '#fff3cd', color: '#856404', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  na: { color: TEXT_MUTED, fontSize: 15 },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6', fontSize: 14 },
  select: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6', fontSize: 15 },
  volValue: { fontWeight: 700, color: PRIMARY },
  volSub: { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },
  editBtn: { padding: '6px 14px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 },
  saveBtn: { padding: '6px 14px', background: '#2DC653', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginRight: 6, fontSize: 15 },
  cancelBtn: { padding: '6px 14px', background: '#dee2e6', color: '#212529', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 },
  suggestionLine: { margin: '0 0 8px', fontSize: 15, color: '#495057', lineHeight: 1.5 },

  // Monthly bills
  monthlyToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 12 },
  monthlyFilters: { display: 'flex', gap: 16, alignItems: 'flex-end' },
  filterLabel: { display: 'block', fontSize: 14, fontWeight: 600, color: TEXT_MUTED, marginBottom: 4 },
  generateBtn: { padding: '10px 20px', background: '#E63946', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  backfillBtn: { padding: '10px 20px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  rowBtn: { padding: '4px 10px', background: '#fff', color: PRIMARY, border: '1px solid #cbd5e1', borderRadius: 5, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  exportBtn: { padding: '10px 20px', background: '#2DC653', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  sendBtn: { padding: '10px 20px', background: '#F4A261', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  clearBtn: { padding: '10px 20px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
  monthlyHint: { fontSize: 15, color: TEXT_MUTED, margin: '0 0 16px', padding: '10px 14px', background: '#f8f9fa', borderRadius: 8 },
  emptyBox: { background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', border: '1px dashed #dee2e6' },
  monthlyTotals: { background: '#fff', borderRadius: 8, padding: '12px 16px', marginTop: 12, fontSize: 14, color: '#495057' },

  // Compound bill detail
  billDetail: { display: 'flex', flexWrap: 'wrap', gap: 16, padding: '16px 20px' },
  billSection: { flex: '1 1 260px', background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e9ecef' },
  billSectionTitle: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 12 },
  feeGrid: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  feeRow: { display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#495057', padding: '4px 0' },
  catTd: { padding: '5px 8px', borderBottom: '1px solid #f0f1f2', fontSize: 15, color: '#495057' },

  // Settings
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 20 },
  settingsCard: { background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  settingsCardTitle: { fontSize: 18, fontWeight: 800, color: PRIMARY, margin: '0 0 8px' },
  settingsCardDesc: { fontSize: 14, color: TEXT_MUTED, margin: '0 0 20px', lineHeight: 1.6 },

  rateExampleBox: { background: '#f8f9fa', borderRadius: 10, padding: '14px 16px', marginBottom: 20 },
  rateExampleTitle: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  rateExampleRow: { display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#495057', marginBottom: 6 },

  rateDisplayRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rateValue: { fontSize: 36, fontWeight: 800, color: PRIMARY },
  rateSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 2 },
  rateEditRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

  infoList: { marginTop: 8 },
  fieldLabel: { display: 'block', fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 6, marginTop: 16 },
  btn: { padding: '10px 20px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 },
};

// ─── Extra charges tab styles ─────────────────────────────────────────────────
const ec: Record<string, React.CSSProperties> = {
  card: { background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb' },
  cardTitle: { fontSize: 18, fontWeight: 800, color: PRIMARY, margin: '0 0 6px' },
  cardSub: { fontSize: 14, color: TEXT_MUTED, margin: '0 0 20px' },

  templateRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center', padding: '12px 14px', background: '#f8faff', borderRadius: 10, border: '1px solid #e0e7ff' },
  templateLabel: { fontSize: 13, fontWeight: 700, color: '#4f46e5', marginRight: 4, flexShrink: 0 },
  templateBtn: {
    background: '#fff', border: '1.5px solid #c7d2fe', color: '#4338ca',
    borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 },
  formField: {},

  filterRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, padding: '10px 12px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' },
  filterSelect: { padding: '7px 11px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, color: '#374151', background: '#fff' },

  successBox: { marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#166534' },
  emptyBox: { padding: '32px 0', textAlign: 'center', color: TEXT_MUTED, fontSize: 14 },
};
