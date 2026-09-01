import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, AreaChart, Area,
} from 'recharts';
import { billingApi, offersApi, bannersApi, customersApi, staffApi, storesApi, pointsApi, disputesApi, labelsApi } from '../services/api';
import GlobalSearch from '../components/GlobalSearch';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { handleGlowMove, TRANSITION_FAST, TRANSITION_TRANSFORM } from '../lib/motion';
import ErrorState from '../components/ErrorState';
import NoticeBanner, { usePinnedNotice } from '../components/NoticeBanner';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

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
  GAS: '⛽', DIESEL: '🚛', HOT_FOODS: '🌮', OTHER: '🏪',
};

const CHART_COLORS = [PRIMARY, '#E63946', '#F4A261', '#2DC653', '#457b9d', '#6f42c1', '#fd7e14', '#20c997'];
const AVATAR_PALETTE = ['#E63946','#457B9D','#2DC653','#F4A261','#7B2FBE','#0077B6','#E76F51','#2A9D8F','#E9C46A','#264653','#6A0572',PRIMARY];
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
  const navigate = useNavigate();
  const bg = STAT_BG[icon] || '#f8fafc';
  return (
    <div
      className="dash-card"
      style={{ ...s.statCard, cursor: to ? 'pointer' : 'default' }}
      onMouseMove={handleGlowMove}
      onClick={() => to && navigate(to)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ ...s.statIconWrap, background: bg }}>
          <span style={s.statIcon}>{icon}</span>
        </div>
        {to && <span className="dash-stat-arrow" style={s.statArrow}>→</span>}
      </div>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: valueColor }}>{value}</div>
    </div>
  );
}

