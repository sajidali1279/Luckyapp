import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { superAdminApi, devAdminApi, adminApi } from '../services/api';

// The admin's "something is waiting for you" counts. The sidebar badges, the command palette's bell and its
// pinned/recent rows, and the dashboard's needs-attention list all read this hook. Everything except the
// notification-list-derived unreadCount comes from one request, GET /admin/badges (shell audit batch S3;
// before this, 13 separate pending/unread-count requests fired on every page load, one per nav badge).
export function useAdminBadges() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isDevOrSuper = isDevAdmin || isSuperAdmin;

  const { data: notifData } = useQuery({
    queryKey: isDevAdmin ? ['dev-admin-notifications'] : ['super-admin-notifications'],
    queryFn: () => isDevAdmin ? devAdminApi.getNotifications() : superAdminApi.getNotifications(),
    enabled: isDevOrSuper,
    refetchInterval: 60_000,
    retry: false,
  });
  // Mirrors Notifications.tsx's own isEffectivelyRead(n) = n.isRead || locally dismissed. Without this,
  // marking a notification read on that page never reduced the badge, since it only checked the
  // server-derived `isRead` (computed fresh from live business state, not a per-user flag).
  let dismissedNotificationIds: Set<string> = new Set();
  try { dismissedNotificationIds = new Set(JSON.parse(localStorage.getItem('admin-notif-read-v2') || '[]')); } catch { /* ignore malformed storage */ }
  const unreadCount: number = (notifData?.data?.data ?? []).filter((n: any) => !n.isRead && !dismissedNotificationIds.has(n.id)).length;

  const { data: badgeData } = useQuery({
    queryKey: ['admin-badge-counts'],
    queryFn: adminApi.getBadgeCounts,
    enabled: isDevOrSuper,
    refetchInterval: 60_000,
    retry: false,
  });
  const b = badgeData?.data?.data ?? {};

  return {
    unreadCount,
    supportUnread: b.supportUnread ?? 0,
    careersNewCount: b.careersNewCount ?? 0,
    requestsPendingCount: b.requestsPendingCount ?? 0,
    disputesPendingCount: b.disputesPendingCount ?? 0,
    chatUnreadCount: b.chatUnreadCount ?? 0,
    transactionsPendingCount: b.transactionsPendingCount ?? 0,
    schedulingPendingCount: b.schedulingPendingCount ?? 0,
    promotionsPendingCount: b.promotionsPendingCount ?? 0,
    hotFoodPendingCount: b.hotFoodPendingCount ?? 0,
    categoriesPendingCount: b.categoriesPendingCount ?? 0,
    billingPendingCount: b.billingPendingCount ?? 0,
  };
}

export type AdminBadges = ReturnType<typeof useAdminBadges>;
export type BadgeKey = keyof AdminBadges;

/** Singular and plural wording for a bell popover or similar summary — written out, not guessed by adding "s" (category/categories). */
export const BADGE_LABELS: Record<BadgeKey, { one: string; many: string }> = {
  transactionsPendingCount: { one: 'transaction needs a decision', many: 'transactions need a decision' },
  disputesPendingCount: { one: 'missing-points report to review', many: 'missing-points reports to review' },
  requestsPendingCount: { one: 'store request waiting', many: 'store requests waiting' },
  chatUnreadCount: { one: 'unread chat message', many: 'unread chat messages' },
  schedulingPendingCount: { one: 'schedule request waiting', many: 'schedule requests waiting' },
  categoriesPendingCount: { one: 'new order category to review', many: 'new order categories to review' },
  careersNewCount: { one: 'new job application', many: 'new job applications' },
  promotionsPendingCount: { one: 'promotion request waiting', many: 'promotion requests waiting' },
  hotFoodPendingCount: { one: 'hot food order waiting', many: 'hot food orders waiting' },
  billingPendingCount: { one: 'unpaid billing period', many: 'unpaid billing periods' },
  unreadCount: { one: 'unread notification', many: 'unread notifications' },
  supportUnread: { one: 'unread support ticket', many: 'unread support tickets' },
};
