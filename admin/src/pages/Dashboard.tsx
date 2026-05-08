import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, AreaChart, Area,
} from 'recharts';
import { billingApi, offersApi, bannersApi, customersApi, staffApi, storesApi, pointsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmt$(n: number) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CAT_ICONS: Record<string, string> = {
  GROCERIES: '🛒', FROZEN_FOODS: '🧊', FRESH_FOODS: '🥗',
  GAS: '⛽', DIESEL: '🚛', TOBACCO_VAPES: '🚬', HOT_FOODS: '🌮', ALCOHOL: '🍺', OTHER: '🏪',
};

const CHART_COLORS = ['#1D3557', '#E63946', '#F4A261', '#2DC653', '#457b9d', '#6f42c1', '#fd7e14', '#20c997'];
const AVATAR_PALETTE = ['#E63946','#457B9D','#2DC653','#F4A261','#7B2FBE','#0077B6','#E76F51','#2A9D8F','#E9C46A','#264653','#6A0572','#1D3557'];
function storeColor(i: number) { return AVATAR_PALETTE[i % AVATAR_PALETTE.length]; }
const MEDALS = ['🥇', '🥈', '🥉'];

const STAT_BG: Record<string, string> = {
  '🧾': '#eff6ff', '💵': '#f0fdf4', '⭐': '#fefce8', '🎁': '#fdf4ff',
  '💰': '#f0fdf4', '📋': '#f0f9ff', '🏪': '#eff6ff', '🙋': '#fdf4ff',
  '👷': '#fff7ed', '📢': '#fef2f2', '🖼️': '#f5f3ff', '⏳': '#fff7ed', '📅': '#f0f9ff',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, valueColor = '#111827', to }: {
  icon: string; label: string; value: any; valueColor?: string; to?: string;
}) {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  const bg = STAT_BG[icon] || '#f8fafc';
  return (
    <div
      style={{ ...s.statCard, ...(hov ? s.statCardHov : {}), cursor: to ? 'pointer' : 'default' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => to && navigate(to)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ ...s.statIconWrap, background: bg }}>
          <span style={s.statIcon}>{icon}</span>
        </div>
        {to && <span style={{ ...s.statArrow, opacity: hov ? 1 : 0 }}>→</span>}
      </div>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: valueColor }}>{value}</div>
    </div>
  );
}

