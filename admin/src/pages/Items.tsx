import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Search, AlertTriangle, TrendingDown, ArrowLeftRight, CircleHelp, Tags } from 'lucide-react';
import { itemsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Button, Card, Badge, Notice, EmptyState, HowItWorks, Tabs } from '../components/kit';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import DataTablePagination from '../components/DataTablePagination';
import { ItemLists } from './PdiInvoices';
import { Changes, MakeLabels, MarginsDeals, HotFoodCheck, PriceHistory } from '../components/items/ItemsMore';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';

// Items (2026-11-10, step 1 of the owner's items plan): every product in the stores' PDI item lists in one place, found by name or
// barcode, with each store's own register price and cost; the lists of what stands out (Price checks); and the PDI lists themselves
// (moved here from Invoices to PDI). Read only: register prices are changed in PDI and shelf labels in Labels. Each store's own list is
// the truth for its prices: most prices are the same across a state, but some differ by store on purpose, so a difference is shown, not
// fixed. HQ sees every store; a store manager sees their own stores. Backend: controllers/items.controller.ts, utils/itemCatalog.ts.
// 2026-11-11 (the owner's seven ideas): Changes (what each upload changed), Make labels (shelf labels at the register price, HQ), Margins
// & deal ideas, the hot food menu against the register (on Price checks), "Missing at a store", and each item's price history.

type Filter = 'ALL' | 'DIFFERS' | 'DIFFERS_IN_STATE' | 'BELOW_COST' | 'LOW_MARGIN' | 'NO_COST' | 'NAMES' | 'MISSING';
type Tab = 'finder' | 'checks' | 'changes' | 'labels' | 'margins' | 'lists';
const TABS: Tab[] = ['finder', 'checks', 'changes', 'labels', 'margins', 'lists'];
interface Price { storeId: string; storeName: string; state: string | null; code: string; name: string; department: string | null; priceCents: number | null; costCents: number | null; marginPct: number | null }
interface Item {
  key: string; upc: string; name: string; department: string | null; kind: string | null; prices: Price[]; minCents: number | null; maxCents: number | null;
  differs: boolean; differsInStates: string[]; belowCost: string[]; lowMargin: string[]; noCost: boolean; names: number;
}
interface ListResult {
  total: number; page: number; pages: number; items: Item[]; counts: Record<Filter, number>; lowPct: number;
  departments: { name: string; items: number; kind: string | null }[];
  stores: { id: string; name: string; state: string | null; items: number; uploadedAt: string | null }[]; states: string[]; builtAt: string;
}
interface Detail extends Item {
  prices: (Price & { shelfPrice: string | null; hasLabel: boolean })[];
  label: { id: string; productName: string; priceText: string | null; dealText: string | null; category: string | null; stores: number; rewards: { id: string; title: string; pointsCost: number; isActive: boolean }[] } | null;
  otherLabels: number;
  scanned: { name: string; category: string | null; brand: string | null; source: string | null } | null;
  history?: { storeName: string | null; kind: string; oldPriceCents: number | null; newPriceCents: number | null; oldCostCents: number | null; newCostCents: number | null; createdAt: string }[];
}

const usd = (c: number | null | undefined) => (c == null ? '' : `$${(c / 100).toFixed(2)}`);
const shortStore = (n: string) => n.replace(/^Lucky Stop\s*/i, '');
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All items' },
  { value: 'BELOW_COST', label: 'Register price below cost' },
  { value: 'LOW_MARGIN', label: 'Low margin' },
  { value: 'DIFFERS_IN_STATE', label: 'Price differs inside a state' },
  { value: 'DIFFERS', label: 'Price differs between stores' },
  { value: 'NO_COST', label: 'No cost in PDI' },
  { value: 'NAMES', label: 'Different names at different stores' },
  { value: 'MISSING', label: 'Missing at a store (most stores sell it)' },
];
const STALE_DAYS = 14;

