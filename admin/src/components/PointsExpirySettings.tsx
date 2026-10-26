// Settings > Rewards & offers > Points expiry (2026-10-17). Off until HQ switches it on: then points expire a number of days after they were
// earned, oldest first, and every clock starts no earlier than the day it was switched on. Before switching on, HQ sees what would expire
// and when, and confirms that the terms have been updated and customers told. Customers' expired points can be given back on their profile.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { settingsApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDay } from '../lib/storeDates';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Button, Card, Badge, Field, Notice } from './kit';
import ConfirmModal from './ConfirmModal';
import { useSettings, LastChanged } from './SettingsCards';
import { useUnsaved } from '../lib/unsaved';

interface Expiry { enabled: boolean; startedAt: string | null; days: number; warnDays: number; limits: { days: { min: number; max: number; def: number }; warnDays: { min: number; max: number; def: number } } }
interface Preview { byDate: { date: string; customers: number; points: number }[]; customers: number; points: number; mismatched: number; days: number; from: string }

const n = (v: number) => v.toLocaleString('en-US');
const dateOnly = (d: string) => storeDay(`${d}T18:00:00Z`);

export default function PointsExpirySettings() {
  const qc = useQueryClient();
  const q = useSettings();
  const saved = q.data?.data?.data?.expiry as Expiry | undefined;
  const [days, setDays] = useState('90');
  const [warn, setWarn] = useState('7');
  const [asking, setAsking] = useState<'on' | 'off' | null>(null);
  const [told, setTold] = useState(false);
  useEffect(() => { if (saved) { setDays(String(saved.days)); setWarn(String(saved.warnDays)); } }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const d = Number(days), w = Number(warn);
  const lim = saved?.limits;
  const daysOk = !!lim && Number.isInteger(d) && d >= lim.days.min && d <= lim.days.max;
  const warnOk = !!lim && Number.isInteger(w) && w >= lim.warnDays.min && w <= lim.warnDays.max;
  const changed = !!saved && (d !== saved.days || w !== saved.warnDays);
  // while it is off the boxes only set what Switch on will use (there is no Save), so leaving the page does not warn about them
  useUnsaved('points-expiry', changed && !!saved?.enabled);

  const preview = useQuery({
    queryKey: ['points-expiry-preview', daysOk ? d : null],
    queryFn: () => settingsApi.pointsExpiryPreview(d),
    enabled: daysOk,
    staleTime: 60_000,
  });
  const raw = preview.data?.data?.data;
  const p = raw && Array.isArray(raw.byDate) ? (raw as Preview) : undefined;   // an odd answer shows no preview rather than breaking the card

  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['settings-history'] }); qc.invalidateQueries({ queryKey: ['points-expiry-preview'] }); };
  const save = useMutation({
    mutationFn: (body: { enabled?: boolean; days?: number; warnDays?: number }) => settingsApi.savePointsExpiry(body),
    onSuccess: (_r, body) => { setAsking(null); setTold(false); done(body.enabled === true ? 'Points expiry is on. Clocks start today.' : body.enabled === false ? 'Points expiry is off. No points expire.' : 'Saved.'); },
    onError: (e) => { setAsking(null); toast.error(serverMessage(e, 'Could not save.')); },
  });

  if (q.isLoading) return <Card padding={18}><div style={{ color: TEXT_MUTED }}>Loading…</div></Card>;
  if (q.isError || !saved || !lim) return <Card padding={18}><Notice tone="danger">Could not load the points expiry settings.</Notice></Card>;

  const firstDate = p?.byDate[0]?.date;
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div id="points-expiry" style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>Points expiry</div>
        <Badge tone={saved.enabled ? 'warning' : 'neutral'}>{saved.enabled ? 'On' : 'Off'}</Badge>
        <div style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant={saved.enabled ? 'secondary' : 'primary'} disabled={save.isPending || (!saved.enabled && (!daysOk || !warnOk))} onClick={() => setAsking(saved.enabled ? 'off' : 'on')}>
            {saved.enabled ? 'Switch off' : 'Switch on'}
          </Button>
        </div>
      </div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
        Points expire a number of days after they were earned. Spending always uses the oldest points first, so a customer never loses points while
        older ones sit unused. A refunded reward or order puts points back with their original date. Expired points are shown in the customer's
        History, and HQ can give them back on the customer's profile.
      </p>
      {saved.enabled ? (
        <Notice tone="warning">On since {storeDay(saved.startedAt!)}. Points expire {saved.days} days after they were earned, and never before {storeDay(new Date(Date.parse(saved.startedAt!) + saved.days * 86_400_000).toISOString())} (every clock started that day).</Notice>
      ) : (
        <Notice>Off: no points expire. The current terms of service promise customers <strong>at least 90 days' notice</strong> before points start to expire: publish the new terms and tell customers first, then switch this on no sooner than 90 days later.</Notice>
      )}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 12 }}>
        <Field label={`Points expire after (${lim.days.min} to ${lim.days.max} days)`} htmlFor="pe-days" hint={`Default ${lim.days.def} days.`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="pe-days" style={{ ...INPUT, maxWidth: 120 }} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} />
            <span style={{ color: TEXT_MUTED, fontSize: FONT.small }}>days</span>
          </div>
        </Field>
        <Field label={`Warning push before (${lim.warnDays.min} to ${lim.warnDays.max} days)`} htmlFor="pe-warn" hint="One push per batch of points. 0: no push.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="pe-warn" style={{ ...INPUT, maxWidth: 120 }} inputMode="numeric" value={warn} onChange={(e) => setWarn(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            <span style={{ color: TEXT_MUTED, fontSize: FONT.small }}>days</span>
          </div>
        </Field>
      </div>
      {(!daysOk || !warnOk) && <div role="alert" style={{ fontSize: FONT.small, color: C.danger, marginTop: 8 }}>Days must be {lim.days.min} to {lim.days.max}; warning days {lim.warnDays.min} to {lim.warnDays.max}.</div>}

      <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: '#f7f8fa', border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, color: C.text, fontSize: FONT.body, marginBottom: 6 }}>{saved.enabled ? 'Coming up' : `If you switch it on today with ${daysOk ? d : '…'} days`}</div>
        {preview.isLoading ? <div style={{ color: TEXT_MUTED, fontSize: FONT.small }}>Working it out…</div> : !p ? <div style={{ color: TEXT_MUTED, fontSize: FONT.small }}>Enter the days to see the preview.</div> : p.points === 0 ? (
          <div style={{ fontSize: FONT.small, color: C.text2 }}>No points would expire in the next {d + 120} days.</div>
        ) : (
          <>
            <div style={{ fontSize: FONT.small, color: C.text2 }}>
              {n(p.points)} points of {n(p.customers)} customer{p.customers === 1 ? '' : 's'} would expire if not spent, the first on {dateOnly(firstDate!)}.
            </div>
            <table style={{ width: '100%', marginTop: 8, fontSize: FONT.small, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: TEXT_MUTED, textAlign: 'left' }}><th style={{ padding: '4px 0' }}>Date</th><th>Customers</th><th style={{ textAlign: 'right' }}>Points</th></tr></thead>
              <tbody>
                {p.byDate.slice(0, 8).map((r) => (
                  <tr key={r.date} style={{ borderTop: `1px solid ${C.border}` }}><td style={{ padding: '4px 0' }}>{dateOnly(r.date)}</td><td>{n(r.customers)}</td><td style={{ textAlign: 'right' }}>{n(r.points)}</td></tr>
                ))}
              </tbody>
            </table>
            {p.byDate.length > 8 && <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 4 }}>and {p.byDate.length - 8} more dates.</div>}
          </>
        )}
        {p && p.mismatched > 0 && (
          <div role="alert" style={{ fontSize: FONT.small, color: C.danger, marginTop: 8 }}>
            {n(p.mismatched)} customer{p.mismatched === 1 ? "'s" : "s'"} points do not add up to their balance. Expiry skips them and lists them in the Activity Log; nothing is taken from them.
          </div>
        )}
      </div>

      {saved.enabled && (
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="primary" disabled={!changed || !daysOk || !warnOk || save.isPending} onClick={() => save.mutate({ days: d, warnDays: w })}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          {changed && <Button variant="secondary" onClick={() => { setDays(String(saved.days)); setWarn(String(saved.warnDays)); }}>Undo changes</Button>}
        </div>
      )}
      <LastChanged actions={['SETTINGS_EXPIRY_UPDATE']} />

      <ConfirmModal
        open={asking === 'on'}
        title="Switch on points expiry?"
        danger
        busy={save.isPending}
        confirmLabel="Switch on"
        confirmDisabled={!told}
        message={(
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }}>
              From today, points expire {d} days after they were earned. Points customers already have get the full {d} days from today, so the first
              would expire on {storeDay(new Date(Date.now() + d * 86_400_000).toISOString())}.
              {p && p.points > 0 ? ` Unless they are spent, ${n(p.points)} points of ${n(p.customers)} customers would expire over the coming months.` : ''}
              {w > 0 ? ` Customers get a push ${w} days before.` : ' No warning push is sent.'}
            </p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 600 }}>
              <input type="checkbox" checked={told} onChange={(e) => setTold(e.target.checked)} style={{ marginTop: 3 }} />
              The new terms of service say how expiry works, and customers were told at least 90 days ago (the terms promise 90 days' notice).
            </label>
          </div>
        )}
        onConfirm={() => save.mutate({ enabled: true, days: d, warnDays: w })}
        onCancel={() => { setAsking(null); setTold(false); }}
      />
      <ConfirmModal
        open={asking === 'off'}
        title="Switch off points expiry?"
        busy={save.isPending}
        confirmLabel="Switch off"
        message={<p style={{ margin: 0 }}>No more points expire. Points that already expired stay expired (give them back on a customer's profile). If you switch it on again later, every clock starts again from that day.</p>}
        onConfirm={() => save.mutate({ enabled: false })}
        onCancel={() => setAsking(null)}
      />
    </Card>
  );
}
