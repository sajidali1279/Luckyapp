import { useQuery } from '@tanstack/react-query';
import { billingApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Dashboard() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';

  const { data: revenueData } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => billingApi.getRevenue(),
    enabled: isDevAdmin,
  });

  const revenue = revenueData?.data?.data;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dashboard</h1>
      <p style={styles.welcome}>Welcome back, {user?.name || user?.phone}</p>

      {isDevAdmin && revenue && (
        <div style={styles.grid}>
          <StatCard label="Total Transactions" value={revenue.totalTransactions} />
          <StatCard label="Purchase Volume" value={`$${revenue.totalPurchaseVolume?.toFixed(2) || '0'}`} />
          <StatCard label="Your Dev Cut" value={`$${revenue.totalDevCutFromTransactions?.toFixed(2) || '0'}`} color="#2DC653" />
          <StatCard label="Subscription Revenue" value={`$${revenue.totalSubscriptionRevenue?.toFixed(2) || '0'}`} color="#2DC653" />
        </div>
      )}

      <div style={styles.quickActions}>
        <h2>Quick Actions</h2>
        <div style={styles.actionGrid}>
          <ActionCard title="📢 Push New Offer" desc="Create a promotion for one or all stores" href="/offers/new" />
          <ActionCard title="🖼️ Add Banner" desc="Upload a promotional banner" href="/banners/new" />
          <ActionCard title="🧾 View Transactions" desc="Review all point grant activity" href="/transactions" />
          {isDevAdmin && <ActionCard title="💳 Billing" desc="Manage store subscriptions and billing" href="/billing" />}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = '#1D3557' }: { label: string; value: any; color?: string }) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statLabel}>{label}</p>
      <p style={{ ...styles.statValue, color }}>{value}</p>
    </div>
  );
}

function ActionCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <a href={href} style={styles.actionCard}>
      <h3 style={styles.actionTitle}>{title}</h3>
      <p style={styles.actionDesc}>{desc}</p>
    </a>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  title: { fontSize: 32, fontWeight: 800, color: '#1D3557', margin: 0 },
  welcome: { color: '#6c757d', marginTop: 4, marginBottom: 32 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 },
  statCard: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  statLabel: { color: '#6c757d', fontSize: 13, margin: 0, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 800, margin: 0 },
  quickActions: { marginTop: 8 },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 16 },
  actionCard: {
    background: '#fff', borderRadius: 12, padding: 24, textDecoration: 'none',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'block',
    transition: 'transform 0.1s', border: '1px solid #dee2e6',
  },
  actionTitle: { color: '#1D3557', margin: 0, fontSize: 16 },
  actionDesc: { color: '#6c757d', margin: 0, marginTop: 8, fontSize: 14 },
};
