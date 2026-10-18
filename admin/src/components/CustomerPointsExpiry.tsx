// A customer's points expiry on their profile (HQ, 2026-10-17): what expires next, what expired, whether their points add up to their
// balance, and "Give back expired points".
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDay } from '../lib/storeDates';
import { C, FONT } from '../lib/theme';
import { Button, Card, SectionTitle, Notice } from './kit';
import ConfirmModal from './ConfirmModal';

interface Summary { enabled: boolean; days: number; next: { date: string; points: number } | null; upcoming: { date: string; points: number }[]; expired: { date: string; points: number }[]; batchesMatchBalance: boolean; balance: number; inBatches: number }
const dateOnly = (d: string) => storeDay(`${d}T18:00:00Z`);

export default function CustomerPointsExpiry({ id, onChanged }: { id: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['customer-expiry', id], queryFn: () => customersApi.pointsExpiry(id) });
  const s = q.data?.data?.data as Summary | undefined;
  const [asking, setAsking] = useState(false);
  const undo = useMutation({
    mutationFn: () => customersApi.undoPointsExpiry(id),
    onSuccess: (r) => { toast.success(`${(r?.data?.data?.points ?? 0).toLocaleString('en-US')} points given back.`); setAsking(false); qc.invalidateQueries({ queryKey: ['customer-expiry', id] }); onChanged(); },
    onError: (e) => { setAsking(false); toast.error(serverMessage(e, 'Could not give them back.')); },
  });
  if (q.isLoading || !s) return null;
  const expiredTotal = s.expired.reduce((n, e) => n + e.points, 0);
  return (
    <Card>
      <SectionTitle>Points expiry</SectionTitle>
      {!s.enabled && s.expired.length === 0 ? (
        <p style={{ margin: '-4px 0 0', color: C.muted, fontSize: FONT.small }}>Points expiry is off: none of their points expire.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, fontSize: FONT.small, color: C.text2 }}>
          {s.enabled && (s.upcoming.length ? (
            <div>Next to expire: {s.upcoming.slice(0, 3).map((u) => `${u.points.toLocaleString('en-US')} pts on ${dateOnly(u.date)}`).join(' · ')}</div>
          ) : <div>Nothing to expire.</div>)}
          {s.expired.length > 0 && (
            <div>
              Expired in the last year: {s.expired.slice(0, 4).map((e) => `${e.points.toLocaleString('en-US')} pts on ${dateOnly(e.date)}`).join(' · ')}
              <div style={{ marginTop: 6 }}><Button size="sm" variant="secondary" onClick={() => setAsking(true)}>Give back {expiredTotal.toLocaleString('en-US')} expired points</Button></div>
            </div>
          )}
        </div>
      )}
      {!s.batchesMatchBalance && (
        <Notice tone="danger" style={{ marginTop: 10 }}>Their points do not add up to their balance (${s.inBatches.toFixed(2)} tracked, ${s.balance.toFixed(2)} balance). Expiry skips them until this is checked.</Notice>
      )}
      <ConfirmModal open={asking} title="Give back their expired points?" busy={undo.isPending} confirmLabel="Give back"
        message={<p style={{ margin: 0 }}>{expiredTotal.toLocaleString('en-US')} points go back on their balance with a fresh {s.days} days. It is logged with your name.</p>}
        onConfirm={() => undo.mutate()} onCancel={() => setAsking(false)} />
    </Card>
  );
}
