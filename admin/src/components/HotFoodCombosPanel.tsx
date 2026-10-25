// Hot Food > Combos (HQ, 2026-10-12): a hot food item with a drink the customer chooses (fountain, a 20oz bottle, a 12oz can, coffee,
// water) for one price. Featured combos lead the app's hot food menu. Today's hot food combo ideas (from Offers > Deals) can fill the
// form. The saving stays within the hot food deal limit (Labels > Deals > Deal limits); the server checks it too.
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { hotFoodCombosApi, offersApi, type HotFoodComboInput } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Badge, Button, Card, Chip, EmptyState, Field, HowItWorks, Notice } from './kit';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';

export const DRINKS: [string, string][] = [['FOUNTAIN', 'Fountain drink'], ['BOTTLE_20', '20oz bottle'], ['CAN_12', '12oz can'], ['COFFEE', 'Coffee'], ['WATER', 'Bottled water']];
const drinkWord = (code: string) => DRINKS.find(([c]) => c === code)?.[1] ?? code;
const money = (n: number | null | undefined) => (n == null ? '' : `$${Number(n).toFixed(2)}`);
const hour = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };

type CatalogItem = { id: string; name: string; price: number; imageUrl?: string | null };
type Store = { id: string; name: string; hotFoodEnabled?: boolean };
type Combo = HotFoodComboInput & { id: string; ordered30d: number; catalogItem: CatalogItem };
type Form = { name: string; nameEs: string; description: string; catalogItemId: string; itemQuantity: string; drinks: string[]; price: string; regularPrice: string;
  allStores: boolean; storeIds: string[]; hours: boolean; fromTime: string; toTime: string; days: number[]; isFeatured: boolean; isActive: boolean };
const EMPTY: Form = { name: '', nameEs: '', description: '', catalogItemId: '', itemQuantity: '1', drinks: ['FOUNTAIN', 'BOTTLE_20'], price: '', regularPrice: '',
  allStores: true, storeIds: [], hours: false, fromTime: '05:00', toTime: '11:00', days: [], isFeatured: true, isActive: true };
// Days of the week (2026-10-16): 0 = Sunday, store time; none = every day
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_WORDS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const daysWords = (days?: number[] | null) => (!days || days.length === 0 || days.length === 7 ? null
  : days.length === 1 ? `${DAY_WORDS[days[0]]} only` : [...days].sort((a, b) => a - b).map((d) => DAYS[d]).join(', '));
// A multi-buy deal (2026-10-16): "2 corn dogs for $3.50", no drink
const MULTI_BUY: Form = { ...EMPTY, itemQuantity: '2', drinks: [] };

/** What is in the combo, in words: "2x Corn Dog + Fountain drink / 20oz bottle", "2x Corn Dog" */
function contents(c: { itemQuantity?: number; drinks: string[]; catalogItem?: { name: string } | null }) {
  const qty = c.itemQuantity ?? 1;
  const item = `${qty > 1 ? `${qty}x ` : ''}${c.catalogItem?.name ?? ''}`;
  return c.drinks.length ? `${item} + ${c.drinks.map(drinkWord).join(' / ')}` : `${item}, no drink`;
}

function toForm(c: Combo): Form {
  return { name: c.name, nameEs: c.nameEs ?? '', description: c.description ?? '', catalogItemId: c.catalogItemId, itemQuantity: String(c.itemQuantity ?? 1), drinks: c.drinks, price: String(c.price),
    regularPrice: c.regularPrice != null ? String(c.regularPrice) : '', allStores: c.storeIds.length === 0, storeIds: c.storeIds,
    hours: !!c.fromTime, fromTime: c.fromTime ?? '05:00', toTime: c.toTime ?? '11:00', days: c.days ?? [], isFeatured: c.isFeatured, isActive: c.isActive };
}
function toInput(f: Form): HotFoodComboInput {
  return { name: f.name.trim(), nameEs: f.nameEs.trim() || null, description: f.description.trim() || null, catalogItemId: f.catalogItemId, itemQuantity: Number(f.itemQuantity), drinks: f.drinks,
    price: Number(f.price), regularPrice: f.regularPrice.trim() ? Number(f.regularPrice) : null, storeIds: f.allStores ? [] : f.storeIds,
    fromTime: f.hours ? f.fromTime : null, toTime: f.hours ? f.toTime : null, days: f.days, isFeatured: f.isFeatured, isActive: f.isActive };
}

