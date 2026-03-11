import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { billingApi } from '../services/api';

const BILLING_TYPES = ['MONTHLY_SUBSCRIPTION', 'PER_TRANSACTION', 'HYBRID'] as const;

function needsSubscription(type: string) { return type === 'MONTHLY_SUBSCRIPTION' || type === 'HYBRID'; }
function needsTransactionFee(type: string) { return type === 'PER_TRANSACTION' || type === 'HYBRID'; }

export default function Billing() {
  const qc = useQueryClient();
  const [editingStore, setEditingStore] = useState<string | null>(null);
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

  if (isLoading) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>💳 Billing Management</h1>
      <p style={styles.sub}>DevAdmin only — manage store billing types and rates</p>

      {revenue && (
        <div style={styles.revenueBox}>
          <h3 style={{ margin: 0, marginBottom: 16 }}>Revenue Summary</h3>
          <div style={styles.revenueGrid}>
            <div><p style={styles.revLabel}>Dev Cut (5% of redemptions)</p><p style={styles.revValue}>${Number(revenue.totalDevCut ?? 0).toFixed(2)}</p></div>
            <div><p style={styles.revLabel}>Subscription Revenue</p><p style={styles.revValue}>${Number(revenue.totalSubscriptionRevenue ?? 0).toFixed(2)}</p></div>
            <div><p style={styles.revLabel}>Credits Redeemed</p><p style={styles.revValue}>${Number(revenue.totalRedeemedAmount ?? 0).toFixed(2)}</p></div>
            <div><p style={styles.revLabel}>Purchase Volume</p><p style={styles.revValue}>${Number(revenue.totalPurchaseVolume ?? 0).toFixed(2)}</p></div>
            <div><p style={styles.revLabel}>Approved Transactions</p><p style={styles.revValue}>{revenue.totalTransactions}</p></div>
            <div><p style={styles.revLabel}>Redemption Count</p><p style={styles.revValue}>{revenue.totalRedemptions}</p></div>
          </div>
        </div>
      )}

      <h2>All Stores</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Store</th>
            <th style={styles.th}>City</th>
            <th style={styles.th}>Billing Type</th>
            <th style={styles.th}>Monthly Price</th>
            <th style={styles.th}>Transaction Fee</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store: any) => {
            const isEditing = editingStore === store.id;
            const activeType = isEditing ? billingForm.billingType : store.billingType;
            return (
              <tr key={store.id}>
                <td style={styles.td}>{store.name}</td>
                <td style={styles.td}>{store.city}</td>

                {/* Billing Type */}
                <td style={styles.td}>
                  {isEditing ? (
                    <select
                      value={billingForm.billingType}
                      onChange={(e) => setBillingForm((f) => ({ ...f, billingType: e.target.value }))}
                      style={styles.select}
                    >
                      {BILLING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  ) : (
                    <span style={styles.badge}>{store.billingType.replace(/_/g, ' ')}</span>
                  )}
                </td>

                {/* Monthly Price — only relevant for MONTHLY_SUBSCRIPTION or HYBRID */}
                <td style={styles.td}>
                  {isEditing ? (
                    needsSubscription(activeType) ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 99"
                        value={billingForm.subscriptionPrice}
                        onChange={(e) => setBillingForm((f) => ({ ...f, subscriptionPrice: e.target.value }))}
                        style={styles.input}
                      />
                    ) : (
                      <span style={styles.na}>—</span>
                    )
                  ) : (
                    needsSubscription(store.billingType)
                      ? `$${Number(store.subscriptionPrice).toFixed(2)}/mo`
                      : <span style={styles.na}>—</span>
                  )}
                </td>

                {/* Transaction Fee — only relevant for PER_TRANSACTION or HYBRID */}
                <td style={styles.td}>
                  {isEditing ? (
                    needsTransactionFee(activeType) ? (
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.001"
                        placeholder="e.g. 0.02"
                        value={billingForm.transactionFeeRate}
                        onChange={(e) => setBillingForm((f) => ({ ...f, transactionFeeRate: e.target.value }))}
                        style={styles.input}
                      />
                    ) : (
                      <span style={styles.na}>—</span>
                    )
                  ) : (
                    needsTransactionFee(store.billingType)
                      ? `${(store.transactionFeeRate * 100).toFixed(1)}%`
                      : <span style={styles.na}>—</span>
                  )}
                </td>

                {/* Actions */}
                <td style={styles.td}>
                  {isEditing ? (
                    <>
                      <button style={styles.saveBtn} onClick={() => saveEdit(store.id)} disabled={updateBilling.isPending}>
                        {updateBilling.isPending ? '…' : 'Save'}
                      </button>
                      <button style={styles.cancelBtn} onClick={() => setEditingStore(null)}>Cancel</button>
                    </>
                  ) : (
                    <button style={styles.editBtn} onClick={() => startEdit(store)}>Edit</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginBottom: 24 },
  loading: { padding: 32, textAlign: 'center' },
  revenueBox: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 32, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  revenueGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 },
  revLabel: { color: '#6c757d', fontSize: 13, margin: 0 },
  revValue: { fontSize: 24, fontWeight: 800, color: '#2DC653', margin: '4px 0 0' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden' },
  th: { background: '#f8f9fa', padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#6c757d', fontWeight: 600 },
  td: { padding: '14px 16px', borderBottom: '1px solid #dee2e6', fontSize: 14 },
  badge: { background: '#E63946', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 },
  na: { color: '#adb5bd', fontSize: 13 },
  input: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6', width: 90 },
  select: { padding: '6px 10px', borderRadius: 6, border: '1px solid #dee2e6' },
  editBtn: { padding: '6px 14px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  saveBtn: { padding: '6px 14px', background: '#2DC653', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginRight: 6 },
  cancelBtn: { padding: '6px 14px', background: '#dee2e6', color: '#212529', border: 'none', borderRadius: 6, cursor: 'pointer' },
};
