// Hot Food > Menus by time (HQ, 2026-11-10): menus like "Breakfast" 5:00 to 10:30 with the items in each. The app shows what is served
// now, greys out the rest with when it is served, stops orders for now at last call, and (with "Order hot food ahead" on in Settings)
// lets customers pick a pickup time inside the item's menu. HQ can give a store its own times or leave a menu out at a store. An item
// in no menu is served all day. The rules are in backend utils/hotFoodMenus.ts.
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { hotFoodMenusApi, type DaypartInput } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Badge, Button, Card, Chip, EmptyState, Field, HowItWorks, Notice } from './kit';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';

type CatalogItem = { id: string; name: string; price: number; imageUrl?: string | null; category?: string | null };
type Store = { id: string; name: string; hotFoodEnabled?: boolean };
type StoreRow = { storeId: string; fromTime: string | null; toTime: string | null; days: number[]; isOff: boolean };
type Daypart = { id: string; name: string; nameEs: string | null; fromTime: string; toTime: string; days: number[]; lastCallMinutes: number; sortOrder: number; isActive: boolean; stores: StoreRow[]; itemIds: string[] };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hour = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const daysWords = (days: number[]) => (days.length === 0 || days.length === 7 ? 'every day' : [...days].sort((a, b) => a - b).map((d) => DAYS[d]).join(', '));
const whenWords = (d: { fromTime: string; toTime: string; days: number[] }) => `${hour(d.fromTime)} to ${hour(d.toTime)}, ${daysWords(d.days)}`;
const toggle = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort((a, b) => a - b));

