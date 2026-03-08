import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { billingApi, pointsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user } = useAuthStore();
  const role = user?.role;
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(role || '');
  const isStoreManager = role === 'STORE_MANAGER';
  const storeId = user?.storeIds?.[0];

  if (isStoreManager && storeId) return <StoreManagerDashboard storeId={storeId} />;
  if (isSuperAdmin) return <AdminDashboard isDevAdmin={role === 'DEV_ADMIN'} />;
  return <div style={s.empty}>Welcome, {user?.name || user?.phone}</div>;
}

// ── Store Manager Dashboard ──────────────────────────────────────────────────

function StoreManagerDashboard({ storeId }: { storeId: string }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['store-summary', storeId],
    queryFn: () => pointsApi.getStoreSummary(storeId),
    refetchInterval: 60_000,
  });

  const summary = data?.data?.data;

  return (
    <div style={s.container}>
      <h1 style={s.title}>Dashboard</h1>
      <p style={s.sub}>Welcome back, {user?.name || user?.phone}</p>

      {isLoading ? <div style={s.empty}>Loading...</div> : summary && (
        <>
          <h2 style={s.sectionTitle}>Today</h2>
          <div style={{ ...s.grid, gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 32 }}>
            <StatCard label="Transactions" value={summary.today.transactions} />
            <StatCard label="Points Awarded" value={`$${Number(summary.today.pointsAwarded).toFixed(2)}`} color="#2DC653" />
            <StatCard label="Purchase Volume" value={`$${Number(summary.today.purchaseVolume).toFixed(2)}`} />
          </div>

          {summary.pending > 0 && (
            <div style={s.alertBox}>
              ⚠️ <strong>{summary.pending} transaction{summary.pending > 1 ? 's' : ''} pending</strong> — receipt not yet uploaded.
              <button style={s.alertLink} onClick={() => navigate('/transactions')}>Review →</button>
            </div>
          )}

          <h2 style={s.sectionTitle}>All Time</h2>
          <div style={{ ...s.grid, gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 32 }}>
            <StatCard label="Total Transactions" value={summary.allTime.transactions} />
            <StatCard label="Total Points Given" value={`$${Number(summary.allTime.pointsAwarded).toFixed(2)}`} color="#2DC653" />
            <StatCard label="Total Purchase Volume" value={`$${Number(summary.allTime.purchaseVolume).toFixed(2)}`} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ ...s.sectionTitle, margin: 0 }}>Recent Activity</h2>
            <button style={s.viewAllBtn} onClick={() => navigate('/transactions')}>View All →</button>
          </div>
          <div style={s.recentTable}>
            {summary.recent.length === 0 ? <div style={s.empty}>No transactions yet.</div> :
              summary.recent.map((tx: any) => (
                <div key={tx.id} style={s.recentRow}>
                  <div>
                    <div style={s.recentCustomer}>{tx.customer?.name || tx.customer?.phone}</div>
                    <div style={s.recentMeta}>by {tx.grantedBy?.name || '—'} · {format(new Date(tx.createdAt), 'MMM d, h:mm a')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#2DC653' }}>+${Number(tx.pointsAwarded).toFixed(2)}</div>
                    <span style={{ ...s.statusBadge, background: STATUS_COLORS[tx.status] }}>{tx.status}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}

// ── Admin / DevAdmin Dashboard ───────────────────────────────────────────────

function AdminDashboard({ isDevAdmin }: { isDevAdmin: boolean }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: revenueData } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => billingApi.getRevenue(),
    enabled: isDevAdmin,
  });
  const revenue = revenueData?.data?.data;

  return (
    <div style={s.container}>
      <h1 style={s.title}>Dashboard</h1>
      <p style={s.sub}>
        Welcome back, {user?.name || user?.phone} ·{' '}
        <span style={{ color: '#E63946', fontWeight: 600 }}>{user?.role?.replace(/_/g, ' ')}</span>
      </p>

      {isDevAdmin && revenue && (
        <>
          <h2 style={s.sectionTitle}>Revenue Overview</h2>
          <div style={{ ...s.grid, marginBottom: 40 }}>
            <StatCard label="Total Transactions" value={revenue.totalTransactions} />
            <StatCard label="Purchase Volume" value={`$${Number(revenue.totalPurchaseVolume || 0).toFixed(2)}`} />
            <StatCard label="Your Dev Cut" value={`$${Number(revenue.totalDevCutFromTransactions || 0).toFixed(2)}`} color="#2DC653" />
            <StatCard label="Subscription Revenue" value={`$${Number(revenue.totalSubscriptionRevenue || 0).toFixed(2)}`} color="#2DC653" />
          </div>
        </>
      )}

      <h2 style={s.sectionTitle}>Quick Actions</h2>
      <div style={s.actionGrid}>
        <ActionCard title="📢 Offers" desc="Create or manage promotions" onClick={() => navigate('/offers')} />
        <ActionCard title="🖼️ Banners" desc="Upload promotional banners" onClick={() => navigate('/banners')} />
        <ActionCard title="🧾 Transactions" desc="Review point grant activity" onClick={() => navigate('/transactions')} />
        <ActionCard title="👥 Staff" desc="Manage staff accounts" onClick={() => navigate('/staff')} />
        <ActionCard title="🙋 Customers" desc="View and manage customer accounts" onClick={() => navigate('/customers')} />
        {isDevAdmin && <ActionCard title="💳 Billing" desc="Manage store subscriptions" onClick={() => navigate('/billing')} />}
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = '#1D3557' }: { label: string; value: any; color?: string }) {
  return (
    <div style={s.statCard}>
      <p style={s.statLabel}>{label}</p>
      <p style={{ ...s.statValue, color }}>{value}</p>
    </div>
  );
}

function ActionCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={s.actionCard}>
      <h3 style={s.actionTitle}>{title}</h3>
      <p style={s.actionDesc}>{desc}</p>
    </button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#F4A261', APPROVED: '#2DC653', REJECTED: '#E63946',
};

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  title: { fontSize: 32, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4, marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#1D3557', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  statCard: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  statLabel: { color: '#6c757d', fontSize: 13, margin: 0, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 800, margin: 0 },
  alertBox: { background: '#fff8e1', border: '1px solid #f59e0b', borderRadius: 10, padding: '14px 18px', fontSize: 14, color: '#92400e', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 },
  alertLink: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 },
  actionCard: { background: '#fff', borderRadius: 12, padding: 24, textAlign: 'left', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #dee2e6', cursor: 'pointer' },
  actionTitle: { color: '#1D3557', margin: '0 0 8px', fontSize: 16 },
  actionDesc: { color: '#6c757d', margin: 0, fontSize: 14 },
  recentTable: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' },
  recentRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f0f0f0' },
  recentCustomer: { fontWeight: 600, color: '#1D3557', fontSize: 15 },
  recentMeta: { color: '#6c757d', fontSize: 12, marginTop: 2 },
  statusBadge: { color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 },
  viewAllBtn: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
};
