import { useId, useRef, CSSProperties, ReactNode } from 'react';
import { X } from 'lucide-react';
import { C, SHADOW, TEXT_MUTED } from '../lib/theme';
import { useDialog } from '../hooks/useDialog';

/**
 * A panel that slides in from the right over the page (2026-11-20, the Stores page): for everything about one row of a list. It is a
 * dialog like Modal (Escape closes it, Tab stays inside, focus goes back to the row), and a Modal opened from inside it sits on top.
 * Full width on a phone. Render it only while it is open.
 */
export default function SidePanel({ title, subtitle, header, onClose, busy = false, width = 500, children }: {
  title: string; subtitle?: ReactNode; header?: ReactNode; onClose: () => void; busy?: boolean; width?: number; children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(true, ref, onClose, busy);
  return (
    <div style={s.overlay} onClick={busy ? undefined : onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="ui-sidepanel"
        style={{ ...s.panel, width: `min(${width}px, 100vw)` }} onClick={(e) => e.stopPropagation()}>
        <div style={s.head}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id={titleId} style={s.title}>{title}</h2>
            {subtitle && <div style={s.subtitle}>{subtitle}</div>}
            {header}
          </div>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" style={s.close} onClick={onClose} disabled={busy} aria-label="Close"><X /></button>
        </div>
        <div style={s.body}>{children}</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.35)', zIndex: 8000, display: 'flex', justifyContent: 'flex-end' },
  panel: {
    outline: 'none', height: '100%', background: C.surface, borderLeft: `1px solid ${C.border}`, boxShadow: SHADOW.pop,
    display: 'flex', flexDirection: 'column', boxSizing: 'border-box', animation: 'ui-slide-in 160ms ease-out',
  },
  head: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px 14px', borderBottom: `1px solid ${C.border}` },
  title: { fontSize: 18, fontWeight: 650, color: C.text, margin: 0 },
  subtitle: { fontSize: 13, color: TEXT_MUTED, marginTop: 3 },
  close: { width: 30, padding: 0, flexShrink: 0, color: TEXT_MUTED },
  body: { flex: 1, overflowY: 'auto', padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
};
