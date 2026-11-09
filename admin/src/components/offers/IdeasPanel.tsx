// Promotion ideas (HQ, Offers > Ideas): promotions worked out from the last 8 weeks of sales (backend utils/promotionIdeas.ts, plus
// "It worked last time" from utils/offerAutopilot.ts), each with why, what it would cost, and anything already running on the same
// sales. "Use this idea" fills in the post form to change first; "Post now" (2026-11-09) posts it as it is after one confirm.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Lightbulb, Clock, MapPin, Users, CalendarDays, Send, Check } from 'lucide-react';
import { offersApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import ConfirmModal from '../ConfirmModal';
import { C, FONT, RADIUS } from '../../lib/theme';
import { Badge, Button, Card, Notice, SectionTitle } from '../kit';
import CardSkeleton from '../CardSkeleton';
import ErrorState from '../ErrorState';
import { hoursLabel } from './HappyHours';
import { categoryLabel } from '../../lib/categories';
import { storeDayLong, startOfStoreDay, endOfStoreDay } from '../../lib/storeDates';

export type IdeaOffer = {
  title: string; titleEs: string; description: string; descriptionEs: string;
  category: string | null; storeId: string | null; storeName: string | null;
  bonusRate: number | null; gasBonusCentsPerGallon: number | null;
  happyDays: number[]; happyFrom: string | null; happyTo: string | null;
  startDate: string; endDate: string; audience: 'EVERYONE' | 'LAPSED'; audienceDays: number | null;
};
type Idea = {
  id: string; kind: 'SLOW_HOURS' | 'FALLING_CATEGORY' | 'SLOW_STORE' | 'WIN_BACK' | 'WORKED_BEFORE'; headline: string; why: string; sizing: string; offer: IdeaOffer;
  estimate: { estimatedExtra: number; days: number; basisSales: number; approximate?: boolean }; alongside: string[];
};

const KIND: Record<Idea['kind'], string> = { SLOW_HOURS: 'Slow hours', FALLING_CATEGORY: 'Falling category', SLOW_STORE: 'Store falling behind', WIN_BACK: 'Win-back', WORKED_BEFORE: 'It worked last time' };

/** The idea as the post form would send it: its words, bonus, store, hours, audience and its store days. */
export function ideaForm(o: IdeaOffer): FormData {
  const fd = new FormData();
  fd.append('title', o.title);
  fd.append('description', o.description);
  fd.append('type', o.storeId ? 'SPECIFIC_STORE' : 'ALL_STORES');
  if (o.storeId) fd.append('storeId', o.storeId);
  if (o.category) fd.append('category', o.category);
  if (o.gasBonusCentsPerGallon != null) fd.append('gasBonusCentsPerGallon', String(o.gasBonusCentsPerGallon));
  else if (o.bonusRate != null) fd.append('bonusRate', String(o.bonusRate));
  fd.append('startDate', startOfStoreDay(o.startDate).toISOString());
  fd.append('endDate', endOfStoreDay(o.endDate).toISOString());
  if (o.happyFrom && o.happyTo) { fd.append('happyDays', JSON.stringify(o.happyDays)); fd.append('happyFrom', o.happyFrom); fd.append('happyTo', o.happyTo); }
  fd.append('lastDayReminder', 'true');
  fd.append('audience', o.audience);
  if (o.audience === 'LAPSED' && o.audienceDays != null) fd.append('audienceDays', String(o.audienceDays));
  if (o.titleEs.trim()) fd.append('titleEs', o.titleEs.trim());
  if (o.descriptionEs.trim()) fd.append('descriptionEs', o.descriptionEs.trim());
  return fd;
}
/** 'Oct 6, 2026' for a store day (YYYY-MM-DD) */
const dayLong = (key: string) => storeDayLong(startOfStoreDay(key));
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bonus = (o: IdeaOffer) => (o.gasBonusCentsPerGallon != null ? `+${o.gasBonusCentsPerGallon}¢ a gallon` : `+${parseFloat(((o.bonusRate ?? 0) * 100).toFixed(2))}%`);

export default function IdeasPanel({ onUse }: { onUse: (o: IdeaOffer) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['offer-ideas'], queryFn: () => offersApi.ideas(), staleTime: 5 * 60_000 });
  const result = data?.data?.data as { basis: { days: number; sales: number; from: string; to: string }; ideas: Idea[]; tooFew: boolean } | undefined;
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<Idea | null>(null);
  const [posted, setPosted] = useState<Set<string>>(new Set());
  const post = useMutation({
    mutationFn: (idea: Idea) => offersApi.create(ideaForm(idea.offer)),
    onSuccess: (_r, idea) => {
      toast.success(`Posted: ${idea.offer.title}`);
      setPosted((s) => new Set(s).add(idea.id));
      setConfirming(null);
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['offers-history'] });
    },
    onError: (e) => toast.error(serverMessage(e, 'Could not post it. Please try again.')),
  });

  return (
    <Card style={{ marginBottom: 24, maxWidth: 880 }}>
      <SectionTitle>Promotion ideas</SectionTitle>
      {isLoading ? <CardSkeleton count={2} /> : isError || !result ? <ErrorState compact message="Could not work out the ideas." onRetry={() => refetch()} /> : (
        <>
          <p style={{ margin: '-4px 0 14px', color: C.muted, fontSize: FONT.body, lineHeight: 1.5 }}>
            From {result.basis.sales.toLocaleString('en-US')} approved sales between {dayLong(result.basis.from)} and {dayLong(result.basis.to)}.
            Use one to fill in the form, then change anything before you post it.
          </p>
          {result.tooFew ? (
            <Notice tone="info" icon={<Lightbulb size={16} />}>Not enough sales yet. Ideas appear once there are a few weeks of sales to compare.</Notice>
          ) : result.ideas.length === 0 ? (
            <Notice tone="success" icon={<Lightbulb size={16} />}>Nothing stands out: no category has clearly slow hours, nothing is falling, and few regulars have stopped coming.</Notice>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onUse={() => onUse(idea.offer)} onPost={() => setConfirming(idea)} posted={posted.has(idea.id)} />)}
            </div>
          )}
        </>
      )}
      <ConfirmModal
        open={!!confirming}
        title="Post this promotion now?"
        busy={post.isPending}
        confirmLabel="Post now"
        message={confirming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0 }}><strong>{confirming.offer.title}</strong> ({bonus(confirming.offer)}, {confirming.offer.storeName ?? 'all stores'}), {dayLong(confirming.offer.startDate)} to {dayLong(confirming.offer.endDate)}.</p>
            <p style={{ margin: 0 }}>{confirming.estimate.approximate ? 'Roughly ' : 'About '}{usd(confirming.estimate.estimatedExtra)} of extra cashback. Customers get a push when it starts. You can edit or end it on this page.</p>
          </div>
        ) : ''}
        onConfirm={() => { if (confirming) post.mutate(confirming); }}
        onCancel={() => setConfirming(null)}
      />
    </Card>
  );
}

