// Offers autopilot (HQ, Offers > Promotions, 2026-11-09): the switch, the weekly budget and how many offers a week, this week's auto
// offers with what each has paid, the last runs, and "Stop all". The weekly run is the server's (backend utils/offerAutopilot.ts):
// every Monday from 6 AM store time it reviews last week's auto offers and posts this week's from the promotion ideas.
import { useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bot, BellRing, BellOff, Square } from 'lucide-react';
import { offersApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { storeDayLong, startOfStoreDay } from '../../lib/storeDates';
import { C, FONT, INPUT, RADIUS } from '../../lib/theme';
import { useDraft, useUnsaved } from '../../lib/unsaved';
import { Badge, Button, Card, Field, FieldAction, FieldRow, HowItWorks, Notice } from '../kit';
import ConfirmModal from '../ConfirmModal';
import CardSkeleton from '../CardSkeleton';
import ErrorState from '../ErrorState';

type Limit = { min: number; max: number; def: number };
type AutoOffer = { id: string; title: string; autoNote: string | null; quiet: boolean; budgetCap: number | null; spent: number; endDate: string; running: boolean; budgetReachedAt: string | null };
type Run = { status: 'RUNNING' | 'DONE' | 'FAILED'; week: { from: string; to: string }; ranAt: string; budget: number; note: string; posted: { title: string }[] };
type State = {
  config: { enabled: boolean; weeklyBudget: number; perWeek: number; changedAt: string | null; changedBy: string | null };
  limits: { weeklyBudget: Limit; perWeek: Limit };
  workedPerDollar: number;
  runHour: number;
  week: { from: string; to: string };
  ranThisWeek: boolean;
  nextRun: string;
  offers: AutoOffer[];
  runs: Run[];
};

const day = (key: string) => storeDayLong(startOfStoreDay(key));
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hourText = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

export default function AutopilotCard() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['offer-autopilot'], queryFn: () => offersApi.autopilot(), staleTime: 60_000 });
  // an answer without the settings (an old server, a proxy page) shows the error box, never a broken Offers page
  const raw = data?.data?.data as State | undefined;
  const st = raw && raw.config && raw.limits && raw.week && Array.isArray(raw.offers) && Array.isArray(raw.runs) ? raw : undefined;
  const [asking, setAsking] = useState<null | 'on' | 'off' | 'stop'>(null);
  const draft = useDraft({ weeklyBudget: String(st?.config.weeklyBudget ?? ''), perWeek: String(st?.config.perWeek ?? '') });
  const changed = !!st && (Number(draft.form.weeklyBudget) !== st.config.weeklyBudget || Number(draft.form.perWeek) !== st.config.perWeek);
  useUnsaved('offer-autopilot', changed);

  const after = () => {
    qc.invalidateQueries({ queryKey: ['offer-autopilot'] });
    qc.invalidateQueries({ queryKey: ['offers'] });
    qc.invalidateQueries({ queryKey: ['offers-history'] });
  };
  const save = useMutation({
    mutationFn: (body: { enabled?: boolean; weeklyBudget?: number; perWeek?: number }) => offersApi.setAutopilot(body),
    onSuccess: (res, body) => {
      const d = res.data?.data as State & { ranNow?: boolean };
      if (body.enabled === true) toast.success(d.ranNow ? `Autopilot is on. This week's offers are posted (${d.offers.length}).` : `Autopilot is on. The first offers go up ${day(d.nextRun)} at ${hourText(d.runHour)}.`);
      else if (body.enabled === false) toast.success('Autopilot is off. No new offers. This week\'s auto offers run to Sunday unless you stop them.');
      else toast.success('Saved. It applies from the next Monday.');
      draft.settle({ weeklyBudget: String(body.weeklyBudget ?? ''), perWeek: String(body.perWeek ?? '') }, (a, b) => Number(a) === Number(b));
      setAsking(null);
      after();
    },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the autopilot. Please try again.')),
  });
  const stop = useMutation({
    mutationFn: () => offersApi.stopAutopilot(),
    onSuccess: (res) => { const n = res.data?.data?.stopped ?? 0; toast.success(`Ended ${n} auto offer${n === 1 ? '' : 's'}.`); setAsking(null); after(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not stop them. Please try again.')),
  });

  if (isLoading) return <Card style={{ marginBottom: 24, maxWidth: 880 }}><CardSkeleton count={1} /></Card>;
  if (isError || !st) return <Card style={{ marginBottom: 24, maxWidth: 880 }}><ErrorState compact message="Could not load the autopilot." onRetry={() => refetch()} /></Card>;

  const on = st.config.enabled;
  const budget = Number(draft.form.weeklyBudget), perWeek = Number(draft.form.perWeek);
  const budgetOk = Number.isFinite(budget) && budget >= st.limits.weeklyBudget.min && budget <= st.limits.weeklyBudget.max;
  const perWeekOk = Number.isInteger(perWeek) && perWeek >= st.limits.perWeek.min && perWeek <= st.limits.perWeek.max;
  const problem = !budgetOk ? `The weekly budget is $${st.limits.weeklyBudget.min} to $${st.limits.weeklyBudget.max.toLocaleString('en-US')}.`
    : !perWeekOk ? `Offers a week is ${st.limits.perWeek.min} to ${st.limits.perWeek.max}.` : null;
  const running = st.offers.filter((o) => o.running);
  const spent = st.offers.reduce((n, o) => n + o.spent, 0);
  const caps = st.offers.reduce((n, o) => n + (o.budgetCap ?? 0), 0);
  const lastRun = st.runs[0];

  return (
    <Card style={{ marginBottom: 24, maxWidth: 880 }} id="offer-autopilot">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <Bot size={20} color={C.primary} aria-hidden />
        <h2 style={{ margin: 0, fontSize: FONT.section + 2, fontWeight: 800, color: C.text }}>Autopilot</h2>
        <Badge tone={on ? 'success' : 'neutral'}>{on ? 'On' : 'Off'}</Badge>
        <button type="button" role="switch" aria-checked={on} aria-label="Autopilot" disabled={save.isPending || (!on && !!problem)}
          onClick={() => setAsking(on ? 'off' : 'on')} style={sw.track(on)}>
          <span style={sw.label(on, 'off')}>OFF</span>
          <span style={sw.label(on, 'on')}>ON</span>
        </button>
      </div>
      <p style={{ margin: '0 0 12px', color: C.muted, fontSize: FONT.body, lineHeight: 1.5 }}>
        Every Monday at {hourText(st.runHour)} it swaps last week's auto offers for new ones from your sales: it keeps what worked, drops what
        did not and tries something new. Each offer gets its own share of the weekly budget, so a week never costs more than the budget.
      </p>
      <HowItWorks summary="How it picks">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Ideas come from the last 8 weeks of sales: slow hours, falling categories, a store falling behind, regulars who stopped coming, and promotions that worked before.</li>
          <li>"Worked" means at least ${st.workedPerDollar} of extra sales for every $1 of extra cashback. One that did not work is not tried again for 4 weeks.</li>
          <li>Never two of its offers on the same sales, and never on the same sales as a promotion you posted.</li>
          <li>Bonuses stay under the 10% cashback ceiling. No tobacco, alcohol or lottery.</li>
          <li>Only the week's biggest offer sends customers a push. The others just show in the app.</li>
          <li>You can edit or end any auto offer like any other, or stop them all here.</li>
        </ul>
      </HowItWorks>

      <FieldRow>
        <Field label="Weekly budget" htmlFor="ap-budget" hint={`$${st.limits.weeklyBudget.min} to $${st.limits.weeklyBudget.max.toLocaleString('en-US')}, shared by the week's offers`}>
          <input id="ap-budget" type="number" inputMode="decimal" min={st.limits.weeklyBudget.min} max={st.limits.weeklyBudget.max} step="1"
            value={draft.form.weeklyBudget} onChange={(e) => draft.set('weeklyBudget', e.target.value)} style={{ ...INPUT, width: 140 }} aria-invalid={!budgetOk} />
        </Field>
        <Field label="Offers a week" htmlFor="ap-per-week" hint={`${st.limits.perWeek.min} to ${st.limits.perWeek.max}`}>
          <input id="ap-per-week" type="number" inputMode="numeric" min={st.limits.perWeek.min} max={st.limits.perWeek.max} step="1"
            value={draft.form.perWeek} onChange={(e) => draft.set('perWeek', e.target.value)} style={{ ...INPUT, width: 110 }} aria-invalid={!perWeekOk} />
        </Field>
        {changed && (
          <FieldAction>
            <Button variant="primary" size="sm" disabled={!!problem || save.isPending} onClick={() => save.mutate({ weeklyBudget: budget, perWeek })}>Save</Button>
            <Button size="sm" onClick={() => draft.reset()}>Undo</Button>
          </FieldAction>
        )}
      </FieldRow>
      {changed && problem && <div role="alert" style={{ color: C.danger, fontSize: FONT.small, marginTop: 6 }}>{problem}</div>}

      <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: FONT.body }}>This week, {day(st.week.from)} to {day(st.week.to)}</div>
          {st.offers.length > 0 && <Badge tone="info">{usd(spent)} of {usd(caps)} used</Badge>}
          {running.length > 0 && (
            <Button size="sm" variant="danger" icon={<Square />} style={{ marginLeft: 'auto' }} onClick={() => setAsking('stop')}>Stop all</Button>
          )}
        </div>
        {st.offers.length === 0 ? (
          <div style={{ fontSize: FONT.small, color: C.muted, lineHeight: 1.5 }}>
            {on
              ? st.ranThisWeek ? lastRun?.note || 'No auto offers this week.' : `No auto offers yet. Next swap: ${day(st.nextRun)} at ${hourText(st.runHour)}.`
              : `No auto offers. Switch it on to start${st.nextRun === st.week.from ? ' (it posts this week\'s offers at once)' : ` (the first offers go up ${day(st.nextRun)})`}.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {st.offers.map((o) => (
              <div key={o.id} data-testid="auto-offer" style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: '10px 12px', background: o.running ? C.surface : C.subtle }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: C.text, fontSize: FONT.body }}>{o.title}</span>
                  <Badge tone={o.running ? 'success' : 'neutral'}>{o.running ? 'Live' : o.budgetReachedAt ? 'Budget used up' : 'Ended'}</Badge>
                  <Badge icon={o.quiet ? <BellOff size={12} /> : <BellRing size={12} />}>{o.quiet ? 'No push' : 'Push sent'}</Badge>
                  <span style={{ marginLeft: 'auto', fontSize: FONT.small, color: C.text2 }}>{usd(o.spent)} of {usd(o.budgetCap ?? 0)}</span>
                </div>
                {o.autoNote && <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>Why: {o.autoNote}</div>}
              </div>
            ))}
          </div>
        )}
        {!on && running.length > 0 && (
          <Notice tone="warning" style={{ marginTop: 10 }}>Autopilot is off, so no new offers. This week's auto offers run to Sunday unless you stop them.</Notice>
        )}
        {on && st.offers.length > 0 && <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 8 }}>Next swap: {day(st.nextRun)} at {hourText(st.runHour)}.</div>}
      </div>

      {st.runs.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: FONT.small, fontWeight: 600, color: C.text2 }}>Past weeks</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: FONT.small, color: C.text2, lineHeight: 1.6 }}>
            {st.runs.map((r) => (
              <li key={r.week.from}><strong>{day(r.week.from)}:</strong> {r.status === 'FAILED' ? 'Stopped on an error. ' : ''}{r.note}{r.posted.length ? ` (${r.posted.map((p) => p.title).join('; ')})` : ''}</li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmModal
        open={asking === 'on'}
        title="Switch on the autopilot?"
        busy={save.isPending}
        confirmLabel="Switch on"
        message={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0 }}>Every Monday it posts up to {perWeekOk ? perWeek : st.config.perWeek} cashback offers on its own, for that week only, with up to {usd(budgetOk ? budget : st.config.weeklyBudget)} of extra cashback in all.</p>
            <p style={{ margin: 0 }}>{st.nextRun === st.week.from && !st.ranThisWeek ? 'This week\'s offers go up now, to Sunday night.' : `The first offers go up ${day(st.nextRun)} at ${hourText(st.runHour)}.`} The biggest one sends customers a push.</p>
          </div>
        )}
        onConfirm={() => save.mutate({ enabled: true, ...(changed && !problem ? { weeklyBudget: budget, perWeek } : {}) })}
        onCancel={() => setAsking(null)}
      />
      <ConfirmModal
        open={asking === 'off'}
        title="Switch off the autopilot?"
        busy={save.isPending}
        confirmLabel="Switch off"
        message={<p style={{ margin: 0 }}>No new offers from next Monday. {running.length ? `This week's ${running.length} auto offer${running.length === 1 ? '' : 's'} keep${running.length === 1 ? 's' : ''} running to Sunday; use Stop all to end them now.` : ''}</p>}
        onConfirm={() => save.mutate({ enabled: false })}
        onCancel={() => setAsking(null)}
      />
      <ConfirmModal
        open={asking === 'stop'}
        title="End this week's auto offers now?"
        danger
        busy={stop.isPending}
        confirmLabel={`End ${running.length} now`}
        message={<p style={{ margin: 0 }}>{running.map((o) => o.title).join(', ')} stop paying now. The switch stays {on ? 'on, and new offers go up next Monday' : 'off'}.</p>}
        onConfirm={() => stop.mutate()}
        onCancel={() => setAsking(null)}
      />
    </Card>
  );
}

// The switch: a navy pill with ON lit when on, grey with OFF lit when off
const sw = {
  track: (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', padding: 3, gap: 2, borderRadius: 999, cursor: 'pointer', marginLeft: 'auto',
    border: `1px solid ${on ? C.primary : C.borderStrong}`, background: on ? C.primary : C.hover, minHeight: 36,
  }),
  label: (on: boolean, which: 'on' | 'off'): CSSProperties => {
    const lit = (which === 'on') === on;
    return {
      padding: '5px 12px', borderRadius: 999, fontSize: FONT.caption, fontWeight: 800, letterSpacing: 0.5,
      background: lit ? (on ? C.brand : C.surface) : 'transparent', color: lit ? '#fff' : on ? '#c8d3e3' : C.muted,
      ...(lit && !on ? { color: C.text2, boxShadow: '0 1px 2px rgba(0,0,0,0.12)' } : {}),
    };
  },
};
