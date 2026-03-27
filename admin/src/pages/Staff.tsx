import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi, storesApi, staffApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

type Tab = 'list' | 'create';

const ROLE_COLORS: Record<string, string> = {
  DEV_ADMIN:    '#7c3aed',
  SUPER_ADMIN:  '#1D3557',
  STORE_MANAGER:'#0369a1',
  EMPLOYEE:     '#374151',
};

const ROLE_BG: Record<string, string> = {
  DEV_ADMIN:    '#f5f3ff',
  SUPER_ADMIN:  '#eff6ff',
  STORE_MANAGER:'#e0f2fe',
  EMPLOYEE:     '#f3f4f6',
};

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN:    'Dev Admin',
  SUPER_ADMIN:  'Super Admin',
  STORE_MANAGER:'Store Manager',
  EMPLOYEE:     'Employee',
};

const AVATAR_PALETTE = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', '#1D3557', '#E63946', '#0891b2', '#be185d'];

function getAvatarColor(name: string, i: number) {
  return AVATAR_PALETTE[(name?.charCodeAt(0) || i) % AVATAR_PALETTE.length];
}

export default function Staff() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const [tab, setTab] = useState<Tab>('list');
  const [search, setSearch] = useState('');

  // Create form state
  const [createRole, setCreateRole] = useState<'SUPER_ADMIN' | 'STORE_MANAGER' | 'EMPLOYEE'>('EMPLOYEE');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [storeId, setStoreId] = useState('');

  // Reset PIN modal
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPin, setNewPin] = useState('');

  // Manage Stores modal
  const [storesMgmtTarget, setStoresMgmtTarget] = useState<{ id: string; name: string; assignedIds: string[] } | null>(null);
  const [pendingStoreIds, setPendingStoreIds] = useState<string[]>([]);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; role: string } | null>(null);

  const { data: storesData } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll(), enabled: isSuperAdmin });
  const { data: staffData, isLoading } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list(), enabled: isSuperAdmin });

  const stores: any[] = storesData?.data?.data || [];
  const staffList: any[] = staffData?.data?.data || [];

  const filtered = staffList.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.phone || '').includes(q) || m.role.toLowerCase().includes(q);
  });

  const activeCount = staffList.filter((m) => m.isActive).length;

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
    onSuccess: () => { toast.success('PIN reset successfully'); setResetTarget(null); setNewPin(''); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to reset PIN'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => staffApi.deleteUser(userId),
    onSuccess: () => {
      toast.success('Account deleted');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const manageStoresMutation = useMutation({
    mutationFn: async ({ userId, toAdd, toRemove }: { userId: string; toAdd: string[]; toRemove: string[] }) => {
      await Promise.all([
        ...toAdd.map((sid) => staffApi.addStore(userId, sid)),
        ...toRemove.map((sid) => staffApi.removeStore(userId, sid)),
      ]);
    },
    onSuccess: () => {
      toast.success('Store assignments updated');
      setStoresMgmtTarget(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update stores'),
  });

  function openManageStores(member: any) {
    const assignedIds = member.storeRoles.map((sr: any) => sr.store.id);
    setStoresMgmtTarget({ id: member.id, name: member.name || member.phone, assignedIds });
    setPendingStoreIds(assignedIds);
  }

  function handleSaveStores(e: React.FormEvent) {
    e.preventDefault();
    if (!storesMgmtTarget) return;
    const toAdd = pendingStoreIds.filter((id) => !storesMgmtTarget.assignedIds.includes(id));
    const toRemove = storesMgmtTarget.assignedIds.filter((id) => !pendingStoreIds.includes(id));
    if (toAdd.length === 0 && toRemove.length === 0) { setStoresMgmtTarget(null); return; }
    if (pendingStoreIds.length === 0) { toast.error('Must assign at least one store'); return; }
    manageStoresMutation.mutate({ userId: storesMgmtTarget.id, toAdd, toRemove });
  }

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

  const ROLE_OPTIONS = [
    ...(isDevAdmin ? [{ value: 'SUPER_ADMIN', label: 'Super Admin', desc: 'Manages all stores (HQ)', icon: '🏢', color: '#1D3557' }] : []),
    { value: 'STORE_MANAGER', label: 'Store Manager', desc: 'Manages one store', icon: '🏪', color: '#0369a1' },
    { value: 'EMPLOYEE', label: 'Employee / Cashier', desc: 'Scans QR codes, grants points', icon: '👤', color: '#374151' },
  ];

  return (
    <div style={s.page}>
      {/* ── Page Header ── */}
      <div style={s.pageHeader}>
        <div style={s.pageHeaderLeft}>
          <div style={s.pageTitle}>Staff Management</div>
          <div style={s.pageSubRow}>
            <span style={s.statChip}>
              <span style={s.statChipNum}>{staffList.length}</span> total
            </span>
            <span style={{ ...s.statChip, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
              <span style={s.statChipNum}>{activeCount}</span> active
            </span>
            {staffList.length - activeCount > 0 && (
              <span style={{ ...s.statChip, background: '#fff1f2', color: '#E63946', border: '1px solid #fecaca' }}>
                <span style={s.statChipNum}>{staffList.length - activeCount}</span> inactive
              </span>
            )}
          </div>
        </div>
        <div style={s.headerRight}>
          {tab === 'list' && (
            <div style={s.searchWrap}>
              <span style={s.searchIcon}>🔍</span>
              <input
                style={s.searchInput}
                placeholder="Search name, phone, role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div style={s.tabRow}>
            <button style={{ ...s.tab, ...(tab === 'list' ? s.tabActive : {}) }} onClick={() => setTab('list')}>
              👥 Staff List
            </button>
            {isSuperAdmin && (
              <button style={{ ...s.tab, ...(tab === 'create' ? s.tabActive : {}) }} onClick={() => setTab('create')}>
                + New Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Staff List ── */}
      {tab === 'list' && (
        isLoading ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 32 }}>⏳</div>
            <div style={s.emptyTitle}>Loading staff…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 48 }}>👥</div>
            <div style={s.emptyTitle}>{search ? 'No results' : 'No staff accounts yet'}</div>
            <div style={s.emptySub}>{search ? 'Try a different search term' : 'Create the first account to get started'}</div>
          </div>
        ) : (
          <>
            {(isDevAdmin
              ? ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER', 'EMPLOYEE']
              : ['SUPER_ADMIN', 'STORE_MANAGER', 'EMPLOYEE']
            ).map((role) => {
              const group = filtered.filter((m: any) => m.role === role);
              if (group.length === 0) return null;
              const rColor = ROLE_COLORS[role] || '#374151';
              const rBg = ROLE_BG[role] || '#f3f4f6';
              const groupIcons: Record<string, string> = {
                DEV_ADMIN: '⚙️', SUPER_ADMIN: '🏢', STORE_MANAGER: '🏪', EMPLOYEE: '👤',
              };
              return (
                <div key={role} style={s.roleSection}>
                  {/* Section header */}
                  <div style={{ ...s.roleSectionHeader, borderLeft: `4px solid ${rColor}` }}>
                    <span style={s.roleSectionIcon}>{groupIcons[role]}</span>
                    <span style={{ ...s.roleSectionTitle, color: rColor }}>{ROLE_LABELS[role] || role}</span>
                    <span style={{ ...s.roleSectionCount, background: rBg, color: rColor, border: `1px solid ${rColor}30` }}>
                      {group.length}
                    </span>
                  </div>

                  <div style={s.cardGrid}>
                    {group.map((member: any, i: number) => {
                      const avatarColor = getAvatarColor(member.name || member.phone, i);
                      const initial = (member.name || member.phone || '?')[0].toUpperCase();
                      const isMe = member.id === user?.id;

                      return (
                        <div key={member.id} style={{ ...s.staffCard, ...(member.isActive ? {} : s.staffCardInactive) }}>
                          {/* Card header */}
                          <div style={s.cardHeader}>
                            <div style={{ ...s.avatar, background: avatarColor }}>
                              {initial}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={s.memberName}>{member.name || '—'}</div>
                              <div style={s.memberPhone}>{member.phone}</div>
                            </div>
                            <div style={{ ...s.activeDot, background: member.isActive ? '#2DC653' : '#E63946' }} title={member.isActive ? 'Active' : 'Inactive'} />
                          </div>

                          {/* Role badge */}
                          <div style={s.cardMeta}>
                            <span style={{ ...s.roleBadge, background: rBg, color: rColor, border: `1px solid ${rColor}30` }}>
                              {ROLE_LABELS[member.role] || member.role}
                            </span>
                            {isMe && <span style={s.youBadge}>You</span>}
                          </div>

                          {/* Stores */}
                          {member.storeRoles.length > 0 ? (
                            <div style={s.storeList}>
                              {member.storeRoles.map((sr: any) => (
                                <span key={sr.store.id} style={s.storeChip}>⛽ {sr.store.name}</span>
                              ))}
                            </div>
                          ) : (
                            <div style={s.allStoresTag}>🌐 All stores</div>
                          )}

                          <div style={s.cardDivider} />

                          {/* Actions */}
                          <div style={s.cardActions}>
                            <button style={s.actionBtn} onClick={() => { setResetTarget({ id: member.id, name: member.name || member.phone }); setNewPin(''); }}>
                              🔒 Reset PIN
                            </button>
                            {['EMPLOYEE', 'STORE_MANAGER'].includes(member.role) && (
                              <button style={s.actionBtn} onClick={() => openManageStores(member)}>
                                🏪 Stores
                              </button>
                            )}
                            {!isMe && (
                              <button
                                style={{ ...s.actionBtn, ...(member.isActive ? s.actionBtnDanger : s.actionBtnSuccess) }}
                                onClick={() => toggleMutation.mutate(member.id)}
                              >
                                {member.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                            )}
                            {isDevAdmin && !isMe && (
                              <button
                                style={{ ...s.actionBtn, ...s.actionBtnDelete }}
                                onClick={() => setDeleteTarget({ id: member.id, name: member.name || member.phone, role: member.role })}
                              >
                                🗑️ Delete
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )
      )}

      {/* ── Create Account ── */}
      {tab === 'create' && (
        <div style={s.formWrap}>
          <div style={s.formCard}>
            <div style={s.formCardHeader}>
              <div style={s.formCardTitle}>New Staff Account</div>
              <div style={s.formCardSub}>Fill in the details below to create a new account</div>
            </div>

            <form style={s.form} onSubmit={handleCreate}>
              {/* Role selector */}
              <div style={s.formGroup}>
                <div style={s.formLabel}>Account Type</div>
                <div style={s.roleGrid}>
                  {ROLE_OPTIONS.map((opt) => {
                    const active = createRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        style={{ ...s.roleCard, ...(active ? { ...s.roleCardActive, borderColor: opt.color, outlineColor: opt.color } : {}) }}
                        onClick={() => setCreateRole(opt.value as any)}
                      >
                        <div style={{ ...s.roleCardIcon, background: active ? opt.color + '18' : '#f3f4f6' }}>
                          <span style={{ fontSize: 20 }}>{opt.icon}</span>
                        </div>
                        <div style={s.roleCardLabel}>{opt.label}</div>
                        <div style={s.roleCardDesc}>{opt.desc}</div>
                        {active && (
                          <div style={{ ...s.roleCardCheck, background: opt.color }}>✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name */}
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>Full Name</label>
                  <input
                    style={s.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maria Garcia"
                  />
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel}>Phone Number</label>
                  <input
                    style={s.input}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(555) 000-0000"
                  />
                </div>
              </div>

              {/* PIN */}
              <div style={s.formGroup}>
                <label style={s.formLabel}>4-Digit PIN</label>
                <div style={s.pinWrap}>
                  <input
                    style={s.pinInput}
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="••••"
                  />
                  <div style={s.pinDots}>
                    {[0,1,2,3].map((i) => (
                      <div key={i} style={{ ...s.pinDot, ...(i < pin.length ? s.pinDotFilled : {}) }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Store */}
              {createRole !== 'SUPER_ADMIN' && (
                <div style={s.formGroup}>
                  <label style={s.formLabel}>Assign to Store</label>
                  <select style={s.input} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">Select a store…</option>
                    {stores.map((store: any) => (
                      <option key={store.id} value={store.id}>{store.name}{store.city ? ` — ${store.city}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={s.formHint}>
                📱 Share the phone number and PIN securely with the staff member. They can change their PIN after logging in.
              </div>

              <button style={s.submitBtn} type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create Account →'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Manage Stores Modal ── */}
      {storesMgmtTarget && (
        <div style={s.overlay} onClick={() => setStoresMgmtTarget(null)}>
          <form style={s.modal} onSubmit={handleSaveStores} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div>
                <div style={s.modalTitle}>Manage Stores</div>
                <div style={s.modalSub}>
                  Assigning stores to <strong>{storesMgmtTarget.name}</strong>
                </div>
              </div>
              <button type="button" style={s.modalClose} onClick={() => setStoresMgmtTarget(null)}>✕</button>
            </div>

            <div style={s.storeCheckList}>
              {stores.map((store: any, i: number) => {
                const checked = pendingStoreIds.includes(store.id);
                const accentColor = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                return (
                  <label
                    key={store.id}
                    style={{ ...s.storeCheckRow, ...(checked ? { ...s.storeCheckRowActive, borderColor: accentColor + '60', background: accentColor + '08' } : {}) }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setPendingStoreIds((prev) =>
                        checked ? prev.filter((id) => id !== store.id) : [...prev, store.id]
                      )}
                      style={{ display: 'none' }}
                    />
                    <div style={{ ...s.storeCheckAvatar, background: checked ? accentColor : '#e5e7eb' }}>
                      {(store.name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...s.storeCheckName, color: checked ? '#111827' : '#6b7280' }}>{store.name}</div>
                      {store.city && <div style={s.storeCheckCity}>{store.city}</div>}
                    </div>
                    <div style={{ ...s.checkbox, ...(checked ? s.checkboxActive : {}) }}>
                      {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>}
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={() => setStoresMgmtTarget(null)}>Cancel</button>
              <button style={s.confirmBtn} type="submit" disabled={manageStoresMutation.isPending}>
                {manageStoresMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div style={s.overlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...s.modal, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={s.deleteIconWrap}>
              <div style={s.deleteIcon}>🗑️</div>
            </div>
            <div style={s.modalTitle}>Delete Account?</div>
            <div style={s.deleteSub}>
              This will permanently delete <strong>{deleteTarget.name}</strong>'s account
              ({ROLE_LABELS[deleteTarget.role] || deleteTarget.role}).
              This action <strong>cannot be undone</strong>.
            </div>
            <div style={s.deletePreview}>
              <span style={{ ...s.roleBadge, background: ROLE_BG[deleteTarget.role] || '#f3f4f6', color: ROLE_COLORS[deleteTarget.role] || '#374151', border: `1px solid ${ROLE_COLORS[deleteTarget.role] || '#374151'}30` }}>
                {ROLE_LABELS[deleteTarget.role] || deleteTarget.role}
              </span>
              <span style={s.deletePreviewName}>{deleteTarget.name}</span>
            </div>
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                style={s.deleteConfirmBtn}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset PIN Modal ── */}
      {resetTarget && (
        <div style={s.overlay} onClick={() => { setResetTarget(null); setNewPin(''); }}>
          <form style={{ ...s.modal, maxWidth: 380 }} onSubmit={handleResetPin} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div>
                <div style={s.modalTitle}>Reset PIN</div>
                <div style={s.modalSub}>New PIN for <strong>{resetTarget.name}</strong></div>
              </div>
              <button type="button" style={s.modalClose} onClick={() => { setResetTarget(null); setNewPin(''); }}>✕</button>
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>New 4-Digit PIN</label>
              <div style={s.pinWrap}>
                <input
                  style={s.pinInput}
                  type="password"
                  value={newPin}
                  autoFocus
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="••••"
                />
                <div style={s.pinDots}>
                  {[0,1,2,3].map((i) => (
                    <div key={i} style={{ ...s.pinDot, ...(i < newPin.length ? s.pinDotFilled : {}) }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={() => { setResetTarget(null); setNewPin(''); }}>Cancel</button>
              <button style={s.confirmBtn} type="submit" disabled={resetPinMutation.isPending}>
                {resetPinMutation.isPending ? 'Resetting…' : 'Reset PIN'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '28px 32px', maxWidth: 1300, margin: '0 auto', minHeight: 'calc(100vh - 64px)', background: '#f8fafc' },

  // Page header
  pageHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 28, gap: 20, flexWrap: 'wrap',
  },
  pageHeaderLeft: { display: 'flex', flexDirection: 'column', gap: 10 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: '#111827' },
  pageSubRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  statChip: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb',
    borderRadius: 10, padding: '4px 12px', fontSize: 13, fontWeight: 600,
  },
  statChipNum: { fontWeight: 800, color: 'inherit' },
  headerRight: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },

  // Search
  searchWrap: {
    position: 'relative', display: 'flex', alignItems: 'center',
  },
  searchIcon: { position: 'absolute', left: 12, fontSize: 14, pointerEvents: 'none' },
  searchInput: {
    paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9,
    borderRadius: 10, border: '1.5px solid #e5e7eb',
    fontSize: 13, background: '#fff', color: '#111827',
    width: 220, outline: 'none',
    boxSizing: 'border-box' as const,
  },

  // Tabs
  tabRow: { display: 'flex', gap: 8 },
  tab: {
    padding: '9px 18px', borderRadius: 10,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb',
    background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#6b7280',
  },
  tabActive: { background: '#1D3557', color: '#fff', borderColor: '#1D3557' },

  // Empty
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: 80, gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#111827' },
  emptySub: { fontSize: 14, color: '#9ca3af' },

  // Card grid
  roleSection: { marginBottom: 36 },
  roleSectionHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    paddingLeft: 14, marginBottom: 16,
  },
  roleSectionIcon: { fontSize: 18 },
  roleSectionTitle: { fontSize: 16, fontWeight: 800, flex: 1 },
  roleSectionCount: {
    fontSize: 12, fontWeight: 700, padding: '2px 10px',
    borderRadius: 20, border: '1px solid',
  },

  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  staffCard: {
    background: '#fff', borderRadius: 16, padding: 20,
    border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    display: 'flex', flexDirection: 'column', gap: 12,
    transition: 'box-shadow 0.15s',
  },
  staffCardInactive: { opacity: 0.6 },

  cardHeader: { display: 'flex', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 18,
  },
  memberName: { fontWeight: 700, fontSize: 15, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  memberPhone: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  activeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  cardMeta: { display: 'flex', gap: 8, alignItems: 'center' },
  roleBadge: {
    display: 'inline-block', borderRadius: 8, padding: '4px 10px',
    fontSize: 11, fontWeight: 800,
  },
  youBadge: {
    display: 'inline-block', background: '#fefce8', color: '#b45309',
    border: '1px solid #fde68a', borderRadius: 8,
    padding: '3px 9px', fontSize: 11, fontWeight: 700,
  },

  storeList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  storeChip: {
    background: '#f8fafc', border: '1px solid #e5e7eb',
    borderRadius: 8, padding: '3px 9px',
    fontSize: 11, fontWeight: 600, color: '#374151',
  },
  allStoresTag: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },

  cardDivider: { height: 1, background: '#f3f4f6', margin: '0 -4px' },

  cardActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    padding: '6px 12px', background: '#f8fafc',
    border: '1.5px solid #e5e7eb', borderRadius: 8,
    cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151',
    transition: 'all 0.12s',
  },
  actionBtnDanger: { color: '#E63946', borderColor: '#fecaca', background: '#fff1f2' },
  actionBtnSuccess: { color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' },
  actionBtnDelete: { color: '#7f1d1d', borderColor: '#fca5a5', background: '#fef2f2' },

  deleteIconWrap: { display: 'flex', justifyContent: 'center', marginBottom: 14 },
  deleteIcon: { width: 56, height: 56, borderRadius: 16, background: '#fef2f2', border: '1.5px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 },
  deleteSub: { fontSize: 14, color: '#6b7280', textAlign: 'center' as const, lineHeight: 1.6, margin: '10px 0 16px' },
  deletePreview: { display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 20 },
  deletePreviewName: { fontSize: 14, fontWeight: 600, color: '#111827' },
  deleteConfirmBtn: { flex: 2, padding: '10px 0', background: '#E63946', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' },

  // Create form
  formWrap: { display: 'flex', justifyContent: 'center', paddingTop: 8 },
  formCard: {
    background: '#fff', borderRadius: 20, padding: 32,
    width: '100%', maxWidth: 680,
    boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
    border: '1px solid #f0f1f2',
  },
  formCardHeader: { marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #f0f1f2' },
  formCardTitle: { fontSize: 20, fontWeight: 800, color: '#111827' },
  formCardSub: { fontSize: 13, color: '#9ca3af', marginTop: 4 },

  form: { display: 'flex', flexDirection: 'column', gap: 22 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  formGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  formLabel: { fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.7px' },
  input: {
    padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: 14,
    background: '#f9fafb', color: '#111827',
    width: '100%', boxSizing: 'border-box' as const,
    outline: 'none',
  },

  // Role cards
  roleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 },
  roleCard: {
    background: '#fff', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 14,
    padding: 16, cursor: 'pointer', textAlign: 'left',
    display: 'flex', flexDirection: 'column', gap: 6,
    position: 'relative', transition: 'border-color 0.15s',
  },
  roleCardActive: { background: '#f8fafc', boxShadow: '0 0 0 3px rgba(29,53,87,0.08)' },
  roleCardIcon: {
    width: 42, height: 42, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  roleCardLabel: { fontSize: 13, fontWeight: 800, color: '#111827' },
  roleCardDesc: { fontSize: 11, color: '#9ca3af', lineHeight: 1.5 },
  roleCardCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 11, fontWeight: 900,
  },

  // PIN input
  pinWrap: { display: 'flex', alignItems: 'center', gap: 16 },
  pinInput: {
    padding: '11px 20px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: 22,
    letterSpacing: 12, textAlign: 'center',
    background: '#f9fafb', color: '#111827',
    width: 140, boxSizing: 'border-box' as const,
  },
  pinDots: { display: 'flex', gap: 8 },
  pinDot: {
    width: 12, height: 12, borderRadius: 6,
    background: '#e5e7eb', transition: 'background 0.15s',
  },
  pinDotFilled: { background: '#1D3557' },

  formHint: {
    fontSize: 12, color: '#9ca3af', lineHeight: 1.6,
    background: '#f8fafc', borderRadius: 10, padding: '12px 14px',
    border: '1px solid #f0f1f2',
  },
  submitBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 12, padding: '14px 24px',
    fontWeight: 800, cursor: 'pointer', fontSize: 15,
    boxShadow: '0 4px 14px rgba(29,53,87,0.3)',
    alignSelf: 'flex-start',
  },

  // Modals
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, backdropFilter: 'blur(2px)',
  },
  modal: {
    background: '#fff', borderRadius: 20, padding: 28,
    width: '100%', maxWidth: 500,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', gap: 18,
    maxHeight: '88vh', overflowY: 'auto',
  },
  modalHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: '#111827' },
  modalSub: { fontSize: 13, color: '#9ca3af', marginTop: 3 },
  modalClose: {
    width: 30, height: 30, borderRadius: 15, border: 'none',
    background: '#f3f4f6', cursor: 'pointer',
    fontSize: 13, color: '#6b7280', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // Store checklist
  storeCheckList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' },
  storeCheckRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 12,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', cursor: 'pointer',
    transition: 'all 0.12s',
  },
  storeCheckRowActive: { background: '#f8fafc' },
  storeCheckAvatar: {
    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 13,
    transition: 'background 0.15s',
  },
  storeCheckName: { fontWeight: 700, fontSize: 13, transition: 'color 0.12s' },
  storeCheckCity: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
    border: '2px solid #e5e7eb', background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  },
  checkboxActive: { background: '#1D3557', borderColor: '#1D3557' },

  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  cancelBtn: {
    padding: '10px 20px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', background: '#fff',
    cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#374151',
  },
  confirmBtn: {
    padding: '10px 22px', borderRadius: 10,
    border: 'none', background: '#1D3557',
    cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#fff',
    boxShadow: '0 4px 12px rgba(29,53,87,0.3)',
  },
};
