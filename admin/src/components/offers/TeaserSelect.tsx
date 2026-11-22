// "Coming soon" countdown for a deal that starts later (2026-11-22): how many days before its start the app shows a card with a live
// countdown, the price or reward, a Remind me button and how many are waiting. Shared by Offers (promotions, deals) and hot food combos.
import { Field } from '../kit';
import { INPUT } from '../../lib/theme';

export const TEASE_DAYS = [0, 1, 2, 3, 5, 7, 14, 30];
const DAY_MS = 86_400_000;

/** When Coming soon begins for a start at startMs: days before it, never in the past (a teaser asked for late begins now). */
export function teaseFromIso(startMs: number, days: number, nowMs = Date.now()): string | null {
  if (!days || startMs <= nowMs) return null;
  return new Date(Math.max(startMs - days * DAY_MS, nowMs)).toISOString();
}

/** The days-before choice an existing teaser is closest to (0 when there is none). */
export function teaseDaysOf(teaseFrom: string | null | undefined, start: string | null | undefined): number {
  if (!teaseFrom || !start) return 0;
  const days = (Date.parse(start) - Date.parse(teaseFrom)) / DAY_MS;
  if (!(days > 0)) return 0;
  return TEASE_DAYS.reduce((best, d) => (d && Math.abs(d - days) < Math.abs(best - days) ? d : best), TEASE_DAYS[1]);
}

export default function TeaserSelect({ id, value, onChange, show, hint }: { id: string; value: number; onChange: (days: number) => void; show: boolean; hint?: string }) {
  if (!show) return null;
  return (
    <Field label="Coming soon countdown" htmlFor={id}
      hint={hint ?? 'Before it starts, the app shows it as Coming soon with a live countdown, the price, a Remind me button and how many are waiting.'}>
      <select id={id} className="ui-input" style={INPUT} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {TEASE_DAYS.map((d) => <option key={d} value={d}>{d === 0 ? 'Off (show it only when it starts)' : d === 1 ? '1 day before it starts' : `${d} days before it starts`}</option>)}
      </select>
    </Field>
  );
}
