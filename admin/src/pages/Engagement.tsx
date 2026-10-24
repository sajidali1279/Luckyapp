// Engagement (2026-10-23, HQ): switch on and tune the things that bring customers back: visit streaks, punch cards, a daily check-in, badges,
// store goals, "order your usual", gas price alerts, sharing and smart nudges. EVERYTHING IS OFF until switched on here, and every number has
// a safe limit on the server. Suggestions at the top come from real data (who is close to a reward, who has gone quiet, which store is behind).
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { engagementApi, challengesApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Page, PageHeader, Card, Button, Badge, Notice, Field, StatTile, SectionTitle } from '../components/kit';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';

type Milestone = { weeks: number; pts: number };
type WelcomeKey = 'qrBonus' | 'qr' | 'hotFood' | 'checkIn' | 'invite' | 'tier';
type WelcomeText = { titleEn: string; bodyEn: string; titleEs: string; bodyEs: string };
type WelcomeStep = { day: number; enabled: boolean };
type Prize = { pts: number; weight: number };
interface Config {
  streaks: { enabled: boolean; minPurchase: number; milestones: Milestone[] };
  punchCards: { enabled: boolean };
  checkIn: { enabled: boolean; mode: 'FIXED' | 'MYSTERY'; pts: number; weekBonusPts: number; mystery: Prize[]; monthlyCapPts: number; needVisitDays: number };
  badges: { enabled: boolean; off: string[] };
  storeGoals: { enabled: boolean };
  reorder: { enabled: boolean };
  gasAlerts: { enabled: boolean };
  sharing: { enabled: boolean; message: string };
  ratePrompt: { enabled: boolean; minPurchases: number; minDays: number };
  welcome: { enabled: boolean; since: string | null; steps: WelcomeStep[]; texts: Record<WelcomeKey, WelcomeText> };
  tierUp: { enabled: boolean };
  birthday: { enabled: boolean; bonusPts: number; needBoughtDays: number; monthlyBudgetPts: number; gift: PushText; greeting: PushText };
  nudges: {
    enabled: boolean; quietFrom: number; quietTo: number; maxPerWeek: number;
    nearReward: { enabled: boolean; withinPts: number }; streakRisk: { enabled: boolean };
    tierReset: { enabled: boolean; daysBefore: number }; comeback: { enabled: boolean; quietDays: number };
  };
}
interface Goal { id: string; title: string; metric: string; target: number; rewardPoints: number; startDate: string; endDate: string; isActive: boolean; paidAt: string | null; store: string | null; storeId: string | null; leading: { value: number; store: string } }
interface Suggestion { id: string; tone: 'tip' | 'info'; title: string; detail: string; feature: string }
interface Hq {
  config: Config; defaults: Config;
  badges: { key: string; emoji: string; name: string; desc: string }[];
  stores: { id: string; name: string }[];
  results: { streaks: { awards: number; pts: number }; checkIn: { checkIns: number; pts: number }; goals: { awards: number; pts: number }; nudges: Record<string, number>; gasAlerts: number; ratePrompt: number; welcome: { sent: number; byStep: number[] }; tierUp: { reached: number; celebrated: number }; birthday: { greeted: number; paid: number; pts: number; spentThisMonth: number; withBirthday: number; customers: number } };
  goals: Goal[]; suggestions: Suggestion[];
}

const usd = (pts: number) => `$${(pts / 100).toFixed(2)}`;
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const whole = (v: string) => v.replace(/\D/g, '').slice(0, 5);
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 46, height: 26, borderRadius: 13, border: 'none', padding: 3, cursor: disabled ? 'default' : 'pointer', background: on ? C.success : '#cbd2db', transition: 'background .15s', flex: 'none', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ display: 'block', width: 20, height: 20, borderRadius: 10, background: '#fff', transform: `translateX(${on ? 20 : 0}px)`, transition: 'transform .15s' }} />
    </button>
  );
}