function QuickActions({ isDevAdmin }: { isDevAdmin: boolean }) {
  const navigate = useNavigate();
  const [hov, setHov] = useState<string | null>(null);
  const actions = isDevAdmin ? [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '🏪', label: 'Stores', to: '/stores' },
    { icon: '💳', label: 'Billing', to: '/billing' },
    { icon: '📈', label: 'Analytics', to: '/analytics' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ] : [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '👥', label: 'Staff', to: '/staff' },
    { icon: '🙋', label: 'Customers', to: '/customers' },
    { icon: '🏆', label: 'Leaderboard', to: '/leaderboard' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ];
  return (
    <div style={s.quickActions}>
      {actions.map(a => (
        <button
          key={a.to}
          style={{ ...s.quickBtn, ...(hov === a.to ? s.quickBtnHov : {}) }}
          onMouseEnter={() => setHov(a.to)}
          onMouseLeave={() => setHov(null)}
          onClick={() => navigate(a.to)}
        >
          <span style={{ fontSize: 15 }}>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: { label: string; to: string };
}) {
  const navigate = useNavigate();
  const [hov, setHov] = useState(false);
  return (
    <div style={s.sectionHeader}>
      <div>
        <h2 style={s.section}>{title}</h2>
        {subtitle && <p style={s.sectionSub}>{subtitle}</p>}
      </div>
      {action && (
        <button
          style={{ ...s.sectionLink, ...(hov ? s.sectionLinkHov : {}) }}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          onClick={() => navigate(action.to)}
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function StoreRow({ store, i, barWidth, color }: { store: any; i: number; barWidth: number; color: string }) {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  return (
    <div
      style={{ ...s.storeTableRow, background: hov ? '#f0f4ff' : (i % 2 === 0 ? '#fff' : '#fafbfc'), cursor: 'pointer' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => navigate('/leaderboard')}
    >
      <span style={s.storeColName}>
        <span style={s.storeRank}>{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
        <div style={{ ...s.storeAvatar, background: color }}>{store.name[0]?.toUpperCase()}</div>
        <span>
          <div style={{ fontWeight: 700, color: '#1D3557', fontSize: 14 }}>{store.name}</div>
          <div style={{ fontSize: 11, color: '#adb5bd' }}>{store.city}</div>
        </span>
      </span>
      <span style={s.storeColNum}>{store.transactions}</span>
      <span style={{ ...s.storeColNum, fontWeight: 700 }}>{fmt$(store.purchaseVolume)}</span>
      <span style={{ ...s.storeColNum, color: '#2DC653', fontWeight: 700 }}>{fmt$(store.cashbackIssued)}</span>
      <span style={s.storeColBar}>
        <div style={s.barTrack}>
          <div style={{ ...s.barFill, width: `${barWidth}%` }} />
        </div>
      </span>
    </div>
  );
}

function LiveRateCard({ r, bronzeBase }: { r: any; bronzeBase: number }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{ ...s.liveRateCard, ...(hov ? s.liveRateCardHov : {}) }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={s.liveRateTop}>
        <span style={s.liveRateIcon}>{CAT_ICONS[r.category] || '🏪'}</span>
        <span style={s.liveRateLabel}>{r.label}</span>
      </div>
      <div style={s.liveRateValue}>{(r.effectiveRate * 100).toFixed(1)}%</div>
      <div style={s.rateTrack}>
        <div style={{ ...s.rateFill, width: `${Math.min(r.effectiveRate * 500, 100)}%` }} />
      </div>
      <div style={s.liveRateBreakdown}>
        <span style={s.liveRateRow}>Base (Bronze): {(bronzeBase * 100).toFixed(1)}%</span>
        {r.catBonus > 0 && <span style={{ ...s.liveRateRow, color: '#457B9D' }}>Category: +{(r.catBonus * 100).toFixed(1)}%</span>}
        {r.promoBonus > 0 && <span style={{ ...s.liveRateRow, color: '#2DC653' }}>🎉 {r.promoTitle}: +{(r.promoBonus * 100).toFixed(1)}%</span>}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  const { data: offersData, isLoading: loadingOffers } = useQuery({ queryKey: ['offers'], queryFn: () => offersApi.getActive() });
  const { data: bannersData, isLoading: loadingBanners } = useQuery({ queryKey: ['banners'], queryFn: () => bannersApi.getActive() });
  const { data: customersData, isLoading: loadingCustomers } = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list() });
  const { data: staffData, isLoading: loadingStaff } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list() });
  const { data: storesData, isLoading: loadingStores } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });

  const { data: platformData } = useQuery({
    queryKey: ['platform-summary'],
    queryFn: () => pointsApi.getPlatformSummary(),
    enabled: isSuperAdmin,
    refetchInterval: 60000,
  });

  const { data: revenueData } = useQuery({ queryKey: ['revenue'], queryFn: () => billingApi.getRevenue(), enabled: isDevAdmin });
  const { data: analyticsData } = useQuery({ queryKey: ['analytics-30d'], queryFn: () => billingApi.getAnalytics(), enabled: isDevAdmin });
  const { data: ratesData } = useQuery({ queryKey: ['category-rates'], queryFn: () => billingApi.getCategoryRates(), enabled: isDevAdmin });
  const { data: tierRatesData } = useQuery({ queryKey: ['tier-rates'], queryFn: () => billingApi.getTierRates(), enabled: isDevAdmin });

  const activeOffersCount = (offersData?.data?.data || []).length;
  const activeBanners = (bannersData?.data?.data || []).length;
  const totalCustomers = customersData?.data?.data?.total || 0;
  const totalStaff = (staffData?.data?.data || []).length;
  const activeStores = (storesData?.data?.data || []).length;
  const revenue = revenueData?.data?.data;
  const analytics = analyticsData?.data?.data;
  const categoryRates: { category: string; label: string; cashbackRate: number }[] = ratesData?.data?.data || [];
  const tierRatesList: { tier: string; cashbackRate: number }[] = tierRatesData?.data?.data || [];
  const activeOffersList: any[] = offersData?.data?.data || [];
  const platform = platformData?.data?.data;

  const bronzeBase = tierRatesList.find(r => r.tier === 'BRONZE')?.cashbackRate ?? 0.01;
  const now = new Date();
  const liveRates = categoryRates.map(r => {
    const catBonus = r.cashbackRate ?? 0;
    const promo = activeOffersList.find((o: any) => {
      const notExpired = new Date(o.startDate) <= now && new Date(o.endDate) >= now;
      const matchesCat = o.category === null || o.category === r.category;
      return notExpired && o.isActive && o.bonusRate != null && matchesCat;
    });
    const promoBonus = promo?.bonusRate ?? 0;
    return { ...r, catBonus, promoBonus, promoTitle: promo?.title ?? null, effectiveRate: bronzeBase + catBonus + promoBonus };
  });

  return (
    <div style={s.container}>

      {/* ── Welcome ── */}
      <div style={s.welcomeCard}>
        <div>
          <div style={s.welcomeDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={s.welcomeTitle}>{greeting()}, {user?.name?.split(' ')[0] || 'Admin'} 👋</h1>
          <p style={s.welcomeSub}>
            {isDevAdmin
              ? 'Full system access — billing, analytics, and platform settings.'
              : `Managing ${loadingStores ? '…' : activeStores} Lucky Stop locations across the network.`}
          </p>
        </div>
        <div style={{ ...s.roleBadge, ...(isDevAdmin ? s.roleBadgeDev : {}) }}>
          {isDevAdmin ? '⚡ Dev Admin' : '🏢 Super Admin'}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      {isSuperAdmin && <QuickActions isDevAdmin={isDevAdmin} />}

      {/* ── Revenue (DevAdmin only) ── */}
      {isDevAdmin && revenue && (
        <>
          <SectionHeader title="Revenue Overview" action={{ label: 'View Billing', to: '/billing' }} />
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Transactions" value={revenue.totalTransactions} to="/transactions" />
            <StatCard icon="💵" label="Purchase Volume" value={fmt$(revenue.totalPurchaseVolume)} />
            <StatCard icon="⭐" label="Points Issued" value={fmt$(revenue.totalPointsAwarded)} />
            <StatCard icon="🎁" label="Credits Redeemed" value={fmt$(revenue.totalRedeemedAmount)} />
            <StatCard icon="💰" label="Dev Cut (cashback)" value={fmt$(revenue.totalDevCut)} valueColor="#2DC653" to="/billing" />
            <StatCard icon="📋" label="Subscription Revenue" value={fmt$(revenue.totalSubscriptionRevenue)} valueColor="#2DC653" to="/billing" />
          </div>
        </>
      )}

      {/* ── SuperAdmin Platform Summary ── */}
      {isSuperAdmin && platform && (
        <>
          <SectionHeader title="Today's Activity" action={{ label: 'View Transactions', to: '/transactions' }} />
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Today's Transactions" value={platform.today.transactions} to="/transactions" />
            <StatCard icon="💵" label="Today's Volume" value={fmt$(platform.today.purchaseVolume)} />
            <StatCard icon="⭐" label="Today's Cashback" value={fmt$(platform.today.cashbackIssued)} />
            <StatCard
              icon="⏳" label="Pending Reviews" value={platform.pending}
              valueColor={platform.pending > 0 ? '#E63946' : '#2DC653'} to="/transactions"
            />
            <StatCard icon="💰" label="Credits Outstanding" value={fmt$(platform.totalCreditsOutstanding)} valueColor="#F4A261" />
            <StatCard icon="📅" label="This Month Volume" value={fmt$(platform.thisMonth.purchaseVolume)} />
          </div>
        </>
      )}

      {/* ── Platform Overview ── */}
      <SectionHeader title="Platform Overview" />
      <div style={s.statsGrid}>
        <StatCard icon="🏪" label="Active Stores" value={loadingStores ? '…' : activeStores} to="/stores" />
        <StatCard icon="🙋" label="Customers" value={loadingCustomers ? '…' : totalCustomers} to="/customers" />
        <StatCard icon="👷" label="Staff Members" value={loadingStaff ? '…' : totalStaff} to="/staff" />
        <StatCard icon="📢" label="Active Offers" value={loadingOffers ? '…' : activeOffersCount} to="/offers" />
        <StatCard icon="🖼️" label="Active Banners" value={loadingBanners ? '…' : activeBanners} to="/banners" />
      </div>

      {/* ── Store Performance (SuperAdmin) ── */}
      {isSuperAdmin && platform?.storeRanking?.length > 0 && (
        <>
          <SectionHeader title="Store Performance — This Month" action={{ label: 'Full Leaderboard', to: '/leaderboard' }} />
          <div style={s.storeTable}>
            <div style={s.storeTableHeader}>
              <span style={s.storeColName}>Store</span>
              <span style={s.storeColNum}>Transactions</span>
              <span style={s.storeColNum}>Purchase Volume</span>
              <span style={s.storeColNum}>Cashback Issued</span>
              <span style={s.storeColBar}>Activity</span>
            </div>
            {platform.storeRanking.map((store: any, i: number) => {
              const maxVol = platform.storeRanking[0]?.purchaseVolume || 1;
              const barWidth = Math.max(4, (store.purchaseVolume / maxVol) * 100);
              return <StoreRow key={store.id} store={store} i={i} barWidth={barWidth} color={storeColor(i)} />;
            })}
          </div>
        </>
      )}

      {/* ── Analytics Charts (DevAdmin only) ── */}
      {isDevAdmin && analytics && (
        <>
          <SectionHeader title="Last 30 Days — Activity" action={{ label: 'Full Analytics', to: '/analytics' }} />
          <div style={s.chartsRow}>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Daily Transactions</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analytics.daily} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1D3557" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#1D3557" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Transactions']} labelFormatter={(l) => l} />
                  <Area type="monotone" dataKey="transactions" stroke="#1D3557" strokeWidth={2} fill="url(#txGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Daily Dev Cut ($)</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analytics.daily} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="devGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2DC653" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#2DC653" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Dev Cut']} />
                  <Area type="monotone" dataKey="devCut" stroke="#2DC653" strokeWidth={2} fill="url(#devGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {analytics.byCategory?.length > 0 && (
            <>
              <SectionHeader title="Purchase Volume by Category" />
              <div style={s.chartBoxFull}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.byCategory} layout="vertical" margin={{ left: 80, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} tickFormatter={(v) => v.replace('_', ' ')} width={80} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Purchase Volume']} />
                    <Bar dataKey="purchaseVolume" radius={[0, 6, 6, 0]}>
                      {analytics.byCategory.map((_: any, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Live Cashback Rates (DevAdmin only) ── */}
      {isDevAdmin && liveRates.length > 0 && (
        <>
          <SectionHeader
            title="Live Cashback Rates Today"
            subtitle="Effective rate each Bronze customer earns per category right now — tier base + category bonus + active promotions."
            action={{ label: 'Edit Rates', to: '/rates' }}
          />
          <div style={s.ratesGrid}>
            {liveRates.map((r) => <LiveRateCard key={r.category} r={r} bronzeBase={bronzeBase} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: '28px 32px', maxWidth: 1200, margin: '0 auto' },

  welcomeCard: {
    background: 'linear-gradient(135deg, #12202f 0%, #1D3557 55%, #2a4a73 100%)',
    borderRadius: 20, padding: '32px 36px', marginBottom: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 4px 28px rgba(29,53,87,0.32)',
    position: 'relative', overflow: 'hidden',
  },
  welcomeDate: {
    color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8,
  },
  welcomeTitle: { color: '#fff', fontSize: 28, fontWeight: 900, margin: 0 },
  welcomeSub: { color: 'rgba(255,255,255,0.58)', marginTop: 8, fontSize: 14, lineHeight: 1.6, margin: '8px 0 0' },
  roleBadge: {
    background: 'rgba(244,162,97,0.18)', color: '#F4A261',
    border: '1px solid rgba(244,162,97,0.35)',
    borderRadius: 24, padding: '10px 22px', fontWeight: 700, fontSize: 14,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  roleBadgeDev: { background: 'rgba(45,198,83,0.15)', color: '#2DC653', borderColor: 'rgba(45,198,83,0.3)' },

  quickActions: { display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' as const },
  quickBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#fff', border: '1px solid #e9ecef',
    borderRadius: 10, padding: '8px 16px',
    fontSize: 13, fontWeight: 600, color: '#374151',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: 'all 0.15s ease',
  },
  quickBtnHov: {
    background: '#1D3557', color: '#fff', borderColor: '#1D3557',
    boxShadow: '0 4px 14px rgba(29,53,87,0.22)', transform: 'translateY(-1px)',
  },

  sectionHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14, marginTop: 8,
  },
  section: {
    fontSize: 15, fontWeight: 800, color: '#1D3557', margin: 0,
    borderLeft: '4px solid #E63946', paddingLeft: 12,
  },
  sectionSub: { fontSize: 12, color: '#6c757d', marginTop: 6, marginBottom: 0, paddingLeft: 16 },
  sectionLink: {
    background: 'none', border: '1px solid #dee2e6', borderRadius: 8,
    padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    color: '#6c757d', transition: 'all 0.15s ease', whiteSpace: 'nowrap' as const,
    alignSelf: 'flex-start', marginTop: 2,
  },
  sectionLinkHov: { background: '#1D3557', color: '#fff', borderColor: '#1D3557' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 32 },
  statCard: {
    background: '#fff', borderRadius: 16, padding: '18px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    display: 'flex', flexDirection: 'column', gap: 8,
    border: '1px solid #f0f1f2', transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
  },
  statCardHov: {
    transform: 'translateY(-3px)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.1)',
    borderColor: '#dde3f0',
  },
  statIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  statIcon: { fontSize: 20 },
  statArrow: { fontSize: 15, color: '#9ca3af', fontWeight: 700, transition: 'opacity 0.15s ease' },
  statLabel: { color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 24, fontWeight: 800, letterSpacing: -0.5 },

  storeTable: {
    background: '#fff', borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2', marginBottom: 32,
  },
  storeTableHeader: {
    display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 1fr 1.2fr',
    padding: '10px 20px', background: '#f8f9fa',
    fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  storeTableRow: {
    display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 1fr 1.2fr',
    padding: '13px 20px', alignItems: 'center',
    borderTop: '1px solid #f0f1f2', transition: 'background 0.12s ease',
  },
  storeColName: { display: 'flex', alignItems: 'center', gap: 8 },
  storeColNum: { fontSize: 14, color: '#495057' },
  storeColBar: { paddingRight: 12 },
  storeRank: { fontSize: 16, width: 26, textAlign: 'center' as const, flexShrink: 0 },
  storeAvatar: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 12, fontWeight: 800,
  },
  barTrack: { height: 7, background: '#f0f1f2', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: 'linear-gradient(90deg, #E63946, #1D3557)', borderRadius: 4, transition: 'width 0.6s ease' },

  chartsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 },
  chartBox: {
    background: '#fff', borderRadius: 16, padding: '20px 20px 12px',
    border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  chartBoxFull: {
    background: '#fff', borderRadius: 16, padding: '20px 20px 12px',
    border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 28,
  },
  chartTitle: { fontSize: 12, fontWeight: 700, color: '#6c757d', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  ratesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 36 },
  liveRateCard: {
    background: '#fff', borderRadius: 14, padding: '16px 18px',
    border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  liveRateCardHov: { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(0,0,0,0.08)' },
  liveRateTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  liveRateIcon: { fontSize: 20 },
  liveRateLabel: { fontWeight: 700, fontSize: 13, color: '#1D3557' },
  liveRateValue: { fontSize: 30, fontWeight: 900, color: '#1D3557', marginBottom: 8, letterSpacing: -1 },
  rateTrack: { height: 5, background: '#f0f1f2', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  rateFill: { height: '100%', background: 'linear-gradient(90deg, #E63946, #1D3557)', borderRadius: 3 },
  liveRateBreakdown: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  liveRateRow: { fontSize: 11, color: '#6c757d' },
};