function QuickActions({ isDevAdmin }: { isDevAdmin: boolean }) {
  const navigate = useNavigate();
  const actions = isDevAdmin ? [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '⚠️', label: 'Disputes', to: '/customers?tab=disputes' },
    { icon: '🏪', label: 'Stores', to: '/stores' },
    { icon: '💳', label: 'Billing', to: '/billing' },
    { icon: '📈', label: 'Analytics', to: '/analytics' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ] : [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '⚠️', label: 'Disputes', to: '/customers?tab=disputes' },
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
          className="dash-quick-btn"
          style={s.quickBtn}
          onMouseMove={handleGlowMove}
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
  return (
    <div style={s.sectionHeader}>
      <div>
        <h2 style={s.section}>{title}</h2>
        {subtitle && <p style={s.sectionSub}>{subtitle}</p>}
      </div>
      {action && (
        <button
          className="dash-section-link"
          style={s.sectionLink}
          onClick={() => navigate(action.to)}
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

function StoreRow({ store, i, barWidth, color }: { store: any; i: number; barWidth: number; color: string }) {
  const navigate = useNavigate();
  return (
    <div
      className="dash-table-row"
      style={{ ...s.storeTableRow, cursor: 'pointer', '--row-bg': i % 2 === 0 ? '#fff' : '#fafbfc' } as React.CSSProperties}
      onClick={() => navigate('/leaderboard')}
    >
      <span style={s.storeColName}>
        <span style={s.storeRank}>{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
        <div style={{ ...s.storeAvatar, background: color }}>{store.name[0]?.toUpperCase()}</div>
        <span>
          <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 14 }}>{store.name}</div>
          <div style={{ fontSize: 13, color: TEXT_MUTED }}>{store.city}</div>
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

type CashbackCategoryHealth = {
  category: string; cashbackIssued: number; purchaseVolume: number; ratio: number;
  status: 'ok' | 'warn' | 'critical';
};
type CashbackStoreHealth = {
  storeId: string; storeName: string; cashbackIssued: number; purchaseVolume: number;
  ratio: number; status: 'ok' | 'warn' | 'critical'; categories: CashbackCategoryHealth[];
};

const HEALTH_STATUS_META: Record<'ok' | 'warn' | 'critical', { label: string; color: string; bg: string; border: string }> = {
  ok:       { label: '✅ OK',       color: '#2DC653', bg: 'rgba(45,198,83,0.08)',  border: 'rgba(45,198,83,0.3)' },
  warn:     { label: '⚠️ Warn',     color: '#F4A261', bg: 'rgba(244,162,97,0.08)', border: 'rgba(244,162,97,0.3)' },
  critical: { label: '🚨 Critical', color: '#E63946', bg: 'rgba(230,57,70,0.08)',  border: 'rgba(230,57,70,0.3)' },
};

function CashbackHealthCard() {
  const [expandedStore, setExpandedStore] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cashback-health'],
    queryFn: () => billingApi.getCashbackHealth(),
    staleTime: 5 * 60_000,
  });

  // Quietly hide on error — this is a passive health indicator, not a critical-path
  // feature; a failed fetch shouldn't show a scary error box on the main Dashboard.
  if (isError) return null;

  const stores: CashbackStoreHealth[] = data?.data?.data ?? [];
  const problemStores = stores
    .filter(s => s.status !== 'ok' || s.categories.some(c => c.status !== 'ok'))
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div>
      <SectionHeader title="Cashback Health" subtitle="Cashback paid out vs. sales, trailing 30 days" />
      {isLoading ? (
        <div style={s.healthLoading}>Checking cashback health…</div>
      ) : problemStores.length === 0 ? (
        <div style={s.healthOk}>✅ All stores within cashback target</div>
      ) : (
        <div style={s.healthList}>
          {problemStores.map(store => {
            const meta = HEALTH_STATUS_META[store.status];
            const isOpen = expandedStore === store.storeId;
            return (
              <div
                key={store.storeId}
                className="dash-card"
                style={{ ...s.healthRow, borderColor: meta.border, background: meta.bg }}
                onMouseMove={handleGlowMove}
              >
                <div style={s.healthRowHeader} onClick={() => setExpandedStore(isOpen ? null : store.storeId)}
                  role="button" tabIndex={0} aria-expanded={isOpen}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpandedStore(isOpen ? null : store.storeId)}>
                  <div style={s.healthRowName}>{isOpen ? '▾' : '▸'} {store.storeName}</div>
                  <div style={s.healthRowStats}>
                    <span style={s.healthStat}>{fmt$(store.purchaseVolume)} sold</span>
                    <span style={s.healthStat}>{fmt$(store.cashbackIssued)} cashback</span>
                    <span style={{ ...s.healthPill, color: meta.color, borderColor: meta.border }}>
                      {meta.label} · {(store.ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                {isOpen && (
                  <div style={s.healthCategoryList}>
                    {store.categories.map(cat => {
                      const catMeta = HEALTH_STATUS_META[cat.status];
                      return (
                        <div key={cat.category} style={s.healthCategoryRow}>
                          <span style={s.healthCategoryName}>{cat.category.replace(/_/g, ' ')}</span>
                          <span style={s.healthStat}>{fmt$(cat.purchaseVolume)} sold</span>
                          <span style={s.healthStat}>{fmt$(cat.cashbackIssued)} cashback</span>
                          <span style={{ color: catMeta.color, fontWeight: 700, fontSize: 13 }}>
                            {catMeta.label} · {(cat.ratio * 100).toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttentionBanner({ pending, disputes }: { pending: number; disputes: number }) {
  const navigate = useNavigate();
  const items = [];
  if (pending > 0) items.push({ label: `${pending} transaction${pending > 1 ? 's' : ''} awaiting review`, to: '/transactions', color: '#E63946' });
  if (disputes > 0) items.push({ label: `${disputes} open dispute${disputes > 1 ? 's' : ''}`, to: '/customers?tab=disputes', color: '#F4A261' });
  if (!items.length) return null;
  return (
    <div style={s.attnBanner}>
      <span style={s.attnIcon}>⚠️</span>
      <div style={s.attnBody}>
        <span style={s.attnTitle}>Needs your attention</span>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginTop: 4 }}>
          {items.map(item => (
            <button key={item.to + item.label} onClick={() => navigate(item.to)}
              style={{ ...s.attnLink, color: item.color, border: `1px solid ${item.color}44` }}>
              {item.label} →
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, sub, color = PRIMARY, bg = '#eff6ff', icon }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string; icon: string;
}) {
  return (
    <div className="dash-card" style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }} onMouseMove={handleGlowMove}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ ...s.kpiIconWrap, background: bg }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: -0.5, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ActiveOffersPanel({ offers, banners }: { offers: any[]; banners: any[] }) {
  const navigate = useNavigate();
  const now = new Date();
  const liveOffers = offers.filter((o: any) => o.isActive && new Date(o.startDate) <= now && new Date(o.endDate) >= now);
  const liveBanners = banners.filter((b: any) => b.isActive);
  return (
    <div style={s.offersPanel}>
      <div style={s.offersPanelHeader}>
        <span style={s.offersPanelTitle}>Active Promotions</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/offers')} style={s.sectionLink}>Manage Offers →</button>
          <button onClick={() => navigate('/banners')} style={s.sectionLink}>Manage Banners →</button>
        </div>
      </div>
      {liveOffers.length === 0 && liveBanners.length === 0 ? (
        <div style={s.emptyState}>No active offers or banners right now.</div>
      ) : (
        <div style={s.offersGrid}>
          {liveOffers.slice(0, 4).map((o: any) => (
            <div key={o.id} style={s.offerChip}>
              <div style={s.offerChipTop}>
                <span style={s.offerChipBadge}>OFFER</span>
                {o.bonusRate != null && (
                  <span style={s.offerChipRate}>+{(o.bonusRate * 100).toFixed(0)}%</span>
                )}
              </div>
              <div style={s.offerChipName}>{o.title}</div>
              {o.category && <div style={s.offerChipCat}>{o.category.replace(/_/g, ' ')}</div>}
              <div style={s.offerChipExpiry}>Ends {new Date(o.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>
          ))}
          {liveBanners.slice(0, 2).map((b: any) => (
            <div key={b.id} style={{ ...s.offerChip, border: '1.5px solid #7c3aed22', background: '#faf5ff' }}>
              <div style={s.offerChipTop}>
                <span style={{ ...s.offerChipBadge, background: '#7c3aed', color: '#fff' }}>BANNER</span>
              </div>
              <div style={s.offerChipName}>{b.title}</div>
              {b.storeId && <div style={s.offerChipCat}>Store-specific</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentTransactions({ txs }: { txs: any[] }) {
  const navigate = useNavigate();
  if (!txs.length) return null;
  const STATUS_DOT: Record<string, string> = {
    APPROVED: '#2DC653', PENDING: '#F4A261', REJECTED: '#5a6472', FLAGGED: '#E63946',
  };
  return (
    <div style={s.recentPanel}>
      <div style={s.offersPanelHeader}>
        <span style={s.offersPanelTitle}>Recent Transactions</span>
        <button onClick={() => navigate('/transactions')} style={s.sectionLink}>View all →</button>
      </div>
      <div>
        {txs.map((tx: any) => (
          <div key={tx.id} style={s.recentRow}>
            <div style={{ ...s.recentDot, background: STATUS_DOT[tx.status] || '#dee2e6' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.recentCustomer}>{tx.customer?.name || tx.customer?.phone || 'Customer'}</div>
              <div style={s.recentMeta}>{tx.store?.name} · {tx.category?.replace(/_/g, ' ') || ' - '}</div>
            </div>
            <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
              <div style={s.recentAmount}>{fmt$(tx.purchaseAmount)}</div>
              <div style={s.recentTime}>
                {new Date(tx.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
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
  const { notice: pinnedNotice, dismiss: dismissNotice } = usePinnedNotice();

  const { data: offersData, isLoading: loadingOffers, isError: offersError, refetch: refetchOffers } = useQuery({ queryKey: ['offers'], queryFn: () => offersApi.getActive() });
  const { data: bannersData, isLoading: loadingBanners, isError: bannersError, refetch: refetchBanners } = useQuery({ queryKey: ['banners'], queryFn: () => bannersApi.getActive() });
  const { data: customersData, isLoading: loadingCustomers, isError: customersError, refetch: refetchCustomers } = useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list() });
  const { data: staffData, isLoading: loadingStaff, isError: staffError, refetch: refetchStaff } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list() });
  const { data: storesData, isLoading: loadingStores, isError: storesError, refetch: refetchStores } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });
  const kpiError = offersError || bannersError || customersError || staffError || storesError;
  const refetchKpis = () => { refetchOffers(); refetchBanners(); refetchCustomers(); refetchStaff(); refetchStores(); };

  const { data: labelHealthData, isLoading: loadingLabelHealth } = useQuery({
    queryKey: ['labels-health-summary'],
    queryFn: () => labelsApi.getHealthSummary(),
  });
  const totalStaleLabels = labelHealthData?.data?.data?.totalStale ?? 0;
  const storesWithStaleLabels = labelHealthData?.data?.data?.storesWithStale ?? 0;

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

  const thirtyDaysAgo = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString(); }, []);
  const { data: trendRaw } = useQuery({
    queryKey: ['sa-trend-30d'],
    queryFn: () => pointsApi.getAllTransactions({ limit: '500', from: thirtyDaysAgo }),
    enabled: isSuperAdmin && !isDevAdmin,
    refetchInterval: 300_000,
  });
  const { data: disputesRaw } = useQuery({
    queryKey: ['sa-disputes-pending'],
    queryFn: () => disputesApi.getAll({ status: 'PENDING' }),
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
  });

  const trend30 = useMemo(() => {
    const txs: any[] = trendRaw?.data?.data?.transactions || [];
    const byDate: Record<string, { volume: number; count: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      byDate[d.toISOString().slice(0, 10)] = { volume: 0, count: 0 };
    }
    txs.forEach((tx: any) => {
      const key = new Date(tx.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) { byDate[key].volume += tx.purchaseAmount || 0; byDate[key].count += 1; }
    });
    return Object.entries(byDate).map(([date, d]) => ({
      date: date.slice(5), volume: +d.volume.toFixed(2), count: d.count,
    }));
  }, [trendRaw]);

  const recentTxs: any[] = useMemo(() => {
    const txs: any[] = trendRaw?.data?.data?.transactions || [];
    return [...txs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);
  }, [trendRaw]);

  const pendingDisputesCount: number = (disputesRaw?.data?.data || []).length;

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
      <div className="dash-fade-in" style={{ ...s.welcomeCard, animationDelay: '0ms' }}>
        <div>
          <div style={s.welcomeDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={s.welcomeTitle}>{greeting()}, {user?.name?.split(' ')[0] || 'Admin'} 👋</h1>
          <p style={s.welcomeSub}>
            {isDevAdmin
              ? 'Full system access - billing, analytics, and platform settings.'
              : `Managing ${loadingStores ? '…' : activeStores} Lucky Stop locations across the network.`}
          </p>
        </div>
        <div style={{ ...s.roleBadge, ...(isDevAdmin ? s.roleBadgeDev : {}) }}>
          {isDevAdmin ? '⚡ Dev Admin' : '🏢 Super Admin'}
        </div>
      </div>

      {/* ── Global Search ── */}
      <div className="dash-fade-in" style={{ animationDelay: '5ms' }}>
        <GlobalSearch />
      </div>

      {/* ── Pinned Notice ── */}
      {pinnedNotice && (
        <div className="dash-fade-in" style={{ animationDelay: '15ms' }}>
          <NoticeBanner notice={pinnedNotice} onDismiss={() => dismissNotice(pinnedNotice.id)} />
        </div>
      )}

      {/* ── KPI load failure ── */}
      {kpiError && (
        <div className="dash-fade-in" style={{ animationDelay: '30ms' }}>
          <ErrorState message="Some dashboard data failed to load." onRetry={refetchKpis} />
        </div>
      )}

      {/* ── Quick Actions ── */}
      {isSuperAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '60ms' }}>
          <QuickActions isDevAdmin={isDevAdmin} />
        </div>
      )}

      {/* ── Attention banner (shared: DevAdmin + SuperAdmin) ── */}
      {isSuperAdmin && ((platform?.pending ?? 0) > 0 || pendingDisputesCount > 0) && (
        <div className="dash-fade-in" style={{ animationDelay: '90ms' }}>
          <AttentionBanner pending={platform?.pending ?? 0} disputes={pendingDisputesCount} />
        </div>
      )}

      {/* ── Revenue (DevAdmin only) ── */}
      {isDevAdmin && revenue && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          <SectionHeader title="Revenue Overview" action={{ label: 'View Billing', to: '/billing' }} />
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Transactions" value={revenue.totalTransactions} to="/transactions" />
            <StatCard icon="💵" label="Purchase Volume" value={fmt$(revenue.totalPurchaseVolume)} />
            <StatCard icon="⭐" label="Points Issued" value={fmt$(revenue.totalPointsAwarded)} />
            <StatCard icon="🎁" label="Credits Redeemed" value={fmt$(revenue.totalRedeemedAmount)} />
            <StatCard icon="💰" label="Dev Cut (cashback)" value={fmt$(revenue.totalDevCut)} valueColor="#2DC653" to="/billing" />
            <StatCard icon="📋" label="Subscription Revenue" value={fmt$(revenue.totalSubscriptionRevenue)} valueColor="#2DC653" to="/billing" />
          </div>
        </div>
      )}

      {/* ── Cashback Health (DevAdmin only) ── */}
      {isDevAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '150ms' }}>
          <CashbackHealthCard />
        </div>
      )}

      {/* ── Labels health (DevAdmin only — SuperAdmin gets the same card
           further down, in the shared Platform Overview grid) ── */}
      {isDevAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '165ms' }}>
          <SectionHeader title="Shelf Labels" />
          <div style={s.statsGrid}>
            <StatCard
              icon="🏷️" label="Labels Needing Print"
              value={loadingLabelHealth ? '…' : totalStaleLabels}
              valueColor={totalStaleLabels > 0 ? '#b7791f' : undefined}
              to="/labels?tab=health"
            />
          </div>
          {storesWithStaleLabels > 0 && (
            <div style={s.dashboardHint}>
              {storesWithStaleLabels} store{storesWithStaleLabels === 1 ? '' : 's'} {storesWithStaleLabels === 1 ? 'has' : 'have'} labels behind
            </div>
          )}
        </div>
      )}

      {/* ── SuperAdmin sections ── */}
      {isSuperAdmin && !isDevAdmin && (
        <>
          {/* KPI row */}
          {platform && (
            <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
              <SectionHeader title="Today's Activity" action={{ label: 'View Transactions', to: '/transactions' }} />
              <div style={s.kpiGrid}>
                <KPICard icon="🧾" label="Transactions" value={platform.today.transactions} sub="Today" color={PRIMARY} bg="#eff6ff" />
                <KPICard icon="💵" label="Purchase Volume" value={fmt$(platform.today.purchaseVolume)} sub="Today" color="#157A6E" bg="#f0fdf9" />
                <KPICard icon="⭐" label="Cashback Issued" value={fmt$(platform.today.cashbackIssued)} sub="Today" color="#7C3AED" bg="#f5f3ff" />
                <KPICard icon="📅" label="Monthly Volume" value={fmt$(platform.thisMonth.purchaseVolume)} sub="This month" color="#B45309" bg="#fffbeb" />
                <KPICard
                  icon="⏳" label="Pending Reviews" value={platform.pending}
                  sub={platform.pending > 0 ? 'Need action' : 'All clear'}
                  color={platform.pending > 0 ? '#E63946' : '#2DC653'}
                  bg={platform.pending > 0 ? '#fff5f5' : '#f0fdf4'}
                />
                <KPICard icon="💰" label="Credits Outstanding" value={fmt$(platform.totalCreditsOutstanding)} sub="Unredeemed" color="#0369a1" bg="#f0f9ff" />
              </div>
            </div>
          )}

          {/* 30-day trend chart */}
          {trend30.length > 0 && (
            <div className="dash-fade-in" style={{ animationDelay: '150ms' }}>
              <SectionHeader title="30-Day Purchase Volume" subtitle="Daily volume across all stores" />
              <div style={s.chartBoxFull}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trend30} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="saGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} interval={4} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Volume']} labelFormatter={(l) => `Date: ${l}`} />
                    <Area type="monotone" dataKey="volume" stroke={PRIMARY} strokeWidth={2} fill="url(#saGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Store performance */}
          {platform?.storeRanking?.length > 0 && (
            <div className="dash-fade-in" style={{ animationDelay: '180ms' }}>
              <SectionHeader title="Store Performance - This Month" action={{ label: 'Full Leaderboard', to: '/leaderboard' }} />
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
            </div>
          )}

          {/* Active promotions + recent transactions side by side */}
          <div className="dash-fade-in" style={{ animationDelay: '210ms' }}>
            <div style={s.twoColRow}>
              <ActiveOffersPanel offers={activeOffersList} banners={bannersData?.data?.data || []} />
              <RecentTransactions txs={recentTxs} />
            </div>
          </div>

          {/* Platform overview */}
          <div className="dash-fade-in" style={{ animationDelay: '240ms' }}>
            <SectionHeader title="Platform Overview" />
            <div style={s.statsGrid}>
              <StatCard icon="🏪" label="Active Stores" value={loadingStores ? '…' : activeStores} to="/stores" />
              <StatCard icon="🙋" label="Customers" value={loadingCustomers ? '…' : totalCustomers} to="/customers" />
              <StatCard icon="👷" label="Staff Members" value={loadingStaff ? '…' : totalStaff} to="/staff" />
              <StatCard icon="📢" label="Active Offers" value={loadingOffers ? '…' : activeOffersCount} to="/offers" />
              <StatCard icon="🖼️" label="Active Banners" value={loadingBanners ? '…' : activeBanners} to="/banners" />
              <StatCard
                icon="⚠️" label="Customer Disputes" value={pendingDisputesCount}
                valueColor={pendingDisputesCount > 0 ? '#E63946' : undefined}
                to="/customers?tab=disputes"
              />
              <StatCard
                icon="🏷️" label="Labels Needing Print"
                value={loadingLabelHealth ? '…' : totalStaleLabels}
                valueColor={totalStaleLabels > 0 ? '#b7791f' : undefined}
                to="/labels?tab=health"
              />
            </div>
            {storesWithStaleLabels > 0 && (
              <div style={s.dashboardHint}>
                {storesWithStaleLabels} store{storesWithStaleLabels === 1 ? '' : 's'} {storesWithStaleLabels === 1 ? 'has' : 'have'} labels behind
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Analytics Charts (DevAdmin only) ── */}
      {isDevAdmin && analytics && (
        <div className="dash-fade-in" style={{ animationDelay: '180ms' }}>
          <SectionHeader title="Last 30 Days - Activity" action={{ label: 'Full Analytics', to: '/analytics' }} />
          <div style={s.chartsRow}>
            <div style={s.chartBox}>
              <div style={s.chartTitle}>Daily Transactions</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analytics.daily} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Transactions']} labelFormatter={(l) => l} />
                  <Area type="monotone" dataKey="transactions" stroke={PRIMARY} strokeWidth={2} fill="url(#txGrad)" dot={false} />
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
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Dev Cut']} />
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
                    <XAxis type="number" tick={{ fontSize: 13 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 13 }} tickFormatter={(v) => v.replace('_', ' ')} width={80} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Purchase Volume']} />
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
        </div>
      )}

      {/* ── Live Cashback Rates (DevAdmin only) ── */}
      {isDevAdmin && liveRates.length > 0 && (
        <div className="dash-fade-in" style={{ animationDelay: '240ms' }}>
          <SectionHeader
            title="Live Cashback Rates Today"
            subtitle="Effective rate each Bronze customer earns per category right now - tier base + category bonus + active promotions."
            action={{ label: 'Edit Rates', to: '/rates' }}
          />
          <div style={s.ratesGrid}>
            {liveRates.map((r) => <LiveRateCard key={r.category} r={r} bronzeBase={bronzeBase} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: '28px 32px' },

  welcomeCard: {
    background: 'linear-gradient(135deg, #12202f 0%, #1D3557 55%, #2a4a73 100%)',
    borderRadius: 20, padding: '32px 36px', marginBottom: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 4px 28px rgba(29,53,87,0.32)',
    position: 'relative', overflow: 'hidden',
  },
  welcomeDate: {
    color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 700,
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
  roleBadgeDev: { background: 'rgba(45,198,83,0.15)', color: '#2DC653', border: '1px solid rgba(45,198,83,0.3)' },

  quickActions: { display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' as const },
  quickBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#fff', border: '1px solid #e9ecef',
    borderRadius: 10, padding: '8px 16px',
    fontSize: 15, fontWeight: 600, color: '#374151',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: TRANSITION_FAST,
  },

  sectionHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14, marginTop: 8,
  },
  section: {
    fontSize: 15, fontWeight: 800, color: PRIMARY, margin: 0,
  },
  sectionSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 6, marginBottom: 0, paddingLeft: 16 },
  sectionLink: {
    background: 'none', border: '1px solid #dee2e6', borderRadius: 8,
    padding: '5px 12px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    color: TEXT_MUTED, transition: TRANSITION_FAST, whiteSpace: 'nowrap' as const,
    alignSelf: 'flex-start', marginTop: 2,
  },

  attnBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 14,
    background: '#fff8f0', border: '1.5px solid #F4A26144',
    borderRadius: 14, padding: '16px 20px', marginBottom: 20,
  },
  attnIcon: { fontSize: 22, flexShrink: 0, marginTop: 1 },
  attnBody: { flex: 1 },
  attnTitle: { fontSize: 14, fontWeight: 800, color: '#92400e' },
  attnLink: {
    background: 'none', borderRadius: 8,
    padding: '4px 12px', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.12s ease',
  },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 14, marginBottom: 28 },
  kpiCard: {
    background: '#fff', borderRadius: 14, padding: '18px 18px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
    border: '1px solid #f0f1f2',
  },
  kpiIconWrap: { width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  twoColRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28, alignItems: 'start' },

  offersPanel: {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
  },
  offersPanelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: '1px solid #f0f1f2',
    background: '#fafbfc',
  },
  offersPanelTitle: { fontSize: 15, fontWeight: 800, color: PRIMARY },
  offersGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14 },
  offerChip: {
    background: '#fff', border: '1.5px solid #e9ecef',
    borderRadius: 12, padding: '12px 14px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  offerChipTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  offerChipBadge: {
    fontSize: 9, fontWeight: 800, background: '#E63946', color: '#fff',
    borderRadius: 4, padding: '2px 6px', letterSpacing: 0.5,
  },
  offerChipRate: { fontSize: 14, fontWeight: 900, color: '#2DC653' },
  offerChipName: { fontSize: 15, fontWeight: 700, color: PRIMARY, marginBottom: 3, lineHeight: 1.3 },
  offerChipCat: { fontSize: 12, color: TEXT_MUTED, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  offerChipExpiry: { fontSize: 12, color: '#E63946', fontWeight: 600, marginTop: 6 },
  emptyState: { padding: '24px 18px', color: TEXT_MUTED, fontSize: 15, textAlign: 'center' as const },

  recentPanel: {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
  },
  recentRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 18px', borderBottom: '1px solid #f9fafb',
    transition: 'background 0.12s ease',
  },
  recentDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  recentCustomer: { fontSize: 15, fontWeight: 700, color: '#111827' },
  recentMeta: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },
  recentAmount: { fontSize: 15, fontWeight: 800, color: PRIMARY },
  recentTime: { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },

  // auto-fit (not auto-fill) collapses grid tracks that have no card in
  // them, so a short row - a lone card, or a trailing card that doesn't
  // fill the last row - doesn't leave a strip of empty white space beside
  // it; remaining cards use the freed-up room to grow, up to the max.
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 260px))', gap: 14, marginBottom: 32 },
  dashboardHint: { fontSize: 13, color: '#b7791f', marginTop: -20, marginBottom: 32 },
  statCard: {
    background: '#fff', borderRadius: 16, padding: '20px 18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    display: 'flex', flexDirection: 'column', gap: 8,
    border: '1px solid #f0f1f2', transition: TRANSITION_TRANSFORM,
  },
  statIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  statIcon: { fontSize: 22 },
  statArrow: { fontSize: 15, color: TEXT_MUTED, fontWeight: 700 },
  // minHeight reserves room for a two-line label so a short label ("Staff")
  // and a long one ("Subscription Revenue") both leave the value number
  // starting at the same y position across a row of cards.
  statLabel: { color: TEXT_MUTED, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.3, minHeight: 34 },
  statValue: { fontSize: 26, fontWeight: 800, letterSpacing: -0.5 },

  healthLoading: { color: TEXT_MUTED, fontSize: 14, padding: '12px 0', fontStyle: 'italic' },
  healthOk: {
    color: '#2DC653', fontSize: 14, fontWeight: 600, background: 'rgba(45,198,83,0.08)',
    border: '1px solid rgba(45,198,83,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 8,
  },
  healthList: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 },
  healthRow: {
    borderRadius: 14, border: '1px solid', padding: '14px 18px',
    transition: TRANSITION_TRANSFORM,
  },
  healthRowHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    cursor: 'pointer', flexWrap: 'wrap' as const, gap: 10,
  },
  healthRowName: { fontWeight: 700, fontSize: 15, color: PRIMARY },
  healthRowStats: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const },
  healthStat: { fontSize: 13, color: TEXT_MUTED },
  healthPill: {
    fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
    border: '1px solid', background: '#fff', transition: TRANSITION_FAST,
  },
  healthCategoryList: {
    marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  healthCategoryRow: {
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const,
    fontSize: 13, paddingLeft: 8,
  },
  healthCategoryName: { fontWeight: 600, color: '#374151', minWidth: 110 },

  storeTable: {
    background: '#fff', borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2', marginBottom: 32,
  },
  storeTableHeader: {
    display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 1fr 1.2fr',
    padding: '10px 20px', background: '#f8f9fa',
    fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5,
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
    color: '#fff', fontSize: 14, fontWeight: 800,
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
  chartTitle: { fontSize: 14, fontWeight: 700, color: TEXT_MUTED, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  ratesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 36 },
  liveRateCard: {
    background: '#fff', borderRadius: 14, padding: '16px 18px',
    border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  liveRateCardHov: { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(0,0,0,0.08)' },
  liveRateTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  liveRateIcon: { fontSize: 20 },
  liveRateLabel: { fontWeight: 700, fontSize: 15, color: PRIMARY },
  liveRateValue: { fontSize: 30, fontWeight: 900, color: PRIMARY, marginBottom: 8, letterSpacing: -1 },
  rateTrack: { height: 5, background: '#f0f1f2', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  rateFill: { height: '100%', background: 'linear-gradient(90deg, #E63946, #1D3557)', borderRadius: 3 },
  liveRateBreakdown: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  liveRateRow: { fontSize: 13, color: TEXT_MUTED },
};
