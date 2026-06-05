import { useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { Particles } from '../components/ui/particles';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
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
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0c0e12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Particles className="absolute inset-0" color="#444444" ease={30} quantity={100} staticity={60} />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', margin: '0 16px' }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #1D3557 0%, #2c6fad 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: 1,
            boxShadow: '0 8px 24px rgba(29,53,87,0.5)',
          }}>
            LS
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '36px 32px 28px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
        }}>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: -0.3 }}>
            Welcome back
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '0 0 28px' }}>
            Sign in to your admin account
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Phone Number</label>
              <input
                type="tel"
                placeholder="(555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                autoComplete="tel"
                style={inputStyle}
                onFocus={(e) => Object.assign(e.currentTarget.style, inputFocusStyle)}
                onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>4-Digit PIN</label>
              <input
                type="password"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                inputMode="numeric"
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: 12, fontSize: 20 }}
                onFocus={(e) => Object.assign(e.currentTarget.style, { ...inputFocusStyle, textAlign: 'center', letterSpacing: '12px', fontSize: '20px' })}
                onBlur={(e) => Object.assign(e.currentTarget.style, { ...inputStyle, textAlign: 'center', letterSpacing: '12px', fontSize: '20px' })}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                {[0,1,2,3].map((i) => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: 4,
                    background: i < pin.length ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.15)',
                    transition: 'background 0.15s',
                  }} />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '13px 16px', marginTop: 4,
                background: '#fff', color: '#0c0e12',
                border: 'none', borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)',
                    borderTopColor: '#0c0e12', borderRadius: '50%',
                    display: 'inline-block', animation: 'spin 0.7s linear infinite',
                  }} />
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setShowForgot(true)}
            style={{
              marginTop: 16, width: '100%', background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer',
              textAlign: 'center', transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            Forgot PIN?
          </button>

          <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 1.7 }}>
            For Dev Admins, Super Admins, and Store Managers only.
            <br />Employees use the mobile app.
          </p>
        </div>
      </div>

      {/* Forgot PIN Modal */}
      {showForgot && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setShowForgot(false)}
        >
          <div
            style={{ background: '#161920', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', padding: '24px 24px 28px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 700, margin: 0 }}>Forgot PIN?</h3>
              <button
                onClick={() => setShowForgot(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0, lineHeight: 1.65 }}>
                PINs can only be reset by an administrator.
              </p>
              <ul style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
                <li><span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Employees & Managers</span> — ask your store manager or a Super Admin to reset your PIN from the Staff page.</li>
                <li style={{ marginTop: 8 }}><span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Super Admins</span> — contact your Lucky Stop developer to reset your PIN.</li>
              </ul>
              <button
                onClick={() => setShowForgot(false)}
                style={{
                  marginTop: 8, background: 'rgba(255,255,255,0.08)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                  padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12, color: '#fff', fontSize: 15, outline: 'none',
  transition: 'border-color 0.15s, background 0.15s',
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'rgba(255,255,255,0.08)',
  borderColor: 'rgba(255,255,255,0.25)',
};

const labelStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.8,
};
