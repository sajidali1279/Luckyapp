// "Coming soon" countdown for a deal that starts later (2026-11-22): how long before its start the app shows a card with a live
// countdown, the price or reward, a Remind me button and how many are waiting. Shared by Offers (promotions, deals) and hot food combos.
// Choices are in HOURS (owner 2026-11-22: hours too, not only days).
import { Field } from '../kit';
import { INPUT } from '../../lib/theme';

export const TEASE_HOURS = [0, 1, 2, 3, 6, 12, 24, 48, 72, 120, 168, 336, 720];
const HOUR_MS = 3_600_000;

/** "2 hours before it starts", "3 days before it starts". */
export function teaseLabel(h: number): string {
  if (h === 0) return 'Off (show it only when it starts)';
  if (h < 24) return h === 1 ? '1 hour before it starts' : `${h} hours before it starts`;
  const d = h / 24;
  return d === 1 ? '1 day before it starts' : `${d} days before it starts`;
}

/** When Coming soon begins for a start at startMs: hours before it, never in the past (a teaser asked for late begins now). */
export function teaseFromIso(startMs: number, hours: number, nowMs = Date.now()): string | null {
  if (!hours || startMs <= nowMs) return null;
  return new Date(Math.max(startMs - hours * HOUR_MS, nowMs)).toISOString();
}

/** The hours-before choice an existing teaser is closest to (0 when there is none). */
export function teaseHoursOf(teaseFrom: string | null | undefined, start: string | null | undefined): number {
  if (!teaseFrom || !start) return 0;
  const hours = (Date.parse(start) - Date.parse(teaseFrom)) / HOUR_MS;
  if (!(hours > 0)) return 0;
  return TEASE_HOURS.reduce((best, h) => (h && Math.abs(h - hours) < Math.abs(best - hours) ? h : best), TEASE_HOURS[1]);
}

export default function TeaserSelect({ id, value, onChange, show, hint }: { id: string; value: number; onChange: (hours: number) => void; show: boolean; hint?: string }) {
  if (!show) return null;
  return (
    <Field label="Coming soon countdown" htmlFor={id}
      hint={hint ?? 'Before it starts, the app shows it as Coming soon with a live countdown, the price, a Remind me button and how many are waiting.'}>
      <select id={id} className="ui-input" style={INPUT} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>{teaseLabel(0)}</option>
        <optgroup label="Hours">
          {TEASE_HOURS.filter((h) => h > 0 && h < 24).map((h) => <option key={h} value={h}>{teaseLabel(h)}</option>)}
        </optgroup>
        <optgroup label="Days">
          {TEASE_HOURS.filter((h) => h >= 24).map((h) => <option key={h} value={h}>{teaseLabel(h)}</option>)}
        </optgroup>
      </select>
    </Field>
  );
}
