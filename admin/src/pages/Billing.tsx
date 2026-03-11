import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { billingApi } from '../services/api';

const BILLING_TYPES = ['MONTHLY_SUBSCRIPTION', 'PER_TRANSACTION', 'HYBRID'] as const;

function needsSubscription(type: string) { return type === 'MONTHLY_SUBSCRIPTION' || type === 'HYBRID'; }
function needsTransactionFee(type: string) { return type === 'PER_TRANSACTION' || type === 'HYBRID'; }
function fmt$(n: number) { return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function Billing() {
  const qc = useQueryClient();
  const [editingStore, setEditingStore] = useState<string | null>(null);
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState({ billingType: '', subscriptionPrice: '', transactionFeeRate: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['billing-stores'],
    queryFn: () => billingApi.getAllStores(),
  });

  const { data: revenueData } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => billingApi.getRevenue(),
  });

  const updateBilling = useMutation({
    mutationFn: ({ storeId, data }: { storeId: string; data: object }) =>
      billingApi.updateStoreBilling(storeId, data),
    onSuccess: () => {
      toast.success('Billing updated');
      setEditingStore(null);
      qc.invalidateQueries({ queryKey: ['billing-stores'] });
    },
    onError: () => toast.error('Failed to update billing'),
  });

  const stores = data?.data?.data || [];
  const revenue = revenueData?.data?.data;

  function startEdit(store: any) {
    setEditingStore(store.id);
    setExpandedStore(store.id); // auto-expand revenue when editing
    setBillingForm({
      billingType: store.billingType,
      subscriptionPrice: String(store.subscriptionPrice),
      transactionFeeRate: String(store.transactionFeeRate),
    });
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
      if (isNaN(fee) || fee < 0 || fee > 1) { toast.error('Transaction fee must be between 0 and 1 (e.g. 0.02)'); return; }
      payload.transactionFeeRate = fee;
    }

    updateBilling.mutate({ storeId, data: payload });
  }

  if (isLoading) return <div style={s.loading}>Loading...</div>;

  return (
    <div style={s.container}>
      <h1 style={s.title}>💳 Billing Management</h1>
      <p style={s.sub}>DevAdmin only — manage store billing types and rates. Expand a store to see revenue before setting prices.</p>

      {revenue && (
        <div style={s.revenueBox}>
          <h3 style={{ margin: 0, marginBottom: 16 }}>Platform Revenue Summary</h3>
          <div style={s.revenueGrid}>
            <div><p style={s.revLabel}>Dev Cut (5% of redemptions)</p><p style={s.revValue}>{fmt$(revenue.totalDevCut ?? 0)}</p></div>
            <div><p style={s.revLabel}>Subscription Revenue</p><p style={s.revValue}>{fmt$(revenue.totalSubscriptionRevenue ?? 0)}</p></div>
            <div><p style={s.revLabel}>Credits Redeemed</p><p style={s.revValue}>{fmt$(revenue.totalRedeemedAmount ?? 0)}</p></div>
            <div><p style={s.revLabel}>Purchase Volume</p><p style={s.revValue}>{fmt$(revenue.totalPurchaseVolume ?? 0)}</p></div>
            <div><p style={s.revLabel}>Approved Transactions</p><p style={s.revValue}>{revenue.totalTransactions}</p></div>
            <div><p style={s.revLabel}>Redemption Count</p><p style={s.revValue}>{revenue.totalRedemptions}</p></div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1D3557', marginBottom: 12 }}>All Stores</h2>
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
              <>
                <tr key={store.id} style={isExpanded ? s.rowExpanded : undefined}>
                  {/* Store name */}
                  <td style={s.td}>
                    <button
                      style={s.expandBtn}
                      onClick={() => setExpandedStore(isExpanded ? null : store.id)}
                    >
                      {isExpanded ? '▾' : '▸'} {store.name}
                    </button>
                    <div style={s.cityLabel}>{store.city}</div>
                  </td>

                  {/* Billing type */}
                  <td style={s.td}>
                    {isEditing ? (
                      <select
                        value={billingForm.billingType}
                        onChange={(e) => setBillingForm((f) => ({ ...f, billingType: e.target.value }))}
                        style={s.select}
                      >
                        {BILLING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                      </select>
                    ) : (
                      <span style={s.badge}>{store.billingType.replace(/_/g, ' ')}</span>
                    )}
                  </td>

                  {/* Monthly price */}
                  <td style={s.td}>
                    {isEditing ? (
                      needsSubscription(activeType) ? (
                        <input type="number" min="0" step="0.01" placeholder="e.g. 99"
                          value={billingForm.subscriptionPrice}
                          onChange={(e) => setBillingForm((f) => ({ ...f, subscriptionPrice: e.target.value }))}
                          style={s.input} />
                      ) : <span style={s.na}>—</span>
                    ) : (
                      needsSubscription(store.billingType) ? fmt$(store.subscriptionPrice) + '/mo' : <span style={s.na}>—</span>
                    )}
                  </td>

                  {/* Transaction fee */}
                  <td style={s.td}>
                    {isEditing ? (
                      needsTransactionFee(activeType) ? (
                        <input type="number" min="0" max="1" step="0.001" placeholder="e.g. 0.02"
                          value={billingForm.transactionFeeRate}
                          onChange={(e) => setBillingForm((f) => ({ ...f, transactionFeeRate: e.target.value }))}
                          style={s.input} />
                      ) : <span style={s.na}>—</span>
                    ) : (
                      needsTransactionFee(store.billingType) ? `${(store.transactionFeeRate * 100).toFixed(1)}%` : <span style={s.na}>—</span>
                    )}
                  </td>

                  {/* 30-day volume */}
                  <td style={s.td}>
                    <span style={s.volValue}>{fmt$(rev.last30Days.purchaseVolume)}</span>
                    <div style={s.volSub}>{rev.last30Days.transactions} txns</div>
                  </td>

                  {/* Avg monthly volume (90d) */}
                  <td style={s.td}>
                    <span style={s.volValue}>{fmt$(rev.last90Days.avgMonthlyVolume)}</span>
                    <div style={s.volSub}>90-day avg</div>
                  </td>

                  {/* Actions */}
                  <td style={s.td}>
                    {isEditing ? (
                      <>
                        <button style={s.saveBtn} onClick={() => saveEdit(store.id)} disabled={updateBilling.isPending}>
                          {updateBilling.isPending ? '…' : 'Save'}
                        </button>
                        <button style={s.cancelBtn} onClick={() => setEditingStore(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={s.editBtn} onClick={() => startEdit(store)}>Edit</button>
                    )}
                  </td>
                </tr>

                {/* Expanded revenue breakdown row */}
                {isExpanded && (
                  <tr key={`${store.id}-expanded`}>
                    <td colSpan={7} style={s.expandedCell}>
                      <div style={s.statsRow}>
                        <div style={s.statBox}>
                          <div style={s.statBoxLabel}>Last 30 Days</div>
                          <div style={s.statBoxGrid}>
                            <StatItem label="Purchase Volume" value={fmt$(rev.last30Days.purchaseVolume)} />
                            <StatItem label="Transactions" value={rev.last30Days.transactions} />
                            <StatItem label="Points Awarded" value={fmt$(rev.last30Days.pointsAwarded)} />
                          </div>
                        </div>
                        <div style={s.statBox}>
                          <div style={s.statBoxLabel}>Last 90 Days</div>
                          <div style={s.statBoxGrid}>
                            <StatItem label="Purchase Volume" value={fmt$(rev.last90Days.purchaseVolume)} />
                            <StatItem label="Transactions" value={rev.last90Days.transactions} />
                            <StatItem label="Avg Monthly Volume" value={fmt$(rev.last90Days.avgMonthlyVolume)} highlight />
                          </div>
                        </div>
                        <div style={s.statBox}>
                          <div style={s.statBoxLabel}>All Time Redemptions</div>
                          <div style={s.statBoxGrid}>
                            <StatItem label="Credits Redeemed" value={fmt$(rev.allTime.redeemedAmount)} />
                            <StatItem label="Redemption Count" value={rev.allTime.redemptions} />
                            <StatItem label="Dev Cut Earned" value={fmt$(rev.allTime.devCut)} highlight />
                          </div>
                        </div>
                        {isEditing && (
                          <div style={{ ...s.statBox, borderColor: '#1D3557', background: '#f0f4ff' }}>
                            <div style={{ ...s.statBoxLabel, color: '#1D3557' }}>💡 Suggested Pricing</div>
                            <div style={s.suggestion}>
                              <p style={s.suggestionLine}>
                                <strong>Flat fee:</strong> If avg monthly volume is{' '}
                                <strong>{fmt$(rev.last90Days.avgMonthlyVolume)}</strong>, a 1–2% fee = {' '}
                                <strong>{fmt$(rev.last90Days.avgMonthlyVolume * 0.01)}–{fmt$(rev.last90Days.avgMonthlyVolume * 0.02)}/mo</strong>
                              </p>
                              <p style={s.suggestionLine}>
                                <strong>Per-transaction:</strong> {rev.last90Days.transactions / 3 | 0} avg txns/mo
                                → at $0.30/tx = <strong>{fmt$((rev.last90Days.transactions / 3) * 0.30)}/mo</strong>
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatItem({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: highlight ? '#2DC653' : '#1D3557' }}>{value}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1300, margin: '0 auto' },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginBottom: 24, fontSize: 14 },
  loading: { padding: 32, textAlign: 'center' },

  revenueBox: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  revenueGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 },
  revLabel: { color: '#6c757d', fontSize: 13, margin: 0 },
  revValue: { fontSize: 24, fontWeight: 800, color: '#2DC653', margin: '4px 0 0' },

  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  th: { background: '#f8f9fa', padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6c757d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f1f2', fontSize: 14, verticalAlign: 'middle' },
  rowExpanded: { background: '#f8faff' },

  expandBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#1D3557', padding: 0, textAlign: 'left' },
  cityLabel: { fontSize: 12, color: '#adb5bd', marginTop: 2 },

  badge: { background: '#E63946', color: '#fff', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  na: { color: '#adb5bd', fontSize: 13 },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6', width: 90 },
  select: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6', fontSize: 13 },

  volValue: { fontWeight: 700, color: '#1D3557' },
  volSub: { fontSize: 11, color: '#adb5bd', marginTop: 2 },

  editBtn: { padding: '6px 14px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  saveBtn: { padding: '6px 14px', background: '#2DC653', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginRight: 6, fontSize: 13 },
  cancelBtn: { padding: '6px 14px', background: '#dee2e6', color: '#212529', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },

  expandedCell: { padding: 0, background: '#f8faff', borderBottom: '2px solid #e9ecef' },
  statsRow: { display: 'flex', gap: 12, padding: '16px 20px', flexWrap: 'wrap' },
  statBox: { flex: '1 1 200px', background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e9ecef' },
  statBoxLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  statBoxGrid: { display: 'flex', flexDirection: 'column', gap: 10 },

  suggestion: { marginTop: 4 },
  suggestionLine: { margin: '0 0 8px', fontSize: 13, color: '#495057', lineHeight: 1.5 },
};
