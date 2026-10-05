// Who a promotion is for, and its limits (backend utils/offerAudience.ts and utils/offerBudget.ts). Only the people in the audience see
// it, are told about it and are paid it. A budget stops it when its extra cashback reaches the amount; a daily limit caps what one
// customer gets from it in a store day.
import { Chip, Field } from '../kit';
import { C, FONT, INPUT } from '../../lib/theme';

export type Audience = 'EVERYONE' | 'TIER_UP' | 'LAPSED' | 'NEW' | 'BIRTHDAY';
export type AudienceLimitsValue = { audience: Audience; audienceTier: string; audienceDays: string; budgetCap: string; dailyCapPerCustomer: string };
export const NO_AUDIENCE: AudienceLimitsValue = { audience: 'EVERYONE', audienceTier: 'GOLD', audienceDays: '', budgetCap: '', dailyCapPerCustomer: '' };
const TIERS = [['BRONZE', 'Bronze'], ['SILVER', 'Silver'], ['GOLD', 'Gold'], ['DIAMOND', 'Diamond'], ['PLATINUM', 'Platinum']] as const;
const TIER_NAME: Record<string, string> = Object.fromEntries(TIERS);

export function audienceFrom(o: { audience?: string | null; audienceTier?: string | null; audienceDays?: number | null; budgetCap?: number | null; dailyCapPerCustomer?: number | null }): AudienceLimitsValue {
  return {
    audience: (o.audience as Audience) || 'EVERYONE', audienceTier: o.audienceTier || 'GOLD', audienceDays: o.audienceDays != null ? String(o.audienceDays) : '',
    budgetCap: o.budgetCap != null ? String(o.budgetCap) : '', dailyCapPerCustomer: o.dailyCapPerCustomer != null ? String(o.dailyCapPerCustomer) : '',
  };
}

/** What the server takes (empty limits are none). */
export function audiencePayload(v: AudienceLimitsValue): Record<string, string | number | null> {
  return {
    audience: v.audience,
    audienceTier: v.audience === 'TIER_UP' ? v.audienceTier : null,
    audienceDays: (v.audience === 'LAPSED' || v.audience === 'NEW') && v.audienceDays.trim() ? Number(v.audienceDays) : null,
    budgetCap: v.budgetCap.trim() ? Number(v.budgetCap) : null,
    dailyCapPerCustomer: v.dailyCapPerCustomer.trim() ? Number(v.dailyCapPerCustomer) : null,
  };
}

/** The sentence that stops a form, or null. */
export function audienceProblem(v: AudienceLimitsValue): string | null {
  const days = v.audienceDays.trim() ? Number(v.audienceDays) : null;
  if (days != null && !(Number.isInteger(days) && days >= 1 && days <= 365)) return 'Give the days as a whole number from 1 to 365.';
  if (v.budgetCap.trim() && !(Number(v.budgetCap) >= 1 && Number(v.budgetCap) <= 100_000)) return 'A budget is from $1 to $100,000.';
  if (v.dailyCapPerCustomer.trim() && !(Number(v.dailyCapPerCustomer) >= 0.01 && Number(v.dailyCapPerCustomer) <= 1_000)) return 'A daily limit is from $0.01 to $1,000.';
  return null;
}

/** "Gold and above" / "Win-back: not bought in 30 days" / ... */
export function audienceLabel(o: { audience?: string | null; audienceTier?: string | null; audienceDays?: number | string | null }): string | null {
  switch (o.audience) {
    case 'TIER_UP': return o.audienceTier === 'PLATINUM' ? 'Platinum members' : `${TIER_NAME[o.audienceTier ?? 'GOLD'] ?? 'Gold'} and above`;
    case 'LAPSED': return `Win-back: not bought in ${o.audienceDays || 30} days`;
    case 'NEW': return `New customers (first ${o.audienceDays || 14} days)`;
    case 'BIRTHDAY': return 'Birthday month';
    default: return null;
  }
}

