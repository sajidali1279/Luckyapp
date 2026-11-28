// Cuatro, the mascot (HQ, 2026-11-27): his own page, moved out of Engagement at the owner's request so he is easy to find and has room
// to grow. Tabs: how he shows up in the app, what he says (HQ's own lines), and the app's seasonal look. A new tab is one entry in TABS.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, PageHeader, Card, Badge, Tabs, Button, Field, Notice } from '../components/kit';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import AppThemeSettings from '../components/AppThemeSettings';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { useEngagementHq, MascotEditor, LinesEditor, Switch, type Config } from './Engagement';
import cuatroWave from '../assets/cuatro-wave.png';

type Tab = 'shows' | 'says' | 'moments' | 'look';
const TABS: { value: Tab; label: string }[] = [
  { value: 'shows', label: 'How he shows up' },
  { value: 'says', label: 'What he says' },
  { value: 'moments', label: 'Moments' },
  { value: 'look', label: 'App look' },
];

export default function Cuatro() {
  const { q, save } = useEngagementHq();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = TABS.find((t) => t.value === asked)?.value ?? 'shows';

  if (q.isLoading) return <Page><PageHeader title="Cuatro" description="The mascot in the app." /><CardSkeleton count={2} /></Page>;
  if (q.isError || !q.data) return <Page><PageHeader title="Cuatro" description="The mascot in the app." /><ErrorState onRetry={() => q.refetch()} /></Page>;
  const m = q.data.config.mascot;
  const who = m.name || 'Cuatro';
  const lines = m.lines ?? [];
  const showing = [m.guide !== false && 'on-screen guide', m.homeCard && 'a tip on Home', m.emptyStates && 'empty screens', m.pushVoice && 'signs the automated pushes'].filter(Boolean) as string[];

  return (
    <Page>
      <PageHeader title={who} description={`Lucky Stop's clover mascot in the app: where ${who} shows up, what he says, and the app's seasonal look. It costs nothing.`} />

      <Card padding={18} style={{ marginBottom: 16, maxWidth: 940 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <img src={cuatroWave} alt="" width={84} height={83} style={{ flex: 'none' }} />
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>{who} in the app</div>
              <Badge tone={m.enabled ? 'success' : 'neutral'}>{m.enabled ? 'On' : 'Off'}</Badge>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: FONT.small, color: TEXT_MUTED }}>
              {m.enabled
                ? (showing.length ? `Showing: ${showing.join(', ')}.` : 'On, but nothing is picked: choose below where he shows up.')
                : `Off: customers do not see ${who} anywhere. Switch him on when you are ready.`}
              {' '}{lines.filter((l) => l.on).length} of {lines.length} of your own lines switched on.
            </p>
          </div>
          <Switch on={m.enabled} onChange={(v) => save.mutate({ mascot: { enabled: v } })} label={`${who}: ${m.enabled ? 'on' : 'off'}`} disabled={save.isPending} />
        </div>
      </Card>

      <Tabs ariaLabel={`${who} settings`} value={tab} onChange={(v) => setParams({ tab: v as Tab }, { replace: true })} tabs={TABS} />

      <div style={{ maxWidth: 940, display: 'grid', gap: 14 }}>
        {tab === 'shows' && (
          <Card padding={18}>
            <div style={{ display: 'grid', gap: 12 }}>
              <MascotEditor value={m} onSave={(v) => save.mutate({ mascot: v })} busy={save.isPending} />
            </div>
          </Card>
        )}
        {tab === 'says' && (
          <Card padding={18}>
            <div style={{ display: 'grid', gap: 12 }}>
              <LinesEditor value={lines} who={who} guideOn={m.guide !== false} onSave={(v) => save.mutate({ mascot: { lines: v } })} busy={save.isPending} />
            </div>
          </Card>
        )}
        {tab === 'moments' && (
          <Card padding={18}>
            <MomentsEditor value={m} who={who} onSave={(v) => save.mutate({ mascot: v })} busy={save.isPending} />
          </Card>
        )}
        {tab === 'look' && <AppThemeSettings />}
      </div>
    </Page>
  );
}

const WB_DEFAULT = { enabled: true, hello: 3, hug: 7, tears: 21 };
const DAYS_MAX = 120, PITCH_MAX = 60;
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 3);

/** Moments (2026-11-27, the owner): his "I missed you" when a customer comes back after days away, and how often he asks local business
 *  owners to promote their business in the app. The server keeps the days in order and in range too. */
