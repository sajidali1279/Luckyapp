// Store managers ask HQ for a cashback promotion at their store (they post deals themselves, but not cashback). HQ sees each request with
// what it would cost, can change the bonus, the dates and the hours, then approves it (it becomes a real promotion for that store and is
// announced like any other) or declines it with a reason. The manager gets a push either way (backend offerRequests.controller.ts).
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, X, Clock, MapPin, MessageSquare, Inbox } from 'lucide-react';
import { offerRequestsApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { C, FONT, INPUT } from '../../lib/theme';
import { Button, Card, Badge, Notice, EmptyState, Field, SectionTitle } from '../kit';
import Modal from '../Modal';
import CardSkeleton from '../CardSkeleton';
import ErrorState from '../ErrorState';
import CostEstimate from './CostEstimate';
import { HappyHoursField, hoursFrom, hoursPayload, hoursProblem, hoursLabel, type HappyHours } from './HappyHours';
import { storeToday, storeDayLong, storeDayTime, startOfStoreDay, endOfStoreDay } from '../../lib/storeDates';
import { CASHBACK_CAP, MAX_CENTS_PER_GALLON, pctText } from '../../lib/offerRules';

const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
const tierName = (t: string) => t[0] + t.slice(1).toLowerCase();
const catName = (c: string | null) => (c ? c.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()) : 'Store-wide');

const STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'neutral' | 'info' }> = {
  PENDING: { label: 'Waiting', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

/** The request's own fields as the estimate and the offer form take them. */
function estimateInputOf(r: any, over: Record<string, unknown> = {}) {
  return {
    storeId: r.storeId, category: r.category ?? '',
    bonusRate: r.gasBonusCentsPerGallon != null ? undefined : r.bonusRate ?? undefined,
    tierBonusRates: r.tierBonusRates ?? undefined,
    gasBonusCentsPerGallon: r.gasBonusCentsPerGallon ?? undefined,
    startDate: new Date(r.startDate).toISOString(), endDate: new Date(r.endDate).toISOString(),
    happyDays: r.happyDays ?? [], happyFrom: r.happyFrom ?? '', happyTo: r.happyTo ?? '',
    ...over,
  };
}

export default function OfferRequestsPanel() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['offer-requests'], queryFn: () => offerRequestsApi.list() });
  const [approving, setApproving] = useState<any | null>(null);
  const [declining, setDeclining] = useState<any | null>(null);
  const requests: any[] = data?.data?.data ?? [];
  const waiting = requests.filter((r) => r.status === 'PENDING');
  const decided = requests.filter((r) => r.status !== 'PENDING').slice(0, 30);

  if (isError) return <ErrorState message="Could not load the requests." onRetry={refetch} />;
  if (isLoading) return <CardSkeleton count={3} />;

  return (
    <>
      {approving && <ApproveModal request={approving} onClose={() => setApproving(null)} />}
      {declining && <DeclineModal request={declining} onClose={() => setDeclining(null)} />}
      <p style={{ margin: '-6px 0 16px', color: C.muted, fontSize: FONT.body, maxWidth: 760, lineHeight: 1.5 }}>
        Store managers ask here for a cashback promotion at their store. Approving posts it for that store and tells its customers; you can change it first.
        Declining sends the manager your reason.
      </p>
      <SectionTitle count={waiting.length}>Waiting for you</SectionTitle>
      {waiting.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="No requests waiting" description="When a store manager asks for a promotion in the app, it shows up here." />
      ) : (
        <div style={grid}>
          {waiting.map((r) => (
            <RequestCard key={r.id} r={r} onApprove={() => setApproving(r)} onDecline={() => setDeclining(r)} />
          ))}
        </div>
      )}
      {decided.length > 0 && (
        <>
          <SectionTitle style={{ marginTop: 28 }}>Decided</SectionTitle>
          <div style={grid}>{decided.map((r) => <RequestCard key={r.id} r={r} />)}</div>
        </>
      )}
    </>
  );
}

