// Settings > App > Seasonal theme (2026-10-21): HQ picks a theme for the phone app (Halloween; Thanksgiving, Christmas and Game day from
// 2026-10-25), the dates it runs, and
// whether its opening animation and its drifting background shapes are on. Phones pick it up the next time they ask (within a few
// minutes) and it goes back to normal by itself the day after the end date, so a holiday never needs a new app build.
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { settingsApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Button, Card, Badge, Field, Notice } from './kit';
import { useSettings, LastChanged } from './SettingsCards';
import { useDraft, useUnsaved } from '../lib/unsaved';

type Preset = 'NONE' | 'HALLOWEEN' | 'THANKSGIVING' | 'CHRISTMAS' | 'GAME_DAY';
interface Theme { preset: Preset; startsOn: string | null; endsOn: string | null; intro: boolean; background: boolean; presets: string[]; active: { preset: Preset; today: string; until: string | null } }
// What the boxes hold: a date not set is an empty box
type Form = { preset: Preset; startsOn: string; endsOn: string; intro: boolean; background: boolean };
const NO_THEME: Form = { preset: 'NONE', startsOn: '', endsOn: '', intro: true, background: true };

const LOOKS: { value: Preset; emoji: string; name: string; says: string }[] = [
  { value: 'NONE', emoji: '🏪', name: 'Normal', says: 'The usual Lucky Stop look.' },
  { value: 'HALLOWEEN', emoji: '🎃', name: 'Halloween', says: "A laughing jack-o'-lantern opens its mouth and the dashboard pops out of it. Bats, ghosts and spiders drift behind the dashboards." },
  { value: 'THANKSGIVING', emoji: '🦃', name: 'Thanksgiving', says: 'A turkey fans out its tail, gobbles, and the dashboard comes out of a burst of autumn colours. Falling leaves, an acorn, wheat, a pie and a pumpkin drift behind the dashboards.' },
  { value: 'CHRISTMAS', emoji: '🎄', name: 'Christmas', says: 'A gift box drops into the snow, shakes, pops its lid, and the dashboard comes out of the light inside. Snowflakes, a star, a tree, an ornament, a candy cane and a gift drift behind the dashboards.' },
  { value: 'GAME_DAY', emoji: '🏈', name: 'Game day', says: 'For Super Bowl weekend (the app never shows that name: it belongs to the NFL). A field goal sails through the posts, confetti flies and the dashboard pops out. Footballs, a helmet, goal posts and a trophy drift behind the dashboards.' },
];

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function AppThemeSettings() {
  const qc = useQueryClient();
  const q = useSettings();
  const saved = q.data?.data?.data?.theme as Theme | undefined;
  const savedForm = useMemo<Form>(() => (saved
    ? { preset: saved.preset, startsOn: saved.startsOn ?? '', endsOn: saved.endsOn ?? '', intro: saved.intro, background: saved.background }
    : NO_THEME), [saved]);
  const draft = useDraft(savedForm);
  const { preset, startsOn, endsOn, intro, background } = draft.form;
  const changed = !!saved && (preset !== saved.preset || (startsOn || null) !== saved.startsOn || (endsOn || null) !== saved.endsOn || intro !== saved.intro || background !== saved.background);
  useUnsaved('theme', changed);

  const save = useMutation({
    mutationFn: (f: Form) => settingsApi.saveTheme({ preset: f.preset, startsOn: f.startsOn || null, endsOn: f.endsOn || null, intro: f.intro, background: f.background }),
    onSuccess: async (_d, f) => {
      toast.success('Saved. Phones pick it up within a few minutes.');
      qc.invalidateQueries({ queryKey: ['settings-history'] });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      draft.settle(f);
    },
    onError: (e) => toast.error(serverMessage(e, 'Could not save.')),
  });

  if (q.isLoading) return <Card padding={18}><div style={{ color: TEXT_MUTED }}>Loading…</div></Card>;
  if (q.isError || !saved) return <Card padding={18}><Notice tone="danger">Could not load the theme settings.</Notice></Card>;

  const datesOk = !startsOn || !endsOn || endsOn >= startsOn;
  const today = saved.active.today;
  // What phones show today, in words (from what is saved, not from what is being typed)
  const state = saved.active.preset !== 'NONE'
    ? { tone: 'success' as const, text: `${LOOKS.find((l) => l.value === saved.active.preset)?.name} is on now${saved.active.until ? `, until ${day(saved.active.until)}` : ', until you switch it off'}` }
    : saved.preset !== 'NONE' && saved.startsOn && today < saved.startsOn
      ? { tone: 'neutral' as const, text: `${LOOKS.find((l) => l.value === saved.preset)?.name} starts ${day(saved.startsOn)}` }
      : saved.preset !== 'NONE'
        ? { tone: 'neutral' as const, text: `${LOOKS.find((l) => l.value === saved.preset)?.name} has ended` }
        : { tone: 'neutral' as const, text: 'Normal look' };

  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>Seasonal theme</div>
        <Badge tone={state.tone}>{state.text}</Badge>
      </div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px' }}>
        Dress the phone app for a holiday. Pick a look and the days it runs: it switches on and off by itself, with no new app version. Offer pictures are separate: change those on the Offers page.
      </p>

      <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {LOOKS.filter((l) => l.value === 'NONE' || saved.presets.includes(l.value)).map((l) => {
          const on = preset === l.value;
          return (
            <button key={l.value} type="button" role="radio" aria-checked={on} onClick={() => draft.set('preset', l.value)}
              style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: on ? '#fff7ed' : '#fff', border: `2px solid ${on ? C.primary : C.border}` }}>
              <span style={{ fontSize: 28 }}>{l.emoji}</span>
              <span>
                <span style={{ display: 'block', fontWeight: 700, color: C.text }}>{l.name}</span>
                <span style={{ display: 'block', fontSize: FONT.small, color: TEXT_MUTED }}>{l.says}</span>
              </span>
            </button>
          );
        })}
      </div>

      {preset !== 'NONE' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Field label="Starts (optional)" htmlFor="th-start">
              <input id="th-start" type="date" style={{ ...INPUT, maxWidth: 190 }} value={startsOn} onChange={(e) => draft.set('startsOn', e.target.value)} />
            </Field>
            <Field label="Ends (optional)" htmlFor="th-end">
              <input id="th-end" type="date" style={{ ...INPUT, maxWidth: 190 }} value={endsOn} min={startsOn || undefined} onChange={(e) => draft.set('endsOn', e.target.value)} />
            </Field>
          </div>
          <div style={{ fontSize: FONT.small, color: TEXT_MUTED, marginTop: -6 }}>
            No start date means it starts as soon as you save. No end date means it stays until you pick Normal. With an end date it goes back to normal by itself the day after. Days are store days (Central time).
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', color: C.text }}>
            <input type="checkbox" checked={intro} onChange={(e) => draft.set('intro', e.target.checked)} style={{ marginTop: 3 }} />
            <span><strong>Opening animation</strong><br /><span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Plays over the customer's Home the first time they open the app each day (about 4 seconds, tap to skip). Skipped for people who turned motion off on their phone.</span></span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', color: C.text }}>
            <input type="checkbox" checked={background} onChange={(e) => draft.set('background', e.target.checked)} style={{ marginTop: 3 }} />
            <span><strong>Shapes behind the dashboards</strong><br /><span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>The small drifting shapes on the customer, employee and manager home screens.</span></span>
          </label>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="primary" disabled={!changed || !datesOk || save.isPending} onClick={() => save.mutate(draft.form)}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        {changed && <Button variant="secondary" disabled={save.isPending} onClick={draft.reset}>Undo changes</Button>}
        {!datesOk && <span style={{ fontSize: FONT.small, color: C.danger }}>The end date cannot be before the start date.</span>}
      </div>
      <LastChanged actions={['SETTINGS_THEME_UPDATE']} />
    </Card>
  );
}
