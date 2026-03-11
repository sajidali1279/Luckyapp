import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { billingApi, offersApi, bannersApi, customersApi, staffApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isDevAdmin = user?.role === 'DEV_ADMIN';

  const { data: revenueData } = useQuery({
    queryKey: ['revenue'],
    queryFn: () => billingApi.getRevenue(),
    enabled: isDevAdmin,
  });
  const { data: offersData } = useQuery({ queryKey: ['offers'], queryFn: () => offersApi.getActive() });
  const { data: bannersData } = useQuery({ queryKey: ['banners'], queryFn: () => bannersApi.getActive() });
  const { data: customersData } = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list() });
  const { data: staffData } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list() });

  const revenue = revenueData?.data?.data;
  const activeOffers = (offersData?.data?.data || []).length;
  const activeBanners = (bannersData?.data?.data || []).length;
  const totalCustomers = customersData?.data?.data?.total || 0;
  const totalStaff = (staffData?.data?.data || []).length;

  const QUICK_ACTIONS = [
    { icon: '📢', title: 'Offers', desc: 'Create & manage promotions', to: '/offers', color: '#E63946' },
    { icon: '🖼️', title: 'Banners', desc: 'Upload promotional banners', to: '/banners', color: '#1D3557' },
    { icon: '🧾', title: 'Transactions', desc: 'Review point grant activity', to: '/transactions', color: '#F4A261' },
    { icon: '👥', title: 'Staff', desc: 'Manage employee accounts', to: '/staff', color: '#2DC653' },
    { icon: '🙋', title: 'Customers', desc: 'View and manage customers', to: '/customers', color: '#457b9d' },
    ...(isDevAdmin ? [{ icon: '💳', title: 'Billing', desc: 'Manage store subscriptions', to: '/billing', color: '#6f42c1' }] : []),
  ];

  return (
    <div style={s.container}>
      {/* Welcome header */}
      <div style={s.welcomeCard}>
        <div>
          <h1 style={s.welcomeTitle}>{greeting()}, {user?.name?.split(' ')[0] || 'Admin'} 👋</h1>
          <p style={s.welcomeSub}>
            {isDevAdmin
              ? 'You have full access to all stores, billing, and system settings.'
              : 'Manage your 14 Lucky Stop locations from one place.'}
          </p>
        </div>
        <div style={{ ...s.roleBadge, ...(isDevAdmin ? s.roleBadgeDev : {}) }}>
          {isDevAdmin ? '⚡ Dev Admin' : '🏢 Super Admin'}
        </div>
      </div>

      {/* Dev Admin revenue stats */}
      {isDevAdmin && revenue && (
        <>
          <h2 style={s.sectionTitle}>Revenue Overview</h2>
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Total Transactions" value={revenue.totalTransactions} />
            <StatCard icon="💵" label="Purchase Volume" value={`$${Number(revenue.totalPurchaseVolume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            <StatCard icon="💰" label="Your Dev Cut" value={`$${Number(revenue.totalDevCutFromTransactions || 0).toFixed(2)}`} valueColor="#2DC653" />
            <StatCard icon="📋" label="Subscription Revenue" value={`$${Number(revenue.totalSubscriptionRevenue || 0).toFixed(2)}`} valueColor="#2DC653" />
          </div>
        </>
      )}

      {/* Platform stats */}
      <h2 style={s.sectionTitle}>Platform Overview</h2>
      <div style={s.statsGrid}>
        <StatCard icon="🏪" label="Active Stores" value="14" />
        <StatCard icon="🙋" label="Customers" value={totalCustomers} />
        <StatCard icon="👷" label="Staff Members" value={totalStaff} />
        <StatCard icon="📢" label="Active Offers" value={activeOffers} />
        <StatCard icon="🖼️" label="Active Banners" value={activeBanners} />
      </div>

      {/* Quick actions */}
      <h2 style={s.sectionTitle}>Quick Actions</h2>
      <div style={s.actionGrid}>
        {QUICK_ACTIONS.map((a) => (
          <button key={a.to} onClick={() => navigate(a.to)} style={s.actionCard}>
            <div style={{ ...s.actionIconBox, background: a.color + '18', color: a.color }}>
              {a.icon}
            </div>
            <div>
              <div style={s.actionTitle}>{a.title}</div>
              <div style={s.actionDesc}>{a.desc}</div>
            </div>
            <span style={s.actionArrow}>›</span>
          </button>
        ))}
      </div>
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
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },

  welcomeCard: {
    background: 'linear-gradient(135deg, #1D3557 0%, #2a4a73 100%)',
    borderRadius: 16, padding: '28px 32px', marginBottom: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 4px 20px rgba(29,53,87,0.25)',
  },
  welcomeTitle: { color: '#fff', fontSize: 26, fontWeight: 800, margin: 0 },
  welcomeSub: { color: 'rgba(255,255,255,0.65)', marginTop: 6, fontSize: 14 },
  roleBadge: {
    background: 'rgba(244,162,97,0.2)', color: '#F4A261',
    border: '1px solid rgba(244,162,97,0.4)',
    borderRadius: 20, padding: '8px 20px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
  },
  roleBadgeDev: { background: 'rgba(45,198,83,0.15)', color: '#2DC653', borderColor: 'rgba(45,198,83,0.3)' },

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
  statValue: { fontSize: 26, fontWeight: 800, marginTop: 2 },

  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  actionCard: {
    background: '#fff', borderRadius: 14, padding: '18px 20px',
    display: 'flex', alignItems: 'center', gap: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    border: '1px solid #f0f1f2',
    cursor: 'pointer', textAlign: 'left', width: '100%',
  },
  actionIconBox: {
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, flexShrink: 0,
  },
  actionTitle: { color: '#1D3557', fontWeight: 700, fontSize: 15 },
  actionDesc: { color: '#6c757d', fontSize: 13, marginTop: 2 },
  actionArrow: { color: '#dee2e6', fontSize: 24, marginLeft: 'auto', flexShrink: 0 },
};
