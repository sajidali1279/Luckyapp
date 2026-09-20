import { useState } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LabelList, AreaChart, Area,
} from 'recharts';
import { handleGlowMove } from '../../lib/motion';
import { formatChartTooltipDate, formatInteger, formatRate } from '../../components/formater';
import { PRIMARY } from '../../lib/theme';
import {
  s, fmt$, fmtDay, axisMoney, CAT_ICONS, SkeletonCards, SkeletonBox, PanelError, StatCard, SectionHeader, Segmented,
  readSetting, writeSetting,
} from './shared';
import { useRevenue, useAnalytics, useCategoryRates, useTierRates, useOffers, useCashbackHealth } from './queries';

// ── Live cashback rates: tier by category, computed the way a grant computes them ─────────
// Mirrors initiateGrant in backend/src/controllers/points.controller.ts: tier base + category bonus +
// one promo (a category-specific offer wins over an all-category one), capped at 10%. Gas and diesel pay
// cents per gallon when the tier has a per-gallon rate and the gallons are known. Chain-wide offers only;
// store-specific offers apply at one store and are not shown here.
const RATE_CAP = 0.10;   // CASHBACK_RATE_CAP in backend/src/config/constants.ts
const RATE_WARN = 0.075; // CASHBACK_RATE_WARN
const TIER_COLS: { tier: string; label: string }[] = [
  { tier: 'BRONZE', label: '🥉 Bronze' }, { tier: 'SILVER', label: '🥈 Silver' }, { tier: 'GOLD', label: '🥇 Gold' },
  { tier: 'DIAMOND', label: '💎 Diamond' }, { tier: 'PLATINUM', label: '👑 Platinum' },
];

type RateCell = { text: string; title: string; flag: 'none' | 'promo' | 'warn' | 'cap' };

function rateCell(tier: string, category: string, tierRates: any[], catRates: any[], chainOffers: any[]): RateCell {
  const tr = tierRates.find((t) => t.tier === tier);
  const tierBase: number = tr?.cashbackRate ?? 0;
  const catBonus: number = catRates.find((c) => c.category === category)?.cashbackRate ?? 0;
  const offer = chainOffers.find((o) => o.category === category) ?? chainOffers.find((o) => o.category == null) ?? null;
  const promo: number = offer ? (offer.tierBonusRates?.[tier] ?? offer.bonusRate ?? 0) : 0;
  const isGas = category === 'GAS' || category === 'DIESEL';
  const cents: number | null = tr?.gasCentsPerGallon ?? null;

  if (isGas && cents != null && cents > 0) {
    const extra = offer?.gasBonusCentsPerGallon != null ? ` + ${offer.gasBonusCentsPerGallon}¢` : promo > 0 ? ` + ${formatRate(promo)}` : '';
    return {
      text: `${cents}¢/gal${extra}`,
      title: `Per-gallon mode: ${cents}¢ per gallon${extra ? `, plus promo ${offer?.title}` : ''}. If the gallons are not known, the percentage rate applies instead.`,
      flag: extra ? 'promo' : 'none',
    };
  }
  let rate = parseFloat((tierBase + catBonus + promo).toFixed(4)); // the grant rounds the same way before comparing to the warn line
  let flag: RateCell['flag'] = promo > 0 ? 'promo' : 'none';
  if (rate > RATE_CAP) { rate = RATE_CAP; flag = 'cap'; } else if (rate > RATE_WARN) { flag = 'warn'; }
  const parts = [`base ${formatRate(tierBase)}`, `category ${formatRate(catBonus)}`];
  if (promo > 0) parts.push(`promo ${formatRate(promo)}`);
  return { text: formatRate(rate), title: parts.join(' + ') + (flag === 'cap' ? ' (capped at 10%)' : ''), flag };
}

const FLAG_COLOR: Record<RateCell['flag'], string> = { none: '#111827', promo: '#157A3E', warn: '#b45309', cap: '#D62839' };

