import { useState } from 'react';
import { handleGlowMove } from '../../lib/motion';
import { formatInteger } from '../../components/formater';
import { TEXT_MUTED, PRIMARY } from '../../lib/theme';
import { s, storeBadge, storeColor, badgeInk, SectionHeader, SkeletonBox, SkeletonCards, PanelError, readSetting, writeSetting } from './shared';
import { useLaunchStats } from './queries';

// How the launch is going: who signed up, who claimed the welcome reward, who has bought something.
// The server counts from launch day only, so test accounts from before it never show up here.

type Totals = { signups: number; claimed: number; confirmed: number; purchased: number; stalled: number };
type DailyRow = { date: string; signups: number; firstPurchases: number };
type StoreRow = { id: string; name: string; city: string; firstPurchases: number; rewardsConfirmed: number };
type LaunchData =
  | { started: false; launchDate: string; daysToLaunch: number }
  | {
      started: true; launchDate: string; dayNumber: number; totals: Totals;
      today: { signups: number; firstPurchases: number }; daily: DailyRow[];
      rewards: { rewardType: string; count: number }[]; stores: StoreRow[]; testAccountsLeftOut: number;
    };

const REWARD_LABEL: Record<string, { icon: string; label: string }> = {
  FOUNTAIN_DRINK: { icon: '🥤', label: 'Fountain drink' },
  COFFEE: { icon: '☕', label: 'Coffee' },
  SODA_12OZ: { icon: '🥤', label: '12 oz soda' },
  HOT_SNACK: { icon: '🌮', label: 'Hot snack' },
};

const SIGNUP_COLOR = '#457B9D';
const PURCHASE_COLOR = '#2DC653';
const VIEWS = ['shown', 'hidden'] as const;

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

// A reply that is not the shape we expect (an older server, a proxy page) must show the error
// panel, not crash the page. Nothing else on the Dashboard catches a render error.
function isLaunchData(x: any): x is LaunchData {
  if (!x || typeof x !== 'object' || typeof x.launchDate !== 'string') return false;
  if (x.started === false) return typeof x.daysToLaunch === 'number';
  return x.started === true && typeof x.dayNumber === 'number' && !!x.totals && typeof x.totals.signups === 'number'
    && !!x.today && Array.isArray(x.daily) && Array.isArray(x.stores) && Array.isArray(x.rewards);
}

// Four cards fill the row (the shared grid leaves room for six)
const cardGrid: React.CSSProperties = { ...s.kpiGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' };

/** 'YYYY-MM-DD' shown as a calendar date, built from its parts so no timezone can move it a day. */
function dateLabel(key: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts);
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Card({ icon, bg, color, label, value, sub }: {
  icon: string; bg: string; color: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="dash-card" style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }} onMouseMove={handleGlowMove}>
      <div style={{ ...s.kpiIconWrap, background: bg, marginBottom: 10 }}><span style={{ fontSize: 17 }}>{icon}</span></div>
      <div style={{ fontSize: 25, fontWeight: 900, color, letterSpacing: -0.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color }} aria-hidden="true" />{label}
    </span>
  );
}

