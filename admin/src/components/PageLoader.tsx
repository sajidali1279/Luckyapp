export default function PageLoader() {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logoWrap}>
          <span style={s.logoEmoji}>⛽</span>
        </div>
        <div style={s.spinnerTrack}>
          <div style={s.spinnerArc} />
        </div>
        <p style={s.label}>Loading…</p>
      </div>

      <style>{`
        @keyframes ls-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ls-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ls-page-loader-card {
          animation: ls-fade-in 0.3s ease both;
        }
        .ls-spinner-arc {
          animation: ls-spin 0.85s linear infinite;
        }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f2f5 0%, #e8ecf0 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    animation: 'ls-fade-in 0.3s ease both',
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(29,53,87,0.25)',
  },
  logoEmoji: { fontSize: 36 },
  spinnerTrack: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '3px solid rgba(29,53,87,0.12)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerArc: {
    position: 'absolute',
    inset: -3,
    borderRadius: '50%',
    border: '3px solid transparent',
    borderTopColor: '#1D3557',
    borderRightColor: '#1D3557',
    animation: 'ls-spin 0.85s linear infinite',
  } as React.CSSProperties,
  label: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
};
