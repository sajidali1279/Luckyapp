import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, LogOut, Mail, ShieldCheck, Trash2, UserRound, Clock, Store as StoreIcon } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Card, Button, Field, Notice, Badge, SectionTitle } from '../components/kit';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { C, FONT, INPUT, RADIUS } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { storeDayTime, storeDayLong } from '../lib/storeDates';
import { showPhone } from '../lib/phoneText';

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev Admin',
  SUPER_ADMIN: 'Super Admin',
  STORE_MANAGER: 'Store Manager',
};

// The HQ emails, in the order they arrive in a week, with what each one is about
const EMAIL_KINDS: Record<string, { title: string; text: string }> = {
  MORNING_SUMMARY: { title: 'Morning summary', text: 'Each morning: sales held for review, missing-points reports, store alerts, requests and unpaid bills.' },
  WEEKLY_SUMMARY: { title: 'Weekly numbers', text: 'Once a week: the last 7 days of sales, cashback and sign-ups.' },
  LARGE_SALE: { title: 'Large sale held for review', text: 'Right away, when a sale of $500 or more is held for a decision.' },
  MISSING_POINTS: { title: 'Missing-points report', text: 'Right away, when a customer reports points that did not arrive.' },
  STORE_ALERT: { title: 'High-priority store alert', text: 'Right away, when a store raises an urgent alert (a pump down, a safety problem).' },
};

type Account = {
  id: string; name: string | null; phone: string; role: string; email: string | null; avatarUrl: string | null; createdAt: string;
  lastSignInAt: string | null; previousSignInAt: string | null; emailAlertsOff: string[]; emailKinds: string[];
  stores: { all: true; count: number } | { all: false; list: { id: string; name: string }[] };
  activity: { id: string; action: string; summary: string | null; storeName: string | null; createdAt: string }[];
};

