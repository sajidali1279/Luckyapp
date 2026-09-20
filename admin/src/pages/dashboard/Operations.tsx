import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import ConfirmModal from '../../components/ConfirmModal';
import ErrorState from '../../components/ErrorState';
import { Skeleton } from '../../components/ui/skeleton';
import { handleGlowMove } from '../../lib/motion';
import { formatFullCurrency, formatInteger, formatRate } from '../../components/formater';
import { pointsApi } from '../../services/api';
import { TEXT_MUTED, PRIMARY } from '../../lib/theme';
import {
  s, fmt$, fmtDay, axisMoney, storeColor, storeBadge, badgeInk, MEDALS, agoLabel, since, whenLabel, daysUntil, activate, parseFlags,
  FRAUD_FLAG_LABELS, SkeletonBox, SkeletonCards, PanelError, StatCard, SectionHeader, Segmented, Sparkline, Delta,
  readSetting, writeSetting,
} from './shared';
import {
  usePlatform, useCompare, useTrend, useStoreHealth, useOffers, useBanners, useCustomers, useStaff, useStores,
  useLabelHealth, useFeed,
} from './queries';
import { useAdminBadges } from '../../hooks/useAdminBadges';
import LaunchTracker from './LaunchTracker';

// ── Range: what the KPIs and the chart cover ─────────────────────────────────

const RANGES = ['today', '7d', '30d', 'month'] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { today: 'Today', '7d': '7 days', '30d': '30 days', month: 'This month' };

function comparisonLabel(range: Range, previousStart?: string) {
  if (range === 'today') {
    const day = previousStart
      ? new Date(previousStart).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' })
      : 'last week';
    return `last ${day}`;
  }
  if (range === '7d') return 'previous 7 days';
  if (range === '30d') return 'previous 30 days';
  return 'last month so far';
}

const METRICS = ['purchaseVolume', 'transactions', 'cashbackIssued'] as const;
type Metric = (typeof METRICS)[number];
const METRIC_LABEL: Record<Metric, string> = { purchaseVolume: 'Sales', transactions: 'Transactions', cashbackIssued: 'Cashback' };

const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

// ── KPI cards with a comparison and a trend line ─────────────────────────────

function KPI({ icon, label, value, color, bg, delta, spark, sub }: {
  icon: string; label: string; value: string; color: string; bg: string;
  delta?: React.ReactNode; spark?: number[]; sub?: string;
}) {
  return (
    <div className="dash-card" style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }} onMouseMove={handleGlowMove}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ ...s.kpiIconWrap, background: bg }}><span style={{ fontSize: 17 }}>{icon}</span></div>
        {spark && <Sparkline values={spark} color={color} />}
      </div>
      <div style={{ fontSize: 25, fontWeight: 900, color, letterSpacing: -0.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 6 }}>{label}</div>
      {delta}
      {sub && <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginTop: 'auto', paddingTop: 4 }}>{sub}</div>}
    </div>
  );
}

