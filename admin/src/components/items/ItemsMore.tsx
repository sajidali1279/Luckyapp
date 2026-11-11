import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, Tags, History, Percent, Lightbulb, Flame } from 'lucide-react';
import { itemsApi } from '../../services/api';
import { Button, Card, Badge, Notice, EmptyState, HowItWorks, Chip } from '../kit';
import ConfirmModal from '../ConfirmModal';
import ErrorState from '../ErrorState';
import DataTablePagination from '../DataTablePagination';
import { storeDayTime } from '../../lib/storeDates';
import { C, FONT, INPUT, TEXT_MUTED } from '../../lib/theme';

// The Items page's newer tabs (2026-11-11, the owner's seven ideas for the PDI lists): what changed at each upload, shelf labels made from
// PDI, margin by department and deal ideas, the hot food menu against the register, an item's price history, and what a reward costs the
// store (used on the Rewards catalog). Backend: controllers/items.controller.ts, utils/itemInsights.ts, utils/pdiPriceHistory.ts.

export interface ListStore { id: string; name: string; state: string | null; items: number; uploadedAt: string | null }

export const usd = (c: number | null | undefined) => (c == null ? '' : `$${(c / 100).toFixed(2)}`);
const shortStore = (n: string) => n.replace(/^Lucky Stop\s*/i, '');
const pct = (n: number | null | undefined) => (n == null ? '' : `${n}%`);

