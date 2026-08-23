import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { noticesApi } from '../services/api';
import { XIcon } from './Icons';

const DISMISSED_NOTICES_KEY = 'dismissed-admin-notices';

export interface Notice {
  id: string;
  title: string;
  body: string;
  storeId: string | null;
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
type StoreIdInput = string | (string | null | undefined)[] | null | undefined;
function normalizeStoreIds(input: StoreIdInput): string[] {
  if (!input) return [];
  return (Array.isArray(input) ? input : [input]).filter((id): id is string => !!id);
}

export function usePinnedNotice(storeIdInput: StoreIdInput) {
  const storeIds = normalizeStoreIds(storeIdInput);
  const { data } = useQuery({
    queryKey: ['active-notices'],
    queryFn: () => noticesApi.getActive(),
    staleTime: 60_000,
  });
  const allNotices: Notice[] = data?.data?.data || [];
  const relevantNotices = allNotices.filter(
    (n) => !n.storeId || storeIds.includes(n.storeId)
  );

  const { dismissedIds, dismiss } = useDismissedNoticeIds();
  const notice = relevantNotices.find((n) => !dismissedIds.has(n.id)) || null;

  return { notice, dismiss };
}

export default function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={s.noticeBanner}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Important notice: ${notice.title}. ${notice.body}`}
    >
      <View style={s.noticeIconWrap}>
        <Text style={{ fontSize: 16 }}>📌</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.noticeTitle}>{notice.title}</Text>
        <Text style={s.noticeBody} numberOfLines={expanded ? undefined : 2}>{notice.body}</Text>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={s.noticeDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notice"
      >
        <XIcon size={16} color="#92400e" strokeWidth={2.5} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  noticeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fffbeb', borderBottomWidth: 1, borderBottomColor: '#fde68a',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  noticeIconWrap: { marginTop: 1 },
  noticeTitle: { fontSize: 13, fontWeight: '800', color: '#92400e', marginBottom: 2 },
  noticeBody: { fontSize: 12.5, color: '#78350f', lineHeight: 18 },
  noticeDismiss: { padding: 2, marginTop: 1 },
});
