import { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import Glyph from '../components/Glyph';

// Shown for an address that does not exist, instead of quietly landing on the Dashboard.
export default function NotFound() {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.icon} aria-hidden="true"><Glyph e="🧭" size={28} color="#5a6472" /></div>
        <h1 style={s.title}>Page not found</h1>
        <p style={s.text}>That page does not exist, or the link is out of date.</p>
        <Link to="/" style={s.button}>Go to the Dashboard</Link>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', justifyContent: 'center', padding: '64px 20px' },
  card: {
    background: '#fff', border: '1px solid #e4e7ec', borderRadius: 12, padding: '36px 32px', maxWidth: 440,
    textAlign: 'center', boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
  },
  icon: { fontSize: 38 },
  title: { fontSize: 20, fontWeight: 700, color: PRIMARY, margin: '10px 0 8px' },
  text: { fontSize: 15, color: TEXT_MUTED, lineHeight: 1.55, margin: '0 0 20px' },
  button: { display: 'inline-block', padding: '10px 22px', borderRadius: 10, background: PRIMARY, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
};
