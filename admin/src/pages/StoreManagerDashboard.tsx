import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { pointsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function StoreManagerDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const storeId = user?.storeIds?.[0];

  const { data, isLoading } = useQuery({
    queryKey: ['store-summary', storeId],
    queryFn: () => pointsApi.getStoreSummary(storeId!),
    enabled: !!storeId,
  });

  const { data: pendingData, refetch: refetchPending } = useQuery({
    queryKey: ['store-pending', storeId],
    queryFn: () => pointsApi.getStoreTransactions(storeId!, 'PENDING'),
    enabled: !!storeId,
  });

  const summary = data?.data?.data;
  const pendingList = pendingData?.data?.data?.transactions || [];

  async function handleReject(txId: string) {
    try {
      await pointsApi.reject(txId);
      toast.success('Transaction rejected');
      refetchPending();
    } catch {
      toast.error('Failed to reject transaction');
    }
  }

  if (!storeId) {
    return (
      <div style={s.container}>
        <div style={s.errorCard}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2>No Store Assigned</h2>
          <p style={{ color: '#6c757d' }}>Contact your Super Admin to assign you to a store.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* Welcome Header */}
      <div style={s.welcomeCard}>
        <div>
          <h1 style={s.welcomeTitle}>{greeting()}, {user?.name?.split(' ')[0] || 'Manager'} 👋</h1>
          <p style={s.welcomeSub}>
            {isLoading ? 'Loading store info…' : summary?.store
              ? `${summary.store.name} — ${summary.store.city}`
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
        <button style={s.actionCard} onClick={() => navigate('/transactions')}>
          <div style={{ ...s.actionIcon, background: '#F4A261' + '18', color: '#F4A261' }}>🧾</div>
          <div>
            <div style={s.actionTitle}>View Transactions</div>
            <div style={s.actionDesc}>All store transactions with receipts</div>
          </div>
          <span style={s.arrow}>›</span>
        </button>
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
                  <button style={s.rejectBtn} onClick={() => handleReject(tx.id)}>Reject</button>
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

function StatCard({ icon, label, value, valueColor = '#1D3557' }: { icon: string; label: string; value: any; valueColor?: string }) {
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
  container: { padding: 32, maxWidth: 1100, margin: '0 auto' },

  welcomeCard: {
    background: 'linear-gradient(135deg, #2a6049 0%, #3d8a69 100%)',
    borderRadius: 16, padding: '28px 32px', marginBottom: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 4px 20px rgba(42,96,73,0.25)',
  },
  welcomeTitle: { color: '#fff', fontSize: 24, fontWeight: 800, margin: 0 },
  welcomeSub: { color: 'rgba(255,255,255,0.7)', marginTop: 6, fontSize: 14 },
  roleBadge: {
    background: 'rgba(255,255,255,0.15)', color: '#fff',
    borderRadius: 20, padding: '8px 20px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
  },

  sectionTitle: { fontSize: 17, fontWeight: 700, color: '#1D3557', marginBottom: 14, marginTop: 0 },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 36 },
  statCard: {
    background: '#fff', borderRadius: 14, padding: '18px 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    display: 'flex', alignItems: 'center', gap: 14,
    border: '1px solid #f0f1f2',
  },
  statIcon: { fontSize: 28, flexShrink: 0 },
  statLabel: { color: '#6c757d', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  actionTitle: { color: '#1D3557', fontWeight: 700, fontSize: 15 },
  actionDesc: { color: '#6c757d', fontSize: 13, marginTop: 2 },
  arrow: { color: '#dee2e6', fontSize: 24, marginLeft: 'auto', flexShrink: 0 },

  pendingList: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 },
  pendingRow: {
    background: '#fff', borderRadius: 12, padding: '16px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2',
  },
  pendingLeft: { flex: 1 },
  pendingCustomer: { fontWeight: 700, fontSize: 15, color: '#1D3557' },
  pendingMeta: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  pendingRight: { display: 'flex', alignItems: 'center', gap: 12 },
  pendingPoints: { fontSize: 16, fontWeight: 800, color: '#2DC653' },
  receiptLink: { fontSize: 13, color: '#457b9d', textDecoration: 'none', fontWeight: 600 },
  rejectBtn: {
    padding: '6px 16px', borderRadius: 8, border: '1px solid #E63946',
    background: 'transparent', color: '#E63946', cursor: 'pointer', fontWeight: 600, fontSize: 13,
  },

  errorCard: { textAlign: 'center', padding: 60 },
};
