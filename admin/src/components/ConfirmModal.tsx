import { useState, useEffect, useId, useRef, CSSProperties, ReactNode } from 'react';
import { PRIMARY } from '../lib/theme';
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
        <div style={{ ...s.iconRow, background: danger ? '#fff5f5' : '#eff6ff' }}>
          <span style={{ fontSize: 28 }}>{danger ? '⚠️' : 'ℹ️'}</span>
        </div>
        <div style={s.body}>
          {headingLevel === 'h2'
            ? <h2 id={titleId} style={s.title}>{title}</h2>
            : <h3 id={titleId} style={s.title}>{title}</h3>}
          <div style={s.message}>{message}</div>
          {withInput && (
            <>
              {inputLabel && <label style={s.inputLabel}>{inputLabel}</label>}
              <textarea
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
            <button style={s.cancelBtn} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
            <button
              style={{ ...s.confirmBtn, ...(danger ? s.confirmDanger : s.confirmPrimary) }}
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
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, backdropFilter: 'blur(2px)',
  },
  modal: {
    outline: 'none',
    background: '#fff', borderRadius: 18,
    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
    width: '100%', maxWidth: 420,
    overflow: 'hidden',
  },
  iconRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px 0 20px',
  },
  body: { padding: '0 28px 24px' },
  title: {
    fontSize: 18, fontWeight: 800, color: '#111827',
    margin: '0 0 8px', textAlign: 'center',
  },
  message: {
    fontSize: 15, color: '#4b5563', textAlign: 'center',
    margin: '0 0 20px', lineHeight: 1.55,
  },
  inputLabel: {
    display: 'block', fontSize: 13, fontWeight: 700,
    color: '#374151', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  textarea: {
    width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #e5e7eb', borderRadius: 10,
    padding: '10px 12px', fontSize: 14,
    resize: 'vertical', marginBottom: 20,
    outline: 'none', fontFamily: 'inherit',
  },
  btns: { display: 'flex', gap: 10 },
  cancelBtn: {
    flex: 1, padding: '11px', borderRadius: 10,
    background: '#f3f4f6', border: '1px solid #e5e7eb',
    fontSize: 15, fontWeight: 700, color: '#374151',
    cursor: 'pointer',
  },
  confirmBtn: {
    flex: 1, padding: '11px', borderRadius: 10,
    border: 'none', fontSize: 15, fontWeight: 700,
    cursor: 'pointer',
  },
  confirmDanger: { background: '#D62839', color: '#fff' }, // #E63946 with white text is 3.8:1, this is 5:1
  confirmPrimary: { background: PRIMARY, color: '#fff' },
};
