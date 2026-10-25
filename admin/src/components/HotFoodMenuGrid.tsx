// Hot food "Store menus" (HQ, 2026-10-20): one grid for every item and every store. Rows are catalog items (grouped by menu section),
// columns are stores. "Which stores carry it" puts an item on, or takes it off, a store's menu; "Sold out today" switches an item the
// store carries between in stock and sold out. Column and row buttons and "Copy a store's menu" do many at once. Nothing is saved until
// "Save changes": the whole batch goes to the server in one request (backend controllers/hotFoodMenuGrid.controller.ts).
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, Copy } from 'lucide-react';
import { hotFoodGridApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { useUnsaved } from '../lib/unsaved';
import { C, FONT, INPUT, RADIUS, SHADOW } from '../lib/theme';
import { Button, Card, EmptyState, Notice, Tabs } from './kit';

type Item = { id: string; name: string; category: string | null; price: number; imageUrl: string | null };
type GridStore = { id: string; name: string; city: string | null; hotFoodEnabled: boolean };
type Cells = Record<string, Record<string, boolean>>;   // item -> store -> in stock (a store missing from the item does not carry it)
type Mode = 'carry' | 'stock';
type Edit = { carried: boolean; available: boolean };
const MORE = 'More';

export default function HotFoodMenuGrid() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hot-food-menu-grid'], queryFn: () => hotFoodGridApi.get() });
  const data = q.data?.data?.data as { items: Item[]; stores: GridStore[]; cells: Cells; categories: string[] } | undefined;
  const items = data?.items ?? [], stores = data?.stores ?? [], cells = data?.cells ?? {}, categories = data?.categories ?? [];

  const [mode, setMode] = useState<Mode>('carry');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [copyFrom, setCopyFrom] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const key = (i: string, s: string) => `${i}|${s}`;

  const base = (i: string, s: string): Edit => { const v = cells[i]?.[s]; return { carried: v !== undefined, available: v === true || v === undefined }; };
  const eff = (i: string, s: string): Edit => edits[key(i, s)] ?? base(i, s);
  // Records the wanted state for one cell; a cell that ends up as it already is on the server stops counting as a change
  const want = (draft: Record<string, Edit>, i: string, s: string, w: Edit) => {
    const b = base(i, s);
    const same = w.carried === b.carried && (!w.carried || w.available === b.available);
    if (same) delete draft[key(i, s)]; else draft[key(i, s)] = w.carried ? w : { carried: false, available: true };
  };
  const change = (fn: (draft: Record<string, Edit>) => void) => setEdits((prev) => { const d = { ...prev }; fn(d); return d; });

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    return items.filter((i) => (!cat || (i.category ?? MORE) === cat) && (!t || i.name.toLowerCase().includes(t)));
  }, [items, search, cat]);
  const groups = useMemo(() => {
    const order = [...categories, ...(items.some((i) => !i.category) ? [MORE] : [])];
    return order.map((c) => ({ name: c, items: visible.filter((i) => (i.category ?? MORE) === c) })).filter((g) => g.items.length > 0);
  }, [visible, categories, items]);

  const changes = Object.keys(edits).length;
  useUnsaved('hot-food-menu-grid', changes > 0);

  const toggleCell = (i: string, s: string) => change((d) => {
    const e = eff(i, s);
    if (mode === 'carry') want(d, i, s, { carried: !e.carried, available: true });
    else if (e.carried) want(d, i, s, { carried: true, available: !e.available });
  });
  // Every visible item at one store, or every store for one item
  const setColumn = (s: string, on: boolean) => change((d) => visible.forEach((i) => {
    const e = eff(i.id, s);
    if (mode === 'carry') want(d, i.id, s, { carried: on, available: on && e.carried ? e.available : true });   // adding keeps what is already sold out
    else if (e.carried) want(d, i.id, s, { carried: true, available: on });
  }));
  const setRow = (i: string, on: boolean) => change((d) => stores.forEach((st) => {
    const e = eff(i, st.id);
    if (mode === 'carry') want(d, i, st.id, { carried: on, available: on && e.carried ? e.available : true });
    else if (e.carried) want(d, i, st.id, { carried: true, available: on });
  }));
  const copyMenu = () => {
    if (!copyFrom || !copyTo || copyFrom === copyTo) return;
    change((d) => items.forEach((i) => { const f = eff(i.id, copyFrom); want(d, i.id, copyTo, { carried: f.carried, available: f.carried ? f.available : true }); }));
    toast.success(`Copied. Check ${stores.find((s) => s.id === copyTo)?.name}, then save.`);
  };

  const save = useMutation({
    mutationFn: () => {
      const list = Object.entries(edits).map(([k, w]) => {
        const [itemId, storeId] = k.split('|'), b = base(itemId, storeId);
        if (!w.carried) return { itemId, storeId, carried: false };
        if (!b.carried) return { itemId, storeId, carried: true, available: w.available };
        return { itemId, storeId, available: w.available };
      });
      return hotFoodGridApi.apply(list);
    },
    onSuccess: (r) => {
      const d = r.data?.data ?? {};
      const parts = [d.added ? `${d.added} added` : '', d.removed ? `${d.removed} removed` : '', d.switched ? `${d.switched} switched` : ''].filter(Boolean);
      toast.success(parts.length ? `Saved: ${parts.join(', ')}.` : 'Nothing needed changing.');
      setEdits({});
      qc.invalidateQueries({ queryKey: ['hot-food-menu-grid'] });
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
      qc.invalidateQueries({ queryKey: ['catalog-store-assignments'] });
    },
    onError: (e) => toast.error(serverMessage(e, 'Could not save. Nothing was changed.')),
  });

  if (q.isLoading) return <div style={{ color: C.muted }}>Loading the menus…</div>;
  if (q.isError || !data) return <Notice tone="danger">Could not load the store menus. Reload the page.</Notice>;
  if (items.length === 0) return <EmptyState title="No items yet" description="Add your hot food items in the Catalog tab first, then choose which stores carry them here." />;
  if (stores.length === 0) return <EmptyState title="No open stores" description="Open stores appear here as columns." />;

  const carriedCount = (s: string) => items.filter((i) => eff(i.id, s).carried).length;
  const soldOutCount = (s: string) => items.filter((i) => { const e = eff(i.id, s); return e.carried && !e.available; }).length;

  return (
    <div>
      <Notice tone="info" style={{ marginBottom: 14 }}>
        {mode === 'carry'
          ? <>Click a box to put an item on a store's menu, or take it off. Use <b>all</b> and <b>none</b> to do a whole store or a whole item at once, or copy one store's menu to another.</>
          : <>Click a box to mark an item <b>sold out</b> or back <b>in stock</b> at a store. Customers do not see a sold-out item. Only items a store carries can be switched.</>}
      </Notice>

      <div style={bar}>
        <Tabs asButtons ariaLabel="What to set" value={mode} onChange={(v) => setMode(v as Mode)} style={{ marginBottom: 0 }}
          tabs={[{ value: 'carry', label: 'Which stores carry it' }, { value: 'stock', label: 'Sold out today' }]} />
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: C.muted }} />
          <input aria-label="Find an item" placeholder="Find an item" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select aria-label="Menu section" value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
          <option value="">All sections</option>
          {[...categories, ...(items.some((i) => !i.category) ? [MORE] : [])].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {mode === 'carry' && (
        <div style={{ ...bar, marginTop: 8 }}>
          <Copy size={15} color={C.muted} aria-hidden />
          <span style={{ fontSize: FONT.small, color: C.text2, fontWeight: 600 }}>Copy a store's menu</span>
          <select aria-label="Copy from" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
            <option value="">From…</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span style={{ fontSize: FONT.small, color: C.muted }}>to</span>
          <select aria-label="Copy to" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
            <option value="">To…</option>{stores.filter((s) => s.id !== copyFrom).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" onClick={copyMenu} disabled={!copyFrom || !copyTo || copyFrom === copyTo}>Copy menu</Button>
        </div>
      )}

      {groups.length === 0 ? <div style={{ marginTop: 16 }}><EmptyState title="No items match" description="Clear the search or choose All sections." /></div> : (
        <Card padding={0} style={{ marginTop: 12, overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', maxHeight: '68vh' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...stickyL, zIndex: 4, minWidth: 236, textAlign: 'left', textTransform: 'none', letterSpacing: 0 }}>
                    <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text }}>{visible.length} item{visible.length !== 1 ? 's' : ''}</div>
                    <div style={{ fontSize: FONT.caption, color: C.muted, fontWeight: 400 }}>{stores.length} stores</div>
                  </th>
                  {stores.map((s) => (
                    <th key={s.id} style={{ ...th, width: 88, minWidth: 88, maxWidth: 88, textTransform: 'none', letterSpacing: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                      <div title={`${s.name}${s.city ? `, ${s.city}` : ''}`} style={{ fontSize: FONT.caption, fontWeight: 700, color: C.text, lineHeight: 1.25, wordBreak: 'break-word' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: s.hotFoodEnabled ? C.muted : C.warning, fontWeight: s.hotFoodEnabled ? 400 : 600, marginTop: 2 }}>
                        {!s.hotFoodEnabled ? 'Hot food off' : mode === 'carry' ? `${carriedCount(s.id)} items` : `${soldOutCount(s.id)} sold out`}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                        <button type="button" style={link} onClick={() => setColumn(s.id, true)} aria-label={`${mode === 'carry' ? 'Carry all shown items at' : 'Mark all shown items in stock at'} ${s.name}`}>all</button>
                        <button type="button" style={link} onClick={() => setColumn(s.id, false)} aria-label={`${mode === 'carry' ? 'Remove all shown items from' : 'Mark all shown items sold out at'} ${s.name}`}>none</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.name} name={g.name} count={g.items.length} cols={stores.length + 1}>
                    {g.items.map((i) => (
                      <tr key={i.id}>
                        <td style={{ ...td, ...stickyL, textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {i.imageUrl ? <img src={i.imageUrl} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flex: 'none' }} />
                              : <div aria-hidden style={{ width: 34, height: 34, borderRadius: 8, background: C.hover, flex: 'none' }} />}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: FONT.small, fontWeight: 600, color: C.text, lineHeight: 1.25 }}>{i.name}</div>
                              <div style={{ fontSize: FONT.caption, color: C.muted }}>${i.price.toFixed(2)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                              <button type="button" style={link} onClick={() => setRow(i.id, true)} aria-label={`${mode === 'carry' ? 'Carry' : 'In stock'}: ${i.name} at every store`}>all</button>
                              <button type="button" style={link} onClick={() => setRow(i.id, false)} aria-label={`${mode === 'carry' ? 'Remove' : 'Sold out'}: ${i.name} at every store`}>none</button>
                            </div>
                          </div>
                        </td>
                        {stores.map((s) => <Cell key={s.id} mode={mode} e={eff(i.id, s.id)} edited={edits[key(i.id, s.id)] !== undefined} onClick={() => toggleCell(i.id, s.id)} label={`${i.name} at ${s.name}`} />)}
                      </tr>
                    ))}
                  </GroupRows>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: FONT.caption, color: C.muted, alignItems: 'center' }}>
        {mode === 'carry'
          ? <><Key box="in">On the menu</Key><Key box="none">Not carried</Key></>
          : <><Key box="in">In stock</Key><Key box="out">Sold out</Key><Key box="na">Not carried</Key></>}
        <Key box="edit">Changed, not saved</Key>
      </div>

      {changes > 0 && (
        <div role="region" aria-label="Unsaved changes" style={saveBar}>
          <span style={{ fontWeight: 600, color: C.text }}>{changes} change{changes !== 1 ? 's' : ''} not saved</span>
          <span style={{ flex: 1 }} />
          <Button onClick={() => setEdits({})} disabled={save.isPending}>Discard</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
        </div>
      )}
    </div>
  );
}

function GroupRows({ name, count, cols, children }: { name: string; count: number; cols: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={cols} style={{ padding: '7px 14px', background: C.primaryTint, color: C.primary, fontSize: FONT.caption, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>
          {name} <span style={{ fontWeight: 400, opacity: 0.8 }}>({count})</span>
        </td>
      </tr>
      {children}
    </>
  );
}

function Cell({ mode, e, edited, onClick, label }: { mode: Mode; e: Edit; edited: boolean; onClick: () => void; label: string }) {
  const off = mode === 'stock' && !e.carried;
  let face: { bg: string; fg: string; text: string; border: string } = { bg: C.surface, fg: C.muted, text: '', border: C.borderStrong };
  if (mode === 'carry') face = e.carried ? { bg: C.success, fg: '#fff', text: '✓', border: C.success } : face;
  else if (!e.carried) face = { bg: C.subtle, fg: C.borderStrong, text: '–', border: C.border };
  else face = e.available ? { bg: C.successTint, fg: C.success, text: 'In', border: '#b9dfc7' } : { bg: C.dangerTint, fg: C.danger, text: 'Out', border: '#efc2c6' };
  const state = mode === 'carry' ? (e.carried ? 'on the menu' : 'not carried') : !e.carried ? 'not carried' : e.available ? 'in stock' : 'sold out';
  return (
    <td style={{ ...td, textAlign: 'center' }}>
      <button type="button" onClick={onClick} disabled={off} aria-label={`${label}: ${state}`} aria-pressed={mode === 'carry' ? e.carried : e.carried && e.available}
        style={{ width: 40, height: 32, borderRadius: 8, border: `1.5px solid ${edited ? '#d98a00' : face.border}`, background: face.bg, color: face.fg, fontSize: FONT.small, fontWeight: 700, cursor: off ? 'default' : 'pointer', boxShadow: edited ? '0 0 0 3px #fbe7bd' : 'none', fontFamily: 'inherit' }}>
        {face.text}
      </button>
    </td>
  );
}

function Key({ box, children }: { box: 'in' | 'out' | 'na' | 'none' | 'edit'; children: React.ReactNode }) {
  const s: Record<string, [string, string]> = { in: [C.success, C.success], out: [C.dangerTint, '#efc2c6'], na: [C.subtle, C.border], none: [C.surface, C.borderStrong], edit: [C.surface, '#d98a00'] };
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 16, borderRadius: 4, background: s[box][0], border: `1.5px solid ${s[box][1]}`, boxShadow: box === 'edit' ? '0 0 0 2px #fbe7bd' : 'none' }} />{children}</span>;
}

const bar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
const th: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 3, background: C.surface, padding: '10px 6px', borderBottom: `1px solid ${C.borderStrong}`, textAlign: 'center', verticalAlign: 'top' };
const td: React.CSSProperties = { padding: '6px 6px', borderBottom: `1px solid ${C.border}`, background: C.surface };
const stickyL: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 2, background: C.surface, borderRight: `1px solid ${C.border}`, paddingLeft: 14 };
const link: React.CSSProperties = { background: 'none', border: 'none', padding: '2px 0', fontSize: 11, fontWeight: 600, color: C.primary, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' };
const saveBar: React.CSSProperties = { position: 'sticky', bottom: 12, marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: RADIUS.lg, boxShadow: SHADOW.pop, zIndex: 10 };