function KpiRow({ range }: { range: Range }) {
  const compareQ = useCompare(range);
  const platformQ = usePlatform();
  const trendQ = useTrend();
  const platform = platformQ.data?.data?.data;
  const cmp = compareQ.data?.data?.data;
  const awaiting: number = (platform?.pending ?? 0) + (platform?.flagged ?? 0);

  if (compareQ.isLoading) return <SkeletonCards n={6} h={150} />;
  if (compareQ.isError || !cmp) return <PanelError label="today's numbers" onRetry={() => compareQ.refetch()} />;

  const cur = cmp.current.totals;
  const prev = cmp.previous.totals;
  const vs = comparisonLabel(range, cmp.previous.start);
  // The last 14 store days, for the trend line on each card
  const daily: any[] = (trendQ.data?.data?.data?.daily ?? []).slice(-14);
  const sparkVol = daily.map((d) => d.purchaseVolume);
  const sparkTx = daily.map((d) => d.transactions);
  const sparkCash = daily.map((d) => d.cashbackIssued);
  const sparkTicket = daily.map((d) => (d.transactions > 0 ? d.purchaseVolume / d.transactions : 0));

  return (
    <div style={s.kpiGrid}>
      <KPI icon="🧾" label="Transactions" value={formatInteger(cur.transactions)} color={PRIMARY} bg="#eff6ff" spark={sparkTx}
        delta={<Delta cur={cur.transactions} prev={prev.transactions} label={vs} />} />
      <KPI icon="💵" label="Purchase Volume" value={fmt$(cur.purchaseVolume)} color="#157A6E" bg="#f0fdf9" spark={sparkVol}
        delta={<Delta cur={cur.purchaseVolume} prev={prev.purchaseVolume} label={vs} />} />
      <KPI icon="⭐" label="Cashback Issued" value={fmt$(cur.cashbackIssued)} color="#7C3AED" bg="#f5f3ff" spark={sparkCash}
        delta={<Delta cur={cur.cashbackIssued} prev={prev.cashbackIssued} label={vs} tone="neutral" />} />
      <KPI icon="🎟️" label="Average Ticket" value={fmt$(cur.avgTicket)} color="#B45309" bg="#fffbeb" spark={sparkTicket}
        delta={<Delta cur={cur.avgTicket} prev={prev.avgTicket} label={vs} />} />
      {platformQ.isError ? (
        <KPI icon="⏳" label="Pending Reviews" value="–" color="#E63946" bg="#fff5f5" sub="Couldn't check" />
      ) : (
        <KPI icon="⏳" label="Pending Reviews" value={platform ? formatInteger(awaiting) : '…'}
          color={awaiting > 0 ? '#E63946' : '#2DC653'} bg={awaiting > 0 ? '#fff5f5' : '#f0fdf4'}
          sub={awaiting > 0 ? ((platform?.flagged ?? 0) > 0 ? `${formatInteger(platform.flagged)} flagged` : 'Need action') : 'All clear'} />
      )}
      <KPI icon="💰" label="Credits Outstanding" value={platform ? fmt$(platform.totalCreditsOutstanding) : platformQ.isError ? '–' : '…'}
        color="#0369a1" bg="#f0f9ff" sub="Unredeemed by customers" />
    </div>
  );
}

// ── The chart: this period against the previous one ──────────────────────────

function RangeChart({ range }: { range: Range }) {
  const [metric, setMetric] = useState<Metric>(() => readSetting('dash-chart-metric', METRICS, 'purchaseVolume'));
  const compareQ = useCompare(range);
  const cmp = compareQ.data?.data?.data;

  const pickMetric = (m: Metric) => { setMetric(m); writeSetting('dash-chart-metric', m); };
  const title = range === 'today' ? 'Sales by hour, today' : range === 'month' ? 'This month, day by day' : `Last ${range === '7d' ? 7 : 30} days, day by day`;

  let body: React.ReactNode;
  if (compareQ.isLoading) body = <SkeletonBox h={260} />;
  else if (compareQ.isError || !cmp) body = <PanelError label="the chart" onRetry={() => compareQ.refetch()} />;
  else {
    const hourly = cmp.granularity === 'hour';
    const nowIndex: number = cmp.nowIndex;
    const data = cmp.current.series.map((c: any, i: number) => {
      const p = cmp.previous.series[i];
      return {
        i, label: hourly ? hourLabel(Number(c.key)) : fmtDay(c.key),
        cur: i <= nowIndex ? c[metric] : null, prev: p ? p[metric] : null,
        curKey: c.key, prevKey: p?.key ?? null,
      };
    });
    const total = data.reduce((sum: number, d: any) => sum + (d.cur ?? 0) + (d.prev ?? 0), 0);
    const money = metric !== 'transactions';
    const fmtVal = (v: number) => (money ? fmt$(v) : formatInteger(v));
    const dateOf = (key: string | null) => (!key ? '' : hourly ? hourLabel(Number(key)) : fmtDay(key));
    const previousName = comparisonLabel(range, cmp.previous.start);
    body = total === 0 ? (
      <div style={{ ...s.chartBoxFull, ...s.emptyState }}>No approved sales in this period or the one before it.</div>
    ) : (
      <div style={s.chartBoxFull}>
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="rcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.18} />
                <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={hourly ? 14 : 28} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => (money ? axisMoney(v) : formatInteger(v))} width={money ? 62 : 44} allowDecimals={false} />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxShadow: '0 4px 14px rgba(0,0,0,0.1)' }}>
                    {d.cur != null && <div style={{ fontWeight: 700, color: PRIMARY }}>{dateOf(d.curKey)}: {fmtVal(d.cur)}</div>}
                    {d.prev != null && <div style={{ color: TEXT_MUTED }}>{previousName}, {dateOf(d.prevKey)}: {fmtVal(d.prev)}</div>}
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="prev" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} isAnimationActive={false} connectNulls={false} />
            <Area type="monotone" dataKey="cur" stroke={PRIMARY} strokeWidth={2.5} fill="url(#rcGrad)" dot={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 18, fontSize: 12.5, color: TEXT_MUTED, padding: '2px 4px 8px', flexWrap: 'wrap' as const }}>
          <span><span style={{ display: 'inline-block', width: 18, height: 3, background: PRIMARY, borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }} />{RANGE_LABEL[range]}</span>
          <span><span style={{ display: 'inline-block', width: 18, borderTop: '2px dashed #9CA3AF', marginRight: 6, verticalAlign: 'middle' }} />{previousName}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title={title} subtitle="Approved sales on the Central-time calendar. The dashed line is the same stretch of the previous period."
        right={<Segmented value={metric} onChange={pickMetric} label="Chart metric" options={METRICS.map((m) => ({ id: m, label: METRIC_LABEL[m] }))} />} />
      {body}
    </div>
  );
}

