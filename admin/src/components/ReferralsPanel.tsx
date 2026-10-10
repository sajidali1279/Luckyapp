// Customers > Referrals (HQ, 2026-10-09): the refer-a-friend deal (amounts, the friend's minimum purchase, the monthly limit per
// person, the window), the totals, the people who bring the most friends, and every referral with its status.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { referralsApi, type ReferralSettings } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDayLong } from '../lib/storeDates';
import { C, FONT, INPUT } from '../lib/theme';
import { Card, SectionTitle, StatTile, Badge, Button, Chip, EmptyState, Field } from './kit';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import ErrorState from './ErrorState';
import CardSkeleton from './CardSkeleton';

const fmt$ = (n: number | null | undefined) => (n == null ? '-' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const TONE: Record<string, 'success' | 'warning' | 'neutral'> = { REWARDED: 'success', PENDING: 'warning', EXPIRED: 'neutral', CANCELLED: 'neutral' };
const WORD: Record<string, string> = { REWARDED: 'Paid', PENDING: 'Waiting for a purchase', EXPIRED: 'Expired', CANCELLED: 'Cancelled' };
const th = { fontSize: FONT.caption, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' as const };

export default function ReferralsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['referrals', status, page], queryFn: () => referralsApi.list(status || undefined, page) });
  const d: any = q.data?.data?.data;
  const [form, setForm] = useState<Record<keyof ReferralSettings, string> | null>(null);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    if (d?.settings && !form) {
      const s = d.settings as ReferralSettings;
      setEnabled(s.enabled);
      setForm({ enabled: '', referrerReward: String(s.referrerReward), friendReward: String(s.friendReward), minPurchase: String(s.minPurchase), monthlyLimit: String(s.monthlyLimit), windowDays: String(s.windowDays) });
    }
  }, [d, form]);
  const save = useMutation({
    mutationFn: () => referralsApi.saveSettings({
      enabled, referrerReward: Number(form!.referrerReward), friendReward: Number(form!.friendReward), minPurchase: Number(form!.minPurchase),
      monthlyLimit: Number(form!.monthlyLimit), windowDays: Number(form!.windowDays),
    }),
    onSuccess: () => { toast.success('Saved. It applies to rewards paid from now on.'); qc.invalidateQueries({ queryKey: ['referrals'] }); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save.')),
  });

  if (q.isError) return <ErrorState onRetry={q.refetch} />;
  if (q.isLoading || !d || !form) return <CardSkeleton count={3} />;
  const t = d.totals, by = t.byStatus as Record<string, number>;
  const set = (k: keyof ReferralSettings, v: string) => setForm((f) => ({ ...f!, [k]: v.replace(/[^0-9.]/g, '') }));
  const s = d.settings as ReferralSettings;
  const changed = enabled !== s.enabled || (['referrerReward', 'friendReward', 'minPurchase', 'monthlyLimit', 'windowDays'] as const).some((k) => Number(form[k]) !== s[k]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatTile label="Friends who joined" value={((by.PENDING ?? 0) + (by.REWARDED ?? 0) + (by.EXPIRED ?? 0)).toLocaleString('en-US')} />
        <StatTile label="Paid" value={(by.REWARDED ?? 0).toLocaleString('en-US')} hint={`${t.rewardedThisMonth} this month`} />
        <StatTile label="Waiting for a purchase" value={(by.PENDING ?? 0).toLocaleString('en-US')} />
        <StatTile label="Rewards paid in all" value={fmt$(t.paid)} hint="Both sides together" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionTitle>The deal</SectionTitle>
          <p style={{ margin: '-4px 0 12px', color: C.muted, fontSize: FONT.small, lineHeight: 1.5 }}>
            A customer shares their code from the app. When the friend's first purchase of at least the minimum is approved within the window, both are
            paid in credits at that store (the store's platform fee applies, like a challenge reward). Changes apply to rewards paid from now on.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: FONT.body, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Accept invite codes
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Field label="Person who shared gets ($)" htmlFor="r-ref"><input id="r-ref" style={INPUT} inputMode="decimal" value={form.referrerReward} onChange={(e) => set('referrerReward', e.target.value)} /></Field>
            <Field label="New friend gets ($)" htmlFor="r-fr"><input id="r-fr" style={INPUT} inputMode="decimal" value={form.friendReward} onChange={(e) => set('friendReward', e.target.value)} /></Field>
            <Field label="Friend's purchase at least ($)" htmlFor="r-min"><input id="r-min" style={INPUT} inputMode="decimal" value={form.minPurchase} onChange={(e) => set('minPurchase', e.target.value)} /></Field>
            <Field label="Paid friends per person a month" htmlFor="r-lim"><input id="r-lim" style={INPUT} inputMode="numeric" value={form.monthlyLimit} onChange={(e) => set('monthlyLimit', e.target.value)} /></Field>
            <Field label="Days the friend has to buy" htmlFor="r-days"><input id="r-days" style={INPUT} inputMode="numeric" value={form.windowDays} onChange={(e) => set('windowDays', e.target.value)} /></Field>
          </div>
          <Button variant="primary" disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </Card>
        <Card>
          <SectionTitle>Bring the most friends</SectionTitle>
          {d.topReferrers.length === 0 ? <EmptyState title="Nobody has been paid for a friend yet" /> : d.topReferrers.map((p: any) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: FONT.body }}>
              <Link to={`/customers/${p.id}`}>{p.name}</Link>
              <span style={{ color: C.text2 }}>{p.friends} friend{p.friends === 1 ? '' : 's'}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <SectionTitle count={d.total}>Every referral</SectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }} role="group" aria-label="Status">
          {[['', 'All'], ['PENDING', 'Waiting'], ['REWARDED', 'Paid'], ['EXPIRED', 'Expired']].map(([v, l]) => <Chip key={v} selected={status === v} onClick={() => { setStatus(v); setPage(1); }}>{l}</Chip>)}
        </div>
        {d.referrals.length === 0 ? <EmptyState title="No referrals yet" description="They appear here when a new customer signs up with someone's code." /> : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader><TableRow>{['Joined', 'Shared by', 'New friend', 'Status', 'Paid', 'Store'].map((h) => <TableHead key={h} style={th}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {d.referrals.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell style={{ whiteSpace: 'nowrap', color: C.text2 }}>{storeDayLong(r.createdAt)}</TableCell>
                    <TableCell><Link to={`/customers/${r.referrer.id}`}>{r.referrer.name || r.referrer.phone}</Link></TableCell>
                    <TableCell><Link to={`/customers/${r.friend.id}`}>{r.friend.name || r.friend.phone}</Link></TableCell>
                    <TableCell><Badge tone={TONE[r.status] ?? 'neutral'}>{WORD[r.status] ?? r.status}</Badge>{r.note && <div style={{ fontSize: FONT.caption, color: C.muted, marginTop: 2 }}>{r.note}</div>}</TableCell>
                    <TableCell style={{ whiteSpace: 'nowrap' }}>{r.status === 'REWARDED' ? `${fmt$(r.referrerReward)} + ${fmt$(r.friendReward)}` : '-'}</TableCell>
                    <TableCell style={{ color: C.text2 }}>{r.store ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(page > 1 || d.hasMore) && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
            <Button disabled={!d.hasMore} onClick={() => setPage((p) => p + 1)}>Older</Button>
          </div>
        )}
      </Card>
    </>
  );
}
