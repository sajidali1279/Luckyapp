import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert,
  StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { notificationsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import FadeSlideIn from './FadeSlideIn';
import {
  BellIcon, GasPumpIcon, TagIcon, DollarSignIcon, GiftIcon,
  CalendarIcon, ClockIcon, ClipboardIcon, PackageIcon, AlertTriangleIcon,
} from './Icons';

// Returns a simple route string for employee/manager notifications only.
function getStaffRoute(type: string, role?: string): string | null {
  if (role === 'EMPLOYEE') {
    if (type === 'SHIFT_REQUEST') return '/(employee)/requests';
    if (type === 'SCHEDULE')      return '/(employee)/schedule';
    if (type === 'GAS_PRICE_UPDATE') return '/(employee)/scan';
    if (type === 'STORE_REQUEST') return '/(employee)/requests';
  }
  if (role === 'STORE_MANAGER') {
    if (type === 'STOCK_REQUEST')     return '/(manager)/requests';
    if (type === 'PRODUCT_REQUEST')   return '/(manager)/requests';
    if (type === 'ALERT')             return '/(manager)/home';
    if (type === 'DISPUTE_SUBMITTED') return '/(manager)/home';
  }
  return null;
}

function customerHasAction(type: string): boolean {
  return ['OFFER', 'GAS_PRICE_UPDATE', 'POINTS', 'REDEMPTION'].includes(type);
}
function employeeHasAction(type: string): boolean {
  return ['HOT_FOOD_ORDER', 'GAS_PRICE_UPDATE', 'SHIFT_REQUEST', 'STORE_REQUEST', 'SCHEDULE'].includes(type);
}
function managerHasAction(type: string): boolean {
  return ['STOCK_REQUEST', 'PRODUCT_REQUEST', 'ALERT', 'DISPUTE_SUBMITTED'].includes(type);
}

const TYPE_CONFIG: Record<string, { color: string }> = {
  GAS_PRICE_UPDATE:  { color: '#f97316' },
  OFFER:             { color: '#F4A261' },
  POINTS:            { color: '#2DC653' },
  REDEMPTION:        { color: '#a78bfa' },
  SCHEDULE:          { color: '#60a5fa' },
  SHIFT_REQUEST:     { color: '#f472b6' },
  STORE_REQUEST:     { color: '#fb923c' },
  STOCK_REQUEST:     { color: '#2563eb' },
  PRODUCT_REQUEST:   { color: '#7c3aed' },
  ALERT:             { color: '#E63946' },
  DISPUTE_SUBMITTED: { color: '#f59e0b' },
  HOT_FOOD_ORDER:    { color: '#ea580c' },
  GENERAL:           { color: COLORS.primary },
};

function NotifIcon({ type, color }: { type: string; color: string }) {
  const p = { size: 22, color, strokeWidth: 1.75 };
  switch (type) {
    case 'GAS_PRICE_UPDATE':  return <GasPumpIcon {...p} />;
    case 'OFFER':             return <TagIcon {...p} />;
    case 'POINTS':            return <DollarSignIcon {...p} />;
    case 'REDEMPTION':        return <GiftIcon {...p} />;
    case 'SCHEDULE':          return <CalendarIcon {...p} />;
    case 'SHIFT_REQUEST':     return <ClockIcon {...p} />;
    case 'STORE_REQUEST':     return <ClipboardIcon {...p} />;
    case 'STOCK_REQUEST':     return <PackageIcon {...p} />;
    case 'PRODUCT_REQUEST':   return <TagIcon {...p} />;
    case 'ALERT':             return <AlertTriangleIcon {...p} />;
    case 'DISPUTE_SUBMITTED': return <ClipboardIcon {...p} />;
    case 'HOT_FOOD_ORDER':    return <ClipboardIcon {...p} />;
    default:                  return <BellIcon {...p} />;
  }
}

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
  expiresAt?: string;
}

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-notifications'],
    queryFn: () => notificationsApi.getMyNotifications(),
    refetchInterval: 30000,
  });

  // Badge behaviour on focus:
  //   Customers + Managers → auto mark-all-read, badge clears immediately.
  //   Employees → don't auto-mark (gas price alerts need the "Update pumps"
  //               indicator to stay until the employee explicitly reads them).
  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['unread-count'] });
    const autoMark = user?.role === 'CUSTOMER' || user?.role === 'STORE_MANAGER';
    if (autoMark) {
      notificationsApi.markAllRead()
        .then(() => {
          qc.invalidateQueries({ queryKey: ['my-notifications'] });
          qc.invalidateQueries({ queryKey: ['unread-count'] });
        })
        .catch(() => {});
    }
  }, [user?.role]));

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => notificationsApi.clearAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  function confirmClearAll() {
    Alert.alert(
      'Clear all notifications?',
      'This permanently removes every notification in your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: () => clearAllMutation.mutate() },
      ],
    );
  }

  const markOneMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markOneRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['my-notifications'] }),
      qc.invalidateQueries({ queryKey: ['unread-count'] }),
    ]);
    setRefreshing(false);
  }, []);

  const rawNotifications: Notification[] = data?.data?.data?.notifications ?? [];
  const unreadCount: number = data?.data?.data?.unreadCount ?? 0;
  // Only employees need gas price alerts pinned (they update the pump display)
  const isEmployee = user?.role === 'EMPLOYEE';
  const headerBg = user?.role === 'CUSTOMER' ? COLORS.primary
    : user?.role === 'STORE_MANAGER' ? COLORS.managerPrimary
    : COLORS.secondary;
  const notifications = isEmployee
    ? [...rawNotifications].sort((a, b) => {
        const aPin = a.type === 'GAS_PRICE_UPDATE' && !a.isRead ? -1 : 0;
        const bPin = b.type === 'GAS_PRICE_UPDATE' && !b.isRead ? -1 : 0;
        return aPin - bPin;
      })
    : rawNotifications;

  function handlePress(item: Notification) {
    if (!item.isRead) markOneMutation.mutate(item.id);

    if (user?.role === 'CUSTOMER') {
      switch (item.type) {
        case 'OFFER': {
          const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
          if (expired) {
            Alert.alert('Offer Ended', `"${item.title}" has expired and is no longer available.`, [{ text: 'Got it' }]);
            return;
          }
          router.push({ pathname: '/(customer)/home', params: { scrollTo: 'offers' } } as any);
          return;
        }
        case 'GAS_PRICE_UPDATE':
          router.push({ pathname: '/(customer)/home', params: { scrollTo: 'gas' } } as any);
          return;
        case 'POINTS':     router.push('/(customer)/history'); return;
        case 'REDEMPTION': router.push('/(customer)/rewards'); return;
        default: return;
      }
    }

    if (user?.role === 'EMPLOYEE') {
      switch (item.type) {
        case 'HOT_FOOD_ORDER':
          router.push({ pathname: '/(employee)/hot-food', params: { tab: 'PENDING' } } as any);
          return;
        case 'GAS_PRICE_UPDATE': router.push('/(employee)/scan');     return;
        case 'SHIFT_REQUEST':
        case 'STORE_REQUEST':    router.push('/(employee)/requests'); return;
        case 'SCHEDULE':         router.push('/(employee)/schedule'); return;
        default: return;
      }
    }

    if (user?.role === 'STORE_MANAGER') {
      switch (item.type) {
        case 'STOCK_REQUEST':
          router.push({ pathname: '/(manager)/requests', params: { tab: 'stock' } } as any);
          return;
        case 'PRODUCT_REQUEST':
          router.push({ pathname: '/(manager)/requests', params: { tab: 'products' } } as any);
          return;
        case 'ALERT':
        case 'DISPUTE_SUBMITTED': router.push('/(manager)/home'); return;
        default: return;
      }
    }
  }

  function renderItem({ item }: { item: Notification }) {
    const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.GENERAL;
    const isGasAlert = item.type === 'GAS_PRICE_UPDATE' && isEmployee && !item.isRead;

    const isExpiredOffer = item.type === 'OFFER' && !!item.expiresAt && new Date(item.expiresAt) < new Date();
    const role = user?.role;
    const hasAction = role === 'CUSTOMER'      ? customerHasAction(item.type)
                    : role === 'EMPLOYEE'      ? employeeHasAction(item.type)
                    : role === 'STORE_MANAGER' ? managerHasAction(item.type)
                    : false;
    const actionLabel = isExpiredOffer ? 'Expired' : hasAction ? 'View →' : null;

    return (
      <TouchableOpacity
        style={[s.card, !item.isRead && s.cardUnread, isGasAlert && s.cardGasAlert, isExpiredOffer && s.cardExpired]}
        onPress={() => handlePress(item)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${!item.isRead ? ', unread' : ''}`}
      >
        <View style={[s.iconWrap, { backgroundColor: cfg.color + (isExpiredOffer ? '0C' : '18') }]}>
          <NotifIcon type={item.type} color={isExpiredOffer ? cfg.color + '70' : cfg.color} />
        </View>
        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <Text style={[s.cardTitle, !item.isRead && s.cardTitleUnread, isExpiredOffer && s.cardTitleExpired]} numberOfLines={1}>
              {item.title}
            </Text>
            {isGasAlert
              ? <View style={s.actionBadge}><Text style={s.actionBadgeText}>Update pumps</Text></View>
              : !item.isRead && !isExpiredOffer && <View style={[s.dot, { backgroundColor: cfg.color }]} />
            }
          </View>
          <Text style={[s.cardText, isExpiredOffer && { opacity: 0.5 }]} numberOfLines={2}>{item.body}</Text>
          <View style={s.cardBottom}>
            <Text style={s.cardTime}>{timeAgo(item.createdAt)}</Text>
            {actionLabel && (
              <Text style={[s.cardAction, { color: isExpiredOffer ? COLORS.border : cfg.color }]}>
                {actionLabel}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={headerBg} />
      <SafeAreaView style={[s.header, { backgroundColor: headerBg }]}>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={s.headerBtn}
              onPress={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.headerBtnText}>Mark read</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={[s.headerBtn, s.headerBtnClear]}
              onPress={confirmClearAll}
              disabled={clearAllMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Clear all notifications"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[s.headerBtnText, s.headerBtnClearText]}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : isError ? (
        <ErrorState message="Failed to load notifications." onRetry={() => refetch()} />
      ) : (
        <FadeSlideIn style={{ flex: 1 }}>
          {notifications.length === 0 ? (
            <EmptyState icon={<BellIcon size={52} color="#C4CAD4" strokeWidth={1.25} />} title="All caught up!" subtitle="No notifications yet. We'll let you know when something happens." />
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
        </FadeSlideIn>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor: COLORS.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  headerBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  headerBtnClear: { backgroundColor: 'rgba(255,255,255,0.08)' },
  headerBtnClearText: { color: 'rgba(255,255,255,0.55)' },

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
    borderWidth: 1.5,
    borderColor: '#f9731640',
    backgroundColor: '#fff7f0',
  },
  cardExpired: {
    opacity: 0.65,
  },
  cardTitleExpired: {
    color: COLORS.textMuted,
    fontWeight: '500',
    textDecorationLine: 'line-through',
  },
  actionBadge: {
    backgroundColor: '#f9731618',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  actionBadgeText: { fontSize: 10, fontWeight: '800', color: '#f97316' },

  separator: { height: 0 },

});
