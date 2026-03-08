import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

type Tab = 'super-admin' | 'staff';

export default function Staff() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const [tab, setTab] = useState<Tab>(isDevAdmin ? 'super-admin' : 'staff');

  // Super Admin form
  const [saPhone, setSaPhone] = useState('');
  const [saName, setSaName] = useState('');
  const [saPin, setSaPin] = useState('');

  // Staff form
  const [stPhone, setStPhone] = useState('');
  const [stName, setStName] = useState('');
  const [stPin, setStPin] = useState('');
  const [stRole, setStRole] = useState<'EMPLOYEE' | 'STORE_MANAGER'>('EMPLOYEE');
  const [stStoreId, setStStoreId] = useState('');

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });
  const stores = storesData?.data?.data || [];

  const createSuperAdmin = useMutation({
    mutationFn: (d: { phone: string; name: string; pin: string }) =>
      authApi.createSuperAdmin(d.phone, d.name, d.pin),
    onSuccess: () => {
      toast.success('Super Admin account created');
      setSaPhone(''); setSaName(''); setSaPin('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create account'),
  });

  const createStaff = useMutation({
    mutationFn: (d: { phone: string; name: string; pin: string; role: string; storeId: string }) =>
      authApi.createStaff(d.phone, d.name, d.pin, d.role, d.storeId),
    onSuccess: () => {
      toast.success('Staff account created');
      setStPhone(''); setStName(''); setStPin(''); setStStoreId('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create account'),
  });

  function formatPhone(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function handleSuperAdmin(e: React.FormEvent) {
    e.preventDefault();
    const phone = saPhone.replace(/\D/g, '');
    if (phone.length < 10) { toast.error('Enter a valid phone number'); return; }
    if (saName.trim().length < 1) { toast.error('Name is required'); return; }
    if (saPin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    createSuperAdmin.mutate({ phone, name: saName.trim(), pin: saPin });
  }

  function handleStaff(e: React.FormEvent) {
    e.preventDefault();
    const phone = stPhone.replace(/\D/g, '');
    if (phone.length < 10) { toast.error('Enter a valid phone number'); return; }
    if (stName.trim().length < 1) { toast.error('Name is required'); return; }
    if (stPin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    if (!stStoreId) { toast.error('Select a store'); return; }
    createStaff.mutate({ phone, name: stName.trim(), pin: stPin, role: stRole, storeId: stStoreId });
  }

  return (
    <div style={s.container}>
      <h1 style={s.title}>👥 Staff Management</h1>
      <p style={s.sub}>Create accounts for admins and store staff</p>

      <div style={s.tabs}>
        {isDevAdmin && (
          <button style={{ ...s.tab, ...(tab === 'super-admin' ? s.tabActive : {}) }} onClick={() => setTab('super-admin')}>
            Super Admin (HQ)
          </button>
        )}
        <button style={{ ...s.tab, ...(tab === 'staff' ? s.tabActive : {}) }} onClick={() => setTab('staff')}>
          Store Staff
        </button>
      </div>

      {tab === 'super-admin' && isDevAdmin && (
        <div style={s.section}>
          <div style={s.infoBox}>
            <strong>Super Admin</strong> — one account that manages all 14 stores. Can create offers,
            banners, promos, and view all store transactions. Use this for LuckyStop HQ staff.
          </div>
          <form style={s.form} onSubmit={handleSuperAdmin}>
            <label style={s.label}>Full Name</label>
            <input style={s.input} value={saName} onChange={(e) => setSaName(e.target.value)} placeholder="e.g. John Smith (HQ Manager)" />
            <label style={s.label}>Phone Number</label>
            <input style={s.input} type="tel" value={saPhone} onChange={(e) => setSaPhone(formatPhone(e.target.value))} placeholder="(555) 000-0000" />
            <label style={s.label}>4-Digit PIN</label>
            <input
              style={{ ...s.input, letterSpacing: 8, fontSize: 20, textAlign: 'center', width: 160 }}
              type="password" value={saPin}
              onChange={(e) => setSaPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4} inputMode="numeric" placeholder="••••"
            />
            <p style={s.hint}>Share the PIN securely with the staff member. They can change it after logging in.</p>
            <button style={s.btn} type="submit" disabled={createSuperAdmin.isPending}>
              {createSuperAdmin.isPending ? 'Creating...' : 'Create Super Admin Account'}
            </button>
          </form>
        </div>
      )}

      {tab === 'staff' && (
        <div style={s.section}>
          <div style={s.infoBox}>
            <strong>Store Staff</strong> — assign to a specific store. <strong>Store Manager</strong> can view
            transactions and manage their store's employees. <strong>Employee/Cashier</strong> can scan
            customer QR codes and grant points (receipt required).
          </div>
          <form style={s.form} onSubmit={handleStaff}>
            <label style={s.label}>Full Name</label>
            <input style={s.input} value={stName} onChange={(e) => setStName(e.target.value)} placeholder="e.g. Maria Garcia" />
            <label style={s.label}>Phone Number</label>
            <input style={s.input} type="tel" value={stPhone} onChange={(e) => setStPhone(formatPhone(e.target.value))} placeholder="(555) 000-0000" />
            <label style={s.label}>4-Digit PIN</label>
            <input
              style={{ ...s.input, letterSpacing: 8, fontSize: 20, textAlign: 'center', width: 160 }}
              type="password" value={stPin}
              onChange={(e) => setStPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4} inputMode="numeric" placeholder="••••"
            />
            <label style={s.label}>Role</label>
            <select style={s.input} value={stRole} onChange={(e) => setStRole(e.target.value as any)}>
              <option value="EMPLOYEE">Employee / Cashier</option>
              <option value="STORE_MANAGER">Store Manager</option>
            </select>
            <label style={s.label}>Assign to Store</label>
            <select style={s.input} value={stStoreId} onChange={(e) => setStStoreId(e.target.value)}>
              <option value="">Select a store...</option>
              {stores.map((store: any) => (
                <option key={store.id} value={store.id}>{store.name} — {store.city}</option>
              ))}
            </select>
            <p style={s.hint}>Share the PIN securely with the staff member. They can change it after logging in.</p>
            <button style={s.btn} type="submit" disabled={createStaff.isPending}>
              {createStaff.isPending ? 'Creating...' : 'Create Staff Account'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 800, margin: '0 auto' },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginBottom: 24 },
  tabs: { display: 'flex', gap: 8, marginBottom: 24 },
  tab: { padding: '10px 20px', borderRadius: 8, border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#6c757d' },
  tabActive: { background: '#1D3557', color: '#fff', border: '1px solid #1D3557' },
  section: {},
  infoBox: { background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '14px 18px', fontSize: 14, color: '#374151', marginBottom: 24, lineHeight: 1.6 },
  form: { background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontWeight: 600, fontSize: 13, color: '#212529' },
  input: { padding: '11px 14px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15, width: '100%', boxSizing: 'border-box' as const },
  hint: { fontSize: 12, color: '#6c757d', margin: '0' },
  btn: { background: '#E63946', color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontWeight: 700, cursor: 'pointer', fontSize: 15, marginTop: 8 },
};
