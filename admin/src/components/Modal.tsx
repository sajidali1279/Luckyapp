import { useId, useRef, CSSProperties, ReactNode } from 'react';
import { X } from 'lucide-react';
import { C, SHADOW, TEXT_MUTED } from '../lib/theme';
import { useDialog } from '../hooks/useDialog';

interface ModalProps {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  /** True while something is being saved: Escape, the overlay and the close button stop working so it cannot be interrupted or sent twice. */
  busy?: boolean;
  maxWidth?: number;
  children: ReactNode;
}

/**
 * A real dialog for forms and longer content (ConfirmModal is the one for a question with two answers): announced as a dialog with
 * its title, closes with Escape, keeps Tab inside, starts focus inside (an input marked autoFocus keeps it), hands focus back to
 * the button that opened it, and stops the page behind from scrolling. Render it only while it is open.
 */
export default function Modal({ title, subtitle, onClose, busy = false, maxWidth = 460, children }: ModalProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useDialog(true, ref, onClose, busy);

  return (
    <div style={s.overlay} onClick={busy ? undefined : onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ ...s.box, maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={s.title}>{title}</h2>
            {subtitle && <div style={s.subtitle}>{subtitle}</div>}
          </div>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" style={s.close} onClick={onClose} disabled={busy} aria-label="Close"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9000, padding: 16, boxSizing: 'border-box',
  },
  box: {
    outline: 'none', background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, width: '100%', boxSizing: 'border-box',
    boxShadow: SHADOW.pop, display: 'flex', flexDirection: 'column', gap: 18,
    maxHeight: '88vh', overflowY: 'auto',
  },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 17, fontWeight: 600, color: C.text, margin: 0 },
  subtitle: { fontSize: 14, color: TEXT_MUTED, marginTop: 4, lineHeight: 1.5 },
  close: { width: 30, padding: 0, flexShrink: 0, color: TEXT_MUTED },
};