export default function HotFoodDaypartsPanel({ catalog, stores }: { catalog: CatalogItem[]; stores: Store[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hot-food-dayparts'], queryFn: () => hotFoodMenusApi.list() });
  const menus: Daypart[] = Array.isArray(q.data?.data?.data) ? q.data!.data.data : [];
  const [editing, setEditing] = useState<{ id: string | null; form: DaypartInput } | null>(null);
  const [picking, setPicking] = useState<Daypart | null>(null);
  const [storeEdit, setStoreEdit] = useState<{ menu: Daypart; store: Store } | null>(null);
  const [deleting, setDeleting] = useState<Daypart | null>(null);
  const [openStores, setOpenStores] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['hot-food-dayparts'] });
  const hotStores = stores.filter((s) => s.hotFoodEnabled !== false);
  const inNoMenu = catalog.filter((c) => !menus.some((m) => m.isActive && m.itemIds.includes(c.id))).length;

  const flip = useMutation({
    mutationFn: (m: Daypart) => hotFoodMenusApi.update(m.id, { isActive: !m.isActive }),
    onSuccess: refresh,
    onError: (e) => toast.error(serverMessage(e, 'Could not change the menu.')),
  });
  const del = useMutation({
    mutationFn: (id: string) => hotFoodMenusApi.remove(id),
    onSuccess: () => { toast.success('Menu deleted. Its items are served all day unless they are in another menu.'); setDeleting(null); refresh(); qc.invalidateQueries({ queryKey: ['hot-food-catalog'] }); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not delete the menu.')); setDeleting(null); },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <HowItWorks style={{ flex: '1 1 320px' }}>
          A menu by time is a part of the day, like Breakfast from 5:00 to 10:30 (store time), with the items served then. The app switches by
          itself: customers order what is served now, and see the other items greyed out with when they are served. Orders for now stop at
          last call, a few minutes before a menu ends, so the kitchen is not caught out. An item in no menu is served all day, whenever hot
          food is open. A store can have its own times for a menu, or not serve it at all. With "Order hot food ahead" on (Settings &gt;
          Features), customers can pick a pickup time inside the item's menu, like breakfast for tomorrow at 6:30.
        </HowItWorks>
        <Button variant="primary" onClick={() => setEditing({ id: null, form: menus.length === 0
          ? { name: 'Breakfast', nameEs: 'Desayuno', fromTime: '05:00', toTime: '10:30', days: [], lastCallMinutes: 15, isActive: true }
          : { name: '', nameEs: '', fromTime: '11:00', toTime: '15:00', days: [], lastCallMinutes: 15, isActive: true } })}>
          New menu
        </Button>
      </div>

      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the menus.</Notice>
        : menus.length === 0 ? (
          <EmptyState title="No menus by time yet" description="Every item is served whenever hot food is open. Make a Breakfast menu to serve some items in the morning only." />
        ) : (
          <>
            <div style={{ fontSize: FONT.small, color: TEXT_MUTED, marginBottom: 10 }}>
              {inNoMenu} of {catalog.length} catalog item{catalog.length === 1 ? '' : 's'} are in no menu, so they are served all day.
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {menus.map((m) => {
                const own = m.stores.filter((s) => !s.isOff && s.fromTime).length, off = m.stores.filter((s) => s.isOff).length;
                const items = catalog.filter((c) => m.itemIds.includes(c.id));
                return (
                  <Card key={m.id} padding={14} style={{ opacity: m.isActive ? 1 : 0.65 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: C.text, fontSize: FONT.section }}>{m.name}</strong>
                      {m.nameEs && <span style={{ color: TEXT_MUTED, fontSize: FONT.small }}>({m.nameEs})</span>}
                      {!m.isActive && <Badge>Off</Badge>}
                    </div>
                    <div style={{ fontSize: FONT.body, color: C.text, marginTop: 4 }}>{whenWords(m)}</div>
                    <div style={{ fontSize: FONT.small, color: TEXT_MUTED, marginTop: 2 }}>
                      Last call {m.lastCallMinutes} min before the end · {items.length} item{items.length === 1 ? '' : 's'}
                      {own ? ` · ${own} store${own === 1 ? '' : 's'} with own times` : ''}{off ? ` · not at ${off} store${off === 1 ? '' : 's'}` : ''}
                    </div>
                    {items.length > 0 && (
                      <div style={{ fontSize: FONT.small, color: C.text2, marginTop: 6 }}>
                        {items.slice(0, 6).map((i) => i.name).join(', ')}{items.length > 6 ? ` and ${items.length - 6} more` : ''}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      <Button size="sm" onClick={() => setEditing({ id: m.id, form: { name: m.name, nameEs: m.nameEs ?? '', fromTime: m.fromTime, toTime: m.toTime, days: m.days, lastCallMinutes: m.lastCallMinutes, isActive: m.isActive } })}>Edit</Button>
                      <Button size="sm" onClick={() => setPicking(m)}>Items ({items.length})</Button>
                      <Button size="sm" aria-expanded={openStores === m.id} onClick={() => setOpenStores(openStores === m.id ? null : m.id)}>Store times</Button>
                      <Button size="sm" onClick={() => flip.mutate(m)} disabled={flip.isPending}>{m.isActive ? 'Switch off' : 'Switch on'}</Button>
                      <Button size="sm" onClick={() => setDeleting(m)} aria-label={`Delete ${m.name}`}>Delete</Button>
                    </div>
                    {openStores === m.id && (
                      <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'grid', gap: 6 }}>
                        {hotStores.length === 0 && <div style={{ color: TEXT_MUTED, fontSize: FONT.small }}>No store takes hot food orders yet.</div>}
                        {hotStores.map((st) => {
                          const row = m.stores.find((s) => s.storeId === st.id);
                          const words = row?.isOff ? 'Not at this store' : row?.fromTime && row.toTime ? `Own times: ${whenWords({ fromTime: row.fromTime, toTime: row.toTime, days: row.days })}` : 'Chain times';
                          return (
                            <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: FONT.small, color: C.text, minWidth: 0 }}>
                                <strong>{st.name}</strong> <span style={{ color: row?.isOff ? C.danger : row?.fromTime ? C.text : TEXT_MUTED }}>{words}</span>
                              </span>
                              <Button size="sm" onClick={() => setStoreEdit({ menu: m, store: st })} aria-label={`Change ${m.name} at ${st.name}`}>Change</Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}

      {editing && <MenuForm id={editing.id} initial={editing.form} onClose={() => setEditing(null)} onSaved={refresh} />}
      {picking && <ItemsPicker menu={picking} menus={menus} catalog={catalog} onClose={() => setPicking(null)} onSaved={() => { refresh(); qc.invalidateQueries({ queryKey: ['hot-food-catalog'] }); }} />}
      {storeEdit && <StoreTimes menu={storeEdit.menu} store={storeEdit.store} onClose={() => setStoreEdit(null)} onSaved={refresh} />}
      <ConfirmModal
        open={!!deleting}
        title="Delete this menu?"
        danger
        busy={del.isPending}
        confirmLabel="Delete"
        message={<p style={{ margin: 0 }}>"{deleting?.name}" goes, and its items are served all day unless they are in another menu. To keep it for later, use Switch off instead.</p>}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function DaysPicker({ value, onChange, id }: { value: number[]; onChange: (v: number[]) => void; id: string }) {
  return (
    <div>
      <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text, marginBottom: 6 }} id={id}>Days</div>
      <div role="group" aria-labelledby={id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip selected={value.length === 0} onClick={() => onChange([])}>Every day</Chip>
        {DAYS.map((d, i) => <Chip key={d} selected={value.includes(i)} onClick={() => onChange(toggle(value, i))}>{d}</Chip>)}
      </div>
    </div>
  );
}

function MenuForm({ id, initial, onClose, onSaved }: { id: string | null; initial: DaypartInput; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<DaypartInput>(initial);
  const set = <K extends keyof DaypartInput>(k: K, v: DaypartInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const last = Number(f.lastCallMinutes);
  const problem = !f.name.trim() ? 'Give the menu a name, like Breakfast.' : !f.fromTime || !f.toTime ? 'Give the start and end time.'
    : f.fromTime === f.toTime ? 'The menu must end at a different time than it starts.'
    : !Number.isInteger(last) || last < 0 || last > 120 ? 'Last call must be from 0 to 120 minutes.' : null;
  const save = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const data = { ...f, name: f.name.trim(), nameEs: (f.nameEs ?? '').trim() || null, lastCallMinutes: last };
      return id ? hotFoodMenusApi.update(id, data) : hotFoodMenusApi.create(data);
    },
    onSuccess: () => { toast.success(id ? 'Menu saved' : 'Menu made. Now pick its items with Items.'); onSaved(); onClose(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the menu.')),
  });
  return (
    <Modal title={id ? 'Edit menu' : 'New menu'} subtitle="A part of the day and the items served then" onClose={onClose} busy={save.isPending} maxWidth={520}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="Name" htmlFor="dp-name" required>
            <input id="dp-name" style={INPUT} value={f.name} maxLength={40} placeholder="Breakfast" onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Name in Spanish" htmlFor="dp-name-es" hint="Optional.">
            <input id="dp-name-es" style={INPUT} value={f.nameEs ?? ''} maxLength={40} placeholder="Desayuno" onChange={(e) => set('nameEs', e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="From" htmlFor="dp-from" required><input id="dp-from" type="time" style={{ ...INPUT, width: 150 }} value={f.fromTime} onChange={(e) => set('fromTime', e.target.value)} /></Field>
          <Field label="To" htmlFor="dp-to" required><input id="dp-to" type="time" style={{ ...INPUT, width: 150 }} value={f.toTime} onChange={(e) => set('toTime', e.target.value)} /></Field>
          <Field label="Last call" htmlFor="dp-last" hint="Minutes before the end">
            <input id="dp-last" type="number" min={0} max={120} step={5} style={{ ...INPUT, width: 110 }} value={f.lastCallMinutes} onChange={(e) => set('lastCallMinutes', e.target.value as any)} />
          </Field>
        </div>
        {f.fromTime && f.toTime && f.toTime < f.fromTime && <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>It runs past midnight; the hours after midnight count for the day it starts.</div>}
        <DaysPicker id="dp-days" value={f.days} onChange={(v) => set('days', v)} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.body }}>
          <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> On (off: its items are served all day unless they are in another menu)
        </label>
        {problem && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{problem}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : id ? 'Save' : 'Make menu'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ItemsPicker({ menu, menus, catalog, onClose, onSaved }: { menu: Daypart; menus: Daypart[]; catalog: CatalogItem[]; onClose: () => void; onSaved: () => void }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(menu.itemIds));
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return catalog.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.category ?? '').toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, search]);
  const others = (id: string) => menus.filter((m) => m.id !== menu.id && m.itemIds.includes(id)).map((m) => m.name);
  const flipOne = (id: string) => setChosen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((c) => chosen.has(c.id));
  const save = useMutation({
    mutationFn: () => hotFoodMenusApi.setItems(menu.id, [...chosen]),
    onSuccess: (r: any) => { const d = r?.data?.data ?? {}; toast.success(`${menu.name}: ${d.added ?? 0} added, ${d.removed ?? 0} taken out.`); onSaved(); onClose(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the items.')),
  });
  return (
    <Modal title={`Items in ${menu.name}`} subtitle={`${chosen.size} chosen · ${whenWords(menu)}`} onClose={onClose} busy={save.isPending} maxWidth={560}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input aria-label="Search items" style={{ ...INPUT, flex: '1 1 200px' }} placeholder="Search items or categories" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button size="sm" onClick={() => setChosen((p) => { const n = new Set(p); shown.forEach((c) => (allShown ? n.delete(c.id) : n.add(c.id))); return n; })}>
            {allShown ? 'Clear the ones shown' : `Pick all ${shown.length} shown`}
          </Button>
        </div>
        <div style={{ maxHeight: '50vh', overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          {shown.length === 0 && <div style={{ padding: 12, color: TEXT_MUTED }}>No items match.</div>}
          {shown.map((c) => {
            const also = others(c.id);
            return (
              <label key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <input type="checkbox" checked={chosen.has(c.id)} onChange={() => flipOne(c.id)} />
                {c.imageUrl ? <img src={c.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ width: 32, height: 32, borderRadius: 6, background: C.subtle, display: 'inline-block' }} aria-hidden="true" />}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ display: 'block', fontSize: FONT.caption, color: TEXT_MUTED }}>{[c.category, `$${c.price.toFixed(2)}`, also.length ? `also in ${also.join(', ')}` : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save items'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function StoreTimes({ menu, store, onClose, onSaved }: { menu: Daypart; store: Store; onClose: () => void; onSaved: () => void }) {
  const row = menu.stores.find((s) => s.storeId === store.id);
  const [mode, setMode] = useState<'chain' | 'own' | 'off'>(row?.isOff ? 'off' : row?.fromTime ? 'own' : 'chain');
  const [fromTime, setFrom] = useState(row?.fromTime ?? menu.fromTime);
  const [toTime, setTo] = useState(row?.toTime ?? menu.toTime);
  const [days, setDays] = useState<number[]>(row?.fromTime ? row.days : menu.days);
  const problem = mode === 'own' && (!fromTime || !toTime) ? 'Give the start and end time.' : mode === 'own' && fromTime === toTime ? 'The menu must end at a different time than it starts.' : null;
  const save = useMutation({
    mutationFn: () => hotFoodMenusApi.setStore(menu.id, store.id, mode === 'own' ? { mode, fromTime, toTime, days } : { mode }),
    onSuccess: () => { toast.success(`${menu.name} at ${store.name} saved`); onSaved(); onClose(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the store times.')),
  });
  const radio = (v: typeof mode, label: string, hint: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: FONT.body, cursor: 'pointer' }}>
      <input type="radio" name="dp-store-mode" checked={mode === v} onChange={() => setMode(v)} style={{ marginTop: 3 }} />
      <span><strong>{label}</strong><span style={{ display: 'block', fontSize: FONT.small, color: TEXT_MUTED }}>{hint}</span></span>
    </label>
  );
  return (
    <Modal title={`${menu.name} at ${store.name}`} onClose={onClose} busy={save.isPending} maxWidth={500}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div role="radiogroup" aria-label="Times at this store" style={{ display: 'grid', gap: 10 }}>
          {radio('chain', 'Chain times', whenWords(menu))}
          {radio('own', 'Own times', 'This store serves it at other hours, like breakfast until 11.')}
          {radio('off', 'Not at this store', 'Items only in this menu are not served here.')}
        </div>
        {mode === 'own' && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Field label="From" htmlFor="dps-from"><input id="dps-from" type="time" style={{ ...INPUT, width: 150 }} value={fromTime} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To" htmlFor="dps-to"><input id="dps-to" type="time" style={{ ...INPUT, width: 150 }} value={toTime} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            <DaysPicker id="dps-days" value={days} onChange={setDays} />
          </>
        )}
        {problem && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{problem}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}
