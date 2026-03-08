import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

// Admin/DevAdmin login uses phone + Firebase OTP (same flow, different UI)
// For simplicity in the web dashboard we use a token-based login
// (Admin accounts are pre-created by DevAdmin and given a login link/code)

export default function Login() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  // NOTE: Firebase web SDK for phone auth — same flow as mobile
  // In production: integrate Firebase JS SDK here
  // For now, placeholder that calls backend directly with a test token
  async function handleLogin() {
    setLoading(true);
    try {
      toast.error('Integrate Firebase Web SDK here for production OTP flow');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>⛽ Lucky Stop</h1>
        <h2 style={styles.subtitle}>Admin Dashboard</h2>
        <p style={styles.note}>
          Sign in with your registered phone number.
          <br />
          Only authorized staff can access this panel.
        </p>

        <div style={styles.form}>
          <label style={styles.label}>Phone Number</label>
          <input
            style={styles.input}
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button style={styles.button} onClick={handleLogin} disabled={loading}>
            {loading ? 'Sending...' : 'Send Code'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' },
  card: { background: '#fff', borderRadius: 16, padding: 40, width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { fontSize: 32, fontWeight: 800, color: '#E63946', margin: 0 },
  subtitle: { color: '#1D3557', marginTop: 8, marginBottom: 4 },
  note: { color: '#6c757d', fontSize: 14, lineHeight: 1.6, marginBottom: 24 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontWeight: 600, fontSize: 14, color: '#212529' },
  input: { padding: '12px 16px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 16 },
  button: {
    padding: '14px 16px', backgroundColor: '#E63946', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer',
  },
};
