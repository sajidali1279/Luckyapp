import { useEffect, useState, CSSProperties } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { storesApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

// When hot food can be ordered at one store. Either the same as the store's own hours (the default), or hours of its own for a
// kitchen that opens later or closes earlier. Either way the server refuses orders outside them, and whenever the store itself is
// closed (holidays included).

type DayOfWeek = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'SUN', label: 'Sunday' }, { value: 'MON', label: 'Monday' }, { value: 'TUE', label: 'Tuesday' }, { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' }, { value: 'FRI', label: 'Friday' }, { value: 'SAT', label: 'Saturday' },
];
interface DayForm { isClosed: boolean; isOpen24Hours: boolean; openTime: string; closeTime: string }
const BLANK: DayForm = { isClosed: false, isOpen24Hours: false, openTime: '', closeTime: '' };

export interface HotFoodNow {
  open: boolean; limited: boolean; followsStore: boolean;
  closesAt: string | null; opensAt: string | null; opensDay: string | null; todayText: string | null; holiday: string | null;
}

const DAY_NAME: Record<string, string> = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

/** "Open now · until 10:00 PM", "Closed now · opens tomorrow at 6:00 AM", "Open any time (no hours set)" */
export function hotFoodNowText(st: HotFoodNow): { text: string; tone: 'open' | 'closed' | 'always' } {
  if (!st.limited) return { text: 'Open any time (no hours set)', tone: 'always' };
  if (st.open) return { text: st.closesAt ? `Open now · until ${st.closesAt}` : 'Open now', tone: 'open' };
  const when = st.opensDay === 'today' ? 'today' : st.opensDay === 'tomorrow' ? 'tomorrow' : st.opensDay ? DAY_NAME[st.opensDay] : '';
  const head = st.holiday ? `Closed today (${st.holiday})` : 'Closed now';
  return { text: st.opensAt ? `${head} · opens ${when} at ${st.opensAt}` : head, tone: 'closed' };
}

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function HotFoodHoursModal({ store, onClose, onSaved }: {
  store: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<'store' | 'own'>('store');
  const [storeHoursSet, setStoreHoursSet] = useState(false);
  const [now, setNow] = useState<HotFoodNow | null>(null);
  const [week, setWeek] = useState<Record<DayOfWeek, DayForm>>(() => Object.fromEntries(DAYS.map(d => [d.value, BLANK])) as Record<DayOfWeek, DayForm>);
  const [allDays, setAllDays] = useState({ openTime: '', closeTime: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const r = await storesApi.getHotFoodHours(store.id);
      const d = r.data?.data;
      setStoreHoursSet(!!d?.storeHoursSet);
      setNow(d?.now ?? null);
      setMode(d?.followsStore ? 'store' : 'own');
      const next = Object.fromEntries(DAYS.map(x => [x.value, BLANK])) as Record<DayOfWeek, DayForm>;
      for (const row of d?.weekly ?? []) {
        next[row.dayOfWeek as DayOfWeek] = { isClosed: row.isClosed, isOpen24Hours: row.isOpen24Hours, openTime: row.openTime ?? '', closeTime: row.closeTime ?? '' };
      }
      setWeek(next);
    } catch (e) {
      setLoadError(failureMessage(e, 'Could not load the hot food hours.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [store.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setDay = (d: DayOfWeek, patch: Partial<DayForm>) => { setWeek(w => ({ ...w, [d]: { ...w[d], ...patch } })); setError(''); };
  const everyDay = (day: DayForm) => { setWeek(Object.fromEntries(DAYS.map(d => [d.value, { ...day }])) as Record<DayOfWeek, DayForm>); setError(''); };

  async function save() {
    setError('');
    if (mode === 'own') {
      for (const d of DAYS) {
        const day = week[d.value];
        if (day.isClosed || day.isOpen24Hours) continue;
        if (!day.openTime || !day.closeTime) { setError(`${d.label}: set both times, or mark it Closed or 24 Hours.`); return; }
        if (day.openTime === day.closeTime) { setError(`${d.label} opens and closes at the same time. Use 24 Hours for a day that never closes.`); return; }
      }
    }
    setSaving(true);
    try {
      if (mode === 'store') await storesApi.clearHotFoodHours(store.id);
      else {
        await storesApi.updateHotFoodHours(store.id, DAYS.map(d => {
          const day = week[d.value];
          const noTimes = day.isClosed || day.isOpen24Hours;
          return { dayOfWeek: d.value, isClosed: day.isClosed, isOpen24Hours: day.isOpen24Hours, openTime: noTimes ? null : day.openTime, closeTime: noTimes ? null : day.closeTime };
        }));
      }
      toast.success(`Hot food hours saved for ${store.name}.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(failureMessage(e, 'Could not save the hours. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  }

  const nowText = now ? hotFoodNowText(now) : null;
  const overnight = mode === 'own' && DAYS.some(d => { const x = week[d.value]; return !x.isClosed && !x.isOpen24Hours && x.openTime && x.closeTime && x.closeTime < x.openTime; });

  return (
    <Modal title="Hot food hours" subtitle={store.name} onClose={onClose} busy={saving} maxWidth={640}>
      {loading ? (
        <div style={{ padding: '20px 0', color: TEXT_MUTED, textAlign: 'center' }} role="status">Loading…</div>
      ) : loadError ? (
        <div role="alert" style={h.error}>{loadError} <button type="button" style={h.link} onClick={load}>Try again</button></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {nowText && (
            <div style={{ ...h.now, ...(nowText.tone === 'open' ? h.nowOpen : nowText.tone === 'closed' ? h.nowClosed : {}) }}>
              <span style={h.dot(nowText.tone)} aria-hidden /> Right now: {nowText.text}
            </div>
          )}

          <div role="radiogroup" aria-label="Which hours" style={{ display: 'grid', gap: 8 }}>
            {([
              ['store', "Same as the store's hours", storeHoursSet ? "Hot food can be ordered whenever the store is open." : "This store has no opening hours set yet, so hot food can be ordered any time. Set them on the Stores page, or give hot food its own hours."],
              ['own', 'Its own hot food hours', 'For a kitchen that opens later or closes earlier than the store.'],
            ] as const).map(([value, title, sub]) => (
              <label key={value} style={{ ...h.option, ...(mode === value ? h.optionOn : {}) }}>
                <input type="radio" name="hf-mode" checked={mode === value} onChange={() => { setMode(value); setError(''); }} style={{ marginTop: 3 }} />
                <span><b style={{ display: 'block' }}>{title}</b><small style={{ color: TEXT_MUTED }}>{sub}</small></span>
              </label>
            ))}
          </div>

          {mode === 'own' && (
            <>
              <div style={h.presetRow} role="group" aria-label="Fill in the whole week at once">
                <input style={h.time} type="time" aria-label="Every day opens at" value={allDays.openTime} onChange={e => setAllDays(a => ({ ...a, openTime: e.target.value }))} />
                <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
                <input style={h.time} type="time" aria-label="Every day closes at" value={allDays.closeTime} onChange={e => setAllDays(a => ({ ...a, closeTime: e.target.value }))} />
                <button type="button" style={h.preset} disabled={!allDays.openTime || !allDays.closeTime} onClick={() => everyDay({ ...BLANK, openTime: allDays.openTime, closeTime: allDays.closeTime })}>Same every day</button>
                <button type="button" style={h.preset} onClick={() => everyDay({ ...BLANK, isOpen24Hours: true })}>24 hours every day</button>
              </div>
              <div style={h.week}>
                {DAYS.map(d => {
                  const day = week[d.value];
                  return (
                    <div key={d.value} style={h.dayRow}>
                      <div style={h.dayLabel}>{d.label}</div>
                      <div style={h.dayControls}>
                        <button type="button" aria-pressed={day.isClosed} aria-label={`${d.label} closed`} style={{ ...h.chip, ...(day.isClosed ? h.chipRed : {}) }}
                          onClick={() => setDay(d.value, { isClosed: !day.isClosed })}>Closed</button>
                        <button type="button" aria-pressed={day.isOpen24Hours} aria-label={`${d.label} 24 hours`} style={{ ...h.chip, ...(day.isOpen24Hours ? h.chipGreen : {}) }}
                          onClick={() => setDay(d.value, { isOpen24Hours: !day.isOpen24Hours, isClosed: false })} disabled={day.isClosed}>24 Hours</button>
                        {!day.isClosed && !day.isOpen24Hours && (
                          <>
                            <input style={h.time} type="time" aria-label={`${d.label} opens at`} value={day.openTime} onChange={e => setDay(d.value, { openTime: e.target.value })} />
                            <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
                            <input style={h.time} type="time" aria-label={`${d.label} closes at`} value={day.closeTime} onChange={e => setDay(d.value, { closeTime: e.target.value })} />
                            {day.openTime && day.closeTime && day.closeTime < day.openTime && <span style={h.overnight}>ends {fmt12(day.closeTime)} the next day</span>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {overnight && <p style={h.note}>A closing time earlier than the opening time runs past midnight.</p>}
            </>
          )}

          <p style={h.note}>Outside these hours nobody can place a hot food order, and ordering also stops whenever the store itself is closed, holidays included. Orders already placed carry on as normal.</p>
          {error && <div role="alert" style={h.error}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" style={h.cancel} onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" style={h.save} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save hours'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const h: Record<string, any> = {
  now: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#f1f3f6', fontWeight: 700, fontSize: 14, color: '#374151' } as CSSProperties,
  nowOpen: { background: '#edf7f0', color: '#17663a' } as CSSProperties,
  nowClosed: { background: '#fdf6e8', color: '#8a5300' } as CSSProperties,
  dot: (tone: string): CSSProperties => ({ width: 9, height: 9, borderRadius: 5, background: tone === 'open' ? '#1a7f45' : tone === 'closed' ? '#8a5300' : '#5a6472', flexShrink: 0 }),
  option: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', border: '1.5px solid #e4e7ec', borderRadius: 11, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  optionOn: { borderColor: PRIMARY, background: '#eef2f7' } as CSSProperties,
  presetRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 } as CSSProperties,
  preset: { border: '1.5px solid #d5dae1', background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  week: { display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid #EEF2F7', borderRadius: 12, padding: 8 } as CSSProperties,
  dayRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '4px 4px' } as CSSProperties,
  dayLabel: { width: 90, fontWeight: 700, fontSize: 14, color: '#111827' } as CSSProperties,
  dayControls: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 } as CSSProperties,
  chip: { border: '1.5px solid #e4e7ec', background: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, color: '#374151', cursor: 'pointer' } as CSSProperties,
  chipRed: { background: '#fdf2f2', borderColor: '#f3cdd1', color: '#a51b28' } as CSSProperties,
  chipGreen: { background: '#edf7f0', borderColor: '#c8e6d2', color: '#1a7f45' } as CSSProperties,
  time: { border: '1.5px solid #d5dae1', borderRadius: 8, padding: '5px 8px', fontSize: 14 } as CSSProperties,
  overnight: { fontSize: 12, color: '#8a5300', fontWeight: 600 } as CSSProperties,
  note: { fontSize: 13, color: TEXT_MUTED, margin: 0, lineHeight: 1.5 } as CSSProperties,
  error: { background: '#fdf2f2', color: '#a51b28', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontWeight: 600 } as CSSProperties,
  link: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 } as CSSProperties,
  cancel: { background: '#f1f3f6', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' } as CSSProperties,
  save: { background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
};
