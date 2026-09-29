import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { noticesApi } from '../services/api';
import { XIcon, MapPinIcon, AlertTriangleIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';

const DISMISSED_NOTICES_KEY = 'dismissed-admin-notices';
/** How many notices show before "Show N more" (urgent ones always show). */
const SHOWN = 2;

export interface Notice {
  id: string;
  title: string;
  body: string;
  storeId: string | null;
  /** The stores it is for; empty means every store. Older servers send only storeId. */
  storeIds?: string[];
  priority?: 'NORMAL' | 'URGENT';
}

function useDismissedNoticeIds() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_NOTICES_KEY).then((raw) => {
      if (raw) { try { setDismissedIds(new Set(JSON.parse(raw))); } catch {} }
    });
  }, []);

  function dismiss(id: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(DISMISSED_NOTICES_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return { dismissedIds, dismiss };
}

// Accepts either one store (e.g. ChatScreen's currently-selected store) or
// every store an employee is assigned to (e.g. the home screen) — a
// multi-store employee's relevant notices aren't all scoped to storeIds[0].
// '*' takes every notice the server sent (it already sends only the caller's stores and role): the home screens use it
type StoreIdInput = string | (string | null | undefined)[] | null | undefined;
function normalizeStoreIds(input: StoreIdInput): string[] {
  if (!input) return [];
  return (Array.isArray(input) ? input : [input]).filter((id): id is string => !!id);
}

function isFor(n: Notice, storeIds: string[]): boolean {
  if (n.storeIds) return n.storeIds.length === 0 || n.storeIds.some((id) => storeIds.includes(id));
  return !n.storeId || storeIds.includes(n.storeId);
}

/** Every live notice for these stores: urgent ones always (they cannot be closed), the rest until closed. The server already sends
 * only the caller's notices (their stores and role), urgent first; this narrows to the screen's store(s). */
export function usePinnedNotices(storeIdInput: StoreIdInput) {
  const storeIds = normalizeStoreIds(storeIdInput);
  const { data, refetch } = useQuery({
    queryKey: ['active-notices'],
    queryFn: () => noticesApi.getActive(),
    staleTime: 60_000,
  });
  const allNotices: Notice[] = data?.data?.data || [];
  const { dismissedIds, dismiss } = useDismissedNoticeIds();
  const notices = allNotices
    .filter((n) => storeIdInput === '*' || isFor(n, storeIds))
    .filter((n) => n.priority === 'URGENT' || !dismissedIds.has(n.id))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'URGENT' ? -1 : 1));
  return { notices, dismiss, refetch };
}

/** Kept for any caller that shows one: the first of the list. */
export function usePinnedNotice(storeIdInput: StoreIdInput) {
  const { notices, dismiss, refetch } = usePinnedNotices(storeIdInput);
  return { notice: notices[0] ?? null, dismiss, refetch };
}

/** All of the notices, stacked: the first two, then "Show N more". */
export function NoticeStack({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (notices.length === 0) return null;
  const urgentCount = notices.filter((n) => n.priority === 'URGENT').length;
  const limit = Math.max(SHOWN, urgentCount);
  const shown = open ? notices : notices.slice(0, limit);
  const hidden = notices.length - shown.length;
  return (
    <View>
      {shown.map((n) => <NoticeBanner key={n.id} notice={n} onDismiss={() => onDismiss(n.id)} />)}
      {(hidden > 0 || open) && notices.length > limit && (
        <TouchableOpacity
          style={s.more}
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={s.moreText}>{open ? t('notices.showLess') : t('notices.showMore', { count: hidden })}</Text>
          {open ? <ChevronUpIcon size={14} color="#8a5300" strokeWidth={2.2} /> : <ChevronDownIcon size={14} color="#8a5300" strokeWidth={2.2} />}
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const urgent = notice.priority === 'URGENT';
  const ink = urgent ? '#a51b28' : '#8a5300';
  return (
    <TouchableOpacity
      style={[s.noticeBanner, urgent && s.urgentBanner]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t(urgent ? 'notices.urgentA11y' : 'notices.noticeA11y', { title: notice.title, body: notice.body })}
    >
      <View style={s.noticeIconWrap}>
        {urgent ? <AlertTriangleIcon size={16} color={ink} strokeWidth={2.2} /> : <MapPinIcon size={16} color={ink} strokeWidth={2.2} />}
      </View>
      <View style={{ flex: 1 }}>
        {urgent && <Text style={s.urgentTag}>{t('notices.urgent').toUpperCase()}</Text>}
        <Text style={[s.noticeTitle, { color: ink }]}>{notice.title}</Text>
        <Text style={[s.noticeBody, { color: ink }]} numberOfLines={expanded ? undefined : 2}>{notice.body}</Text>
      </View>
      {/* An urgent notice stays until it ends: no close button */}
      {!urgent && (
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.noticeDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('notices.dismissA11y')}
        >
          <XIcon size={16} color={ink} strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  noticeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fdf6e8', borderBottomWidth: 1, borderBottomColor: '#f1dcaf',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  urgentBanner: { backgroundColor: '#fdf2f2', borderBottomColor: '#f3cdd1' },
  urgentTag: {
    alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: '#fff', backgroundColor: '#c42130',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 3, overflow: 'hidden',
  },
  noticeIconWrap: { marginTop: 1 },
  noticeTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  noticeBody: { fontSize: 12.5, lineHeight: 18 },
  noticeDismiss: { padding: 2, marginTop: 1 },
  more: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7,
    backgroundColor: '#fdf6e8', borderBottomWidth: 1, borderBottomColor: '#f1dcaf',
  },
  moreText: { fontSize: 12.5, fontWeight: '700', color: '#8a5300' },
});
