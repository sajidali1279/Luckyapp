// The Settings page's own cards (2026-10-12): a group of rules (drawn from the server's list: words, range, value), the feature switches,
// the business details the app shows, the history of every settings change, and the "Last changed" line every card carries.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { settingsApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDay, storeTime } from '../lib/storeDates';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Button, Card, Badge, EmptyState, Field, Notice, Chip } from './kit';
import ConfirmModal from './ConfirmModal';
import { useUnsaved } from '../lib/unsaved';

export type RuleGroup = 'hotFood' | 'review' | 'receipts' | 'offers' | 'perks' | 'care' | 'staff';
type Rule = { key: string; group: RuleGroup; label: string; help: string; unit: string; def: number; min: number; max: number; int: boolean; value: number; section?: string };
type Feature = { key: string; label: string; help: string; on: boolean };
type HistoryRow = { id: string; area: string; action: string; by: string; at: string; summary: string; keys: string[] };

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.get(), staleTime: 30_000 });
}
/** The numbers HQ set that a page's words repeat (GET /settings/app, any signed-in user): today's defaults until it loads or on an older
 *  server, so a sentence never shows an empty number. */
export const LIMIT_DEFAULTS = { refillSilverPerPeriod: 7, refillDailyPerDay: 1, rewardHoldMinutes: 30, productRequestDays: 7, referralLateDays: 7, disputeMaxDays: 60, audienceRecentMonths: 6, goodwillCreditMax: 25, disputeCreditMax: 50 };
export function useLimits(): typeof LIMIT_DEFAULTS {
  const q = useQuery({ queryKey: ['settings-app'], queryFn: () => settingsApi.app(), staleTime: 5 * 60_000 });
  return { ...LIMIT_DEFAULTS, ...(q.data?.data?.data?.limits ?? {}) };
}
export function useSettingsHistory() {
  return useQuery({ queryKey: ['settings-history'], queryFn: () => settingsApi.history(100), staleTime: 30_000 });
}
const rowsOf = (q: ReturnType<typeof useSettingsHistory>): HistoryRow[] => (Array.isArray(q.data?.data?.data) ? q.data!.data.data : []);

/** "Last changed by Sam on Oct 12, 3:04 PM": the latest history entry for these actions (and, for rules, these keys). */
export function LastChanged({ actions, keys }: { actions: string[]; keys?: string[] }) {
  const q = useSettingsHistory();
  const last = rowsOf(q).find((r) => actions.includes(r.action) && (!keys || r.keys.some((k) => keys.includes(k))));
  if (!last) return null;
  return (
    <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 10 }} title={last.summary}>
      Last changed by {last.by} on {storeDay(last.at)}, {storeTime(last.at)}
    </div>
  );
}

// "1 minute", "2 minutes", "$20,000", "$2.50"
const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
export const fmtRule = (r: Pick<Rule, 'unit'>, v: number) => (r.unit === '$' ? money(v) : `${v.toLocaleString('en-US')} ${v === 1 && r.unit.endsWith('s') ? r.unit.slice(0, -1) : r.unit}`);
const fmt = fmtRule;

/** One group of rules: a field each, with its default and range, Save sends only what changed. A long group is split under headings
 *  (the rule's section), a changed field is marked with what it was, and unsaved edits are reported to the page (lib/unsaved). */
