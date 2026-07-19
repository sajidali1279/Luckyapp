import { CSSProperties } from 'react';
import { TEXT_MUTED } from '../lib/theme';

interface ComingSoonProps {
  feature: string;
}

export default function ComingSoon({ feature }: ComingSoonProps) {
  return (
    <div style={s.wrap}>
      <div style={s.icon}>🚧</div>
      <h2 style={s.title}>{feature}</h2>
      <p style={s.sub}>This is coming in a future release. Check back soon.</p>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '60vh', gap: 12,
    textAlign: 'center', padding: 24,
  },
  icon: { fontSize: 40, opacity: 0.4 },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' },
  sub: { fontSize: 14, color: TEXT_MUTED, maxWidth: 380 },
};
