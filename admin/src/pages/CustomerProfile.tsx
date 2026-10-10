// A customer's full profile (HQ, 2026-10-09): everything support needs on one page. Overview (account, tier, shopping, points,
// sign-in, goodwill credit, restrict), every transaction on one timeline, referrals, HQ's private notes, the phones they use, and
// what staff did on the account. Opened from Customers ("View profile").
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { customersApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDayLong, storeDayTime } from '../lib/storeDates';
import { C, FONT, INPUT, PRIMARY } from '../lib/theme';
import { Page, PageHeader, Tabs, Card, SectionTitle, Badge, Button, Notice, EmptyState, HeaderStat, Chip } from '../components/kit';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthStore } from '../store/authStore';

type Tab = 'overview' | 'activity' | 'referrals' | 'notes' | 'devices' | 'history';
const fmt$ = (n: number | null | undefined) => (n == null ? '-' : `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_LABEL: Record<string, string> = { all: 'Everything', sales: 'Purchases', rewards: 'Rewards', redemptions: 'Redemptions', disputes: 'Reports', hotfood: 'Hot food', credits: 'Credits' };
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  APPROVED: 'success', COMPLETED: 'success', REWARDED: 'success', READY: 'success', ACCEPTED: 'info',
  PENDING: 'warning', FLAGGED: 'warning', REJECTED: 'danger', VOIDED: 'danger', CANCELLED: 'neutral', EXPIRED: 'neutral',
};
const statusText = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');
const th = { fontSize: FONT.caption, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' as const };
const num = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, marginBottom: 16 } as const;

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', rowGap: 8, columnGap: 14, fontSize: FONT.body }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ color: C.muted }}>{k}</dt>
          <dd style={{ margin: 0, color: C.text, overflowWrap: 'anywhere' }}>{v ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function CustomerProfile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');
  const q = useQuery({ queryKey: ['customer-profile', id], queryFn: () => customersApi.profile(id) });
  const d: any = q.data?.data?.data;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['customer-profile', id] }); qc.invalidateQueries({ queryKey: ['customer-activity', id] }); qc.invalidateQueries({ queryKey: ['customer-history', id] }); };

  if (q.isError) return <Page><ErrorState onRetry={q.refetch} /></Page>;
  if (q.isLoading || !d) return <Page><CardSkeleton count={4} /></Page>;
  const c = d.customer;
  const name = c.name || 'Customer';

  return (
    <Page>
      <PageHeader
        title={name}
        description={<>{c.phone} · Joined {storeDayLong(c.createdAt)}{c.lastSignInAt ? <> · Last sign-in {storeDayLong(c.lastSignInAt)}</> : null}</>}
        actions={<Button icon={<ArrowLeft />} onClick={() => navigate('/customers')}>All customers</Button>}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <HeaderStat label="Balance" value={fmt$(d.tier.balance)} />
          <HeaderStat label="Tier" value={statusText(d.tier.tier)} />
          <HeaderStat label="Purchases" value={d.stats.sales.toLocaleString('en-US')} />
          <HeaderStat label="Spent" value={fmt$(d.stats.spent)} />
          {!c.isActive && <HeaderStat label="Restricted" value="Yes" tone="danger" />}
          {d.signIn.locked && <HeaderStat label="Sign-in" value="Locked" tone="warning" />}
        </div>
      </PageHeader>

      {c.isTest && <Notice tone="warning" style={{ marginBottom: 12 }}>This looks like a test account (a 111-555 area code).</Notice>}
      {!c.isActive && <Notice tone="danger" style={{ marginBottom: 12 }}>Restricted{c.fraudNote ? `: ${c.fraudNote}` : ''}. They cannot earn or redeem until restored.</Notice>}

      <Tabs ariaLabel="Customer profile" value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Overview' }, { value: 'activity', label: 'Activity' }, { value: 'referrals', label: 'Referrals' },
        { value: 'notes', label: 'Notes', count: d.notes || undefined }, { value: 'devices', label: 'Devices', count: d.devices.length || undefined },
        { value: 'history', label: 'Account history' },
      ]} />

      {tab === 'overview' && <Overview id={id} d={d} onChanged={refresh} />}
      {tab === 'activity' && <Activity id={id} />}
      {tab === 'referrals' && <Referrals d={d} />}
      {tab === 'notes' && <Notes id={id} meId={me?.id} isDev={me?.role === 'DEV_ADMIN'} onChanged={refresh} />}
      {tab === 'devices' && <Devices devices={d.devices} />}
      {tab === 'history' && <History id={id} />}
    </Page>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ id, d, onChanged }: { id: string; d: any; onChanged: () => void }) {
  const c = d.customer, s = d.stats, t = d.tier;
  const [unlocking, setUnlocking] = useState(false);
  const [restrictOpen, setRestrictOpen] = useState(false);
  const [gAmt, setGAmt] = useState(''); const [gReason, setGReason] = useState('');
  const unlock = useMutation({
    mutationFn: () => customersApi.unlock(id),
    onSuccess: () => { toast.success('Sign-in unlocked. They can try their PIN again now.'); setUnlocking(false); onChanged(); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not unlock.')); setUnlocking(false); },
  });
  const restrict = useMutation({
    mutationFn: (note?: string) => customersApi.setActive(id, !c.isActive, note),
    onSuccess: () => { toast.success(c.isActive ? 'Account restricted.' : 'Account restored.'); setRestrictOpen(false); onChanged(); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not change the account.')); setRestrictOpen(false); },
  });
  const amount = Number(gAmt);
  const gOk = gAmt.trim() !== '' && amount > 0 && amount <= 25 && /^\d+(\.\d{1,2})?$/.test(gAmt.trim()) && gReason.trim().length > 0;
  const goodwill = useMutation({
    mutationFn: () => customersApi.goodwillCredit(id, amount, gReason.trim()),
    onSuccess: () => { toast.success(`${fmt$(amount)} added. They were told by push notification.`); setGAmt(''); setGReason(''); onChanged(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not add the credit.')),
  });
  const pct = t.nextPts ? Math.min(100, Math.round((t.pts / t.nextPts) * 100)) : 100;
  const disputes = Object.entries(s.disputes as Record<string, number>).map(([k, v]) => `${v} ${statusText(k).toLowerCase()}`).join(', ');

  return (
    <>
      <div style={grid}>
        <Card>
          <SectionTitle>Account</SectionTitle>
          <Facts rows={[
            ['Phone', c.phone], ['Email', c.email ? <>{c.email} {c.emailVerified ? <Badge tone="success">verified</Badge> : <Badge>not verified</Badge>}</> : '-'],
            ['Language', c.language === 'es' ? 'Spanish' : 'English'],
            ['Birthday', c.birthMonth ? `${MONTHS[c.birthMonth - 1]} ${c.birthDay}` : 'Not given'],
            ['21 or older', c.age21Confirmed ? 'Confirmed' : 'Not confirmed'],
            ['Joined', storeDayLong(c.createdAt)], ['Last sign-in', c.lastSignInAt ? storeDayTime(c.lastSignInAt) : '-'],
            ['Invite code', c.referralCode ?? 'Not made yet'],
          ]} />
        </Card>
        <Card>
          <SectionTitle>Tier</SectionTitle>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{statusText(t.tier)}</div>
          <div style={{ fontSize: FONT.small, color: C.muted, margin: '2px 0 10px' }}>{t.nextTier ? `${t.pts.toLocaleString('en-US')} of ${t.nextPts.toLocaleString('en-US')} points to ${t.nextTier} this half-year` : 'Top tier'}</div>
          <div style={{ height: 8, background: C.hover, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }} aria-hidden="true"><div style={{ width: `${pct}%`, height: '100%', background: PRIMARY }} /></div>
          <Facts rows={[['Balance now', fmt$(t.balance)], ['Earned in all', fmt$(s.earned)], ['Redeemed in all', `${fmt$(s.redeemed)} (${s.redemptions} times)`]]} />
        </Card>
        <Card>
          <SectionTitle>Shopping</SectionTitle>
          <Facts rows={[
            ['Purchases', `${s.sales.toLocaleString('en-US')} (${s.salesLast30} in the last 30 days)`], ['Spent', fmt$(s.spent)], ['Average', fmt$(s.avgTicket)],
            ['First / last', s.firstPurchaseAt ? `${storeDayLong(s.firstPurchaseAt)} / ${storeDayLong(s.lastPurchaseAt)}` : 'No purchase yet'],
            ['Usual store', s.favoriteStore ?? '-'],
            ['Waiting', s.pending || s.flagged ? <>{s.pending ? <Badge tone="warning">{s.pending} pending</Badge> : null} {s.flagged ? <Badge tone="warning">{s.flagged} held for review</Badge> : null}</> : 'Nothing'],
            ['Missing-points reports', disputes || 'None'], ['Hot food orders', s.hotFoodOrders],
          ]} />
        </Card>
      </div>
      <div style={grid}>
        <Card>
          <SectionTitle>Sign-in</SectionTitle>
          {d.signIn.locked ? (
            <>
              <Notice tone="warning" style={{ marginBottom: 12 }}>Locked after too many wrong PINs, until {storeDayTime(d.signIn.lockedUntil)}.</Notice>
              <Button variant="primary" onClick={() => setUnlocking(true)} disabled={unlock.isPending}>Unlock sign-in</Button>
            </>
          ) : (
            <p style={{ margin: 0, color: C.text2, fontSize: FONT.body }}>Not locked.{d.signIn.failedAttempts ? ` ${d.signIn.failedAttempts} wrong PIN${d.signIn.failedAttempts === 1 ? '' : 's'} since the last good sign-in.` : ''} If they forgot their PIN, they reset it in the app with a text code.</p>
          )}
        </Card>
        <Card>
          <SectionTitle>Goodwill credit</SectionTitle>
          <p style={{ margin: '-4px 0 10px', color: C.muted, fontSize: FONT.small }}>For something that is not a missing-points report: an apology, a one-off gesture. Up to $25, with a reason they are shown.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ ...INPUT, width: 100 }} inputMode="decimal" placeholder="$0.00" aria-label="Credit in dollars" value={gAmt} maxLength={5} onChange={(e) => setGAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
            <input style={{ ...INPUT, flex: '1 1 160px', width: 'auto' }} placeholder="Reason (required)" aria-label="Reason" value={gReason} maxLength={300} onChange={(e) => setGReason(e.target.value)} />
            <Button variant="primary" disabled={!gOk || goodwill.isPending} onClick={() => goodwill.mutate()}>{goodwill.isPending ? 'Adding…' : 'Add credit'}</Button>
          </div>
          {gAmt.trim() !== '' && amount > 25 && <div role="alert" style={{ color: C.danger, fontSize: FONT.small, marginTop: 6 }}>At most $25. For a larger amount tied to a purchase, use a missing-points report.</div>}
        </Card>
        <Card>
          <SectionTitle>Account status</SectionTitle>
          <p style={{ margin: '-4px 0 12px', color: C.muted, fontSize: FONT.small }}>{c.isActive ? 'Restricting stops them earning and redeeming, and signs them out. You can restore it later.' : 'Restoring lets them earn and redeem again.'}</p>
          <Button variant={c.isActive ? 'danger' : 'primary'} onClick={() => setRestrictOpen(true)}>{c.isActive ? 'Restrict account' : 'Restore account'}</Button>
        </Card>
      </div>
      <ConfirmModal open={unlocking} title="Unlock sign-in?" message="They can try their PIN again straight away." confirmLabel="Unlock" busy={unlock.isPending} onConfirm={() => unlock.mutate()} onCancel={() => setUnlocking(false)} />
      <ConfirmModal open={restrictOpen} danger={c.isActive} title={c.isActive ? 'Restrict this account?' : 'Restore this account?'}
        message={c.isActive ? 'They will be signed out and cannot earn or redeem until restored. Say why (only HQ sees it).' : 'They can earn and redeem again.'}
        withInput={c.isActive} inputLabel="Reason" inputRequired={c.isActive} confirmLabel={c.isActive ? 'Restrict' : 'Restore'} busy={restrict.isPending}
        onConfirm={(v) => restrict.mutate(v?.trim() || undefined)} onCancel={() => setRestrictOpen(false)} />
    </>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function Activity({ id }: { id: string }) {
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['customer-activity', id, kind, page], queryFn: () => customersApi.activity(id, kind, page) });
  const data: any = q.data?.data?.data;
  return (
    <Card>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }} role="group" aria-label="Show">
        {Object.entries(KIND_LABEL).map(([k, l]) => <Chip key={k} selected={kind === k} onClick={() => { setKind(k); setPage(1); }}>{l}</Chip>)}
      </div>
      {q.isError ? <ErrorState onRetry={q.refetch} /> : q.isLoading || !data ? <CardSkeleton count={2} /> : data.items.length === 0 ? <EmptyState title="Nothing here yet" /> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader><TableRow>
                {['When', 'What', 'Store', 'Amount', 'Points', 'Status', 'By'].map((h, i) => <TableHead key={h} style={{ ...th, ...(i === 3 || i === 4 ? num : {}) }}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {data.items.map((it: any) => (
                  <TableRow key={`${it.kind}-${it.id}`}>
                    <TableCell style={{ whiteSpace: 'nowrap', color: C.text2 }}>{storeDayTime(it.at)}</TableCell>
                    <TableCell style={{ minWidth: 200 }}>
                      <div style={{ fontWeight: 600 }}>{it.title}{it.receiptImageUrl && <> · <a href={it.receiptImageUrl} target="_blank" rel="noopener noreferrer">receipt</a></>}</div>
                      {it.detail && <div style={{ fontSize: FONT.caption, color: C.muted }}>{it.detail}</div>}
                    </TableCell>
                    <TableCell style={{ color: C.text2 }}>{it.store ?? '-'}</TableCell>
                    <TableCell style={num}>{it.amount == null ? '' : fmt$(it.amount)}</TableCell>
                    <TableCell style={{ ...num, color: it.points == null ? undefined : it.points < 0 ? C.danger : C.success, fontWeight: 600 }}>{it.points == null ? '' : `${it.points < 0 ? '' : '+'}${fmt$(it.points)}`}</TableCell>
                    <TableCell>{it.status ? <Badge tone={STATUS_TONE[it.status] ?? 'neutral'}>{statusText(it.status)}</Badge> : null}</TableCell>
                    <TableCell style={{ color: C.text2 }}>{it.by ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
            <Button disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>Older</Button>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Referrals, notes, devices, history ───────────────────────────────────────

function Referrals({ d }: { d: any }) {
  const r = d.referral;
  const inv = r.invited as Record<string, number>;
  const total = Object.values(inv).reduce((a, b) => a + b, 0);
  return (
    <div style={grid}>
      <Card>
        <SectionTitle>Their invite code</SectionTitle>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, color: C.text }}>{r.code ?? '-'}</div>
        <p style={{ color: C.muted, fontSize: FONT.small, margin: '6px 0 12px' }}>{r.code ? 'Made when they first opened Invite friends in the app.' : 'They have not opened Invite friends yet.'}</p>
        <Facts rows={[['Friends invited', total], ['Paid', inv.REWARDED ?? 0], ['Waiting for a purchase', inv.PENDING ?? 0], ['Expired', inv.EXPIRED ?? 0], ['They earned', fmt$(r.earnedAsReferrer)]]} />
      </Card>
      <Card>
        <SectionTitle>Invited by</SectionTitle>
        {r.invitedBy ? (
          <Facts rows={[['Who', <Link key="l" to={`/customers/${r.invitedBy.id}`}>{r.invitedBy.name}</Link>], ['Status', <Badge key="b" tone={STATUS_TONE[r.invitedBy.status] ?? 'neutral'}>{statusText(r.invitedBy.status)}</Badge>], ['Since', storeDayLong(r.invitedBy.at)]]} />
        ) : <p style={{ margin: 0, color: C.muted }}>They joined without an invite code.</p>}
        <p style={{ color: C.muted, fontSize: FONT.small, marginTop: 12 }}>Every referral, the amounts and the limits are in Customers → Referrals.</p>
      </Card>
    </div>
  );
}

function Notes({ id, meId, isDev, onChanged }: { id: string; meId?: string; isDev: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['customer-notes', id], queryFn: () => customersApi.notes(id) });
  const notes: any[] = q.data?.data?.data ?? [];
  const add = useMutation({
    mutationFn: () => customersApi.addNote(id, text.trim()),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['customer-notes', id] }); onChanged(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the note.')),
  });
  const del = useMutation({
    mutationFn: (noteId: string) => customersApi.deleteNote(id, noteId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-notes', id] }); onChanged(); },
    onError: (e) => toast.error(serverMessage(e, 'Could not delete the note.')),
  });
  return (
    <Card>
      <SectionTitle>Support notes</SectionTitle>
      <p style={{ margin: '-4px 0 10px', color: C.muted, fontSize: FONT.small }}>Private to HQ. The customer never sees these. They are deleted with the account.</p>
      <textarea style={{ ...INPUT, minHeight: 80, resize: 'vertical' }} placeholder={'e.g. "Called 10/9 about missing gas points. Told them to send the receipt photo."'} aria-label="New note" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 16px' }}>
        <Button variant="primary" disabled={!text.trim() || add.isPending} onClick={() => add.mutate()}>{add.isPending ? 'Saving…' : 'Add note'}</Button>
      </div>
      {q.isError ? <ErrorState onRetry={q.refetch} /> : notes.length === 0 ? <EmptyState title="No notes yet" /> : notes.map((n) => (
        <div key={n.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: FONT.caption, color: C.muted }}>
            <span>{n.authorName ?? 'HQ'} · {storeDayTime(n.createdAt)}</span>
            {(n.authorId === meId || isDev) && <button type="button" onClick={() => del.mutate(n.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: FONT.caption, padding: 0 }}>Delete</button>}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', color: C.text, fontSize: FONT.body, marginTop: 4 }}>{n.text}</div>
        </div>
      ))}
    </Card>
  );
}

function Devices({ devices }: { devices: any[] }) {
  return (
    <Card>
      <SectionTitle>Phones</SectionTitle>
      <p style={{ margin: '-4px 0 12px', color: C.muted, fontSize: FONT.small }}>Each phone that has notifications on. None listed means they will not get pushes: they need to allow notifications for Lucky Stop in the phone's settings, then open the app.</p>
      {devices.length === 0 ? <Notice tone="warning">No phone with notifications on.</Notice> : (
        <Table>
          <TableHeader><TableRow>{['Phone', 'App version', 'First seen', 'Last seen'].map((h) => <TableHead key={h} style={th}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {devices.map((dv, i) => (
              <TableRow key={i}>
                <TableCell style={{ fontWeight: 600 }}>{dv.platform === 'ios' ? 'iPhone' : dv.platform === 'android' ? 'Android' : dv.platform}</TableCell>
                <TableCell>{dv.appVersion ?? <span style={{ color: C.muted }}>older than 1.2.8</span>}</TableCell>
                <TableCell>{storeDayLong(dv.createdAt)}</TableCell>
                <TableCell>{storeDayTime(dv.lastSeenAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function History({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['customer-history', id], queryFn: () => customersApi.history(id) });
  const rows: any[] = q.data?.data?.data ?? [];
  return (
    <Card>
      <SectionTitle>Account history</SectionTitle>
      <p style={{ margin: '-4px 0 12px', color: C.muted, fontSize: FONT.small }}>What staff did on this account, from the Activity Log.</p>
      {q.isError ? <ErrorState onRetry={q.refetch} /> : q.isLoading ? <CardSkeleton count={1} /> : rows.length === 0 ? <EmptyState title="Nothing done on this account yet" /> : rows.map((r) => (
        <div key={r.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0', fontSize: FONT.body }}>
          <div style={{ color: C.text }}>{r.summary ?? statusText(r.action)}</div>
          <div style={{ fontSize: FONT.caption, color: C.muted }}>{r.who ?? 'Someone'} ({statusText(r.role)}) · {storeDayTime(r.at)}{r.store ? ` · ${r.store}` : ''}</div>
        </div>
      ))}
    </Card>
  );
}
