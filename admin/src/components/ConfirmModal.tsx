import { useState, useEffect, CSSProperties } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** If set, shows a text input and passes its value to onConfirm */
  withInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false,
  withInput = false, inputLabel, inputPlaceholder = '', inputRequired = false,
  onConfirm, onCancel,
}: ConfirmModalProps) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => { if (!open) setInputValue(''); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = !withInput || !inputRequired || inputValue.trim().length > 0;

  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...s.iconRow, background: danger ? '#fff5f5' : '#eff6ff' }}>
          <span style={{ fontSize: 28 }}>{danger ? '⚠️' : 'ℹ️'}</span>
        </div>
        <div style={s.body}>
          <h3 style={s.title}>{title}</h3>
          <p style={s.message}>{message}</p>
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
            <button style={s.cancelBtn} onClick={onCancel}>{cancelLabel}</button>
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
  confirmDanger: { background: '#E63946', color: '#fff' },
  confirmPrimary: { background: '#1D3557', color: '#fff' },
};
