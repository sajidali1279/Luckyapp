// Challenges (HQ, Offers > Challenges): "Spend $30 on groceries, get $3 back" or "Every 5th coffee earns $1". Only approved sales count,
// and the reward is credited by itself when the target is reached (backend utils/challenges.ts). What it asks and pays stays as
// posted; its words and last day can change, or it can be ended.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Trophy, Plus, X, Pencil, Square } from 'lucide-react';
import { challengesApi, storesApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { C, FONT, INPUT, RADIUS } from '../../lib/theme';
import { Button, Card, Badge, Chip, EmptyState, Field, Notice, SectionTitle } from '../kit';
import ConfirmModal from '../ConfirmModal';
import Modal from '../Modal';
import CardSkeleton from '../CardSkeleton';
import { storeToday, addDays, startOfStoreDay, endOfStoreDay, storeDayLong } from '../../lib/storeDates';
import { SpanishFields, NO_SPANISH, spanishFrom, type SpanishWords } from './SpanishFields';
import { AudienceLimitsField, NO_AUDIENCE, audiencePayload, audienceProblem, audienceLabel, type AudienceLimitsValue } from './AudienceLimits';

const CATS = [['', 'Any purchase'], ['GROCERIES', 'Groceries'], ['FROZEN_FOODS', 'Frozen'], ['FRESH_FOODS', 'Fresh'], ['GAS', 'Gas'], ['DIESEL', 'Diesel'], ['HOT_FOODS', 'Hot Foods'], ['OTHER', 'Other']] as const;
const usd = (n: number) => `$${n.toFixed(2)}`;
const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10]}`;
const catWords = (c: string) => (c ? ` on ${CATS.find(([v]) => v === c)?.[1].toLowerCase() ?? c.toLowerCase()}` : '');

/** The rule in words, as the server writes it. */
export function ruleText(kind: string, target: number, reward: number, minPurchase: number | null, category: string, repeats: boolean): string {
  if (kind === 'SPEND') return `Spend ${usd(target)}${catWords(category)}, get ${usd(reward)} back`;
  return `${repeats ? 'Every' : 'The'} ${ord(target)} purchase${catWords(category)}${minPurchase ? ` of ${usd(minPurchase)} or more` : ''} earns ${usd(reward)}`;
}

export default function ChallengesPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['challenges'], queryFn: () => challengesApi.list() });
  const rows: any[] = data?.data?.data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [ending, setEnding] = useState<any | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['challenges'] });
  const end = useMutation({
    mutationFn: (id: string) => challengesApi.update(id, { endDate: new Date().toISOString() }),
    onSuccess: () => { toast.success('Challenge ended. Rewards already earned stay paid.'); refresh(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not end it.')),
    onSettled: () => setEnding(null),
  });
  const live = rows.filter((r) => r.state === 'LIVE'), later = rows.filter((r) => r.state === 'SCHEDULED'), done = rows.filter((r) => r.state === 'ENDED');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ConfirmModal open={!!ending} title="End this challenge now?" danger confirmLabel="End now"
        message="Customers stop seeing it and no more sales count. Rewards already earned stay paid."
        onConfirm={() => ending && end.mutate(ending.id)} onCancel={() => setEnding(null)} busy={end.isPending} />
      {editing && <EditChallenge c={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: C.muted, fontSize: FONT.body, flex: 1, minWidth: 280, lineHeight: 1.5 }}>
          A target that pays a reward: spend an amount in a category, or make a number of purchases. Only approved sales count, and the
          reward is credited by itself when the target is reached. Customers see their progress in the app.
        </p>
        <Button variant={creating ? 'secondary' : 'primary'} icon={creating ? <X /> : <Plus />} onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : 'New challenge'}</Button>
      </div>
      {creating && <NewChallenge onDone={() => { setCreating(false); refresh(); }} />}
      {isLoading ? <CardSkeleton count={2} /> : rows.length === 0 && !creating ? (
        <EmptyState icon={<Trophy size={22} />} title="No challenges yet" description='Try "Spend $30 on groceries this week, get $3 back".' />
      ) : (
        [['Live now', live], ['Scheduled', later], ['Past', done]].map(([label, list]) => (list as any[]).length > 0 && (
          <div key={label as string}>
            <SectionTitle>{label as string} ({(list as any[]).length})</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
              {(list as any[]).map((c) => (
                <Card key={c.id} padding={0} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '14px 16px', flex: 1 }} data-testid="challenge-card">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <Badge tone={c.state === 'LIVE' ? 'success' : c.state === 'SCHEDULED' ? 'info' : 'neutral'}>{c.state === 'LIVE' ? 'Live' : c.state === 'SCHEDULED' ? `Starts ${storeDayLong(c.startDate)}` : 'Ended'}</Badge>
                      <Badge>{c.store?.name ?? 'All stores'}</Badge>
                      {audienceLabel(c) && <Badge tone="info">{audienceLabel(c)}</Badge>}
                      {c.titleEs && <Badge title={`In Spanish: ${c.titleEs}`}>ES</Badge>}
                    </div>
                    <h3 style={{ margin: '0 0 4px', fontSize: FONT.section, color: C.text }}>{c.title}</h3>
                    <div style={{ fontWeight: 600, color: C.primary, fontSize: FONT.body }}>{c.rule}</div>
                    {c.description && <p style={{ margin: '6px 0 0', color: C.muted, fontSize: FONT.small, lineHeight: 1.5 }}>{c.description}</p>}
                    <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: FONT.small, color: C.text2, flexWrap: 'wrap' }}>
                      <span><strong>{c.customers ?? 0}</strong> taking part</span><span><strong>{c.earned ?? 0}</strong> rewards</span><span><strong>{usd(c.paid ?? 0)}</strong> paid</span>
                    </div>
                    <div style={{ color: C.muted, fontSize: FONT.caption, marginTop: 8 }}>{storeDayLong(c.startDate)} to {storeDayLong(c.endDate)}</div>
                  </div>
                  {c.state !== 'ENDED' && (
                    <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.subtle }}>
                      <Button size="sm" icon={<Pencil />} onClick={() => setEditing(c)} aria-label={`Edit ${c.title}`}>Edit</Button>
                      <span style={{ marginLeft: 'auto' }}><Button size="sm" variant="danger" icon={<Square />} onClick={() => setEnding(c)} aria-label={`End ${c.title} now`}>End now</Button></span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function NewChallenge({ onDone }: { onDone: () => void }) {
  const { data: storesData } = useQuery({ queryKey: ['accessible-stores'], queryFn: () => storesApi.getAccessible() });
  const stores: any[] = storesData?.data?.data ?? [];
  const [kind, setKind] = useState<'SPEND' | 'VISITS'>('SPEND');
  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [category, setCategory] = useState('GROCERIES'), [storeId, setStoreId] = useState('');
  const [target, setTarget] = useState('30'), [reward, setReward] = useState('3'), [minPurchase, setMinPurchase] = useState(''), [repeats, setRepeats] = useState(true);
  const [start, setStart] = useState(storeToday()), [endDay, setEndDay] = useState(addDays(storeToday(), 6));
  const [spanish, setSpanish] = useState<SpanishWords>(NO_SPANISH);
  const [aud, setAud] = useState<AudienceLimitsValue>(NO_AUDIENCE);
  const t = Number(target), r = Number(reward), m = minPurchase.trim() ? Number(minPurchase) : null;
  const rule = t > 0 && r > 0 ? ruleText(kind, t, r, m, category, kind === 'VISITS' && repeats) : '';
  const problem = !(t > 0) ? 'Give the target.' : !(r > 0) ? 'Give the reward.'
    : kind === 'VISITS' && !(Number.isInteger(t) && t >= 2 && t <= 100) ? 'Give the number of purchases, from 2 to 100.'
    : kind === 'SPEND' && r >= t ? 'The reward must be less than what has to be spent.'
    : endDay < start ? 'The last day is before the first.' : endDay < storeToday() ? 'That last day has already passed.' : audienceProblem(aud);
  const create = useMutation({
    mutationFn: () => challengesApi.create({
      kind, title: title.trim() || rule, description: description.trim(), titleEs: spanish.titleEs.trim(), descriptionEs: spanish.descriptionEs.trim(),
      category, storeId, target: t, reward: r, minPurchase: kind === 'VISITS' && m != null ? m : '', repeats: kind === 'VISITS' && repeats,
      startDate: startOfStoreDay(start).toISOString(), endDate: endOfStoreDay(endDay).toISOString(),
      ...Object.fromEntries(Object.entries(audiencePayload(aud)).filter(([k, v]) => !['budgetCap', 'dailyCapPerCustomer'].includes(k) && v != null)),
    }),
    onSuccess: () => { toast.success('Challenge posted. Its customers are told when it starts.'); onDone(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not post it.')),
  });
  return (
    <Card style={{ maxWidth: 880 }}>
      <form onSubmit={(e) => { e.preventDefault(); if (!problem) create.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="new-challenge">
        <div role="radiogroup" aria-label="Kind of challenge" style={{ display: 'flex', gap: 6 }}>
          <Chip role="radio" selected={kind === 'SPEND'} onClick={() => { setKind('SPEND'); setTarget('30'); setReward('3'); }}>Spend an amount</Chip>
          <Chip role="radio" selected={kind === 'VISITS'} onClick={() => { setKind('VISITS'); setTarget('5'); setReward('1'); }}>A number of purchases</Chip>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Field label={kind === 'SPEND' ? 'Spend ($)' : 'Purchases'} htmlFor="ch-target"><input id="ch-target" className="ui-input" style={INPUT} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
          <Field label="Reward ($)" htmlFor="ch-reward"><input id="ch-reward" className="ui-input" style={INPUT} inputMode="decimal" value={reward} onChange={(e) => setReward(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
          {kind === 'VISITS' && <Field label="Each at least ($, optional)" htmlFor="ch-min"><input id="ch-min" className="ui-input" style={INPUT} inputMode="decimal" value={minPurchase} placeholder="Any amount" onChange={(e) => setMinPurchase(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>}
          <Field label="Category" htmlFor="ch-cat"><select id="ch-cat" className="ui-input" style={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Where" htmlFor="ch-store"><select id="ch-store" className="ui-input" style={INPUT} value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">All stores</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </div>
        {kind === 'VISITS' && (
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: FONT.body, color: C.text2 }}>
            <input type="checkbox" checked={repeats} onChange={() => setRepeats(!repeats)} style={{ width: 16, height: 16, accentColor: C.primary }} /> Repeats (every {Number.isInteger(t) && t > 1 ? ord(t) : 'Nth'} purchase earns it again)
          </label>
        )}
        {rule && <div style={{ background: C.subtle, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: '10px 12px', fontWeight: 600, color: C.text }} data-testid="challenge-rule">{rule}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="First day" htmlFor="ch-start"><input id="ch-start" type="date" className="ui-input" style={INPUT} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Last day" htmlFor="ch-end"><input id="ch-end" type="date" className="ui-input" style={INPUT} value={endDay} onChange={(e) => setEndDay(e.target.value)} /></Field>
        </div>
        <Field label="Title (optional: the rule is used)" htmlFor="ch-title"><input id="ch-title" className="ui-input" style={INPUT} maxLength={100} value={title} placeholder={rule} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Description (optional)" htmlFor="ch-desc"><input id="ch-desc" className="ui-input" style={INPUT} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <SpanishFields idPrefix="ch" value={spanish} onChange={setSpanish} english={{ title: title.trim() || rule, description }} />
        <Field label="Who it's for"><AudienceLimitsField idPrefix="ch-aud" value={aud} onChange={setAud} noLimits /></Field>
        {problem && <Notice tone="warning" style={{ fontSize: FONT.small }}>{problem}</Notice>}
        <div><Button type="submit" variant="primary" disabled={!!problem || create.isPending}>{create.isPending ? 'Posting…' : 'Post challenge'}</Button></div>
      </form>
    </Card>
  );
}

function EditChallenge({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState<string>(c.title), [description, setDescription] = useState<string>(c.description ?? '');
  const [spanish, setSpanish] = useState<SpanishWords>(spanishFrom(c));
  const [endDay, setEndDay] = useState(storeToday(new Date(c.endDate)));
  const save = useMutation({
    mutationFn: () => challengesApi.update(c.id, { title: title.trim(), description: description.trim(), titleEs: spanish.titleEs.trim(), descriptionEs: spanish.descriptionEs.trim(), endDate: endOfStoreDay(endDay).toISOString() }),
    onSuccess: () => { toast.success('Challenge saved'); onSaved(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save it.')),
  });
  return (
    <Modal title="Edit challenge" subtitle={`${c.rule}. What it asks and pays stays as posted, to be fair to those part way.`} onClose={onClose} busy={save.isPending} maxWidth={560}>
      <form onSubmit={(e) => { e.preventDefault(); if (title.trim() && endDay >= storeToday()) save.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Title" htmlFor="ech-title"><input id="ech-title" className="ui-input" style={INPUT} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Description" htmlFor="ech-desc"><input id="ech-desc" className="ui-input" style={INPUT} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <SpanishFields idPrefix="ech" value={spanish} onChange={setSpanish} english={{ title, description }} />
        <Field label="Last day" htmlFor="ech-end"><input id="ech-end" type="date" className="ui-input" style={INPUT} min={storeToday()} value={endDay} onChange={(e) => setEndDay(e.target.value)} /></Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={save.isPending || !title.trim() || endDay < storeToday()}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </Modal>
  );
}
