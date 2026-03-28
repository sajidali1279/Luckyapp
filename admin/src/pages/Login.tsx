import { useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

type ForgotStep = 'request' | 'verify' | 'reset' | 'done';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneActive, setPhoneActive] = useState(false);
  const [pinActive, setPinActive] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  // Forgot PIN modal
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>('request');
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotResetToken, setForgotResetToken] = useState('');
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  function openForgot() {
    setForgotStep('request'); setForgotPhone(''); setForgotEmail('');
    setForgotOtp(''); setForgotResetToken(''); setForgotNewPin(''); setForgotConfirmPin('');
    setShowForgot(true);
  }

  async function handleForgotRequest() {
    const raw = forgotPhone.replace(/\D/g, '');
    if (raw.length < 10) { toast.error('Enter a valid phone number'); return; }
    setForgotLoading(true);
    try {
      const { data } = await authApi.forgotPin(raw, forgotEmail || undefined);
      if (data.otp) setForgotOtp(data.otp); // auto-fill OTP for testing
      toast.success(data.otp ? `Dev mode — OTP: ${data.otp}` : 'OTP sent to your email');
      setForgotStep('verify');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send OTP');
    } finally { setForgotLoading(false); }
  }

  async function handleForgotVerify() {
    if (forgotOtp.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setForgotLoading(true);
    try {
      const { data } = await authApi.verifyOtp(forgotPhone.replace(/\D/g, ''), forgotOtp);
      setForgotResetToken(data.resetToken ?? data.data?.resetToken);
      setForgotStep('reset');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid or expired code');
    } finally { setForgotLoading(false); }
  }

  async function handleForgotReset() {
    if (forgotNewPin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    if (forgotNewPin !== forgotConfirmPin) { toast.error('PINs do not match'); return; }
    setForgotLoading(true);
    try {
      await authApi.resetPin(forgotResetToken, forgotNewPin);
      setForgotStep('done');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reset PIN');
    } finally { setForgotLoading(false); }
  }

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
      {/* ── Left branding panel ── */}
      <div style={s.brand}>
        <div style={s.brandNoise} />
        <div style={s.brandInner}>
          <div style={s.logoWrap}>
            <span style={s.logoEmoji}>⛽</span>
          </div>
          <h1 style={s.brandName}>Lucky Stop</h1>
          <p style={s.brandTag}>Admin Command Center</p>

          <div style={s.divider} />

          <div style={s.featureList}>
            {[
              { icon: '📢', text: 'Create offers for all 14 stores', color: '#F4A261' },
              { icon: '👥', text: 'Manage staff and customers',      color: '#2DC653' },
              { icon: '🧾', text: 'Review transactions in real time', color: '#60a5fa' },
              { icon: '📊', text: 'Track revenue and subscriptions',  color: '#a78bfa' },
            ].map((f) => (
              <div key={f.text} style={s.featureRow}>
                <div style={{ ...s.featureIconWrap, background: f.color + '22', border: `1px solid ${f.color}33` }}>
                  <span style={s.featureIconEmoji}>{f.icon}</span>
                </div>
                <span style={s.featureText}>{f.text}</span>
              </div>
            ))}
          </div>

          <div style={s.storeCount}>
            <div>
              <span style={s.storeNum}>14</span>
              <span style={s.storeNumUnit}> stores</span>
            </div>
            <span style={s.storeDivider} />
            <span style={s.storeLabel}>All on one platform</span>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={s.formPanel}>
        <div style={s.formCard}>
          <div style={s.formTop}>
            <div style={s.formLogo}>LS</div>
            <div>
              <h2 style={s.formTitle}>Welcome back</h2>
              <p style={s.formSub}>Sign in to your admin account</p>
            </div>
          </div>

          <form style={s.form} onSubmit={handleLogin}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Phone Number</label>
              <div style={{ position: 'relative' }}>
                <span style={s.inputIcon}>📱</span>
                <input
                  style={{ ...s.input, paddingLeft: 44, ...(phoneActive ? s.inputActive : {}) }}
                  type="tel"
                  placeholder="(555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  onFocus={() => setPhoneActive(true)}
                  onBlur={() => setPhoneActive(false)}
                  autoComplete="tel"
                />
              </div>
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>4-Digit PIN</label>
              <div style={{ position: 'relative' }}>
                <span style={s.inputIcon}>🔒</span>
                <input
                  style={{ ...s.input, paddingLeft: 44, letterSpacing: 14, fontSize: 20, textAlign: 'center', ...(pinActive ? s.inputActive : {}) }}
                  type="password"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onFocus={() => setPinActive(true)}
                  onBlur={() => setPinActive(false)}
                  maxLength={4}
                  inputMode="numeric"
                />
              </div>
              <div style={s.pinDots}>
                {[0,1,2,3].map((i) => (
                  <div key={i} style={{ ...s.pinDot, ...(i < pin.length ? s.pinDotFilled : {}) }} />
                ))}
              </div>
            </div>

            <button
              style={{ ...s.button, ...(loading ? s.buttonLoading : {}) }}
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={s.spinner} /> Signing in…
                </span>
              ) : (
                <span>Sign In →</span>
              )}
            </button>
          </form>

          <button type="button" style={s.forgotLink} onClick={openForgot}>
            Forgot PIN?
          </button>

          <p style={s.hint}>For Dev Admins, Super Admins, and Store Managers only.<br />Employees and customers use the mobile app.</p>
        </div>
      </div>

      {/* ── Forgot PIN Modal ── */}
      {showForgot && (
        <div style={s.modalOverlay} onClick={() => setShowForgot(false)}>
          <div style={s.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>
                {forgotStep === 'request' && 'Forgot PIN'}
                {forgotStep === 'verify' && 'Enter Code'}
                {forgotStep === 'reset' && 'New PIN'}
                {forgotStep === 'done' && 'PIN Reset!'}
              </h3>
              <button style={s.modalClose} onClick={() => setShowForgot(false)}>✕</button>
            </div>

            {forgotStep === 'request' && (
              <div style={s.modalBody}>
                <p style={s.modalSub}>Enter your phone number and recovery email. We'll send a 6-digit code.</p>
                <label style={s.label}>Phone Number</label>
                <input style={s.input} type="tel" placeholder="(555) 000-0000"
                  value={forgotPhone} onChange={(e) => setForgotPhone(e.target.value)} autoFocus />
                <label style={{ ...s.label, marginTop: 12 }}>Recovery Email (optional)</label>
                <input style={s.input} type="email" placeholder="your@email.com" autoCapitalize="none"
                  value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                <button style={s.modalBtn} onClick={handleForgotRequest} disabled={forgotLoading}>
                  {forgotLoading ? 'Sending…' : 'Send Code'}
                </button>
              </div>
            )}

            {forgotStep === 'verify' && (
              <div style={s.modalBody}>
                <p style={s.modalSub}>Check your email for the 6-digit OTP. It expires in 10 minutes.</p>
                <label style={s.label}>OTP Code</label>
                <input style={{ ...s.input, fontSize: 24, letterSpacing: 10, textAlign: 'center' }}
                  type="text" placeholder="······" maxLength={6}
                  value={forgotOtp} onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
                <button style={s.modalBtn} onClick={handleForgotVerify} disabled={forgotLoading}>
                  {forgotLoading ? 'Verifying…' : 'Verify Code'}
                </button>
                <button style={s.modalLinkBtn} onClick={() => setForgotStep('request')}>← Go back</button>
              </div>
            )}

            {forgotStep === 'reset' && (
              <div style={s.modalBody}>
                <p style={s.modalSub}>Choose a new 4-digit PIN you haven't used recently.</p>
                <label style={s.label}>New PIN</label>
                <input style={{ ...s.input, fontSize: 24, letterSpacing: 14, textAlign: 'center' }}
                  type="password" placeholder="••••" maxLength={4} inputMode="numeric"
                  value={forgotNewPin} onChange={(e) => setForgotNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoFocus />
                <label style={{ ...s.label, marginTop: 12 }}>Confirm PIN</label>
                <input style={{ ...s.input, fontSize: 24, letterSpacing: 14, textAlign: 'center' }}
                  type="password" placeholder="••••" maxLength={4} inputMode="numeric"
                  value={forgotConfirmPin} onChange={(e) => setForgotConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                <button style={s.modalBtn} onClick={handleForgotReset} disabled={forgotLoading}>
                  {forgotLoading ? 'Resetting…' : 'Reset PIN'}
                </button>
              </div>
            )}

            {forgotStep === 'done' && (
              <div style={{ ...s.modalBody, textAlign: 'center' }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                <p style={s.modalSub}>Your PIN has been reset. You can now sign in with your new PIN.</p>
                <button style={s.modalBtn} onClick={() => setShowForgot(false)}>Back to Sign In</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh', fontFamily: 'inherit' },

  // Brand panel
  brand: {
    width: 440,
    background: 'linear-gradient(160deg, #0d1f33 0%, #1D3557 55%, #1a4a6e 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 52, flexShrink: 0, position: 'relative', overflow: 'hidden',
  },
  brandNoise: {
    position: 'absolute', inset: 0,
    backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(244,162,97,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(69,123,157,0.12) 0%, transparent 50%)',
    pointerEvents: 'none',
  },
  brandInner: { display: 'flex', flexDirection: 'column', gap: 0, zIndex: 1, width: '100%' },

  logoWrap: {
    width: 70, height: 70, borderRadius: 20,
    background: 'rgba(255,255,255,0.1)',
    border: '1.5px solid rgba(255,255,255,0.18)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  logoEmoji: { fontSize: 36 },

  brandName: { color: '#fff', fontSize: 34, fontWeight: 900, margin: 0, letterSpacing: -0.5 },
  brandTag: { color: 'rgba(255,255,255,0.45)', fontSize: 14, marginTop: 6, marginBottom: 0 },

  divider: { height: 1, background: 'rgba(255,255,255,0.1)', margin: '28px 0' },

  featureList: { display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 },
  featureRow: { display: 'flex', alignItems: 'center', gap: 12 },
  featureIconWrap: {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  featureIconEmoji: { fontSize: 18 },
  featureText: { color: 'rgba(255,255,255,0.78)', fontSize: 13.5, lineHeight: 1.4 },

  storeCount: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'rgba(255,255,255,0.07)', borderRadius: 14,
    padding: '16px 20px', border: '1px solid rgba(255,255,255,0.1)',
  },
  storeNum: { color: '#F4A261', fontSize: 28, fontWeight: 900 },
  storeNumUnit: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600 },
  storeDivider: { width: 1, height: 28, background: 'rgba(255,255,255,0.12)', flexShrink: 0 },
  storeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },

  // Form panel
  formPanel: {
    flex: 1,
    background: '#f0f2f5',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 40,
  },
  formCard: {
    background: '#fff', borderRadius: 24, padding: '44px 44px 36px',
    width: '100%', maxWidth: 420,
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 60px -10px rgba(0,0,0,0.12)',
  },

  formTop: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 },
  formLogo: {
    width: 48, height: 48, borderRadius: 14, flexShrink: 0,
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: 0.5,
  },
  formTitle: { fontSize: 24, fontWeight: 800, color: '#111827', margin: 0, letterSpacing: -0.3 },
  formSub: { color: '#9ca3af', marginTop: 3, fontSize: 14 },

  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 },
  inputIcon: {
    position: 'absolute', left: 14, top: '50%',
    transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none',
  },
  input: {
    padding: '13px 16px', borderRadius: 12,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb',
    fontSize: 16, outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
    background: '#f9fafb', color: '#111827',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  inputActive: {
    borderColor: '#1D3557',
    boxShadow: '0 0 0 3px rgba(29,53,87,0.1)',
    background: '#fff',
  },

  pinDots: { display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10 },
  pinDot: { width: 10, height: 10, borderRadius: 5, background: '#e5e7eb', transition: 'background 0.15s' },
  pinDotFilled: { background: '#1D3557' },

  button: {
    padding: '15px 16px',
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 16, fontWeight: 700, cursor: 'pointer',
    marginTop: 8, letterSpacing: 0.2,
    boxShadow: '0 4px 14px rgba(29,53,87,0.35)',
    transition: 'opacity 0.2s, transform 0.1s',
  },
  buttonLoading: { opacity: 0.75, cursor: 'not-allowed' },
  spinner: {
    width: 16, height: 16,
    border: '2px solid rgba(255,255,255,0.35)',
    borderTopColor: '#fff', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', display: 'inline-block',
  },

  hint: { color: '#9ca3af', fontSize: 11.5, textAlign: 'center', marginTop: 22, lineHeight: 1.7 },

  forgotLink: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#1D3557', fontSize: 13, fontWeight: 600,
    textDecoration: 'underline', padding: '4px 0', marginTop: 4, alignSelf: 'center',
    display: 'block', width: '100%', textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(2px)',
  },
  modalCard: {
    background: '#fff', borderRadius: 20, width: '100%', maxWidth: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6',
  },
  modalTitle: { fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 },
  modalClose: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 16, color: '#9ca3af', padding: 4, lineHeight: 1,
  },
  modalBody: { padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 8 },
  modalSub: { color: '#6b7280', fontSize: 13, margin: '0 0 8px', lineHeight: 1.6 },
  modalBtn: {
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    color: '#fff', border: 'none', borderRadius: 10,
    padding: '13px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8,
  },
  modalLinkBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#6b7280', fontSize: 13, fontWeight: 600, padding: '4px 0', textAlign: 'center',
  },
};
