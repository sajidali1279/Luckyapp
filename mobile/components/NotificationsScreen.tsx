import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { notificationsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';

function getNotifRoute(type: string, role?: string): string | null {
  if (role === 'CUSTOMER') {
    if (type === 'OFFER') return '/(customer)/home';
    if (type === 'POINTS') return '/(customer)/history';
    if (type === 'REDEMPTION') return '/(customer)/rewards';
  }
  return null;
}

const TYPE_CONFIG: Record<string, { emoji: string; color: string }> = {
  GAS_PRICE_UPDATE: { emoji: '⛽', color: '#f97316' },
  OFFER:         { emoji: '🎉', color: '#F4A261' },
  POINTS:        { emoji: '💰', color: '#2DC653' },
  REDEMPTION:    { emoji: '🎁', color: '#a78bfa' },
  SCHEDULE:      { emoji: '📅', color: '#60a5fa' },
  SHIFT_REQUEST: { emoji: '🙋', color: '#f472b6' },
  STORE_REQUEST: { emoji: '📋', color: '#fb923c' },
  GENERAL:       { emoji: '🔔', color: COLORS.primary },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['my-notifications'],
    queryFn: () => notificationsApi.getMyNotifications(),
    refetchInterval: 30000,
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markOneRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['my-notifications'] });
    setRefreshing(false);
  }, []);

  const rawNotifications: Notification[] = data?.data?.data?.notifications ?? [];
  const unreadCount: number = data?.data?.data?.unreadCount ?? 0;
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'STORE_MANAGER';
  // For staff: unread gas price alerts always float to the top
  const notifications = isStaff
    ? [...rawNotifications].sort((a, b) => {
        const aPin = a.type === 'GAS_PRICE_UPDATE' && !a.isRead ? -1 : 0;
        const bPin = b.type === 'GAS_PRICE_UPDATE' && !b.isRead ? -1 : 0;
        return aPin - bPin;
      })
    : rawNotifications;

  function renderItem({ item }: { item: Notification }) {
    const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.GENERAL;
    const route = getNotifRoute(item.type, user?.role);
    const isGasAlert = item.type === 'GAS_PRICE_UPDATE' && isStaff && !item.isRead;
    return (
      <TouchableOpacity
        style={[s.card, !item.isRead && s.cardUnread, isGasAlert && s.cardGasAlert]}
        onPress={() => {
          if (!item.isRead) markOneMutation.mutate(item.id);
          if (route) router.push(route as any);
        }}
        activeOpacity={0.75}
      >
        {isGasAlert && <View style={s.gasAlertBar} />}
        <View style={[s.iconWrap, { backgroundColor: cfg.color + '18' }]}>
          <Text style={s.iconEmoji}>{cfg.emoji}</Text>
        </View>
        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <Text style={[s.cardTitle, !item.isRead && s.cardTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            {isGasAlert
              ? <View style={s.actionBadge}><Text style={s.actionBadgeText}>Update pumps</Text></View>
              : !item.isRead && <View style={[s.dot, { backgroundColor: cfg.color }]} />
            }
          </View>
          <Text style={s.cardText} numberOfLines={2}>{item.body}</Text>
          <View style={s.cardBottom}>
            <Text style={s.cardTime}>{timeAgo(item.createdAt)}</Text>
            {route && <Text style={[s.cardAction, { color: cfg.color }]}>View →</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={s.header}>
        <Text style={s.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={s.markAllBtn}
            onPress={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
          >
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>🔔</Text>
          <Text style={s.emptyTitle}>All caught up!</Text>
          <Text style={s.emptySub}>No notifications yet. We'll let you know when something happens.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: {
    backgroundColor: COLORS.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  markAllBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  list: { padding: 16, gap: 0 },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardUnread: {
    shadowOpacity: 0.09,
    elevation: 4,
  },

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconEmoji: { fontSize: 22 },

  cardBody: { flex: 1, gap: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  cardTitleUnread: { color: COLORS.text, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  cardText: { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cardTime: { fontSize: 11, color: COLORS.border, fontWeight: '600' },
  cardAction: { fontSize: 11, fontWeight: '800' },

  cardGasAlert: {
    borderLeftWidth: 3,
    borderLeftColor: '#f97316',
    paddingLeft: 11,
  },
  gasAlertBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#f97316',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  actionBadge: {
    backgroundColor: '#f9731618',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  actionBadgeText: { fontSize: 10, fontWeight: '800', color: '#f97316' },

  separator: { height: 0 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
