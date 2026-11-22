// A Super Admin's HQ status on the Staff page, for the Dev Admin only (2026-11-21): a softly blinking green dot "On HQ since 9:14 AM",
// or a grey one "Last on HQ Nov 20, 5:02 PM". From GET /auth/hq-presence, refreshed every minute by the page.
import { CSSProperties } from 'react';
import { storeDay, storeTime, storeToday } from '../lib/storeDates';

export interface HqPresence { online: boolean; since: string | null; lastSeenAt: string | null; leftAt: string | null; leftHow: string | null }

const when = (iso: string) => (storeToday(new Date(iso)) === storeToday() ? storeTime(iso) : `${storeDay(iso)}, ${storeTime(iso)}`);

export default function HqPresenceDot({ p }: { p: HqPresence | undefined }) {
  if (!p) return null;
  const text = p.online && p.since ? `On HQ since ${when(p.since)}`
    : p.leftAt ? `Last on HQ ${when(p.leftAt)}${p.leftHow === 'SIGN_OUT' ? ' (signed out)' : ''}`
    : 'Not on HQ yet';
  return (
    <span style={st.wrap} title={p.online && p.lastSeenAt ? `Last active ${when(p.lastSeenAt)}` : undefined}>
      <span className={p.online ? 'ui-online-dot' : undefined} style={{ ...st.dot, background: p.online ? '#16a34a' : '#c4cad4' }} aria-hidden="true" />
      <span style={{ color: p.online ? '#17663a' : '#5a6472', fontWeight: p.online ? 600 : 500 }}>{text}</span>
    </span>
  );
}

const st: Record<string, CSSProperties> = {
  wrap: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 3 },
  dot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
};
