import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { billingApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Dashboard() {
  const { user } = useAuthStore();
  return <AdminDashboard isDevAdmin={user?.role === 'DEV_ADMIN'} />;
}

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

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  title: { fontSize: 32, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4, marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: '#1D3557', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  statCard: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  statLabel: { color: '#6c757d', fontSize: 13, margin: 0, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 800, margin: 0 },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 },
  actionCard: { background: '#fff', borderRadius: 12, padding: 24, textAlign: 'left', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #dee2e6', cursor: 'pointer' },
  actionTitle: { color: '#1D3557', margin: '0 0 8px', fontSize: 16 },
  actionDesc: { color: '#6c757d', margin: 0, fontSize: 14 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
};
