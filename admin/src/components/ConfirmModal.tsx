import { useState, useEffect, useId, useRef, CSSProperties, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { C, SHADOW, INPUT } from '../lib/theme';
import { useDialog } from '../hooks/useDialog';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Plain text, or a few lines of markup (who, how much, why) for decisions that move money. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** True while the action is running: both buttons are disabled so it cannot be sent twice. */
  busy?: boolean;
  /** True while the box is still finding out what it is about to do: the confirm button stays off until it is known. */
  confirmDisabled?: boolean;
  /** If set, shows a text input and passes its value to onConfirm */
  withInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  /** h3 (the default) fits every page whose own page title renders before this dialog in the JSX tree. A page whose title lives in a
   * parent that renders it AFTER a component that can open this dialog (e.g. a tab panel mounted below the page header) needs 'h2'
   * instead, so a screen reader never meets an h3 with no h1/h2 before it in document order while the dialog is open. */
  headingLevel?: 'h2' | 'h3';
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, busy = false, confirmDisabled = false,
  withInput = false, inputLabel, inputPlaceholder = '', inputRequired = false,
  headingLevel = 'h3',
  onConfirm, onCancel,
}: ConfirmModalProps) {
  const [inputValue, setInputValue] = useState('');
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setInputValue(''); }, [open]);

  // Starts focus inside (a dialog with a text box focuses that box itself), keeps Tab inside, Escape cancels, the page behind stays put,
  // and focus goes back to the button that opened it
  useDialog(open, dialogRef, onCancel, busy);

  if (!open) return null;

  const canConfirm = !busy && !confirmDisabled && (!withInput || !inputRequired || inputValue.trim().length > 0);

  return (
    <div style={s.overlay} onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.body}>
          <div style={s.head}>
            {danger && <span style={s.dangerIcon} aria-hidden="true"><AlertTriangle size={18} /></span>}
            {headingLevel === 'h2'
              ? <h2 id={titleId} style={s.title}>{title}</h2>
              : <h3 id={titleId} style={s.title}>{title}</h3>}
          </div>
          <div style={s.message}>{message}</div>
          {withInput && (
            <>
              {inputLabel && <label style={s.inputLabel}>{inputLabel}</label>}
              <textarea
                className="ui-input"
                style={s.textarea}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder}
                rows={3}
                autoFocus
              />
            </>
          )}
          <div style={s.btns}>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
            <button
              type="button"
              className={`ui-btn ${danger ? 'ui-btn-danger-solid' : 'ui-btn-primary'}`}
              onClick={() => onConfirm(withInput ? inputValue : undefined)}
              disabled={!canConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 16, boxSizing: 'border-box',
  },
  modal: {
    outline: 'none',
    background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
    boxShadow: SHADOW.pop,
    width: '100%', maxWidth: 440,
    overflow: 'hidden',
  },
  body: { padding: '22px 24px 20px' },
  head: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  dangerIcon: {
    width: 32, height: 32, borderRadius: 12, background: C.dangerTint, color: C.danger, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: 600, color: C.text, margin: 0 },
  message: { fontSize: 14, color: C.text2, margin: '0 0 20px', lineHeight: 1.55 },
  inputLabel: { display: 'block', fontSize: 13, fontWeight: 600, color: C.text2, marginBottom: 6 },
  textarea: { ...INPUT, resize: 'vertical', marginBottom: 20 },
  btns: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
};
