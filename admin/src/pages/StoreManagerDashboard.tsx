import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { pointsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function StoreManagerDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const storeId = user?.storeIds?.[0];
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['store-summary', storeId],
    queryFn: () => pointsApi.getStoreSummary(storeId!),
    enabled: !!storeId,
  });

  const { data: pendingData } = useQuery({
    queryKey: ['store-pending', storeId],
    queryFn: () => pointsApi.getStoreTransactions(storeId!, 'PENDING'),
    enabled: !!storeId,
  });

  const rejectMutation = useMutation({
    mutationFn: (txId: string) => pointsApi.reject(txId),
    onSuccess: () => {
      toast.success('Transaction rejected');
      qc.invalidateQueries({ queryKey: ['store-pending', storeId] });
      qc.invalidateQueries({ queryKey: ['store-summary', storeId] });
    },
    onError: () => toast.error('Failed to reject transaction'),
  });

  const summary = data?.data?.data;
  const pendingList = pendingData?.data?.data?.transactions || [];

  if (!storeId) {
    return (
      <div style={s.container}>
        <div style={s.errorCard}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2>No Store Assigned</h2>
          <p style={{ color: TEXT_MUTED }}>Contact your Super Admin to assign you to a store.</p>
        </div>
      </div>
    );
  }

  if (isError) return (
    <div style={s.container}>
      <ErrorState message="Failed to load store data." onRetry={refetch} />
    </div>
  );

  return (
    <div style={s.container}>
      <ConfirmModal
        open={!!confirmRejectId}
        title="Reject Transaction"
        message="This transaction will be rejected and the customer will not receive points for it."
        confirmLabel="Reject"
        danger
        onConfirm={() => { if (confirmRejectId) rejectMutation.mutate(confirmRejectId); setConfirmRejectId(null); }}
        onCancel={() => setConfirmRejectId(null)}
      />
      {/* Welcome Header */}
      <div style={s.welcomeCard}>
        <div>
          <h1 style={s.welcomeTitle}>{greeting()}, {user?.name?.split(' ')[0] || 'Manager'} 👋</h1>
          <p style={s.welcomeSub}>
            {isLoading ? 'Loading store info…' : summary?.store
              ? `${summary.store.name} - ${summary.store.city}`
              : 'Store Dashboard'}
          </p>
        </div>
        <div style={s.roleBadge}>🏪 Store Manager</div>
      </div>

      {/* Today's Stats */}
      <h2 style={s.sectionTitle}>Today's Activity</h2>
      <div style={s.statsGrid}>
        <StatCard icon="🧾" label="Transactions" value={isLoading ? '…' : summary?.today.transactions ?? 0} />
        <StatCard icon="💵" label="Purchase Volume" value={isLoading ? '…' : `$${Number(summary?.today.purchaseVolume ?? 0).toFixed(2)}`} />
        <StatCard icon="⭐" label="Points Awarded" value={isLoading ? '…' : `$${Number(summary?.today.pointsAwarded ?? 0).toFixed(2)}`} valueColor="#F4A261" />
        <StatCard icon="⏳" label="Pending Review" value={isLoading ? '…' : summary?.pending ?? 0} valueColor={summary?.pending ? '#E63946' : '#2DC653'} />
      </div>

      {/* All-time Stats */}
      <h2 style={s.sectionTitle}>All-Time</h2>
      <div style={s.statsGrid}>
        <StatCard icon="🏆" label="Total Transactions" value={isLoading ? '…' : summary?.allTime.transactions ?? 0} />
        <StatCard icon="💰" label="Total Volume" value={isLoading ? '…' : `$${Number(summary?.allTime.purchaseVolume ?? 0).toLocaleString()}`} />
        <StatCard icon="🎁" label="Total Points Given" value={isLoading ? '…' : `$${Number(summary?.allTime.pointsAwarded ?? 0).toFixed(2)}`} />
      </div>

      {/* Quick Actions */}
      <h2 style={s.sectionTitle}>Quick Actions</h2>
      <div style={s.actionGrid}>
        {[
          { icon: '🧾', label: 'Transactions', desc: 'All store transactions with receipts', to: '/transactions', color: '#F4A261' },
          { icon: '📢', label: 'Offers', desc: 'Create promotions & deals for your store', to: '/offers', color: '#E63946' },
          { icon: '🖼️', label: 'Banners', desc: 'Upload promotional images for your store', to: '/banners', color: '#2DC653' },
          { icon: '📅', label: 'Scheduling', desc: 'Manage shifts and weekly schedules', to: '/scheduling', color: '#7C3AED' },
          { icon: '💬', label: 'Chat', desc: 'Team communication for your store', to: '/chat', color: '#0369a1' },
          { icon: '🏷️', label: 'Labels', desc: 'Create and print shelf/price labels', to: '/labels', color: '#b45309' },
        ].map((a) => (
          <button key={a.to} style={s.actionCard} onClick={() => navigate(a.to)}>
            <div style={{ ...s.actionIcon, background: a.color + '18', color: a.color }}>{a.icon}</div>
            <div>
              <div style={s.actionTitle}>{a.label}</div>
              <div style={s.actionDesc}>{a.desc}</div>
            </div>
            <span style={s.arrow}>›</span>
          </button>
        ))}
      </div>

      {/* Pending Transactions */}
      {pendingList.length > 0 && (
        <>
          <h2 style={{ ...s.sectionTitle, marginTop: 28, color: '#E63946' }}>
            ⏳ Pending Review ({pendingList.length})
          </h2>
          <div style={s.pendingList}>
            {pendingList.map((tx: any) => (
              <div key={tx.id} style={s.pendingRow}>
                <div style={s.pendingLeft}>
                  <div style={s.pendingCustomer}>{tx.customer?.name || tx.customer?.phone}</div>
                  <div style={s.pendingMeta}>
                    ${Number(tx.purchaseAmount).toFixed(2)} purchase · {tx.category?.replace('_', ' ')} · {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={s.pendingRight}>
                  <div style={s.pendingPoints}>+${Number(tx.pointsAwarded).toFixed(2)}</div>
                  {tx.receiptImageUrl && (
                    <a href={tx.receiptImageUrl} target="_blank" rel="noreferrer" style={s.receiptLink}>📄 Receipt</a>
                  )}
                  <button style={s.rejectBtn} onClick={() => setConfirmRejectId(tx.id)} disabled={rejectMutation.isPending}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recent Transactions */}
      {summary?.recent?.length > 0 && (
        <>
          <h2 style={{ ...s.sectionTitle, marginTop: 28 }}>Recent Transactions</h2>
          <div style={s.pendingList}>
            {summary.recent.map((tx: any) => (
              <div key={tx.id} style={s.pendingRow}>
                <div style={s.pendingLeft}>
                  <div style={s.pendingCustomer}>{tx.customer?.name || tx.customer?.phone}</div>
                  <div style={s.pendingMeta}>
                    by {tx.grantedBy?.name || 'Staff'} · {new Date(tx.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={s.pendingRight}>
                  <div style={{ ...s.pendingPoints, color: tx.status === 'APPROVED' ? '#2DC653' : tx.status === 'REJECTED' ? '#E63946' : '#F4A261' }}>
                    {tx.status === 'APPROVED' ? `+$${Number(tx.pointsAwarded).toFixed(2)}` : tx.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, valueColor = PRIMARY }: { icon: string; label: string; value: any; valueColor?: string }) {
  return (
    <div style={s.statCard}>
      <div style={s.statIcon}>{icon}</div>
      <div>
        <div style={s.statLabel}>{label}</div>
        <div style={{ ...s.statValue, color: valueColor }}>{value}</div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32 },

  welcomeCard: {
    background: 'linear-gradient(135deg, #12202f 0%, #1D3557 55%, #2a4a73 100%)',
    borderRadius: 16, padding: '28px 32px', marginBottom: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 4px 20px rgba(29,53,87,0.28)',
  },
  welcomeTitle: { color: '#fff', fontSize: 24, fontWeight: 800, margin: 0 },
  welcomeSub: { color: 'rgba(255,255,255,0.7)', marginTop: 6, fontSize: 14 },
  roleBadge: {
    background: 'rgba(255,255,255,0.15)', color: '#fff',
    borderRadius: 20, padding: '8px 20px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
  },

  sectionTitle: { fontSize: 17, fontWeight: 700, color: PRIMARY, marginBottom: 14, marginTop: 0 },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 36 },
  statCard: {
    background: '#fff', borderRadius: 14, padding: '18px 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    display: 'flex', alignItems: 'center', gap: 14,
    border: '1px solid #f0f1f2',
  },
  statIcon: { fontSize: 28, flexShrink: 0 },
  statLabel: { color: TEXT_MUTED, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 24, fontWeight: 800, marginTop: 2 },

  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 24 },
  actionCard: {
    background: '#fff', borderRadius: 14, padding: '18px 20px',
    display: 'flex', alignItems: 'center', gap: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    border: '1px solid #f0f1f2',
    cursor: 'pointer', textAlign: 'left', width: '100%',
  },
  actionIcon: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 },
  actionTitle: { color: PRIMARY, fontWeight: 700, fontSize: 15 },
  actionDesc: { color: TEXT_MUTED, fontSize: 15, marginTop: 2 },
  arrow: { color: '#dee2e6', fontSize: 24, marginLeft: 'auto', flexShrink: 0 },

  pendingList: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 },
  pendingRow: {
    background: '#fff', borderRadius: 12, padding: '16px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2',
  },
  pendingLeft: { flex: 1 },
  pendingCustomer: { fontWeight: 700, fontSize: 15, color: PRIMARY },
  pendingMeta: { fontSize: 15, color: TEXT_MUTED, marginTop: 3 },
  pendingRight: { display: 'flex', alignItems: 'center', gap: 12 },
  pendingPoints: { fontSize: 16, fontWeight: 800, color: '#2DC653' },
  receiptLink: { fontSize: 15, color: '#457b9d', textDecoration: 'none', fontWeight: 600 },
  rejectBtn: {
    padding: '6px 16px', borderRadius: 8, border: '1px solid #E63946',
    background: 'transparent', color: '#E63946', cursor: 'pointer', fontWeight: 600, fontSize: 15,
  },

  errorCard: { textAlign: 'center', padding: 60 },
};
