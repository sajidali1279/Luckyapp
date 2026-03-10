import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi, storesApi, staffApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

type Tab = 'list' | 'create';

const ROLE_COLORS: Record<string, string> = {
  DEV_ADMIN: '#7c3aed',
  SUPER_ADMIN: '#1D3557',
  STORE_MANAGER: '#0369a1',
  EMPLOYEE: '#6c757d',
};

export default function Staff() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const [tab, setTab] = useState<Tab>('list');

  // Create form state
  const [createRole, setCreateRole] = useState<'SUPER_ADMIN' | 'STORE_MANAGER' | 'EMPLOYEE'>('EMPLOYEE');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [storeId, setStoreId] = useState('');

  // Reset PIN modal
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPin, setNewPin] = useState('');

  const { data: storesData } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll(), enabled: isSuperAdmin });
  const { data: staffData, isLoading } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list(), enabled: isSuperAdmin });

  const stores = storesData?.data?.data || [];
  const staffList: any[] = staffData?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (d: any) => {
      if (d.role === 'SUPER_ADMIN') return authApi.createSuperAdmin(d.phone, d.name, d.pin);
      return authApi.createStaff(d.phone, d.name, d.pin, d.role, d.storeId);
    },
    onSuccess: () => {
      toast.success('Account created');
      setPhone(''); setName(''); setPin(''); setStoreId('');
      qc.invalidateQueries({ queryKey: ['staff'] });
      setTab('list');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create account'),
  });

  const toggleMutation = useMutation({
    mutationFn: (userId: string) => staffApi.toggleActive(userId),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['staff'] }); },
    onError: () => toast.error('Failed to update'),
  });

  const resetPinMutation = useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) => staffApi.resetPin(userId, pin),
    onSuccess: () => {
      toast.success('PIN reset successfully');
      setResetTarget(null); setNewPin('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to reset PIN'),
  });

  function formatPhone(text: string) {
    const d = text.replace(/\D/g, '').slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const rawPhone = phone.replace(/\D/g, '');
    if (rawPhone.length < 10) { toast.error('Enter a valid phone number'); return; }
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (pin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    if (createRole !== 'SUPER_ADMIN' && !storeId) { toast.error('Select a store'); return; }
    createMutation.mutate({ phone: rawPhone, name: name.trim(), pin, role: createRole, storeId });
  }

  function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (newPin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    resetPinMutation.mutate({ userId: resetTarget!.id, pin: newPin });
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>👥 Staff Management</h1>
          <p style={s.sub}>Manage admin and store staff accounts</p>
        </div>
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(tab === 'list' ? s.tabActive : {}) }} onClick={() => setTab('list')}>Staff List</button>
          {isSuperAdmin && <button style={{ ...s.tab, ...(tab === 'create' ? s.tabActive : {}) }} onClick={() => setTab('create')}>+ Create Account</button>}
        </div>
      </div>

      {/* ── Staff List ── */}
      {tab === 'list' && (
        isLoading ? <div style={s.empty}>Loading...</div> :
        staffList.length === 0 ? <div style={s.empty}>No staff accounts yet.</div> : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Name</th>
                <th style={s.th}>Phone</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Store(s)</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((member: any) => (
                <tr key={member.id} style={member.isActive ? {} : { opacity: 0.5 }}>
                  <td style={s.td}><strong>{member.name || '—'}</strong></td>
                  <td style={s.td}>{member.phone}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: ROLE_COLORS[member.role] || '#6c757d' }}>
                      {member.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={s.td}>
                    {member.storeRoles.length > 0
                      ? member.storeRoles.map((sr: any) => sr.store.name).join(', ')
                      : <span style={{ color: '#6c757d' }}>All stores</span>}
                  </td>
                  <td style={s.td}>
                    <span style={{ color: member.isActive ? '#2DC653' : '#E63946', fontWeight: 600, fontSize: 13 }}>
                      {member.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={s.actionBtn} onClick={() => { setResetTarget({ id: member.id, name: member.name || member.phone }); setNewPin(''); }}>
                        Reset PIN
                      </button>
                      {member.id !== user?.id && (
                        <button
                          style={{ ...s.actionBtn, color: member.isActive ? '#E63946' : '#2DC653', borderColor: member.isActive ? '#E63946' : '#2DC653' }}
                          onClick={() => toggleMutation.mutate(member.id)}
                        >
                          {member.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* ── Create Account ── */}
      {tab === 'create' && (
        <form style={s.form} onSubmit={handleCreate}>
          <label style={s.label}>Account Type</label>
          <select style={s.input} value={createRole} onChange={(e) => setCreateRole(e.target.value as any)}>
            {isDevAdmin && <option value="SUPER_ADMIN">Super Admin — manages all stores (HQ)</option>}
            <option value="STORE_MANAGER">Store Manager — manages one store</option>
            <option value="EMPLOYEE">Employee / Cashier — scans QR codes</option>
          </select>

          <label style={s.label}>Full Name</label>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Garcia" />

          <label style={s.label}>Phone Number</label>
          <input style={s.input} type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(555) 000-0000" />

          <label style={s.label}>4-Digit PIN</label>
          <input
            style={{ ...s.input, letterSpacing: 8, fontSize: 20, textAlign: 'center', maxWidth: 160 }}
            type="password" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4} inputMode="numeric" placeholder="••••"
          />

          {createRole !== 'SUPER_ADMIN' && (
            <>
              <label style={s.label}>Assign to Store</label>
              <select style={s.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Select a store...</option>
                {stores.map((store: any) => (
                  <option key={store.id} value={store.id}>{store.name} — {store.city}</option>
                ))}
              </select>
            </>
          )}

          <p style={s.hint}>Share the phone number and PIN securely with the staff member. They can change their PIN after logging in.</p>
          <button style={s.btn} type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      )}

      {/* ── Reset PIN Modal ── */}
      {resetTarget && (
        <div style={s.overlay}>
          <form style={s.modal} onSubmit={handleResetPin}>
            <h3 style={{ margin: '0 0 8px' }}>Reset PIN</h3>
            <p style={s.hint}>Setting new PIN for <strong>{resetTarget.name}</strong></p>
            <label style={s.label}>New 4-Digit PIN</label>
            <input
              style={{ ...s.input, letterSpacing: 8, fontSize: 20, textAlign: 'center', maxWidth: 160, marginBottom: 16 }}
              type="password" value={newPin} autoFocus
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4} inputMode="numeric" placeholder="••••"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btn} type="submit" disabled={resetPinMutation.isPending}>
                {resetPinMutation.isPending ? 'Resetting...' : 'Reset PIN'}
              </button>
              <button type="button" style={s.cancelBtn} onClick={() => { setResetTarget(null); setNewPin(''); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4 },
  tabs: { display: 'flex', gap: 8 },
  tab: { padding: '10px 18px', borderRadius: 8, border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#6c757d' },
  tabActive: { background: '#1D3557', color: '#fff', border: '1px solid #1D3557' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  th: { background: '#f8f9fa', padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#6c757d', fontWeight: 600 },
  td: { padding: '14px 16px', borderBottom: '1px solid #dee2e6', fontSize: 14 },
  badge: { color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  actionBtn: { padding: '5px 12px', background: 'none', border: '1px solid #dee2e6', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#1D3557' },
  form: { background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 },
  label: { fontWeight: 600, fontSize: 13, color: '#212529' },
  input: { padding: '11px 14px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 15, width: '100%', boxSizing: 'border-box' as const },
  hint: { fontSize: 12, color: '#6c757d', margin: 0 },
  btn: { background: '#E63946', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 15 },
  cancelBtn: { background: '#f8f9fa', color: '#212529', border: '1px solid #dee2e6', borderRadius: 8, padding: '12px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 15 },
  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { background: '#fff', borderRadius: 16, padding: 32, width: 360, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.16)' },
};
