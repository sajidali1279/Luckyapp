import { useNavigate } from 'react-router-dom';
import ErrorState from '../../components/ErrorState';
import { Skeleton } from '../../components/ui/skeleton';
import { handleGlowMove, TRANSITION_FAST, TRANSITION_TRANSFORM } from '../../lib/motion';
import { formatDate, formatFullCurrency } from '../../components/formater';
import { TEXT_MUTED, PRIMARY } from '../../lib/theme';

// ── Formatting and small helpers ─────────────────────────────────────────────

export const fmt$ = formatFullCurrency;
export const fmtDay = (iso: string) => formatDate(iso, 'day-month');
export const axisMoney = (v: number | string) => `$${Math.round(Number(v)).toLocaleString('en-US')}`;

export const CAT_ICONS: Record<string, string> = {
  GROCERIES: '🛒', FROZEN_FOODS: '🧊', FRESH_FOODS: '🥗',
  GAS: '⛽', DIESEL: '🚛', HOT_FOODS: '🌮', OTHER: '🏪',
};

const AVATAR_PALETTE = ['#E63946', '#457B9D', '#2DC653', '#F4A261', '#7B2FBE', '#0077B6', '#E76F51', '#2A9D8F', '#E9C46A', '#264653', '#6A0572', PRIMARY];
export function storeColor(i: number) { return AVATAR_PALETTE[i % AVATAR_PALETTE.length]; }
export const MEDALS = ['🥇', '🥈', '🥉'];

// "Lucky Stop #4" -> "4". A name without a number (every store name starts with "Lucky") uses the
// initials of the words after the first, so "Lucky Truck Stop" -> "TS" instead of the same "L" for all.
export function storeBadge(name: string) {
  const m = name.match(/#\s*(\d+)/);
  if (m) return m[1];
  const words = name.split(/\s+/).filter(Boolean);
  return (words.slice(1).map((w) => w[0]).join('') || words[0]?.[0] || '?').slice(0, 2).toUpperCase();
}

export function daysUntil(iso: string) { return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000); }

export function agoLabel(iso: string | null) {
  if (!iso) return 'No sales yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Last sale today';
  return days === 1 ? 'Last sale yesterday' : `Last sale ${days} days ago`;
}

/** "3 min ago", "5 h ago", "2 days ago". */
export function since(iso: string | null | undefined) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 48) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

export function whenLabel(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

// Clickable non-button elements get a real button role and Enter/Space support.
export function activate(fn: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    },
  };
}

/** Parse the JSON string the API stores in a transaction's fraudFlags column. */
export function parseFlags(raw: unknown): string[] {
  if (!raw) return [];
  try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : []; } catch { return []; }
}

export const FRAUD_FLAG_LABELS: Record<string, string> = {
  HIGH_AMOUNT:       'High amount (non-gas)',
  LARGE_PURCHASE:    'Very large purchase (>$800)',
  CUSTOMER_VELOCITY: 'Customer has 4+ transactions today',
  EMPLOYEE_VELOCITY: 'Cashier granted 15+ times this hour',
  REPEAT_PAIR:       'Same cashier, same customer 2+ times today',
};

export function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch { /* storage unavailable */ }
  return fallback;
}
export function writeSetting(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// ── Loading and failure states, one per panel ────────────────────────────────
// A failed call must show up where the data would have been. Before this, a panel whose query
// failed simply vanished, so a broken feed looked like "no sales" or "all clear".

export function SkeletonCards({ n, h = 118 }: { n: number; h?: number }) {
  return (
    <div style={s.statsGrid} aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} style={{ height: h, borderRadius: 16 }} />)}
    </div>
  );
}

export function SkeletonBox({ h, mb = 28 }: { h: number; mb?: number }) {
  return <Skeleton style={{ height: h, borderRadius: 16, marginBottom: mb }} aria-busy="true" aria-label="Loading" />;
}

