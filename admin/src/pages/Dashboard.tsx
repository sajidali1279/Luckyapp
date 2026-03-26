import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
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
  GAS: '⛽', DIESEL: '🚛', TOBACCO_VAPES: '🚬', HOT_FOODS: '🌮', OTHER: '🏪',
};

const CHART_COLORS = ['#1D3557', '#E63946', '#F4A261', '#2DC653', '#457b9d', '#6f42c1', '#fd7e14', '#20c997'];

export default function Dashboard() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  // Platform stats
  const { data: offersData, isLoading: loadingOffers } = useQuery({ queryKey: ['offers'], queryFn: () => offersApi.getActive() });
  const { data: bannersData, isLoading: loadingBanners } = useQuery({ queryKey: ['banners'], queryFn: () => bannersApi.getActive() });
  const { data: customersData, isLoading: loadingCustomers } = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list() });
  const { data: staffData, isLoading: loadingStaff } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list() });
  const { data: storesData, isLoading: loadingStores } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });

  // SuperAdmin platform summary
  const { data: platformData } = useQuery({
    queryKey: ['platform-summary'],
    queryFn: () => pointsApi.getPlatformSummary(),
    enabled: isSuperAdmin,
    refetchInterval: 60000,
  });

  // DevAdmin revenue & analytics
  const { data: revenueData } = useQuery({
    queryKey: ['revenue'], queryFn: () => billingApi.getRevenue(), enabled: isDevAdmin,
  });
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics-30d'], queryFn: () => billingApi.getAnalytics(), enabled: isDevAdmin,
  });
  const { data: ratesData } = useQuery({
    queryKey: ['category-rates'], queryFn: () => billingApi.getCategoryRates(), enabled: isDevAdmin,
  });

  const activeOffers = (offersData?.data?.data || []).length;
  const activeBanners = (bannersData?.data?.data || []).length;
  const totalCustomers = customersData?.data?.data?.total || 0;
  const totalStaff = (staffData?.data?.data || []).length;
  const activeStores = (storesData?.data?.data || []).length;
  const revenue = revenueData?.data?.data;
  const analytics = analyticsData?.data?.data;
  const categoryRates: { category: string; label: string; cashbackRate: number }[] = ratesData?.data?.data || [];
  const platform = platformData?.data?.data;

  return (
    <div style={s.container}>

      {/* ── Welcome ── */}
      <div style={s.welcomeCard}>
        <div>
          <h1 style={s.welcomeTitle}>{greeting()}, {user?.name?.split(' ')[0] || 'Admin'} 👋</h1>
          <p style={s.welcomeSub}>
            {isDevAdmin
              ? 'Full system access — billing, analytics, and platform settings.'
              : `Manage your ${loadingStores ? '…' : activeStores} Lucky Stop locations.`}
          </p>
        </div>
        <div style={{ ...s.roleBadge, ...(isDevAdmin ? s.roleBadgeDev : {}) }}>
          {isDevAdmin ? '⚡ Dev Admin' : '🏢 Super Admin'}
        </div>
      </div>

      {/* ── Revenue (DevAdmin only) ── */}
      {isDevAdmin && revenue && (
        <>
          <h2 style={s.section}>Revenue Overview</h2>
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Transactions" value={revenue.totalTransactions} />
            <StatCard icon="💵" label="Purchase Volume" value={fmt$(revenue.totalPurchaseVolume)} />
            <StatCard icon="⭐" label="Points Issued" value={fmt$(revenue.totalPointsAwarded)} />
            <StatCard icon="🎁" label="Credits Redeemed" value={fmt$(revenue.totalRedeemedAmount)} />
            <StatCard icon="💰" label="Dev Cut (cashback)" value={fmt$(revenue.totalDevCut)} valueColor="#2DC653" />
            <StatCard icon="📋" label="Subscription Revenue" value={fmt$(revenue.totalSubscriptionRevenue)} valueColor="#2DC653" />
          </div>
        </>
      )}

      {/* ── SuperAdmin Platform Summary ── */}
      {isSuperAdmin && platform && (
        <>
          <h2 style={s.section}>Today's Activity</h2>
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Today's Transactions" value={platform.today.transactions} />
            <StatCard icon="💵" label="Today's Volume" value={fmt$(platform.today.purchaseVolume)} />
            <StatCard icon="⭐" label="Today's Cashback" value={fmt$(platform.today.cashbackIssued)} />
            <StatCard
              icon="⏳"
              label="Pending Reviews"
              value={platform.pending}
              valueColor={platform.pending > 0 ? '#E63946' : '#2DC653'}
            />
            <StatCard icon="💰" label="Credits Outstanding" value={fmt$(platform.totalCreditsOutstanding)} valueColor="#F4A261" />
            <StatCard icon="📅" label="This Month Volume" value={fmt$(platform.thisMonth.purchaseVolume)} />
          </div>
        </>
      )}

      {/* ── Platform Overview ── */}
      <h2 style={s.section}>Platform Overview</h2>
      <div style={s.statsGrid}>
        <StatCard icon="🏪" label="Active Stores" value={loadingStores ? '…' : activeStores} />
        <StatCard icon="🙋" label="Customers" value={loadingCustomers ? '…' : totalCustomers} />
        <StatCard icon="👷" label="Staff Members" value={loadingStaff ? '…' : totalStaff} />
        <StatCard icon="📢" label="Active Offers" value={loadingOffers ? '…' : activeOffers} />
        <StatCard icon="🖼️" label="Active Banners" value={loadingBanners ? '…' : activeBanners} />
      </div>

      {/* ── Store Performance Table (SuperAdmin) ── */}
      {isSuperAdmin && platform?.storeRanking?.length > 0 && (
        <>
          <h2 style={s.section}>Store Performance — This Month</h2>
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
              return (
                <div key={store.id} style={{ ...s.storeTableRow, background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                  <span style={s.storeColName}>
                    <span style={s.storeRank}>#{i + 1}</span>
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
            })}
          </div>
        </>
      )}

      {/* ── Analytics Charts (DevAdmin only) ── */}
      {isDevAdmin && analytics && (
        <>
          <h2 style={s.section}>Last 30 Days — Activity</h2>
          <div style={s.chartsRow}>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Daily Transactions</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={analytics.daily} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Transactions']} labelFormatter={(l) => l} />
                  <Line type="monotone" dataKey="transactions" stroke="#1D3557" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Daily Dev Cut ($)</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={analytics.daily} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Dev Cut']} />
                  <Line type="monotone" dataKey="devCut" stroke="#2DC653" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {analytics.byCategory?.length > 0 && (
            <>
              <h2 style={s.section}>Purchase Volume by Category</h2>
              <div style={s.chartBoxFull}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.byCategory} layout="vertical" margin={{ left: 80, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} tickFormatter={(v) => v.replace('_', ' ')} width={80} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Purchase Volume']} />
                    <Bar dataKey="purchaseVolume" radius={[0, 4, 4, 0]}>
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

      {/* ── Category Cashback Rates (DevAdmin only) ── */}
      {isDevAdmin && categoryRates.length > 0 && (
        <>
          <h2 style={s.section}>Cashback Rates by Category</h2>
          <p style={s.sectionSub}>
            Set how much credit customers earn per purchase category. Dev cut is always 5% of redeemed credits.
          </p>
          <div style={s.ratesGrid}>
            {categoryRates.map((r) => (
              <CategoryRateCard
                key={r.category}
                category={r.category}
                label={r.label}
                rate={r.cashbackRate}
                icon={CAT_ICONS[r.category] || '🏪'}
                onSave={(rate) => {
                  billingApi.updateCategoryRate(r.category, rate)
                    .then(() => {
                      qc.invalidateQueries({ queryKey: ['category-rates'] });
                      toast.success(`${r.label} rate updated`);
                    })
                    .catch(() => toast.error('Failed to update rate'));
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const STAT_BG: Record<string, string> = {
  '🧾': '#eff6ff', '💵': '#f0fdf4', '⭐': '#fefce8', '🎁': '#fdf4ff',
  '💰': '#f0fdf4', '📋': '#f0f9ff', '🏪': '#eff6ff', '🙋': '#fdf4ff',
  '👷': '#fff7ed', '📢': '#fef2f2', '🖼️': '#f5f3ff', '⏳': '#fff7ed',
};

function StatCard({ icon, label, value, valueColor = '#111827' }: { icon: string; label: string; value: any; valueColor?: string }) {
  const bg = STAT_BG[icon] || '#f8fafc';
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statIconWrap, background: bg }}>
        <span style={s.statIcon}>{icon}</span>
      </div>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: valueColor }}>{value}</div>
    </div>
  );
}

function CategoryRateCard({ category: _category, label, rate, icon, onSave }: {
  category: string; label: string; rate: number; icon: string; onSave: (r: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String((rate * 100).toFixed(1)));

  function save() {
    const parsed = parseFloat(input);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) { toast.error('Enter a value between 0 and 100'); return; }
    onSave(parsed / 100);
    setEditing(false);
  }

  return (
    <div style={s.rateCard}>
      <div style={s.rateHeader}>
        <span style={s.rateIcon}>{icon}</span>
        <span style={s.rateLabel}>{label}</span>
      </div>
      {editing ? (
        <div style={s.rateEditRow}>
          <input
            style={s.rateInput}
            type="number" min="0" max="100" step="0.5"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <span style={s.ratePercent}>%</span>
          <button style={s.rateSaveBtn} onClick={save}>✓</button>
          <button style={s.rateCancelBtn} onClick={() => { setEditing(false); setInput(String((rate * 100).toFixed(1))); }}>✕</button>
        </div>
      ) : (
        <div style={s.rateDisplay} onClick={() => setEditing(true)}>
          <span style={s.rateValue}>{(rate * 100).toFixed(1)}%</span>
          <span style={s.rateEditHint}>cashback · click to edit</span>
        </div>
      )}
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

  section: { fontSize: 17, fontWeight: 700, color: '#1D3557', marginBottom: 6, marginTop: 0 },
  sectionSub: { fontSize: 13, color: '#6c757d', marginBottom: 16, marginTop: 0 },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 36 },
  statCard: {
    background: '#fff', borderRadius: 16, padding: '20px 18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 8,
    border: '1px solid #f0f1f2',
  },
  statIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  statIcon: { fontSize: 22 },
  statLabel: { color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 24, fontWeight: 800, letterSpacing: -0.5 },

  // Store performance table
  storeTable: {
    background: '#fff', borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2',
    marginBottom: 36,
  },
  storeTableHeader: {
    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr',
    padding: '10px 20px', background: '#f8f9fa',
    fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  storeTableRow: {
    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr',
    padding: '14px 20px', alignItems: 'center',
    borderTop: '1px solid #f0f1f2',
  },
  storeColName: { display: 'flex', alignItems: 'center', gap: 10 },
  storeColNum: { fontSize: 14, color: '#495057' },
  storeColBar: { paddingRight: 12 },
  storeRank: {
    fontSize: 11, fontWeight: 800, color: '#adb5bd',
    background: '#f8f9fa', borderRadius: 6, padding: '2px 7px', flexShrink: 0,
  },
  barTrack: { height: 8, background: '#f0f1f2', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: 'linear-gradient(90deg, #1D3557, #457b9d)', borderRadius: 4, transition: 'width 0.4s ease' },

  chartsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 },
  chartBox: { background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  chartBoxFull: { background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 28 },
  chartTitle: { fontSize: 13, fontWeight: 700, color: '#6c757d', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  ratesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 36 },
  rateCard: { background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  rateHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  rateIcon: { fontSize: 20 },
  rateLabel: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  rateDisplay: { cursor: 'pointer', padding: '8px 0' },
  rateValue: { fontSize: 26, fontWeight: 800, color: '#1D3557', display: 'block' },
  rateEditHint: { fontSize: 11, color: '#adb5bd', marginTop: 2 },
  rateEditRow: { display: 'flex', alignItems: 'center', gap: 6 },
  rateInput: {
    width: 70, fontSize: 20, fontWeight: 700, border: '2px solid #1D3557',
    borderRadius: 8, padding: '4px 8px', outline: 'none',
  },
  ratePercent: { fontSize: 18, color: '#6c757d', fontWeight: 700 },
  rateSaveBtn: { background: '#2DC653', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700 },
  rateCancelBtn: { background: '#f8f9fa', color: '#6c757d', border: '1px solid #dee2e6', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' },
};
