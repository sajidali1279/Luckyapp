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

// Gas-price-update notices (auto-created by updateGasPrices on the backend)
// get their own dedicated home-screen card instead of the generic pinned
// banner — this prefix is how we tell them apart from a normal admin notice.
const GAS_PRICE_TITLE_PREFIX = '⛽ Gas Prices Updated';
function isGasPriceNotice(title: string) {
  return title.startsWith(GAS_PRICE_TITLE_PREFIX);
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
    (n) => (!n.storeId || storeIds.includes(n.storeId)) && !isGasPriceNotice(n.title)
  );

  const { dismissedIds, dismiss } = useDismissedNoticeIds();
  const notice = relevantNotices.find((n) => !dismissedIds.has(n.id)) || null;

  return { notice, dismiss };
}

/** Gas-price-update notices across the given store(s), surfaced separately
 * so the home screen can show them as their own dedicated "acknowledge" card. */
export function useGasPriceNotice(storeIdInput: StoreIdInput) {
  const storeIds = normalizeStoreIds(storeIdInput);
  const { data } = useQuery({
    queryKey: ['active-notices'],
    queryFn: () => noticesApi.getActive(),
    staleTime: 60_000,
  });
  const allNotices: Notice[] = data?.data?.data || [];
  const relevantNotices = allNotices.filter(
    (n) => !!n.storeId && storeIds.includes(n.storeId) && isGasPriceNotice(n.title)
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

/** Dedicated home-screen card for a pending gas/diesel price update — more
 * prominent than the generic pinned notice banner, with an explicit
 * Acknowledge action instead of a small dismiss X. */
export function GasPriceNoticeCard({ notice, onAcknowledge }: { notice: Notice; onAcknowledge: () => void }) {
  return (
    <View style={s.gasCard}>
      <View style={s.gasIconWrap}>
        <Text style={{ fontSize: 20 }}>⛽</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.gasTitle}>Gas Price Change Requested</Text>
        <Text style={s.gasBody}>{notice.body}</Text>
        <TouchableOpacity
          style={s.gasAckBtn}
          onPress={onAcknowledge}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Acknowledge gas price change"
        >
          <Text style={s.gasAckBtnText}>Acknowledge</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  gasCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 12,
  },
  gasIconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  gasTitle: { fontSize: 14, fontWeight: '800', color: '#991b1b', marginBottom: 3 },
  gasBody: { fontSize: 13, color: '#7f1d1d', lineHeight: 18, marginBottom: 10 },
  gasAckBtn: {
    alignSelf: 'flex-start', backgroundColor: '#dc2626',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
  },
  gasAckBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

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
