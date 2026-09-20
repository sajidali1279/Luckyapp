import { Component, CSSProperties, ReactNode } from 'react';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

// Without this, one page that receives something it did not expect blanks the whole app, sidebar included.
// Placed around a page, the sidebar stays and the person gets a way out. Placed at the very top, it is the last resort.

interface Props {
  children: ReactNode;
  /** When this changes (a different page), a shown error is cleared. */
  resetKey?: string;
  /** Runs on "Try again", e.g. to empty the data cache so the page does not fail again on the same bad reply. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, copied: false });
  }

  copyDetails = () => {
    const e = this.state.error;
    if (!e) return;
    const text = [
      'Lucky Stop Admin error',
      `When: ${new Date().toISOString()}`,
      `Page: ${window.location.pathname}`,
      `${e.name}: ${e.message}`,
      (e.stack || '').split('\n').slice(1, 6).join('\n'),
    ].join('\n');
    navigator.clipboard?.writeText(text).then(() => this.setState({ copied: true })).catch(() => {});
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={s.wrap} role="alert">
        <div style={s.card}>
          <div style={s.icon} aria-hidden="true">⚠️</div>
          <h1 style={s.title}>This page ran into a problem</h1>
          <p style={s.text}>The rest of the admin still works. Try again, or go back to the Dashboard. If it keeps happening, copy the details and send them to support.</p>
          <div style={s.buttons}>
            <button type="button" style={s.primary} onClick={() => { this.props.onReset?.(); this.setState({ error: null, copied: false }); }}>Try again</button>
            <a href="/" style={s.secondary}>Go to the Dashboard</a>
            <button type="button" style={s.secondary} onClick={this.copyDetails}>{this.state.copied ? 'Copied' : 'Copy details'}</button>
          </div>
        </div>
      </div>
    );
  }
}

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', justifyContent: 'center', padding: '64px 20px' },
  card: {
    background: '#fff', border: '1px solid #f0f1f2', borderRadius: 18, padding: '36px 32px', maxWidth: 480,
    textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  icon: { fontSize: 38 },
  title: { fontSize: 20, fontWeight: 800, color: PRIMARY, margin: '10px 0 8px' },
  text: { fontSize: 15, color: TEXT_MUTED, lineHeight: 1.55, margin: '0 0 20px' },
  buttons: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  primary: { padding: '10px 20px', borderRadius: 10, background: PRIMARY, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  secondary: {
    padding: '10px 18px', borderRadius: 10, background: '#fff', color: PRIMARY, border: '1px solid #dee2e6',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  },
};
