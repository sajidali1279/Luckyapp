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
      if (['CUSTOMER', 'EMPLOYEE'].includes(user.role)) {
        toast.error('You do not have admin access');
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
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.logo}>⛽ Lucky Stop</h1>
        <h2 style={s.subtitle}>Admin Dashboard</h2>
        <p style={s.note}>Sign in with your registered phone number and PIN.</p>

        <form style={s.form} onSubmit={handleLogin}>
          <label style={s.label}>Phone Number</label>
          <input
            style={s.input}
            type="tel"
            placeholder="(555) 000-0000"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            autoComplete="tel"
          />

          <label style={s.label}>4-Digit PIN</label>
          <input
            style={{ ...s.input, letterSpacing: 8, fontSize: 20, textAlign: 'center' }}
            type="password"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            inputMode="numeric"
          />

          <button style={s.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' },
  card: { background: '#fff', borderRadius: 16, padding: 40, width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { fontSize: 32, fontWeight: 800, color: '#E63946', margin: 0 },
  subtitle: { color: '#1D3557', marginTop: 8, marginBottom: 4 },
  note: { color: '#6c757d', fontSize: 14, lineHeight: 1.6, marginBottom: 24 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontWeight: 600, fontSize: 14, color: '#212529' },
  input: { padding: '12px 16px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 16, outline: 'none' },
  button: {
    padding: '14px 16px', backgroundColor: '#E63946', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8,
  },
};
