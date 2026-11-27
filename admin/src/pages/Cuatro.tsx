// Cuatro, the mascot (HQ, 2026-11-27): his own page, moved out of Engagement at the owner's request so he is easy to find and has room
// to grow. Tabs: how he shows up in the app, what he says (HQ's own lines), and the app's seasonal look. A new tab is one entry in TABS.
import { useSearchParams } from 'react-router-dom';
import { Page, PageHeader, Card, Badge, Tabs } from '../components/kit';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import AppThemeSettings from '../components/AppThemeSettings';
import { C, FONT, TEXT_MUTED } from '../lib/theme';
import { useEngagementHq, MascotEditor, LinesEditor, Switch } from './Engagement';
import cuatroWave from '../assets/cuatro-wave.png';

type Tab = 'shows' | 'says' | 'look';
const TABS: { value: Tab; label: string }[] = [
  { value: 'shows', label: 'How he shows up' },
  { value: 'says', label: 'What he says' },
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
        {tab === 'look' && <AppThemeSettings />}
      </div>
    </Page>
  );
}
