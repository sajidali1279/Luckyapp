import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
  AreaChart, Area, ComposedChart, ReferenceArea, ReferenceLine,
} from 'recharts';
import { billingApi, storesApi } from '../services/api';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { storeToday, isRealDate, daysBetween, dayLabel } from '../lib/storeDates';

type Range = '7d' | '30d' | '90d' | 'custom';
const RANGE_LABEL: Record<Range, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', custom: 'Custom' };
const RANGE_PREV_LABEL: Record<Exclude<Range, 'custom'>, string> = { '7d': 'the previous 7 days', '30d': 'the previous 30 days', '90d': 'the previous 90 days' };
const MAX_CUSTOM_DAYS = 366;

/** A whole-number percent change, "+12%"/"-8%"/"no change", never a stray "Infinity%" from a $0 base. */
function pctChange(now: number, prev: number): string | null {
  if (!prev) return now > 0 ? 'new this period' : null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return 'no change';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

// The bright green is fine for lines and bars; as text on white it is 2.2:1, so text uses this one (5.4:1).
const GREEN_TEXT = '#157A3E';

// Dates are the store's calendar days (Central time), the same days the server counts.
// A custom range says what is wrong instead of asking the server and showing a generic failure.
function checkCustom(from: string, to: string, today: string): { prompt?: string; problem?: string } {
  if (!from || !to) return { prompt: 'Pick a start and end date to see the charts.' };
  if (!isRealDate(from) || !isRealDate(to)) return { problem: 'Enter both dates as real calendar dates.' };
  if (to > today) return { problem: 'The end date cannot be after today.' };
  if (from > to) return { problem: 'The start date must be on or before the end date.' };
  if (daysBetween(from, to) + 1 > MAX_CUSTOM_DAYS) return { problem: 'Choose a range of one year or less.' };
  return {};
}

function fmt$(n: number) { return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const CATEGORY_COLORS = [PRIMARY, '#E63946', '#F4A261', '#2DC653', '#457b9d', '#6f42c1', '#fd7e14', '#20c997'];
const DOLLAR_SERIES = ['$', 'volume', 'cut', 'revenue', 'cashback', 'redeemed', 'amount'];

function catLabel(cat: string) { return cat.replace(/_/g, ' '); }

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const isDate = typeof label === 'string' && DATE_KEY.test(label);
  const shown = isDate ? `${dayLabel(label)}${label === storeToday() ? ' (so far today)' : ''}` : label;
  return (
    <div style={s.tooltip}>
      <div style={s.tooltipLabel}>{shown}</div>
      {payload.map((p: any) => {
        const isDollar = typeof p.value === 'number' && DOLLAR_SERIES.some((k) => p.name.toLowerCase().includes(k));
        return (
          <div key={p.name} style={{ color: p.color, fontSize: 15 }}>
            {p.name}: <strong>{isDollar ? fmt$(p.value) : p.value}</strong>
          </div>
        );
      })}
    </div>
  );
};

/** One sentence a screen reader can use instead of the picture. */
function summarize(daily: any[], key: string, what: string, money = false) {
  if (!daily.length) return `${what}: no data in this range.`;
  const f = (n: number) => (money ? fmt$(n) : n.toLocaleString('en-US'));
  const total = daily.reduce((a, d) => a + (d[key] || 0), 0);
  const top = daily.reduce((a, d) => ((d[key] || 0) > (a[key] || 0) ? d : a), daily[0]);
  return `${what}, ${dayLabel(daily[0].date)} to ${dayLabel(daily[daily.length - 1].date)}: ${f(total)} in total, highest on ${dayLabel(top.date)} at ${f(top[key] || 0)}.`;
}

function ChartCard({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <div style={s.chartCard}>
      <h2 style={s.chartTitle}>{title}</h2>
      <div role="img" aria-label={summary}>{children}</div>
    </div>
  );
}

// Every store in the chain, so a store with no sales shows up as a zero instead of vanishing.
function buildStoreRows(byStore: any[], allStores: any[]) {
  const seen = new Set(byStore.map((r) => r.storeId));
  const quiet = allStores
    .filter((st) => !seen.has(st.id))
    .map((st) => ({ storeId: st.id, storeName: st.name, transactions: 0, purchaseVolume: 0, pointsAwarded: 0, redemptions: 0, devCut: 0 }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
  return [...byStore, ...quiet];
}

export default function Analytics() {
  const [range, setRange] = useState<Range>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Drill down to one store: cleared automatically on a range change so a stale filter never silently follows
  // you to a different question ("was I still looking at just Store 4?").
  const [storeId, setStoreId] = useState<string | null>(null);
  useEffect(() => { setStoreId(null); }, [range]);

  const today = storeToday();
  const custom = range === 'custom' ? checkCustom(customFrom, customTo, today) : {};
  const ready = range !== 'custom' || (!custom.prompt && !custom.problem);
  // 7d/30d/90d ask the server for its own canonical definition (utils/dashboardWindows.ts) — the same one the
  // Dashboard's Business tab uses — which also brings a previous-period comparison along for free. Custom
  // sends plain from/to and gets no comparison, since "the previous period" is not well defined for an
  // arbitrary range someone typed in.
  const queryParams = range === 'custom' ? { from: customFrom, to: customTo, storeId: storeId || undefined } : { range, storeId: storeId || undefined };

  const { data, isLoading, isError, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ['analytics', queryParams],
    queryFn: () => billingApi.getAnalytics(queryParams),
    enabled: ready,
    placeholderData: keepPreviousData, // keep the last charts on screen while the next range loads
  });
  const storesQ = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });

  const analytics = data?.data?.data;
  const daily: any[] = analytics?.daily || [];
  const byStore: any[] = analytics?.byStore || [];
  const byCategory: any[] = analytics?.byCategory || [];
  const byHour: any[] = analytics?.byHour || [];
  const byWeekday: any[] = analytics?.byWeekday || [];
  const promotionMarkers: any[] = analytics?.promotionMarkers || [];
  const totals = analytics?.totals || {};
  const compare = analytics?.compare;
  const from = analytics?.range?.from ? analytics.range.from.slice(0, 10) : customFrom;
  const to = analytics?.range?.to ? analytics.range.to.slice(0, 10) : customTo;
  const allStores: any[] = (storesQ.data?.data?.data || []).filter((st: any) => st.isActive !== false);
  const storeRows = buildStoreRows(byStore, allStores);
  const selectedStoreName = storeId ? allStores.find((st) => st.id === storeId)?.name : undefined;

  // Cashback as a share of purchase volume, day by day — derived on the client from `daily`, no server change
  // needed for this one.
  const cashbackShareDaily = daily.map((d) => ({ date: d.date, cashbackShare: d.purchaseVolume > 0 ? parseFloat(((d.pointsAwarded / d.purchaseVolume) * 100).toFixed(2)) : 0 }));

  // The current period's daily series next to the previous period's, aligned by position (day 1 of this
  // period next to day 1 of the one before it) so a dashed line can be drawn behind the solid one.
  const dailyWithPrev = compare?.current?.series
    ? compare.current.series.map((c: any, i: number) => ({ ...daily.find((d) => d.date === c.key), date: c.key, prevTransactions: compare.previous?.series?.[i]?.transactions ?? 0, prevPurchaseVolume: compare.previous?.series?.[i]?.purchaseVolume ?? 0 }))
    : daily;

  const categoryPieData = byCategory.map((c) => ({ name: catLabel(c.category), value: c.purchaseVolume }));
  const noActivity = !!analytics && !(totals.transactions > 0) && !(totals.redemptions > 0);
  const updating = isFetching && isPlaceholderData;

  const [exporting, setExporting] = useState(false);
  async function handleExportCsv() {
    setExporting(true);
    try {
      const res = await billingApi.exportAnalyticsCsv(queryParams);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="(.+?)"/);
      a.download = match ? match[1] : 'analytics.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed - try again');
    } finally {
      setExporting(false);
    }
  }

  // Today is not finished, so its point is low. Shade it so the line does not read as a crash.
  const partialToday = daily.length > 1 && daily[daily.length - 1]?.date === today;
  const shade = (kind: 'line' | 'bar') => {
    if (!partialToday) return null;
    const last = daily[daily.length - 1].date;
    const prev = daily[daily.length - 2].date;
    return <ReferenceArea x1={kind === 'line' ? prev : last} x2={last} fill="#e9ecef" fillOpacity={0.9} />;
  };
  const dateTick = (v: string) => dayLabel(v);

  // A promotion that started inside the visible window, drawn as a thin vertical line so a spike can be tied
  // to it. Only on the daily line/area charts, where a day-by-day reader would actually look for the cause.
  const promotionLines = promotionMarkers.map((m) => (
    <ReferenceLine key={m.id} x={m.date} stroke="#6f42c1" strokeDasharray="2 4" label={{ value: m.title, position: 'insideTopRight', fontSize: 10, fill: '#6f42c1' }} />
  ));

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>📈 Analytics</h1>
          <p style={s.sub}>Transaction and revenue insights across all stores</p>
          {from && to && ready && (
            <p style={s.rangeNote}>{dayLabel(from)} to {dayLabel(to)}, counted in the stores' Central time</p>
          )}
        </div>

        {/* Date range controls */}
        <div style={s.rangeControls}>
          {(['7d', '30d', '90d', 'custom'] as Range[]).map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              style={{ ...s.rangeBtn, ...(range === r ? s.rangeBtnActive : {}) }}
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
          {analytics && (
            <button style={s.exportBtn} onClick={handleExportCsv} disabled={exporting} title="Download what is on screen as CSV">
              {exporting ? '⏳ Exporting…' : '⬇ Export CSV'}
            </button>
          )}
        </div>
      </div>

      {storeId && (
        <div style={s.storeChip}>
          Viewing: <strong>{selectedStoreName || 'one store'}</strong> only
          <button style={s.storeChipClear} onClick={() => setStoreId(null)} aria-label="Clear the store filter and show every store again">✕ Show every store</button>
        </div>
      )}

      {range === 'custom' && (
        <div style={s.customDateRow}>
          <div style={s.dateField}>
            <label style={s.label} htmlFor="analytics-from">From</label>
            <input id="analytics-from" style={s.dateInput} type="date" max={today} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div style={s.dateField}>
            <label style={s.label} htmlFor="analytics-to">To</label>
            <input id="analytics-to" style={s.dateInput} type="date" max={today} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          {custom.problem && <div role="alert" style={s.problem}>{custom.problem}</div>}
        </div>
      )}

      {range === 'custom' && !ready ? (
        <div style={s.loading}>{custom.prompt ?? 'Fix the dates above to see the charts.'}</div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={5} />
      ) : !analytics ? (
        <div style={s.loading}>No data available.</div>
      ) : (
        <div aria-busy={updating} style={{ opacity: updating ? 0.55 : 1, transition: 'opacity 0.15s' }}>
          {/* Summary cards, each against the same stretch of the previous period when one is available (a
              preset range, not Custom) */}
          <div style={s.summaryGrid}>
            <SummaryCard icon="🧾" label="Transactions" value={totals.transactions || 0} delta={compare && pctChange(compare.current.totals.transactions, compare.previous.totals.transactions)} />
            <SummaryCard icon="💵" label="Purchase Volume" value={fmt$(totals.purchaseVolume || 0)} delta={compare && pctChange(compare.current.totals.purchaseVolume, compare.previous.totals.purchaseVolume)} />
            <SummaryCard icon="💰" label="Your Dev Cut" value={fmt$(totals.devCut || 0)} green />
            <SummaryCard icon="🎁" label="Cashback Awarded" value={fmt$(totals.pointsAwarded || 0)} delta={compare && pctChange(compare.current.totals.cashbackIssued, compare.previous.totals.cashbackIssued)} />
            <SummaryCard icon="🏪" label="Stores Selling" value={byStore.length} sub={allStores.length ? `of ${allStores.length} active` : undefined} />
          </div>
          {compare && (
            <p style={s.compareNote}>Percent change is against {RANGE_PREV_LABEL[range as Exclude<Range, 'custom'>]}, the same length of time, ending at the same point.</p>
          )}

          {noActivity ? (
            <div style={s.chartCard}>
              <div style={s.emptyState}>
                No activity in this date range yet. Charts will populate once transactions or redemptions come in.
              </div>
            </div>
          ) : (
            <>
              {partialToday && (
                <p style={s.todayNote}><span style={s.todaySwatch} aria-hidden="true" /> The shaded stretch is today, which is not finished yet.</p>
              )}

              {/* Daily transactions line chart, with the previous period dashed behind it when one is available */}
              <ChartCard title="Daily Transactions" summary={summarize(daily, 'transactions', 'Daily transactions') + (compare ? ` Dashed line: the same days of ${RANGE_PREV_LABEL[range as Exclude<Range, 'custom'>]}.` : '')}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart accessibilityLayer={false} data={dailyWithPrev} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 13 }} tickFormatter={dateTick} />
                    <YAxis tick={{ fontSize: 13 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {shade('line')}
                    {promotionLines}
                    {compare && <Line type="monotone" dataKey="prevTransactions" stroke="#adb5bd" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="Previous period" />}
                    <Line type="monotone" dataKey="transactions" stroke="#E63946" strokeWidth={2} dot={false} name="Transactions" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Daily revenue line chart, same previous-period dashed line */}
              <ChartCard title="Daily Revenue (Purchase Volume & Dev Cut)" summary={summarize(daily, 'purchaseVolume', 'Daily purchase volume', true) + (compare ? ` Dashed line: the same days of ${RANGE_PREV_LABEL[range as Exclude<Range, 'custom'>]}.` : '')}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart accessibilityLayer={false} data={dailyWithPrev} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 13 }} tickFormatter={dateTick} />
                    <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {shade('line')}
                    {promotionLines}
                    {compare && <Line type="monotone" dataKey="prevPurchaseVolume" stroke="#adb5bd" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="Previous period" />}
                    <Line type="monotone" dataKey="purchaseVolume" stroke={PRIMARY} strokeWidth={2} dot={false} name="Purchase Volume" />
                    <Line type="monotone" dataKey="devCut" stroke="#2DC653" strokeWidth={2} dot={false} name="Dev Cut" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Cashback as a share of purchase volume, day by day: explains WHY the trend moves, not just that it does */}
              <ChartCard title="Cashback Share of Sales" summary={summarize(cashbackShareDaily, 'cashbackShare', 'Cashback as a percent of purchase volume')}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart accessibilityLayer={false} data={cashbackShareDaily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 13 }} tickFormatter={dateTick} />
                    <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: any) => `${v}%`} labelFormatter={(v) => dayLabel(v)} />
                    <Line type="monotone" dataKey="cashbackShare" stroke="#F4A261" strokeWidth={2} dot={false} name="Cashback share" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Daily cashback area chart */}
              <ChartCard title="Cashback Awarded Trend" summary={summarize(daily, 'pointsAwarded', 'Daily cashback awarded', true)}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart accessibilityLayer={false} data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="pointsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F4A261" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#F4A261" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 13 }} tickFormatter={dateTick} />
                    <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    {shade('line')}
                    <Area type="monotone" dataKey="pointsAwarded" stroke="#F4A261" strokeWidth={2} fill="url(#pointsGrad)" name="Cashback Awarded" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Daily redemptions - count (bars) + $ redeemed (line) on a second axis */}
              <ChartCard title="Redemptions Trend" summary={summarize(daily, 'redemptions', 'Daily redemptions')}>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart accessibilityLayer={false} data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 13 }} tickFormatter={dateTick} />
                    <YAxis yAxisId="left" tick={{ fontSize: 13 }} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 13 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {shade('bar')}
                    <Bar yAxisId="left" dataKey="redemptions" fill="#6f42c1" name="Redemptions" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="redeemedAmount" stroke="#2DC653" strokeWidth={2} name="Redeemed Amount" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Per-store bar charts: comparing stores against each other only makes sense while looking at all
                  of them, so these step aside once drilled down to one. Click a bar to drill in. */}
              {storeRows.length > 0 && !storeId && (
                <ChartCard
                  title="Transactions by Store"
                  summary={`Transactions by store, click a bar to see just that store: ${storeRows.map((r) => `${r.storeName} ${r.transactions}`).join(', ')}.`}
                >
                  <ResponsiveContainer width="100%" height={Math.max(300, storeRows.length * 36)}>
                    <BarChart accessibilityLayer={false} data={storeRows} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 13 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="storeName" tick={{ fontSize: 13 }} width={120} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="transactions" fill={PRIMARY} name="Transactions" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => d.transactions > 0 && setStoreId(d.storeId)} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Per-store purchase volume bar chart */}
              {storeRows.length > 0 && !storeId && (
                <ChartCard
                  title="Purchase Volume by Store ($)"
                  summary={`Purchase volume by store, click a bar to see just that store: ${storeRows.map((r) => `${r.storeName} ${fmt$(r.purchaseVolume)}`).join(', ')}.`}
                >
                  <ResponsiveContainer width="100%" height={Math.max(300, storeRows.length * 36)}>
                    <BarChart accessibilityLayer={false} data={storeRows} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 13 }} tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="storeName" tick={{ fontSize: 13 }} width={120} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="purchaseVolume" fill="#E63946" name="Purchase Volume" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => d.purchaseVolume > 0 && setStoreId(d.storeId)} />
                      <Bar dataKey="devCut" fill="#2DC653" name="Dev Cut" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => d.purchaseVolume > 0 && setStoreId(d.storeId)} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Purchase volume by category */}
              {byCategory.length > 0 && (
                <ChartCard
                  title="Purchase Volume by Category"
                  summary={`Purchase volume by category: ${byCategory.map((c) => `${catLabel(c.category)} ${fmt$(c.purchaseVolume)}`).join(', ')}.`}
                >
                  <ResponsiveContainer width="100%" height={Math.max(240, byCategory.length * 42)}>
                    <BarChart accessibilityLayer={false} data={byCategory} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 13 }} tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 13 }} tickFormatter={catLabel} width={110} />
                      <Tooltip content={<CustomTooltip />} formatter={(v: any) => fmt$(v)} />
                      <Bar dataKey="purchaseVolume" name="Purchase Volume" radius={[0, 4, 4, 0]}>
                        {byCategory.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Category mix - % share of purchase volume */}
              {categoryPieData.length > 0 && (
                <ChartCard
                  title="Category Mix"
                  summary={`Share of purchase volume by category: ${categoryPieData.map((c) => `${c.name.toLowerCase()} ${fmt$(c.value)}`).join(', ')}.`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, flexWrap: 'wrap' as const }}>
                    <PieChart accessibilityLayer={false} width={280} height={280}>
                      <Pie data={categoryPieData} cx={130} cy={130} outerRadius={110} dataKey="value" label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                        {categoryPieData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt$(v)} />
                    </PieChart>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {categoryPieData.map((entry, i) => (
                        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 14, height: 14, borderRadius: 4, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: PRIMARY, textTransform: 'capitalize' as const }}>{entry.name.toLowerCase()}</div>
                            <div style={{ color: TEXT_MUTED, fontSize: 15 }}>{fmt$(entry.value)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartCard>
              )}

              {/* Cashback and the developer cut, as a share of sales (this replaces a pie that showed $NaN) */}
              {totals.transactions > 0 && <CutCard totals={totals} />}

              {/* Busiest hours and days: the same idea as the bar charts above, but by time instead of by store */}
              {byHour.some((h: any) => h.transactions > 0) && (
                <ChartCard title="Busiest Hours" summary={`Transactions by hour of day, Central time: ${byHour.map((h: any) => `${h.hour}:00 ${h.transactions}`).join(', ')}.`}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart accessibilityLayer={false} data={byHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 12 }} tickFormatter={(h) => `${h}:00`} interval={1} />
                      <YAxis tick={{ fontSize: 13 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(h) => `${h}:00-${h}:59 Central`} />
                      <Bar dataKey="transactions" fill={PRIMARY} name="Transactions" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {byWeekday.some((w: any) => w.transactions > 0) && (
                <ChartCard title="Busiest Days of the Week" summary={`Transactions by day of the week: ${byWeekday.map((w: any) => `${w.label} ${w.transactions}`).join(', ')}.`}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart accessibilityLayer={false} data={byWeekday} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 13 }} />
                      <YAxis tick={{ fontSize: 13 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="transactions" fill="#E63946" name="Transactions" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Store table */}
              {storeRows.length > 0 && (
                <div style={s.chartCard}>
                  <h2 style={s.chartTitle}>Store Breakdown Table</h2>
                  <Table style={s.table}>
                    <TableHeader>
                      <TableRow>
                        {['Store', 'Transactions', 'Purchase Volume', 'Dev Cut'].map((h) => (
                          <TableHead key={h} style={s.th}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {storeRows.map((store, i) => (
                        <TableRow key={store.storeId} style={i % 2 === 0 ? s.trEven : {}}>
                          <TableCell style={s.td}>
                            {!storeId && store.transactions > 0 ? (
                              <button style={s.storeLinkBtn} onClick={() => setStoreId(store.storeId)}>{store.storeName}</button>
                            ) : store.storeName}
                          </TableCell>
                          <TableCell style={{ ...s.td, ...s.tdNum }}>{store.transactions}</TableCell>
                          <TableCell style={{ ...s.td, ...s.tdNum }}>{fmt$(store.purchaseVolume)}</TableCell>
                          <TableCell style={{ ...s.td, ...s.tdNum, color: GREEN_TEXT, fontWeight: 700 }}>{fmt$(store.devCut)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, green, sub, delta }: { icon: string; label: string; value: any; green?: boolean; sub?: string; delta?: string | null }) {
  const deltaColor = !delta ? TEXT_MUTED : delta.startsWith('+') ? GREEN_TEXT : delta.startsWith('-') ? '#C1121F' : TEXT_MUTED;
  return (
    <div style={s.summaryCard}>
      <div style={s.summaryIcon}>{icon}</div>
      <div>
        <div style={s.summaryLabel}>{label}</div>
        <div style={{ ...s.summaryValue, ...(green ? { color: GREEN_TEXT } : {}) }}>{value}</div>
        {sub && <div style={s.summarySub}>{sub}</div>}
        {delta && <div style={{ fontSize: 13, fontWeight: 700, color: deltaColor, marginTop: 2 }}>{delta.startsWith('+') ? '▲' : delta.startsWith('-') ? '▼' : ''} {delta} vs previous period</div>}
      </div>
    </div>
  );
}

function CutCard({ totals }: { totals: any }) {
  const sales = totals.purchaseVolume || 0;
  const rows = [
    { label: 'Cashback to customers', value: totals.pointsAwarded || 0, color: '#F4A261' },
    { label: 'Your dev cut', value: totals.devCut || 0, color: '#2DC653' },
  ];
  const max = Math.max(...rows.map((r) => r.value), 0.01);
  const share = (n: number) => (sales > 0 ? `${((n / sales) * 100).toFixed(1)}% of sales` : 'no sales yet');
  return (
    <div style={s.chartCard}>
      <h2 style={s.chartTitle}>Cashback and Your Cut</h2>
      <p style={{ color: TEXT_MUTED, fontSize: 14, margin: '-8px 0 16px' }}>Out of {fmt$(sales)} in purchases in this range.</p>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6, flexWrap: 'wrap' as const }}>
            <span>{r.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt$(r.value)} <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>· {share(r.value)}</span></span>
          </div>
          <div style={{ height: 10, background: '#f1f3f5', borderRadius: 6, overflow: 'hidden' }} aria-hidden="true">
            <div style={{ width: `${r.value > 0 ? Math.max((r.value / max) * 100, 2) : 0}%`, height: '100%', background: r.color, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 26, fontWeight: 800, color: PRIMARY, margin: 0 },
  sub: { color: TEXT_MUTED, marginTop: 4 },
  rangeNote: { color: TEXT_MUTED, fontSize: 14, marginTop: 4 },

  rangeControls: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  rangeBtn: { background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 15, fontWeight: 500, color: TEXT_MUTED },
  rangeBtnActive: { background: PRIMARY, color: '#fff', border: '1px solid #1D3557', fontWeight: 700 },
  exportBtn: { background: PRIMARY, border: '1.5px solid #1D3557', color: '#fff', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' as const },
  compareNote: { color: TEXT_MUTED, fontSize: 13, margin: '-20px 0 20px' },

  storeChip: { display: 'flex', alignItems: 'center', gap: 10, background: '#eef4ff', border: '1px solid #cfe0ff', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 14, color: PRIMARY, flexWrap: 'wrap' as const },
  storeChipClear: { background: 'none', border: '1px solid #adb5bd', color: TEXT_MUTED, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  storeLinkBtn: { background: 'none', border: 'none', padding: 0, color: PRIMARY, fontWeight: 600, cursor: 'pointer', fontSize: 14, textDecoration: 'underline', fontFamily: 'inherit' },

  customDateRow: { display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' },
  dateField: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontWeight: 600, fontSize: 15, color: '#212529' },
  dateInput: { padding: '9px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14 },
  problem: { background: '#fff8e1', border: '1px solid #f5d98a', color: '#8a5a00', borderRadius: 10, padding: '9px 14px', fontSize: 14, fontWeight: 600 },

  loading: { color: TEXT_MUTED, textAlign: 'center', padding: 80, fontSize: 16 },
  emptyState: { color: TEXT_MUTED, textAlign: 'center', padding: 40, fontSize: 15 },
  todayNote: { color: TEXT_MUTED, fontSize: 14, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 },
  todaySwatch: { width: 14, height: 14, borderRadius: 3, background: '#e9ecef', display: 'inline-block' },

  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 },
  summaryCard: { background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #f0f1f2' },
  summaryIcon: { fontSize: 28, flexShrink: 0 },
  summaryLabel: { color: TEXT_MUTED, fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 22, fontWeight: 800, color: PRIMARY, marginTop: 2 },
  summarySub: { color: TEXT_MUTED, fontSize: 13, marginTop: 2 },

  chartCard: { background: '#fff', borderRadius: 16, padding: 28, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2' },
  chartTitle: { fontSize: 17, fontWeight: 700, color: PRIMARY, marginTop: 0, marginBottom: 20 },

  tooltip: { background: '#fff', border: '1px solid #dee2e6', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  tooltipLabel: { fontWeight: 700, color: PRIMARY, marginBottom: 6, fontSize: 15 },

  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left', padding: '10px 16px', fontSize: 14, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dee2e6' },
  td: { padding: '12px 16px', fontSize: 14, color: '#212529', borderBottom: '1px solid #f0f1f2' },
  tdNum: { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' },
  trEven: { background: '#fafbfc' },
};