function MomentsEditor({ value, who, onSave, busy }: { value: Config['mascot']; who: string; onSave: (v: Partial<Config['mascot']>) => void; busy: boolean }) {
  const saved = value.welcomeBack ?? WB_DEFAULT;
  const savedPitch = value.pitchEveryDays ?? 3;
  const [on, setOn] = useState(saved.enabled);
  const [hello, setHello] = useState(String(saved.hello));
  const [hug, setHug] = useState(String(saved.hug));
  const [tears, setTears] = useState(String(saved.tears));
  const [pitch, setPitch] = useState(String(savedPitch));
  useEffect(() => { setOn(saved.enabled); setHello(String(saved.hello)); setHug(String(saved.hug)); setTears(String(saved.tears)); setPitch(String(savedPitch)); },
    [saved.enabled, saved.hello, saved.hug, saved.tears, savedPitch]);   // eslint-disable-line react-hooks/exhaustive-deps
  const h = Number(hello), g = Number(hug), t = Number(tears), p = Number(pitch);
  const inRange = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  const problem = !inRange(h, DAYS_MAX) || !inRange(g, DAYS_MAX) || !inRange(t, DAYS_MAX) ? `Each number of days must be from 1 to ${DAYS_MAX}.`
    : !(h < g && g < t) ? 'Each step must start later than the one before it (for example 3, 7 and 21 days).'
    : !inRange(p, PITCH_MAX) ? `The business ask can be every 1 to ${PITCH_MAX} days.` : null;
  const changed = on !== saved.enabled || h !== saved.hello || g !== saved.hug || t !== saved.tears || p !== savedPitch;
  const box = { ...INPUT, width: 90 };
  const step = (title: string, words: string) => (
    <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}><strong style={{ color: C.text }}>{title}</strong> {words}</div>
  );
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>"I missed you"</div>
        <p style={{ margin: '4px 0 10px', fontSize: FONT.small, color: TEXT_MUTED }}>
          When a customer opens the app after some days away, {who} greets them with real feeling, then shows what is new (offers, points
          waiting). Counted from the last time they opened the app on that phone. Costs nothing.
        </p>
        <label htmlFor="wb-on" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', color: C.text, fontWeight: 600 }}>
          <input id="wb-on" type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Greet customers who come back
        </label>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', opacity: on ? 1 : 0.6 }}>
        <Field label="A short hello after" htmlFor="wb-hello" hint="days away">
          <input id="wb-hello" style={box} inputMode="numeric" value={hello} disabled={!on} onChange={(e) => setHello(digits(e.target.value))} />
        </Field>
        <Field label="A big hug after" htmlFor="wb-hug" hint="days away">
          <input id="wb-hug" style={box} inputMode="numeric" value={hug} disabled={!on} onChange={(e) => setHug(digits(e.target.value))} />
        </Field>
        <Field label="Happy tears after" htmlFor="wb-tears" hint="days away">
          <input id="wb-tears" style={box} inputMode="numeric" value={tears} disabled={!on} onChange={(e) => setTears(digits(e.target.value))} />
        </Field>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {step('Short hello:', 'he jumps for joy: "Hey, you\'re back!"')}
        {step('Big hug:', 'he runs in, hugs, heart eyes and hearts: "I missed you!"')}
        {step('Happy tears:', 'tears of joy and a long hug: "I missed you SO much! Don\'t stay away that long again!"')}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>Promote your business</div>
        <p style={{ margin: '4px 0 10px', fontSize: FONT.small, color: TEXT_MUTED }}>
          How often {who} tells customers who own a local business that they can promote it in the app, holding a "Your business here" sign
          or calling it out. His button opens Local businesses, where they ask to be featured.
        </p>
        <Field label="Ask once every" htmlFor="wb-pitch" hint="days (per customer)">
          <input id="wb-pitch" style={box} inputMode="numeric" value={pitch} onChange={(e) => setPitch(digits(e.target.value))} />
        </Field>
      </div>

      {problem && <Notice tone="warning">{problem}</Notice>}
      <div><Button variant="primary" disabled={!changed || !!problem || busy} onClick={() => onSave({ welcomeBack: { enabled: on, hello: h, hug: g, tears: t }, pitchEveryDays: p })}>Save</Button></div>
      <p style={{ margin: 0, fontSize: FONT.small, color: TEXT_MUTED }}>Customers see it once they have the app version with these moments (the next app update).</p>
    </div>
  );
}
