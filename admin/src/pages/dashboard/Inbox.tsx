import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAdminBadges } from '../../hooks/useAdminBadges';
import { formatInteger } from '../../components/formater';
import { s, since, daysUntil, SkeletonBox } from './shared';
import { usePlatform, useStoreHealth, useOffers, useLabelHealth, useCashbackHealth } from './queries';

// One list of everything waiting for a decision. The queue counts come from the same hook as the sidebar
// badges, so the two can never disagree. The computed alerts (quiet stores, cashback over the line, a promo
// about to end) are the things nobody was watching before.

type Sev = 'high' | 'med' | 'low';
interface Item {
  id: string; sev: Sev; count: number; text: string; meta?: string; to?: string;
  snoozable?: boolean; onClick?: () => void;
}

const SEV_COLOR: Record<Sev, string> = { high: '#D62839', med: '#F4A261', low: '#94A3B8' };
const SEV_RANK: Record<Sev, number> = { high: 0, med: 1, low: 2 };
const SNOOZE_KEY = 'dash-inbox-snooze';
const SNOOZE_MS = 7 * 86_400_000;
const INBOX_VISIBLE = 5; // the most urgent five; the rest sit behind "Show more" so the numbers stay above the fold

function readSnoozes(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}');
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => typeof until === 'number' && until > now)) as Record<string, number>;
  } catch { return {}; }
}
function writeSnoozes(v: Record<string, number>) {
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatInteger(n)} ${n === 1 ? one : many}`;
const list = (names: string[], max = 3) => names.slice(0, max).join(', ') + (names.length > max ? ` and ${names.length - max} more` : '');

export default function AttentionInbox() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const b = useAdminBadges();
  const platformQ = usePlatform();
  const healthQ = useStoreHealth();
  const offersQ = useOffers();
  const labelQ = useLabelHealth();
  const cashbackQ = useCashbackHealth(isDevAdmin);
  const [snoozes, setSnoozes] = useState<Record<string, number>>(readSnoozes);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const platform = platformQ.data?.data?.data;
  const stores: any[] = healthQ.data?.data?.data ?? [];
  const offers: any[] = offersQ.data?.data?.data ?? [];
  const staleLabels: number = labelQ.data?.data?.data?.totalStale ?? 0;
  const staleLabelStores: number = labelQ.data?.data?.data?.storesWithStale ?? 0;
  const cashbackStores: any[] = (cashbackQ.data?.data?.data ?? []).filter((x: any) => x.status !== 'ok');

  const items: Item[] = [];

  // Transactions waiting for a decision (pending and flagged, like the sidebar badge)
  if (platformQ.isError) {
    items.push({ id: 'tx-failed', sev: 'high', count: 0, text: "Couldn't check pending transactions. Retry", onClick: () => platformQ.refetch() });
  } else {
    const flagged: number = platform?.flagged ?? 0;
    const awaiting: number = platform ? (platform.pending ?? 0) + flagged : b.transactionsPendingCount;
    if (awaiting > 0) {
      const oldest: string | null = platform?.oldestReviewAt ?? null;
      const stale = oldest ? Date.now() - new Date(oldest).getTime() > 86_400_000 : false;
      items.push({
        id: 'tx-review', sev: flagged > 0 || stale ? 'high' : 'med', count: awaiting,
        text: `${plural(awaiting, 'transaction')} awaiting review${flagged > 0 ? ` (${formatInteger(flagged)} flagged)` : ''}`,
        meta: oldest ? `oldest waiting ${since(oldest).replace(' ago', '')}` : undefined, to: '/transactions',
      });
    }
  }

  // Stores that stopped selling
  const quiet = stores.filter((x) => x.hoursSinceLastSale != null && x.hoursSinceLastSale > 24 && x.hoursSinceLastSale <= 24 * 14);
  const dormant = stores.filter((x) => x.hoursSinceLastSale == null || x.hoursSinceLastSale > 24 * 14);
  if (quiet.length > 0) {
    items.push({ id: 'stores-quiet', sev: 'high', count: quiet.length, snoozable: true, to: '/stores',
      text: `${plural(quiet.length, 'store')} with no sale in over a day`, meta: list(quiet.map((x) => x.name)) });
  }
  if (dormant.length > 0) {
    items.push({ id: 'stores-dormant', sev: 'low', count: dormant.length, snoozable: true, to: '/stores',
      text: `${plural(dormant.length, 'store')} with no sales in two weeks or more`, meta: list(dormant.map((x) => x.name)) });
  }

  if (b.disputesPendingCount > 0) items.push({ id: 'disputes', sev: 'med', count: b.disputesPendingCount, text: `${plural(b.disputesPendingCount, 'open dispute')}`, to: '/customers?tab=disputes' });

  if (isDevAdmin && cashbackStores.length > 0) {
    const critical = cashbackStores.some((x) => x.status === 'critical');
    items.push({ id: 'cashback', sev: critical ? 'high' : 'med', count: cashbackStores.length, snoozable: true, to: '/rates',
      text: `${plural(cashbackStores.length, 'store')} paying out more cashback than expected`, meta: `${list(cashbackStores.map((x) => x.storeName))}, last 30 days` });
  }

  const ending = offers.filter((o) => o.isActive && daysUntil(o.endDate) >= 0 && daysUntil(o.endDate) <= 2);
  if (ending.length > 0) {
    items.push({ id: 'promo-ending', sev: 'low', count: ending.length, snoozable: true, to: '/offers',
      text: `${plural(ending.length, 'promotion')} ending within two days`, meta: list(ending.map((o) => o.title)) });
  }

  if (b.requestsPendingCount > 0) items.push({ id: 'requests', sev: 'med', count: b.requestsPendingCount, text: `${plural(b.requestsPendingCount, 'store request')} to review`, to: '/store-requests' });
  if (b.supportUnread > 0) items.push({ id: 'support', sev: 'med', count: b.supportUnread, text: `${plural(b.supportUnread, 'unread support message')}`, to: '/support' });
  if (b.schedulingPendingCount > 0) items.push({ id: 'scheduling', sev: 'med', count: b.schedulingPendingCount, text: `${plural(b.schedulingPendingCount, 'schedule request')} waiting`, to: '/scheduling' });
  if (b.hotFoodPendingCount > 0) items.push({ id: 'hotfood', sev: 'med', count: b.hotFoodPendingCount, text: `${plural(b.hotFoodPendingCount, 'hot food order')} not accepted yet`, to: '/hot-food' });
  if (isDevAdmin && b.promotionsPendingCount > 0) items.push({ id: 'promos', sev: 'med', count: b.promotionsPendingCount, text: `${plural(b.promotionsPendingCount, 'business promotion request')}`, to: '/promotions' });
  if (isDevAdmin && b.categoriesPendingCount > 0) items.push({ id: 'categories', sev: 'low', count: b.categoriesPendingCount, text: `${plural(b.categoriesPendingCount, 'order category', 'order categories')} to approve`, to: '/order-list' });
  if (b.billingPendingCount > 0) items.push({ id: 'billing', sev: 'low', count: b.billingPendingCount, text: `${plural(b.billingPendingCount, 'billing period')} with unpaid records`, to: isDevAdmin ? '/billing' : '/my-billing' });
  if (b.careersNewCount > 0) items.push({ id: 'careers', sev: 'low', count: b.careersNewCount, text: `${plural(b.careersNewCount, 'new job application')}`, to: '/careers' });
  if (b.chatUnreadCount > 0) items.push({ id: 'chat', sev: 'low', count: b.chatUnreadCount, text: `${plural(b.chatUnreadCount, 'unread chat message')}`, to: '/chat' });
  if (staleLabels > 0) items.push({ id: 'labels', sev: 'low', count: staleLabels, text: `${plural(staleLabels, 'label')} need printing at ${plural(staleLabelStores, 'store')}`, to: '/labels?tab=health' });

  items.sort((a, c) => SEV_RANK[a.sev] - SEV_RANK[c.sev] || c.count - a.count);
  const live = items.filter((i) => !(i.snoozable && snoozes[i.id]));
  const snoozed = items.filter((i) => i.snoozable && snoozes[i.id]);

  const snooze = (id: string) => { const next = { ...readSnoozes(), [id]: Date.now() + SNOOZE_MS }; writeSnoozes(next); setSnoozes(next); };
  const unsnooze = (id: string) => { const next = { ...readSnoozes() }; delete next[id]; writeSnoozes(next); setSnoozes(next); };

  const loading = platformQ.isLoading && healthQ.isLoading && items.length === 0;
  if (loading) return <SkeletonBox h={92} mb={22} />;

  const row = (i: Item, dim = false) => (
    <div key={i.id} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #f6f0e8', opacity: dim ? 0.6 : 1 }}>
      <button style={{ ...s.inboxRow, borderTop: 'none' }} onClick={() => (i.onClick ? i.onClick() : navigate(i.to!))}>
        <span style={{ ...s.inboxDot, background: SEV_COLOR[i.sev] }} aria-hidden="true" />
        <span style={s.inboxText}>
          {i.text}
          {i.meta && <span style={s.inboxMeta}> · {i.meta}</span>}
        </span>
        {i.count > 0 && <span style={{ ...s.inboxCount, background: SEV_COLOR[i.sev] }}>{formatInteger(i.count)}</span>}
        <span aria-hidden="true" style={{ color: '#94A3B8', fontWeight: 700 }}>→</span>
      </button>
      {i.snoozable && (
        <button style={{ ...s.inboxSnooze, marginRight: 14 }} onClick={() => (dim ? unsnooze(i.id) : snooze(i.id))}
          title={dim ? 'Show this again' : 'Hide this for 7 days'}>
          {dim ? 'Unsnooze' : 'Snooze 7d'}
        </button>
      )}
    </div>
  );

  return (
    <div style={s.inbox} role="region" aria-label="Needs your attention">
      <div style={s.inboxHead}>
        <span style={s.inboxTitle}>{live.length > 0 ? `Needs your attention (${live.length})` : 'Needs your attention'}</span>
        {snoozed.length > 0 && (
          <button style={s.inboxSnooze} onClick={() => setShowSnoozed((v) => !v)}>
            {snoozed.length} snoozed · {showSnoozed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {live.length === 0 ? (
        <div style={s.inboxClear}>✅ All clear. Nothing needs you right now.</div>
      ) : (expanded ? live : live.slice(0, INBOX_VISIBLE)).map((i) => row(i))}
      {live.length > INBOX_VISIBLE && (
        <button style={{ ...s.inboxRow, justifyContent: 'center', color: '#92400e', fontWeight: 700, fontSize: 14 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `Show ${live.length - INBOX_VISIBLE} more`}
        </button>
      )}
      {showSnoozed && snoozed.map((i) => row(i, true))}
    </div>
  );
}
