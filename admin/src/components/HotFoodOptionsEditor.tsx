// Sizes and add-ons on a hot food catalog item (2026-11-14, the owner's "build your own" loaded chips): HQ lists the sizes (Small bag,
// Large bag) with what each adds to the price, and the add-ons with a price for each size, and can switch an add-on off. The customer
// picks a size and add-ons in the app and the price adds up (backend utils/hotFoodOptions.ts checks and prices it again).
import { Plus, Trash2 } from 'lucide-react';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Button } from './kit';

export interface OptSize { id?: string; name: string; price: string }
export interface OptAddOn { id?: string; name: string; prices: Record<string, string>; active: boolean }
export interface OptState { on: boolean; sizes: OptSize[]; addOns: OptAddOn[]; maxAddOns: string }

const ONE = 'one';
const keyOf = (s: OptSize, i: number) => s.id || `new-${i}`;

/** The editor's state from what the server keeps (or an empty one) */
export function optState(o: any): OptState {
  if (!o || (!o.sizes?.length && !o.addOns?.length)) return { on: false, sizes: [], addOns: [], maxAddOns: '' };
  const sizes: OptSize[] = (o.sizes ?? []).map((s: any) => ({ id: s.id, name: s.name, price: String(s.price ?? 0) }));
  return {
    on: true, sizes,
    addOns: (o.addOns ?? []).map((a: any) => ({ id: a.id, name: a.name, active: a.active !== false,
      prices: Object.fromEntries(Object.entries(a.prices ?? {}).map(([k, v]) => [k, String(v)])) })),
    maxAddOns: o.maxAddOns ? String(o.maxAddOns) : '',
  };
}

