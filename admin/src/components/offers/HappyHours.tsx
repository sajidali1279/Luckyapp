// Happy hours for a promotion (backend/src/utils/offerHours.ts): days of the week and a time window on the store clock. Shown to customers
// all day with its hours; the extra cashback is paid only on sales inside them. No times means all day, as before.
import { Chip } from '../kit';
import { C, FONT, INPUT } from '../../lib/theme';

export type HappyHours = { days: number[]; from: string; to: string };   // days 0 = Sunday .. 6 = Saturday; [] = every day
export const NO_HOURS: HappyHours = { days: [], from: '', to: '' };

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK = [1, 2, 3, 4, 5, 6, 0];   // shown Monday first

export function hoursFrom(o: { happyDays?: number[] | null; happyFrom?: string | null; happyTo?: string | null }): HappyHours {
  return { days: o.happyDays ?? [], from: o.happyFrom ?? '', to: o.happyTo ?? '' };
}

/** What the server takes: all three fields, empty for "all day". */
export function hoursPayload(h: HappyHours) {
  const on = !!(h.from && h.to);
  return { happyDays: on ? h.days : [], happyFrom: on ? h.from : '', happyTo: on ? h.to : '' };
}

/** The sentence that stops a form, or null. Same rules as the server's checkHours. */
export function hoursProblem(h: HappyHours): string | null {
  if (!h.from && !h.to) return null;
  if (!h.from || !h.to) return 'Give the happy hour both a start and an end time, or clear both for all day.';
  if (h.from === h.to) return 'The happy hour starts and ends at the same time. Clear both for all day.';
  return null;
}

const twelve = (t: string) => {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Mon-Fri, 3 PM to 6 PM" / "Every day, 10 PM to 2 AM", or null without hours (the server's hoursText, for offers it did not label). */
export function hoursLabel(o: { happyDays?: number[] | null; happyFrom?: string | null; happyTo?: string | null }): string | null {
  if (!o.happyFrom || !o.happyTo) return null;
  const days = o.happyDays && o.happyDays.length > 0 && o.happyDays.length < 7 ? [...o.happyDays].sort((a, b) => a - b) : null;
  let dayText = 'Every day';
  if (days) {
    const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    dayText = run && days.length >= 3 ? `${DAY_SHORT[days[0]]}-${DAY_SHORT[days[days.length - 1]]}` : days.map((d) => DAY_SHORT[d]).join(', ');
  }
  return `${dayText}, ${twelve(o.happyFrom)} to ${twelve(o.happyTo)}`;
}

export function HappyHoursField({ value, onChange, idPrefix }: { value: HappyHours; onChange: (h: HappyHours) => void; idPrefix: string }) {
  const on = !!(value.from || value.to);
  // No days stored means every day, so the first click on one leaves that day out; picking all seven goes back to "every day"
  const toggleDay = (d: number) => {
    const current = value.days.length === 0 ? WEEK : value.days;
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
    if (next.length === 0) return;   // at least one day; "All day" above is the way to turn the hours off
    onChange({ ...value, days: next.length === 7 ? [] : next });
  };
  const problem = hoursProblem(value);
  const label = hoursLabel(hoursPayload(value));
  const overnight = value.from && value.to && value.to < value.from;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip selected={!on} onClick={() => onChange(NO_HOURS)}>All day</Chip>
        <Chip selected={on} onClick={() => { if (!on) onChange({ days: [], from: '15:00', to: '18:00' }); }}>Only at certain hours</Chip>
      </div>
      {on && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor={`${idPrefix}-from`} style={lbl}>From</label>
            <input id={`${idPrefix}-from`} type="time" className="ui-input" style={{ ...INPUT, width: 130 }} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
            <label htmlFor={`${idPrefix}-to`} style={lbl}>to</label>
            <input id={`${idPrefix}-to`} type="time" className="ui-input" style={{ ...INPUT, width: 130 }} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
            <span style={{ fontSize: FONT.small, color: C.muted }}>store time</span>
          </div>
          <div role="group" aria-label="Happy-hour days" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WEEK.map((d) => (
              <Chip key={d} selected={value.days.length === 0 || value.days.includes(d)}
                onClick={() => toggleDay(d)} aria-label={`Happy hour on ${DAY_SHORT[d]}`}>{DAY_SHORT[d]}</Chip>
            ))}
          </div>
          <div style={{ fontSize: FONT.small, color: problem ? C.danger : C.muted, lineHeight: 1.5 }}>
            {problem ?? <>
              Customers see it all day with <strong style={{ color: C.text2 }}>{label}</strong>. The bonus is paid only on sales inside those hours.
              {overnight ? ' It runs past midnight: the hours after midnight count to the day it started.' : ''}
              {value.days.length === 0 ? ' Every day is picked; click a day to leave it out.' : ''}
            </>}
          </div>
        </>
      )}
    </div>
  );
}

/** The last-day reminder push (utils/offerLastDay.ts on the server): 10 AM store time on the last day, promotions of 3 days or more. */
export function LastDayToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: FONT.body, color: C.text2 }}>
        <input type="checkbox" checked={on} onChange={onToggle} style={{ width: 16, height: 16, accentColor: C.primary, cursor: 'pointer' }} />
        Send a "Last day!" reminder
      </label>
      <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
        At 10 AM store time on the last day, to the same customers it was announced to. Only for promotions of 3 days or more.
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: FONT.body, color: C.text2 };
