import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi, storesApi, staffApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { phoneDigits, typedPhone, showPhone } from '../lib/phoneText';
import { storeDayLong } from '../lib/storeDates';
import { useSingleFlight } from '../hooks/useSingleFlight';

type Tab = 'list' | 'create';

// Mirrors the server's rule (backend/src/utils/rolePolicy.ts): a Dev Admin manages every account, everyone else only
// accounts below their own role. The server enforces it either way; this just hides buttons that would be refused.
const ROLE_RANK: Record<string, number> = { CUSTOMER: 0, EMPLOYEE: 1, STORE_MANAGER: 2, SUPER_ADMIN: 3, DEV_ADMIN: 4 };
function canManage(viewerRole: string | undefined, targetRole: string): boolean {
  if (viewerRole === 'DEV_ADMIN') return true;
  return (ROLE_RANK[viewerRole || ''] ?? -1) > (ROLE_RANK[targetRole] ?? 99);
}

const ROLE_COLORS: Record<string, string> = {
  DEV_ADMIN:    '#7c3aed',
  SUPER_ADMIN:  PRIMARY,
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

const AVATAR_PALETTE = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', PRIMARY, '#E63946', '#0891b2', '#be185d'];

function getAvatarColor(name: string, i: number) {
  return AVATAR_PALETTE[(name?.charCodeAt(0) || i) % AVATAR_PALETTE.length];
}

// Text colours dark enough to read on their tinted backgrounds (the brighter green and red were about 3.5 to 1)
const GREEN_TEXT = '#166534';
const RED_TEXT = '#b91c1c';

export default function Staff() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('list');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');

  // Create form state
  const [createRole, setCreateRole] = useState<'SUPER_ADMIN' | 'STORE_MANAGER' | 'EMPLOYEE'>('EMPLOYEE');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [createError, setCreateError] = useState('');
  // The account just made, shown once with the PIN so it can be handed over (kept in memory only, gone when this is closed)
  const [created, setCreated] = useState<{ name: string; phone: string; pin: string; role: string; storeName: string } | null>(null);

  // Reset PIN modal
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [showResetPin, setShowResetPin] = useState(false);
  const [resetError, setResetError] = useState('');

  // Manage Stores modal
  const [storesMgmtTarget, setStoresMgmtTarget] = useState<{ id: string; name: string; assignedIds: string[] } | null>(null);
  const [pendingStoreIds, setPendingStoreIds] = useState<string[]>([]);
  const [storesError, setStoresError] = useState('');

  // Deactivate question and Delete box
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; role: string; isActive: boolean } | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Edit account (name, phone, and for an Employee/Store Manager: role and chain-wide access)
  const [editTarget, setEditTarget] = useState<{ id: string; displayName: string; name: string; phone: string; role: string; allStoresAccess: boolean } | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'EMPLOYEE' | 'STORE_MANAGER'>('EMPLOYEE');
  const [editAllStores, setEditAllStores] = useState(false);
  const [editError, setEditError] = useState('');

  const { data: storesData } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll(), enabled: isSuperAdmin });
  const { data: staffData, isLoading, isError, refetch } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list(), enabled: isSuperAdmin });

  const stores: any[] = storesData?.data?.data || [];
  const staffList: any[] = staffData?.data?.data || [];

  // What Delete would do, asked before anyone clicks the red button
  const footprint = useQuery({
    queryKey: ['staff-footprint', deleteTarget?.id],
    queryFn: () => staffApi.footprint(deleteTarget!.id),
    enabled: !!deleteTarget,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const fp = footprint.data?.data?.data as { mode: string; canDelete: boolean; message: string } | undefined;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staffList;
    const qDigits = phoneDigits(q);
    return staffList.filter((m) =>
      (m.name || '').toLowerCase().includes(q)
      || (qDigits.length > 0 && (m.phone || '').replace(/\D/g, '').includes(qDigits))
      || (ROLE_LABELS[m.role] || m.role || '').toLowerCase().includes(q)
      || (m.storeRoles || []).some((sr: any) => (sr.store?.name || '').toLowerCase().includes(q)),
    );
  }, [staffList, search]);

  const activeCount = staffList.filter((m) => m.isActive).length;

  const createMutation = useMutation({
    mutationFn: (d: any) => {
      if (d.role === 'SUPER_ADMIN') return authApi.createSuperAdmin(d.phone, d.name, d.pin);
      return authApi.createStaff(d.phone, d.name, d.pin, d.role, d.storeId);
    },
    onSuccess: (_res, d) => {
      const storeName = d.role === 'SUPER_ADMIN' ? 'All stores' : (stores.find((st: any) => st.id === d.storeId)?.name ?? '');
      setCreated({ name: d.name, phone: d.phone, pin: d.pin, role: d.role, storeName });
      setPhone(''); setName(''); setPin(''); setPin2(''); setStoreId(''); setCreateError(''); setShowPin(false);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => setCreateError(failureMessage(err, 'Could not create the account. Nothing was saved.')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; name: string; isActive: boolean }) => staffApi.toggleActive(userId, isActive),
    onSuccess: (res, v) => {
      const changed = res.data?.data?.changed !== false;
      toast.success(
        v.isActive
          ? (changed ? `${v.name} is active again and can sign in.` : `${v.name} was already active.`)
          : (changed ? `${v.name} is deactivated. They are signed out and cannot sign in.` : `${v.name} was already deactivated.`),
      );
      setDeactivateTarget(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => { setDeactivateTarget(null); toast.error(failureMessage(err, 'Could not change the account. Nothing was changed.')); },
  });

  const resetPinMutation = useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) => staffApi.resetPin(userId, pin),
    onSuccess: () => {
      toast.success(`New PIN set for ${resetTarget?.name}. They are signed out everywhere and use the new PIN next time.`, { duration: 7000 });
      closeReset();
    },
    onError: (err: any) => setResetError(failureMessage(err, 'Could not reset the PIN. Nothing was changed.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => staffApi.deleteUser(userId),
    onSuccess: () => {
      toast.success(`${deleteTarget?.name}'s account was deleted.`);
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => { setDeleteError(failureMessage(err, 'Could not delete the account. Nothing was changed.')); footprint.refetch(); },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => staffApi.edit(id, patch),
    onSuccess: (res) => {
      const changed = res.data?.data?.changed !== false;
      toast.success(changed ? `${editTarget?.displayName}'s account was updated.` : `Nothing to change - it already looked like that.`);
      qc.invalidateQueries({ queryKey: ['staff'] });
      closeEdit();
    },
    onError: (err: any) => setEditError(failureMessage(err, 'Could not save the changes. Nothing was changed.')),
  });

  const setStoresMutation = useMutation({
    mutationFn: ({ userId, storeIds }: { userId: string; storeIds: string[] }) => staffApi.setStores(userId, storeIds),
    onSuccess: (res) => {
      const names: string[] = (res.data?.data?.stores ?? []).map((st: any) => st.name);
      toast.success(`${storesMgmtTarget?.name} now works at ${names.join(', ')}.`);
      setStoresMgmtTarget(null);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => setStoresError(failureMessage(err, 'Could not save the stores. Nothing was changed.')),
  });

  // One request at a time, even for a very fast double click
  const runCreate = useSingleFlight(createMutation);
  const runToggle = useSingleFlight(toggleMutation);
  const runReset = useSingleFlight(resetPinMutation);
  const runDelete = useSingleFlight(deleteMutation);
  const runSetStores = useSingleFlight(setStoresMutation);
  const runEdit = useSingleFlight(editMutation);

  function closeReset() { setResetTarget(null); setNewPin(''); setNewPin2(''); setResetError(''); setShowResetPin(false); }
  function closeStores() { setStoresMgmtTarget(null); setStoresError(''); }
  function closeDelete() { setDeleteTarget(null); setDeleteError(''); }
  function closeEdit() { setEditTarget(null); setEditError(''); }

  function openEdit(member: any) {
    setEditTarget({ id: member.id, displayName: member.name || showPhone(member.phone), name: member.name || '', phone: member.phone, role: member.role, allStoresAccess: !!member.allStoresAccess });
    setEditName(member.name || '');
    setEditPhone(typedPhone(member.phone));
    setEditRole(member.role === 'STORE_MANAGER' ? 'STORE_MANAGER' : 'EMPLOYEE');
    setEditAllStores(!!member.allStoresAccess);
    setEditError('');
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || editMutation.isPending) return;
    if (!editName.trim()) { setEditError('The name cannot be empty.'); return; }
    const digits = phoneDigits(editPhone);
    if (digits.length !== 10) { setEditError('Enter a full ten-digit phone number.'); return; }
    const canChangeRole = editTarget.role === 'EMPLOYEE' || editTarget.role === 'STORE_MANAGER';
    const patch: any = {};
    if (editName.trim() !== (editTarget.name || '')) patch.name = editName.trim();
    if (digits !== editTarget.phone) patch.phone = digits;
    if (canChangeRole && editRole !== editTarget.role) patch.role = editRole;
    if (canChangeRole && editRole !== 'EMPLOYEE' && editAllStores !== editTarget.allStoresAccess) patch.allStoresAccess = editAllStores;
    if (Object.keys(patch).length === 0) { closeEdit(); return; }
    setEditError('');
    runEdit({ id: editTarget.id, patch });
  }

  function openManageStores(member: any) {
    const assignedIds = member.storeRoles.map((sr: any) => sr.store.id);
    setStoresMgmtTarget({ id: member.id, name: member.name || showPhone(member.phone), assignedIds });
    setPendingStoreIds(assignedIds);
    setStoresError('');
  }

  const addedIds = storesMgmtTarget ? pendingStoreIds.filter((id) => !storesMgmtTarget.assignedIds.includes(id)) : [];
  const removedIds = storesMgmtTarget ? storesMgmtTarget.assignedIds.filter((id) => !pendingStoreIds.includes(id)) : [];
  const storeName = (id: string) => stores.find((st: any) => st.id === id)?.name ?? 'a store';

  function handleSaveStores(e: React.FormEvent) {
    e.preventDefault();
    if (!storesMgmtTarget || setStoresMutation.isPending) return;
    if (pendingStoreIds.length === 0) { setStoresError('Choose at least one store.'); return; }
    if (addedIds.length === 0 && removedIds.length === 0) { closeStores(); return; }
    setStoresError('');
    runSetStores({ userId: storesMgmtTarget.id, storeIds: pendingStoreIds });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (createMutation.isPending) return;
    const digits = phoneDigits(phone);
    if (!name.trim()) { setCreateError('Enter the name.'); return; }
    if (digits.length !== 10) { setCreateError('Enter a full ten-digit phone number.'); return; }
    if (pin.length !== 4) { setCreateError('The PIN must be four digits.'); return; }
    if (pin !== pin2) { setCreateError('The two PINs are different. Type the same PIN in both boxes.'); return; }
    if (createRole !== 'SUPER_ADMIN' && !storeId) { setCreateError('Choose a store.'); return; }
    setCreateError('');
    runCreate({ phone: digits, name: name.trim(), pin, role: createRole, storeId });
  }

  function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (resetPinMutation.isPending) return;
    if (newPin.length !== 4) { setResetError('The PIN must be four digits.'); return; }
    if (newPin !== newPin2) { setResetError('The two PINs are different. Type the same PIN in both boxes.'); return; }
    setResetError('');
    runReset({ userId: resetTarget!.id, pin: newPin });
  }

  const ROLE_OPTIONS = [
    ...(isDevAdmin ? [{ value: 'SUPER_ADMIN', label: 'Super Admin', desc: 'Manages all stores (HQ)', icon: '🏢', color: PRIMARY }] : []),
    { value: 'STORE_MANAGER', label: 'Store Manager', desc: 'Manages one store', icon: '🏪', color: '#0369a1' },
    { value: 'EMPLOYEE', label: 'Employee / Cashier', desc: 'Scans QR codes, grants points', icon: '👤', color: '#374151' },
  ];

  const inactiveCount = staffList.length - activeCount;

  return (
    <div style={s.page}>
      {/* ── Page Header ── */}
      <div style={s.pageHeader}>
        <div style={s.pageHeaderLeft}>
          <h1 style={s.pageTitle}>Staff Management</h1>
          <div style={s.pageSubRow}>
            <span style={s.statChip}>
              <span style={s.statChipNum}>{staffList.length}</span> total
            </span>
            <span style={{ ...s.statChip, background: '#f0fdf4', color: GREEN_TEXT, border: '1px solid #bbf7d0' }}>
              <span style={s.statChipNum}>{activeCount}</span> active
            </span>
            {inactiveCount > 0 && (
              <span style={{ ...s.statChip, background: '#fff1f2', color: RED_TEXT, border: '1px solid #fecaca' }}>
                <span style={s.statChipNum}>{inactiveCount}</span> deactivated
              </span>
            )}
          </div>
        </div>
        <div style={s.headerRight}>
          {tab === 'list' && (
            <div style={s.searchWrap}>
              <span style={s.searchIcon} aria-hidden="true">🔍</span>
              <input
                style={s.searchInput}
                aria-label="Search staff by name, phone, store or role"
                placeholder="Search name, phone, store, role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div style={s.tabRow}>
            <button style={{ ...s.tab, ...(tab === 'list' ? s.tabActive : {}) }} aria-pressed={tab === 'list'} onClick={() => setTab('list')}>
              👥 Staff List
            </button>
            {isSuperAdmin && (
              <button style={{ ...s.tab, ...(tab === 'create' ? s.tabActive : {}) }} aria-pressed={tab === 'create'} onClick={() => setTab('create')}>
                + New Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Staff List ── */}
      {tab === 'list' && (
        isError ? (
          <ErrorState onRetry={refetch} />
        ) : isLoading ? (
          <CardSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 48 }} aria-hidden="true">👥</div>
            <div style={s.emptyTitle}>{search ? 'No results' : 'No staff accounts yet'}</div>
            <div style={s.emptySub}>{search ? 'Try a different name, phone number, store or role' : 'Create the first account to get started'}</div>
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
                    <span style={s.roleSectionIcon} aria-hidden="true">{groupIcons[role]}</span>
                    <h2 style={{ ...s.roleSectionTitle, color: rColor }}>{ROLE_LABELS[role] || role}</h2>
                    <span style={{ ...s.roleSectionCount, background: rBg, color: rColor, border: `1px solid ${rColor}30` }}>
                      {group.length}
                    </span>
                  </div>

                  <div style={s.cardGrid}>
                    {group.map((member: any, i: number) => {
                      const avatarColor = getAvatarColor(member.name || member.phone, i);
                      const initial = (member.name || member.phone || '?')[0].toUpperCase();
                      const isMe = member.id === user?.id;
                      const manageable = canManage(user?.role, member.role);
                      const displayName = member.name || showPhone(member.phone);
                      const chainWide = member.role === 'SUPER_ADMIN' || member.role === 'DEV_ADMIN' || member.allStoresAccess === true;

                      return (
                        <div key={member.id} style={{ ...s.staffCard, ...(member.isActive ? {} : s.staffCardInactive) }}>
                          {/* Card header */}
                          <div style={s.cardHeader}>
                            <div style={{ ...s.avatar, background: avatarColor }} aria-hidden="true">
                              {initial}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={s.memberName}>{member.name || ' - '}</div>
                              <div style={s.memberPhone}>{showPhone(member.phone)}</div>
                            </div>
                            <div style={{ ...s.activeDot, background: member.isActive ? '#2DC653' : '#E63946' }} aria-hidden="true" />
                          </div>

                          {/* Role badge */}
                          <div style={s.cardMeta}>
                            <span style={{ ...s.roleBadge, background: rBg, color: rColor, border: `1px solid ${rColor}30` }}>
                              {ROLE_LABELS[member.role] || member.role}
                            </span>
                            {isMe && <span style={s.youBadge}>You</span>}
                            {!member.isActive && <span style={s.offBadge}>Deactivated</span>}
                          </div>

                          {/* Stores */}
                          {member.storeRoles.length > 0 ? (
                            <div style={s.storeList}>
                              {member.storeRoles.map((sr: any) => (
                                <span key={sr.store.id} style={s.storeChip}>⛽ {sr.store.name}{sr.store.isActive === false ? ' (closed)' : ''}</span>
                              ))}
                              {chainWide && member.role === 'STORE_MANAGER' && <span style={s.allStoresTag}>🌐 and every store (chain-wide access)</span>}
                            </div>
                          ) : chainWide ? (
                            <div style={s.allStoresTag}>🌐 All stores</div>
                          ) : (
                            <div style={s.noStoreTag}>⚠️ No store assigned</div>
                          )}

                          <div style={s.cardDivider} />

                          {/* Last sign-in */}
                          <div style={s.lastSignInLine}>
                            {member.lastSignInAt ? `Last signed in ${storeDayLong(member.lastSignInAt)}` : 'Never signed in'}
                          </div>

                          {/* Actions */}
                          <div style={s.cardActions}>
                            {manageable && !isMe && (
                              <button style={s.actionBtn} onClick={() => openEdit(member)}>
                                ✏️ Edit
                              </button>
                            )}
                            {manageable && !isMe && (
                              <button style={s.actionBtn} onClick={() => { setResetTarget({ id: member.id, name: displayName }); setNewPin(''); setNewPin2(''); setResetError(''); }}>
                                🔒 Reset PIN
                              </button>
                            )}
                            {manageable && ['EMPLOYEE', 'STORE_MANAGER'].includes(member.role) && (
                              <button style={s.actionBtn} onClick={() => openManageStores(member)}>
                                🏪 Stores
                              </button>
                            )}
                            {manageable && !isMe && (
                              <button
                                style={{ ...s.actionBtn, ...(member.isActive ? s.actionBtnDanger : s.actionBtnSuccess) }}
                                disabled={toggleMutation.isPending}
                                onClick={() => (member.isActive
                                  ? setDeactivateTarget({ id: member.id, name: displayName })
                                  : runToggle({ userId: member.id, name: displayName, isActive: true }))}
                              >
                                {member.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                            )}
                            {isDevAdmin && !isMe && (
                              <button
                                style={{ ...s.actionBtn, ...s.actionBtnDelete }}
                                onClick={() => { setDeleteError(''); setDeleteTarget({ id: member.id, name: displayName, role: member.role, isActive: member.isActive }); }}
                              >
                                🗑️ Delete
                              </button>
                            )}
                            {(isMe || !manageable) && (
                              <div style={s.lockedNote}>
                                {isMe ? 'This is your account. Change your PIN from your profile.' : 'Only a Dev Admin can change this account.'}
                              </div>
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
      {tab === 'create' && created && (
        <div style={s.formWrap}>
          <div style={s.formCard} role="status">
            <div style={s.formCardHeader}>
              <h2 style={s.formCardTitle}>{created.name}'s account is ready</h2>
              <div style={s.formCardSub}>Give them these details. The PIN is shown here only, and is not saved anywhere you can read it later.</div>
            </div>
            <dl style={s.summary}>
              <div style={s.summaryRow}><dt style={s.summaryTerm}>Account type</dt><dd style={s.summaryValue}>{ROLE_LABELS[created.role] || created.role}</dd></div>
              <div style={s.summaryRow}><dt style={s.summaryTerm}>Phone number</dt><dd style={s.summaryValue}>{showPhone(created.phone)}</dd></div>
              <div style={s.summaryRow}><dt style={s.summaryTerm}>PIN</dt><dd style={{ ...s.summaryValue, letterSpacing: 4 }}>{created.pin}</dd></div>
              <div style={s.summaryRow}><dt style={s.summaryTerm}>Store</dt><dd style={s.summaryValue}>{created.storeName}</dd></div>
            </dl>
            <div style={s.formHint}>They sign in with that phone number and PIN, and can change the PIN in the app afterwards (Profile).</div>
            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={() => { setCreated(null); setTab('list'); }}>Back to staff list</button>
              <button type="button" style={s.confirmBtn} onClick={() => setCreated(null)}>Create another</button>
            </div>
          </div>
        </div>
      )}
      {tab === 'create' && !created && (
        <div style={s.formWrap}>
          <div style={s.formCard}>
            <div style={s.formCardHeader}>
              <h2 style={s.formCardTitle}>New Staff Account</h2>
              <div style={s.formCardSub}>Fill in the details below to create a new account</div>
            </div>

            <form style={s.form} onSubmit={handleCreate} noValidate>
              {/* Role selector */}
              <div style={s.formGroup} role="group" aria-labelledby="staff-role-label">
                <div style={s.formLabel} id="staff-role-label">Account Type</div>
                <div style={s.roleGrid}>
                  {ROLE_OPTIONS.map((opt) => {
                    const active = createRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        style={{ ...s.roleCard, ...(active ? { ...s.roleCardActive, borderColor: opt.color, outlineColor: opt.color } : {}) }}
                        onClick={() => { setCreateRole(opt.value as any); setCreateError(''); }}
                      >
                        <div style={{ ...s.roleCardIcon, background: active ? opt.color + '18' : '#f3f4f6' }} aria-hidden="true">
                          <span style={{ fontSize: 20 }}>{opt.icon}</span>
                        </div>
                        <div style={s.roleCardLabel}>{opt.label}</div>
                        <div style={s.roleCardDesc}>{opt.desc}</div>
                        {active && (
                          <div style={{ ...s.roleCardCheck, background: opt.color }} aria-hidden="true">✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name and phone */}
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel} htmlFor="staff-name">Full Name</label>
                  <input
                    id="staff-name"
                    style={s.input}
                    value={name}
                    onChange={(e) => { setName(e.target.value); setCreateError(''); }}
                    placeholder="e.g. Maria Garcia"
                    autoComplete="off"
                  />
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel} htmlFor="staff-phone">Phone Number</label>
                  <input
                    id="staff-phone"
                    style={s.input}
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(typedPhone(e.target.value)); setCreateError(''); }}
                    placeholder="(555) 000-0000"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* PIN, twice */}
              <div style={s.formRow}>
                <div style={s.formGroup}>
                  <label style={s.formLabel} htmlFor="staff-pin">4-Digit PIN</label>
                  <input
                    id="staff-pin"
                    style={s.pinInput}
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setCreateError(''); }}
                    maxLength={4}
                    inputMode="numeric"
                    autoComplete="new-password"
                    placeholder="••••"
                  />
                </div>
                <div style={s.formGroup}>
                  <label style={s.formLabel} htmlFor="staff-pin2">Type the PIN again</label>
                  <input
                    id="staff-pin2"
                    style={s.pinInput}
                    type={showPin ? 'text' : 'password'}
                    value={pin2}
                    onChange={(e) => { setPin2(e.target.value.replace(/\D/g, '').slice(0, 4)); setCreateError(''); }}
                    maxLength={4}
                    inputMode="numeric"
                    autoComplete="new-password"
                    placeholder="••••"
                  />
                </div>
              </div>
              <label style={s.showPinRow}>
                <input type="checkbox" checked={showPin} onChange={(e) => setShowPin(e.target.checked)} style={s.nativeCheck} />
                Show the PIN while I type it
              </label>

              {/* Store */}
              {createRole !== 'SUPER_ADMIN' && (
                <div style={s.formGroup}>
                  <label style={s.formLabel} htmlFor="staff-store">Assign to Store</label>
                  <select id="staff-store" style={s.input} value={storeId} onChange={(e) => { setStoreId(e.target.value); setCreateError(''); }}>
                    <option value="">Select a store…</option>
                    {stores.map((store: any) => (
                      <option key={store.id} value={store.id} disabled={store.isActive === false}>
                        {store.name}{store.city ? ` - ${store.city}` : ''}{store.isActive === false ? ' (closed)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={s.formHint}>
                📱 Share the phone number and PIN securely with the staff member. They can change their PIN after logging in.
              </div>

              {createError && <div role="alert" style={s.errorBox}>{createError}</div>}

              <button style={s.submitBtn} type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create Account →'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Manage Stores ── */}
      {storesMgmtTarget && (
        <Modal
          title="Manage Stores"
          subtitle={<>Choose every store <strong>{storesMgmtTarget.name}</strong> works at</>}
          onClose={closeStores}
          busy={setStoresMutation.isPending}
          maxWidth={480}
        >
          <form onSubmit={handleSaveStores} style={s.modalForm} noValidate>
            <div style={s.selectRow}>
              <span style={{ fontSize: 15, color: TEXT_MUTED, fontWeight: 600 }}>
                {pendingStoreIds.length} of {stores.length} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={s.quickBtn}
                  onClick={() => setPendingStoreIds(stores.filter((st: any) => st.isActive !== false || storesMgmtTarget.assignedIds.includes(st.id)).map((st: any) => st.id))}
                >
                  Select All
                </button>
                <button type="button" style={s.quickBtn} onClick={() => setPendingStoreIds([])}>
                  Clear All
                </button>
              </div>
            </div>

            <div style={s.storeCheckList} role="group" aria-label="Stores">
              {stores.map((store: any, i: number) => {
                const checked = pendingStoreIds.includes(store.id);
                const closed = store.isActive === false;
                const blocked = closed && !storesMgmtTarget.assignedIds.includes(store.id);
                const accentColor = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                return (
                  <label
                    key={store.id}
                    style={{ ...s.storeCheckRow, ...(checked ? { ...s.storeCheckRowActive, borderColor: accentColor + '60', background: accentColor + '08' } : {}), ...(blocked ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                  >
                    <div style={{ ...s.storeCheckAvatar, background: checked ? accentColor : '#e5e7eb', color: checked ? '#fff' : '#374151' }} aria-hidden="true">
                      {(store.name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...s.storeCheckName, color: '#111827' }}>{store.name}</div>
                      {(store.city || closed) && (
                        <div style={s.storeCheckCity}>{store.city}{store.city && closed ? ' · ' : ''}{closed ? (blocked ? 'closed, cannot be newly assigned' : 'closed') : ''}</div>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked}
                      style={s.nativeCheck}
                      onChange={() => { setStoresError(''); setPendingStoreIds((prev) => (checked ? prev.filter((id) => id !== store.id) : [...prev, store.id])); }}
                    />
                  </label>
                );
              })}
            </div>

            <div style={s.changeLine} aria-live="polite">
              {pendingStoreIds.length === 0
                ? 'Choose at least one store.'
                : addedIds.length === 0 && removedIds.length === 0
                ? 'No changes yet.'
                : <>{addedIds.length > 0 && <>Adds {addedIds.map(storeName).join(', ')}. </>}{removedIds.length > 0 && <>Removes {removedIds.map(storeName).join(', ')}.</>}</>}
            </div>

            {storesError && <div role="alert" style={s.errorBox}>{storesError}</div>}

            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={closeStores} disabled={setStoresMutation.isPending}>Cancel</button>
              <button style={s.confirmBtn} type="submit" disabled={setStoresMutation.isPending || pendingStoreIds.length === 0 || (addedIds.length === 0 && removedIds.length === 0)}>
                {setStoresMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Deactivate question ── */}
      <ConfirmModal
        open={!!deactivateTarget}
        title={`Deactivate ${deactivateTarget?.name ?? ''}?`}
        message={<>{deactivateTarget?.name} is signed out on their next request, cannot sign in until you reactivate them, and stops getting store alerts. Everything they did stays on record.</>}
        confirmLabel="Deactivate"
        danger
        busy={toggleMutation.isPending}
        onConfirm={() => deactivateTarget && runToggle({ userId: deactivateTarget.id, name: deactivateTarget.name, isActive: false })}
        onCancel={() => setDeactivateTarget(null)}
      />

      {/* ── Delete box: says what would happen before anything does ── */}
      {deleteTarget && (
        <Modal title={`Delete ${deleteTarget.name}?`} onClose={closeDelete} busy={deleteMutation.isPending} maxWidth={460}>
          <div style={s.deletePreview}>
            <span style={{ ...s.roleBadge, background: ROLE_BG[deleteTarget.role] || '#f3f4f6', color: ROLE_COLORS[deleteTarget.role] || '#374151', border: `1px solid ${ROLE_COLORS[deleteTarget.role] || '#374151'}30` }}>
              {ROLE_LABELS[deleteTarget.role] || deleteTarget.role}
            </span>
            <span style={s.deletePreviewName}>{deleteTarget.name}</span>
          </div>
          {footprint.isLoading && <div style={s.deleteSub} role="status">Checking what this account has done…</div>}
          {footprint.isError && (
            <div role="alert" style={s.errorBox}>
              Could not check the account, so nothing was changed. <button type="button" style={s.linkBtn} onClick={() => footprint.refetch()}>Try again</button>
            </div>
          )}
          {fp && fp.canDelete && (
            <div style={s.deleteSub}>Nothing is on record for this account, so deleting it removes only the sign-in itself. This <strong>cannot be undone</strong>.</div>
          )}
          {fp && !fp.canDelete && <div style={s.deleteSub}>{fp.message}</div>}
          {deleteError && <div role="alert" style={s.errorBox}>{deleteError}</div>}
          <div style={s.modalActions}>
            <button type="button" style={s.cancelBtn} onClick={closeDelete} disabled={deleteMutation.isPending}>{fp && !fp.canDelete ? 'Close' : 'Cancel'}</button>
            {fp && !fp.canDelete && deleteTarget.isActive && (
              <button type="button" style={s.deleteConfirmBtn} onClick={() => { const t = deleteTarget; closeDelete(); setDeactivateTarget({ id: t.id, name: t.name }); }}>
                Deactivate instead
              </button>
            )}
            {fp && fp.canDelete && (
              <button type="button" style={s.deleteConfirmBtn} onClick={() => runDelete(deleteTarget.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ── Edit account: fix a name/phone typo, promote or demote, chain-wide access ── */}
      {editTarget && (
        <Modal title={`Edit ${editTarget.displayName}`} onClose={closeEdit} busy={editMutation.isPending}>
          <form onSubmit={handleSaveEdit} style={s.modalForm} noValidate>
            <div style={s.formGroup}>
              <label style={s.formLabel} htmlFor="edit-name">Full Name</label>
              <input id="edit-name" style={s.input} value={editName} onChange={(e) => { setEditName(e.target.value); setEditError(''); }} autoComplete="off" />
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel} htmlFor="edit-phone">Phone Number</label>
              <input id="edit-phone" style={s.input} type="tel" value={editPhone} onChange={(e) => { setEditPhone(typedPhone(e.target.value)); setEditError(''); }} placeholder="(555) 000-0000" autoComplete="off" />
            </div>
            {(editTarget.role === 'EMPLOYEE' || editTarget.role === 'STORE_MANAGER') && (
              <>
                <div style={s.formGroup} role="group" aria-labelledby="edit-role-label">
                  <div style={s.formLabel} id="edit-role-label">Role</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['EMPLOYEE', 'STORE_MANAGER'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={editRole === r}
                        style={{ ...s.tab, ...(editRole === r ? s.tabActive : {}) }}
                        onClick={() => { setEditRole(r); setEditError(''); }}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
                {editRole === 'STORE_MANAGER' && (
                  <label style={s.showPinRow}>
                    <input type="checkbox" checked={editAllStores} onChange={(e) => { setEditAllStores(e.target.checked); setEditError(''); }} style={s.nativeCheck} />
                    Chain-wide access (works at every store, not only the ones assigned below)
                  </label>
                )}
                {editRole !== editTarget.role && (
                  <div style={s.formHint}>
                    {editRole === 'STORE_MANAGER'
                      ? `${editTarget.displayName} will be promoted to Store Manager.`
                      : `${editTarget.displayName} will be moved back to Employee, and loses chain-wide access if they had it.`}
                  </div>
                )}
              </>
            )}
            {editError && <div role="alert" style={s.errorBox}>{editError}</div>}
            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={closeEdit} disabled={editMutation.isPending}>Cancel</button>
              <button style={s.confirmBtn} type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Reset PIN ── */}
      {resetTarget && (
        <Modal title="Reset PIN" subtitle={<>New PIN for <strong>{resetTarget.name}</strong>. They are signed out everywhere.</>} onClose={closeReset} busy={resetPinMutation.isPending}>
          <form onSubmit={handleResetPin} style={s.modalForm} noValidate>
            <div style={s.formGroup}>
              <label style={s.formLabel} htmlFor="reset-pin">New 4-digit PIN</label>
              <input
                id="reset-pin"
                style={s.pinInput}
                type={showResetPin ? 'text' : 'password'}
                value={newPin}
                autoFocus
                onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setResetError(''); }}
                maxLength={4}
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="••••"
              />
            </div>
            <div style={s.formGroup}>
              <label style={s.formLabel} htmlFor="reset-pin2">Type the PIN again</label>
              <input
                id="reset-pin2"
                style={s.pinInput}
                type={showResetPin ? 'text' : 'password'}
                value={newPin2}
                onChange={(e) => { setNewPin2(e.target.value.replace(/\D/g, '').slice(0, 4)); setResetError(''); }}
                maxLength={4}
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="••••"
              />
            </div>
            <label style={s.showPinRow}>
              <input type="checkbox" checked={showResetPin} onChange={(e) => setShowResetPin(e.target.checked)} style={s.nativeCheck} />
              Show the PIN while I type it
            </label>
            {resetError && <div role="alert" style={s.errorBox}>{resetError}</div>}
            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={closeReset} disabled={resetPinMutation.isPending}>Cancel</button>
              <button style={s.confirmBtn} type="submit" disabled={resetPinMutation.isPending}>
                {resetPinMutation.isPending ? 'Resetting…' : 'Reset PIN'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '28px 32px', minHeight: 'calc(100vh - 64px)', background: '#f8fafc' },

  // Page header
  pageHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 28, gap: 20, flexWrap: 'wrap',
  },
  pageHeaderLeft: { display: 'flex', flexDirection: 'column', gap: 10 },
  pageTitle: { fontSize: 26, fontWeight: 800, color: '#111827', margin: 0 },
  pageSubRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  statChip: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: '#f3f4f6', color: TEXT_MUTED, border: '1px solid #e5e7eb',
    borderRadius: 10, padding: '4px 12px', fontSize: 15, fontWeight: 600,
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
    fontSize: 15, background: '#fff', color: '#111827',
    width: 260, maxWidth: '100%', outline: 'none',
    boxSizing: 'border-box' as const,
  },

  // Tabs
  tabRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tab: {
    padding: '9px 18px', borderRadius: 10,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb',
    background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 15, color: TEXT_MUTED,
  },
  tabActive: { background: PRIMARY, color: '#fff', borderColor: PRIMARY },

  // Empty
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: 80, gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#111827' },
  emptySub: { fontSize: 14, color: TEXT_MUTED },

  // Card grid
  roleSection: { marginBottom: 36 },
  roleSectionHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    paddingLeft: 14, marginBottom: 16,
  },
  roleSectionIcon: { fontSize: 18 },
  roleSectionTitle: { fontSize: 16, fontWeight: 800, flex: 1, margin: 0 },
  roleSectionCount: {
    fontSize: 14, fontWeight: 700, padding: '2px 10px',
    borderRadius: 20, border: '1px solid',
  },

  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
    gap: 16,
  },
  staffCard: {
    background: '#fff', borderRadius: 16, padding: 20,
    border: '1px solid #f0f1f2',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    display: 'flex', flexDirection: 'column', gap: 12,
    transition: 'box-shadow 0.15s',
  },
  staffCardInactive: { background: '#f3f4f6', border: '1px dashed #d1d5db' },

  cardHeader: { display: 'flex', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 18,
  },
  memberName: { fontWeight: 700, fontSize: 15, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  memberPhone: { fontSize: 14, color: TEXT_MUTED, marginTop: 2 },
  activeDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  cardMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  roleBadge: {
    display: 'inline-block', borderRadius: 8, padding: '4px 10px',
    fontSize: 13, fontWeight: 800,
  },
  youBadge: {
    display: 'inline-block', background: '#fefce8', color: '#92400e',
    border: '1px solid #fde68a', borderRadius: 8,
    padding: '3px 9px', fontSize: 13, fontWeight: 700,
  },
  offBadge: {
    display: 'inline-block', background: '#fff1f2', color: RED_TEXT,
    border: '1px solid #fecaca', borderRadius: 8,
    padding: '3px 9px', fontSize: 13, fontWeight: 700,
  },

  storeList: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  storeChip: {
    background: '#f8fafc', border: '1px solid #e5e7eb',
    borderRadius: 8, padding: '3px 9px',
    fontSize: 13, fontWeight: 600, color: '#374151',
  },
  allStoresTag: { fontSize: 14, color: TEXT_MUTED, fontStyle: 'italic' },
  noStoreTag: { fontSize: 14, color: '#92400e', fontWeight: 700 },

  lastSignInLine: { fontSize: 13, color: TEXT_MUTED, fontStyle: 'italic' },

  cardDivider: { height: 1, background: '#e5e7eb', margin: '0 -4px' },

  cardActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  lockedNote: { fontSize: 14, color: TEXT_MUTED, fontStyle: 'italic' },
  actionBtn: {
    padding: '6px 12px', background: '#f8fafc',
    border: '1.5px solid #e5e7eb', borderRadius: 8,
    cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#374151',
    transition: 'all 0.12s',
  },
  actionBtnDanger: { color: RED_TEXT, borderColor: '#fecaca', background: '#fff1f2' },
  actionBtnSuccess: { color: GREEN_TEXT, borderColor: '#bbf7d0', background: '#f0fdf4' },
  actionBtnDelete: { color: '#7f1d1d', borderColor: '#fca5a5', background: '#fef2f2' },

  deleteSub: { fontSize: 15, color: '#374151', lineHeight: 1.6 },
  deletePreview: { display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', borderRadius: 10, padding: '10px 14px' },
  deletePreviewName: { fontSize: 14, fontWeight: 600, color: '#111827' },
  deleteConfirmBtn: { padding: '10px 20px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' },

  // Create form
  formWrap: { display: 'flex', justifyContent: 'center', paddingTop: 8 },
  formCard: {
    background: '#fff', borderRadius: 20, padding: 32,
    width: '100%', boxSizing: 'border-box',
    boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
    border: '1px solid #f0f1f2',
  },
  formCardHeader: { marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid #f0f1f2' },
  formCardTitle: { fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 },
  formCardSub: { fontSize: 15, color: TEXT_MUTED, marginTop: 4 },

  form: { display: 'flex', flexDirection: 'column', gap: 22 },
  modalForm: { display: 'flex', flexDirection: 'column', gap: 16 },
  formRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16 },
  formGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  formLabel: { fontSize: 13, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.7px' },
  input: {
    padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: 14,
    background: '#f9fafb', color: '#111827',
    width: '100%', boxSizing: 'border-box' as const,
    outline: 'none',
  },

  // Role cards
  roleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))', gap: 10 },
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
  roleCardLabel: { fontSize: 15, fontWeight: 800, color: '#111827' },
  roleCardDesc: { fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5 },
  roleCardCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 13, fontWeight: 900,
  },

  // PIN input
  pinInput: {
    padding: '11px 20px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: 22,
    letterSpacing: 12, textAlign: 'center',
    background: '#f9fafb', color: '#111827',
    width: 140, maxWidth: '100%', boxSizing: 'border-box' as const,
  },
  showPinRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#374151', cursor: 'pointer', width: 'fit-content' },
  nativeCheck: { width: 20, height: 20, accentColor: PRIMARY, cursor: 'pointer', flexShrink: 0, margin: 0 },

  formHint: {
    fontSize: 14, color: TEXT_MUTED, lineHeight: 1.6,
    background: '#f8fafc', borderRadius: 10, padding: '12px 14px',
    border: '1px solid #f0f1f2',
  },
  errorBox: {
    fontSize: 15, color: '#7f1d1d', lineHeight: 1.5, background: '#fef2f2',
    border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px',
  },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 15 },
  submitBtn: {
    background: PRIMARY, color: '#fff', border: 'none',
    borderRadius: 12, padding: '14px 24px',
    fontWeight: 800, cursor: 'pointer', fontSize: 15,
    boxShadow: '0 4px 14px rgba(29,53,87,0.3)',
    alignSelf: 'flex-start',
  },

  // After creating
  summary: { display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 20px' },
  summaryRow: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '10px 14px', background: '#f8fafc', borderRadius: 10 },
  summaryTerm: { width: 130, fontSize: 13, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.7px', margin: 0, alignSelf: 'center' },
  summaryValue: { fontSize: 17, fontWeight: 800, color: '#111827', margin: 0 },

  // Store checklist
  selectRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  storeCheckList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto', padding: 2 },
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
    fontWeight: 800, fontSize: 15,
    transition: 'background 0.15s',
  },
  storeCheckName: { fontWeight: 700, fontSize: 15 },
  storeCheckCity: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },
  changeLine: { fontSize: 14, color: '#374151', lineHeight: 1.5, minHeight: 21 },

  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' },
  quickBtn: {
    padding: '5px 12px', borderRadius: 8,
    border: '1px solid #e5e7eb', background: '#f8fafc',
    cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#374151',
  },
  cancelBtn: {
    padding: '10px 20px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', background: '#fff',
    cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#374151',
  },
  confirmBtn: {
    padding: '10px 22px', borderRadius: 10,
    border: 'none', background: PRIMARY,
    cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#fff',
    boxShadow: '0 4px 12px rgba(29,53,87,0.3)',
  },
};