function IdeaCard({ idea, onUse, onPost, posted }: { idea: Idea; onUse: () => void; onPost: () => void; posted: boolean }) {
  const o = idea.offer;
  const when = hoursLabel(o);
  return (
    <div data-testid="idea-card" style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Badge tone={idea.kind === 'WORKED_BEFORE' ? 'success' : idea.kind === 'WIN_BACK' ? 'info' : 'warning'}>{KIND[idea.kind]}</Badge>
          <div style={{ fontWeight: 700, fontSize: FONT.body + 1, color: C.text, marginTop: 6 }}>{idea.headline}</div>
          <div style={{ fontSize: FONT.small, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{idea.why}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={onUse} aria-label={`Use this idea: ${o.title}`}>Use this idea</Button>
          {posted
            ? <Badge tone="success" icon={<Check size={12} />}>Posted</Badge>
            : <Button variant="primary" size="sm" icon={<Send />} onClick={onPost} aria-label={`Post now: ${o.title}`}>Post now</Button>}
        </div>
      </div>
      <div style={{ background: C.hover, borderRadius: RADIUS.sm, padding: '10px 12px' }}>
        <div style={{ fontWeight: 600, fontSize: FONT.body, color: C.text }}>{o.title}</div>
        <div style={{ fontSize: FONT.small, color: C.text2, marginTop: 2 }}>{o.description}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <Badge tone="info">{bonus(o)}</Badge>
          <Badge>{categoryLabel(o.category)}</Badge>
          <Badge icon={<MapPin size={12} />}>{o.storeName ?? 'All stores'}</Badge>
          {when && <Badge icon={<Clock size={12} />}>{when}</Badge>}
          {o.audience === 'LAPSED' && <Badge icon={<Users size={12} />}>Not bought in {o.audienceDays} days</Badge>}
          <Badge icon={<CalendarDays size={12} />}>{dayLong(o.startDate)} to {dayLong(o.endDate)}</Badge>
        </div>
      </div>
      <div style={{ fontSize: FONT.small, color: C.text2, lineHeight: 1.5 }}>
        <strong>{idea.estimate.approximate ? 'Roughly ' : 'About '}{usd(idea.estimate.estimatedExtra)}</strong> of extra cashback over {idea.estimate.days} days, from the same sales in the last 4 weeks.
        {' '}{idea.sizing}
      </div>
      {idea.alongside.length > 0 && (
        <div style={{ fontSize: FONT.small, color: C.warning }}>
          Already running on some of these sales: {idea.alongside.join(', ')}. A sale gets one promotion: the one for its category or store first, then the bigger bonus.
        </div>
      )}
    </div>
  );
}
