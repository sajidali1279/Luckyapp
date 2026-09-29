import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Pin, X } from 'lucide-react';
import { noticesApi } from '../services/api';

const DISMISSED_NOTICES_KEY = 'dismissed-admin-notices';

interface Notice {
  id: string;
  title: string;
  body: string;
  storeId: string | null;
  storeIds?: string[];
  priority?: 'NORMAL' | 'URGENT';
}

/**
 * `storeId` narrows to notices relevant to one store (chain-wide + that store's own).
 * Leave it unset to show any active notice regardless of store — for pages like
 * the Dashboard that have no single "current store" context (DevAdmin/SuperAdmin
 * oversee every store at once).
 */
export function usePinnedNotice(storeId?: string | null) {
  const { data } = useQuery({
    queryKey: ['active-notices'],
    queryFn: () => noticesApi.getActive(),
    staleTime: 60_000,
  });
  const allNotices: Notice[] = data?.data?.data || [];
  const relevantNotices = storeId === undefined
    ? allNotices
    : allNotices.filter((n) => (n.storeIds ? n.storeIds.length === 0 || (!!storeId && n.storeIds.includes(storeId)) : !n.storeId || n.storeId === storeId));

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_NOTICES_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  // An urgent notice cannot be closed; the server lists urgent ones first
  const notice = relevantNotices.find((n) => n.priority === 'URGENT' || !dismissedIds.has(n.id)) || null;

  function dismiss(id: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(DISMISSED_NOTICES_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return { notice, dismiss };
}

export default function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const urgent = notice.priority === 'URGENT';
  const ink = urgent ? '#a51b28' : '#8a5300';
  return (
    <div style={{ ...s.banner, ...(urgent ? s.bannerUrgent : {}) }} role={urgent ? 'alert' : undefined}>
      <div style={s.iconWrap}>{urgent ? <AlertTriangle size={16} color={ink} /> : <Pin size={16} color={ink} />}</div>
      <div style={{ flex: 1 }}>
        <div style={{ ...s.title, color: ink }}>{urgent && 'Urgent: '}{notice.title}</div>
        <div style={{ ...s.body, color: ink }}>{notice.body}</div>
      </div>
      {!urgent && (
        <button onClick={onDismiss} style={s.dismissBtn} aria-label="Dismiss notice">
          <X size={16} color={ink} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#fdf6e8', border: '1px solid #f1dcaf', borderRadius: 12,
    padding: '12px 14px',
  },
  bannerUrgent: { background: '#fdf2f2', border: '1px solid #f3cdd1' },
  iconWrap: { marginTop: 1, flexShrink: 0 },
  title: { fontSize: 13.5, fontWeight: 700, color: '#8a5300', marginBottom: 2 },
  body: { fontSize: 13, color: '#8a5300', lineHeight: 1.5 },
  dismissBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
    marginTop: 1, flexShrink: 0, display: 'flex',
  },
};