export function RulesCard({ group, title, intro }: { group: RuleGroup; title: string; intro?: string }) {
  const qc = useQueryClient();
  const q = useSettings();
  const rules: Rule[] = useMemo(() => (Array.isArray(q.data?.data?.data?.rules) ? q.data!.data.data.rules : []).filter((r: Rule) => r.group === group), [q.data, group]);
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => { setForm(Object.fromEntries(rules.map((r) => [r.key, String(r.value)]))); }, [rules]);
  const edited = (r: Rule) => form[r.key] !== undefined && form[r.key].trim() !== String(r.value);
  const changed = rules.filter((r) => form[r.key] !== undefined && form[r.key].trim() !== '' && Number(form[r.key]) !== r.value);
  useUnsaved(`rules-${group}`, rules.some(edited));
  const wrong = rules.find((r) => {
    const v = form[r.key];
    if (v === undefined) return false;
    const n = Number(v);
    return v.trim() === '' || !Number.isFinite(n) || n < r.min || n > r.max || (r.int && !Number.isInteger(n));
  });
  const save = useMutation({
    mutationFn: () => settingsApi.saveRules(Object.fromEntries(changed.map((r) => [r.key, Number(form[r.key])]))),
    onSuccess: () => { toast.success('Saved. It applies within a minute everywhere.'); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['settings-history'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save.')),
  });
  const sections = [...new Set(rules.map((r) => r.section ?? ''))];

  const field = (r: Rule) => {
    const id = `rule-${r.key}`;
    const n = Number(form[r.key]);
    const isEdited = edited(r);
    const atDefault = n === r.def;
    return (
      <Field key={r.key} label={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{r.label}
          {!isEdited && r.value !== r.def && <Badge tone="info" title={`The default is ${fmt(r, r.def)}`}>Changed from default</Badge>}
          {isEdited && <Badge tone="warning">Not saved · was {fmt(r, r.value)}</Badge>}</span>}
        htmlFor={id}
        hint={<>{r.help}<br /><span style={{ color: C.text2 }}>Default {fmt(r, r.def)} · allowed {fmt(r, r.min)} to {fmt(r, r.max)}</span></>}>
        <div id={`${id}-row`} data-setting={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8 }}>
          {r.unit === '$' && <span style={{ color: TEXT_MUTED }}>$</span>}
          <input id={id} style={{ ...INPUT, maxWidth: 140, ...(isEdited ? { borderColor: C.warning ?? '#b45309', boxShadow: '0 0 0 2px #fde68a' } : {}) }}
            inputMode={r.int ? 'numeric' : 'decimal'} value={form[r.key] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, [r.key]: e.target.value.replace(/[^0-9.]/g, '') }))} />
          {r.unit !== '$' && <span style={{ color: TEXT_MUTED, fontSize: FONT.small }}>{r.unit}</span>}
          {!atDefault && (
            <button type="button" onClick={() => setForm((f) => ({ ...f, [r.key]: String(r.def) }))}
              style={{ background: 'none', border: 'none', color: C.primary, fontSize: FONT.small, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              Use the default ({fmt(r, r.def)})
            </button>
          )}
        </div>
      </Field>
    );
  };

  return (
    <Card padding={18}>
      <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: intro ? 4 : 12 }}>{title}</div>
      {intro && <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>{intro}</p>}
      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the settings.</Notice> : (
        <>
          <div style={{ display: 'grid', gap: 18 }}>
            {sections.map((sec) => (
              <div key={sec || 'all'} style={{ display: 'grid', gap: 14 }}>
                {sec && sections.length > 1 && (
                  <div style={{ fontSize: FONT.caption, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>{sec}</div>
                )}
                {rules.filter((r) => (r.section ?? '') === sec).map(field)}
              </div>
            ))}
          </div>
          {wrong && <div role="alert" style={{ fontSize: FONT.small, color: C.danger, marginTop: 10 }}>"{wrong.label}" must be {wrong.int ? 'a whole number ' : ''}from {fmt(wrong, wrong.min)} to {fmt(wrong, wrong.max)}.</div>}
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="primary" disabled={changed.length === 0 || !!wrong || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : changed.length > 1 ? `Save ${changed.length} changes` : 'Save'}
            </Button>
            {rules.some(edited) && <Button variant="secondary" disabled={save.isPending} onClick={() => setForm(Object.fromEntries(rules.map((r) => [r.key, String(r.value)])))}>Undo changes</Button>}
          </div>
          <LastChanged actions={['SETTINGS_RULES_UPDATE']} keys={rules.map((r) => r.key)} />
        </>
      )}
    </Card>
  );
}

/** The chain-wide switches. Switching one off asks first. */
export function FeaturesCard() {
  const qc = useQueryClient();
  const q = useSettings();
  const features: Feature[] = Array.isArray(q.data?.data?.data?.features) ? q.data!.data.data.features : [];
  const [asking, setAsking] = useState<Feature | null>(null);
  const flip = useMutation({
    mutationFn: (f: Feature) => settingsApi.saveFeatures({ [f.key]: !f.on }),
    onSuccess: (_d, f) => { toast.success(`${f.label} is ${f.on ? 'off' : 'on'}. Phones see it the next time they load.`); setAsking(null); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['settings-history'] }); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not change it.')); setAsking(null); },
  });
  return (
    <Card padding={18}>
      <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: 4 }}>Features</div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px' }}>Switch a whole feature off for every store, and back on. Nothing is deleted.</p>
      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the switches.</Notice> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {features.map((f) => (
            <div key={f.key} id={`feature-${f.key}-row`} data-setting={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <strong style={{ color: C.text }}>{f.label}</strong>
                  <Badge tone={f.on ? 'success' : 'neutral'}>{f.on ? 'On' : 'Off'}</Badge>
                </div>
                <div style={{ fontSize: FONT.small, color: TEXT_MUTED, marginTop: 2 }}>{f.help}</div>
              </div>
              <Button size="sm" variant={f.on ? 'secondary' : 'primary'} disabled={flip.isPending} onClick={() => (f.on ? setAsking(f) : flip.mutate(f))}>
                {f.on ? 'Switch off' : 'Switch on'}
              </Button>
            </div>
          ))}
        </div>
      )}
      <LastChanged actions={['SETTINGS_FEATURES_UPDATE']} />
      <ConfirmModal
        open={!!asking}
        title={`Switch off ${asking?.label.toLowerCase() ?? ''}?`}
        danger
        busy={flip.isPending}
        confirmLabel="Switch off"
        message={<p style={{ margin: 0 }}>{asking?.help} You can switch it back on here at any time.</p>}
        onConfirm={() => asking && flip.mutate(asking)}
        onCancel={() => setAsking(null)}
      />
    </Card>
  );
}

