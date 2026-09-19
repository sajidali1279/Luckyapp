import { CSSProperties } from 'react';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  /** Smaller box for a single failed panel inside a page that otherwise loaded. */
  compact?: boolean;
}

export default function ErrorState({ message = 'Something went wrong. Please try again.', onRetry, compact = false }: ErrorStateProps) {
  return (
    <div style={compact ? { ...s.wrap, ...s.wrapCompact } : s.wrap} role="alert">
      <div style={compact ? s.iconCompact : s.icon}>⚠️</div>
      <div style={s.msg}>{message}</div>
      {onRetry && (
        <button style={s.btn} onClick={onRetry}>Try Again</button>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '60px 20px', gap: 12,
  },
  icon: { fontSize: 36 },
  wrapCompact: { padding: '22px 16px', gap: 8 },
  iconCompact: { fontSize: 24 },
  msg: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', maxWidth: 340, lineHeight: 1.5 },
  btn: {
    marginTop: 4, padding: '9px 22px', borderRadius: 10,
    background: PRIMARY, color: '#fff', border: 'none',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
};