export function PanelError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div style={s.panelError}>
      <ErrorState compact message={`Couldn't load ${label}.`} onRetry={onRetry} />
    </div>
  );
}

// ── Shared building blocks ───────────────────────────────────────────────────

const STAT_BG: Record<string, string> = {
  '🧾': '#eff6ff', '💵': '#f0fdf4', '⭐': '#fefce8', '🎁': '#fdf4ff',
  '💰': '#f0fdf4', '📋': '#f0f9ff', '🏪': '#eff6ff', '🙋': '#fdf4ff',
  '👷': '#fff7ed', '📢': '#fef2f2', '🖼️': '#f5f3ff', '⏳': '#fff7ed', '📅': '#f0f9ff',
};

export function StatCard({ icon, label, value, valueColor = '#111827', to }: {
  icon: string; label: string; value: any; valueColor?: string; to?: string;
}) {
  const navigate = useNavigate();
  const bg = STAT_BG[icon] || '#f8fafc';
  return (
    <div
      className="dash-card"
      style={{ ...s.statCard, cursor: to ? 'pointer' : 'default' }}
      onMouseMove={handleGlowMove}
      {...(to ? { ...activate(() => navigate(to)), 'aria-label': `${label}: ${value}. Open` } : {})}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ ...s.statIconWrap, background: bg }}>
          <span style={s.statIcon}>{icon}</span>
        </div>
        {to && <span className="dash-stat-arrow" style={s.statArrow}>→</span>}
      </div>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: valueColor }}>{value}</div>
    </div>
  );
}