function LiveRatesMatrix({ tierRates, catRates, offers }: { tierRates: any[]; catRates: any[]; offers: any[] }) {
  const now = new Date();
  const chainOffers = offers.filter((o: any) =>
    o.isActive && (o.type ?? 'ALL_STORES') === 'ALL_STORES' && (o.bonusRate != null || o.gasBonusCentsPerGallon != null) &&
    new Date(o.startDate) <= now && new Date(o.endDate) >= now);
  return (
    <div style={s.ratesWrap}>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.ratesTable}>
          <thead>
            <tr>
              <th style={{ ...s.ratesTh, textAlign: 'left' }}>Category</th>
              {TIER_COLS.map((t) => <th key={t.tier} style={s.ratesTh}>{t.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {catRates.map((c: any) => (
              <tr key={c.category}>
                <td style={{ ...s.ratesTd, textAlign: 'left', fontWeight: 700, color: PRIMARY }}>
                  <span style={{ marginRight: 8 }}>{CAT_ICONS[c.category] || '🏪'}</span>{c.label}
                </td>
                {TIER_COLS.map((t) => {
                  const cell = rateCell(t.tier, c.category, tierRates, catRates, chainOffers);
                  return (
                    <td key={t.tier} style={{ ...s.ratesTd, color: FLAG_COLOR[cell.flag], fontWeight: cell.flag === 'none' ? 600 : 800 }} title={cell.title}>
                      {cell.text}{cell.flag === 'cap' ? ' cap' : cell.flag === 'promo' ? ' ●' : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={s.ratesLegend}>
        {chainOffers.length > 0
          ? chainOffers.map((o: any) => (
              <span key={o.id} style={{ color: '#157A3E', fontWeight: 600 }}>
                ● {o.title}: {o.gasBonusCentsPerGallon != null && o.bonusRate == null ? `+${o.gasBonusCentsPerGallon}¢/gal` : `+${formatRate(o.bonusRate ?? 0)}`} on {o.category ? o.category.replace(/_/g, ' ').toLowerCase() : 'all categories'}
              </span>
            ))
          : <span>No chain-wide promotion is running.</span>}
        <span>Gas and diesel pay cents per gallon when the gallons are known, otherwise the percentage. Rates are capped at 10%. Hover a cell for the breakdown.</span>
      </div>
    </div>
  );
}

// ── Cashback health ──────────────────────────────────────────────────────────

type CashbackCategoryHealth = { category: string; cashbackIssued: number; purchaseVolume: number; ratio: number; status: 'ok' | 'warn' | 'critical' };
type CashbackStoreHealth = {
  storeId: string; storeName: string; cashbackIssued: number; purchaseVolume: number;
  ratio: number; status: 'ok' | 'warn' | 'critical'; categories: CashbackCategoryHealth[];
};

const HEALTH_STATUS_META: Record<'ok' | 'warn' | 'critical', { label: string; color: string; bg: string; border: string }> = {
  ok:       { label: '✅ OK',       color: '#2DC653', bg: 'rgba(45,198,83,0.08)',  border: 'rgba(45,198,83,0.3)' },
  warn:     { label: '⚠️ Warn',     color: '#F4A261', bg: 'rgba(244,162,97,0.08)', border: 'rgba(244,162,97,0.3)' },
  critical: { label: '🚨 Critical', color: '#D62839', bg: 'rgba(230,57,70,0.08)',  border: 'rgba(230,57,70,0.3)' },
};

function CashbackHealthCard() {
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useCashbackHealth();

  const stores: CashbackStoreHealth[] = data?.data?.data ?? [];
  const problemStores = stores
    .filter((st) => st.status !== 'ok' || st.categories.some((c) => c.status !== 'ok'))
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div>
      <SectionHeader title="Cashback Health" subtitle="Cashback paid out vs. sales, trailing 30 days. Warn above 7.5%, critical above 9%." />
      {isLoading ? (
        <SkeletonBox h={64} />
      ) : isError ? (
        // A broken health check must not look like a healthy network.
        <PanelError label="cashback health" onRetry={() => refetch()} />
      ) : problemStores.length === 0 ? (
        <div style={s.healthOk}>✅ All stores within cashback target</div>
      ) : (
        <div style={s.healthList}>
          {problemStores.map((store) => {
            const meta = HEALTH_STATUS_META[store.status];
            const isOpen = expandedStore === store.storeId;
            return (
              <div key={store.storeId} className="dash-card" style={{ ...s.healthRow, borderColor: meta.border, background: meta.bg }} onMouseMove={handleGlowMove}>
                <div style={s.healthRowHeader} onClick={() => setExpandedStore(isOpen ? null : store.storeId)}
                  role="button" tabIndex={0} aria-expanded={isOpen}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpandedStore(isOpen ? null : store.storeId)}>
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
                    {store.categories.map((cat) => {
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

// ── The Business view ────────────────────────────────────────────────────────

type RevPeriod = 'all' | 'month' | 'last-month';
const PERIOD_LABEL: Record<RevPeriod, string> = { all: 'All time', month: 'This month', 'last-month': 'Last month' };
const PERIODS = ['month', 'last-month', 'all'] as const;

export default function BusinessView() {
  const [revPeriod, setRevPeriod] = useState<RevPeriod>(() => readSetting('dash-revenue-period', PERIODS, 'month'));
  const pickPeriod = (p: RevPeriod) => { setRevPeriod(p); writeSetting('dash-revenue-period', p); };

  const revenueQ = useRevenue(revPeriod);
  const analyticsQ = useAnalytics();
  const ratesQ = useCategoryRates();
  const tierRatesQ = useTierRates();
  const offersQ = useOffers();

  const revenue = revenueQ.data?.data?.data;
  const analytics = analyticsQ.data?.data?.data;
  const categoryRates: any[] = ratesQ.data?.data?.data || [];
  const tierRatesList: any[] = tierRatesQ.data?.data?.data || [];
  const activeOffersList: any[] = offersQ.data?.data?.data || [];
  const analyticsEmpty = analytics && !(analytics.daily || []).some((d: any) => d.transactions > 0);
  // An older server ignores ?period and answers with all-time totals. Say so instead of labelling them "This month".
  const periodMismatch = !!revenue && revPeriod !== 'all' && revenue.period !== revPeriod;

  return (
    <>
      {/* ── Revenue ── */}
      <div className="dash-fade-in" style={{ animationDelay: '0ms' }}>
        <SectionHeader
          title="Revenue Overview"
          subtitle={`${PERIOD_LABEL[revPeriod]}. Approved transactions only; subscriptions are what was collected in the period.`}
          action={{ label: 'View Billing', to: '/billing' }}
          right={<Segmented value={revPeriod} onChange={pickPeriod} label="Revenue period" options={PERIODS.map((p) => ({ id: p, label: PERIOD_LABEL[p] }))} />}
        />
        {revenueQ.isLoading ? (
          <SkeletonCards n={6} />
        ) : revenueQ.isError || !revenue ? (
          <PanelError label="revenue" onRetry={() => revenueQ.refetch()} />
        ) : (
          <>
          {periodMismatch && (
            <div style={s.skewNote} role="status">
              The server has not been updated to filter by month yet, so these are all-time totals.
            </div>
          )}
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Transactions" value={formatInteger(revenue.totalTransactions)} to="/transactions" />
            <StatCard icon="💵" label="Purchase Volume" value={fmt$(revenue.totalPurchaseVolume)} />
            <StatCard icon="⭐" label="Cashback Issued" value={fmt$(revenue.totalPointsAwarded)} />
            <StatCard icon="🎁" label="Credits Redeemed" value={fmt$(revenue.totalRedeemedAmount)} />
            <StatCard icon="💰" label="Dev Cut" value={fmt$(revenue.totalDevCut)} valueColor="#2DC653" to="/billing" />
            <StatCard icon="📋" label="Subscriptions Collected" value={fmt$(revenue.totalSubscriptionRevenue)} valueColor="#2DC653" to="/billing" />
          </div>
          </>
        )}
      </div>

      {/* ── Cashback Health ── */}
      <div className="dash-fade-in" style={{ animationDelay: '30ms' }}>
        <CashbackHealthCard />
      </div>

      {/* ── Analytics Charts ── */}
      <div className="dash-fade-in" style={{ animationDelay: '60ms' }}>
        <SectionHeader title="Last 30 Days - Activity" subtitle="Approved transactions by day, Central-time calendar." action={{ label: 'Full Analytics', to: '/analytics' }} />
        {analyticsQ.isLoading ? (
          <SkeletonBox h={250} />
        ) : analyticsQ.isError || !analytics ? (
          <PanelError label="the activity charts" onRetry={() => analyticsQ.refetch()} />
        ) : analyticsEmpty ? (
          <div style={{ ...s.chartBoxFull, ...s.emptyState }}>No approved sales in the last 30 days.</div>
        ) : (
          <>
            <div style={s.chartsRow}>
              <div style={s.chartBox}>
                <div style={s.chartTitle}>Daily Transactions</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={analytics.daily} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.12} />
                        <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={fmtDay} minTickGap={28} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, 'Transactions']} labelFormatter={(l) => formatChartTooltipDate(String(l))} />
                    <Area type="monotone" dataKey="transactions" stroke={PRIMARY} strokeWidth={2} fill="url(#txGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={s.chartBox}>
                <div style={s.chartTitle}>Daily Purchase Volume ($)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={analytics.daily} margin={{ top: 4, right: 8, bottom: 0, left: 6 }}>
                    <defs>
                      <linearGradient id="devGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2DC653" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#2DC653" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={fmtDay} minTickGap={28} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={axisMoney} width={58} />
                    <Tooltip formatter={(v: any) => [fmt$(Number(v)), 'Purchase volume']} labelFormatter={(l) => formatChartTooltipDate(String(l))} />
                    <Area type="monotone" dataKey="purchaseVolume" stroke="#2DC653" strokeWidth={2} fill="url(#devGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {analytics.byCategory?.length > 0 && (
              <>
                <SectionHeader title="Purchase Volume by Category" />
                <div style={s.chartBoxFull}>
                  <ResponsiveContainer width="100%" height={Math.max(220, analytics.byCategory.length * 38)}>
                    <BarChart data={analytics.byCategory} layout="vertical" margin={{ left: 8, right: 84 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 13 }} tickFormatter={axisMoney} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 13 }} tickFormatter={(v) => String(v).replace(/_/g, ' ')} width={128} />
                      <Tooltip formatter={(v: any) => [fmt$(Number(v)), 'Purchase volume']} labelFormatter={(l) => String(l).replace(/_/g, ' ')} />
                      <Bar dataKey="purchaseVolume" fill={PRIMARY} radius={[0, 6, 6, 0]}>
                        <LabelList dataKey="purchaseVolume" position="right" formatter={(v: any) => axisMoney(v)} style={{ fontSize: 12, fill: '#374151', fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Live Cashback Rates ── */}
      <div className="dash-fade-in" style={{ animationDelay: '90ms' }}>
        <SectionHeader
          title="Live Cashback Rates Today"
          subtitle="What each tier earns per category right now: tier base + category bonus + the active chain-wide promotion."
          action={{ label: 'Edit Rates', to: '/rates' }}
        />
        {ratesQ.isLoading || tierRatesQ.isLoading || offersQ.isLoading ? (
          <SkeletonBox h={300} />
        ) : ratesQ.isError || tierRatesQ.isError || offersQ.isError ? (
          <PanelError label="the live rates" onRetry={() => { ratesQ.refetch(); tierRatesQ.refetch(); offersQ.refetch(); }} />
        ) : (
          <LiveRatesMatrix tierRates={tierRatesList} catRates={categoryRates} offers={activeOffersList} />
        )}
      </div>
    </>
  );
}