function Feature({ id, emoji, title, blurb, on, onToggle, busy, money, open, setOpen, summary, children }: {
  id: string; emoji: string; title: string; blurb: string; on: boolean; onToggle: (v: boolean) => void; busy: boolean; money?: boolean;
  open: boolean; setOpen: (v: boolean) => void; summary?: string; children?: React.ReactNode;
}) {
  return (
    <div id={`eng-${id}`}>
      <Card padding={18}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">{emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>{title}</div>
              <Badge tone={on ? 'success' : 'neutral'}>{on ? 'On' : 'Off'}</Badge>
              {money && <Badge tone="warning" title="Pays real points, from the store's cashback">Pays points</Badge>}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: FONT.small, color: TEXT_MUTED }}>{blurb}</p>
            {on && summary && <p style={{ margin: '6px 0 0', fontSize: FONT.small, color: C.text }}>{summary}</p>}
          </div>
          <Switch on={on} onChange={(v) => { if (v && money && !window.confirm(`Turn on ${title}? It pays real points to customers, so check the numbers first.`)) return; onToggle(v); }} label={`${title}: ${on ? 'on' : 'off'}`} disabled={busy} />
        </div>
        {children && (
          <div style={{ marginTop: 10 }}>
            <Button size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide settings' : 'Settings'}</Button>
            {open && <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>{children}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

const row: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' };
const smallInput: React.CSSProperties = { ...INPUT, width: 96 };

export default function Engagement() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['engagement-hq'], queryFn: () => engagementApi.hq().then((r) => r.data.data as Hq) });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const save = useMutation({
    mutationFn: (patch: object) => engagementApi.save(patch),
    onSuccess: (_r, _p) => { toast.success('Saved. Phones pick it up the next time they open.'); qc.invalidateQueries({ queryKey: ['engagement-hq'] }); qc.invalidateQueries({ queryKey: ['settings-history'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save.')),
  });
  const go = (feature: string) => {
    const id = feature === 'events' ? 'events' : feature;
    setOpen((o) => ({ ...o, [id]: true }));
    setTimeout(() => document.getElementById(`eng-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (q.isLoading) return <Page><PageHeader title="Engagement" description="Bring customers back." /><CardSkeleton count={4} /></Page>;
  if (q.isError || !q.data) return <Page><PageHeader title="Engagement" description="Bring customers back." /><ErrorState onRetry={() => q.refetch()} /></Page>;
  const d = q.data, c = d.config;
  const toggle = (section: keyof Config) => (v: boolean) => save.mutate({ [section]: { enabled: v } });
  const R = d.results;

  return (
    <Page>
      <PageHeader title="Engagement" description="Streaks, punch cards, check-ins, badges, store goals and smart nudges. Everything is off until you switch it on, and you can switch any of it off at any time." />

      {d.suggestions.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle>Suggestions from your own numbers</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {d.suggestions.map((s) => (
              <Card key={s.id} padding={16} style={{ borderLeft: `4px solid ${s.tone === 'tip' ? C.primary : C.border}` }}>
                <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: FONT.small, color: TEXT_MUTED, marginBottom: 8 }}>{s.detail}</div>
                <Button size="sm" variant="secondary" onClick={() => go(s.feature)}>Open {s.feature === 'nudges' ? 'smart nudges' : s.feature === 'storeGoals' ? 'store goals' : s.feature === 'checkIn' ? 'daily check-in' : s.feature === 'events' ? 'the event kit' : s.feature === 'welcome' ? 'the welcome series' : s.feature === 'birthday' ? 'the birthday gift' : s.feature}</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      <SectionTitle>Last 30 days</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatTile label="Streak bonuses" value={R.streaks.awards} hint={`${usd(R.streaks.pts)} paid`} />
        <StatTile label="Check-ins" value={R.checkIn.checkIns} hint={`${usd(R.checkIn.pts)} paid`} />
        <StatTile label="Store goal rewards" value={R.goals.awards} hint={`${usd(R.goals.pts)} paid`} />
        <StatTile label="Nudges sent" value={Object.values(R.nudges).reduce((t, n) => t + n, 0)} hint={`${R.nudges.nearReward ?? 0} near a reward, ${R.nudges.comeback ?? 0} come back`} />
        <StatTile label="Gas price alerts set" value={R.gasAlerts} />
      </div>

      <div style={{ display: 'grid', gap: 14, maxWidth: 940 }}>
        <Feature id="streaks" emoji="🔥" title="Visit streaks" blurb="A bonus for visiting every week: 3 weeks in a row, 6, 12. Customers see their streak on Home, and a nudge warns them before it ends. Weeks before you switch it on do not count, so nobody is paid for old history." on={c.streaks.enabled} onToggle={toggle('streaks')} busy={save.isPending} money
          open={!!open.streaks} setOpen={(v) => setOpen((o) => ({ ...o, streaks: v }))} summary={c.streaks.milestones.map((m) => `${m.weeks} weeks: ${m.pts} pts`).join(' · ')}>
          <StreaksEditor value={c.streaks} defaults={d.defaults.streaks} onSave={(v) => save.mutate({ streaks: v })} busy={save.isPending} />
        </Feature>

        <Feature id="punchCards" emoji="🎟️" title="Punch cards" blurb="Shows a repeating 'every Nth purchase earns points' challenge as a card of stamps ('buy 8, the 9th pays'). Create one below, or on Offers, Challenges." on={c.punchCards.enabled} onToggle={toggle('punchCards')} busy={save.isPending}
          open={!!open.punchCards} setOpen={(v) => setOpen((o) => ({ ...o, punchCards: v }))}>
          <PunchCardMaker />
        </Feature>

        <Feature id="checkIn" emoji="📅" title="Daily check-in" blurb="A small daily reward for opening the app, with a bonus on day 7. A customer must have bought recently to check in, and a monthly cap keeps the cost fixed." on={c.checkIn.enabled} onToggle={toggle('checkIn')} busy={save.isPending} money
          open={!!open.checkIn} setOpen={(v) => setOpen((o) => ({ ...o, checkIn: v }))} summary={`${c.checkIn.mode === 'FIXED' ? `${c.checkIn.pts} pts a day` : 'A mystery prize each day'}, day 7 bonus ${c.checkIn.weekBonusPts} pts, at most ${usd(c.checkIn.monthlyCapPts)} per customer a month`}>
          <CheckInEditor value={c.checkIn} defaults={d.defaults.checkIn} onSave={(v) => save.mutate({ checkIn: v })} busy={save.isPending} />
        </Feature>

        <Feature id="badges" emoji="🏅" title="Badges" blurb="Things to earn: First stop, Hot food fan, Early bird, Explorer and more. They cost nothing and nobody is paid for a badge." on={c.badges.enabled} onToggle={toggle('badges')} busy={save.isPending}
          open={!!open.badges} setOpen={(v) => setOpen((o) => ({ ...o, badges: v }))} summary={`${d.badges.length - c.badges.off.length} of ${d.badges.length} badges shown`}>
          <BadgesEditor value={c.badges} all={d.badges} onSave={(off) => save.mutate({ badges: { off } })} busy={save.isPending} />
        </Feature>

        <Feature id="storeGoals" emoji="🏪" title="Store goals" blurb="'If Katy makes 200 sales this week, everyone who bought there gets 50 pts.' Customers see the store's progress. The reward is paid once, after the goal ends, only if it was reached. Only sales of $2 or more count, and customers whose account is closed or restricted are not paid." on={c.storeGoals.enabled} onToggle={toggle('storeGoals')} busy={save.isPending} money
          open={!!open.storeGoals} setOpen={(v) => setOpen((o) => ({ ...o, storeGoals: v }))} summary={`${d.goals.filter((g) => g.isActive && !g.paidAt && new Date(g.endDate) > new Date()).length} running`}>
          <GoalsEditor goals={d.goals} stores={d.stores} />
        </Feature>

        <Feature id="reorder" emoji="🍗" title="Order your usual" blurb="A one-tap 'Your usual' row on Hot Food, built from each customer's own past orders. It costs nothing." on={c.reorder.enabled} onToggle={toggle('reorder')} busy={save.isPending} open={false} setOpen={() => {}} />

        <Feature id="gasAlerts" emoji="⛽" title="Gas price alerts" blurb="Customers pick a store and a price ('tell me when regular is $2.89 or less'). They are told when the price you enter at that store reaches it, at most once a day." on={c.gasAlerts.enabled} onToggle={toggle('gasAlerts')} busy={save.isPending} open={false} setOpen={() => {}} summary={`${R.gasAlerts} alerts set`} />

        <Feature id="sharing" emoji="📣" title="Sharing" blurb="A 'Share' button on a streak or badge sends a friendly message with the app link. Free word of mouth." on={c.sharing.enabled} onToggle={toggle('sharing')} busy={save.isPending}
          open={!!open.sharing} setOpen={(v) => setOpen((o) => ({ ...o, sharing: v }))}>
          <SharingEditor value={c.sharing} onSave={(message) => save.mutate({ sharing: { message } })} busy={save.isPending} />
        </Feature>

        <Feature id="ratePrompt" emoji="⭐" title="Rate the app" blurb="Asks a customer, once ever, to rate the app, with the phone's own rating sheet. It only comes right after a good moment (a reward redeemed or a check-in paid), never at launch, and only once they have bought a few times. Free, and the best way to get real reviews." on={c.ratePrompt.enabled} onToggle={toggle('ratePrompt')} busy={save.isPending}
          open={!!open.ratePrompt} setOpen={(v) => setOpen((o) => ({ ...o, ratePrompt: v }))} summary={`After ${c.ratePrompt.minPurchases} purchases and ${c.ratePrompt.minDays} days, asked ${R.ratePrompt} so far`}>
          <RateEditor value={c.ratePrompt} onSave={(v) => save.mutate({ ratePrompt: v })} busy={save.isPending} />
        </Feature>

        <Feature id="welcome" emoji="👋" title="Welcome series" blurb="Up to three friendly pushes in a new customer's first days: how to earn at the register (and their welcome treats), then order ahead or check in daily, then invite a friend or see their tier. Each one is skipped when they have already done it, and only people who join after you switch it on get it. Never in quiet hours." on={c.welcome.enabled} onToggle={toggle('welcome')} busy={save.isPending}
          open={!!open.welcome} setOpen={(v) => setOpen((o) => ({ ...o, welcome: v }))} summary={`${c.welcome.steps.filter((s) => s.enabled).map((s) => `day ${s.day}`).join(', ') || 'No steps on'}${c.welcome.since ? `, for people who joined from ${day(`${c.welcome.since}T12:00:00`)}` : ''}. Sent in the last 30 days: ${R.welcome.sent}`}>
          <WelcomeEditor value={c.welcome} defaults={d.defaults.welcome} onSave={(v) => save.mutate({ welcome: v })} busy={save.isPending} sent={R.welcome.byStep} />
        </Feature>

        <Feature id="tierUp" emoji="🏆" title="Tier celebration" blurb="When a customer reaches a higher tier, the app shows a short celebration with the perks they unlocked and a button to Rewards, once per tier per half year, on whichever phone they use. The tier-up push always goes out, in their language, and opens Rewards. It costs nothing." on={c.tierUp.enabled} onToggle={toggle('tierUp')} busy={save.isPending} open={false} setOpen={() => {}}
          summary={`Last 30 days: ${R.tierUp.reached} reached a higher tier, ${R.tierUp.celebrated} saw the celebration`} />

        <Feature id="birthday" emoji="🎂" title="Birthday gift" blurb="A warm greeting push on a customer's birthday (after 10 AM, never in quiet hours) and, if you set one, a small points gift once a year for people who bought lately. The gift is paid at the store they last bought at, inside a monthly budget that is a hard cap. Customers add their birthday in Profile (month and day only), and the app reminds those who have not." on={c.birthday.enabled} onToggle={toggle('birthday')} busy={save.isPending} money={c.birthday.bonusPts > 0}
          open={!!open.birthday} setOpen={(v) => setOpen((o) => ({ ...o, birthday: v }))} summary={`${c.birthday.bonusPts > 0 ? `${c.birthday.bonusPts} pts gift` : 'Greeting only'}, budget ${usd(c.birthday.monthlyBudgetPts)} a month (${usd(R.birthday.spentThisMonth)} used). ${R.birthday.withBirthday} of ${R.birthday.customers} customers gave a birthday.`}>
          <BirthdayEditor value={c.birthday} defaults={d.defaults.birthday} onSave={(v) => save.mutate({ birthday: v })} busy={save.isPending} results={R.birthday} />
        </Feature>

        <Feature id="nudges" emoji="🔔" title="Smart nudges" blurb="Polite, personal pushes: 'You are 120 pts from a free coffee', 'Keep your streak', 'We miss you'. Never during quiet hours, a few a week at most per person, and each kind only once for the same thing." on={c.nudges.enabled} onToggle={toggle('nudges')} busy={save.isPending}
          open={!!open.nudges} setOpen={(v) => setOpen((o) => ({ ...o, nudges: v }))} summary={`Quiet ${hourLabel(c.nudges.quietFrom)} to ${hourLabel(c.nudges.quietTo)}, at most ${c.nudges.maxPerWeek} a week per person`}>
          <NudgesEditor value={c.nudges} onSave={(v) => save.mutate({ nudges: v })} busy={save.isPending} sent={R.nudges} />
        </Feature>

        <div id="eng-events"><EventKit open={!!open.events} setOpen={(v) => setOpen((o) => ({ ...o, events: v }))} /></div>
      </div>
    </Page>
  );
}

// ─── editors ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function StreaksEditor({ value, defaults, onSave, busy }: { value: Config['streaks']; defaults: Config['streaks']; onSave: (v: Partial<Config['streaks']>) => void; busy: boolean }) {
  const [min, setMin] = useState(String(value.minPurchase));
  const [ms, setMs] = useState(value.milestones.map((m) => ({ weeks: String(m.weeks), pts: String(m.pts) })));
  useEffect(() => { setMin(String(value.minPurchase)); setMs(value.milestones.map((m) => ({ weeks: String(m.weeks), pts: String(m.pts) }))); }, [JSON.stringify(value)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = ms.map((m) => ({ weeks: num(m.weeks), pts: num(m.pts) }));
  const bad = parsed.some((m) => !Number.isInteger(m.weeks) || m.weeks < 1 || m.weeks > 52 || !Number.isInteger(m.pts) || m.pts < 0 || m.pts > 1000) || new Set(parsed.map((m) => m.weeks)).size !== parsed.length || !(num(min) >= 0 && num(min) <= 100) || parsed.length === 0;
  const total = parsed.reduce((t, m) => t + (Number.isFinite(m.pts) ? m.pts : 0), 0);
  return (
    <>
      <Field label="A visit counts when the purchase is at least ($)" htmlFor="st-min"><input id="st-min" style={smallInput} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
      <div>
        <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>Bonuses</div>
        {ms.map((m, i) => (
          <div key={i} style={{ ...row, marginBottom: 8 }}>
            <Field label={i === 0 ? 'Weeks in a row' : ''} htmlFor={`st-w${i}`}><input id={`st-w${i}`} style={smallInput} inputMode="numeric" value={m.weeks} onChange={(e) => setMs((a) => a.map((x, j) => (j === i ? { ...x, weeks: whole(e.target.value) } : x)))} /></Field>
            <Field label={i === 0 ? 'Bonus (pts)' : ''} htmlFor={`st-p${i}`}><input id={`st-p${i}`} style={smallInput} inputMode="numeric" value={m.pts} onChange={(e) => setMs((a) => a.map((x, j) => (j === i ? { ...x, pts: whole(e.target.value) } : x)))} /></Field>
            <span style={{ fontSize: FONT.small, color: TEXT_MUTED, paddingBottom: 10 }}>{Number.isFinite(num(m.pts)) ? usd(num(m.pts)) : ''}</span>
            <Button size="sm" variant="secondary" onClick={() => setMs((a) => a.filter((_, j) => j !== i))} disabled={ms.length <= 1}>Remove</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" disabled={ms.length >= 8} onClick={() => setMs((a) => [...a, { weeks: String((parsed.at(-1)?.weeks || 0) + 3), pts: '100' }])}>Add a bonus</Button>
      </div>
      <Notice>A customer who keeps one streak going through every bonus earns {total} pts ({usd(total)}) in all. Each bonus is paid once per streak, and a streak that breaks starts over.</Notice>
      <div style={row}>
        <Button variant="primary" disabled={bad || busy} onClick={() => onSave({ minPurchase: num(min), milestones: parsed })}>Save</Button>
        <Button variant="secondary" onClick={() => { setMin(String(defaults.minPurchase)); setMs(defaults.milestones.map((m) => ({ weeks: String(m.weeks), pts: String(m.pts) }))); }}>Use the suggested numbers</Button>
        {bad && <span style={{ color: C.danger, fontSize: FONT.small }}>Weeks 1 to 52 (each once), bonus 0 to 1000 pts.</span>}
      </div>
    </>
  );
}

function CheckInEditor({ value, defaults, onSave, busy }: { value: Config['checkIn']; defaults: Config['checkIn']; onSave: (v: Partial<Config['checkIn']>) => void; busy: boolean }) {
  const toForm = (v: Config['checkIn']) => ({ mode: v.mode, pts: String(v.pts), weekBonusPts: String(v.weekBonusPts), cap: String(v.monthlyCapPts), visit: String(v.needVisitDays), mystery: v.mystery.map((p) => ({ pts: String(p.pts), weight: String(p.weight) })) });
  const [f, setF] = useState(toForm(value));
  useEffect(() => { setF(toForm(value)); }, [JSON.stringify(value)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const n = { pts: num(f.pts), week: num(f.weekBonusPts), cap: num(f.cap), visit: num(f.visit) };
  const prizes = f.mystery.map((p) => ({ pts: num(p.pts), weight: num(p.weight) }));
  const totalW = prizes.reduce((t, p) => t + (p.weight || 0), 0);
  const bad = !(n.pts >= 0 && n.pts <= 50) || !(n.week >= 0 && n.week <= 200) || !(n.cap >= 0 && n.cap <= 1000) || !(n.visit >= 0 && n.visit <= 365)
    || (f.mode === 'MYSTERY' && (prizes.length === 0 || prizes.some((p) => !(p.pts >= 0 && p.pts <= 100) || !(p.weight >= 1 && p.weight <= 100))));
  const expected = prizes.reduce((t, p) => t + (p.pts * p.weight) / (totalW || 1), 0);
  const setN = (k: 'pts' | 'weekBonusPts' | 'cap' | 'visit') => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: whole(e.target.value) }));
  return (
    <>
      <div style={row} role="radiogroup" aria-label="Reward style">
        {(['FIXED', 'MYSTERY'] as const).map((m) => (
          <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontWeight: 600, color: C.text }}>
            <input type="radio" name="ci-mode" checked={f.mode === m} onChange={() => setF((x) => ({ ...x, mode: m }))} />{m === 'FIXED' ? 'The same every day' : 'A mystery prize each day'}
          </label>
        ))}
      </div>
      {f.mode === 'FIXED'
        ? <Field label="Points a day" htmlFor="ci-pts"><input id="ci-pts" style={smallInput} inputMode="numeric" value={f.pts} onChange={setN('pts')} /></Field>
        : (
          <div>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>Prizes (a bigger "chance" number comes up more often)</div>
            {f.mystery.map((p, i) => (
              <div key={i} style={{ ...row, marginBottom: 8 }}>
                <Field label={i === 0 ? 'Points' : ''} htmlFor={`ci-mp${i}`}><input id={`ci-mp${i}`} style={smallInput} inputMode="numeric" value={p.pts} onChange={(e) => setF((x) => ({ ...x, mystery: x.mystery.map((y, j) => (j === i ? { ...y, pts: whole(e.target.value) } : y)) }))} /></Field>
                <Field label={i === 0 ? 'Chance' : ''} htmlFor={`ci-mw${i}`}><input id={`ci-mw${i}`} style={smallInput} inputMode="numeric" value={p.weight} onChange={(e) => setF((x) => ({ ...x, mystery: x.mystery.map((y, j) => (j === i ? { ...y, weight: whole(e.target.value) } : y)) }))} /></Field>
                <span style={{ fontSize: FONT.small, color: TEXT_MUTED, paddingBottom: 10 }}>{totalW ? `${Math.round(((num(p.weight) || 0) / totalW) * 100)}% of days` : ''}</span>
                <Button size="sm" variant="secondary" disabled={f.mystery.length <= 1} onClick={() => setF((x) => ({ ...x, mystery: x.mystery.filter((_, j) => j !== i) }))}>Remove</Button>
              </div>
            ))}
            <Button size="sm" variant="secondary" disabled={f.mystery.length >= 6} onClick={() => setF((x) => ({ ...x, mystery: [...x.mystery, { pts: '2', weight: '10' }] }))}>Add a prize</Button>
            <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '6px 0 0' }}>On average a check-in pays {expected.toFixed(1)} pts. Everyone gets a prize: it is a free daily reveal, not a game of chance with anything at stake.</p>
          </div>
        )}
      <div style={row}>
        <Field label="Extra on day 7 (pts)" htmlFor="ci-wk"><input id="ci-wk" style={smallInput} inputMode="numeric" value={f.weekBonusPts} onChange={setN('weekBonusPts')} /></Field>
        <Field label="Most a customer can get a month (pts)" htmlFor="ci-cap" hint={Number.isFinite(n.cap) ? usd(n.cap) : ''}><input id="ci-cap" style={smallInput} inputMode="numeric" value={f.cap} onChange={setN('cap')} /></Field>
        <Field label="Must have bought within (days, 0 = ever)" htmlFor="ci-visit"><input id="ci-visit" style={smallInput} inputMode="numeric" value={f.visit} onChange={setN('visit')} /></Field>
      </div>
      <Notice>The most this can cost for one customer in a month is {Number.isFinite(n.cap) ? usd(n.cap) : '...'}, whatever else is set. Paid as a normal bonus line, so it shows in the customer's history and in billing like any cashback.</Notice>
      <div style={row}>
        <Button variant="primary" disabled={bad || busy} onClick={() => onSave({ mode: f.mode, pts: n.pts, weekBonusPts: n.week, monthlyCapPts: n.cap, needVisitDays: n.visit, mystery: prizes })}>Save</Button>
        <Button variant="secondary" onClick={() => setF(toForm(defaults))}>Use the suggested numbers</Button>
        {bad && <span style={{ color: C.danger, fontSize: FONT.small }}>Check the numbers: points a day 0 to 50, day 7 up to 200, monthly cap up to 1000.</span>}
      </div>
    </>
  );
}

function BadgesEditor({ value, all, onSave, busy }: { value: Config['badges']; all: Hq['badges']; onSave: (off: string[]) => void; busy: boolean }) {
  const [off, setOff] = useState<string[]>(value.off);
  useEffect(() => { setOff(value.off); }, [JSON.stringify(value.off)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const changed = JSON.stringify([...off].sort()) !== JSON.stringify([...value.off].sort());
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
        {all.map((b) => (
          <label key={b.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', color: C.text }}>
            <input type="checkbox" checked={!off.includes(b.key)} onChange={(e) => setOff((o) => (e.target.checked ? o.filter((k) => k !== b.key) : [...o, b.key]))} style={{ marginTop: 4 }} />
            <span><strong>{b.emoji} {b.name}</strong><br /><span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{b.desc}</span></span>
          </label>
        ))}
      </div>
      <div style={row}><Button variant="primary" disabled={!changed || busy} onClick={() => onSave(off)}>Save</Button></div>
    </>
  );
}

const WELCOME_STEP_INFO: { title: string; choices: { key: WelcomeKey; when: string }[] }[] = [
  { title: 'Step 1: earning at the register', choices: [{ key: 'qrBonus', when: 'Sent while their welcome treats last and they have not bought yet' }, { key: 'qr', when: 'Otherwise, when they have not bought yet' }] },
  { title: 'Step 2: something to try', choices: [{ key: 'hotFood', when: 'Sent while hot food ordering is on and they have never ordered' }, { key: 'checkIn', when: 'Otherwise, while the daily check-in is on, once they have bought and never checked in' }] },
  { title: 'Step 3: bring a friend', choices: [{ key: 'invite', when: 'Sent while invites are on and they have not invited anyone' }, { key: 'tier', when: 'Otherwise: their tier and perks' }] },
];
const WELCOME_TITLE_MAX = 60, WELCOME_BODY_MAX = 200;

function WelcomeEditor({ value, defaults, onSave, busy, sent }: { value: Config['welcome']; defaults: Config['welcome']; onSave: (v: { steps: WelcomeStep[]; texts: Record<WelcomeKey, WelcomeText> }) => void; busy: boolean; sent: number[] }) {
  const [days, setDays] = useState(value.steps.map((s) => String(s.day)));
  const [on, setOn] = useState(value.steps.map((s) => s.enabled));
  const [texts, setTexts] = useState(value.texts);
  useEffect(() => { setDays(value.steps.map((s) => String(s.day))); setOn(value.steps.map((s) => s.enabled)); setTexts(value.texts); }, [JSON.stringify(value)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dn = days.map(num);
  const daysBad = dn.some((n, i) => !Number.isInteger(n) || n < 1 + i || n > 28 + i) || dn.some((n, i) => i > 0 && n <= dn[i - 1]);
  const textBad = (Object.values(texts) as WelcomeText[]).some((t) => !t.titleEn.trim() || !t.bodyEn.trim() || !t.titleEs.trim() || !t.bodyEs.trim() || t.titleEn.length > WELCOME_TITLE_MAX || t.titleEs.length > WELCOME_TITLE_MAX || t.bodyEn.length > WELCOME_BODY_MAX || t.bodyEs.length > WELCOME_BODY_MAX);
  const next = { steps: dn.map((d, i) => ({ day: d, enabled: on[i] })), texts };
  const changed = JSON.stringify(next) !== JSON.stringify({ steps: value.steps, texts: value.texts });
  const setText = (k: WelcomeKey, field: keyof WelcomeText, v: string) => setTexts((t) => ({ ...t, [k]: { ...t[k], [field]: v } }));
  return (
    <>
      {WELCOME_STEP_INFO.map((info, i) => (
        <div key={info.title} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ ...row, alignItems: 'center' }}>
            <Switch on={on[i]} onChange={(v) => setOn((o) => o.map((x, j) => (j === i ? v : x)))} label={`${info.title}: ${on[i] ? 'on' : 'off'}`} />
            <div style={{ fontWeight: 700, color: C.text }}>{info.title}</div>
            <Field label="Days after signing up" htmlFor={`wl-day${i}`} hint={`${1 + i} to ${28 + i}`}>
              <input id={`wl-day${i}`} style={smallInput} inputMode="numeric" value={days[i]} onChange={(e) => setDays((d) => d.map((x, j) => (j === i ? whole(e.target.value) : x)))} />
            </Field>
            <span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Sent in the last 30 days: {sent[i] ?? 0}</span>
          </div>
          {info.choices.map((ch) => (
            <div key={ch.key} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{ch.when}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                {(['En', 'Es'] as const).map((lang) => (
                  <div key={lang} style={{ display: 'grid', gap: 6 }}>
                    <Field label={`Title (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`wl-${ch.key}-t${lang}`} hint={`${texts[ch.key][`title${lang}`].length} of ${WELCOME_TITLE_MAX}`}>
                      <input id={`wl-${ch.key}-t${lang}`} style={INPUT} maxLength={WELCOME_TITLE_MAX} value={texts[ch.key][`title${lang}`]} onChange={(e) => setText(ch.key, `title${lang}`, e.target.value)} />
                    </Field>
                    <Field label={`Message (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`wl-${ch.key}-b${lang}`} hint={`${texts[ch.key][`body${lang}`].length} of ${WELCOME_BODY_MAX}`}>
                      <textarea id={`wl-${ch.key}-b${lang}`} style={{ ...INPUT, minHeight: 64, resize: 'vertical' }} maxLength={WELCOME_BODY_MAX} value={texts[ch.key][`body${lang}`]} onChange={(e) => setText(ch.key, `body${lang}`, e.target.value)} />
                    </Field>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <Notice>Each step goes out once, between 10 AM and 8 PM store time and never in the nudge quiet hours. A step whose day passed while nothing could be sent still goes out up to two days late. Customers can read them again in the app's Alerts.</Notice>
      <div style={row}>
        <Button variant="primary" disabled={daysBad || textBad || !changed || busy} onClick={() => onSave(next)}>Save</Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setDays(defaults.steps.map((s) => String(s.day))); setOn(defaults.steps.map((s) => s.enabled)); setTexts(defaults.texts); }}>Use the suggested texts</Button>
        {daysBad && <span style={{ fontSize: FONT.small, color: C.danger }}>Each step needs a later day than the one before it.</span>}
        {textBad && <span style={{ fontSize: FONT.small, color: C.danger }}>Every title and message needs both languages, within the length shown.</span>}
      </div>
    </>
  );
}

type PushText = { titleEn: string; bodyEn: string; titleEs: string; bodyEs: string };
const PUSH_TITLE_MAX = 60, PUSH_BODY_MAX = 200;

/** Title and message in English and Spanish, side by side. */
function PushTextFields({ id, value, onChange }: { id: string; value: PushText; onChange: (v: PushText) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
      {(['En', 'Es'] as const).map((lang) => (
        <div key={lang} style={{ display: 'grid', gap: 6 }}>
          <Field label={`Title (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`${id}-t${lang}`} hint={`${value[`title${lang}`].length} of ${PUSH_TITLE_MAX}`}>
            <input id={`${id}-t${lang}`} style={INPUT} maxLength={PUSH_TITLE_MAX} value={value[`title${lang}`]} onChange={(e) => onChange({ ...value, [`title${lang}`]: e.target.value })} />
          </Field>
          <Field label={`Message (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`${id}-b${lang}`} hint={`${value[`body${lang}`].length} of ${PUSH_BODY_MAX}`}>
            <textarea id={`${id}-b${lang}`} style={{ ...INPUT, minHeight: 64, resize: 'vertical' }} maxLength={PUSH_BODY_MAX} value={value[`body${lang}`]} onChange={(e) => onChange({ ...value, [`body${lang}`]: e.target.value })} />
          </Field>
        </div>
      ))}
    </div>
  );
}
const pushTextBad = (t: PushText) => !t.titleEn.trim() || !t.bodyEn.trim() || !t.titleEs.trim() || !t.bodyEs.trim() || t.titleEn.length > PUSH_TITLE_MAX || t.titleEs.length > PUSH_TITLE_MAX || t.bodyEn.length > PUSH_BODY_MAX || t.bodyEs.length > PUSH_BODY_MAX;

function BirthdayEditor({ value, defaults, onSave, busy, results }: { value: Config['birthday']; defaults: Config['birthday']; onSave: (v: Omit<Config['birthday'], 'enabled'>) => void; busy: boolean; results: Hq['results']['birthday'] }) {
  const [pts, setPts] = useState(String(value.bonusPts));
  const [days, setDays] = useState(String(value.needBoughtDays));
  const [budget, setBudget] = useState(String(value.monthlyBudgetPts));
  const [gift, setGift] = useState(value.gift);
  const [greeting, setGreeting] = useState(value.greeting);
  useEffect(() => { setPts(String(value.bonusPts)); setDays(String(value.needBoughtDays)); setBudget(String(value.monthlyBudgetPts)); setGift(value.gift); setGreeting(value.greeting); }, [JSON.stringify(value)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const p = num(pts), dd = num(days), b = num(budget);
  const bad = !(Number.isInteger(p) && p >= 0 && p <= 500) || !(Number.isInteger(dd) && dd >= 0 && dd <= 365) || !(Number.isInteger(b) && b >= 0 && b <= 200000) || pushTextBad(gift) || pushTextBad(greeting);
  const next = { bonusPts: p, needBoughtDays: dd, monthlyBudgetPts: b, gift, greeting };
  const changed = JSON.stringify(next) !== JSON.stringify({ bonusPts: value.bonusPts, needBoughtDays: value.needBoughtDays, monthlyBudgetPts: value.monthlyBudgetPts, gift: value.gift, greeting: value.greeting });
  return (
    <>
      <div style={row}>
        <Field label="Gift (points, 0 for a greeting only)" htmlFor="bd-pts" hint={Number.isFinite(p) ? `${usd(p)} each, 0 to 500` : '0 to 500'}>
          <input id="bd-pts" style={smallInput} inputMode="numeric" value={pts} onChange={(e) => setPts(whole(e.target.value))} />
        </Field>
        <Field label="Only if they bought in the last (days)" htmlFor="bd-days" hint="0 means anyone who has ever bought">
          <input id="bd-days" style={smallInput} inputMode="numeric" value={days} onChange={(e) => setDays(whole(e.target.value))} />
        </Field>
        <Field label="Monthly budget (points, all gifts together)" htmlFor="bd-budget" hint={Number.isFinite(b) ? `${usd(b)} a month at most` : 'up to 200,000'}>
          <input id="bd-budget" style={{ ...smallInput, width: 120 }} inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </Field>
      </div>
      <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Last 30 days: {results.greeted} greeted, {results.paid} gifts ({usd(results.pts)}). This month: {usd(results.spentThisMonth)} of {usd(value.monthlyBudgetPts)} used.</div>
      <div style={{ fontWeight: 700, color: C.text }}>With a gift</div>
      <PushTextFields id="bd-gift" value={gift} onChange={setGift} />
      <div style={{ fontWeight: 700, color: C.text }}>Greeting only (no gift, or the budget is used up)</div>
      <PushTextFields id="bd-greet" value={greeting} onChange={setGreeting} />
      <Notice>{'{name}'} becomes their first name and {'{pts}'} the gift. When the month's budget is used up, people still get the greeting, never part of a gift.</Notice>
      <div style={row}>
        <Button variant="primary" disabled={bad || !changed || busy} onClick={() => onSave(next)}>Save</Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setGift(defaults.gift); setGreeting(defaults.greeting); }}>Use the suggested texts</Button>
      </div>
    </>
  );
}

function RateEditor({ value, onSave, busy }: { value: Config['ratePrompt']; onSave: (v: { minPurchases: number; minDays: number }) => void; busy: boolean }) {
  const [p, setP] = useState(String(value.minPurchases));
  const [d, setD] = useState(String(value.minDays));
  useEffect(() => { setP(String(value.minPurchases)); setD(String(value.minDays)); }, [value.minPurchases, value.minDays]);
  const pn = num(p), dn = num(d);
  const bad = !(pn >= 1 && pn <= 50) || !(dn >= 0 && dn <= 365);
  const changed = pn !== value.minPurchases || dn !== value.minDays;
  return (
    <>
      <div style={row}>
        <Field label="Only after this many purchases" htmlFor="rt-p" hint="1 to 50"><input id="rt-p" style={{ ...INPUT, width: 110 }} inputMode="numeric" value={p} onChange={(e) => setP(whole(e.target.value))} /></Field>
        <Field label="and this many days with the app" htmlFor="rt-d" hint="0 to 365"><input id="rt-d" style={{ ...INPUT, width: 110 }} inputMode="numeric" value={d} onChange={(e) => setD(whole(e.target.value))} /></Field>
      </div>
      <Notice>Each customer is asked once, ever. The phone decides whether to show its rating sheet (Apple allows about three a year per phone). It only follows a good moment, so nobody is asked while they have a problem open.</Notice>
      <div style={row}><Button variant="primary" disabled={bad || !changed || busy} onClick={() => onSave({ minPurchases: pn, minDays: dn })}>Save</Button></div>
    </>
  );
}

function SharingEditor({ value, onSave, busy }: { value: Config['sharing']; onSave: (m: string) => void; busy: boolean }) {
  const [m, setM] = useState(value.message);
  useEffect(() => { setM(value.message); }, [value.message]);
  return (
    <>
      <Field label="The message people send (the app link follows it)" htmlFor="sh-msg" hint={`${m.length} of 140`}>
        <input id="sh-msg" style={{ ...INPUT, maxWidth: 560 }} maxLength={140} value={m} onChange={(e) => setM(e.target.value)} />
      </Field>
      <div style={row}><Button variant="primary" disabled={!m.trim() || m.trim() === value.message || busy} onClick={() => onSave(m.trim())}>Save</Button></div>
    </>
  );
}

function NudgesEditor({ value, onSave, busy, sent }: { value: Config['nudges']; onSave: (v: object) => void; busy: boolean; sent: Record<string, number> }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [JSON.stringify(value)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const changed = JSON.stringify(v) !== JSON.stringify(value);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <>
      <div style={row}>
        <Field label="No nudges from" htmlFor="nu-from"><select id="nu-from" style={{ ...INPUT, width: 110 }} value={v.quietFrom} onChange={(e) => setV({ ...v, quietFrom: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></Field>
        <Field label="until" htmlFor="nu-to"><select id="nu-to" style={{ ...INPUT, width: 110 }} value={v.quietTo} onChange={(e) => setV({ ...v, quietTo: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></Field>
        <Field label="Most nudges a week, per person" htmlFor="nu-max"><select id="nu-max" style={{ ...INPUT, width: 90 }} value={v.maxPerWeek} onChange={(e) => setV({ ...v, maxPerWeek: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
      </div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: 0 }}>Store time (Central). A nudge that lands in quiet hours waits for the next run.</p>
      <Trigger label="Near a reward" sent={sent.nearReward} on={v.nearReward.enabled} setOn={(on) => setV({ ...v, nearReward: { ...v.nearReward, enabled: on } })} blurb="'You are 120 pts from a free coffee.' At most once every 14 days per person.">
        <Field label="when within (pts)" htmlFor="nu-near"><input id="nu-near" style={smallInput} inputMode="numeric" value={v.nearReward.withinPts} onChange={(e) => setV({ ...v, nearReward: { ...v.nearReward, withinPts: Number(whole(e.target.value)) } })} /></Field>
      </Trigger>
      <Trigger label="Streak about to end" sent={sent.streakRisk} on={v.streakRisk.enabled} setOn={(on) => setV({ ...v, streakRisk: { enabled: on } })} blurb="Friday and Saturday from 10 AM, for a streak of 2 or more weeks with no visit yet this week. Needs Visit streaks on." />
      <Trigger label="Tier period ending" sent={sent.tierReset} on={v.tierReset.enabled} setOn={(on) => setV({ ...v, tierReset: { ...v.tierReset, enabled: on } })} blurb="Once per period, for Silver and above, near the end of the tier period.">
        <Field label="days before" htmlFor="nu-tier"><input id="nu-tier" style={smallInput} inputMode="numeric" value={v.tierReset.daysBefore} onChange={(e) => setV({ ...v, tierReset: { ...v.tierReset, daysBefore: Number(whole(e.target.value)) } })} /></Field>
      </Trigger>
      <Trigger label="We miss you" sent={sent.comeback} on={v.comeback.enabled} setOn={(on) => setV({ ...v, comeback: { ...v.comeback, enabled: on } })} blurb="'You have 640 pts waiting.' For customers with points who have not bought in a while. Once a month at most.">
        <Field label="quiet for (days)" htmlFor="nu-quiet"><input id="nu-quiet" style={smallInput} inputMode="numeric" value={v.comeback.quietDays} onChange={(e) => setV({ ...v, comeback: { ...v.comeback, quietDays: Number(whole(e.target.value)) } })} /></Field>
      </Trigger>
      <div style={row}><Button variant="primary" disabled={!changed || busy} onClick={() => onSave(v)}>Save</Button>{changed && <Button variant="secondary" onClick={() => setV(value)}>Undo</Button>}</div>
    </>
  );
}
function Trigger({ label, blurb, on, setOn, sent, children }: { label: string; blurb: string; on: boolean; setOn: (v: boolean) => void; sent?: number; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <Switch on={on} onChange={setOn} label={`${label}: ${on ? 'on' : 'off'}`} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: C.text }}>{label} {sent != null && <span style={{ fontWeight: 400, color: TEXT_MUTED, fontSize: FONT.small }}>({sent} sent in 30 days)</span>}</div>
        <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{blurb}</div>
        {children && <div style={{ marginTop: 8 }}>{children}</div>}
      </div>
    </div>
  );
}

function GoalsEditor({ goals, stores }: { goals: Goal[]; stores: Hq['stores'] }) {
  const qc = useQueryClient();
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [f, setF] = useState({ title: '', storeId: '', metric: 'SALES', target: '200', rewardPoints: '50', startDate: nowLocal(), endDate: plusDays(7) });
  const make = useMutation({
    mutationFn: () => engagementApi.createGoal({ title: f.title, storeId: f.storeId || null, metric: f.metric, target: Number(f.target), rewardPoints: Number(f.rewardPoints), startDate: new Date(f.startDate).toISOString(), endDate: new Date(f.endDate).toISOString() }),
    onSuccess: () => { toast.success('Goal created.'); setF((x) => ({ ...x, title: '' })); qc.invalidateQueries({ queryKey: ['engagement-hq'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Could not create the goal.')),
  });
  const end = useMutation({
    mutationFn: (id: string) => engagementApi.updateGoal(id, { isActive: false }),
    onSuccess: () => { toast.success('Goal ended. Nobody is paid for it.'); qc.invalidateQueries({ queryKey: ['engagement-hq'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Could not end it.')),
  });
  const reward = Number(f.rewardPoints);
  return (
    <>
      {goals.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {goals.slice(0, 12).map((g) => {
            const over = new Date(g.endDate) < new Date();
            const state = g.paidAt ? (g.leading.value >= g.target ? 'Paid' : 'Not reached') : !g.isActive ? 'Ended' : over ? 'Paying soon' : 'Running';
            return (
              <div key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ flex: '1 1 220px' }}>
                  <strong>{g.title}</strong> <Badge tone={state === 'Running' ? 'success' : state === 'Paid' ? 'info' : 'neutral'}>{state}</Badge>
                  <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{g.store ?? 'Every store'} · {g.metric === 'SALES' ? 'sales' : 'different customers'} · target {g.target} · {g.rewardPoints} pts each · {day(g.startDate)} to {day(g.endDate)}{g.leading.store ? ` · best so far ${g.leading.store} ${g.leading.value}` : ''}</div>
                </div>
                {state === 'Running' && <Button size="sm" variant="secondary" onClick={() => { if (window.confirm('End this goal now? Nobody will be paid for it.')) end.mutate(g.id); }}>End now</Button>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontWeight: 700, color: C.text }}>New goal</div>
      <div style={row}>
        <Field label="Title" htmlFor="gl-title"><input id="gl-title" style={{ ...INPUT, width: 260 }} maxLength={80} value={f.title} placeholder="Hit 200 sales this week" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Store" htmlFor="gl-store"><select id="gl-store" style={{ ...INPUT, width: 200 }} value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })}><option value="">Every store (each on its own)</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Count" htmlFor="gl-metric"><select id="gl-metric" style={{ ...INPUT, width: 190 }} value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}><option value="SALES">Sales (purchases)</option><option value="CUSTOMERS">Different customers</option></select></Field>
      </div>
      <div style={row}>
        <Field label="Target" htmlFor="gl-target"><input id="gl-target" style={smallInput} inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: whole(e.target.value) })} /></Field>
        <Field label="Reward for each customer (pts)" htmlFor="gl-rew" hint={Number.isFinite(reward) ? usd(reward) : ''}><input id="gl-rew" style={smallInput} inputMode="numeric" value={f.rewardPoints} onChange={(e) => setF({ ...f, rewardPoints: whole(e.target.value) })} /></Field>
        <Field label="Starts" htmlFor="gl-start"><input id="gl-start" type="datetime-local" style={{ ...INPUT, width: 200 }} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="Ends" htmlFor="gl-end"><input id="gl-end" type="datetime-local" style={{ ...INPUT, width: 200 }} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
      </div>
      <Notice>When the goal ends, if the store reached the target, every customer who bought there during the goal gets {Number.isFinite(reward) ? `${reward} pts (${usd(reward)})` : 'the reward'}, once. If it was not reached, nobody is paid. A goal runs for at most about two months.</Notice>
      <div style={row}><Button variant="primary" disabled={make.isPending || !f.title.trim() || !(Number(f.target) >= 1) || !(reward >= 1 && reward <= 500)} onClick={() => make.mutate()}>{make.isPending ? 'Creating…' : 'Create goal'}</Button></div>
    </>
  );
}

const CATS = [['', 'Any purchase'], ['HOT_FOODS', 'Hot food'], ['GROCERIES', 'Groceries'], ['FROZEN_FOODS', 'Frozen'], ['FRESH_FOODS', 'Fresh food'], ['GAS', 'Gas'], ['DIESEL', 'Diesel']];
function PunchCardMaker() {
  const [f, setF] = useState({ title: 'Hot food punch card', category: 'HOT_FOODS', stamps: '5', min: '2', pts: '100' });
  const make = useMutation({
    mutationFn: () => {
      const end = new Date(); end.setFullYear(end.getFullYear() + 1);
      return challengesApi.create({ kind: 'VISITS', title: f.title.trim(), category: f.category || undefined, target: Number(f.stamps), minPurchase: Number(f.min) || undefined, reward: Number(f.pts) / 100, repeats: true, startDate: new Date().toISOString(), endDate: end.toISOString() });
    },
    onSuccess: () => toast.success('Punch card is live. Customers are told, and it shows as stamps in the app.'),
    onError: (e) => toast.error(serverMessage(e, 'Could not create it.')),
  });
  const ok = f.title.trim() && Number(f.stamps) >= 2 && Number(f.stamps) <= 12 && Number(f.pts) >= 1 && Number(f.pts) <= 1000;
  return (
    <>
      <div style={row}>
        <Field label="Name" htmlFor="pc-title"><input id="pc-title" style={{ ...INPUT, width: 240 }} maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Counts" htmlFor="pc-cat"><select id="pc-cat" style={{ ...INPUT, width: 170 }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Stamps to fill (2 to 12)" htmlFor="pc-stamps"><input id="pc-stamps" style={smallInput} inputMode="numeric" value={f.stamps} onChange={(e) => setF({ ...f, stamps: whole(e.target.value) })} /></Field>
        <Field label="A purchase counts from ($)" htmlFor="pc-min"><input id="pc-min" style={smallInput} inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
        <Field label="Reward (pts)" htmlFor="pc-pts" hint={Number(f.pts) ? usd(Number(f.pts)) : ''}><input id="pc-pts" style={smallInput} inputMode="numeric" value={f.pts} onChange={(e) => setF({ ...f, pts: whole(e.target.value) })} /></Field>
      </div>
      <Notice>The reward is paid each time the card is filled, and it starts over. It runs for a year; end it any time on Offers, Challenges.</Notice>
      <div style={row}><Button variant="primary" disabled={!ok || make.isPending} onClick={() => { if (window.confirm(`Start "${f.title}": every ${f.stamps}th purchase pays ${f.pts} pts?`)) make.mutate(); }}>{make.isPending ? 'Creating…' : 'Start this punch card'}</Button></div>
    </>
  );
}

const KIT: { name: string; title: string; kind: 'VISITS' | 'SPEND'; target: number; pts: number; category?: string; line: string }[] = [
  { name: 'Halloween treat card', title: 'Halloween treat card', kind: 'VISITS', target: 3, pts: 100, line: '3 purchases and a treat' },
  { name: 'Thanksgiving fill-up', title: 'Thanksgiving fill-up', kind: 'SPEND', target: 30, pts: 150, line: 'Spend $30 over the holiday week' },
  { name: 'Holiday hot food', title: 'Holiday hot food card', kind: 'VISITS', target: 3, pts: 100, category: 'HOT_FOODS', line: '3 hot food purchases' },
  { name: 'Fresh start', title: 'Fresh start: 4 visits in January', kind: 'VISITS', target: 4, pts: 150, line: '4 purchases in January' },
  { name: 'Game day', title: 'Game day snack run', kind: 'VISITS', target: 2, pts: 75, category: 'HOT_FOODS', line: '2 hot food purchases' },
  { name: 'Back to school', title: 'Back to school stock-up', kind: 'SPEND', target: 25, pts: 100, line: 'Spend $25' },
];
function EventKit({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [ends, setEnds] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); });
  const make = useMutation({
    mutationFn: (k: (typeof KIT)[number]) => challengesApi.create({
      kind: k.kind, title: k.title, category: k.category, target: k.target, reward: k.pts / 100, repeats: false, minPurchase: k.kind === 'VISITS' ? 2 : undefined,
      startDate: new Date().toISOString(), endDate: new Date(`${ends}T23:59:00`).toISOString(),
    }),
    onSuccess: (_r, k) => toast.success(`"${k.title}" started. Customers are told, and it ends ${ends}.`),
    onError: (e) => toast.error(serverMessage(e, 'Could not start it.')),
  });
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <Card padding={18}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">🎃</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>Event kit</div>
            <p style={{ margin: '4px 0 0', fontSize: FONT.small, color: TEXT_MUTED }}>One tap starts a themed challenge for a holiday or event, with a start today and the end date you choose. Pair it with a seasonal theme (Settings, App) and a banner.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Open'}</Button>
        </div>
        {open && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <Field label="These events end on" htmlFor="ev-end"><input id="ev-end" type="date" style={{ ...INPUT, width: 180 }} value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {KIT.map((k) => (
                <div key={k.name} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, color: C.text }}>{k.name}</div>
                  <div style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '2px 0 8px' }}>{k.line}, pays {k.pts} pts ({usd(k.pts)}) once.</div>
                  <Button size="sm" variant="secondary" disabled={make.isPending || !ends} onClick={() => { if (window.confirm(`Start "${k.title}" now? ${k.line}, ${k.pts} pts, until ${ends}.`)) make.mutate(k); }}>Start it</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