export function SectionHeader({ title, subtitle, action, right }: {
  title: string; subtitle?: string; action?: { label: string; to: string }; right?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div style={s.sectionHeader}>
      <div>
        <h2 style={s.section}>{title}</h2>
        {subtitle && <p style={s.sectionSub}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
        {right}
        {action && (
          <button className="dash-section-link" style={s.sectionLink} onClick={() => navigate(action.to)}>
            {action.label} →
          </button>
        )}
      </div>
    </div>
  );
}

/** A small segmented control: one option active at a time. */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div style={s.periodToggle} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          style={{ ...s.periodBtn, ...(value === o.id ? s.periodBtnOn : {}) }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tiny trend line for a KPI card. All-zero or empty data draws a flat baseline. */
export function Sparkline({ values, color, width = 80, height = 28 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${height - pad} L${x(0).toFixed(1)} ${height - pad} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "▲ 12.4%" against the previous period. `tone` says whether up is good, bad or just information. */
export function Delta({ cur, prev, label, tone = 'up-good' }: { cur: number; prev: number; label: string; tone?: 'up-good' | 'neutral' }) {
  if (prev === 0 && cur === 0) return <span style={{ ...s.delta, color: TEXT_MUTED }}>no change · {label}</span>;
  if (prev === 0) return <span style={{ ...s.delta, color: '#157A3E' }}>new · {label}</span>;
  const pct = ((cur - prev) / prev) * 100;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const color = flat || tone === 'neutral' ? TEXT_MUTED : up ? '#157A3E' : '#C62828';
  return (
    <span style={{ ...s.delta, color }} title={`Now ${cur.toLocaleString('en-US')} against ${prev.toLocaleString('en-US')} ${label}`}>
      {flat ? '•' : up ? '▲' : '▼'} {Math.abs(pct) >= 1000 ? '999%+' : `${Math.abs(pct).toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`} · {label}
    </span>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

export const s: Record<string, React.CSSProperties> = {
  container: { padding: '24px 32px' },

  welcomeCard: {
    background: 'linear-gradient(135deg, #12202f 0%, #1D3557 55%, #2a4a73 100%)',
    borderRadius: 18, padding: '18px 28px', marginBottom: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    boxShadow: '0 4px 24px rgba(29,53,87,0.28)',
    position: 'relative', overflow: 'hidden',
  },
  welcomeDate: {
    color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4,
  },
  welcomeTitle: { color: '#fff', fontSize: 24, fontWeight: 900, margin: 0 },
  welcomeSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, lineHeight: 1.5, margin: '4px 0 0' },
  roleBadge: {
    background: 'rgba(244,162,97,0.18)', color: '#F4A261',
    border: '1px solid rgba(244,162,97,0.35)',
    borderRadius: 24, padding: '8px 18px', fontWeight: 700, fontSize: 14,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  roleBadgeDev: { background: 'rgba(45,198,83,0.15)', color: '#2DC653', border: '1px solid rgba(45,198,83,0.3)' },

  toolRow: { display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' as const, marginBottom: 18 },
  quickActions: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, flex: 1, minWidth: 260 },
  quickBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#fff', border: '1px solid #e9ecef',
    borderRadius: 10, padding: '7px 11px',
    fontSize: 13.5, fontWeight: 600, color: '#374151',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: TRANSITION_FAST,
  },

  viewTabs: { display: 'flex', gap: 6, marginBottom: 18 },
  viewTab: {
    background: '#fff', border: '1px solid #dee2e6', borderRadius: 10, padding: '8px 18px',
    fontSize: 14.5, fontWeight: 700, color: TEXT_MUTED, cursor: 'pointer',
  },
  viewTabOn: { background: PRIMARY, borderColor: PRIMARY, color: '#fff' },

  sectionHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14, marginTop: 8, gap: 12, flexWrap: 'wrap' as const,
  },
  section: { fontSize: 15, fontWeight: 800, color: PRIMARY, margin: 0 },
  sectionSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 6, marginBottom: 0 },
  sectionLink: {
    background: 'none', border: '1px solid #dee2e6', borderRadius: 8,
    padding: '5px 12px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    color: TEXT_MUTED, transition: TRANSITION_FAST, whiteSpace: 'nowrap' as const,
    alignSelf: 'flex-start', marginTop: 2,
  },

  periodToggle: {
    display: 'inline-flex', background: '#fff', border: '1px solid #dee2e6', borderRadius: 8,
    padding: 2, gap: 2, marginTop: 2,
  },
  periodBtn: {
    background: 'none', border: 'none', borderRadius: 6, padding: '4px 11px',
    fontSize: 13, fontWeight: 600, color: TEXT_MUTED, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
  periodBtnOn: { background: PRIMARY, color: '#fff' },

  skewNote: {
    background: '#fff8e1', border: '1px solid #f5d98a', color: '#8a5a00', borderRadius: 10,
    padding: '9px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 12,
  },

  panelError: {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 28,
  },

  // needs-attention inbox
  inbox: {
    background: '#fff', border: '1.5px solid #F4A26155', borderRadius: 14, marginBottom: 22, overflow: 'hidden',
  },
  inboxHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const,
    padding: '12px 18px', background: '#fff8f0', borderBottom: '1px solid #F4A26133',
  },
  inboxTitle: { fontSize: 14, fontWeight: 800, color: '#92400e' },
  inboxRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderTop: '1px solid #f6f0e8',
    background: '#fff', width: '100%', textAlign: 'left' as const, border: 'none', cursor: 'pointer',
  },
  inboxDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  inboxText: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: '#1f2937' },
  inboxMeta: { fontSize: 13, color: TEXT_MUTED, fontWeight: 500 },
  inboxCount: {
    minWidth: 26, textAlign: 'center' as const, fontSize: 13, fontWeight: 800, color: '#fff',
    borderRadius: 13, padding: '2px 8px', flexShrink: 0,
  },
  inboxSnooze: {
    background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, padding: '3px 9px',
    fontSize: 12, fontWeight: 600, color: TEXT_MUTED, cursor: 'pointer', flexShrink: 0,
  },
  inboxClear: { padding: '14px 18px', fontSize: 14.5, fontWeight: 600, color: '#157A3E' },

  // KPI cards with a comparison
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(166px, 1fr))', gap: 12, marginBottom: 26 },
  kpiCard: {
    background: '#fff', borderRadius: 14, padding: '16px 16px 14px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
    border: '1px solid #f0f1f2', display: 'flex', flexDirection: 'column', gap: 0,
  },
  kpiIconWrap: { width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  delta: { fontSize: 12.5, fontWeight: 700, marginTop: 6, lineHeight: 1.35 },

  twoColRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 28, alignItems: 'start' },

  offersPanel: {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
  },
  offersPanelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: '1px solid #f0f1f2',
    background: '#fafbfc', gap: 8, flexWrap: 'wrap' as const,
  },
  offersPanelTitle: { fontSize: 15, fontWeight: 800, color: PRIMARY },
  offersGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14 },
  offerChip: {
    background: '#fff', border: '1.5px solid #e9ecef',
    borderRadius: 12, padding: '12px 14px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  offerChipTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  offerChipBadge: {
    fontSize: 11, fontWeight: 800, background: '#E63946', color: '#fff',
    borderRadius: 4, padding: '2px 6px', letterSpacing: 0.5,
  },
  offerChipRate: { fontSize: 14, fontWeight: 900, color: '#157A3E' },
  offerChipName: { fontSize: 15, fontWeight: 700, color: PRIMARY, marginBottom: 3, lineHeight: 1.3 },
  offerChipCat: { fontSize: 12, color: TEXT_MUTED, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  offerChipExpiry: { fontSize: 12, fontWeight: 600, marginTop: 6 },
  emptyState: { padding: '24px 18px', color: TEXT_MUTED, fontSize: 15, textAlign: 'center' as const },

  recentPanel: {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
  },
  feedGroup: {
    padding: '8px 18px', fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' as const,
    color: TEXT_MUTED, background: '#f8f9fa', borderTop: '1px solid #f0f1f2', borderBottom: '1px solid #f0f1f2',
  },
  recentRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 18px', borderBottom: '1px solid #f9fafb',
    transition: 'background 0.12s ease',
  },
  recentStatus: {
    fontSize: 12, fontWeight: 700, border: '1px solid', borderRadius: 20, padding: '2px 9px',
    flexShrink: 0, background: '#fff',
  },
  recentCustomer: { fontSize: 15, fontWeight: 700, color: '#111827' },
  recentMeta: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },
  recentFlags: { fontSize: 12, color: '#9B2335', fontWeight: 600, marginTop: 2 },
  recentAmount: { fontSize: 15, fontWeight: 800, color: PRIMARY, fontVariantNumeric: 'tabular-nums' },
  recentTime: { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  reviewBtn: {
    border: '1px solid', borderRadius: 8, padding: '5px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#fff',
  },

  // store health board
  boardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(236px, 1fr))', gap: 12, marginBottom: 30 },
  tile: {
    background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1.5px solid #f0f1f2',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 6,
  },
  tileHead: { display: 'flex', alignItems: 'center', gap: 9 },
  tileBadge: {
    width: 28, height: 28, borderRadius: 8, flexShrink: 0, color: '#fff', fontSize: 12.5, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  tileName: { fontSize: 14, fontWeight: 800, color: PRIMARY, lineHeight: 1.2 },
  tileCity: { fontSize: 12.5, color: TEXT_MUTED },
  tileBig: { fontSize: 24, fontWeight: 900, color: '#111827', fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 },
  tileLine: { fontSize: 12.5, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' },
  tileReason: { fontSize: 12.5, fontWeight: 700, lineHeight: 1.35 },

  chartBoxFull: {
    background: '#fff', borderRadius: 16, padding: '20px 20px 12px',
    border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 28,
  },
  chartBox: {
    background: '#fff', borderRadius: 16, padding: '20px 20px 12px',
    border: '1px solid #f0f1f2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  chartsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 28 },
  chartTitle: { fontSize: 14, fontWeight: 700, color: TEXT_MUTED, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  // auto-fit (not auto-fill) collapses grid tracks that have no card in
  // them, so a short row - a lone card, or a trailing card that doesn't
  // fill the last row - doesn't leave a strip of empty white space beside
  // it; remaining cards use the freed-up room to grow, up to the max.
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 260px))', gap: 14, marginBottom: 32 },
  statCard: {
    background: '#fff', borderRadius: 16, padding: '20px 18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    display: 'flex', flexDirection: 'column', gap: 8,
    border: '1px solid #f0f1f2', transition: TRANSITION_TRANSFORM,
  },
  statIconWrap: { width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statIcon: { fontSize: 22 },
  statArrow: { fontSize: 15, color: TEXT_MUTED, fontWeight: 700 },
  // minHeight reserves room for a two-line label so a short label ("Staff")
  // and a long one ("Subscriptions Collected") both leave the value number
  // starting at the same y position across a row of cards.
  statLabel: { color: TEXT_MUTED, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.3, minHeight: 34 },
  statValue: { fontSize: 26, fontWeight: 800, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' },

  healthOk: {
    color: '#157A3E', fontSize: 14, fontWeight: 600, background: 'rgba(45,198,83,0.08)',
    border: '1px solid rgba(45,198,83,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 8,
  },
  healthList: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 },
  healthRow: { borderRadius: 14, border: '1px solid', padding: '14px 18px', transition: TRANSITION_TRANSFORM },
  healthRowHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    cursor: 'pointer', flexWrap: 'wrap' as const, gap: 10,
  },
  healthRowName: { fontWeight: 700, fontSize: 15, color: PRIMARY },
  healthRowStats: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const },
  healthStat: { fontSize: 13, color: TEXT_MUTED },
  healthPill: {
    fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
    border: '1px solid', background: '#fff', transition: TRANSITION_FAST,
  },
  healthCategoryList: {
    marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  healthCategoryRow: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const, fontSize: 13, paddingLeft: 8 },
  healthCategoryName: { fontWeight: 600, color: '#374151', minWidth: 110 },

  storeTable: {
    background: '#fff', borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2', marginBottom: 32,
    // The table scrolls sideways inside this box; without this its min width still stretched the whole page.
    contain: 'inline-size',
  },
  storeTableHeader: {
    display: 'grid', gridTemplateColumns: 'minmax(220px, 2.4fr) 1fr 1.2fr 1.2fr 1.3fr', columnGap: 12,
    padding: '10px 20px', background: '#f8f9fa',
    fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  storeTableRow: {
    display: 'grid', gridTemplateColumns: 'minmax(220px, 2.4fr) 1fr 1.2fr 1.2fr 1.3fr', columnGap: 12,
    padding: '13px 20px', alignItems: 'center',
    borderTop: '1px solid #f0f1f2', transition: 'background 0.12s ease',
  },
  storeColName: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  storeColNum: { fontSize: 14, color: '#495057', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  storeColBar: { paddingRight: 12 },
  storeRank: { fontSize: 16, width: 26, textAlign: 'center' as const, flexShrink: 0 },
  storeAvatar: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 13, fontWeight: 800,
  },
  barTrack: { height: 7, background: '#f0f1f2', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: 'linear-gradient(90deg, #E63946, #1D3557)', borderRadius: 4, transition: 'width 0.6s ease' },

  ratesWrap: {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 36, overflow: 'hidden',
    contain: 'inline-size',
  },
  ratesTable: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  ratesTh: {
    padding: '12px 14px', fontSize: 13, fontWeight: 700, color: TEXT_MUTED, background: '#f8f9fa',
    textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #f0f1f2',
  },
  ratesTd: {
    padding: '11px 14px', fontSize: 14, textAlign: 'center', borderBottom: '1px solid #f5f6f7',
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
  },
  ratesLegend: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px',
    fontSize: 13, color: TEXT_MUTED, background: '#fafbfc', borderTop: '1px solid #f0f1f2',
  },
};
