// The Analytics page's deeper tabs (Dev Admin, 2026-10-08): customers and retention, promotions and challenges, the points
// economy, staff and quality, busy hours with a 7-day forecast, and store scorecards. Each tab asks its own endpoint with the
// page's window (range or from/to) and store, so only the tab on screen is loaded.
import type { CSSProperties, ReactNode } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Area, Line } from 'recharts';
import { insightsApi, type InsightParams } from '../../services/api';
import { Card, SectionTitle, StatTile, Badge, Notice, EmptyState } from '../kit';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import ErrorState from '../ErrorState';
import CardSkeleton from '../CardSkeleton';
import { C, FONT, PRIMARY } from '../../lib/theme';
import { dayLabel } from '../../lib/storeDates';

const fmt$ = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => (n ?? 0).toLocaleString('en-US');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourText = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const changeText = (pct: number | null | undefined) => (pct == null ? null : pct === 0 ? 'no change' : `${pct > 0 ? '+' : ''}${pct}%`);

function useInsight<T = any>(key: string, fn: () => Promise<any>, enabled = true) {
  const q = useQuery({ queryKey: ['insights', key], queryFn: fn, enabled, placeholderData: keepPreviousData });
  return { ...q, d: q.data?.data?.data as T | undefined };
}

/** Loading, failed, or the tab's body once the data is here. */
function Loaded({ q, children }: { q: { isLoading: boolean; isError: boolean; refetch: () => void; d: unknown; isFetching: boolean }; children: () => ReactNode }) {
  if (q.isError) return <ErrorState onRetry={q.refetch} />;
  if (q.isLoading || !q.d) return <CardSkeleton count={4} />;
  return <div aria-busy={q.isFetching} style={{ opacity: q.isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>{children()}</div>;
}

const tiles: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 20 };
const two: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, marginBottom: 16 };
const th: CSSProperties = { fontSize: FONT.caption, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' };
const num: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const note: CSSProperties = { fontSize: FONT.small, color: C.muted, margin: '-4px 0 12px', lineHeight: 1.5 };
const scroll: CSSProperties = { overflowX: 'auto' };

function Bars({ rows, color = PRIMARY }: { rows: { label: string; value: number; text?: string }[]; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 130px) 1fr auto', alignItems: 'center', gap: 10, fontSize: FONT.body }}>
          <span style={{ color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div style={{ height: 8, background: C.hover, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
            <div style={{ width: `${r.value > 0 ? Math.max((r.value / max) * 100, 2) : 0}%`, height: '100%', background: color, borderRadius: 4 }} />
          </div>
          <span style={{ ...num, color: C.text, fontWeight: 600 }}>{r.text ?? fmtN(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Customers ───────────────────────────────────────────────────────────────

export function CustomersTab({ params, enabled }: { params: InsightParams; enabled: boolean }) {
  const q = useInsight(`customers-${JSON.stringify(params)}`, () => insightsApi.customers(params), enabled);
  return (
    <Loaded q={q}>{() => {
      const d: any = q.d;
      const lapsedTotal = d.lapsed.d30 + d.lapsed.d60 + d.lapsed.d90;
      return (
        <>
          <div style={tiles}>
            <StatTile label="Active customers" value={fmtN(d.active)} hint={changeText(d.activeChange) ? `${changeText(d.activeChange)} vs the period before` : 'Bought at least once'} />
            <StatTile label="New" value={fmtN(d.newCustomers)} hint="First purchase ever in this range" />
            <StatTile label="Returning" value={fmtN(d.returning)} hint="Bought before this range too" />
            <StatTile label="Repeat rate" value={`${d.repeatRate}%`} hint={`${fmtN(d.repeaters)} came back 2+ times`} />
            <StatTile label="Sign-ups" value={fmtN(d.signups)} hint="New accounts in this range" />
          </div>

          <Card style={{ marginBottom: 16 }}>
            <SectionTitle>Do they come back? Monthly groups</SectionTitle>
            <p style={note}>Customers grouped by the month of their first purchase. Each later column is the share of that group who bought again that month.</p>
            {d.cohorts.length === 0 ? <EmptyState title="No first purchases in the last 6 months" /> : (
              <div style={scroll}>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead style={th}>First bought</TableHead><TableHead style={{ ...th, ...num }}>Customers</TableHead>
                    {[1, 2, 3, 4, 5].map((m) => <TableHead key={m} style={{ ...th, ...num }}>{m} month{m > 1 ? 's' : ''} later</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.cohorts.map((c: any) => (
                      <TableRow key={c.month}>
                        <TableCell style={{ fontWeight: 600 }}>{new Date(`${c.month}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</TableCell>
                        <TableCell style={num}>{fmtN(c.size)}</TableCell>
                        {[0, 1, 2, 3, 4].map((i) => {
                          const v = c.retention[i];
                          return <TableCell key={i} style={{ ...num, background: v == null ? undefined : `rgba(29, 53, 87, ${Math.min(v / 60, 1) * 0.55})`, color: v != null && v >= 35 ? '#fff' : C.text }}>{v == null ? '' : `${v}%`}</TableCell>;
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <div style={two}>
            <Card>
              <SectionTitle count={lapsedTotal}>Customers to win back</SectionTitle>
              <p style={note}>They have bought before but not lately. A promotion for Win-back customers (Offers, Who it is for) can bring them back.</p>
              <Bars color={C.danger} rows={[{ label: '30 to 59 days', value: d.lapsed.d30 }, { label: '60 to 89 days', value: d.lapsed.d60 }, { label: '90+ days', value: d.lapsed.d90 }]} />
            </Card>
            <Card>
              <SectionTitle>Tiers and languages</SectionTitle>
              <p style={note}>Every customer account today.</p>
              <Bars rows={d.tiers.sort((a: any, b: any) => b.count - a.count).map((t: any) => ({ label: t.tier.charAt(0) + t.tier.slice(1).toLowerCase(), value: t.count }))} />
              <div style={{ height: 14 }} />
              <Bars color={C.warning} rows={d.languages.map((l: any) => ({ label: l.language === 'es' ? 'Spanish' : l.language === 'en' ? 'English' : l.language, value: l.count }))} />
            </Card>
          </div>
        </>
      );
    }}</Loaded>
  );
}

// ─── Promotions and challenges ───────────────────────────────────────────────

function LiftCell({ lift }: { lift: any }) {
  if (!lift) return <span style={{ color: C.muted }}>-</span>;
  if (lift.tooFewToTell) return <Badge title="Fewer than 20 sales before it started, here or in the comparison">Too few sales to tell</Badge>;
  if (lift.extraSales <= 0) return <Badge tone="warning" title={lift.controlText ? `Compared with ${lift.controlText}` : 'Compared with the time before'}>No extra sales</Badge>;
  return (
    <span title={lift.controlText ? `Compared with ${lift.controlText}` : 'Compared with the time before'}>
      <Badge tone="success">+{fmt$(lift.extraSales)}</Badge>
      {lift.perDollar != null && <span style={{ fontSize: FONT.caption, color: C.muted, marginLeft: 6 }}>{fmt$(lift.perDollar)} per $1</span>}
    </span>
  );
}

export function PromotionsTab({ params, enabled }: { params: InsightParams; enabled: boolean }) {
  const q = useInsight(`promotions-${JSON.stringify(params)}`, () => insightsApi.promotions(params), enabled);
  return (
    <Loaded q={q}>{() => {
      const d: any = q.d;
      return (
        <>
          <div style={tiles}>
            <StatTile label="Sales with a promotion" value={`${d.promotionSalesShare}%`} hint="Of all purchase dollars" />
            <StatTile label="Extra cashback paid" value={fmt$(d.extraCashback)} hint="On top of the normal rate" />
            <StatTile label="Promotions used" value={fmtN(d.promotions.length)} />
            <StatTile label="Challenges running" value={fmtN(d.challenges.length)} />
          </div>
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle count={d.promotions.length}>Promotions</SectionTitle>
            <p style={note}>Extra sales compare the promotion's category and stores with what was expected from the time before and from the stores or categories it did not touch (the same way as a promotion's Results).</p>
            {d.promotions.length === 0 ? <EmptyState title="No sales with a promotion in this range" /> : (
              <div style={scroll}>
                <Table>
                  <TableHeader><TableRow>
                    {['Promotion', 'Where', 'Sales', 'Sales $', 'Extra cashback', 'Extra sales'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i >= 2 && i <= 4 ? num : {}) }}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.promotions.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell style={{ fontWeight: 600 }}>{p.title}{p.category && <div style={{ fontSize: FONT.caption, color: C.muted, fontWeight: 400 }}>{p.category.replace(/_/g, ' ').toLowerCase()}</div>}</TableCell>
                        <TableCell style={{ color: C.text2 }}>{p.where}</TableCell>
                        <TableCell style={num}>{fmtN(p.sales)}</TableCell>
                        <TableCell style={num}>{fmt$(p.salesAmount)}</TableCell>
                        <TableCell style={num}>{fmt$(p.extraCashback)}</TableCell>
                        <TableCell><LiftCell lift={p.lift} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
          <Card>
            <SectionTitle count={d.challenges.length}>Challenges</SectionTitle>
            {d.challenges.length === 0 ? <EmptyState title="No challenges ran in this range" /> : (
              <div style={scroll}>
                <Table>
                  <TableHeader><TableRow>
                    {['Challenge', 'Where', 'Joined', 'Completed', 'Rewards paid'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i >= 2 ? num : {}) }}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.challenges.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell style={{ fontWeight: 600 }}>{c.title}</TableCell>
                        <TableCell style={{ color: C.text2 }}>{c.where}</TableCell>
                        <TableCell style={num}>{fmtN(c.participants)}</TableCell>
                        <TableCell style={num}>{fmtN(c.completions)}{c.participants > 0 && <span style={{ color: C.muted }}> ({Math.round((c.completions / c.participants) * 100)}%)</span>}</TableCell>
                        <TableCell style={num}>{fmt$(c.paid)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      );
    }}</Loaded>
  );
}

// ─── Points economy ──────────────────────────────────────────────────────────

export function PointsTab({ params, enabled }: { params: InsightParams; enabled: boolean }) {
  const q = useInsight(`points-${JSON.stringify(params)}`, () => insightsApi.points(params), enabled);
  return (
    <Loaded q={q}>{() => {
      const d: any = q.d;
      return (
        <>
          <div style={tiles}>
            <StatTile label="Cashback earned" value={fmt$(d.earned)} hint={`${fmtN(Math.round(d.earned * 100))} points`} />
            <StatTile label="Redeemed" value={fmt$(d.redeemed)} hint="Credits and rewards" />
            <StatTile label="Redemption rate" value={`${d.redemptionRate}%`} hint="Redeemed for each $1 earned" />
            <StatTile label="Customers are holding" value={fmt$(d.outstanding)} hint="Every balance today: what the stores still owe" />
          </div>
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle>Earned and redeemed each day</SectionTitle>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={d.daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" tickFormatter={(v) => dayLabel(v)} tick={{ fontSize: 12, fill: C.muted }} minTickGap={18} />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12, fill: C.muted }} width={56} />
                <Tooltip labelFormatter={(v) => dayLabel(String(v))} formatter={(v: any, n: any) => [fmt$(Number(v)), n]} />
                <Legend />
                <Bar dataKey="earned" name="Earned" fill={PRIMARY} radius={[3, 3, 0, 0]} />
                <Bar dataKey="redeemed" name="Redeemed" fill={C.brand} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <div style={two}>
            <Card>
              <SectionTitle>Balances today</SectionTitle>
              <p style={note}>How many customers hold how many points. Big balances that are never spent are customers worth reminding.</p>
              <Bars rows={d.balanceBuckets.map((b: any) => ({ label: b.label, value: b.customers }))} />
            </Card>
            <Card>
              <SectionTitle>Rewards taken</SectionTitle>
              {d.topRewards.length === 0 ? <EmptyState title="No rewards taken in this range" /> : (
                <Bars color={C.success} rows={d.topRewards.map((r: any) => ({ label: r.title, value: r.count, text: `${fmtN(r.count)} (${fmtN(r.points)} pts)` }))} />
              )}
            </Card>
          </div>
        </>
      );
    }}</Loaded>
  );
}

// ─── Staff and quality ───────────────────────────────────────────────────────

export function StaffTab({ params, enabled }: { params: InsightParams; enabled: boolean }) {
  const q = useInsight(`staff-${JSON.stringify(params)}`, () => insightsApi.staff(params), enabled);
  return (
    <Loaded q={q}>{() => {
      const d: any = q.d;
      const total = d.staff.reduce((n: number, s: any) => n + s.sales, 0);
      const flaggedAvg = d.staff.length ? d.staff.reduce((n: number, s: any) => n + s.flaggedRate, 0) / d.staff.length : 0;
      return (
        <>
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle count={d.staff.length}>Who gives the points</SectionTitle>
            <p style={note}>Sales each person entered (customers' own receipt claims and challenge rewards are not counted). Flagged and rejected rates well above the others are worth a look.</p>
            {d.staff.length === 0 ? <EmptyState title="No sales entered in this range" /> : (
              <div style={scroll}>
                <Table>
                  <TableHeader><TableRow>
                    {['Person', 'Store', 'Sales', 'Share', 'Sales $', 'Average', 'Flagged', 'Rejected', 'Rating'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i >= 2 ? num : {}) }}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.staff.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell style={{ fontWeight: 600 }}>{s.name}</TableCell>
                        <TableCell style={{ color: C.text2 }}>{s.store || '-'}</TableCell>
                        <TableCell style={num}>{fmtN(s.sales)}</TableCell>
                        <TableCell style={num}>{total ? `${Math.round((s.sales / total) * 100)}%` : '-'}</TableCell>
                        <TableCell style={num}>{fmt$(s.amount)}</TableCell>
                        <TableCell style={num}>{fmt$(s.avgTicket)}</TableCell>
                        <TableCell style={num}>{s.flaggedRate > Math.max(5, flaggedAvg * 2) ? <Badge tone="danger">{s.flaggedRate}%</Badge> : `${s.flaggedRate}%`}</TableCell>
                        <TableCell style={num}>{s.rejectedRate > 10 ? <Badge tone="warning">{s.rejectedRate}%</Badge> : `${s.rejectedRate}%`}</TableCell>
                        <TableCell style={num}>{s.rating != null ? <span title={`${s.ratings} rating${s.ratings === 1 ? '' : 's'}`}>★ {s.rating}</span> : <span style={{ color: C.muted }}>-</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
          <Card>
            <SectionTitle>Points disputes by store</SectionTitle>
            {d.disputes.length === 0 ? <EmptyState title="No disputes opened in this range" /> : (
              <div style={scroll}>
                <Table>
                  <TableHeader><TableRow>
                    {['Store', 'Opened', 'Resolved', 'Waiting', 'Time to resolve'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i >= 1 ? num : {}) }}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.disputes.sort((a: any, b: any) => b.opened - a.opened).map((r: any) => (
                      <TableRow key={r.store}>
                        <TableCell style={{ fontWeight: 600 }}>{r.store}</TableCell>
                        <TableCell style={num}>{fmtN(r.opened)}</TableCell>
                        <TableCell style={num}>{fmtN(r.resolved)}</TableCell>
                        <TableCell style={num}>{r.pending > 0 ? <Badge tone="warning">{r.pending}</Badge> : 0}</TableCell>
                        <TableCell style={num}>{r.avgHoursToResolve == null ? '-' : r.avgHoursToResolve < 24 ? `${r.avgHoursToResolve} h` : `${Math.round((r.avgHoursToResolve / 24) * 10) / 10} days`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      );
    }}</Loaded>
  );
}

// ─── Busy hours and forecast ─────────────────────────────────────────────────

const HEAT_ORDER = [1, 2, 3, 4, 5, 6, 0];   // Monday first

export function BusyTab({ params, enabled }: { params: InsightParams; enabled: boolean }) {
  const heat = useInsight(`heatmap-${JSON.stringify(params)}`, () => insightsApi.heatmap(params), enabled);
  const fc = useInsight(`forecast-${params.storeId ?? ''}`, () => insightsApi.forecast({ storeId: params.storeId }));
  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Busy hours</SectionTitle>
        <p style={note}>Sales by day of the week and hour, store time. Darker is busier; hover a square for the numbers. Use it for staffing and for timing a promotion.</p>
        <Loaded q={heat}>{() => {
          const grid: { sales: number; amount: number }[][] = (heat.d as any).grid;
          const max = Math.max(1, ...grid.flat().map((c) => c.sales));
          let best = { day: 0, hour: 0, sales: 0 };
          grid.forEach((row, day) => row.forEach((c, hour) => { if (c.sales > best.sales) best = { day, hour, sales: c.sales }; }));
          return (
            <>
              {best.sales > 0 && <Notice style={{ marginBottom: 12 }}>Busiest: <strong>{WEEKDAYS[best.day]} around {hourText(best.hour)}</strong>, {fmtN(best.sales)} sales in this range.</Notice>}
              <div style={scroll}>
                <div role="table" aria-label="Sales by weekday and hour" style={{ display: 'grid', gridTemplateColumns: '40px repeat(24, minmax(22px, 1fr))', gap: 2, minWidth: 620 }}>
                  <div role="row" style={{ display: 'contents' }}>
                    <span />
                    {Array.from({ length: 24 }, (_, h) => <span key={h} role="columnheader" style={{ fontSize: 10, color: C.muted, textAlign: 'center' }}>{h % 3 === 0 ? hourText(h) : ''}</span>)}
                  </div>
                  {HEAT_ORDER.map((day) => (
                    <div role="row" key={day} style={{ display: 'contents' }}>
                      <span role="rowheader" style={{ fontSize: FONT.caption, color: C.text2, fontWeight: 600, alignSelf: 'center' }}>{WEEKDAYS[day]}</span>
                      {grid[day].map((c, h) => (
                        <span key={h} role="cell" title={`${WEEKDAYS[day]} ${hourText(h)}: ${fmtN(c.sales)} sales, ${fmt$(c.amount)}`}
                          style={{ height: 24, borderRadius: 3, background: c.sales ? `rgba(29, 53, 87, ${0.12 + (c.sales / max) * 0.88})` : C.hover }} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        }}</Loaded>
      </Card>

      <Card>
        <SectionTitle>Next 7 days</SectionTitle>
        <p style={note}>Expected sales from the same weekday over the last 8 weeks, recent weeks counting more. The band is the usual low to high. It does not know about holidays or promotions you have not started yet.</p>
        <Loaded q={fc}>{() => {
          const f: any = fc.d;
          const rows = f.days.map((x: any) => ({ ...x, band: [x.low, x.high] }));
          return (
            <>
              {!f.enoughHistory && <Notice tone="warning" style={{ marginBottom: 12 }}>Fewer than 50 sales in the last 8 weeks{params.storeId ? ' at this store' : ''}, so treat this as a rough guess.</Notice>}
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tickFormatter={(v) => `${WEEKDAYS[new Date(`${v}T12:00:00`).getDay()]} ${dayLabel(v)}`} tick={{ fontSize: 12, fill: C.muted }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12, fill: C.muted }} width={60} />
                  <Tooltip labelFormatter={(v) => dayLabel(String(v))} formatter={(v: any, n: any) => [Array.isArray(v) ? `${fmt$(v[0])} to ${fmt$(v[1])}` : fmt$(Number(v)), n]} />
                  <Area dataKey="band" name="Usual range" fill="#d3dcea" stroke="none" />
                  <Line dataKey="amount" name="Expected sales" stroke={PRIMARY} strokeWidth={2.5} dot />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ ...scroll, marginTop: 8 }}>
                <Table>
                  <TableHeader><TableRow>
                    {['Day', 'Expected sales', 'Usual range', 'Transactions', 'Cashback'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i ? num : {}) }}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {f.days.map((x: any) => (
                      <TableRow key={x.date}>
                        <TableCell style={{ fontWeight: 600 }}>{WEEKDAYS[x.weekday]} {dayLabel(x.date)}</TableCell>
                        <TableCell style={num}>{fmt$(x.amount)}</TableCell>
                        <TableCell style={{ ...num, color: C.muted }}>{fmt$(x.low)} to {fmt$(x.high)}</TableCell>
                        <TableCell style={num}>{fmtN(x.sales)}</TableCell>
                        <TableCell style={num}>{fmt$(x.cashback)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          );
        }}</Loaded>
      </Card>
    </>
  );
}

// ─── Store scorecards ────────────────────────────────────────────────────────

export function ScorecardsTab({ onPickStore }: { onPickStore: (id: string) => void }) {
  const q = useInsight('scorecards', () => insightsApi.scorecards());
  return (
    <Loaded q={q}>{() => {
      const d: any = q.d;
      const vs = (v: number, avg: number, higherIsBetter = true) => {
        if (!avg) return C.text;
        const r = v / avg;
        return (higherIsBetter ? r >= 1.15 : r <= 0.85) ? C.success : (higherIsBetter ? r <= 0.85 : r >= 1.15) ? C.danger : C.text;
      };
      return (
        <Card>
          <SectionTitle count={d.cards.length}>Store scorecards, last 30 days</SectionTitle>
          <p style={note}>Every open store against the 30 days before and against the chain average (green: well above, red: well below; for cashback and flagged, lower is better). This tab always shows the last 30 days. Click a store to see the other tabs for just that store.</p>
          <div style={scroll}>
            <Table>
              <TableHeader><TableRow>
                {['#', 'Store', 'Sales $', 'Growth', 'Transactions', 'Customers', 'Repeat', 'Average', 'Cashback', 'Flagged'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i >= 2 ? num : {}) }}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {d.cards.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell style={{ color: C.muted, fontWeight: 600 }}>{c.rank}</TableCell>
                    <TableCell>
                      <button type="button" onClick={() => onPickStore(c.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: PRIMARY, fontWeight: 600, fontSize: FONT.body, textDecoration: 'underline', fontFamily: 'inherit', textAlign: 'left' }}>{c.name}</button>
                      {c.city && <div style={{ fontSize: FONT.caption, color: C.muted }}>{c.city}</div>}
                    </TableCell>
                    <TableCell style={{ ...num, color: vs(c.amount, d.chain.amount), fontWeight: 600 }}>{fmt$(c.amount)}</TableCell>
                    <TableCell style={num}>{c.growth == null ? <span style={{ color: C.muted }}>new</span> : <Badge tone={c.growth > 0 ? 'success' : c.growth < 0 ? 'danger' : 'neutral'}>{changeText(c.growth)}</Badge>}</TableCell>
                    <TableCell style={num}>{fmtN(c.sales)}</TableCell>
                    <TableCell style={num}>{fmtN(c.customers)}</TableCell>
                    <TableCell style={{ ...num, color: vs(c.repeatRate, d.chain.repeatRate) }}>{c.repeatRate}%</TableCell>
                    <TableCell style={{ ...num, color: vs(c.avgTicket, d.chain.avgTicket) }}>{fmt$(c.avgTicket)}</TableCell>
                    <TableCell style={{ ...num, color: vs(c.cashbackShare, d.chain.cashbackShare, false) }}>{c.cashbackShare}%</TableCell>
                    <TableCell style={{ ...num, color: vs(c.flaggedRate, d.chain.flaggedRate, false) }}>{c.flaggedRate}%</TableCell>
                  </TableRow>
                ))}
                <TableRow style={{ background: C.subtle }}>
                  <TableCell />
                  <TableCell style={{ fontWeight: 600, color: C.muted }}>Chain average</TableCell>
                  <TableCell style={{ ...num, color: C.muted }}>{fmt$(d.chain.amount)}</TableCell>
                  <TableCell /><TableCell /><TableCell />
                  <TableCell style={{ ...num, color: C.muted }}>{d.chain.repeatRate}%</TableCell>
                  <TableCell style={{ ...num, color: C.muted }}>{fmt$(d.chain.avgTicket)}</TableCell>
                  <TableCell style={{ ...num, color: C.muted }}>{d.chain.cashbackShare}%</TableCell>
                  <TableCell style={{ ...num, color: C.muted }}>{d.chain.flaggedRate}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      );
    }}</Loaded>
  );
}