/** A store picker over the stores with a list (it keeps its choice in the page's address via onChange). */
function StorePick({ stores, value, onChange, label = 'Store' }: { stores: ListStore[]; value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <select aria-label={label} style={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
      {stores.map((st) => <option key={st.id} value={st.id}>{st.name}{st.state ? ` (${st.state})` : ''}</option>)}
    </select>
  );
}

function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  const [typed, setTyped] = useState(value);
  useEffect(() => { setTyped(value); }, [value]);
  useEffect(() => { const t = setTimeout(() => { if (typed.trim() !== value) onChange(typed.trim()); }, 350); return () => clearTimeout(t); }, [typed]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
      <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }} aria-hidden />
      <input aria-label={label} className="ui-input" style={{ ...INPUT, paddingLeft: 32 }} value={typed} maxLength={80} onChange={(e) => setTyped(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ─── What changed at an upload ────────────────────────────────────────────────

type ChangeFilter = 'ALL' | 'PRICE_UP' | 'PRICE_DOWN' | 'COST_UP' | 'NEW' | 'GONE';
interface ImportRow { id: string; createdAt: string; fileName: string | null; items: number; pricesUp: number | null; pricesDown: number | null; costsUp: number | null; newItems: number | null; goneItems: number | null }
interface Change { code: string; upc: string; key: string; name: string; kind: 'CHANGED' | 'NEW' | 'GONE'; oldPriceCents: number | null; newPriceCents: number | null; oldCostCents: number | null; newCostCents: number | null }
interface ChangesResult { imports: ImportRow[]; importId: string | null; compared: boolean; total: number; page: number; pages: number; changes: Change[] }

export function Changes({ stores, storeId, setStore, openItem }: { stores: ListStore[]; storeId: string; setStore: (id: string) => void; openItem: (key: string) => void }) {
  const [importId, setImportId] = useState('');
  const [filter, setFilter] = useState<ChangeFilter>('ALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setImportId(''); setPage(1); }, [storeId]);
  useEffect(() => { setPage(1); }, [importId, filter, q]);
  const query = { storeId, importId, filter: filter === 'ALL' ? '' : filter, q, page };
  const cq = useQuery({ queryKey: ['item-changes', query], enabled: !!storeId, placeholderData: (p) => p, queryFn: () => itemsApi.changes(query).then((r) => r.data.data as ChangesResult) });
  const d = cq.data;
  const imp = d?.imports.find((i) => i.id === d.importId) ?? null;
  const chips: { f: ChangeFilter; label: string; n: number | null | undefined }[] = [
    { f: 'ALL', label: 'Everything', n: undefined },
    { f: 'PRICE_UP', label: 'Price up', n: imp?.pricesUp }, { f: 'PRICE_DOWN', label: 'Price down', n: imp?.pricesDown },
    { f: 'COST_UP', label: 'Cost up, same price', n: imp?.costsUp }, { f: 'NEW', label: 'New items', n: imp?.newItems }, { f: 'GONE', label: 'Gone', n: imp?.goneItems },
  ];
  return (
    <>
      <HowItWorks style={{ marginBottom: 14 }}>
        Each time a store's PDI list is uploaded, it is compared with the store's last list: prices that went up or down, costs that went up
        while the price stayed the same (the margin shrank), new items and items no longer on the list. The first upload after this started
        only sets the starting point. Click an item for its full history.
      </HowItWorks>
      <Card padding={0}>
        <div style={s.filters}>
          <StorePick stores={stores} value={storeId} onChange={setStore} />
          {d && d.imports.length > 1 && (
            <select aria-label="Upload" style={s.select} value={d.importId ?? ''} onChange={(e) => setImportId(e.target.value)}>
              {d.imports.map((i) => <option key={i.id} value={i.id}>{storeDayTime(i.createdAt)}{i.pricesUp == null ? ' (first list)' : ''}</option>)}
            </select>
          )}
          <SearchBox value={q} onChange={setQ} label="Find a changed item" placeholder="Item name or code" />
        </div>
        {cq.isError ? <ErrorState onRetry={() => cq.refetch()} /> : !d ? <div style={s.loading}>Loading...</div> : !d.imports.length ? (
          <EmptyState icon={<History />} title="No list uploaded yet" description="Upload the store's PDI list on the PDI lists tab." />
        ) : !d.compared ? (
          <div style={{ padding: 14 }}>
            <Notice tone="info">Nothing to compare yet: this upload ({storeDayTime(imp?.createdAt ?? d.imports[0].createdAt)}) is the starting point. Changes show from the store's next upload.</Notice>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }} role="group" aria-label="Show">
              {chips.map((c) => (
                <Chip key={c.f} selected={filter === c.f} onClick={() => setFilter(c.f)} aria-pressed={filter === c.f}>
                  {c.label}{c.n != null ? ` (${c.n.toLocaleString()})` : ''}
                </Chip>
              ))}
            </div>
            <div style={s.count} aria-live="polite">{d.total.toLocaleString()} {d.total === 1 ? 'change' : 'changes'}{cq.isFetching ? ' (updating...)' : ''}</div>
            {d.changes.length === 0 ? <div style={s.loading}>Nothing here.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table} aria-label="Changes">
                  <thead><tr>{['Item', 'What changed (register price)', 'Cost'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {d.changes.map((c) => (
                      <tr key={c.code} data-testid="change-row">
                        <td style={{ ...s.td, whiteSpace: 'normal', minWidth: 200 }}>
                          {c.kind === 'GONE' ? <span style={{ fontWeight: 600 }}>{c.name}</span>
                            : <button type="button" style={s.linkBtn} onClick={() => openItem(c.key)}>{c.name}</button>}
                          <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>{c.upc}</div>
                        </td>
                        <td style={s.td}><ChangeBadge c={c} />
                          <div style={{ fontSize: FONT.caption, marginTop: 4 }}><FromTo a={c.oldPriceCents} b={c.newPriceCents} kind={c.kind} upIsBad={false} /></div></td>
                        <td style={s.td}><FromTo a={c.oldCostCents} b={c.newCostCents} kind={c.kind} upIsBad /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <DataTablePagination page={d.page} totalPages={d.pages} onPrevious={() => setPage(Math.max(1, d.page - 1))} onNext={() => setPage(d.page + 1)} />
          </>
        )}
      </Card>
    </>
  );
}

function ChangeBadge({ c }: { c: Pick<Change, 'kind' | 'oldPriceCents' | 'newPriceCents' | 'oldCostCents' | 'newCostCents'> }) {
  if (c.kind === 'NEW') return <Badge tone="info">New item</Badge>;
  if (c.kind === 'GONE') return <Badge>Gone</Badge>;
  const up = c.oldPriceCents != null && c.newPriceCents != null && c.newPriceCents > c.oldPriceCents;
  const down = c.oldPriceCents != null && c.newPriceCents != null && c.newPriceCents < c.oldPriceCents;
  const costUp = c.oldCostCents != null && c.newCostCents != null && c.newCostCents > c.oldCostCents;
  if (up) return <Badge tone="warning">Price up</Badge>;
  if (down) return <Badge tone="success">Price down</Badge>;
  if (costUp) return <Badge tone="danger">Cost up, same price</Badge>;
  return <Badge>{c.oldCostCents !== c.newCostCents ? 'Cost changed' : 'Price changed'}</Badge>;
}

function FromTo({ a, b, kind, upIsBad }: { a: number | null; b: number | null; kind: string; upIsBad: boolean }) {
  if (kind === 'NEW') return <>{usd(b) || <span style={{ color: TEXT_MUTED }}>None</span>}</>;
  if (kind === 'GONE') return <span style={{ color: TEXT_MUTED }}>{usd(a) || 'None'}</span>;
  if (a === b) return <span style={{ color: TEXT_MUTED }}>{usd(a) || 'None'}</span>;
  const worse = a != null && b != null && (upIsBad ? b > a : false);
  return <span>{usd(a) || 'None'} to <b style={{ color: worse ? C.danger : undefined }}>{usd(b) || 'None'}</b></span>;
}

/** An item's price history, newest first (in the item window). */
export function PriceHistory({ history }: { history: { storeName: string | null; kind: string; oldPriceCents: number | null; newPriceCents: number | null; oldCostCents: number | null; newCostCents: number | null; createdAt: string }[] }) {
  if (!history.length) return <p style={{ margin: 0, fontSize: FONT.small, color: TEXT_MUTED }}>No price changes recorded yet (they are recorded from each store's next PDI upload).</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.table} aria-label="Price history">
        <thead><tr>{['When', 'Store', 'What changed', 'Register price', 'Cost'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={i} data-testid="history-row">
              <td style={s.td}>{storeDayTime(h.createdAt)}</td>
              <td style={s.td}>{shortStore(h.storeName ?? '')}</td>
              <td style={s.td}><ChangeBadge c={{ ...h, kind: h.kind as Change['kind'] }} /></td>
              <td style={s.td}><FromTo a={h.oldPriceCents} b={h.newPriceCents} kind={h.kind} upIsBad={false} /></td>
              <td style={s.td}><FromTo a={h.oldCostCents} b={h.newCostCents} kind={h.kind} upIsBad /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shelf labels made from PDI ───────────────────────────────────────────────

interface Candidate { key: string; upc: string; name: string; department: string | null; priceCents: number; label: { id: string; productName: string; priceText: string | null } | null }
interface CandidatesResult { total: number; page: number; pages: number; items: Candidate[]; keys: string[]; departments: { name: string; items: number }[]; canMake: boolean; max: number }
interface MadeResult { made: number; added: number; filled: number; already: number; skipped: number }

export function MakeLabels({ stores, storeId, setStore }: { stores: ListStore[]; storeId: string; setStore: (id: string) => void }) {
  const qc = useQueryClient();
  const [department, setDepartment] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked(new Set()); setPage(1); }, [storeId, department, q]);
  const query = { storeId, department, q, page };
  const lq = useQuery({ queryKey: ['label-candidates', query], enabled: !!storeId, placeholderData: (p) => p, queryFn: () => itemsApi.labelCandidates(query).then((r) => r.data.data as CandidatesResult) });
  const d = lq.data;
  const store = stores.find((x) => x.id === storeId);
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else if (n.size < (d?.max ?? 300)) n.add(k); return n; });
  const pageAll = !!d && d.items.length > 0 && d.items.every((x) => picked.has(x.key));
  async function make() {
    if (!picked.size || busy) return;
    setBusy(true);
    try {
      const r = (await itemsApi.makeLabels(storeId, [...picked])).data.data as MadeResult;
      const done = r.made + r.added + r.filled;
      if (done) toast.success(`${done.toLocaleString()} shelf ${done === 1 ? 'label' : 'labels'} made at the register price. They are on ${store?.name ?? 'the store'}'s print list.`);
      if (r.already) toast(`${r.already.toLocaleString()} already had a label at this store.`);
      if (r.skipped) toast.error(`${r.skipped.toLocaleString()} could not be made (no longer in the store's list, or no usable price). Try them again later.`);
      setPicked(new Set()); setAsk(false);
      qc.invalidateQueries({ queryKey: ['label-candidates'] });
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['store-labels'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'The labels could not be made. Try again.'); } finally { setBusy(false); }
  }
  return (
    <>
      <HowItWorks style={{ marginBottom: 14 }}>
        The items this store sells (from its PDI list) that have no shelf label on its label list. Pick a department, tick the items and make
        their labels in one go: each gets the store's register price and goes on the store's print list as new. An item that is already a
        label at other stores is added to this store with this store's price. Lottery tickets, items with no price and the store's own short
        codes are left out.
      </HowItWorks>
      <Card padding={0}>
        <div style={s.filters}>
          <StorePick stores={stores} value={storeId} onChange={setStore} />
          <select aria-label="Department" style={s.select} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {(d?.departments ?? []).map((x) => <option key={x.name} value={x.name}>{x.name || 'No department'} ({x.items.toLocaleString()})</option>)}
          </select>
          <SearchBox value={q} onChange={setQ} label="Find an item with no label" placeholder="Name or barcode" />
        </div>
        {lq.isError ? <ErrorState onRetry={() => lq.refetch()} /> : !d ? <div style={s.loading}>Loading...</div> : d.total === 0 ? (
          <EmptyState icon={<Tags />} title="Every item here has a label" description="Nothing in this store's PDI list (with these choices) is missing a shelf label." />
        ) : (
          <>
            <div style={{ ...s.count, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} aria-live="polite">
              <span style={{ marginRight: 'auto' }}>{d.total.toLocaleString()} {d.total === 1 ? 'item' : 'items'} with no label{picked.size ? `, ${picked.size.toLocaleString()} ticked` : ''}{lq.isFetching ? ' (updating...)' : ''}
                {!d.canMake && <>. HQ makes the labels from this list.</>}</span>
              {d.canMake && (
                <>
                  <Button size="sm" onClick={() => setPicked(new Set(d.keys))} disabled={picked.size === Math.min(d.total, d.max)}>
                    {d.total > d.max ? `Tick the first ${d.max}` : `Tick all ${d.total.toLocaleString()}`}
                  </Button>
                  {picked.size > 0 && <Button size="sm" onClick={() => setPicked(new Set())}>Clear</Button>}
                  <Button size="sm" variant="primary" icon={<Tags />} disabled={!picked.size || busy} onClick={() => setAsk(true)}>
                    {busy ? 'Making...' : `Make ${picked.size ? picked.size.toLocaleString() + ' ' : ''}${picked.size === 1 ? 'label' : 'labels'}`}
                  </Button>
                </>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table} aria-label="Items with no shelf label">
                <thead><tr>
                  {d.canMake && <th style={{ ...s.th, width: 36 }}><input type="checkbox" aria-label="Tick every item on this page" checked={pageAll}
                    onChange={() => setPicked((p) => { const n = new Set(p); if (pageAll) d.items.forEach((x) => n.delete(x.key)); else for (const x of d.items) { if (n.size >= d.max) break; n.add(x.key); } return n; })} /></th>}
                  {['Item', 'Department', 'In Labels'].map((h) => <th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {d.items.map((x) => (
                    <tr key={x.key} data-testid="candidate-row" style={d.canMake ? s.row : undefined} onClick={d.canMake ? () => toggle(x.key) : undefined}>
                      {d.canMake && <td style={s.td}><input type="checkbox" aria-label={`Make a label for ${x.name}`} checked={picked.has(x.key)} onChange={() => toggle(x.key)} onClick={(e) => e.stopPropagation()} /></td>}
                      <td style={{ ...s.td, whiteSpace: 'normal', minWidth: 180 }}><span style={{ fontWeight: 600 }}>{x.name}</span>
                        <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}><b style={{ color: C.text }}>{usd(x.priceCents)}</b> at the register, {x.upc}</div></td>
                      <td style={s.td}>{x.department ?? ''}</td>
                      <td style={{ ...s.td, whiteSpace: 'normal' }}>{x.label ? <span style={{ fontSize: FONT.small }}>Label at other stores ({x.label.productName}{x.label.priceText ? `, $${x.label.priceText}` : ''})</span> : <span style={{ color: TEXT_MUTED }}>New label</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination page={d.page} totalPages={d.pages} onPrevious={() => setPage(Math.max(1, d.page - 1))} onNext={() => setPage(d.page + 1)} />
          </>
        )}
      </Card>
      <ConfirmModal open={ask} headingLevel="h2" title={`Make ${picked.size.toLocaleString()} shelf ${picked.size === 1 ? 'label' : 'labels'}?`} busy={busy}
        message={<>At {store?.name ?? 'this store'}, at the register price from its PDI list. They go on the store's print list as new, ready to print in Labels. You can change a name or price in Labels afterwards.</>}
        confirmLabel={`Make ${picked.size === 1 ? 'it' : 'them'}`} onConfirm={() => void make()} onCancel={() => setAsk(false)} />
    </>
  );
}

// ─── Margins by department, and deal ideas ────────────────────────────────────

interface DeptMargin { department: string; kind: string | null; items: number; withCost: number; medianPct: number | null; averagePct: number | null; belowCost: number; under10: number }
interface Idea { key: string; upc: string; name: string; department: string | null; stores: number; minPriceCents: number; maxPriceCents: number; maxCostCents: number; marginNowPct: number; dealText: string; unitCents: number; marginAfterPct: number; savingPct: number }
interface IdeasResult { total: number; page: number; pages: number; ideas: Idea[]; rules: { minMarginPct: number; keepMarginPct: number; minSavingPct: number }; stores: number }

export function MarginsDeals({ stores, states, storeId, setStore, openItem }: { stores: ListStore[]; states: string[]; storeId: string; setStore: (id: string) => void; openItem: (key: string) => void }) {
  const mq = useQuery({ queryKey: ['item-margins', storeId], enabled: !!storeId, queryFn: () => itemsApi.margins(storeId).then((r) => r.data.data.departments as DeptMargin[]) });
  const [state, setState] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [state, q]);
  const iq = useQuery({ queryKey: ['deal-ideas', state, q, page], placeholderData: (p) => p, queryFn: () => itemsApi.dealIdeas({ state, q, page }).then((r) => r.data.data as IdeasResult) });
  const rows = useMemo(() => (mq.data ?? []).filter((r) => r.items >= 3), [mq.data]);
  const ideas = iq.data;
  return (
    <>
      <HowItWorks style={{ marginBottom: 14 }}>
        Margins come from each store's own cost and register price in PDI. About half the items have no cost, and these are averages over the
        items, not weighted by what sells (the lists have no sales). The middle margin is the one to read: one wrong cost (a case cost typed
        as a unit cost) does not move it.
      </HowItWorks>
      <Card padding={0} style={{ marginBottom: 16 }}>
        <div style={{ ...s.filters, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.text, marginRight: 'auto' }}><Percent size={18} aria-hidden />Margin by department</div>
          <StorePick stores={stores} value={storeId} onChange={setStore} />
        </div>
        {mq.isError ? <ErrorState onRetry={() => mq.refetch()} /> : !mq.data ? <div style={s.loading}>Loading...</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table} aria-label="Margin by department">
              <thead><tr>{['Department', 'Middle margin', 'Below cost', 'Under 10%', 'Average', 'Items', 'With a cost'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.department} data-testid="margin-row">
                    <td style={{ ...s.td, fontWeight: 600, whiteSpace: 'normal', minWidth: 120 }}>{r.department || 'No department'}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: r.medianPct != null && r.medianPct < 10 ? C.danger : undefined }}>{pct(r.medianPct) || <span style={{ color: TEXT_MUTED }}>No costs</span>}</td>
                    <td style={s.td}>{r.belowCost ? <Badge tone="danger">{r.belowCost.toLocaleString()}</Badge> : <span style={{ color: TEXT_MUTED }}>0</span>}</td>
                    <td style={s.td}>{r.under10 ? <Badge tone="warning">{r.under10.toLocaleString()}</Badge> : <span style={{ color: TEXT_MUTED }}>0</span>}</td>
                    <td style={s.td}>{pct(r.averagePct)}</td>
                    <td style={s.td}>{r.items.toLocaleString()}</td>
                    <td style={{ ...s.td, color: TEXT_MUTED }}>{r.withCost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding={0}>
        <div style={{ ...s.filters, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.text, flex: '1 1 100%' }}><Lightbulb size={18} aria-hidden />Deal ideas</div>
          {states.length > 1 && (
            <select aria-label="State" style={s.select} value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>
              {states.map((st) => <option key={st} value={st}>{st === 'TX' ? 'Texas stores' : st === 'OK' ? 'Oklahoma stores' : st}</option>)}
            </select>
          )}
          <SearchBox value={q} onChange={setQ} label="Find a deal idea" placeholder="Item name, e.g. chips" />
        </div>
        {ideas && (
          <div style={{ ...s.count, whiteSpace: 'normal' }}>
            Items with at least a {ideas.rules.minMarginPct}% margin at every store that has a cost, sold at several stores, each with a "2 for" price
            that saves the customer {ideas.rules.minSavingPct}% or more at the cheapest store and still leaves {ideas.rules.keepMarginPct}% at the store with
            the highest cost. Never tobacco, alcohol or lottery. Check a deal against the register in Offers before posting it.
          </div>
        )}
        {iq.isError ? <ErrorState onRetry={() => iq.refetch()} /> : !ideas ? <div style={s.loading}>Loading...</div> : ideas.total === 0 ? (
          <div style={s.loading}>No item fits. Try fewer words or all states.</div>
        ) : (
          <>
            <div style={s.count} aria-live="polite">{ideas.total.toLocaleString()} {ideas.total === 1 ? 'idea' : 'ideas'}, most stores first{iq.isFetching ? ' (updating...)' : ''}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table} aria-label="Deal ideas">
                <thead><tr>{['Item', 'Idea', 'After the deal', 'Register price', 'Margin now', 'Stores'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {ideas.ideas.map((x) => (
                    <tr key={x.key} data-testid="idea-row">
                      <td style={{ ...s.td, whiteSpace: 'normal', minWidth: 200 }}>
                        <button type="button" style={s.linkBtn} onClick={() => openItem(x.key)}>{x.name}</button>
                        <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>{x.upc}{x.department ? `, ${x.department}` : ''}</div>
                      </td>
                      <td style={s.td}><Badge tone="success">{x.dealText}</Badge></td>
                      <td style={{ ...s.td, whiteSpace: 'normal', fontSize: FONT.small, minWidth: 140 }}>{usd(x.unitCents)} each: saves {x.savingPct}%, keeps {x.marginAfterPct}% margin</td>
                      <td style={s.td}>{x.minPriceCents === x.maxPriceCents ? usd(x.minPriceCents) : `${usd(x.minPriceCents)} to ${usd(x.maxPriceCents)}`}</td>
                      <td style={s.td}>{x.marginNowPct}% or more</td>
                      <td style={s.td}>{x.stores}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination page={ideas.page} totalPages={ideas.pages} onPrevious={() => setPage(Math.max(1, ideas.page - 1))} onNext={() => setPage(ideas.page + 1)} />
          </>
        )}
      </Card>
    </>
  );
}

// ─── The hot food menu against the register ───────────────────────────────────

interface HotFoodRow { id: string; name: string; appCents: number; query: string; custom: boolean; registerCents: number | null; stores: { storeId: string; storeName: string; matches: number; pdiName: string | null; pdiCents: number | null; differs: boolean }[] }

export function HotFoodCheck() {
  const qc = useQueryClient();
  const hq = useQuery({ queryKey: ['hot-food-check'], queryFn: () => itemsApi.hotFoodCheck().then((r) => r.data.data as { canEdit: boolean; items: HotFoodRow[] }) });
  const [editing, setEditing] = useState<HotFoodRow | null>(null);
  const [repricing, setRepricing] = useState<HotFoodRow | null>(null);
  const [askAll, setAskAll] = useState(false);
  async function useRegisterAll() {
    setBusy(true);
    try {
      const r = (await itemsApi.useHotFoodRegisterPriceAll()).data.data as { changed: number };
      toast.success(`${r.changed} hot food ${r.changed === 1 ? 'price is' : 'prices are'} now the register's in the app.`);
      setAskAll(false);
      qc.invalidateQueries({ queryKey: ['hot-food-check'] });
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'Not changed. Try again.'); } finally { setBusy(false); }
  }
  const [busy, setBusy] = useState(false);
  async function useRegister() {
    if (!repricing) return;
    setBusy(true);
    try {
      await itemsApi.useHotFoodRegisterPrice(repricing.id);
      toast.success(`${repricing.name} is now ${usd(repricing.registerCents)} in the app.`);
      setRepricing(null);
      qc.invalidateQueries({ queryKey: ['hot-food-check'] });
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'Not changed. Try again.'); } finally { setBusy(false); }
  }
  const items = (hq.data?.items ?? []).filter((x) => x.stores.length > 0);
  const off = items.reduce((n, x) => n + x.stores.filter((st) => st.differs).length, 0);
  async function save(words: string | null) {
    if (!editing) return;
    setBusy(true);
    try { await itemsApi.setHotFoodQuery(editing.id, words); setEditing(null); qc.invalidateQueries({ queryKey: ['hot-food-check'] }); }
    catch (e: any) { toast.error(e?.response?.data?.error ?? 'Not saved. Try again.'); } finally { setBusy(false); }
  }
  return (
    <Card padding={0} style={{ marginTop: 16 }}>
      <div style={{ ...s.filters, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.text, marginRight: 'auto' }}><Flame size={18} aria-hidden />Hot food menu against the register</div>
        {hq.data && <Badge tone={off ? 'danger' : 'success'}>{off ? `${off} price${off === 1 ? '' : 's'} differ` : 'All match'}</Badge>}
        {hq.data?.canEdit && items.filter((x) => x.registerCents != null).length > 1 && (
          <Button size="sm" onClick={() => setAskAll(true)} disabled={busy}>Use register prices for all {items.filter((x) => x.registerCents != null).length}</Button>
        )}
      </div>
      <div style={{ ...s.count, whiteSpace: 'normal' }}>
        Each hot food item in the app next to the item its words find in the store's PDI hot food department. A different price means the app
        and the register disagree: the customer pays the register's.{hq.data?.canEdit ? ' If the wrong PDI item is found, change the words.' : ''}
      </div>
      {hq.isError ? <ErrorState onRetry={() => hq.refetch()} /> : !hq.data ? <div style={s.loading}>Loading...</div> : !items.length ? (
        <div style={s.loading}>No hot food item is on at a store with a PDI list.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table} aria-label="Hot food menu against the register">
            <thead><tr>{['Menu item', 'App price', 'Store', 'In PDI', 'Register'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {items.flatMap((it) => it.stores.map((st, i) => (
                <tr key={`${it.id}-${st.storeId}`} data-testid="hot-food-row">
                  {i === 0 && (
                    <td style={{ ...s.td, whiteSpace: 'normal', minWidth: 180 }} rowSpan={it.stores.length}>
                      <span style={{ fontWeight: 600 }}>{it.name}</span>
                      <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>Words: "{it.query}"{it.custom ? '' : ' (from the name)'}</div>
                      {hq.data!.canEdit && <button type="button" style={{ ...s.linkBtn, fontSize: FONT.small }} onClick={() => setEditing(it)}>Change the words</button>}
                      {hq.data!.canEdit && it.registerCents != null && (
                        <div style={{ marginTop: 6 }}><Button size="sm" onClick={() => setRepricing(it)} aria-label={`Use the register price ${usd(it.registerCents)} for ${it.name}`}>Use the register price {usd(it.registerCents)}</Button></div>
                      )}
                    </td>
                  )}
                  {i === 0 && <td style={s.td} rowSpan={it.stores.length}>{usd(it.appCents)}</td>}
                  <td style={s.td}>{shortStore(st.storeName)}</td>
                  <td style={{ ...s.td, whiteSpace: 'normal' }}>{st.pdiName ?? <span style={{ color: TEXT_MUTED }}>Not found</span>}{st.matches > 1 ? <span style={{ color: TEXT_MUTED, fontSize: FONT.caption }}> ({st.matches} found)</span> : null}</td>
                  <td style={s.td}>{st.pdiCents == null ? '' : st.differs ? <Badge tone="danger">{usd(st.pdiCents)}</Badge> : usd(st.pdiCents)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
      {askAll && (
        <ConfirmModal open headingLevel="h2" title={`Register prices for ${items.filter((x) => x.registerCents != null).length} hot food items?`} busy={busy}
          message={<>Each item whose stores' registers agree on one price gets that price in the app, for every store that has it on the menu: {items.filter((x) => x.registerCents != null).map((x) => `${x.name} ${usd(x.appCents)} to ${usd(x.registerCents)}`).join('; ')}.</>}
          confirmLabel="Use them" onConfirm={() => void useRegisterAll()} onCancel={() => setAskAll(false)} />
      )}
      {repricing && (
        <ConfirmModal open headingLevel="h2" title={`${repricing.name}: ${usd(repricing.registerCents)} in the app?`} busy={busy}
          message={<>Every store's register charges {usd(repricing.registerCents)} for it; the app shows {usd(repricing.appCents)}. The app price changes for every store that has it on the menu.</>}
          confirmLabel={`Use ${usd(repricing.registerCents)}`} onConfirm={() => void useRegister()} onCancel={() => setRepricing(null)} />
      )}
      {editing && (
        <ConfirmModal open headingLevel="h2" title={`Find "${editing.name}" in PDI`} busy={busy} withInput inputLabel="Words in the PDI item's name"
          inputPlaceholder={editing.query} message={<>Every word must be in the PDI item's name, for example "2pc dark". Leave it empty to go back to the menu item's name.</>}
          confirmLabel="Save" onConfirm={(v) => void save(v?.trim() ? v.trim() : null)} onCancel={() => setEditing(null)} />
      )}
    </Card>
  );
}

// ─── What a reward costs the store (Rewards catalog) ──────────────────────────

export interface RewardCost { id: string; query: string; custom: boolean; pointsCost: number; items: number; withCost: number; costCents: number | null; minCostCents: number | null; maxCostCents: number | null; priceCents: number | null; examples: string[] }

/** The rewards' costs, one query for the whole page. */
export function useRewardCosts() {
  return useQuery({ queryKey: ['reward-costs'], staleTime: 5 * 60_000, retry: false,
    queryFn: () => itemsApi.rewardCosts().then((r) => new Map((r.data.data.rewards as RewardCost[]).map((x) => [x.id, x]))) });
}

/** "Costs the store about $0.95" under a reward's points, with its PDI words changeable by whoever may change the reward. */
export function RewardCostLine({ cost, canEdit }: { cost: RewardCost | undefined; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!cost) return null;
  async function save(words: string | null) {
    setBusy(true);
    try { await itemsApi.setRewardQuery(cost!.id, words); setOpen(false); qc.invalidateQueries({ queryKey: ['reward-costs'] }); }
    catch (e: any) { toast.error(e?.response?.data?.error ?? 'Not saved. Try again.'); } finally { setBusy(false); }
  }
  const range = cost.minCostCents != null && cost.maxCostCents != null && cost.minCostCents !== cost.maxCostCents ? ` (${usd(cost.minCostCents)} to ${usd(cost.maxCostCents)})` : '';
  const text = cost.costCents != null ? `Costs the store about ${usd(cost.costCents)}` : cost.items ? 'No cost in PDI for it' : 'Not found in PDI';
  return (
    <span style={{ display: 'block', fontSize: 11, color: cost.costCents != null ? C.text2 : TEXT_MUTED, marginTop: 4, whiteSpace: 'normal' }}
      title={`PDI words "${cost.query}": ${cost.items} item${cost.items === 1 ? '' : 's'}${cost.withCost ? `, ${cost.withCost} with a cost${range}` : ''}${cost.examples.length ? `. For example ${cost.examples.slice(0, 3).join('; ')}` : ''}`}>
      {text}
      {canEdit && <> <button type="button" onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}
        aria-label={`Change the PDI words for this reward (now "${cost.query}")`}>PDI words</button></>}
      {open && (
        <ConfirmModal open headingLevel="h2" title="Find this reward in PDI" busy={busy} withInput inputLabel="Words in the PDI items' names" inputPlaceholder={cost.query}
          message={<>Now "{cost.query}"{cost.custom ? '' : ' (from the reward\'s name)'}: {cost.items} item{cost.items === 1 ? '' : 's'}{cost.examples.length ? `, for example ${cost.examples.slice(0, 3).join('; ')}` : ''}.
            Every word must be in the item's name ("frazil 12", "monster 16oz"). Leave it empty to go back to the name.</>}
          confirmLabel="Save" onConfirm={(v) => void save(v?.trim() ? v.trim() : null)} onCancel={() => setOpen(false)} />
      )}
    </span>
  );
}

const s: Record<string, React.CSSProperties> = {
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', padding: 14, borderBottom: `1px solid ${C.border}` },
  select: { ...INPUT, width: 'auto', flex: '1 1 170px', minWidth: 0, maxWidth: '100%' },
  loading: { padding: 32, color: TEXT_MUTED, textAlign: 'center' },
  count: { padding: '8px 14px', fontSize: FONT.small, color: TEXT_MUTED, borderBottom: `1px solid ${C.border}` },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: FONT.body },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: FONT.small, color: TEXT_MUTED, fontWeight: 600, background: C.subtle, whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap', verticalAlign: 'top' },
  row: { cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', padding: 0, font: 'inherit', color: C.primary, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
};
