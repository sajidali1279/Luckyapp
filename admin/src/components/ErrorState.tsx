import { CSSProperties } from 'react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }: ErrorStateProps) {
  return (
    <div style={s.wrap}>
      <div style={s.icon}>⚠️</div>
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
  msg: { fontSize: 15, color: '#6b7280', textAlign: 'center', maxWidth: 340, lineHeight: 1.5 },
  btn: {
    marginTop: 4, padding: '9px 22px', borderRadius: 10,
    background: '#1D3557', color: '#fff', border: 'none',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
};
