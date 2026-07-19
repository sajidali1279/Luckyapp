import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pin, X } from 'lucide-react';
import { noticesApi } from '../services/api';

const DISMISSED_NOTICES_KEY = 'dismissed-admin-notices';

interface Notice {
  id: string;
  title: string;
  body: string;
  storeId: string | null;
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
    : allNotices.filter((n) => !n.storeId || n.storeId === storeId);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_NOTICES_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const notice = relevantNotices.find((n) => !dismissedIds.has(n.id)) || null;

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
  return (
    <div style={s.banner}>
      <div style={s.iconWrap}><Pin size={16} color="#92400e" /></div>
      <div style={{ flex: 1 }}>
        <div style={s.title}>{notice.title}</div>
        <div style={s.body}>{notice.body}</div>
      </div>
      <button onClick={onDismiss} style={s.dismissBtn} aria-label="Dismiss notice">
        <X size={16} color="#92400e" strokeWidth={2.5} />
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
    padding: '12px 14px',
  },
  iconWrap: { marginTop: 1, flexShrink: 0 },
  title: { fontSize: 13.5, fontWeight: 800, color: '#92400e', marginBottom: 2 },
  body: { fontSize: 13, color: '#78350f', lineHeight: 1.5 },
  dismissBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
    marginTop: 1, flexShrink: 0, display: 'flex',
  },
};
