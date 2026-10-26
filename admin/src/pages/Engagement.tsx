// Engagement (2026-10-23, HQ): switch on and tune the things that bring customers back: visit streaks, punch cards, a daily check-in, badges,
// store goals, "order your usual", gas price alerts, sharing and smart nudges. EVERYTHING IS OFF until switched on here, and every number has
// a safe limit on the server. Suggestions at the top come from real data (who is close to a reward, who has gone quiet, which store is behind).
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { engagementApi, challengesApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { addDays, dayLabel, endOfStoreDay, startOfStoreDay, storeToday } from '../lib/storeDates';
import { Page, PageHeader, Card, Button, Badge, Notice, Field, FieldRow, FieldAction, StatTile, SectionTitle } from '../components/kit';
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
  weeklyChallenge: { enabled: boolean; schedule: { weekOf: string; challengeId: string }[] };
  flashDeals: { enabled: boolean; maxPerWeek: number };
  tierUp: { enabled: boolean };
  mascot: { enabled: boolean; name: string; homeCard: boolean; emptyStates: boolean; pushVoice: boolean };
  games: { enabled: boolean; game: GameKind; prizes: { pts: number; weight: number }[]; monthlyBudgetPts: number; since: string | null; endsOn: string | null };
  friendsBoard: { enabled: boolean; metric: 'VISITS' | 'POINTS'; period: 'WEEK' | 'MONTH'; minMembers: number; maxRows: number };
  birthday: { enabled: boolean; bonusPts: number; needBoughtDays: number; monthlyBudgetPts: number; gift: PushText; greeting: PushText };
  nudges: {
    enabled: boolean; quietFrom: number; quietTo: number; maxPerWeek: number;
    nearReward: { enabled: boolean; withinPts: number }; streakRisk: { enabled: boolean };
    tierReset: { enabled: boolean; daysBefore: number }; comeback: { enabled: boolean; quietDays: number }; weeklyChallenge: { enabled: boolean };
  };
}
type GameKind = 'SPIN' | 'SCRATCH' | 'LUCKY';
const GAME_NAMES: Record<GameKind, string> = { SPIN: 'Spin the wheel', SCRATCH: 'Scratch card', LUCKY: 'Lucky number' };
interface Goal { id: string; title: string; metric: string; target: number; rewardPoints: number; startDate: string; endDate: string; isActive: boolean; paidAt: string | null; store: string | null; storeId: string | null; leading: { value: number; store: string } }
interface Suggestion { id: string; tone: 'tip' | 'info'; title: string; detail: string; feature: string }
interface Hq {
  config: Config; defaults: Config;
  badges: { key: string; emoji: string; name: string; desc: string }[];
  stores: { id: string; name: string }[];
  results: { streaks: { awards: number; pts: number }; checkIn: { checkIns: number; pts: number }; goals: { awards: number; pts: number }; nudges: Record<string, number>; gasAlerts: number; ratePrompt: number; welcome: { sent: number; byStep: number[] }; tierUp: { reached: number; celebrated: number }; friendsBoard: { joined: number }; games: { plays: number; wins: number; pts: number; spentThisMonth: number }; birthday: { greeted: number; paid: number; pts: number; spentThisMonth: number; withBirthday: number; customers: number } };
  goals: Goal[]; suggestions: Suggestion[];
  weekly: {
    thisWeek: string; weeks: string[]; thisWeekStats: { customers: number; earned: number; paid: number } | null;
    schedule: { weekOf: string; challengeId: string; title: string | null; state: string }[];
    candidates: { id: string; kind: string; title: string; rule: string; startDate: string; endDate: string; store: string | null; audience: string; repeats: boolean; announced: boolean }[];
  };
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

function Feature({ id, emoji, title, blurb, on, onToggle, busy, money, confirmOn, open, setOpen, summary, children }: {
  id: string; emoji: string; title: string; blurb: string; on: boolean; onToggle: (v: boolean) => void; busy: boolean; money?: boolean; confirmOn?: string;
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
          <Switch on={on} onChange={(v) => { if (v && (money || confirmOn) && !window.confirm(confirmOn ?? `Turn on ${title}? It pays real points to customers, so check the numbers first.`)) return; onToggle(v); }} label={`${title}: ${on ? 'on' : 'off'}`} disabled={busy} />
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

/** What each feature is called in a sentence ("Open the welcome series"); a feature the page does not know reads "Open it". */
const FEATURE_NAMES: Record<string, string> = {
  streaks: 'visit streaks', punchCards: 'punch cards', checkIn: 'daily check-in', badges: 'badges', storeGoals: 'store goals', reorder: 'Order your usual',
  gasAlerts: 'gas price alerts', sharing: 'sharing', ratePrompt: 'Rate the app', welcome: 'the welcome series', birthday: 'the birthday gift',
  tierUp: 'the tier celebration', weeklyChallenge: 'the challenge of the week', flashDeals: 'flash deals', friendsBoard: 'the friends leaderboard',
  mascot: 'the mascot', games: 'the prize game', nudges: 'smart nudges', events: 'the event kit',
};

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
                <Button size="sm" variant="secondary" onClick={() => go(s.feature)}>Open {FEATURE_NAMES[s.feature] ?? 'it'}</Button>
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

        <Feature id="flashDeals" emoji="⚡" title="Flash deals" blurb="A short message with a countdown ('Double points on hot food until 2 PM'), pushed once to the people you pick and shown at the top of their Home until it ends. It changes no prices or points by itself: make the offer first, then point the flash deal to the offers. Quiet hours and each person's weekly nudge limit apply to the push." on={c.flashDeals.enabled} onToggle={toggle('flashDeals')} busy={save.isPending}
          open={!!open.flashDeals} setOpen={(v) => setOpen((o) => ({ ...o, flashDeals: v }))} summary={`At most ${c.flashDeals.maxPerWeek} a week, one at a time. Pushes sent in the last 30 days: ${R.nudges.flash ?? 0}`}>
          <FlashEditor value={c.flashDeals} stores={d.stores} onSave={(v) => save.mutate({ flashDeals: v })} busy={save.isPending} />
        </Feature>

        <Feature id="weeklyChallenge" emoji="🏆" title="Challenge of the week" blurb="Feature one challenge each week (Monday to Sunday). It shows first in the app with a countdown to the end of the week, and a Monday morning push tells customers about it (a smart nudge: quiet hours and the weekly limit apply). Featuring pays nothing extra: the challenge pays its own reward." on={c.weeklyChallenge.enabled} onToggle={toggle('weeklyChallenge')} busy={save.isPending}
          open={!!open.weeklyChallenge} setOpen={(v) => setOpen((o) => ({ ...o, weeklyChallenge: v }))}
          summary={(() => { const now = d.weekly.schedule.find((e) => e.weekOf === d.weekly.thisWeek); const st = d.weekly.thisWeekStats; return now?.title ? `This week: ${now.title}${st ? `, ${st.customers} taking part, earned ${st.earned} times` : ''}` : 'Nothing is featured this week.'; })()}>
          <WeeklyEditor value={c.weeklyChallenge} weekly={d.weekly} stores={d.stores} onSave={(schedule) => save.mutate({ weeklyChallenge: { schedule } })} busy={save.isPending} />
        </Feature>

        <Feature id="tierUp" emoji="🏆" title="Tier celebration" blurb="When a customer reaches a higher tier, the app shows a short celebration with the perks they unlocked and a button to Rewards, once per tier per half year, on whichever phone they use. The tier-up push always goes out, in their language, and opens Rewards. It costs nothing." on={c.tierUp.enabled} onToggle={toggle('tierUp')} busy={save.isPending} open={false} setOpen={() => {}}
          summary={`Last 30 days: ${R.tierUp.reached} reached a higher tier, ${R.tierUp.celebrated} saw the celebration`} />

        <Feature id="friendsBoard" emoji="🏁" title="Friends leaderboard" blurb="A private race inside each invite circle (a customer, the friends who joined with their code, and the friend who invited them), on the app's Leaderboard. Only people who tap Join show up. Names show only along invite lines, as 'Maria G.'; friends of the same inviter see each other as 'A friend'. A circle opens once enough people joined, which nudges people to invite more. It pays nothing." on={c.friendsBoard.enabled}
          onToggle={(v) => { if (v && !window.confirm('Turn on the friends leaderboard? It shows first names and last initials to friends, so update the privacy policy first.')) return; toggle('friendsBoard')(v); }} busy={save.isPending}
          open={!!open.friendsBoard} setOpen={(v) => setOpen((o) => ({ ...o, friendsBoard: v }))} summary={`${c.friendsBoard.metric === 'POINTS' ? 'Points from purchases' : 'Days with a purchase'}, ${c.friendsBoard.period === 'MONTH' ? 'by month' : 'by week'}, opens at ${c.friendsBoard.minMembers} joined. ${R.friendsBoard.joined} ${R.friendsBoard.joined === 1 ? 'customer has' : 'customers have'} joined.`}>
          <FriendsEditor value={c.friendsBoard} onSave={(v) => save.mutate({ friendsBoard: v })} busy={save.isPending} />
        </Feature>

        <Feature id="mascot" emoji="🍀" title={`${c.mascot.name}, the mascot`} blurb={`Lucky Stop's clover mascot in the app: a short tip of the day on customers' Home (a reward that is ready, one nearly there, or an everyday tip), ${c.mascot.name} in place of the plain icon on empty screens, and if you like, ${c.mascot.name}'s name in front of the automated pushes. It costs nothing.`}
          on={c.mascot.enabled} onToggle={toggle('mascot')} busy={save.isPending} open={!!open.mascot} setOpen={(v) => setOpen((o) => ({ ...o, mascot: v }))}
          summary={[c.mascot.homeCard && 'A tip on Home', c.mascot.emptyStates && 'empty screens', c.mascot.pushVoice && 'signs the automated pushes'].filter(Boolean).join(', ') || 'Nothing picked: open Settings'}>
          <MascotEditor value={c.mascot} onSave={(v) => save.mutate({ mascot: v })} busy={save.isPending} />
        </Feature>

        <Feature id="games" emoji="🎡" title="Prize game" blurb="Spin the wheel, a scratch card or a lucky number: one free play a day for every customer, with no purchase needed and the same odds for everyone. Prizes are points, drawn by the server, inside a hard monthly budget. The app shows the official rules." money
          confirmOn="Turn on the prize game? It pays real points. Before you do, have a lawyer review the official rules the app shows (game promotions have their own rules in Texas)."
          on={c.games.enabled} onToggle={toggle('games')} busy={save.isPending} open={!!open.games} setOpen={(v) => setOpen((o) => ({ ...o, games: v }))}
          summary={`${GAME_NAMES[c.games.game]}${c.games.since ? ` since ${day(`${c.games.since}T12:00:00`)}` : ''}${c.games.endsOn ? `, until ${day(`${c.games.endsOn}T12:00:00`)}` : ''}. Last 30 days: ${R.games.plays} plays, ${R.games.wins} won, ${usd(R.games.pts)} paid. This month ${usd(R.games.spentThisMonth)} of ${usd(c.games.monthlyBudgetPts)}.`}>
          <GamesEditor value={c.games} onSave={(v) => save.mutate({ games: v })} busy={save.isPending} />
        </Feature>

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
            <Field label={i === 0 ? 'Weeks in a row' : ''} htmlFor={`st-w${i}`}><input id={`st-w${i}`} aria-label={`Bonus ${i + 1}: weeks in a row`} style={smallInput} inputMode="numeric" value={m.weeks} onChange={(e) => setMs((a) => a.map((x, j) => (j === i ? { ...x, weeks: whole(e.target.value) } : x)))} /></Field>
            <Field label={i === 0 ? 'Bonus (pts)' : ''} htmlFor={`st-p${i}`}><input id={`st-p${i}`} aria-label={`Bonus ${i + 1}: points`} style={smallInput} inputMode="numeric" value={m.pts} onChange={(e) => setMs((a) => a.map((x, j) => (j === i ? { ...x, pts: whole(e.target.value) } : x)))} /></Field>
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
                <Field label={i === 0 ? 'Points' : ''} htmlFor={`ci-mp${i}`}><input id={`ci-mp${i}`} aria-label={`Prize ${i + 1}: points`} style={smallInput} inputMode="numeric" value={p.pts} onChange={(e) => setF((x) => ({ ...x, mystery: x.mystery.map((y, j) => (j === i ? { ...y, pts: whole(e.target.value) } : y)) }))} /></Field>
                <Field label={i === 0 ? 'Chance' : ''} htmlFor={`ci-mw${i}`}><input id={`ci-mw${i}`} aria-label={`Prize ${i + 1}: chance`} style={smallInput} inputMode="numeric" value={p.weight} onChange={(e) => setF((x) => ({ ...x, mystery: x.mystery.map((y, j) => (j === i ? { ...y, weight: whole(e.target.value) } : y)) }))} /></Field>
                <span style={{ fontSize: FONT.small, color: TEXT_MUTED, paddingBottom: 10 }}>{totalW ? `${Math.round(((num(p.weight) || 0) / totalW) * 100)}% of days` : ''}</span>
                <Button size="sm" variant="secondary" disabled={f.mystery.length <= 1} onClick={() => setF((x) => ({ ...x, mystery: x.mystery.filter((_, j) => j !== i) }))}>Remove</Button>
              </div>
            ))}
            <Button size="sm" variant="secondary" disabled={f.mystery.length >= 6} onClick={() => setF((x) => ({ ...x, mystery: [...x.mystery, { pts: '2', weight: '10' }] }))}>Add a prize</Button>
            <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '6px 0 0' }}>On average a check-in pays {expected.toFixed(1)} pts. Everyone gets a prize: it is a free daily reveal, not a game of chance with anything at stake.</p>
          </div>
        )}
      <FieldRow>
        <Field label="Extra on day 7 (pts)" htmlFor="ci-wk"><input id="ci-wk" style={smallInput} inputMode="numeric" value={f.weekBonusPts} onChange={setN('weekBonusPts')} /></Field>
        <Field label="Most a customer can get a month (pts)" htmlFor="ci-cap" hint={Number.isFinite(n.cap) ? usd(n.cap) : ''}><input id="ci-cap" style={smallInput} inputMode="numeric" value={f.cap} onChange={setN('cap')} /></Field>
        <Field label="Must have bought within (days, 0 = ever)" htmlFor="ci-visit"><input id="ci-visit" style={smallInput} inputMode="numeric" value={f.visit} onChange={setN('visit')} /></Field>
      </FieldRow>
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
                    <Field label={`Title (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`wl-${ch.key}-t${lang}`} after={`${texts[ch.key][`title${lang}`].length} of ${WELCOME_TITLE_MAX}`}>
                      <input id={`wl-${ch.key}-t${lang}`} style={INPUT} maxLength={WELCOME_TITLE_MAX} value={texts[ch.key][`title${lang}`]} onChange={(e) => setText(ch.key, `title${lang}`, e.target.value)} />
                    </Field>
                    <Field label={`Message (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`wl-${ch.key}-b${lang}`} after={`${texts[ch.key][`body${lang}`].length} of ${WELCOME_BODY_MAX}`}>
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
          <Field label={`Title (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`${id}-t${lang}`} after={`${value[`title${lang}`].length} of ${PUSH_TITLE_MAX}`}>
            <input id={`${id}-t${lang}`} style={INPUT} maxLength={PUSH_TITLE_MAX} value={value[`title${lang}`]} onChange={(e) => onChange({ ...value, [`title${lang}`]: e.target.value })} />
          </Field>
          <Field label={`Message (${lang === 'En' ? 'English' : 'Spanish'})`} htmlFor={`${id}-b${lang}`} after={`${value[`body${lang}`].length} of ${PUSH_BODY_MAX}`}>
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

const CHALLENGE_CATEGORIES: { key: string; label: string }[] = [
  { key: '', label: 'Any purchase' }, { key: 'GROCERIES', label: 'Groceries' }, { key: 'FROZEN_FOODS', label: 'Frozen foods' }, { key: 'FRESH_FOODS', label: 'Fresh foods' },
  { key: 'GAS', label: 'Gas' }, { key: 'DIESEL', label: 'Diesel' }, { key: 'HOT_FOODS', label: 'Hot food' }, { key: 'OTHER', label: 'Other' },
];
const STATE_NOTE: Record<string, string> = { OFF: 'switched off, so nothing shows that week', ENDED: 'has ended', MISSING: 'was not found', NOT_THAT_WEEK: 'does not run that week' };

function WeeklyEditor({ value, weekly, stores, onSave, busy }: { value: Config['weeklyChallenge']; weekly: Hq['weekly']; stores: Hq['stores']; onSave: (schedule: { weekOf: string; challengeId: string }[]) => void; busy: boolean }) {
  const qc = useQueryClient();
  const initial = () => Object.fromEntries(weekly.weeks.map((w) => [w, value.schedule.find((e) => e.weekOf === w)?.challengeId ?? '']));
  const [picks, setPicks] = useState<Record<string, string>>(initial);
  useEffect(() => { setPicks(initial()); }, [JSON.stringify(value.schedule), weekly.thisWeek]);   // eslint-disable-line react-hooks/exhaustive-deps
  const runsDuring = (c: Hq['weekly']['candidates'][number], w: string) => new Date(c.startDate) <= endOfStoreDay(addDays(w, 6)) && new Date(c.endDate) > startOfStoreDay(w);
  const schedule = weekly.weeks.filter((w) => picks[w]).map((w) => ({ weekOf: w, challengeId: picks[w] }));
  const saved = value.schedule.filter((e) => weekly.weeks.includes(e.weekOf));
  const changed = JSON.stringify(schedule) !== JSON.stringify(saved);
  // making a new one for a week
  const [form, setForm] = useState({ weekOf: weekly.weeks[1] ?? weekly.weeks[0], kind: 'SPEND', target: '20', rewardPts: '200', minPurchase: '2', category: '', storeId: '', title: '', titleEs: '', description: '', descriptionEs: '' });
  const [making, setMaking] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const tNum = num(form.target), pNum = num(form.rewardPts);
  const suggested = form.kind === 'SPEND' ? `Spend $${Number.isFinite(tNum) ? tNum : '?'} this week, get ${Number.isFinite(pNum) ? pNum : '?'} pts` : `Make ${Number.isFinite(tNum) ? tNum : '?'} purchases this week, get ${Number.isFinite(pNum) ? pNum : '?'} pts`;
  const formBad = !(Number.isInteger(pNum) && pNum >= 1 && pNum <= 500) || (form.kind === 'SPEND' ? !(tNum >= 1 && tNum <= 500 && pNum / 100 < tNum) : !(Number.isInteger(tNum) && tNum >= 2 && tNum <= 12));
  const make = async () => {
    setMaking(true);
    try {
      await engagementApi.createWeekly({ ...form, target: tNum, rewardPts: pNum, minPurchase: num(form.minPurchase) || 0, category: form.category || null, storeId: form.storeId || null, title: form.title.trim() || suggested });
      toast.success('Made and put on its week.');
      qc.invalidateQueries({ queryKey: ['engagement-hq'] });
    } catch (e) { toast.error(serverMessage(e, 'Could not make it.')); }
    setMaking(false);
  };
  return (
    <>
      <div style={{ display: 'grid', gap: 8 }}>
        {weekly.weeks.map((w) => {
          const st = weekly.schedule.find((e) => e.weekOf === w);
          const options = weekly.candidates.filter((c) => runsDuring(c, w) || c.id === picks[w]);
          const chosen = weekly.candidates.find((c) => c.id === picks[w]);
          return (
            <div key={w} style={{ ...row, alignItems: 'center' }}>
              <label htmlFor={`wk-${w}`} style={{ width: 150, fontSize: FONT.small, fontWeight: 700, color: C.text }}>Week of {dayLabel(w)}{w === weekly.thisWeek ? ' (this week)' : ''}</label>
              <select id={`wk-${w}`} style={{ ...INPUT, flex: 1, minWidth: 220 }} value={picks[w] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [w]: e.target.value }))}>
                <option value="">Nothing featured</option>
                {options.map((c) => <option key={c.id} value={c.id}>{c.title}{c.store ? ` (${c.store})` : ''}</option>)}
              </select>
              {st && st.state !== 'OK' && st.challengeId === picks[w] && <span style={{ fontSize: FONT.small, color: C.danger }}>This challenge {STATE_NOTE[st.state] ?? st.state}.</span>}
              {chosen?.announced && <span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Already announced when it started.</span>}
              {chosen && chosen.audience !== 'EVERYONE' && <span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Only part of your customers can take part.</span>}
            </div>
          );
        })}
      </div>
      <div style={row}><Button variant="primary" disabled={!changed || busy} onClick={() => onSave(schedule)}>Save the weeks</Button></div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 700, color: C.text }}>Make a challenge for a week</div>
        <FieldRow>
          <Field label="Week" htmlFor="wkn-week"><select id="wkn-week" style={{ ...INPUT, width: 190 }} value={form.weekOf} onChange={(e) => set('weekOf')(e.target.value)}>{weekly.weeks.map((w) => <option key={w} value={w}>Week of {dayLabel(w)}{w === weekly.thisWeek ? ' (this week)' : ''}</option>)}</select></Field>
          <Field label="Kind" htmlFor="wkn-kind"><select id="wkn-kind" style={{ ...INPUT, width: 140 }} value={form.kind} onChange={(e) => set('kind')(e.target.value)}><option value="SPEND">Spend</option><option value="VISITS">Visits</option></select></Field>
          <Field label={form.kind === 'SPEND' ? 'Spend ($)' : 'Purchases'} htmlFor="wkn-target" hint={form.kind === 'SPEND' ? '$1 to $500' : '2 to 12'}><input id="wkn-target" style={smallInput} inputMode="decimal" value={form.target} onChange={(e) => set('target')(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} /></Field>
          <Field label="Reward (pts)" htmlFor="wkn-pts" hint={Number.isFinite(pNum) ? `${usd(pNum)}, 1 to 500` : '1 to 500'}><input id="wkn-pts" style={smallInput} inputMode="numeric" value={form.rewardPts} onChange={(e) => set('rewardPts')(whole(e.target.value))} /></Field>
          {form.kind === 'VISITS' && <Field label="Each at least ($)" htmlFor="wkn-min"><input id="wkn-min" style={smallInput} inputMode="decimal" value={form.minPurchase} onChange={(e) => set('minPurchase')(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} /></Field>}
          <Field label="On" htmlFor="wkn-cat"><select id="wkn-cat" style={{ ...INPUT, width: 150 }} value={form.category} onChange={(e) => set('category')(e.target.value)}>{CHALLENGE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
          <Field label="Where" htmlFor="wkn-store"><select id="wkn-store" style={{ ...INPUT, width: 170 }} value={form.storeId} onChange={(e) => set('storeId')(e.target.value)}><option value="">Every store</option>{stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</select></Field>
        </FieldRow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          <Field label="Title (English)" htmlFor="wkn-title" hint={`Blank: "${suggested}"`}><input id="wkn-title" style={INPUT} maxLength={100} value={form.title} onChange={(e) => set('title')(e.target.value)} /></Field>
          <Field label="Title (Spanish)" htmlFor="wkn-titleEs"><input id="wkn-titleEs" style={INPUT} maxLength={100} value={form.titleEs} onChange={(e) => set('titleEs')(e.target.value)} /></Field>
          <Field label="Description (English, optional)" htmlFor="wkn-desc"><input id="wkn-desc" style={INPUT} maxLength={500} value={form.description} onChange={(e) => set('description')(e.target.value)} /></Field>
          <Field label="Description (Spanish, optional)" htmlFor="wkn-descEs"><input id="wkn-descEs" style={INPUT} maxLength={500} value={form.descriptionEs} onChange={(e) => set('descriptionEs')(e.target.value)} /></Field>
        </div>
        <Notice>It runs from that Monday (or now, if the week has started) to Sunday night, pays each customer once, and is not pushed at midnight: the Monday push announces it when the smart nudges are on.</Notice>
        <div style={row}><Button variant="primary" disabled={formBad || making} onClick={make}>Make it and feature it</Button></div>
      </div>
    </>
  );
}

type FlashRow = { id: string; title: string; titleEs: string | null; body: string; link: string; audience: string; store: string | null; tier: string | null; startsAt: string; endsAt: string; announcedAt: string | null; sentCount: number; state: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED' };
const FLASH_LINKS: { key: string; label: string }[] = [{ key: 'OFFERS', label: 'The offers on Home' }, { key: 'HOT_FOOD', label: 'Hot Food' }, { key: 'REWARDS', label: 'Rewards' }, { key: 'GAS', label: 'Gas prices' }, { key: 'NONE', label: 'Nothing (just the message)' }];
const FLASH_STATE: Record<FlashRow['state'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = { LIVE: { label: 'Live', tone: 'success' }, SCHEDULED: { label: 'Scheduled', tone: 'warning' }, ENDED: { label: 'Ended', tone: 'neutral' }, CANCELLED: { label: 'Cancelled', tone: 'neutral' } };
const storeHourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' });
/** The instant a store day shows `hour` on the store clock (corrected on the nights the clocks change). */
const atStoreHour = (key: string, hour: number) => {
  let t = startOfStoreDay(key).getTime() + hour * 3_600_000;
  t += (hour - Number(storeHourFmt.format(new Date(t)))) * 3_600_000;
  return new Date(t);
};
const storeWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function FlashEditor({ value, stores, onSave, busy }: { value: Config['flashDeals']; stores: Hq['stores']; onSave: (v: { maxPerWeek: number }) => void; busy: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['engagement-flash'], queryFn: () => engagementApi.flashList().then((r) => r.data.data as { thisWeek: number; maxPerWeek: number; deals: FlashRow[] }) });
  const [max, setMax] = useState(String(value.maxPerWeek));
  useEffect(() => { setMax(String(value.maxPerWeek)); }, [value.maxPerWeek]);
  const today = storeToday();
  const [f, setF] = useState({ title: '', body: '', titleEs: '', bodyEs: '', link: 'OFFERS', audience: 'ALL', storeId: '', tier: 'GOLD', hours: '2', when: 'NOW', day: today, hour: '10' });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const [sending, setSending] = useState(false);
  const bad = !f.title.trim() || !f.body.trim() || f.title.length > 60 || f.titleEs.length > 60 || f.body.length > 160 || f.bodyEs.length > 160 || (f.audience === 'STORE' && !f.storeId);
  const send = async () => {
    if (!window.confirm(f.when === 'NOW' ? 'Send this flash deal now? It is pushed to the people you picked (outside quiet hours).' : 'Schedule this flash deal? It is pushed when it starts.')) return;
    setSending(true);
    try {
      await engagementApi.createFlash({ title: f.title, body: f.body, titleEs: f.titleEs, bodyEs: f.bodyEs, link: f.link, audience: f.audience, storeId: f.storeId || null, tier: f.tier, hours: Number(f.hours), ...(f.when === 'LATER' ? { startsAt: atStoreHour(f.day, Number(f.hour)).toISOString() } : {}) });
      toast.success(f.when === 'NOW' ? 'Sent.' : 'Scheduled.');
      setF((x) => ({ ...x, title: '', body: '', titleEs: '', bodyEs: '' }));
      qc.invalidateQueries({ queryKey: ['engagement-flash'] }); qc.invalidateQueries({ queryKey: ['engagement-hq'] });
    } catch (e) { toast.error(serverMessage(e, 'Could not send it.')); }
    setSending(false);
  };
  const end = async (r: FlashRow) => {
    if (!window.confirm(r.state === 'LIVE' ? `End "${r.title}" now? It leaves customers' Home right away.` : `Cancel "${r.title}"?`)) return;
    try { await engagementApi.endFlash(r.id); qc.invalidateQueries({ queryKey: ['engagement-flash'] }); } catch (e) { toast.error(serverMessage(e, 'Could not end it.')); }
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const m = num(max);
  return (
    <>
      <FieldRow>
        <Field label="At most this many a week" htmlFor="fl-max" hint="1 to 14"><input id="fl-max" style={smallInput} inputMode="numeric" value={max} onChange={(e) => setMax(whole(e.target.value))} /></Field>
        <FieldAction>
          <Button variant="secondary" disabled={!(Number.isInteger(m) && m >= 1 && m <= 14) || m === value.maxPerWeek || busy} onClick={() => onSave({ maxPerWeek: m })}>Save</Button>
          {list.data && <span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>This week: {list.data.thisWeek} of {list.data.maxPerWeek}</span>}
        </FieldAction>
      </FieldRow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <Field label="Title (English)" htmlFor="fl-title" after={`${f.title.length} of 60`}><input id="fl-title" style={INPUT} maxLength={60} value={f.title} onChange={(e) => set('title')(e.target.value)} placeholder="Double points on hot food" /></Field>
          <Field label="Message (English)" htmlFor="fl-body" after={`${f.body.length} of 160`}><textarea id="fl-body" style={{ ...INPUT, minHeight: 56, resize: 'vertical' }} maxLength={160} value={f.body} onChange={(e) => set('body')(e.target.value)} placeholder="Until 2 PM at every Lucky Stop." /></Field>
          <Field label="Title (Spanish, optional)" htmlFor="fl-titleEs" after={`${f.titleEs.length} of 60`}><input id="fl-titleEs" style={INPUT} maxLength={60} value={f.titleEs} onChange={(e) => set('titleEs')(e.target.value)} /></Field>
          <Field label="Message (Spanish, optional)" htmlFor="fl-bodyEs" after={`${f.bodyEs.length} of 160`}><textarea id="fl-bodyEs" style={{ ...INPUT, minHeight: 56, resize: 'vertical' }} maxLength={160} value={f.bodyEs} onChange={(e) => set('bodyEs')(e.target.value)} /></Field>
          <div style={row}>
            <Field label="A tap opens" htmlFor="fl-link"><select id="fl-link" style={{ ...INPUT, width: 200 }} value={f.link} onChange={(e) => set('link')(e.target.value)}>{FLASH_LINKS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select></Field>
            <Field label="Who" htmlFor="fl-aud"><select id="fl-aud" style={{ ...INPUT, width: 190 }} value={f.audience} onChange={(e) => set('audience')(e.target.value)}><option value="ALL">Every customer</option><option value="STORE">One store's customers</option><option value="TIER">A tier and above</option></select></Field>
            {f.audience === 'STORE' && <Field label="Store" htmlFor="fl-store"><select id="fl-store" style={{ ...INPUT, width: 170 }} value={f.storeId} onChange={(e) => set('storeId')(e.target.value)}><option value="">Pick a store</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
            {f.audience === 'TIER' && <Field label="Tier" htmlFor="fl-tier"><select id="fl-tier" style={{ ...INPUT, width: 140 }} value={f.tier} onChange={(e) => set('tier')(e.target.value)}>{['SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'].map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()} and above</option>)}</select></Field>}
          </div>
          <div style={row}>
            <Field label="Starts" htmlFor="fl-when"><select id="fl-when" style={{ ...INPUT, width: 130 }} value={f.when} onChange={(e) => set('when')(e.target.value)}><option value="NOW">Now</option><option value="LATER">Later</option></select></Field>
            {f.when === 'LATER' && <Field label="Day" htmlFor="fl-day"><select id="fl-day" style={{ ...INPUT, width: 150 }} value={f.day} onChange={(e) => set('day')(e.target.value)}>{days.map((dd, i) => <option key={dd} value={dd}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(dd)}</option>)}</select></Field>}
            {f.when === 'LATER' && <Field label="At (store time)" htmlFor="fl-hour"><select id="fl-hour" style={{ ...INPUT, width: 120 }} value={f.hour} onChange={(e) => set('hour')(e.target.value)}>{Array.from({ length: 18 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></Field>}
            <Field label="Lasts" htmlFor="fl-hours"><select id="fl-hours" style={{ ...INPUT, width: 120 }} value={f.hours} onChange={(e) => set('hours')(e.target.value)}>{Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}</select></Field>
          </div>
          <div style={row}><Button variant="primary" disabled={bad || sending} onClick={send}>{f.when === 'NOW' ? 'Send it now' : 'Schedule it'}</Button></div>
        </div>
        <div aria-label="Preview on a phone" style={{ borderRadius: 18, background: '#CC2936', color: '#fff', padding: 16, display: 'grid', gap: 6, maxWidth: 360 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#FFE8A3', fontSize: 12, fontWeight: 900, letterSpacing: 0.6 }}>⚡ FLASH DEAL</span><span style={{ background: '#FFE8A3', color: '#7A1220', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 900 }}>{f.hours} h 0 min left</span></div>
          <div style={{ fontSize: 19, fontWeight: 900 }}>{f.title || 'Your title'}</div>
          <div style={{ fontSize: 14, opacity: 0.92 }}>{f.body || 'Your message.'}</div>
          {f.link !== 'NONE' && <div style={{ fontSize: 14, fontWeight: 800 }}>See it ›</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, color: C.text }}>Recent flash deals</div>
        {list.isLoading && <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Loading...</div>}
        {list.data && list.data.deals.length === 0 && <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>None yet.</div>}
        {list.data?.deals.map((r) => (
          <div key={r.id} style={{ ...row, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
            <Badge tone={FLASH_STATE[r.state].tone}>{FLASH_STATE[r.state].label}</Badge>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, color: C.text }}>{r.title}</div>
              <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{storeWhen(r.startsAt)} to {storeWhen(r.endsAt)} · {r.audience === 'ALL' ? 'every customer' : r.audience === 'STORE' ? `${r.store ?? 'a store'}'s customers` : `${(r.tier ?? '').charAt(0)}${(r.tier ?? '').slice(1).toLowerCase()} and above`} · {r.announcedAt ? `pushed to ${r.sentCount}` : r.state === 'LIVE' ? 'push waiting for quiet hours to end' : 'not pushed'}</div>
            </div>
            {(r.state === 'LIVE' || r.state === 'SCHEDULED') && <Button size="sm" variant="secondary" onClick={() => end(r)}>{r.state === 'LIVE' ? 'End now' : 'Cancel'}</Button>}
          </div>
        ))}
      </div>
    </>
  );
}

function GamesEditor({ value, onSave, busy }: { value: Config['games']; onSave: (v: { game: GameKind; prizes: { pts: number; weight: number }[]; monthlyBudgetPts: number; endsOn: string | null }) => void; busy: boolean }) {
  const load = () => value.prizes.map((p) => ({ pts: String(p.pts), weight: String(p.weight) }));
  const [game, setGame] = useState<GameKind>(value.game);
  const [rows, setRows] = useState(load);
  const [budget, setBudget] = useState(String(value.monthlyBudgetPts));
  const [endsOn, setEndsOn] = useState(value.endsOn ?? '');
  useEffect(() => { setGame(value.game); setRows(load()); setBudget(String(value.monthlyBudgetPts)); setEndsOn(value.endsOn ?? ''); }, [JSON.stringify(value)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const prizes = rows.map((r) => ({ pts: num(r.pts), weight: num(r.weight) }));
  const rowBad = (p: { pts: number; weight: number }) => !(Number.isInteger(p.pts) && p.pts >= 0 && p.pts <= 500) || !(Number.isInteger(p.weight) && p.weight >= 1 && p.weight <= 10000);
  const b = num(budget);
  const total = prizes.reduce((t, p) => t + (rowBad(p) ? 0 : p.weight), 0);
  const top = Math.max(0, ...prizes.map((p) => (rowBad(p) ? 0 : p.pts)));
  const avg = total > 0 ? prizes.reduce((t, p) => t + (rowBad(p) ? 0 : p.pts * p.weight), 0) / total : 0;
  const bad = rows.length < 2 || rows.length > 8 || prizes.some(rowBad) || !(Number.isInteger(b) && b >= 0 && b <= 200000);
  const next = { game, prizes, monthlyBudgetPts: b, endsOn: endsOn || null };
  const changed = JSON.stringify(next) !== JSON.stringify({ game: value.game, prizes: value.prizes, monthlyBudgetPts: value.monthlyBudgetPts, endsOn: value.endsOn });
  const set = (i: number, k: 'pts' | 'weight', v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: whole(v) } : r)));
  const pct = (w: number) => (total > 0 ? `${((w / total) * 100).toFixed(w / total < 0.01 ? 2 : 1)}%` : '...');
  return (
    <>
      <FieldRow>
        <Field label="The game" htmlFor="gm-game"><select id="gm-game" style={{ ...INPUT, width: 190 }} value={game} onChange={(e) => setGame(e.target.value as GameKind)}>{(Object.keys(GAME_NAMES) as GameKind[]).map((k) => <option key={k} value={k}>{GAME_NAMES[k]}</option>)}</select></Field>
        <Field label="Monthly budget (pts)" htmlFor="gm-budget" hint={Number.isFinite(b) ? `${usd(b)} a month, a hard cap` : '0 to 200000'}><input id="gm-budget" style={smallInput} inputMode="numeric" value={budget} onChange={(e) => setBudget(whole(e.target.value))} /></Field>
        <Field label="Last day (optional)" htmlFor="gm-end"><input id="gm-end" type="date" style={{ ...INPUT, width: 170 }} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
      </FieldRow>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700, color: C.text }}>Prizes and their chances</div>
        {rows.map((r, i) => (
          <div key={i} style={{ ...row, alignItems: 'center' }}>
            <input aria-label={`Prize ${i + 1} points`} id={`gm-pts-${i}`} style={{ ...INPUT, width: 90 }} inputMode="numeric" value={r.pts} onChange={(e) => set(i, 'pts', e.target.value)} />
            <span style={{ fontSize: FONT.small, color: TEXT_MUTED, width: 64 }}>{num(r.pts) === 0 ? 'no prize' : 'pts'}</span>
            <input aria-label={`Prize ${i + 1} weight`} id={`gm-w-${i}`} style={{ ...INPUT, width: 90 }} inputMode="numeric" value={r.weight} onChange={(e) => set(i, 'weight', e.target.value)} />
            <span style={{ fontSize: FONT.small, color: TEXT_MUTED, width: 70 }} id={`gm-pct-${i}`}>{rowBad(prizes[i]) ? 'check it' : pct(prizes[i].weight)}</span>
            <Button size="sm" variant="secondary" disabled={rows.length <= 2} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <div style={row}><Button size="sm" variant="secondary" disabled={rows.length >= 8} onClick={() => setRows((rs) => [...rs, { pts: '0', weight: '100' }])}>Add a prize</Button>
          <span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Points 0 to 500 (0 means no prize this time). The weight is how likely: its share of all the weights.</span></div>
      </div>
      <div style={{ fontSize: FONT.small, color: C.text }} id="gm-cost">On average a play pays {avg.toFixed(2)} pts ({usd(avg)}), so every 1,000 plays cost about {usd(avg * 1000)}. Top prize {top} pts ({usd(top)}).</div>
      {Number.isFinite(b) && b < top && <Notice tone="danger">The budget is smaller than the top prize, so the game would stay closed. Raise the budget or lower the top prize.</Notice>}
      <Notice>No purchase is ever needed: every customer gets one free play a day with the same odds, whether they buy or not. The server draws the result when they play, and the game closes for the month as soon as what is left could not pay the top prize, so a won prize is always paid. The app shows the official rules with these numbers (Lucky Stop as the sponsor, the odds and prizes, the dates, and that Apple and Google are not sponsors). Have a lawyer review them before you switch it on.</Notice>
      <div style={row}><Button variant="primary" disabled={bad || !changed || busy} onClick={() => onSave(next)}>Save</Button></div>
    </>
  );
}

function MascotEditor({ value, onSave, busy }: { value: Config['mascot']; onSave: (v: Omit<Config['mascot'], 'enabled'>) => void; busy: boolean }) {
  const [name, setName] = useState(value.name);
  const [home, setHome] = useState(value.homeCard);
  const [empty, setEmpty] = useState(value.emptyStates);
  const [voice, setVoice] = useState(value.pushVoice);
  useEffect(() => { setName(value.name); setHome(value.homeCard); setEmpty(value.emptyStates); setVoice(value.pushVoice); }, [value.name, value.homeCard, value.emptyStates, value.pushVoice]);
  const n = name.trim().replace(/\s+/g, ' ');
  const who = n || 'Cuatro';
  const changed = n !== value.name || home !== value.homeCard || empty !== value.emptyStates || voice !== value.pushVoice;
  const box = (id: string, on: boolean, set: (v: boolean) => void, label: string, hint: string) => (
    <label htmlFor={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', color: C.text }}>
      <input id={id} type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} style={{ marginTop: 3 }} />
      <span><strong>{label}</strong><br /><span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{hint}</span></span>
    </label>
  );
  return (
    <>
      <Field label="The mascot's name" htmlFor="ma-name" hint="The app shows it everywhere, with no new app version." after={`${Array.from(n).length} of 20`}>
        <input id="ma-name" style={{ ...INPUT, width: 220 }} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {box('ma-home', home, setHome, 'A tip on Home', `"${who} says": a reward that is ready, one nearly there, or an everyday tip (show your code, order hot food, invite a friend, tiers, the leaderboard). A customer can hide it until the next day.`)}
      {box('ma-empty', empty, setEmpty, 'Empty screens', `${who} in place of the plain icon when a customer's history, alerts, chat or ads are empty.`)}
      {box('ma-voice', voice, setVoice, 'Signs the automated pushes', `The smart nudges, the welcome series, the birthday push and the challenge of the week start with "${who}: ". Pushes about a sale, an order or an alert the customer set up never do.`)}
      <div style={row}><Button variant="primary" disabled={!n || !changed || busy} onClick={() => onSave({ name: n, homeCard: home, emptyStates: empty, pushVoice: voice })}>Save</Button></div>
    </>
  );
}

function FriendsEditor({ value, onSave, busy }: { value: Config['friendsBoard']; onSave: (v: Omit<Config['friendsBoard'], 'enabled'>) => void; busy: boolean }) {
  const [metric, setMetric] = useState(value.metric);
  const [period, setPeriod] = useState(value.period);
  const [min, setMin] = useState(String(value.minMembers));
  const [rows, setRows] = useState(String(value.maxRows));
  useEffect(() => { setMetric(value.metric); setPeriod(value.period); setMin(String(value.minMembers)); setRows(String(value.maxRows)); }, [value.metric, value.period, value.minMembers, value.maxRows]);
  const mn = num(min), rn = num(rows);
  const bad = !(Number.isInteger(mn) && mn >= 3 && mn <= 20) || !(Number.isInteger(rn) && rn >= 5 && rn <= 50);
  const changed = metric !== value.metric || period !== value.period || mn !== value.minMembers || rn !== value.maxRows;
  return (
    <>
      <FieldRow>
        <Field label="Rank by" htmlFor="fr-metric"><select id="fr-metric" style={{ ...INPUT, width: 210 }} value={metric} onChange={(e) => setMetric(e.target.value as 'VISITS' | 'POINTS')}><option value="VISITS">Days with a purchase</option><option value="POINTS">Points from purchases</option></select></Field>
        <Field label="Over" htmlFor="fr-period"><select id="fr-period" style={{ ...INPUT, width: 150 }} value={period} onChange={(e) => setPeriod(e.target.value as 'WEEK' | 'MONTH')}><option value="WEEK">A week</option><option value="MONTH">A month</option></select></Field>
        <Field label="Opens when this many joined" htmlFor="fr-min" hint="3 to 20, the inviter counts"><input id="fr-min" style={smallInput} inputMode="numeric" value={min} onChange={(e) => setMin(whole(e.target.value))} /></Field>
        <Field label="Rows shown" htmlFor="fr-rows" hint="5 to 50"><input id="fr-rows" style={smallInput} inputMode="numeric" value={rows} onChange={(e) => setRows(whole(e.target.value))} /></Field>
      </FieldRow>
      <Notice>Days with a purchase counts each store day once, however many sales; points count only what purchases earned, never bonuses. Customers see this week and last week (or month). The board shows a rank, a name or 'A friend' and that number: never a phone, a store, a time or money. Closed, restricted, staff and test accounts never show. Before you switch it on, add it to the privacy policy: friends in a circle see each other's first name and last initial and how often they buy.</Notice>
      <div style={row}><Button variant="primary" disabled={bad || !changed || busy} onClick={() => onSave({ metric, period, minMembers: mn, maxRows: rn })}>Save</Button></div>
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
      <Field label="The message people send (the app link follows it)" htmlFor="sh-msg" after={`${m.length} of 140`}>
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
      <Trigger label="This week's challenge" sent={sent.weeklyChallenge} on={v.weeklyChallenge.enabled} setOn={(on) => setV({ ...v, weeklyChallenge: { enabled: on } })} blurb="Mondays from 9 AM to 2 PM, once a week, to customers who can take part and have not finished it. Needs Challenge of the week on." />
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
      <FieldRow>
        <Field label="Title" htmlFor="gl-title"><input id="gl-title" style={{ ...INPUT, width: 260 }} maxLength={80} value={f.title} placeholder="Hit 200 sales this week" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Store" htmlFor="gl-store"><select id="gl-store" style={{ ...INPUT, width: 200 }} value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })}><option value="">Every store (each on its own)</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Count" htmlFor="gl-metric"><select id="gl-metric" style={{ ...INPUT, width: 190 }} value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}><option value="SALES">Sales (purchases)</option><option value="CUSTOMERS">Different customers</option></select></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Target" htmlFor="gl-target"><input id="gl-target" style={smallInput} inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: whole(e.target.value) })} /></Field>
        <Field label="Reward for each customer (pts)" htmlFor="gl-rew" hint={Number.isFinite(reward) ? usd(reward) : ''}><input id="gl-rew" style={smallInput} inputMode="numeric" value={f.rewardPoints} onChange={(e) => setF({ ...f, rewardPoints: whole(e.target.value) })} /></Field>
        <Field label="Starts" htmlFor="gl-start"><input id="gl-start" type="datetime-local" style={{ ...INPUT, width: 200 }} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="Ends" htmlFor="gl-end"><input id="gl-end" type="datetime-local" style={{ ...INPUT, width: 200 }} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
      </FieldRow>
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
      <FieldRow>
        <Field label="Name" htmlFor="pc-title"><input id="pc-title" style={{ ...INPUT, width: 240 }} maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Counts" htmlFor="pc-cat"><select id="pc-cat" style={{ ...INPUT, width: 170 }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Stamps to fill (2 to 12)" htmlFor="pc-stamps"><input id="pc-stamps" style={smallInput} inputMode="numeric" value={f.stamps} onChange={(e) => setF({ ...f, stamps: whole(e.target.value) })} /></Field>
        <Field label="A purchase counts from ($)" htmlFor="pc-min"><input id="pc-min" style={smallInput} inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
        <Field label="Reward (pts)" htmlFor="pc-pts" hint={Number(f.pts) ? usd(Number(f.pts)) : ''}><input id="pc-pts" style={smallInput} inputMode="numeric" value={f.pts} onChange={(e) => setF({ ...f, pts: whole(e.target.value) })} /></Field>
      </FieldRow>
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
  const [ends, setEnds] = useState(() => addDays(storeToday(), 14));   // a store date, two weeks out
  const make = useMutation({
    mutationFn: (k: (typeof KIT)[number]) => challengesApi.create({
      kind: k.kind, title: k.title, category: k.category, target: k.target, reward: k.pts / 100, repeats: false, minPurchase: k.kind === 'VISITS' ? 2 : undefined,
      startDate: new Date().toISOString(), endDate: endOfStoreDay(ends).toISOString(),   // the end of that day at the stores
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