function RequestCard({ r, onApprove, onDecline }: { r: any; onApprove?: () => void; onDecline?: () => void }) {
  const st = STATUS[r.status] ?? STATUS.PENDING;
  const hours = r.hoursText ?? hoursLabel(r);
  return (
    <Card padding={0} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 18px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone={st.tone}>{st.label}</Badge>
          <Badge icon={<MapPin size={12} />}>{r.store?.name ?? 'Store'}</Badge>
          <Badge>{catName(r.category)}</Badge>
          {r.requires21 && <Badge tone="warning">21+</Badge>}
        </div>
        <h3 style={{ fontSize: FONT.section, fontWeight: 600, color: C.text, margin: '4px 0 0' }}>{r.title}</h3>
        <div style={{ fontSize: FONT.body, fontWeight: 600, color: C.primary }}>{r.bonusText}</div>
        {r.description && <p style={{ color: C.muted, fontSize: FONT.small, margin: 0, lineHeight: 1.5 }}>{r.description}</p>}
        <div style={{ fontSize: FONT.small, color: C.text2 }}>{storeDayLong(r.startDate)} to {storeDayLong(r.endDate)}</div>
        {hours && <div style={{ fontSize: FONT.small, color: C.text2, display: 'flex', gap: 6, alignItems: 'center' }}><Clock size={13} aria-hidden /> {hours}</div>}
        {r.note && (
          <div style={{ fontSize: FONT.small, color: C.text2, display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.5 }}>
            <MessageSquare size={13} style={{ marginTop: 3, flexShrink: 0 }} aria-hidden /> <span>"{r.note}"</span>
          </div>
        )}
        <div style={{ fontSize: FONT.caption, color: C.muted }}>
          Asked by {r.requestedByName ?? 'a store manager'}, {storeDayTime(new Date(r.createdAt))}
          {r.decidedAt && <>. {st.label} by {r.decidedByName ?? 'HQ'}, {storeDayTime(new Date(r.decidedAt))}</>}
        </div>
        {r.status === 'DECLINED' && r.declineReason && <Notice tone="neutral" style={{ fontSize: FONT.small }}>Reason given: {r.declineReason}</Notice>}
        {r.status === 'PENDING' && <CostEstimate input={estimateInputOf(r)} compact />}
      </div>
      {onApprove && onDecline && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.subtle }}>
          <Button size="sm" variant="primary" icon={<Check />} onClick={onApprove} aria-label={`Review and approve ${r.title}`}>Review and approve</Button>
          <Button size="sm" variant="ghost" icon={<X />} onClick={onDecline} style={{ marginLeft: 'auto' }} aria-label={`Decline ${r.title}`}>Decline</Button>
        </div>
      )}
    </Card>
  );
}

