import { useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  function formatPhone(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const rawPhone = phone.replace(/\D/g, '');
    if (rawPhone.length < 10) { toast.error('Enter a valid 10-digit phone number'); return; }
    if (pin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    setLoading(true);
    try {
      const { data } = await authApi.login(rawPhone, pin);
      const user = data.data.user;
      if (!['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'].includes(user.role)) {
        toast.error('Access denied. Employees and customers use the mobile app.');
        return;
      }
      setAuth(user, data.data.token);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      {/* Left branding panel */}
      <div style={s.brand}>
        <div style={s.brandInner}>
          <div style={s.logo}>⛽</div>
          <h1 style={s.brandName}>Lucky Stop</h1>
          <p style={s.brandTag}>Admin Command Center</p>
          <div style={s.featureList}>
            {[
              { icon: '📢', text: 'Create offers for all 14 stores' },
              { icon: '👥', text: 'Manage staff and customers' },
              { icon: '🧾', text: 'Review transactions in real time' },
              { icon: '📊', text: 'Track revenue and subscriptions' },
            ].map((f) => (
              <div key={f.text} style={s.featureRow}>
                <span style={s.featureIcon}>{f.icon}</span>
                <span style={s.featureText}>{f.text}</span>
              </div>
            ))}
          </div>
          <div style={s.storeCount}>
            <span style={s.storeNum}>14</span>
            <span style={s.storeLabel}>Lucky Stop Locations</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div style={s.formPanel}>
        <div style={s.formCard}>
          <h2 style={s.formTitle}>Welcome back</h2>
          <p style={s.formSub}>Sign in with your admin credentials</p>

          <form style={s.form} onSubmit={handleLogin}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Phone Number</label>
              <input
                style={s.input}
                type="tel"
                placeholder="(555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                autoComplete="tel"
              />
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>4-Digit PIN</label>
              <input
                style={{ ...s.input, ...s.pinInput }}
                type="password"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                inputMode="numeric"
              />
            </div>

            <button style={{ ...s.button, ...(loading ? s.buttonDisabled : {}) }} type="submit" disabled={loading}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={s.spinner} /> Signing in...
                </span>
              ) : 'Sign In →'}
            </button>
          </form>

          <p style={s.hint}>For Dev Admins, Super Admins, and Store Managers.<br />Employees and customers use the mobile app.</p>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh' },

  brand: {
    width: 420, background: 'linear-gradient(160deg, #1D3557 0%, #0d1f33 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48,
    flexShrink: 0,
  },
  brandInner: { display: 'flex', flexDirection: 'column', gap: 0 },
  logo: { fontSize: 56, marginBottom: 16 },
  brandName: { color: '#fff', fontSize: 36, fontWeight: 900, margin: 0 },
  brandTag: { color: 'rgba(255,255,255,0.55)', fontSize: 15, marginTop: 6, marginBottom: 40 },

  featureList: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 48 },
  featureRow: { display: 'flex', alignItems: 'center', gap: 14 },
  featureIcon: { fontSize: 22, width: 36, textAlign: 'center' },
  featureText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },

  storeCount: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 20px',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  storeNum: { color: '#F4A261', fontSize: 32, fontWeight: 900 },
  storeLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.3 },

  formPanel: {
    flex: 1, background: '#f8f9fa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
  },
  formCard: {
    background: '#fff', borderRadius: 20, padding: 48, width: '100%', maxWidth: 420,
    boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
  },
  formTitle: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  formSub: { color: '#6c757d', marginTop: 8, marginBottom: 32, fontSize: 15 },

  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 600, fontSize: 13, color: '#212529' },
  input: {
    padding: '13px 16px', borderRadius: 10, border: '1.5px solid #dee2e6',
    fontSize: 16, outline: 'none', transition: 'border-color 0.2s',
    width: '100%', boxSizing: 'border-box' as const,
  },
  pinInput: { letterSpacing: 10, fontSize: 22, textAlign: 'center' },

  button: {
    padding: '14px 16px', background: '#E63946', color: '#fff',
    border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700,
    cursor: 'pointer', marginTop: 8, transition: 'opacity 0.2s',
  },
  buttonDisabled: { opacity: 0.7, cursor: 'not-allowed' },
  spinner: {
    width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
    borderTopColor: '#fff', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', display: 'inline-block',
  },

  hint: { color: '#adb5bd', fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 1.6 },
};