export default function Profile() {
  const qc = useQueryClient();
  const { user, setAuth, logout } = useAuthStore();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['my-account'], queryFn: () => authApi.getAccount() });
  // Safe defaults for anything the server did not send (an older server, or a partial answer), so no section can crash the page
  const raw = data?.data?.data;
  const account: Account | undefined = raw ? {
    ...raw,
    emailAlertsOff: raw.emailAlertsOff ?? [],
    emailKinds: raw.emailKinds ?? [],
    activity: raw.activity ?? [],
    stores: raw.stores ?? { all: false, list: [] },
  } : undefined;

  const [name, setName] = useState(user?.name || '');
  const [nameBusy, setNameBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [alertBusy, setAlertBusy] = useState<string | null>(null);
  const [askSignOut, setAskSignOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['my-account'] });
  const token = () => localStorage.getItem('jwt_token')!;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name cannot be empty'); return; }
    setNameBusy(true);
    try {
      await authApi.updateProfile(name.trim());
      setAuth({ ...user!, name: name.trim() }, token());
      toast.success('Name updated');
      refresh();
    } catch (err) { toast.error(failureMessage(err, 'Could not update the name')); } finally { setNameBusy(false); }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Enter an email address'); return; }
    setEmailBusy(true);
    try {
      await authApi.updateEmail(email.trim());
      toast.success('Email saved');
      setEmail('');
      refresh();
    } catch (err) { toast.error(failureMessage(err, 'Could not save the email')); } finally { setEmailBusy(false); }
  }

  async function changePin(e: React.FormEvent) {
    e.preventDefault();
    if (currentPin.length !== 4) { toast.error('Current PIN must be 4 digits'); return; }
    if (newPin.length !== 4) { toast.error('New PIN must be 4 digits'); return; }
    if (newPin !== confirmPin) { toast.error('The new PINs do not match'); return; }
    setPinBusy(true);
    try {
      await authApi.changePin(currentPin, newPin);
      toast.success('PIN changed. Please sign in again.');
      setTimeout(() => { logout(); window.location.href = '/login'; }, 1500);
    } catch (err) { toast.error(failureMessage(err, 'Could not change the PIN')); } finally { setPinBusy(false); }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Pick an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Pick an image under 5 MB'); return; }
    setPhotoBusy(true);
    try {
      const res = await authApi.uploadAvatar(file);
      setAuth({ ...user!, avatarUrl: res.data?.data?.avatarUrl ?? null }, token());
      toast.success('Photo updated');
      refresh();
    } catch (err) { toast.error(failureMessage(err, 'Could not upload the photo')); } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      await authApi.removeAvatar();
      setAuth({ ...user!, avatarUrl: null }, token());
      toast.success('Photo removed');
      refresh();
    } catch (err) { toast.error(failureMessage(err, 'Could not remove the photo')); } finally { setPhotoBusy(false); }
  }

  async function toggleAlert(kind: string, on: boolean) {
    if (!account) return;
    const before = account.emailAlertsOff;
    const off = on ? before.filter((k) => k !== kind) : [...before, kind];
    const put = (list: string[]) => qc.setQueryData(['my-account'], (old: any) => old ? { ...old, data: { ...old.data, data: { ...old.data.data, emailAlertsOff: list } } } : old);
    put(off);   // the switch moves at once; it moves back if the save fails
    setAlertBusy(kind);
    try {
      await authApi.setEmailAlerts(off);
      toast.success(on ? `${EMAIL_KINDS[kind].title}: on` : `${EMAIL_KINDS[kind].title}: off`);
    } catch (err) { put(before); toast.error(failureMessage(err, 'Could not save that')); } finally { setAlertBusy(null); }
  }

  async function signOutOthers() {
    setAskSignOut(false);
    try {
      const res = await authApi.signOutOthers();
      const fresh = res.data?.data?.token;
      if (fresh) setAuth(user!, fresh);
      toast.success('Signed out of every other device. You are still signed in here.');
      refresh();
    } catch (err) { toast.error(failureMessage(err, 'Could not sign out the other devices')); }
  }

  const initials = (user?.name || user?.phone || '?').slice(0, 2).toUpperCase();
  const photo = account?.avatarUrl ?? user?.avatarUrl ?? null;
  const isHQ = (account?.emailKinds?.length ?? 0) > 0;

  return (
    <Page>
      <ConfirmModal
        open={askSignOut}
        title="Sign out of every other device?"
        message="Any other computer or phone signed in to this account is signed out right away and needs the PIN again. You stay signed in here."
        confirmLabel="Sign out everywhere else"
        headingLevel="h2"
        onConfirm={signOutOthers}
        onCancel={() => setAskSignOut(false)}
      />
      <PageHeader
        title="Account and settings"
        description={`${user?.name || 'No name set'} · ${ROLE_LABELS[user?.role || ''] || user?.role} · ${showPhone(user?.phone)}`}
      />

      {isError ? <ErrorState message="Could not load your account." onRetry={refetch} /> : (
        <div style={s.grid}>
          {/* ── Profile: photo and name ── */}
          <Card>
            <SectionTitle><UserRound size={16} color={C.primary} /> Profile</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              {photo
                ? <img src={photo} alt="Your photo" style={s.avatar} />
                : <div style={{ ...s.avatar, ...s.avatarInitials }} aria-hidden="true">{initials}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Choose a photo" onChange={(e) => uploadPhoto(e.target.files?.[0])} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button size="sm" icon={<Camera />} onClick={() => fileRef.current?.click()} disabled={photoBusy}>{photo ? 'Change photo' : 'Add a photo'}</Button>
                  {photo && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={removePhoto} disabled={photoBusy}>Remove</Button>}
                </div>
                <span style={s.hint}>Shows in the menu. An image under 5 MB.</span>
              </div>
            </div>
            <form onSubmit={saveName} style={s.form}>
              <Field label="Display name" htmlFor="profile-name" hint="Shown in the admin, in reports and in the Activity Log.">
                <input id="profile-name" className="ui-input" style={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              </Field>
              <div><Button type="submit" variant="primary" disabled={nameBusy || !name.trim() || name.trim() === user?.name}>{nameBusy ? 'Saving…' : 'Save name'}</Button></div>
            </form>
          </Card>

          {/* ── Email and which HQ emails arrive ── */}
          <Card>
            <SectionTitle><Mail size={16} color={C.primary} /> Email</SectionTitle>
            <div style={s.row}><span style={s.key}>Current</span><span style={s.val}>{isLoading ? '…' : account?.email || 'None yet'}</span></div>
            <form onSubmit={saveEmail} style={{ ...s.form, marginTop: 12 }}>
              <Field label={account?.email ? 'Change the email' : 'Add an email'} htmlFor="profile-email"
                hint={isHQ ? 'Used to reset your PIN, and for the HQ emails below.' : 'Used to reset your PIN.'}>
                <input id="profile-email" className="ui-input" style={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
              <div><Button type="submit" disabled={emailBusy || !email.trim()}>{emailBusy ? 'Saving…' : 'Save email'}</Button></div>
            </form>

            {isHQ && (
              <div style={{ marginTop: 20 }}>
                <div style={s.subTitle}>HQ emails</div>
                {!account?.email && <Notice tone="warning" style={{ marginBottom: 10, fontSize: FONT.small }}>Add an email above to get these.</Notice>}
                <div style={s.switchList}>
                  {account!.emailKinds.map((kind) => {
                    const on = !account!.emailAlertsOff.includes(kind);
                    const meta = EMAIL_KINDS[kind] ?? { title: kind, text: '' };
                    return (
                      <label key={kind} style={s.switchRow}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: FONT.body, fontWeight: 600, color: C.text }}>{meta.title}</span>
                          <span style={{ display: 'block', fontSize: FONT.small, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{meta.text}</span>
                        </span>
                        <input type="checkbox" role="switch" aria-checked={on} checked={on} disabled={alertBusy === kind}
                          onChange={(e) => toggleAlert(kind, e.target.checked)} style={s.switchInput} />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* ── Sign-in and security ── */}
          <Card>
            <SectionTitle><ShieldCheck size={16} color={C.primary} /> Sign-in and security</SectionTitle>
            <div style={s.row}><span style={s.key}>This sign-in</span><span style={s.val}>{account?.lastSignInAt ? storeDayTime(account.lastSignInAt) : '…'}</span></div>
            <div style={s.row}><span style={s.key}>The one before</span><span style={s.val}>{account?.previousSignInAt ? storeDayTime(account.previousSignInAt) : 'Not recorded yet'}</span></div>
            <p style={{ ...s.hint, margin: '6px 0 12px' }}>Central time. If the one before was not you, sign out everywhere else and change your PIN.</p>
            <Button icon={<LogOut />} onClick={() => setAskSignOut(true)}>Sign out everywhere else</Button>

            <form onSubmit={changePin} style={{ ...s.form, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
              <div style={s.subTitle}>Change PIN</div>
              <div style={s.pinRow}>
                <Field label="Current PIN" htmlFor="pin-current">
                  <input id="pin-current" className="ui-input" style={{ ...INPUT, letterSpacing: 6 }} type="password" inputMode="numeric" maxLength={4} autoComplete="current-password"
                    value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
                </Field>
                <Field label="New PIN" htmlFor="pin-new">
                  <input id="pin-new" className="ui-input" style={{ ...INPUT, letterSpacing: 6 }} type="password" inputMode="numeric" maxLength={4} autoComplete="new-password"
                    value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
                </Field>
                <Field label="New PIN again" htmlFor="pin-confirm">
                  <input id="pin-confirm" className="ui-input" style={{ ...INPUT, letterSpacing: 6 }} type="password" inputMode="numeric" maxLength={4} autoComplete="new-password"
                    value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
                </Field>
              </div>
              <div><Button type="submit" variant="primary" disabled={pinBusy}>{pinBusy ? 'Changing…' : 'Change PIN'}</Button></div>
              <span style={s.hint}>You will be signed out everywhere, including here, and sign in again with the new PIN.</span>
            </form>
          </Card>

          {/* ── The account ── */}
          <Card>
            <SectionTitle><StoreIcon size={16} color={C.primary} /> Your account</SectionTitle>
            <div style={s.row}><span style={s.key}>Role</span><span style={s.val}><Badge tone="info">{ROLE_LABELS[account?.role ?? user?.role ?? ''] ?? user?.role}</Badge></span></div>
            <div style={s.row}><span style={s.key}>Phone</span><span style={s.val}>{showPhone(account?.phone ?? user?.phone)}</span></div>
            <div style={s.row}><span style={s.key}>Member since</span><span style={s.val}>{account ? storeDayLong(account.createdAt) : '…'}</span></div>
            <div style={{ ...s.row, alignItems: 'flex-start' }}>
              <span style={s.key}>Stores</span>
              <span style={{ ...s.val, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                {!account?.stores ? '…' : account.stores.all
                  ? <Badge>All {account.stores.count} stores</Badge>
                  : account.stores.list.length === 0 ? 'None assigned' : account.stores.list.map((st) => <Badge key={st.id}>{st.name}</Badge>)}
              </span>
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ ...s.subTitle, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> Your recent actions</div>
              {!account ? <div style={s.hint}>Loading…</div> : account.activity.length === 0 ? (
                <div style={s.hint}>Nothing recorded yet.</div>
              ) : (
                <ol style={s.activity}>
                  {account.activity.map((a) => (
                    <li key={a.id} style={s.activityRow}>
                      <span style={{ color: C.text, fontSize: FONT.small, lineHeight: 1.45 }}>{a.summary || a.action.replace(/_/g, ' ').toLowerCase()}</span>
                      <span style={{ color: C.muted, fontSize: FONT.caption, whiteSpace: 'nowrap' }}>{storeDayTime(a.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

const s: Record<string, React.CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, objectFit: 'cover', flexShrink: 0, border: `2px solid ${C.border}` },
  avatarInitials: { background: '#D62839', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 },
  hint: { fontSize: FONT.caption, color: C.muted, lineHeight: 1.5 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: FONT.body },
  key: { color: C.muted },
  val: { color: C.text, fontWeight: 500, textAlign: 'right' },
  subTitle: { fontSize: FONT.small, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  switchList: { border: `1px solid ${C.border}`, borderRadius: RADIUS.md, overflow: 'hidden' },
  switchRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: C.surface },
  switchInput: { width: 18, height: 18, accentColor: C.primary, cursor: 'pointer', flexShrink: 0 },
  pinRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 },
  activity: { listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, maxHeight: 320, overflowY: 'auto' },
  activityRow: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderBottom: `1px solid ${C.border}` },
};