/** What the app's Help screen shows customers: phone, email, hours. Empty hides the line. */
export function BusinessCard() {
  const qc = useQueryClient();
  const q = useSettings();
  const saved = q.data?.data?.data?.business as { supportPhone: string; supportEmail: string; supportHours: string } | undefined;
  const [f, setF] = useState({ supportPhone: '', supportEmail: '', supportHours: '' });
  useEffect(() => { if (saved) setF(saved); }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const changed = !!saved && (f.supportPhone !== saved.supportPhone || f.supportEmail !== saved.supportEmail || f.supportHours !== saved.supportHours);
  useUnsaved('business', changed);
  const save = useMutation({
    mutationFn: () => settingsApi.saveBusiness(f),
    onSuccess: () => { toast.success('Saved. The app shows it on its Help screen.'); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['settings-history'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save.')),
  });
  return (
    <Card padding={18}>
      <div id="business-row" data-setting="business" style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: 4 }}>Contact details in the app</div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px' }}>Shown to customers on the app's Help screen, with a button to call or email. Leave a line empty to hide it.</p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Support phone" htmlFor="b-phone"><input id="b-phone" style={INPUT} inputMode="tel" placeholder="(281) 555-0100" value={f.supportPhone} maxLength={30} onChange={(e) => setF((p) => ({ ...p, supportPhone: e.target.value }))} /></Field>
        <Field label="Support email" htmlFor="b-email"><input id="b-email" style={INPUT} inputMode="email" placeholder="help@example.com" value={f.supportEmail} maxLength={120} onChange={(e) => setF((p) => ({ ...p, supportEmail: e.target.value }))} /></Field>
        <Field label="Hours someone answers" htmlFor="b-hours"><input id="b-hours" style={INPUT} placeholder="Mon to Fri, 9 AM to 5 PM" value={f.supportHours} maxLength={120} onChange={(e) => setF((p) => ({ ...p, supportHours: e.target.value }))} /></Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Button variant="primary" disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        {changed && <Button variant="secondary" style={{ marginLeft: 10 }} disabled={save.isPending} onClick={() => saved && setF(saved)}>Undo changes</Button>}
      </div>
      <LastChanged actions={['SETTINGS_BUSINESS_UPDATE']} />
    </Card>
  );
}

/** Every settings change, newest first, filterable by area. */
export function HistoryCard() {
  const q = useSettingsHistory();
  const rows = rowsOf(q);
  const areas = [...new Set(rows.map((r) => r.area))];
  const [area, setArea] = useState('');
  const shown = area ? rows.filter((r) => r.area === area) : rows;
  return (
    <Card padding={18}>
      <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: 4 }}>History</div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px' }}>Every change to a setting, by whom and when, wherever it was made (also cashback rates and the default fee). The latest 100.</p>
      {areas.length > 1 && (
        <div role="group" aria-label="Area" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <Chip selected={!area} onClick={() => setArea('')}>All</Chip>
          {areas.map((a) => <Chip key={a} selected={area === a} onClick={() => setArea(a)}>{a}</Chip>)}
        </div>
      )}
      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the history.</Notice>
        : shown.length === 0 ? <EmptyState title="No settings changes yet" /> : (
          <div style={{ display: 'grid' }}>
            {shown.map((r) => (
              <div key={r.id} style={{ padding: '10px 0', borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge>{r.area}</Badge>
                  <span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{storeDay(r.at)}, {storeTime(r.at)} · {r.by}</span>
                </div>
                {r.summary && <div style={{ fontSize: FONT.body, color: C.text2, marginTop: 4, lineHeight: 1.45 }}>{r.summary}</div>}
              </div>
            ))}
          </div>
        )}
    </Card>
  );
}
