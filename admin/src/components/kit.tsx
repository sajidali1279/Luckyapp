// The admin's shared building blocks (the calm, professional look chosen 2026-09-29). Pages use these instead of
// their own header, tab, button, card and badge styles, so every page looks like the same product.
// Colours and sizes come from lib/theme.ts; hover and focus come from the .ui-* classes in index.css.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { NAV_ITEMS } from '../lib/navItems';
import { C, FONT, RADIUS, SHADOW } from '../lib/theme';

// ─── Page ────────────────────────────────────────────────────────────────────

export function Page({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ padding: 'clamp(16px, 3vw, 28px) clamp(16px, 3.5vw, 32px) 40px', ...style }}>{children}</div>;
}

/** The one page header: a navy band with the page's icon (taken from the menu), its title, one line of what the page is for,
 * and the page's actions on the right. Inside the band the main button turns brand red and the others turn light (index.css). */
export function PageHeader({ title, description, actions, icon, children }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon | null; children?: ReactNode;
}) {
  const { pathname } = useLocation();
  const fromMenu = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(i.to + '/')))?.icon;
  const Icon = icon === null ? null : (icon ?? fromMenu ?? null);
  return (
    <div className="ui-band" style={{
      background: 'linear-gradient(135deg, #1D3557 0%, #152a47 100%)', borderRadius: RADIUS.lg + 2, padding: '20px 24px',
      marginBottom: 20, color: '#fff', boxShadow: '0 6px 20px rgba(15, 29, 49, 0.16)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {Icon && (
            <span aria-hidden="true" style={{
              width: 44, height: 44, borderRadius: 11, background: C.brand, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(214, 40, 57, 0.35)',
            }}><Icon size={22} color="#fff" /></span>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: FONT.page, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{title}</h1>
            {description && <p style={{ margin: '3px 0 0', fontSize: FONT.body, color: 'rgba(255, 255, 255, 0.74)', lineHeight: 1.5 }}>{description}</p>}
          </div>
        </div>
        {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</div>}
      </div>
      {children && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

/** A heading inside a page, with an optional count and an action on the right. */
export function SectionTitle({ children, count, action, style }: { children: ReactNode; count?: number; action?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 12px', ...style }}>
      <h2 style={{ margin: 0, fontSize: FONT.section, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
        {children}
        {count != null && <span style={{ fontSize: FONT.caption, fontWeight: 600, color: C.muted, background: C.hover, borderRadius: 999, padding: '1px 8px' }}>{count}</span>}
      </h2>
      {action}
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';

/** primary = the page's main action (one per view); secondary = everything else; ghost = quiet; danger = delete. */
export function Button({ variant = 'secondary', size = 'md', icon, children, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: ReactNode;
}) {
  const cls = ['ui-btn', `ui-btn-${variant}`, size === 'sm' ? 'ui-btn-sm' : '', className ?? ''].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest}>{icon}{children}</button>;
}

// ─── Tabs and chips ──────────────────────────────────────────────────────────

export type TabItem<T extends string> = { value: T; label: ReactNode; count?: number };

/** The one tab style: text with an underline on the chosen tab, an optional count beside it. */
export function Tabs<T extends string>({ tabs, value, onChange, ariaLabel, style }: {
  tabs: TabItem<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string; style?: CSSProperties;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="ui-tabs" style={{ marginBottom: 20, ...style }}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className="ui-tab" onClick={() => onChange(t.value)}>
          {t.label}
          {t.count != null && <span className="ui-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A choice among a few options shown as buttons (a category, a duration, a mode). */
export function Chip({ selected, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return <button type="button" className="ui-chip" aria-pressed={!!selected} {...rest}>{children}</button>;
}

// ─── Surfaces ────────────────────────────────────────────────────────────────

export function Card({ children, style, padding = 20, muted, className }: {
  children: ReactNode; style?: CSSProperties; padding?: number | string; muted?: boolean; className?: string;
}) {
  return (
    <div className={className} style={{
      background: muted ? C.subtle : C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg,
      boxShadow: muted ? 'none' : SHADOW.card, padding, ...style,
    }}>{children}</div>
  );
}

export function StatTile({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card padding="16px 18px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: FONT.small, color: C.muted, fontWeight: 500 }}>
        {icon && <span style={{ display: 'flex', color: C.muted }}>{icon}</span>}
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 650, color: C.text, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: FONT.caption, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </Card>
  );
}

// ─── Badges and notices ──────────────────────────────────────────────────────

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: C.text2, bg: C.hover, border: C.border },
  info: { fg: C.primary, bg: C.primaryTint, border: '#d3dcea' },
  success: { fg: C.success, bg: C.successTint, border: '#c8e6d2' },
  warning: { fg: C.warning, bg: C.warningTint, border: '#f1dcaf' },
  danger: { fg: C.danger, bg: C.dangerTint, border: '#f3cdd1' },
};

/** A small label. Use a colour only when it means something: success = live/paid, warning = waiting, danger = failed/removed. */
export function Badge({ tone = 'neutral', children, icon, style }: { tone?: Tone; children: ReactNode; icon?: ReactNode; style?: CSSProperties }) {
  const t = TONES[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: RADIUS.sm,
      fontSize: FONT.caption, fontWeight: 600, color: t.fg, background: t.bg, border: `1px solid ${t.border}`, whiteSpace: 'nowrap', ...style,
    }}>{icon}{children}</span>
  );
}

/** A line of guidance or a warning inside a page or form. */
export function Notice({ tone = 'info', children, icon, style }: { tone?: Tone; children: ReactNode; icon?: ReactNode; style?: CSSProperties }) {
  const t = TONES[tone];
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: RADIUS.md,
      background: t.bg, border: `1px solid ${t.border}`, color: tone === 'neutral' ? C.text2 : t.fg, fontSize: FONT.body, lineHeight: 1.5, ...style,
    }}>
      {icon && <span style={{ display: 'flex', marginTop: 2, flexShrink: 0 }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <Card muted style={{ textAlign: 'center', padding: '40px 24px', borderStyle: 'dashed' }}>
      {icon && <div style={{ display: 'flex', justifyContent: 'center', color: C.muted, marginBottom: 10 }}>{icon}</div>}
      <div style={{ fontSize: FONT.body, fontWeight: 600, color: C.text }}>{title}</div>
      {description && <div style={{ fontSize: FONT.body, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{description}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </Card>
  );
}

// ─── Forms ───────────────────────────────────────────────────────────────────

/** A labelled form field. The label sits above in sentence case, the hint below in gray. */
export function Field({ label, htmlFor, hint, required, children, style }: {
  label: ReactNode; htmlFor?: string; hint?: ReactNode; required?: boolean; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <label htmlFor={htmlFor} style={{ fontSize: FONT.small, fontWeight: 600, color: C.text2 }}>
        {label}{required && <span style={{ color: C.muted, fontWeight: 400 }}> (required)</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: FONT.caption, color: C.muted, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}
