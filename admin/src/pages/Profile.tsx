import { useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev Admin',
  SUPER_ADMIN: 'Super Admin',
  STORE_MANAGER: 'Store Manager',
};

export default function Profile() {
  const { user, setAuth, logout } = useAuthStore();

  const [name, setName] = useState(user?.name || '');
  const [nameLoading, setNameLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name cannot be empty'); return; }
    setNameLoading(true);
    try {
      await authApi.updateProfile(name.trim());
      setAuth({ ...user!, name: name.trim() }, localStorage.getItem('jwt_token')!);
      toast.success('Name updated');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update name');
    } finally { setNameLoading(false); }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Enter an email address'); return; }
    setEmailLoading(true);
    try {
      await authApi.updateEmail(email.trim());
      toast.success('Recovery email saved');
      setEmail('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save email');
    } finally { setEmailLoading(false); }
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault();
    if (currentPin.length !== 4) { toast.error('Current PIN must be 4 digits'); return; }
    if (newPin.length !== 4) { toast.error('New PIN must be 4 digits'); return; }
    if (newPin !== confirmPin) { toast.error('PINs do not match'); return; }
    setPinLoading(true);
    try {
      await authApi.changePin(currentPin, newPin);
      toast.success('PIN changed — please sign in again');
      setTimeout(() => { logout(); window.location.href = '/login'; }, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to change PIN');
    } finally { setPinLoading(false); }
  }

  const initials = (user?.name || user?.phone || '?').slice(0, 2).toUpperCase();

  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div style={s.avatar}>{initials}</div>
          <div>
            <h1 style={s.title}>{user?.name || 'No name set'}</h1>
            <div style={s.meta}>
              <span style={s.role}>{ROLE_LABELS[user?.role || ''] || user?.role}</span>
              <span style={s.phone}>{user?.phone}</span>
            </div>
          </div>
        </div>

        <div style={s.grid}>

          {/* ── Update Name ── */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>Display Name</h2>
            <p style={s.cardSub}>This name appears in the admin panel and reports.</p>
            <form onSubmit={handleUpdateName} style={s.form}>
              <label style={s.label}>Full Name</label>
              <input
                style={s.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
              <button style={s.btn} type="submit" disabled={nameLoading}>
                {nameLoading ? 'Saving…' : 'Save Name'}
              </button>
            </form>
          </div>

          {/* ── Recovery Email ── */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>Recovery Email</h2>
            <p style={s.cardSub}>Used for PIN reset OTP codes. Set this so you can recover your account.</p>
            <form onSubmit={handleUpdateEmail} style={s.form}>
              <label style={s.label}>Email Address</label>
              <input
                style={s.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoCapitalize="none"
              />
              <button style={s.btn} type="submit" disabled={emailLoading}>
                {emailLoading ? 'Saving…' : 'Save Email'}
              </button>
            </form>
          </div>

          {/* ── Change PIN ── */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>Change PIN</h2>
            <p style={s.cardSub}>You will be signed out after changing your PIN.</p>
            <form onSubmit={handleChangePin} style={s.form}>
              <label style={s.label}>Current PIN</label>
              <input
                style={{ ...s.input, ...s.pinInput }}
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                maxLength={4}
                inputMode="numeric"
              />
              <label style={s.label}>New PIN</label>
              <input
                style={{ ...s.input, ...s.pinInput }}
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                maxLength={4}
                inputMode="numeric"
              />
              <label style={s.label}>Confirm New PIN</label>
              <input
                style={{ ...s.input, ...s.pinInput }}
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                maxLength={4}
                inputMode="numeric"
              />
              <button style={{ ...s.btn, ...s.btnDanger }} type="submit" disabled={pinLoading}>
                {pinLoading ? 'Changing…' : 'Change PIN'}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f0f2f5', padding: '32px 24px' },
  inner: { maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 },

  header: {
    display: 'flex', alignItems: 'center', gap: 20,
    background: '#fff', borderRadius: 20, padding: '28px 32px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
  avatar: {
    width: 64, height: 64, borderRadius: 20, flexShrink: 0,
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 900, fontSize: 24,
  },
  title: { fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 },
  meta: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 },
  role: {
    background: '#EEF2FF', color: '#4f46e5',
    borderRadius: 6, padding: '2px 10px',
    fontSize: 12, fontWeight: 700,
  },
  phone: { color: '#9ca3af', fontSize: 14 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 },

  card: {
    background: '#fff', borderRadius: 20, padding: '24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: 800, color: '#111827', margin: 0 },
  cardSub: { fontSize: 13, color: '#9ca3af', margin: '0 0 8px', lineHeight: 1.5 },

  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: 15,
    outline: 'none', background: '#f9fafb', color: '#111827',
    width: '100%', boxSizing: 'border-box' as const,
  },
  pinInput: { letterSpacing: 10, fontSize: 20, textAlign: 'center' as const },

  btn: {
    marginTop: 8, padding: '12px 16px',
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    color: '#fff', border: 'none', borderRadius: 10,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  btnDanger: { background: 'linear-gradient(135deg, #dc2626, #b91c1c)' },
};