function ApproveModal({ request: r, onClose }: { request: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isCpg = r.gasBonusCentsPerGallon != null;
  const tiers: Record<string, number> | null = r.tierBonusRates && Object.keys(r.tierBonusRates).length ? r.tierBonusRates : null;
  const [title, setTitle] = useState<string>(r.title);
  const [pct, setPct] = useState<string>(!isCpg && !tiers && r.bonusRate != null ? pctText(r.bonusRate) : '');
  const [cpg, setCpg] = useState<string>(isCpg ? String(r.gasBonusCentsPerGallon) : '');
  const [tierPct, setTierPct] = useState<Record<string, string>>(Object.fromEntries(TIERS.map((t) => [t, tiers?.[t] != null ? pctText(tiers[t]) : ''])));
  const reqStart = storeToday(new Date(r.startDate)), reqEnd = storeToday(new Date(r.endDate));
  const [start, setStart] = useState<string>(reqStart);
  const [end, setEnd] = useState<string>(reqEnd);
  const [hours, setHours] = useState<HappyHours>(hoursFrom(r));
  const today = storeToday();

  // Only what HQ changed goes back, so the manager's push says "with changes" only when there were some
  const changes: Record<string, unknown> = {};
  let problem: string | null = null;
  if (!title.trim()) problem = 'Add a title.';
  if (title.trim() !== r.title) changes.title = title.trim();
  if (isCpg) {
    const v = parseFloat(cpg);
    if (!(v > 0)) problem ??= 'Enter the cents-per-gallon bonus.';
    else if (v > MAX_CENTS_PER_GALLON) problem ??= `A per-gallon bonus can be at most ${MAX_CENTS_PER_GALLON} cents.`;
    if (v !== r.gasBonusCentsPerGallon) changes.gasBonusCentsPerGallon = v;
  } else if (tiers) {
    const map: Record<string, number> = {};
    for (const t of TIERS) { const v = parseFloat(tierPct[t]); if (v > 0) map[t] = parseFloat((v / 100).toFixed(4)); }
    if (Object.keys(map).length === 0) problem ??= 'Enter at least one tier bonus.';
    else if (Math.max(...Object.values(map)) > CASHBACK_CAP + 1e-9) problem ??= `A bonus can be at most ${CASHBACK_CAP * 100}%.`;
    const same = TIERS.every((t) => (map[t] ?? 0) === (tiers[t] ?? 0));
    if (!same) { changes.tierBonusRates = map; changes.bonusRate = Math.max(0, ...Object.values(map)); }
  } else {
    const v = parseFloat(pct);
    if (!(v > 0)) problem ??= 'Enter the bonus percentage.';
    else if (v > CASHBACK_CAP * 100 + 1e-9) problem ??= `A bonus can be at most ${CASHBACK_CAP * 100}%.`;
    const frac = parseFloat((v / 100).toFixed(4));
    if (frac !== r.bonusRate) changes.bonusRate = frac;
  }
  if (end < start) problem ??= 'The last day is before the first day.';
  else if (end < today) problem ??= 'The last day has already passed.';
  if (start !== reqStart) changes.startDate = startOfStoreDay(start).toISOString();
  if (end !== reqEnd) changes.endDate = endOfStoreDay(end).toISOString();
  problem ??= hoursProblem(hours);
  const hp = hoursPayload(hours);
  if (hoursLabel(hp) !== hoursLabel(r)) Object.assign(changes, hp);
  const changed = Object.keys(changes).length > 0;

  const approve = useMutation({
    mutationFn: () => offerRequestsApi.approve(r.id, changes),
    onSuccess: () => {
      toast.success(changed ? 'Approved with your changes. The promotion is posted.' : 'Approved. The promotion is posted.');
      qc.invalidateQueries({ queryKey: ['offer-requests'] }); qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['admin-badge-counts'] });
      onClose();
    },
    onError: (err) => { toast.error(serverMessage(err, 'Could not approve it.')); qc.invalidateQueries({ queryKey: ['offer-requests'] }); },
  });

  return (
    <Modal title="Approve this promotion?" subtitle={`${r.store?.name ?? 'The store'}, asked by ${r.requestedByName ?? 'the store manager'}. Change anything first; the manager is told what was approved.`}
      onClose={onClose} busy={approve.isPending} maxWidth={620}>
      <form onSubmit={(e) => { e.preventDefault(); if (!problem && !approve.isPending) approve.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {r.note && <Notice tone="neutral" icon={<MessageSquare size={15} />}>"{r.note}"</Notice>}
        <Field label="Title" htmlFor="req-title" required>
          <input id="req-title" className="ui-input" style={INPUT} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={`Bonus (${catName(r.category).toLowerCase()})`} htmlFor="req-bonus">
          {isCpg ? (
            <div style={row}><input id="req-bonus" type="number" min="0" step="0.5" max={MAX_CENTS_PER_GALLON} className="ui-input" style={{ ...INPUT, width: 120 }} value={cpg} onChange={(e) => setCpg(e.target.value)} /><span style={unit}>cents a gallon</span></div>
          ) : tiers ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
              {TIERS.map((t) => (
                <div key={t} style={row}>
                  <span style={{ minWidth: 70, fontSize: FONT.body, color: C.text2 }}>{tierName(t)}</span>
                  <input type="number" min="0" step="0.5" max={CASHBACK_CAP * 100} aria-label={`${tierName(t)} bonus percent`} className="ui-input" style={{ ...INPUT, width: 72 }}
                    value={tierPct[t]} onChange={(e) => setTierPct((p) => ({ ...p, [t]: e.target.value }))} />
                  <span style={unit}>%</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={row}><input id="req-bonus" type="number" min="0" step="0.5" max={CASHBACK_CAP * 100} className="ui-input" style={{ ...INPUT, width: 120 }} value={pct} onChange={(e) => setPct(e.target.value)} /><span style={unit}>% extra cashback</span></div>
          )}
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="First day" htmlFor="req-start"><input id="req-start" type="date" className="ui-input" style={INPUT} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Last day" htmlFor="req-end" hint="Runs to 11:59 pm at the store."><input id="req-end" type="date" className="ui-input" style={INPUT} value={end} min={today} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Happy hours">
          <HappyHoursField idPrefix="req-hours" value={hours} onChange={setHours} />
        </Field>
        {!problem && (
          <CostEstimate input={estimateInputOf(r, {
            ...(changes.bonusRate !== undefined ? { bonusRate: changes.bonusRate } : {}),
            ...(changes.tierBonusRates !== undefined ? { tierBonusRates: changes.tierBonusRates } : {}),
            ...(changes.gasBonusCentsPerGallon !== undefined ? { gasBonusCentsPerGallon: changes.gasBonusCentsPerGallon } : {}),
            startDate: startOfStoreDay(start).toISOString(), endDate: endOfStoreDay(end).toISOString(), ...hp,
          })} />
        )}
        {problem && <Notice tone="warning" style={{ fontSize: FONT.small }}>{problem}</Notice>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={approve.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" icon={<Check />} disabled={approve.isPending || !!problem}>
            {approve.isPending ? 'Approving…' : changed ? 'Approve with changes' : 'Approve and post'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeclineModal({ request: r, onClose }: { request: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const decline = useMutation({
    mutationFn: () => offerRequestsApi.decline(r.id, reason.trim()),
    onSuccess: () => {
      toast.success('Declined. The manager has your reason.');
      qc.invalidateQueries({ queryKey: ['offer-requests'] }); qc.invalidateQueries({ queryKey: ['admin-badge-counts'] });
      onClose();
    },
    onError: (err) => { toast.error(serverMessage(err, 'Could not decline it.')); qc.invalidateQueries({ queryKey: ['offer-requests'] }); },
  });
  return (
    <Modal title="Decline this request?" subtitle={`"${r.title}" at ${r.store?.name ?? 'the store'}. The manager gets a push with your reason.`} onClose={onClose} busy={decline.isPending} maxWidth={520}>
      <form onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !decline.isPending) decline.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Reason" htmlFor="req-decline" required hint={`${reason.length}/300`}>
          <textarea id="req-decline" className="ui-input" style={{ ...INPUT, minHeight: 80, resize: 'vertical' }} maxLength={300} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="e.g. Too close to the chain-wide gas promotion. Try the week after." />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={decline.isPending}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={decline.isPending || !reason.trim()}>{decline.isPending ? 'Declining…' : 'Decline'}</Button>
        </div>
      </form>
    </Modal>
  );
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 16 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const unit: React.CSSProperties = { fontSize: FONT.body, color: C.muted, whiteSpace: 'nowrap' };
