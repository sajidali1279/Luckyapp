// The Gas prices board on the Stores page (2026-11-20, the owner: some stores share a price, some do not). HQ names groups of stores that
// always share a price (kept on the server, GET/PUT /stores/gas-groups); a price typed on a group row goes to every store in it, and a
// store can be unticked for one change without leaving the group. Every change is listed once and saved with one click, store by store
// through the same route as before (PATCH /stores/:id/gas-prices), so each store's staff are told and customers see it as before.
import { useMemo, useState, CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Users } from 'lucide-react';
import { storesApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { C, FONT, INPUT, RADIUS, TEXT_MUTED } from '../lib/theme';
import { priceAge, priceProblem, categoryEnabled, priceText } from '../lib/gasPrice';
import { Button, Card, Badge, Notice, EmptyState } from './kit';
import ConfirmModal from './ConfirmModal';
import Modal from './Modal';
import ErrorState from './ErrorState';

export interface GasStore {
  id: string; name: string; city: string; isActive: boolean; enabledCategories: string[];
  gasPricePerGallon: number | null; dieselPricePerGallon: number | null; gasPriceUpdatedAt: string | null; dieselPriceUpdatedAt: string | null;
}
interface Group { id: string; name: string; storeIds: string[] }
type Kind = 'gas' | 'diesel';
type Pair = { gas: string; diesel: string };
const KINDS: Kind[] = ['gas', 'diesel'];
const LABEL: Record<Kind, string> = { gas: 'Regular', diesel: 'Diesel' };
const savedOf = (s: GasStore, k: Kind) => (k === 'gas' ? s.gasPricePerGallon : s.dieselPricePerGallon);
const atOf = (s: GasStore, k: Kind) => (k === 'gas' ? s.gasPriceUpdatedAt : s.dieselPriceUpdatedAt);
const sells = (s: GasStore, k: Kind) => categoryEnabled(s, k === 'gas' ? 'GAS' : 'DIESEL');
const clean = (v: string) => v.replace(/[^0-9.]/g, '');

/** The price every store in the list shares, or '' when they differ (or none has one). */
function common(stores: GasStore[], k: Kind): string {
  const texts = [...new Set(stores.filter((s) => sells(s, k)).map((s) => priceText(savedOf(s, k))))];
  return texts.length === 1 ? texts[0] : '';
}

type Change = { store: GasStore; payload: Record<string, number>; lines: string[]; risky: boolean };

export default function GasPriceBoard({ stores }: { stores: GasStore[] }) {
  const qc = useQueryClient();
  const groupsQ = useQuery({ queryKey: ['gas-groups'], queryFn: () => storesApi.getGasGroups() });
  const groups: Group[] = groupsQ.data?.data?.data?.groups ?? [];
  const [groupDraft, setGroupDraft] = useState<Record<string, Partial<Pair>>>({});
  const [own, setOwn] = useState<Record<string, Partial<Pair>>>({});
  const [apart, setApart] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Change[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [editGroups, setEditGroups] = useState(false);

  const byId = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const groupOf = useMemo(() => {
    const m = new Map<string, Group>();
    groups.forEach((g) => g.storeIds.forEach((id) => m.set(id, g)));
    return m;
  }, [groups]);
  const members = (g: Group) => g.storeIds.map((id) => byId.get(id)).filter((s): s is GasStore => !!s);

  const groupText = (g: Group, k: Kind) => groupDraft[g.id]?.[k] ?? common(members(g), k);
  const ownText = (s: GasStore, k: Kind) => own[s.id]?.[k] ?? priceText(savedOf(s, k));
  /** What the store's box ends up as: the group's price while it follows its group, else its own. */
  const finalText = (s: GasStore, k: Kind) => {
    const g = groupOf.get(s.id);
    return g && !apart[s.id] ? groupText(g, k) : ownText(s, k);
  };
  const isChange = (s: GasStore, k: Kind) => {
    if (!sells(s, k)) return false;
    const t = finalText(s, k).trim();
    if (t === '' || priceProblem(LABEL[k], t)) return false;
    const saved = savedOf(s, k);
    return saved == null || Math.abs(saved - Number(t)) >= 0.0005;
  };

  const problems: string[] = [];
  stores.forEach((s) => KINDS.forEach((k) => {
    if (!sells(s, k)) return;
    const p = priceProblem(LABEL[k], finalText(s, k));
    if (p) problems.push(`${s.name}: ${p}`);
  }));
  const problem = problems[0] ?? null;

  const changes: Change[] = stores.flatMap((s) => {
    const payload: Record<string, number> = {};
    const lines: string[] = [];
    let risky = false;
    KINDS.forEach((k) => {
      if (!isChange(s, k)) return;
      const v = Number(finalText(s, k));
      const saved = savedOf(s, k);
      payload[k === 'gas' ? 'gasPricePerGallon' : 'dieselPricePerGallon'] = v;
      const pct = saved != null && saved > 0 ? Math.round(((v - saved) / saved) * 100) : null;
      lines.push(`${LABEL[k]} ${saved != null && saved > 0 ? `$${saved.toFixed(3)}` : 'not set'} to $${v.toFixed(3)}${pct != null && pct !== 0 ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`);
      if ((pct != null && Math.abs(pct) > 15) || v < 1) risky = true;
    });
    return lines.length ? [{ store: s, payload, lines, risky }] : [];
  });

  function undoAll() { setGroupDraft({}); setOwn({}); setApart({}); }

  async function saveAll(list: Change[]) {
    if (saving) return;
    setSaving(true);
    const done: string[] = [];
    const failed: string[] = [];
    for (const c of list) {
      try {
        await storesApi.updateGasPrices(c.store.id, c.payload);
        done.push(c.store.id);
      } catch (e) {
        failed.push(`${c.store.name}: ${failureMessage(e, 'not saved')}`);
      }
    }
    await qc.invalidateQueries({ queryKey: ['stores'] });
    setOwn((p) => { const n = { ...p }; done.forEach((id) => delete n[id]); return n; });
    setApart((p) => { const n = { ...p }; done.forEach((id) => delete n[id]); return n; });
    setGroupDraft((p) => {
      const n = { ...p };
      groups.forEach((g) => { if (!list.some((c) => !done.includes(c.store.id) && g.storeIds.includes(c.store.id))) delete n[g.id]; });
      return n;
    });
    setSaving(false);
    setConfirm(null);
    if (done.length) toast.success(`Prices saved at ${done.length} store${done.length === 1 ? '' : 's'}. Their staff were told to update the pumps.`);
    if (failed.length) toast.error(`Not saved: ${failed.join('; ')}`, { duration: 9000 });
  }

  if (groupsQ.isError) return <ErrorState message="Could not load the gas price groups." onRetry={() => groupsQ.refetch()} />;

  const grouped = new Set(groups.flatMap((g) => g.storeIds));
  const loners = stores.filter((s) => !grouped.has(s.id) && s.isActive);
  const offStores = stores.filter((s) => !grouped.has(s.id) && !s.isActive);
  const changedCount = changes.length;

  const priceCell = (value: string, onChange: (v: string) => void, label: string, changed: boolean, disabled = false) => (
    <input aria-label={label} style={{ ...st.input, ...(changed ? st.inputChanged : {}) }} type="text" inputMode="decimal" maxLength={6}
      placeholder={disabled ? 'not sold' : '0.000'} disabled={disabled} value={disabled ? '' : value} onChange={(e) => onChange(clean(e.target.value))} />
  );
  const ageLine = (s: GasStore, k: Kind) => {
    if (!sells(s, k)) return <span style={st.age}>not sold here</span>;
    const a = priceAge(savedOf(s, k), atOf(s, k));
    return <span style={{ ...st.age, ...(a.stale ? st.ageStale : {}) }}>{a.text === 'never set' ? 'never set' : `now $${priceText(savedOf(s, k))}, ${a.text}`}</span>;
  };

  /** One store row: its own boxes (a store with its own price, or one unticked from its group). */
  const storeRow = (s: GasStore, inGroup: Group | null) => {
    const following = inGroup && !apart[s.id];
    return (
      <tr key={s.id} style={inGroup ? st.memberRow : undefined}>
        <td style={{ ...st.td, paddingLeft: inGroup ? 28 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {inGroup && (
              <input type="checkbox" checked={!apart[s.id]} aria-label={`${s.name} takes the ${inGroup.name} price`}
                onChange={(e) => setApart((p) => ({ ...p, [s.id]: !e.target.checked }))} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={st.storeName}>{s.name}{!s.isActive && <Badge style={{ marginLeft: 6 }}>Switched off</Badge>}</div>
              <div style={st.city}>{s.city}{inGroup && apart[s.id] ? ` · its own price this time` : ''}</div>
            </div>
          </div>
        </td>
        {KINDS.map((k) => (
          <td key={k} style={st.td}>
            {following
              ? <span style={{ ...st.follow, ...(isChange(s, k) ? { color: C.warning, fontWeight: 600 } : {}) }}>{sells(s, k) ? (isChange(s, k) ? `to $${Number(finalText(s, k)).toFixed(3)}` : 'same as group') : ''}</span>
              : priceCell(ownText(s, k), (v) => setOwn((p) => ({ ...p, [s.id]: { ...p[s.id], [k]: v } })), `${LABEL[k]} price at ${s.name}`, isChange(s, k), !sells(s, k))}
            <div>{ageLine(s, k)}</div>
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: FONT.small, color: TEXT_MUTED, maxWidth: 640, lineHeight: 1.5 }}>
          Type a price on a group row and every ticked store in it gets it. Untick a store to give it its own price this time. Changed
          boxes turn yellow; nothing is saved until you press Save all.
        </div>
        <Button icon={<Users />} onClick={() => setEditGroups(true)}>Edit groups</Button>
      </div>

      <Card padding={0} style={{ overflowX: 'auto' }}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={{ ...st.th, width: '44%' }}>Store</th>
              <th style={st.th}>Regular $/gal</th>
              <th style={st.th}>Diesel $/gal</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const ms = members(g);
              return [
                <tr key={g.id} style={st.groupRow}>
                  <td style={st.td}>
                    <div style={st.groupName}>{g.name}</div>
                    <div style={st.city}>{ms.length} stores share this price</div>
                  </td>
                  {KINDS.map((k) => {
                    const sold = ms.some((s) => sells(s, k));
                    const mixed = sold && common(ms, k) === '' && ms.some((s) => priceText(savedOf(s, k)) !== '');
                    return (
                      <td key={k} style={st.td}>
                        {priceCell(groupText(g, k), (v) => setGroupDraft((p) => ({ ...p, [g.id]: { ...p[g.id], [k]: v } })), `${LABEL[k]} price for the ${g.name} group`,
                          ms.some((s) => !apart[s.id] && isChange(s, k)), !sold)}
                        {mixed && groupDraft[g.id]?.[k] == null && <div><span style={{ ...st.age, ...st.ageStale }}>stores differ now</span></div>}
                      </td>
                    );
                  })}
                </tr>,
                ...ms.map((s) => storeRow(s, g)),
              ];
            })}
            {loners.length > 0 && (
              <tr><td colSpan={3} style={st.sectionHead}>{groups.length ? 'Stores with their own price' : 'Stores'}</td></tr>
            )}
            {loners.map((s) => storeRow(s, null))}
            {offStores.length > 0 && (
              <tr><td colSpan={3} style={st.sectionHead}>Switched off (customers do not see these yet)</td></tr>
            )}
            {offStores.map((s) => storeRow(s, null))}
          </tbody>
        </table>
        {stores.length === 0 && <EmptyState title="No stores yet" />}
      </Card>

      <div style={st.footer}>
        <div style={{ fontSize: FONT.body, color: problem ? C.danger : C.text2, flex: 1, minWidth: 200 }} role={problem ? 'alert' : undefined}>
          {problem ?? (changedCount ? `${changedCount} store${changedCount === 1 ? '' : 's'} to change` : 'No changes yet')}
        </div>
        <Button onClick={undoAll} disabled={saving || (!changedCount && !Object.keys(apart).length)}>Undo all</Button>
        <Button variant="primary" onClick={() => setConfirm(changes)} disabled={!changedCount || !!problem || saving}>
          {saving ? 'Saving…' : `Save all${changedCount ? ` (${changedCount})` : ''}`}
        </Button>
      </div>

      <ConfirmModal headingLevel="h2"
        open={!!confirm}
        title={`Change prices at ${confirm?.length ?? 0} store${confirm?.length === 1 ? '' : 's'}?`}
        message={confirm ? (
          <div style={{ textAlign: 'left' }}>
            <ul style={{ margin: '0 0 8px', paddingLeft: 18, lineHeight: 1.7, maxHeight: '45vh', overflowY: 'auto' }}>
              {confirm.map((c) => (
                <li key={c.store.id}>
                  <strong>{c.store.name}</strong>: {c.lines.join(', ')}
                  {c.risky && <span style={{ color: C.danger, fontWeight: 600 }}> (big move or very low: check it)</span>}
                </li>
              ))}
            </ul>
            Customers see the new prices at once, and each store's staff are told to update the pumps.
          </div>
        ) : ''}
        confirmLabel="Save all"
        danger={!!confirm?.some((c) => c.risky)}
        busy={saving}
        onConfirm={() => { if (confirm) saveAll(confirm); }}
        onCancel={() => setConfirm(null)}
      />

      {editGroups && <GroupEditor stores={stores} groups={groups} onClose={() => setEditGroups(false)} />}
    </div>
  );
}

/** Make, rename and fill the groups. A store can be in one group only. */
function GroupEditor({ stores, groups, onClose }: { stores: GasStore[]; groups: Group[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [list, setList] = useState<Group[]>(() => groups.map((g) => ({ ...g, storeIds: [...g.storeIds] })));
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => storesApi.saveGasGroups(list.map((g) => ({ ...g, name: g.name.trim() }))),
    onSuccess: () => { toast.success('Groups saved'); qc.invalidateQueries({ queryKey: ['gas-groups'] }); onClose(); },
    onError: (e) => setError(failureMessage(e, 'Could not save the groups. Nothing was changed.')),
  });
  const inGroup = new Map<string, string>();
  list.forEach((g) => g.storeIds.forEach((id) => inGroup.set(id, g.id)));
  const nameOfGroup = (id: string) => list.find((g) => g.id === id)?.name.trim() || 'another group';

  const problem = (() => {
    const names = new Set<string>();
    for (const g of list) {
      if (!g.name.trim()) return 'Give each group a name.';
      if (names.has(g.name.trim().toLowerCase())) return `Two groups are called "${g.name.trim()}".`;
      names.add(g.name.trim().toLowerCase());
      if (g.storeIds.length < 2) return `"${g.name.trim()}" needs at least 2 stores.`;
    }
    return null;
  })();

  const set = (id: string, patch: Partial<Group>) => { setList((p) => p.map((g) => (g.id === id ? { ...g, ...patch } : g))); setError(''); };
  const toggle = (g: Group, storeId: string) => set(g.id, { storeIds: g.storeIds.includes(storeId) ? g.storeIds.filter((x) => x !== storeId) : [...g.storeIds, storeId] });

  return (
    <Modal title="Gas price groups" subtitle="Stores that always share a gas price. Type the price once on the group." onClose={onClose} busy={save.isPending} maxWidth={620}>
      {list.length === 0 && <Notice>No groups yet. Add one for stores that always have the same price (for example the stores in one town).</Notice>}
      {list.map((g) => (
        <div key={g.id} style={st.groupBox}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input aria-label="Group name" style={{ ...INPUT, flex: 1 }} maxLength={40} placeholder="Group name, e.g. Denison" value={g.name} onChange={(e) => set(g.id, { name: e.target.value })} />
            <Button size="sm" variant="ghost" onClick={() => setList((p) => p.filter((x) => x.id !== g.id))}>Remove</Button>
          </div>
          <div style={st.storeGrid}>
            {stores.map((s) => {
              const other = inGroup.get(s.id);
              const taken = !!other && other !== g.id;
              return (
                <label key={s.id} style={{ ...st.storePick, ...(taken ? { color: TEXT_MUTED } : {}) }}>
                  <input type="checkbox" checked={g.storeIds.includes(s.id)} disabled={taken} onChange={() => toggle(g, s.id)} />
                  <span>{s.name}{taken ? ` (in ${nameOfGroup(other!)})` : ''}{!s.isActive ? ' · off' : ''}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <div><Button size="sm" onClick={() => setList((p) => [...p, { id: `g${Date.now().toString(36)}`, name: '', storeIds: [] }])}>Add a group</Button></div>
      {(error || problem) && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{error || problem}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button variant="primary" onClick={() => save.mutate()} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : 'Save groups'}</Button>
      </div>
    </Modal>
  );
}

const st: Record<string, CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 560 },
  th: { textAlign: 'left', fontSize: FONT.caption, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.subtle },
  td: { padding: '10px 12px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  groupRow: { background: C.primaryTint },
  memberRow: { background: '#fbfcfe' },
  groupName: { fontWeight: 700, color: C.primary, fontSize: FONT.body },
  storeName: { fontWeight: 600, color: C.text, fontSize: FONT.body },
  city: { fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 2 },
  sectionHead: { padding: '14px 12px 8px', fontSize: FONT.caption, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${C.border}` },
  input: { ...INPUT, width: 110, fontVariantNumeric: 'tabular-nums', padding: '6px 10px' },
  inputChanged: { background: '#fff8db', borderColor: '#e0b84a' },
  follow: { display: 'inline-block', fontSize: FONT.small, color: TEXT_MUTED, padding: '7px 0' },
  age: { fontSize: FONT.caption, color: TEXT_MUTED },
  ageStale: { color: C.warning, fontWeight: 600 },
  footer: { position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, padding: '12px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, boxShadow: '0 -4px 12px rgba(16,24,40,0.06)', zIndex: 2 },
  groupBox: { border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  storeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 },
  storePick: { display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.small, color: C.text2, cursor: 'pointer' },
};