// ── Stores: health board and monthly table ───────────────────────────────────

const STATUS_STYLE: Record<string, { border: string; dot: string; label: string }> = {
  alert: { border: '#F3B1B7', dot: '#E63946', label: 'Needs a look' },
  watch: { border: '#F6D9A8', dot: '#F4A261', label: 'Keep an eye' },
  ok:    { border: '#f0f1f2', dot: '#2DC653', label: 'Healthy' },
};

function StoreBoard() {
  const navigate = useNavigate();
  const q = useStoreHealth();
  if (q.isLoading) return <SkeletonBox h={300} />;
  if (q.isError) return <PanelError label="the store board" onRetry={() => q.refetch()} />;
  const stores: any[] = q.data?.data?.data ?? [];
  if (stores.length === 0) return <div style={{ ...s.storeTable, ...s.emptyState }}>No stores yet.</div>;
  return (
    <div style={s.boardGrid}>
      {stores.map((st, i) => {
        const look = STATUS_STYLE[st.status] ?? STATUS_STYLE.ok;
        // Under $50 last week is too small a base to say anything about (a $10 day to a $255 day is not news)
        const vsLast = st.lastWeekVolume >= 50 ? ((st.todayVolume - st.lastWeekVolume) / st.lastWeekVolume) * 100 : null;
        return (
          <div key={st.id} style={{ ...s.tile, borderColor: look.border }}>
            <div style={s.tileHead}>
              <div style={{ ...s.tileBadge, background: storeColor(i), color: badgeInk(storeColor(i)) }}>{storeBadge(st.name)}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={s.tileName}>{st.name}</div>
                <div style={s.tileCity}>{st.city}</div>
              </div>
              <span role="img" title={look.label} aria-label={look.label} style={{ width: 10, height: 10, borderRadius: '50%', background: look.dot, flexShrink: 0 }} />
            </div>
            <div style={s.tileBig}>{fmt$(st.todayVolume)}</div>
            <div style={s.tileLine}>
              today · {formatInteger(st.todayTransactions)} sales
              {vsLast != null && (
                <span style={{ color: vsLast >= 0 ? '#157A3E' : '#C62828', fontWeight: 700 }}> · {vsLast >= 0 ? '▲' : '▼'} {Math.abs(vsLast) >= 1000 ? '999%+' : `${Math.abs(vsLast).toFixed(0)}%`} vs last week</span>
              )}
            </div>
            <div style={s.tileLine}>month {fmt$(st.monthVolume)} · cashback {formatRate(st.cashbackRatio30d)} of sales</div>
            {st.lastSaleAt && <div style={s.tileLine}>{agoLabel(st.lastSaleAt)}</div>}
            {st.reasons.slice(0, 3).map((r: string) => (
              <div key={r} style={{ ...s.tileReason, color: st.status === 'alert' ? '#C62828' : '#B45309' }}>{r}</div>
            ))}
            {(st.pending > 0 || st.flagged > 0) && (
              <button style={{ ...s.reviewBtn, borderColor: '#F3B1B7', color: '#C62828', alignSelf: 'flex-start', marginTop: 2 }} onClick={() => navigate('/transactions')}>
                Review {st.flagged + st.pending} →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StoreRow({ store, i, barWidth, color }: { store: any; i: number; barWidth: number; color: string }) {
  const navigate = useNavigate();
  const quiet = store.transactions === 0;
  return (
    <div
      className="dash-table-row"
      style={{ ...s.storeTableRow, cursor: 'pointer', '--row-bg': i % 2 === 0 ? '#fff' : '#fafbfc' } as React.CSSProperties}
      {...activate(() => navigate('/leaderboard'))}
      aria-label={`${store.name}, ${store.transactions} transactions, ${fmt$(store.purchaseVolume)}`}
    >
      <span style={s.storeColName}>
        <span style={s.storeRank}>{i < 3 && !quiet ? MEDALS[i] : `#${i + 1}`}</span>
        <div style={{ ...s.storeAvatar, background: color, color: badgeInk(color) }}>{storeBadge(store.name)}</div>
        <span style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: PRIMARY, fontSize: 14 }}>{store.name}</div>
          <div style={{ fontSize: 13, color: quiet ? '#b45309' : TEXT_MUTED }}>
            {quiet ? `${agoLabel(store.lastSaleAt)}, none this month` : store.city}
          </div>
        </span>
      </span>
      <span style={s.storeColNum}>{formatInteger(store.transactions)}</span>
      <span style={{ ...s.storeColNum, fontWeight: 700 }}>{fmt$(store.purchaseVolume)}</span>
      <span style={{ ...s.storeColNum, color: '#2DC653', fontWeight: 700 }}>{fmt$(store.cashbackIssued)}</span>
      <span style={s.storeColBar}><div style={s.barTrack}><div style={{ ...s.barFill, width: `${barWidth}%` }} /></div></span>
    </div>
  );
}

function StoreTable() {
  const platformQ = usePlatform();
  if (platformQ.isLoading) return <SkeletonBox h={320} />;
  const platform = platformQ.data?.data?.data;
  if (platformQ.isError || !platform) return <PanelError label="store performance" onRetry={() => platformQ.refetch()} />;
  if (platform.storeRanking.length === 0) return <div style={{ ...s.storeTable, ...s.emptyState }}>No stores yet.</div>;
  const maxVol = platform.storeRanking[0]?.purchaseVolume || 1;
  return (
    <div style={s.storeTable}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 780 }}>
          <div style={s.storeTableHeader}>
            <span style={s.storeColName}>Store</span>
            <span style={{ ...s.storeColNum, textAlign: 'right' }}>Transactions</span>
            <span style={{ ...s.storeColNum, textAlign: 'right' }}>Purchase Volume</span>
            <span style={{ ...s.storeColNum, textAlign: 'right' }}>Cashback Issued</span>
            <span style={s.storeColBar}>Activity</span>
          </div>
          {platform.storeRanking.map((store: any, i: number) => (
            <StoreRow key={store.id} store={store} i={i} barWidth={Math.max(4, (store.purchaseVolume / maxVol) * 100)} color={storeColor(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}

const STORE_VIEWS = ['board', 'table'] as const;

// ── Review feed: decide on flagged and pending transactions without leaving the page ──

interface Decision { id: string; kind: 'APPROVE' | 'REJECT'; flagged: boolean; who: string; amount: number; store: string }

function ReviewFeed() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const flaggedQ = useFeed('FLAGGED');
  const pendingQ = useFeed('PENDING');
  const latestQ = useFeed('LATEST');
  const [decision, setDecision] = useState<Decision | null>(null);

  const flagged: any[] = flaggedQ.data?.data?.data?.transactions ?? [];
  const pending: any[] = pendingQ.data?.data?.data?.transactions ?? [];
  const latest: any[] = latestQ.data?.data?.data?.transactions ?? [];
  const review = [...flagged, ...pending];

  const done = () => {
    ['feed', 'platform-summary', 'transactions-pending-count', 'all-transactions', 'store-health', 'platform-compare'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const mutation = useMutation({
    mutationFn: ({ id, kind, flagged: isFlagged }: Decision) =>
      isFlagged ? pointsApi.reviewFlagged(id, kind) : pointsApi.reject(id),
    onSuccess: (_r, d) => { toast.success(d.kind === 'APPROVE' ? 'Approved. Points credited.' : 'Rejected.'); done(); },
    onError: () => toast.error('That did not go through. Try again.'),
  });

  const money = (n: number) => formatFullCurrency(n);
  const StatusChip = ({ status }: { status: string }) => {
    const c = { APPROVED: '#157A3E', PENDING: '#B45309', REJECTED: '#5a6472', FLAGGED: '#D62839' }[status] ?? TEXT_MUTED;
    const label = { APPROVED: 'Approved', PENDING: 'Pending', REJECTED: 'Rejected', FLAGGED: 'Flagged' }[status] ?? status;
    return <span style={{ ...s.recentStatus, color: c, borderColor: `${c}55` }}>{label}</span>;
  };

  const anyLoading = flaggedQ.isLoading || pendingQ.isLoading || latestQ.isLoading;
  const anyError = flaggedQ.isError || pendingQ.isError || latestQ.isError;

  return (
    <div style={s.recentPanel}>
      {createPortal(<ConfirmModal
        open={!!decision}
        title={decision?.kind === 'APPROVE' ? 'Approve this transaction?' : 'Reject this transaction?'}
        message={decision
          ? (decision.kind === 'APPROVE'
              ? `${money(decision.amount)} at ${decision.store} for ${decision.who} will be approved and the points credited.`
              : `${money(decision.amount)} at ${decision.store} for ${decision.who} will be rejected. The customer gets no points for it.`)
          : ''}
        confirmLabel={decision?.kind === 'APPROVE' ? 'Approve' : 'Reject'}
        danger={decision?.kind === 'REJECT'}
        onConfirm={() => { if (decision) mutation.mutate(decision); setDecision(null); }}
        onCancel={() => setDecision(null)}
      />, document.body)}
      <div style={s.offersPanelHeader}>
        <span style={s.offersPanelTitle}>Transactions</span>
        <button onClick={() => navigate('/transactions')} style={s.sectionLink}>View all →</button>
      </div>

      {anyLoading ? (
        <div style={{ padding: 14 }}><Skeleton style={{ height: 240, borderRadius: 12 }} aria-busy="true" aria-label="Loading" /></div>
      ) : anyError ? (
        <ErrorState compact message="Couldn't load transactions." onRetry={() => { flaggedQ.refetch(); pendingQ.refetch(); latestQ.refetch(); }} />
      ) : (
        <>
          {review.length > 0 && (
            <>
              <div style={s.feedGroup}>Needs review ({review.length}{(flaggedQ.data?.data?.data?.total ?? 0) + (pendingQ.data?.data?.data?.total ?? 0) > review.length ? '+' : ''})</div>
              {review.map((tx: any) => {
                const isFlagged = tx.status === 'FLAGGED';
                const who = tx.customer?.name || tx.customer?.phone || 'the customer';
                const flags = parseFlags(tx.fraudFlags);
                const dec = (kind: 'APPROVE' | 'REJECT'): Decision => ({ id: tx.id, kind, flagged: isFlagged, who, amount: tx.purchaseAmount, store: tx.store?.name ?? 'the store' });
                return (
                  <div key={tx.id} style={{ ...s.recentRow, background: isFlagged ? '#fff8f8' : undefined }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.recentCustomer}>{who}</div>
                      <div style={s.recentMeta}>{tx.store?.name} · {tx.category?.replace(/_/g, ' ') || ' - '} · {since(tx.createdAt)}</div>
                      {flags.map((f) => <div key={f} style={s.recentFlags}>• {FRAUD_FLAG_LABELS[f] || f}</div>)}
                    </div>
                    <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                      <div style={s.recentAmount}>{fmt$(tx.purchaseAmount)}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, justifyContent: 'flex-end' }}>
                        {isFlagged && (
                          <button style={{ ...s.reviewBtn, borderColor: '#157A3E', background: '#157A3E', color: '#fff' }} onClick={() => setDecision(dec('APPROVE'))}>Approve</button>
                        )}
                        <button style={{ ...s.reviewBtn, borderColor: '#F3B1B7', color: '#C62828' }} onClick={() => setDecision(dec('REJECT'))}>Reject</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <div style={s.feedGroup}>Latest activity</div>
          {latest.length === 0 ? (
            <div style={s.emptyState}>No transactions yet.</div>
          ) : latest.map((tx: any) => (
            <div key={tx.id} style={{ ...s.recentRow, cursor: 'pointer' }} {...activate(() => navigate('/transactions'))}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.recentCustomer}>{tx.customer?.name || tx.customer?.phone || 'Customer'}</div>
                <div style={s.recentMeta}>{tx.store?.name} · {tx.category?.replace(/_/g, ' ') || ' - '}</div>
              </div>
              <StatusChip status={tx.status} />
              <div style={{ textAlign: 'right' as const, flexShrink: 0, minWidth: 74 }}>
                <div style={s.recentAmount}>{fmt$(tx.purchaseAmount)}</div>
                <div style={s.recentTime}>{whenLabel(tx.createdAt)}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Promotions ───────────────────────────────────────────────────────────────

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
          {liveOffers.slice(0, 4).map((o: any) => {
            const left = daysUntil(o.endDate);
            // Red only when it is actually about to end; a promo with weeks left is not an alarm.
            const urgency = left <= 2 ? '#D62839' : left <= 7 ? '#B45309' : TEXT_MUTED;
            return (
              <div key={o.id} style={s.offerChip}>
                <div style={s.offerChipTop}>
                  <span style={s.offerChipBadge}>OFFER</span>
                  {o.bonusRate != null && <span style={s.offerChipRate}>+{formatRate(o.bonusRate)}</span>}
                </div>
                <div style={s.offerChipName}>{o.title}</div>
                {o.category && <div style={s.offerChipCat}>{o.category.replace(/_/g, ' ')}</div>}
                <div style={{ ...s.offerChipExpiry, color: urgency }}>
                  Ends {new Date(o.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {left <= 14 ? ` · ${left <= 0 ? 'today' : left === 1 ? '1 day left' : `${left} days left`}` : ''}
                </div>
              </div>
            );
          })}
          {liveBanners.slice(0, 2).map((b: any) => (
            <div key={b.id} style={{ ...s.offerChip, border: '1.5px solid #7c3aed22', background: '#faf5ff' }}>
              <div style={s.offerChipTop}><span style={{ ...s.offerChipBadge, background: '#7c3aed', color: '#fff' }}>BANNER</span></div>
              <div style={s.offerChipName}>{b.title}</div>
              {b.storeId && <div style={s.offerChipCat}>Store-specific</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── The Operations view ──────────────────────────────────────────────────────

export default function OperationsView() {
  const [range, setRange] = useState<Range>(() => readSetting('dash-range', RANGES, 'today'));
  const [storeView, setStoreView] = useState<(typeof STORE_VIEWS)[number]>(() => readSetting('dash-store-view', STORE_VIEWS, 'board'));
  const pickRange = (r: Range) => { setRange(r); writeSetting('dash-range', r); };
  const pickStoreView = (v: (typeof STORE_VIEWS)[number]) => { setStoreView(v); writeSetting('dash-store-view', v); };

  const offersQ = useOffers();
  const bannersQ = useBanners();
  const customersQ = useCustomers();
  const staffQ = useStaff();
  const storesQ = useStores();
  const labelQ = useLabelHealth();
  const { disputesPendingCount } = useAdminBadges();

  const activeOffersList: any[] = offersQ.data?.data?.data || [];
  const count = (q: { isLoading: boolean; isError: boolean }, n: number) => (q.isLoading ? '…' : q.isError ? '–' : formatInteger(n));
  const totalStaleLabels: number = labelQ.data?.data?.data?.totalStale ?? 0;

  return (
    <>
      {/* ── How the launch is going ── */}
      <div className="dash-fade-in" style={{ animationDelay: '0ms' }}>
        <LaunchTracker />
      </div>

      {/* ── Range, KPIs and the chart ── */}
      <div className="dash-fade-in" style={{ animationDelay: '10ms' }}>
        <SectionHeader
          title="Activity"
          subtitle="Compared with the same stretch of the previous period, ending at the same point."
          action={{ label: 'View Transactions', to: '/transactions' }}
          right={<Segmented value={range} onChange={pickRange} label="Time range" options={RANGES.map((r) => ({ id: r, label: RANGE_LABEL[r] }))} />}
        />
        <KpiRow range={range} />
        <RangeChart range={range} />
      </div>

      {/* ── Stores ── */}
      <div className="dash-fade-in" style={{ animationDelay: '30ms' }}>
        <SectionHeader
          title={storeView === 'board' ? 'Store Health' : 'Store Performance - This Month'}
          subtitle={storeView === 'board' ? 'Every active store right now. Tiles that need a look come first.' : 'Every active store this month, including any with no sales.'}
          action={{ label: 'Full Leaderboard', to: '/leaderboard' }}
          right={<Segmented value={storeView} onChange={pickStoreView} label="Store view" options={[{ id: 'board', label: 'Board' }, { id: 'table', label: 'Table' }]} />}
        />
        {storeView === 'board' ? <StoreBoard /> : <StoreTable />}
      </div>

      {/* ── Transactions that need a decision + promotions ── */}
      <div className="dash-fade-in" style={{ animationDelay: '60ms' }}>
        <div style={s.twoColRow}>
          <ReviewFeed />
          {offersQ.isError || bannersQ.isError ? (
            <PanelError label="promotions" onRetry={() => { offersQ.refetch(); bannersQ.refetch(); }} />
          ) : offersQ.isLoading || bannersQ.isLoading ? (
            <SkeletonBox h={260} />
          ) : (
            <ActiveOffersPanel offers={activeOffersList} banners={bannersQ.data?.data?.data || []} />
          )}
        </div>
      </div>

      {/* ── Platform overview ── */}
      <div className="dash-fade-in" style={{ animationDelay: '90ms' }}>
        <SectionHeader title="Platform Overview" />
        <div style={s.statsGrid}>
          <StatCard icon="🏪" label="Active Stores" value={count(storesQ, (storesQ.data?.data?.data || []).length)} to="/stores" />
          <StatCard icon="🙋" label="Customers" value={count(customersQ, customersQ.data?.data?.data?.total || 0)} to="/customers" />
          <StatCard icon="👷" label="Staff Members" value={count(staffQ, (staffQ.data?.data?.data || []).length)} to="/staff" />
          <StatCard icon="📢" label="Active Offers" value={count(offersQ, activeOffersList.length)} to="/offers" />
          <StatCard icon="🖼️" label="Active Banners" value={count(bannersQ, (bannersQ.data?.data?.data || []).length)} to="/banners" />
          <StatCard icon="⚠️" label="Customer Disputes" value={formatInteger(disputesPendingCount)}
            valueColor={disputesPendingCount > 0 ? '#E63946' : undefined} to="/customers?tab=disputes" />
          <StatCard icon="🏷️" label="Labels Needing Print" value={count(labelQ, totalStaleLabels)}
            valueColor={totalStaleLabels > 0 ? '#b7791f' : undefined} to="/labels?tab=health" />
        </div>
      </div>
    </>
  );
}