export function AudienceLimitsField({ idPrefix, value, onChange }: { idPrefix: string; value: AudienceLimitsValue; onChange: (v: AudienceLimitsValue) => void }) {
  const set = (p: Partial<AudienceLimitsValue>) => onChange({ ...value, ...p });
  const problem = audienceProblem(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div role="radiogroup" aria-label="Who it is for" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([['EVERYONE', 'Everyone'], ['TIER_UP', 'A tier and up'], ['LAPSED', 'Win-back'], ['NEW', 'New customers'], ['BIRTHDAY', 'Birthday month']] as const).map(([v, l]) => (
          <Chip key={v} role="radio" selected={value.audience === v} onClick={() => set({ audience: v, audienceDays: '' })}>{l}</Chip>
        ))}
      </div>
      {value.audience === 'TIER_UP' && (
        <Field label="From this tier up" htmlFor={`${idPrefix}-tier`}>
          <select id={`${idPrefix}-tier`} className="ui-input" style={{ ...INPUT, maxWidth: 220 }} value={value.audienceTier} onChange={(e) => set({ audienceTier: e.target.value })}>
            {TIERS.map(([v, l]) => <option key={v} value={v}>{l}{v === 'PLATINUM' ? ' only' : ' and above'}</option>)}
          </select>
        </Field>
      )}
      {(value.audience === 'LAPSED' || value.audience === 'NEW') && (
        <Field label={value.audience === 'LAPSED' ? 'Not bought in (days)' : 'Joined within (days)'} htmlFor={`${idPrefix}-days`}>
          <input id={`${idPrefix}-days`} className="ui-input" style={{ ...INPUT, maxWidth: 140 }} inputMode="numeric" value={value.audienceDays}
            placeholder={value.audience === 'LAPSED' ? '30' : '14'} onChange={(e) => set({ audienceDays: e.target.value.replace(/[^0-9]/g, '') })} />
        </Field>
      )}
      <div style={{ fontSize: FONT.small, color: C.muted, lineHeight: 1.5 }}>
        {value.audience === 'EVERYONE' && 'Every customer sees it, is told about it and gets it.'}
        {value.audience === 'TIER_UP' && 'Only customers of that tier and above see it, are told about it and get it.'}
        {value.audience === 'LAPSED' && 'Customers who have bought before but not in that many days. Only they see it and are told; their first visit back earns it.'}
        {value.audience === 'NEW' && 'Customers who joined in that many days. Only they see it and are told.'}
        {value.audience === 'BIRTHDAY' && 'Customers whose birthday is this month, from the birthday they gave in the app (optional, in Profile). Only they see it and are told.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field label="Budget (optional)" htmlFor={`${idPrefix}-budget`} hint="It stops when its extra cashback reaches this, and HQ is told.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: C.muted }}>$</span>
            <input id={`${idPrefix}-budget`} className="ui-input" style={INPUT} inputMode="decimal" value={value.budgetCap} placeholder="No limit" onChange={(e) => set({ budgetCap: e.target.value.replace(/[^0-9.]/g, '') })} />
          </div>
        </Field>
        <Field label="Per customer, per day (optional)" htmlFor={`${idPrefix}-daily`} hint="The most one customer gets from it in a store day.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: C.muted }}>$</span>
            <input id={`${idPrefix}-daily`} className="ui-input" style={INPUT} inputMode="decimal" value={value.dailyCapPerCustomer} placeholder="No limit" onChange={(e) => set({ dailyCapPerCustomer: e.target.value.replace(/[^0-9.]/g, '') })} />
          </div>
        </Field>
      </div>
      {value.budgetCap.trim() && <div style={{ fontSize: FONT.caption, color: C.muted }}>Two sales at the very same moment can pass the budget by at most one sale's bonus.</div>}
      {problem && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{problem}</div>}
    </div>
  );
}