/** What is sent to the server: null when switched off. New sizes get their ids on the server; add-on prices are matched to sizes by position. */
export function optPayload(st: OptState): any {
  if (!st.on || (!st.sizes.length && !st.addOns.length)) return null;
  const sizes = st.sizes.map((s) => ({ ...(s.id ? { id: s.id } : {}), name: s.name.trim(), price: Number(s.price || 0) }));
  // the server makes a new size's id from its name: the same rule here, so the add-on prices land on the right size
  const ids = st.sizes.map((s) => s.id || s.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x');
  return {
    sizes,
    addOns: st.addOns.map((a) => ({
      ...(a.id ? { id: a.id } : {}), name: a.name.trim(), active: a.active,
      prices: st.sizes.length
        ? Object.fromEntries(st.sizes.map((s, i) => [ids[i], Number(a.prices[keyOf(s, i)] ?? 0)]))
        : { [ONE]: Number(a.prices[ONE] ?? 0) },
    })),
    maxAddOns: st.maxAddOns ? Number(st.maxAddOns) : null,
  };
}

/** A problem with the editor's state, in words, or null */
export function optProblem(st: OptState): string | null {
  if (!st.on) return null;
  if (!st.sizes.length && !st.addOns.length) return 'Add a size or an add-on, or switch sizes and add-ons off.';
  if (st.sizes.some((s) => !s.name.trim())) return 'Give every size a name, like Small bag.';
  if (st.addOns.some((a) => !a.name.trim())) return 'Give every add-on a name, like Pico de gallo.';
  const bad = (v: string | undefined, max: number) => v !== undefined && v !== '' && !(Number(v) >= 0 && Number(v) <= max);
  if (st.sizes.some((s) => bad(s.price, 100))) return 'Size prices must be from $0 to $100.';
  if (st.addOns.some((a) => Object.values(a.prices).some((p) => bad(p, 50)))) return 'Add-on prices must be from $0 to $50.';
  if (st.maxAddOns && !(Number.isInteger(Number(st.maxAddOns)) && Number(st.maxAddOns) >= 1 && Number(st.maxAddOns) <= 25)) return 'The most add-ons must be from 1 to 25.';
  return null;
}

export default function HotFoodOptionsEditor({ value, onChange, basePrice }: { value: OptState; onChange: (v: OptState) => void; basePrice: number }) {
  const st = value;
  const set = (patch: Partial<OptState>) => onChange({ ...st, ...patch });
  const cols = st.sizes.length ? st.sizes.map((s, i) => ({ key: keyOf(s, i), label: s.name || `Size ${i + 1}` })) : [{ key: ONE, label: 'Price' }];
  const num = { ...INPUT, width: 84, padding: '6px 8px' };
  const money = (n: number) => `$${n.toFixed(2)}`;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, color: C.text, cursor: 'pointer' }}>
        <input type="checkbox" checked={st.on} onChange={(e) => set({ on: e.target.checked, ...(e.target.checked && !st.sizes.length && !st.addOns.length ? { sizes: [{ name: 'Small', price: '0' }, { name: 'Large', price: '0' }] } : {}) })} />
        Sizes and add-ons (build your own)
      </label>
      {st.on && (
        <>
          <div>
            <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text }}>Sizes</div>
            <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginBottom: 6 }}>
              The customer picks one. Its price is added to the item's price ({money(basePrice || 0)}): put the bag's price here, or $0 if the bag is paid at the register. No sizes: the add-ons have one price.
            </div>
            {st.sizes.map((s, i) => (
              <div key={keyOf(s, i)} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input aria-label={`Size ${i + 1} name`} style={{ ...INPUT, flex: 1 }} value={s.name} maxLength={30} placeholder="Small bag"
                  onChange={(e) => set({ sizes: st.sizes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <span style={{ color: TEXT_MUTED }}>+$</span>
                <input aria-label={`Size ${i + 1} price`} style={num} inputMode="decimal" value={s.price} placeholder="0.00"
                  onChange={(e) => set({ sizes: st.sizes.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                <Button size="sm" aria-label={`Remove size ${s.name || i + 1}`} icon={<Trash2 />}
                  onClick={() => set({ sizes: st.sizes.filter((_, j) => j !== i), addOns: st.addOns.map((a) => { const p = { ...a.prices }; delete p[keyOf(s, i)]; return { ...a, prices: p }; }) })} />
              </div>
            ))}
            {st.sizes.length < 6 && <Button size="sm" icon={<Plus />} onClick={() => set({ sizes: [...st.sizes, { name: '', price: '0' }] })}>Add size</Button>}
          </div>
          <div>
            <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text }}>Add-ons</div>
            <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginBottom: 6 }}>The customer ticks any of them; each price is for the size picked. Untick "On" to stop selling one without losing it.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: FONT.small, minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Add-on</th>
                    {cols.map((c) => <th key={c.key} style={th}>{c.label} $</th>)}
                    <th style={th}>On</th><th style={th} aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {st.addOns.map((a, i) => (
                    <tr key={a.id ?? `n${i}`}>
                      <td style={td}><input aria-label={`Add-on ${i + 1} name`} style={{ ...INPUT, minWidth: 150 }} value={a.name} maxLength={40} placeholder="Pico de gallo"
                        onChange={(e) => set({ addOns: st.addOns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></td>
                      {cols.map((c) => (
                        <td key={c.key} style={td}><input aria-label={`${a.name || `Add-on ${i + 1}`} price, ${c.label}`} style={num} inputMode="decimal" value={a.prices[c.key] ?? ''} placeholder="0.00"
                          onChange={(e) => set({ addOns: st.addOns.map((x, j) => (j === i ? { ...x, prices: { ...x.prices, [c.key]: e.target.value } } : x)) })} /></td>
                      ))}
                      <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" aria-label={`${a.name || 'Add-on'} on`} checked={a.active}
                        onChange={(e) => set({ addOns: st.addOns.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)) })} /></td>
                      <td style={td}><Button size="sm" aria-label={`Remove ${a.name || 'add-on'}`} icon={<Trash2 />} onClick={() => set({ addOns: st.addOns.filter((_, j) => j !== i) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {st.addOns.length < 40 && <div style={{ marginTop: 6 }}><Button size="sm" icon={<Plus />} onClick={() => set({ addOns: [...st.addOns, { name: '', prices: {}, active: true }] })}>Add add-on</Button></div>}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.small, color: C.text }}>
            Most add-ons on one order (optional)
            <input aria-label="Most add-ons on one order" style={{ ...num, width: 70 }} inputMode="numeric" value={st.maxAddOns} placeholder="any" onChange={(e) => set({ maxAddOns: e.target.value })} />
          </label>
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '4px 6px', fontSize: FONT.caption, color: TEXT_MUTED, fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '3px 6px', verticalAlign: 'middle' };