function Message({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ ...s.offersPanel, padding: '22px 22px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
      <div style={{ fontSize: 34, lineHeight: 1 }} aria-hidden="true">{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: PRIMARY }}>{title}</div>
        <div style={{ fontSize: 14.5, color: TEXT_MUTED, marginTop: 3, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
}

// ── Where new customers get to ───────────────────────────────────────────────

function Steps({ t }: { t: Totals }) {
  const steps = [
    { label: 'Signed up', n: t.signups, color: SIGNUP_COLOR },
    { label: 'Claimed a welcome reward', n: t.claimed, color: '#7B2FBE' },
    { label: 'Reward handed over at a store', n: t.confirmed, color: '#F4A261' },
    { label: 'Made a first purchase', n: t.purchased, color: PURCHASE_COLOR },
  ];
  return (
    <div style={s.offersPanel}>
      <div style={s.offersPanelHeader}>
        <span style={s.offersPanelTitle}>Where new customers get to</span>
        <span style={{ fontSize: 13, color: TEXT_MUTED }}>Share of sign-ups</span>
      </div>
      <div style={{ padding: '14px 18px 18px', display: 'grid', gap: 14 }}>
        {steps.map((st) => {
          const p = pct(st.n, t.signups);
          return (
            <div key={st.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                <span>{st.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>
                  {formatInteger(st.n)} <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>· {p}%</span>
                </span>
              </div>
              <div style={{ height: 9, background: '#f1f3f5', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${st.n > 0 ? Math.max(p, 2) : 0}%`, height: '100%', background: st.color, borderRadius: 6 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sign-ups and first purchases, day by day ─────────────────────────────────

function DailyChart({ daily }: { daily: DailyRow[] }) {
  const days = daily.slice(-14);
  if (!days.length) return null;
  const max = Math.max(1, ...days.flatMap((d) => [d.signups, d.firstPurchases]));
  const W = 440, H = 150, top = 16, bottom = 22;
  const plotH = H - top - bottom;
  const base = top + plotH;
  const slot = W / days.length;
  const bw = Math.min(16, slot * 0.36);
  const barH = (v: number) => (v > 0 ? Math.max(3, (v / max) * plotH) : 0);
  const short = (key: string) => dateLabel(key, { month: 'short', day: 'numeric' });
  const totalSignups = days.reduce((a, d) => a + d.signups, 0);
  const totalFirst = days.reduce((a, d) => a + d.firstPurchases, 0);

  return (
    <div style={s.offersPanel}>
      <div style={s.offersPanelHeader}>
        <span style={s.offersPanelTitle}>Per day</span>
        <span style={{ display: 'inline-flex', gap: 14, fontSize: 12.5, color: TEXT_MUTED, fontWeight: 600, flexWrap: 'wrap' as const }}>
          <Legend color={SIGNUP_COLOR} label="Sign-ups" />
          <Legend color={PURCHASE_COLOR} label="First purchases" />
        </span>
      </div>
      <div style={{ padding: '10px 14px 12px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}
          aria-label={`Last ${days.length} days: ${totalSignups} sign-ups and ${totalFirst} first purchases`}>
          <line x1={0} x2={W} y1={base} y2={base} stroke="#e5e7eb" />
          {days.map((d, i) => {
            const cx = slot * i + slot / 2;
            const h1 = barH(d.signups);
            const h2 = barH(d.firstPurchases);
            return (
              <g key={d.date} aria-hidden="true">
                <rect x={cx - bw - 1} y={base - h1} width={bw} height={h1} rx={2.5} fill={SIGNUP_COLOR} />
                <rect x={cx + 1} y={base - h2} width={bw} height={h2} rx={2.5} fill={PURCHASE_COLOR} />
                {d.signups > 0 && <text x={cx - bw / 2 - 1} y={base - h1 - 3} textAnchor="middle" fontSize="10" fontWeight="700" fill={SIGNUP_COLOR}>{d.signups}</text>}
                {d.firstPurchases > 0 && <text x={cx + bw / 2 + 1} y={base - h2 - 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1f9d43">{d.firstPurchases}</text>}
              </g>
            );
          })}
          <text x={0} y={H - 5} fontSize="10.5" fill={TEXT_MUTED}>{short(days[0].date)}</text>
          <text x={W} y={H - 5} textAnchor="end" fontSize="10.5" fill={TEXT_MUTED}>{days.length > 1 ? `${short(days[days.length - 1].date)} (today)` : 'today'}</text>
        </svg>
      </div>
    </div>
  );
}

// ── By store ─────────────────────────────────────────────────────────────────

const storeRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 124px 74px', gap: 12, alignItems: 'center',
  padding: '9px 18px', borderTop: '1px solid #f3f4f6',
};

function StoreTable({ stores }: { stores: StoreRow[] }) {
  const maxFirst = Math.max(1, ...stores.map((x) => x.firstPurchases));
  const idle = stores.filter((x) => x.firstPurchases === 0 && x.rewardsConfirmed === 0).length;
  return (
    <div style={{ ...s.offersPanel, marginBottom: 20 }}>
      <div style={s.offersPanelHeader}>
        <span style={s.offersPanelTitle}>By store</span>
        <span style={{ fontSize: 13, color: TEXT_MUTED }}>
          {idle === 0 ? 'Every store has started' : `${idle} of ${stores.length} stores have nothing yet`}
        </span>
      </div>
      <div style={{ ...storeRow, borderTop: 'none', padding: '8px 18px', fontSize: 12, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
        <span>Store</span><span>First purchases</span><span style={{ textAlign: 'right' as const }}>Rewards</span>
      </div>
      {stores.map((st, i) => {
        const quiet = st.firstPurchases === 0 && st.rewardsConfirmed === 0;
        return (
          <div key={st.id} style={{ ...storeRow, opacity: quiet ? 0.55 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span aria-hidden="true" style={{
                width: 30, height: 30, borderRadius: 9, background: storeColor(i), color: badgeInk(storeColor(i)), fontSize: 12.5, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{storeBadge(st.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: PRIMARY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{st.name}</div>
                <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>{st.city}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 8, background: '#f1f3f5', borderRadius: 5, overflow: 'hidden' }} aria-hidden="true">
                <div style={{ width: `${st.firstPurchases > 0 ? Math.max((st.firstPurchases / maxFirst) * 100, 6) : 0}%`, height: '100%', background: PURCHASE_COLOR, borderRadius: 5 }} />
              </div>
              <span style={{ minWidth: 22, textAlign: 'right' as const, fontSize: 14.5, fontWeight: 800, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{formatInteger(st.firstPurchases)}</span>
            </div>
            <span style={{ textAlign: 'right' as const, fontSize: 14.5, fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{formatInteger(st.rewardsConfirmed)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── The section ──────────────────────────────────────────────────────────────

export default function LaunchTracker() {
  const [hidden, setHidden] = useState(() => readSetting('dash-launch', VIEWS, 'shown') === 'hidden');
  const q = useLaunchStats(!hidden);
  const setShown = (show: boolean) => { setHidden(!show); writeSetting('dash-launch', show ? 'shown' : 'hidden'); };

  if (hidden) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 14px', marginBottom: 18, background: '#fff', border: '1px dashed #dee2e6', borderRadius: 10 }}>
        <span style={{ fontSize: 13.5, color: TEXT_MUTED, fontWeight: 600 }}>🚀 Launch tracker is hidden</span>
        <button style={s.sectionLink} onClick={() => setShown(true)}>Show</button>
      </div>
    );
  }

  const raw = q.data?.data?.data;
  const d: LaunchData | undefined = isLaunchData(raw) ? raw : undefined;
  const unusable = !q.isLoading && !d; // the call worked but the answer is not something we can draw
  const hideButton = <button style={s.sectionLink} onClick={() => setShown(false)} aria-label="Hide the launch tracker">Hide</button>;

  let subtitle = 'Sign-ups, welcome rewards and first purchases since launch day.';
  if (d?.started) {
    const day = dateLabel(d.launchDate, { weekday: 'long', month: 'long', day: 'numeric' });
    subtitle = `Customers who signed up since ${day}, day ${d.dayNumber} of the launch.`
      + (d.testAccountsLeftOut > 0 ? ` ${d.testAccountsLeftOut} test ${d.testAccountsLeftOut === 1 ? 'account' : 'accounts'} left out.` : '');
  }

  let body: React.ReactNode;
  if (q.isError || unusable) {
    body = <PanelError label="the launch tracker" onRetry={() => q.refetch()} />;
  } else if (q.isLoading || !d) {
    body = (<><SkeletonCards n={4} /><SkeletonBox h={220} /></>);
  } else if (!d.started) {
    const day = dateLabel(d.launchDate, { weekday: 'long', month: 'long', day: 'numeric' });
    body = (
      <Message icon="🚀" title={`Launch day is ${day}`}
        body={`${d.daysToLaunch === 1 ? 'Tomorrow.' : `${d.daysToLaunch} days to go.`} Sign-ups, welcome rewards and first purchases start counting that day.`} />
    );
  } else if (d.totals.signups === 0) {
    body = (
      <Message icon="🌱" title="No sign-ups yet"
        body="The first new customer will show up here within a minute of signing up. Numbers 111 to 555 are treated as test accounts and left out." />
    );
  } else {
    const t = d.totals;
    body = (
      <>
        <div style={cardGrid}>
          <Card icon="🙋" bg="#eff6ff" color={SIGNUP_COLOR} label="Sign-ups" value={formatInteger(t.signups)} sub={`${formatInteger(d.today.signups)} today`} />
          <Card icon="🎁" bg="#fdf4ff" color="#7B2FBE" label="Claimed a reward" value={formatInteger(t.claimed)} sub={`${pct(t.claimed, t.signups)}% of sign-ups`} />
          <Card icon="🧾" bg="#f0fdf4" color="#157A3E" label="Made a purchase" value={formatInteger(t.purchased)} sub={`${pct(t.purchased, t.signups)}% of sign-ups, ${formatInteger(d.today.firstPurchases)} today`} />
          <Card icon="⏳" bg="#fff7ed" color={t.stalled > 0 ? '#b45309' : '#6b7280'} label="No purchase yet" value={formatInteger(t.stalled)} sub="Signed up 2 or more days ago" />
        </div>
        <div style={s.twoColRow}>
          <Steps t={t} />
          <DailyChart daily={d.daily} />
        </div>
        <StoreTable stores={d.stores} />
        {d.rewards.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: 28, fontSize: 13.5, color: TEXT_MUTED }}>
            <span style={{ fontWeight: 700 }}>Welcome rewards picked:</span>
            {d.rewards.map((r) => {
              const info = REWARD_LABEL[r.rewardType] ?? { icon: '🎁', label: r.rewardType };
              return (
                <span key={r.rewardType} style={{ background: '#fff', border: '1px solid #e9ecef', borderRadius: 20, padding: '3px 11px', fontWeight: 600, color: '#374151' }}>
                  {info.icon} {info.label} · {formatInteger(r.count)}
                </span>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <SectionHeader title="Launch Tracker" subtitle={subtitle} right={hideButton} />
      {body}
    </div>
  );
}
