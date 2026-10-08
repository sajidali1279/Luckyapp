// Inventory Intelligence's added tabs (2026-10-08): restock speed and fill rate, what customers and staff ask for (with one-tap
// add to the store's open order list), and rewards and hot food demand. Same period and store as the page; a manager sees only
// their own stores (the server decides).
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { inventoryAnalyticsApi, orderListApi } from '../../services/api';
import { Card, SectionTitle, StatTile, Badge, Button, EmptyState, Notice } from '../kit';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import ErrorState from '../ErrorState';
import CardSkeleton from '../CardSkeleton';
import { C, FONT, PRIMARY } from '../../lib/theme';
import { Plus } from 'lucide-react';

type Params = { storeId?: string; period: string };
const fmt$ = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => (n ?? 0).toLocaleString('en-US');
const hoursText = (h: number | null) => (h == null ? '-' : h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} days`);
const hourText = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REASONS: Record<string, string> = { NO_SUPPLIER: 'No supplier', OUT_OF_BUDGET: 'Over budget', IN_STOCK: 'Already in stock', DUPLICATE: 'Already on the list', OTHER: 'Other' };
const CANCELLED_BY: Record<string, string> = { STORE: 'The store declined', CUSTOMER: 'The customer cancelled', AUTO: 'Nobody accepted it in time' };

const tiles: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 20 };
const two: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, marginBottom: 16 };
const th: CSSProperties = { fontSize: FONT.caption, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' };
const num: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const note: CSSProperties = { fontSize: FONT.small, color: C.muted, margin: '-4px 0 12px', lineHeight: 1.5 };
const scroll: CSSProperties = { overflowX: 'auto' };

function useTab(key: string, params: Params, fn: (p: Params) => Promise<any>) {
  const q = useQuery({ queryKey: ['inventory-insights', key, params], queryFn: () => fn(params), placeholderData: keepPreviousData });
  return { ...q, d: q.data?.data?.data as any };
}

function Loaded({ q, children }: { q: { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => void; d: unknown }; children: () => ReactNode }) {
  if (q.isError) return <ErrorState onRetry={q.refetch} />;
  if (q.isLoading || !q.d) return <CardSkeleton count={4} />;
  return <div aria-busy={q.isFetching} style={{ opacity: q.isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>{children()}</div>;
}

function Bars({ rows, color = PRIMARY }: { rows: { label: string; value: number; text?: string }[]; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 170px) 1fr auto', alignItems: 'center', gap: 10, fontSize: FONT.body }}>
          <span style={{ color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
          <div style={{ height: 8, background: C.hover, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
            <div style={{ width: `${r.value > 0 ? Math.max((r.value / max) * 100, 2) : 0}%`, height: '100%', background: color, borderRadius: 4 }} />
          </div>
          <span style={{ ...num, color: C.text, fontWeight: 600 }}>{r.text ?? fmtN(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Restock speed and fill rate ─────────────────────────────────────────────

export function RestockTab({ params, showStores }: { params: Params; showStores: boolean }) {
  const q = useTab('restock', params, inventoryAnalyticsApi.restock);
  return (
    <Loaded q={q}>{() => {
      const d = q.d;
      return (
        <>
          <div style={tiles}>
            <StatTile label="Fill rate" value={`${d.fillRate}%`} hint={`${fmtN(d.received)} of ${fmtN(d.added)} items arrived`} />
            <StatTile label="List to shelf" value={hoursText(d.hoursTotal)} hint="Middle time from added to received" />
            <StatTile label="Added to ordered" value={hoursText(d.hoursToOrder)} hint="How long items wait to be ordered" />
            <StatTile label="Ordered to arrived" value={hoursText(d.hoursToReceive)} hint="How long suppliers take" />
            <StatTile label="Urgent items" value={hoursText(d.urgentHoursTotal)} hint="List to shelf, urgent only" />
          </div>
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle count={d.stuck.length}>Stuck items</SectionTitle>
            <p style={note}>Ordered 5 or more days ago and still not in, or marked urgent and still not ordered after 2 days.</p>
            {d.stuck.length === 0 ? <EmptyState title="Nothing stuck" description="Every order in this period is moving." /> : (
              <div style={scroll}>
                <Table>
                  <TableHeader><TableRow>{['Item', 'Store', 'Where it is', 'Waiting'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i === 3 ? num : {}) }}>{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {d.stuck.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell style={{ fontWeight: 600 }}>{i.name}{i.priority === 'URGENT' && <Badge tone="danger" style={{ marginLeft: 8 }}>Urgent</Badge>}</TableCell>
                        <TableCell style={{ color: C.text2 }}>{i.store}</TableCell>
                        <TableCell>{i.status === 'ORDERED' ? 'Ordered, not received' : 'Not ordered yet'}</TableCell>
                        <TableCell style={{ ...num, fontWeight: 600, color: C.danger }}>{i.days} days</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
          <div style={two}>
            <Card>
              <SectionTitle>Slowest categories</SectionTitle>
              <p style={note}>Middle time from the list to the shelf, slowest first.</p>
              {d.byCategory.length === 0 ? <EmptyState title="No order items in this period" /> : (
                <Table>
                  <TableHeader><TableRow>{['Category', 'Items', 'Fill rate', 'List to shelf'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i ? num : {}) }}>{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {d.byCategory.map((c: any) => (
                      <TableRow key={c.category}>
                        <TableCell style={{ fontWeight: 600 }}>{c.category}</TableCell>
                        <TableCell style={num}>{fmtN(c.added)}</TableCell>
                        <TableCell style={num}>{c.fillRate}%</TableCell>
                        <TableCell style={num}>{hoursText(c.hoursTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
            {showStores && (
              <Card>
                <SectionTitle>By store</SectionTitle>
                {d.byStore.length === 0 ? <EmptyState title="No order items in this period" /> : (
                  <Table>
                    <TableHeader><TableRow>{['Store', 'Items', 'Fill rate', 'List to shelf'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i ? num : {}) }}>{h}</TableHead>)}</TableRow></TableHeader>
                    <TableBody>
                      {d.byStore.map((s: any) => (
                        <TableRow key={s.store}>
                          <TableCell style={{ fontWeight: 600 }}>{s.store}</TableCell>
                          <TableCell style={num}>{fmtN(s.added)}</TableCell>
                          <TableCell style={num}>{s.fillRate}%</TableCell>
                          <TableCell style={num}>{hoursText(s.hoursTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            )}
          </div>
        </>
      );
    }}</Loaded>
  );
}

// ─── What people ask for ─────────────────────────────────────────────────────

/** The store's open order list, opened first when there is none. */
async function openListId(storeId: string): Promise<string> {
  const active = (await orderListApi.getActive(storeId)).data?.data;
  if (active?.id) return active.id;
  try {
    return (await orderListApi.openList(storeId)).data.data.id;
  } catch (e: any) {
    const existing = e?.response?.status === 409 ? e.response.data?.data?.id : null;   // someone opened one a moment ago
    if (existing) return existing;
    throw e;
  }
}

export function DemandTab({ params, addStoreId }: { params: Params; addStoreId: string | null }) {
  const q = useTab('demand', params, inventoryAnalyticsApi.demand);
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);
  async function add(item: any) {
    if (!addStoreId) return;
    setAdding(item.name);
    try {
      const listId = await openListId(addStoreId);
      await orderListApi.addItem(listId, { name: item.name.slice(0, 120), ...(item.category ? { category: item.category.slice(0, 80) } : {}), notes: `Asked for ${item.total} time${item.total === 1 ? '' : 's'} (Inventory Intelligence)` });
      toast.success(`${item.name} added to the order list`);
      qc.invalidateQueries({ queryKey: ['inventory-insights', 'demand'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not add it to the order list');
    } finally {
      setAdding(null);
    }
  }
  return (
    <Loaded q={q}>{() => {
      const d = q.d;
      return (
        <>
          <div style={tiles}>
            <StatTile label="Customer requests" value={fmtN(d.customerRequests)} hint="Asked for in the app" />
            <StatTile label="Staff stock requests" value={fmtN(d.staffLines)} hint="Lines sent by employees" />
            <StatTile label="Different items" value={fmtN(d.asked.length)} hint="Same name typed two ways counts once" />
          </div>
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle count={d.asked.length}>Most asked for</SectionTitle>
            <p style={note}>Customers' product requests and employees' stock requests together, most asked first.{!addStoreId && ' Pick one store above to add items to its order list from here.'}</p>
            {d.asked.length === 0 ? <EmptyState title="Nobody asked for anything in this period" /> : (
              <div style={scroll}>
                <Table>
                  <TableHeader><TableRow>
                    {['Item', 'Customers', 'Customer asks', 'Staff asks', 'Accepted', 'Turned down', 'Last asked', ''].map((h, i) => <TableHead key={h || 'act'} style={{ ...th, ...(i >= 1 && i <= 5 ? num : {}) }}>{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {d.asked.map((a: any) => (
                      <TableRow key={a.name}>
                        <TableCell style={{ fontWeight: 600 }}>{a.name}{a.category && <div style={{ fontSize: FONT.caption, color: C.muted, fontWeight: 400 }}>{a.category}</div>}</TableCell>
                        <TableCell style={num}>{fmtN(a.customers)}</TableCell>
                        <TableCell style={num}>{fmtN(a.customerAsks)}</TableCell>
                        <TableCell style={num}>{fmtN(a.staffAsks)}</TableCell>
                        <TableCell style={num}>{fmtN(a.accepted)}</TableCell>
                        <TableCell style={num}>{fmtN(a.rejected)}</TableCell>
                        <TableCell style={{ color: C.text2, whiteSpace: 'nowrap' }}>{new Date(a.lastAskedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })}</TableCell>
                        <TableCell style={{ textAlign: 'right' }}>
                          {a.onOrderList ? <Badge tone="success">On the order list</Badge>
                            : <Button size="sm" icon={<Plus />} disabled={!addStoreId || adding != null} onClick={() => add(a)}
                                title={addStoreId ? 'Add it to this store\'s open order list' : 'Pick one store above first'}>{adding === a.name ? 'Adding...' : 'Add to order list'}</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
          <div style={two}>
            <Card>
              <SectionTitle>Why staff requests were turned down</SectionTitle>
              {d.rejectionReasons.length === 0 ? <EmptyState title="None turned down in this period" /> : (
                <Bars color={C.warning} rows={d.rejectionReasons.map((r: any) => ({ label: REASONS[r.reason] ?? r.reason, value: r.count }))} />
              )}
            </Card>
            <Card>
              <SectionTitle count={d.notInCatalog.length}>Scanned but not in Labels</SectionTitle>
              <p style={note}>Products scanned at the counter (all stores) that have no label or price in the Labels catalog yet, most scanned first. Add them in Labels.</p>
              {d.notInCatalog.length === 0 ? <EmptyState title="Every scanned product is in Labels" /> : (
                <Table>
                  <TableHeader><TableRow>{['Product', 'Barcode', 'Scans'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i === 2 ? num : {}) }}>{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {d.notInCatalog.map((p: any) => (
                      <TableRow key={p.barcode}>
                        <TableCell style={{ fontWeight: 600 }}>{p.name}{p.category && <div style={{ fontSize: FONT.caption, color: C.muted, fontWeight: 400 }}>{p.category}</div>}</TableCell>
                        <TableCell style={{ fontFamily: 'ui-monospace, monospace', fontSize: FONT.small, color: C.text2 }}>{p.barcode}</TableCell>
                        <TableCell style={num}>{fmtN(p.scanCount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </>
      );
    }}</Loaded>
  );
}

// ─── Rewards and hot food ────────────────────────────────────────────────────

export function RewardsHotFoodTab({ params }: { params: Params }) {
  const q = useTab('rewards-hotfood', params, inventoryAnalyticsApi.rewardsHotFood);
  return (
    <Loaded q={q}>{() => {
      const { rewards: r, hotFood: h } = q.d;
      const busiest = [...h.byHour].sort((a: any, b: any) => b.orders - a.orders)[0];
      return (
        <>
          <SectionTitle>Rewards</SectionTitle>
          <div style={tiles}>
            <StatTile label="Rewards taken" value={fmtN(r.redeemed)} hint={`${fmtN(r.points)} points spent`} />
            <StatTile label="Not picked up" value={fmtN(r.expired)} hint="Code ran out before the counter" />
            <StatTile label="Cancelled" value={fmtN(r.cancelled)} />
          </div>
          <Card style={{ marginBottom: 24 }}>
            <SectionTitle count={r.top.length}>Most taken rewards</SectionTitle>
            <p style={note}>Keep these in stock: each one taken is an item off the shelf.</p>
            {r.top.length === 0 ? <EmptyState title="No rewards taken in this period" /> : (
              <Table>
                <TableHeader><TableRow>{['Reward', 'Taken', 'Points', 'Not completed'].map((x, i) => <TableHead key={x} style={{ ...th, ...(i ? num : {}) }}>{x}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {r.top.map((t: any) => (
                    <TableRow key={t.title}>
                      <TableCell style={{ fontWeight: 600 }}>{t.emoji ? `${t.emoji} ` : ''}{t.title}</TableCell>
                      <TableCell style={num}>{fmtN(t.redeemed)}</TableCell>
                      <TableCell style={num}>{fmtN(t.points)}</TableCell>
                      <TableCell style={num}>{fmtN(t.notCompleted)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <SectionTitle>Hot food</SectionTitle>
          <div style={tiles}>
            <StatTile label="Orders" value={fmtN(h.orders)} hint={`${fmtN(h.completed)} completed`} />
            <StatTile label="Taken in" value={fmt$(h.revenue)} hint="Completed orders" />
            <StatTile label="Average order" value={fmt$(h.avgTicket)} />
            <StatTile label="Cancelled" value={`${h.cancelRate ?? 0}%`} hint={`${fmtN(h.cancelled)} orders`} />
            <StatTile label="Ready time promised" value={h.avgPromisedMinutes == null ? '-' : `${h.avgPromisedMinutes} min`} hint="Average when accepted" />
          </div>
          {h.orders === 0 ? <EmptyState title="No hot food orders in this period" /> : (
            <>
              <div style={two}>
                <Card>
                  <SectionTitle>Best sellers</SectionTitle>
                  <Bars color={C.brand} rows={h.topItems.map((i: any) => ({ label: i.name, value: i.quantity, text: `${fmtN(i.quantity)} (${fmt$(i.revenue)})` }))} />
                </Card>
                <Card>
                  <SectionTitle>Why orders were cancelled</SectionTitle>
                  {h.cancelled === 0 ? <EmptyState title="No cancelled orders" /> : (
                    <>
                      <Bars color={C.warning} rows={h.cancelledBy.map((c: any) => ({ label: CANCELLED_BY[c.label] ?? c.label, value: c.count }))} />
                      {h.cancelReasons.length > 0 && (
                        <div style={{ marginTop: 14, fontSize: FONT.small, color: C.text2 }}>
                          {h.cancelReasons.map((c: any) => <div key={c.label} style={{ padding: '4px 0', borderTop: `1px solid ${C.border}` }}>"{c.label}" <span style={{ color: C.muted }}>x{c.count}</span></div>)}
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </div>
              <Card>
                <SectionTitle>When people order</SectionTitle>
                {busiest?.orders > 0 && <Notice style={{ marginBottom: 12 }}>Busiest hour: <strong>{hourText(busiest.hour)}</strong>. Have food ready a little before it.</Notice>}
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={h.byHour} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="hour" tickFormatter={hourText} tick={{ fontSize: 12, fill: C.muted }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: C.muted }} width={36} />
                    <Tooltip labelFormatter={(v) => hourText(Number(v))} formatter={(v: any) => [`${v} orders`, 'Orders']} />
                    <Bar dataKey="orders" fill={PRIMARY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {[1, 2, 3, 4, 5, 6, 0].map((w) => <Badge key={w}>{WEEKDAYS[w]}: {fmtN(h.byWeekday[w].orders)}</Badge>)}
                </div>
              </Card>
            </>
          )}
        </>
      );
    }}</Loaded>
  );
}