export default function Items() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'finder';
  const role = useAuthStore((s) => s.user?.role);
  const hq = role === 'SUPER_ADMIN' || role === 'DEV_ADMIN';
  const get = (k: string) => params.get(k) ?? '';
  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };
  const [typed, setTyped] = useState(get('q'));
  useEffect(() => { const t = setTimeout(() => { if (typed.trim() !== get('q')) set({ q: typed.trim() }); }, 350); return () => clearTimeout(t); }, [typed]);   // eslint-disable-line react-hooks/exhaustive-deps

  const query = { q: get('q'), filter: get('filter') || 'ALL', state: get('state'), department: get('department'), at: get('at'), notAt: get('notAt'), sort: get('sort') || 'name', page: Number(get('page')) || 1 };
  const listQ = useQuery({
    queryKey: ['items', query], placeholderData: (prev) => prev, staleTime: 60_000,
    queryFn: () => itemsApi.list(query).then((r) => r.data.data as ListResult),
  });
  const [open, setOpen] = useState<string | null>(null);
  // an answer of the wrong shape (an old server, a proxy page) shows the error box instead of breaking the page
  const raw = listQ.data;
  const data = raw && Array.isArray(raw.items) && raw.counts && Array.isArray(raw.stores) && Array.isArray(raw.departments) && Array.isArray(raw.states) ? raw : undefined;
  const badAnswer = !!raw && !data;
  const stores = data?.stores ?? [];
  const withList = stores.filter((s) => s.items > 0);
  const missing = stores.filter((s) => s.items === 0);
  const stale = withList.filter((s) => s.uploadedAt && Date.now() - new Date(s.uploadedAt).getTime() > STALE_DAYS * 86_400_000);
  // the store the Changes, Make labels and Margins tabs look at (kept in the address, shared by the three)
  const storeId = withList.some((s) => s.id === get('store')) ? get('store') : withList[0]?.id ?? '';
  const setStore = (id: string) => set({ store: id });

  return (
    <Page>
      <PageHeader title="Items" icon={Boxes}
        description="Every product in the stores' PDI item lists, with each store's own price and cost. Read only: register prices change in PDI, shelf labels in Labels." />
      <Tabs<Tab> ariaLabel="Items page sections" value={tab} onChange={(t) => set({ tab: t === 'finder' ? '' : t })}
        tabs={[
          { value: 'finder', label: 'Item finder' },
          { value: 'checks', label: 'Price checks', count: data ? data.counts.BELOW_COST + data.counts.LOW_MARGIN : undefined },
          { value: 'changes', label: 'Changes' },
          { value: 'labels', label: 'Make labels' },
          { value: 'margins', label: 'Margins & deal ideas' },
          { value: 'lists', label: 'PDI lists', count: missing.length || undefined },
        ]} />

      {tab === 'lists' ? <ItemLists /> : listQ.isError || badAnswer ? <ErrorState onRetry={() => listQ.refetch()} /> : !data ? <div style={s.loading}>Loading the items...</div> : withList.length === 0 ? (
        <EmptyState icon={<Boxes />} title="No PDI item list yet" description={hq ? 'Upload each store\'s PDI "Current inventory by item" report on the PDI lists tab.' : 'HQ uploads each store\'s PDI item list.'}
          action={<Button variant="primary" onClick={() => set({ tab: 'lists' })}>Go to PDI lists</Button>} />
      ) : tab === 'checks' ? (
        <>
          <Checks data={data} hq={hq} missing={missing.map((m) => m.name)} stale={stale.map((m) => m.name)} show={(filter, sort) => set({ tab: '', filter, sort: sort ?? '' })} lists={() => set({ tab: 'lists' })} />
          <HotFoodCheck />
        </>
      ) : tab === 'changes' ? (
        <Changes stores={withList} storeId={storeId} setStore={setStore} openItem={setOpen} />
      ) : tab === 'labels' ? (
        <MakeLabels stores={withList} storeId={storeId} setStore={setStore} />
      ) : tab === 'margins' ? (
        <MarginsDeals stores={withList} states={data.states} storeId={storeId} setStore={setStore} openItem={setOpen} />
      ) : (
        <>
          {(missing.length > 0 || stale.length > 0) && (
            <Notice tone="warning" style={{ marginBottom: 12 }}>
              {missing.length > 0 && <>No PDI list yet for {missing.map((m) => shortStore(m.name)).join(', ')}, so {missing.length === 1 ? 'that store is' : 'those stores are'} not in here. </>}
              {stale.length > 0 && <>{stale.map((m) => shortStore(m.name)).join(', ')}: list over {STALE_DAYS} days old, prices may have changed since. </>}
              <button type="button" style={s.linkBtn} onClick={() => set({ tab: 'lists' })}>PDI lists</button>
            </Notice>
          )}
          <Card padding={0}>
            <div style={s.filters}>
              <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }} aria-hidden />
                <input aria-label="Find an item by name or barcode" className="ui-input" style={{ ...INPUT, paddingLeft: 32 }} value={typed} maxLength={80}
                  onChange={(e) => setTyped(e.target.value)} placeholder="Name or barcode, e.g. monster 16oz or 070847811169" />
              </div>
              <select aria-label="Show" style={s.select} value={query.filter} onChange={(e) => {
                const f = e.target.value;
                set({ filter: f === 'ALL' ? '' : f, ...(f === 'MISSING' && !query.notAt && withList[0] ? { notAt: withList[0].id, at: '' } : {}) });
              }}>
                {FILTERS.filter((f) => f.value !== 'MISSING' || withList.length > 2).map((f) => <option key={f.value} value={f.value}>{f.label}{data.counts[f.value] != null && f.value !== 'ALL' && (f.value !== 'MISSING' || query.notAt) ? ` (${data.counts[f.value].toLocaleString()})` : ''}</option>)}
              </select>
              {data.states.length > 1 && (
                <select aria-label="State" style={s.select} value={query.state} onChange={(e) => set({ state: e.target.value })}>
                  <option value="">All states</option>
                  {data.states.map((st) => <option key={st} value={st}>{st === 'TX' ? 'Texas stores' : st === 'OK' ? 'Oklahoma stores' : st}</option>)}
                </select>
              )}
              <select aria-label="Department" style={s.select} value={query.department} onChange={(e) => set({ department: e.target.value })}>
                <option value="">All departments</option>
                {data.departments.map((d) => <option key={d.name} value={d.name}>{d.name || 'No department'} ({d.items.toLocaleString()})</option>)}
              </select>
              {withList.length > 1 && (
                <select aria-label="Store" style={s.select} value={query.at ? `at:${query.at}` : query.notAt ? `not:${query.notAt}` : ''}
                  onChange={(e) => { const [k, id] = e.target.value.split(':'); set({ at: k === 'at' ? id : '', notAt: k === 'not' ? id : '' }); }}>
                  <option value="">Any store</option>
                  <optgroup label="Carried at">{withList.map((st) => <option key={st.id} value={`at:${st.id}`}>{st.name}</option>)}</optgroup>
                  <optgroup label="Not carried at">{withList.map((st) => <option key={st.id} value={`not:${st.id}`}>Not at {st.name}</option>)}</optgroup>
                </select>
              )}
              <select aria-label="Sort" style={s.select} value={query.sort} onChange={(e) => set({ sort: e.target.value === 'name' ? '' : e.target.value })}>
                <option value="name">Sort: name</option>
                <option value="spread">Sort: biggest price gap</option>
                <option value="margin">Sort: lowest margin</option>
                <option value="stores">Sort: most stores</option>
              </select>
            </div>
            <div style={{ padding: '8px 14px', fontSize: FONT.small, color: TEXT_MUTED, borderBottom: `1px solid ${C.border}` }} aria-live="polite">
              {data.total.toLocaleString()} {data.total === 1 ? 'item' : 'items'}{listQ.isFetching ? ' (updating...)' : ''}
              {query.filter === 'MISSING' && (query.notAt
                ? <> that most of the other stores sell and {stores.find((x) => x.id === query.notAt)?.name ?? 'this store'} does not. Change the store in "Not carried at".</>
                : <>. Pick the store in the store box ("Not carried at").</>)}
            </div>
            {data.items.length === 0 ? (
              <div style={s.loading}>No item matches. Try fewer words, or "All items".</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table} aria-label="Items">
                  <thead><tr>{['Item', 'Stores', 'Register price', 'Margin', 'Stands out'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.items.map((it) => (
                      <tr key={it.key} data-testid="item-row" style={s.row} onClick={() => setOpen(it.key)}>
                        <td style={{ ...s.td, whiteSpace: 'normal', minWidth: 220 }}>
                          <button type="button" style={s.linkBtn} onClick={(e) => { e.stopPropagation(); setOpen(it.key); }}>{it.name}</button>
                          <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>{it.upc}{it.department ? `, ${it.department}` : ''}</div>
                        </td>
                        <td style={s.td}>{it.prices.length}</td>
                        <td style={s.td}><PriceRange it={it} /></td>
                        <td style={s.td}><MarginRange it={it} /></td>
                        <td style={{ ...s.td, whiteSpace: 'normal' }}><Flags it={it} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <DataTablePagination page={data.page} totalPages={data.pages} onPrevious={() => set({ page: String(Math.max(1, data.page - 1)) })} onNext={() => set({ page: String(data.page + 1) })} />
          </Card>
        </>
      )}
      {open && <ItemDetail itemKey={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

function PriceRange({ it }: { it: Item }) {
  if (it.minCents == null) return <span style={{ color: TEXT_MUTED }}>No price</span>;
  if (!it.differs) return <>{usd(it.minCents)}</>;
  const states = [...new Set(it.prices.map((p) => p.state).filter(Boolean))] as string[];
  return (
    <div>
      <div>{usd(it.minCents)} to {usd(it.maxCents)}</div>
      {states.length > 1 && (
        <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>
          {states.map((st) => {
            const c = it.prices.filter((p) => p.state === st && p.priceCents).map((p) => p.priceCents!);
            const lo = Math.min(...c), hi = Math.max(...c);
            return `${st} ${lo === hi ? usd(lo) : `${usd(lo)} to ${usd(hi)}`}`;
          }).join('; ')}
        </div>
      )}
    </div>
  );
}

function MarginRange({ it }: { it: Item }) {
  const m = it.prices.map((p) => p.marginPct).filter((x): x is number => x != null);
  if (!m.length) return <span style={{ color: TEXT_MUTED }}>No cost</span>;
  const lo = Math.min(...m), hi = Math.max(...m);
  return <span style={{ color: lo < 0 ? C.danger : undefined }}>{lo === hi ? `${lo}%` : `${lo}% to ${hi}%`}</span>;
}

function Flags({ it }: { it: Item }) {
  const out: JSX.Element[] = [];
  if (it.belowCost.length) out.push(<Badge key="bc" tone="danger" title={`Register price below cost at ${it.belowCost.join(', ')}`}>Below cost at {it.belowCost.length}</Badge>);
  if (it.lowMargin.length) out.push(<Badge key="lm" tone="warning" title={`Low margin at ${it.lowMargin.join(', ')}`}>Low margin at {it.lowMargin.length}</Badge>);
  if (it.differsInStates.length) out.push(<Badge key="ds" tone="info" title="Stores in the same state charge different prices">Differs in {it.differsInStates.join(', ')}</Badge>);
  if (it.names > 1) out.push(<Badge key="nm" title="The stores give it different names">{it.names} names</Badge>);
  return out.length ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{out}</div> : <span style={{ color: TEXT_MUTED }}>Nothing</span>;
}

function Checks({ data, hq, missing, stale, show, lists }: { data: ListResult; hq: boolean; missing: string[]; stale: string[]; show: (f: Filter, sort?: string) => void; lists: () => void }) {
  const rows: { f: Filter; icon: JSX.Element; title: string; why: string; sort?: string; tone: 'danger' | 'warning' | 'info' | 'neutral' }[] = [
    { f: 'BELOW_COST', icon: <AlertTriangle size={18} />, tone: 'danger', title: 'Register price below cost', sort: 'margin',
      why: 'Each one sold loses money, or the cost in PDI is wrong (a case cost typed as a unit cost is common). Check the price or the cost in PDI.' },
    { f: 'LOW_MARGIN', icon: <TrendingDown size={18} />, tone: 'warning', title: `Margin under ${data.lowPct}%`, sort: 'margin',
      why: 'Little left after cost. Worth a look before putting cashback or a deal on these.' },
    { f: 'DIFFERS_IN_STATE', icon: <ArrowLeftRight size={18} />, tone: 'info', title: 'Price differs inside a state', sort: 'spread',
      why: 'Stores in the same state charge different prices. Some are on purpose (a cigar at $1.19 at one store and $1.29 at another); the rest may be worth evening out in PDI.' },
    { f: 'NO_COST', icon: <CircleHelp size={18} />, tone: 'neutral', title: 'No cost in PDI',
      why: 'No store has a cost for these, so their margin is unknown. Invoices to PDI shows the invoice cost when a vendor invoice for them is read.' },
    { f: 'NAMES', icon: <Tags size={18} />, tone: 'neutral', title: 'Different names at different stores',
      why: 'The same barcode is named differently in each store\'s PDI. Harmless at the register; it can make an item hard to find.' },
  ];
  return (
    <>
      <HowItWorks style={{ marginBottom: 14 }}>
        Each store's prices and costs come from its own PDI list, as last uploaded. Nothing here changes a price: change register prices in PDI,
        then upload the store's list again; shelf labels are changed in Labels.{!hq ? ' You see your own stores only.' : ''}
      </HowItWorks>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
        {rows.map((r) => (
          <Card key={r.f} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text, fontWeight: 600 }}>{r.icon}<span style={{ flex: 1 }}>{r.title}</span>
              <Badge tone={data.counts[r.f] ? r.tone : 'neutral'}>{data.counts[r.f].toLocaleString()}</Badge></div>
            <p style={{ margin: 0, fontSize: FONT.small, color: C.text2, lineHeight: 1.5 }}>{r.why}</p>
            <div style={{ marginTop: 'auto' }}><Button size="sm" disabled={!data.counts[r.f]} onClick={() => show(r.f, r.sort)} aria-label={`Show them: ${r.title}`}>Show them</Button></div>
          </Card>
        ))}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text, fontWeight: 600 }}><Tags size={18} /><span>Shelf labels not at the register price</span></div>
          <p style={{ margin: 0, fontSize: FONT.small, color: C.text2, lineHeight: 1.5 }}>Store by store on the PDI lists tab, with "Use register price" on each label and "Update all".</p>
          <div style={{ marginTop: 'auto' }}><Button size="sm" onClick={lists}>Open PDI lists</Button></div>
        </Card>
      </div>
      {(missing.length > 0 || stale.length > 0) && (
        <Notice tone="warning" style={{ marginTop: 14 }}>
          {missing.length > 0 && <>Not counted (no PDI list yet): {missing.map(shortStore).join(', ')}. </>}
          {stale.length > 0 && <>Lists over {STALE_DAYS} days old: {stale.map(shortStore).join(', ')}.</>}
        </Notice>
      )}
    </>
  );
}

function ItemDetail({ itemKey, onClose }: { itemKey: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['item', itemKey], queryFn: () => itemsApi.get(itemKey).then((r) => r.data.data as Detail), retry: false });
  const d = q.data;
  return (
    <Modal title={d?.name ?? 'Item'} subtitle={d ? `${d.upc}${d.department ? `, ${d.department}` : ''}` : undefined} onClose={onClose} maxWidth={760}>
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !d ? <div style={s.loading}>Loading...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {d.belowCost.length > 0 && <Notice tone="danger">Register price below cost at {d.belowCost.map(shortStore).join(', ')}. Check the price or the cost in PDI.</Notice>}
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table} aria-label={`Prices for ${d.name}`}>
              <thead><tr>{['Store', 'Register', 'Cost', 'Margin', 'Shelf label'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.prices.map((p) => {
                  const shelfCents = p.shelfPrice != null ? Math.round(parseFloat(p.shelfPrice) * 100) : null;
                  const off = shelfCents != null && p.priceCents != null && shelfCents !== p.priceCents;
                  return (
                    <tr key={p.storeId} data-testid="item-store-row">
                      <td style={s.td}>{shortStore(p.storeName)}{p.state ? <span style={{ color: TEXT_MUTED }}> ({p.state})</span> : null}
                        {p.name.toUpperCase() !== d.name.toUpperCase() && <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>PDI name: {p.name}</div>}</td>
                      <td style={s.td}>{usd(p.priceCents) || 'None'}</td>
                      <td style={{ ...s.td, color: TEXT_MUTED }}>{usd(p.costCents) || 'None'}</td>
                      <td style={{ ...s.td, color: p.marginPct != null && p.marginPct < 0 ? C.danger : undefined }}>{p.marginPct != null ? `${p.marginPct}%` : ''}</td>
                      <td style={s.td}>{!p.hasLabel ? <span style={{ color: TEXT_MUTED }}>No label</span> : off ? <Badge tone="warning" title="The shelf label is not the register price">${p.shelfPrice}, register {usd(p.priceCents)}</Badge> : `$${p.shelfPrice}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>In the app</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: FONT.body, color: C.text2, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>{d.label ? <>Shelf label "{d.label.productName}", chain price {d.label.priceText ? `$${d.label.priceText}` : 'not set'}, at {d.label.stores} {d.label.stores === 1 ? 'store' : 'stores'}.{d.otherLabels > 0 ? ` ${d.otherLabels} more label${d.otherLabels === 1 ? '' : 's'} with this barcode.` : ''}</> : 'No shelf label.'}</li>
              {d.label?.dealText && <li>Shelf deal: {d.label.dealText}</li>}
              {d.label && d.label.rewards.length > 0 && <li>Reward{d.label.rewards.length > 1 ? 's' : ''}: {d.label.rewards.map((r) => `${r.title} (${r.pointsCost.toLocaleString()} pts${r.isActive ? '' : ', off'})`).join('; ')}</li>}
              <li>{d.scanned ? <>Scanned product: {d.scanned.name}{d.scanned.category ? `, ${d.scanned.category}` : ''}</> : 'Never scanned in the app.'}</li>
            </ul>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>Price history</div>
            <PriceHistory history={d.history ?? []} />
          </div>
          <p style={{ margin: 0, fontSize: FONT.small, color: TEXT_MUTED }}>Register prices change in PDI (then upload the store's list again). Shelf labels change in Labels.</p>
        </div>
      )}
    </Modal>
  );
}

const s: Record<string, React.CSSProperties> = {
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', padding: 14, borderBottom: `1px solid ${C.border}` },
  select: { ...INPUT, width: 'auto', flex: '1 1 170px', minWidth: 0, maxWidth: '100%' },
  loading: { padding: 32, color: TEXT_MUTED, textAlign: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: FONT.body },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: FONT.small, color: TEXT_MUTED, fontWeight: 600, background: C.subtle, whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap', verticalAlign: 'top' },
  row: { cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', padding: 0, font: 'inherit', color: C.primary, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
};