export default function HotFoodCombosPanel({ catalog, stores }: { catalog: CatalogItem[]; stores: Store[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hot-food-combos'], queryFn: () => hotFoodCombosApi.list() });
  const ideasQ = useQuery({ queryKey: ['combo-ideas'], queryFn: () => offersApi.comboIdeas(), staleTime: 10 * 60_000 });
  const combos: Combo[] = Array.isArray(q.data?.data?.data) ? q.data!.data.data : [];
  const limit: number = typeof q.data?.data?.savingLimit === 'number' ? q.data.data.savingLimit : 0.08;
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [deleting, setDeleting] = useState<Combo | null>(null);

  // Today's hot food + drink ideas whose hot food item is in the catalog
  const byName = useMemo(() => new Map(catalog.map((c) => [c.name.trim().toLowerCase(), c])), [catalog]);
  const rawIdeas: any[] = Array.isArray(ideasQ.data?.data?.data?.ideas) ? ideasQ.data!.data.data.ideas : [];
  const ideas = rawIdeas.filter((i) => (i.rule === 'HOTFOOD_CAN' || i.rule === 'HOTFOOD_DRINK') && byName.has(String(i.a?.name ?? '').trim().toLowerCase())).slice(0, 4);
  function applyIdea(i: any) {
    const item = byName.get(String(i.a.name).trim().toLowerCase())!;
    const drink = i.rule === 'HOTFOOD_CAN' ? 'CAN_12' : 'BOTTLE_20';
    setEditing({ id: null, form: { ...EMPTY, name: `${item.name} + ${drink === 'CAN_12' ? 'a 12oz can' : 'a 20oz drink'}`, catalogItemId: item.id, drinks: [drink, 'FOUNTAIN'],
      price: i.price != null ? String(i.price) : '', regularPrice: i.together != null ? String(i.together) : '' } });
  }

  const flip = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isActive?: boolean; isFeatured?: boolean } }) => hotFoodCombosApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hot-food-combos'] }),
    onError: (e) => toast.error(serverMessage(e, 'Could not change the combo.')),
  });
  const del = useMutation({
    mutationFn: (id: string) => hotFoodCombosApi.remove(id),
    onSuccess: () => { toast.success('Combo deleted'); setDeleting(null); qc.invalidateQueries({ queryKey: ['hot-food-combos'] }); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not delete the combo.')); setDeleting(null); },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <HowItWorks style={{ flex: '1 1 320px' }}>
          A combo is a hot food item with a drink the customer chooses in the app, for one price, or a multi-buy deal: 2 or more of one item,
          with or without a drink (2 corn dogs for $3.50). Featured combos are shown first on the app's
          hot food menu. A combo is on at every store that has its item on, or only at the stores you pick, and only in its hours if you give
          some (store time). The store sees the combo and the drink on the order. With a regular price, the app shows "Save $X"; the saving
          stays within your hot food deal limit ({Math.round(limit * 1000) / 10}% now, in Labels &gt; Deals &gt; Deal limits).
        </HowItWorks>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => setEditing({ id: null, form: MULTI_BUY })} disabled={catalog.length === 0}>New multi-buy deal</Button>
          <Button variant="primary" onClick={() => setEditing({ id: null, form: EMPTY })} disabled={catalog.length === 0}>New combo</Button>
        </div>
      </div>

      {ideas.length > 0 && (
        <Card style={{ marginBottom: 16 }} padding={14}>
          <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: 8 }}>Ideas for today</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {ideas.map((i) => (
              <div key={i.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 600, color: C.text }}>{i.a.name} + {i.rule === 'HOTFOOD_CAN' ? 'a 12oz can' : 'a 20oz drink'}</div>
                <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{i.price != null ? `${money(i.price)} (together ${money(i.together)})` : 'Set the price'}{i.timing ? ` · ${i.timing}` : ''}</div>
                <Button size="sm" onClick={() => applyIdea(i)}>Use this idea</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the combos.</Notice>
        : combos.length === 0 ? (
          <EmptyState title="No combos yet" description={catalog.length === 0 ? 'Add hot food items to the catalog first.' : 'Make one with New combo, or use an idea above.'} />
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {combos.map((c) => (
              <Card key={c.id} padding={14} style={{ opacity: c.isActive ? 1 : 0.65 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  {c.catalogItem?.imageUrl
                    ? <img src={c.catalogItem.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 56, height: 56, borderRadius: 10, background: C.subtle, flexShrink: 0 }} aria-hidden="true" />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: C.text }}>{c.name}</strong>
                      {c.isFeatured && c.isActive && <Badge tone="success">Featured</Badge>}
                      {!c.isActive && <Badge>Off</Badge>}
                    </div>
                    <div style={{ fontSize: FONT.small, color: C.text2, marginTop: 2 }}>
                      {contents(c)}
                    </div>
                    <div style={{ fontSize: FONT.small, color: C.text, marginTop: 4 }}>
                      <strong>{money(c.price)}</strong>{c.regularPrice != null && <span style={{ color: TEXT_MUTED }}> · saves {money(c.regularPrice - c.price)}</span>}
                    </div>
                    <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 4 }}>
                      {c.storeIds.length === 0 ? 'Every store with the item on' : `${c.storeIds.length} store${c.storeIds.length === 1 ? '' : 's'}`}
                      {daysWords(c.days) ? ` · ${daysWords(c.days)}` : ''}
                      {c.fromTime && c.toTime ? ` · ${hour(c.fromTime)} to ${hour(c.toTime)}` : ' · all day'}
                      {` · ${c.ordered30d} ordered in 30 days`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  <Button size="sm" onClick={() => setEditing({ id: c.id, form: toForm(c) })}>Edit</Button>
                  <Button size="sm" onClick={() => flip.mutate({ id: c.id, data: { isActive: !c.isActive } })} disabled={flip.isPending}>{c.isActive ? 'Switch off' : 'Switch on'}</Button>
                  {c.isActive && <Button size="sm" onClick={() => flip.mutate({ id: c.id, data: { isFeatured: !c.isFeatured } })} disabled={flip.isPending}>{c.isFeatured ? 'Unfeature' : 'Feature'}</Button>}
                  <Button size="sm" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>Delete</Button>
                </div>
              </Card>
            ))}
          </div>
        )}

      {editing && <ComboForm initial={editing.form} id={editing.id} catalog={catalog} stores={stores} limit={limit} onClose={() => setEditing(null)} />}
      <ConfirmModal
        open={!!deleting}
        title="Delete this combo?"
        danger
        busy={del.isPending}
        confirmLabel="Delete"
        message={<p style={{ margin: 0 }}>"{deleting?.name}" leaves the app's menu. Orders already placed keep it. To keep it for later, use Switch off instead.</p>}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function ComboForm({ initial, id, catalog, stores, limit, onClose }: { initial: Form; id: string | null; catalog: CatalogItem[]; stores: Store[]; limit: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const item = catalog.find((c) => c.id === f.catalogItemId);
  const qty = Number(f.itemQuantity);
  const validQty = Number.isInteger(qty) && qty >= 1 && qty <= 10;
  const itemsApart = item && validQty ? Math.round(item.price * qty * 100) / 100 : null;   // the items bought one by one
  const price = Number(f.price), regular = Number(f.regularPrice);
  const saving = f.regularPrice.trim() && Number.isFinite(regular) && Number.isFinite(price) && regular > 0 ? regular - price : null;
  const lowest = f.regularPrice.trim() && regular > 0 ? Math.ceil(regular * (1 - limit) * 100) / 100 : null;
  const problem = !f.name.trim() ? 'Give the combo a name.' : !f.catalogItemId ? 'Choose the hot food item.'
    : !validQty ? 'Give how many of the item, 1 to 10.'
    : f.drinks.length === 0 && qty < 2 ? 'Choose at least one drink, or make it 2 or more of the item (like 2 for $3.50).'
    : !(price > 0) ? 'Give the combo price.' : item && price < item.price ? `The combo costs less than ${item.name} alone (${money(item.price)}).`
    : lowest != null && price < lowest ? `Within your ${Math.round(limit * 1000) / 10}% hot food deal limit, the lowest is ${money(lowest)}.`
    : lowest != null && price >= regular ? 'The combo price must be below the regular price.'
    : !f.allStores && f.storeIds.length === 0 ? 'Pick at least one store, or choose every store.'
    : f.hours && f.fromTime === f.toTime ? 'The start and end time are the same.' : null;

  const save = useMutation({
    mutationFn: async (): Promise<unknown> => (id ? hotFoodCombosApi.update(id, toInput(f)) : hotFoodCombosApi.create(toInput(f))),
    onSuccess: () => { toast.success(id ? 'Combo saved' : 'Combo made. It shows in the app at the next menu refresh.'); qc.invalidateQueries({ queryKey: ['hot-food-combos'] }); onClose(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the combo.')),
  });
  const hotStores = stores.filter((st) => st.hotFoodEnabled !== false);

  return (
    <Modal title={id ? 'Edit combo' : qty > 1 && f.drinks.length === 0 ? 'New multi-buy deal' : 'New combo'}
      subtitle={qty > 1 ? 'More than one of an item, for one price' : 'A hot food item with a drink, for one price'} onClose={onClose} busy={save.isPending} maxWidth={560}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 12 }}>
          <Field label="Hot food item" htmlFor="cb-item" required>
            <select id="cb-item" style={INPUT} value={f.catalogItemId} onChange={(e) => set('catalogItemId', e.target.value)}>
              <option value="">Choose…</option>
              {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({money(c.price)})</option>)}
            </select>
          </Field>
          <Field label="How many" htmlFor="cb-qty" required>
            <input id="cb-qty" style={INPUT} type="number" min={1} max={10} step={1} value={f.itemQuantity} onChange={(e) => set('itemQuantity', e.target.value)} />
          </Field>
        </div>
        <Field label="Name customers see" htmlFor="cb-name" required>
          <input id="cb-name" style={INPUT} value={f.name} maxLength={80} placeholder={qty > 1 ? `e.g. ${qty} ${item ? item.name : 'Corn Dogs'} for $3.50` : 'e.g. Wings + a drink'} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Name in Spanish" htmlFor="cb-name-es" hint="Optional. Spanish phones show the English name when this is empty.">
          <input id="cb-name-es" style={INPUT} value={f.nameEs} maxLength={80} placeholder="e.g. Alitas + una bebida" onChange={(e) => set('nameEs', e.target.value)} />
        </Field>
        <Field label="Short description" htmlFor="cb-desc" hint="Optional.">
          <input id="cb-desc" style={INPUT} value={f.description} maxLength={200} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div>
          <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text, marginBottom: 6 }} id="cb-drinks">Drinks the customer can choose</div>
          <div role="group" aria-labelledby="cb-drinks" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {qty > 1 && <Chip selected={f.drinks.length === 0} onClick={() => set('drinks', [])}>No drink</Chip>}
            {DRINKS.map(([code, word]) => (
              <Chip key={code} selected={f.drinks.includes(code)} onClick={() => set('drinks', f.drinks.includes(code) ? f.drinks.filter((d) => d !== code) : [...f.drinks, code])}>{word}</Chip>
            ))}
          </div>
          {f.drinks.length === 0 && qty > 1 && (
            <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 6 }}>
              A deal with no drink shows in the app from the next app update after 1.3.4. Older apps do not show it, so nobody sees a drink choice with nothing in it.
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Field label="Combo price" htmlFor="cb-price" required>
            <input id="cb-price" style={INPUT} inputMode="decimal" value={f.price} placeholder="9.99" onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Regular price" htmlFor="cb-regular"
            hint={item && itemsApart != null
              ? `${qty > 1 ? `${qty} x ${item.name} = ${money(itemsApart)}` : `${item.name} ${money(item.price)}`}${f.drinks.length ? ' + the drink' : ''}. For "Save $X".`
              : 'The items (and the drink) bought apart.'}>
            <input id="cb-regular" style={INPUT} inputMode="decimal" value={f.regularPrice} placeholder="optional" onChange={(e) => set('regularPrice', e.target.value)} />
          </Field>
        </div>
        {item && itemsApart != null && qty > 1 && f.drinks.length === 0 && !f.regularPrice.trim() && (
          <div><Button size="sm" onClick={() => set('regularPrice', itemsApart.toFixed(2))}>Use {money(itemsApart)} as the regular price</Button></div>
        )}
        {saving != null && saving > 0 && <div style={{ fontSize: FONT.small, color: C.success }}>Customers see "Save {money(saving)}".</div>}
        <div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.body }}>
            <input type="checkbox" checked={f.allStores} onChange={(e) => set('allStores', e.target.checked)} /> Every store that has the item on
          </label>
          {!f.allStores && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {hotStores.map((st) => <Chip key={st.id} selected={f.storeIds.includes(st.id)} onClick={() => set('storeIds', f.storeIds.includes(st.id) ? f.storeIds.filter((x) => x !== st.id) : [...f.storeIds, st.id])}>{st.name}</Chip>)}
            </div>
          )}
        </div>
        <div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.body }}>
            <input type="checkbox" checked={f.hours} onChange={(e) => set('hours', e.target.checked)} /> Only some hours (store time)
          </label>
          {f.hours && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <input aria-label="From" type="time" style={{ ...INPUT, width: 140 }} value={f.fromTime} onChange={(e) => set('fromTime', e.target.value)} />
              <span style={{ color: TEXT_MUTED }}>to</span>
              <input aria-label="To" type="time" style={{ ...INPUT, width: 140 }} value={f.toTime} onChange={(e) => set('toTime', e.target.value)} />
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text, marginBottom: 6 }} id="cb-days">Days</div>
          <div role="group" aria-labelledby="cb-days" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip selected={f.days.length === 0} onClick={() => set('days', [])}>Every day</Chip>
            {DAYS.map((d, i) => (
              <Chip key={d} selected={f.days.includes(i)} onClick={() => set('days', f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i].sort((a, b) => a - b))}>{d}</Chip>
            ))}
          </div>
          {f.days.length > 0 && f.days.length < 7 && (
            <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 6 }}>
              Shown in the app on {daysWords(f.days)?.replace(' only', '')} only (store time){f.hours ? '; hours past midnight count for the day they start' : ''}.
            </div>
          )}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.body }}>
          <input type="checkbox" checked={f.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Featured (shown first in the app)
        </label>
        {problem && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{problem}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : id ? 'Save' : 'Make combo'}</Button>
        </div>
      </div>
    </Modal>
  );
}
