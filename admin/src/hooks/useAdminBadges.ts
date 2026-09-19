import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import {
  superAdminApi, devAdminApi, supportApi, careersApi, storeRequestApi, productRequestApi, employeeRequestApi,
  disputesApi, chatApi, pointsApi, schedulingApi, promotionsApi, hotFoodApi, orderCategoriesApi, billingApi,
} from '../services/api';

// The admin's "something is waiting for you" counts. The sidebar badges and the dashboard's needs-attention
// list both read this hook. The query keys are the same everywhere, so React Query fetches each count once
// and both places always show the same number.
export function useAdminBadges() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data: notifData } = useQuery({
    queryKey: isDevAdmin ? ['dev-admin-notifications'] : ['super-admin-notifications'],
    queryFn: () => isDevAdmin ? devAdminApi.getNotifications() : superAdminApi.getNotifications(),
    enabled: isSuperAdmin || isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  // Mirrors Notifications.tsx's own isEffectivelyRead(n) = n.isRead || locally dismissed. Without this,
  // marking a notification read on that page never reduced the badge, since it only checked the
  // server-derived `isRead` (computed fresh from live business state, not a per-user flag).
  let dismissedNotificationIds: Set<string> = new Set();
  try { dismissedNotificationIds = new Set(JSON.parse(localStorage.getItem('admin-notif-read-v2') || '[]')); } catch { /* ignore malformed storage */ }
  const unreadCount: number = (notifData?.data?.data ?? []).filter((n: any) => !n.isRead && !dismissedNotificationIds.has(n.id)).length;

  const { data: supportUnreadData } = useQuery({
    queryKey: ['support-unread'],
    queryFn: supportApi.getUnreadCount,
    enabled: isDevAdmin || isSuperAdmin,
    refetchInterval: 30_000,
    retry: false,
  });
  const supportUnread: number = supportUnreadData?.data?.data?.count ?? 0;

  const { data: careersCountData } = useQuery({
    queryKey: ['careers-new-count'],
    queryFn: careersApi.getNewCount,
    enabled: isSuperAdmin || isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const careersNewCount: number = careersCountData?.data?.data?.count ?? 0;

  // "Requests" = store-alert requests + product requests + stock (employee item) requests, the three tabs of the Requests hub.
  const { data: storeRequestsCountData } = useQuery({
    queryKey: ['store-requests-pending-count'],
    queryFn: storeRequestApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  const { data: productRequestsCountData } = useQuery({
    queryKey: ['product-requests-pending-count'],
    queryFn: productRequestApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  // Global cross-store count of pending EmployeeItemRequests (Stock Requests tab). Not the same as the
  // per-list preview inside OrderList.tsx, which is scoped to whichever single order list is open.
  const { data: itemRequestsCountData } = useQuery({
    queryKey: ['employee-requests-pending-count'],
    queryFn: employeeRequestApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  const requestsPendingCount: number =
    (storeRequestsCountData?.data?.data?.count ?? 0) +
    (productRequestsCountData?.data?.data?.count ?? 0) +
    (itemRequestsCountData?.data?.data?.count ?? 0);

  // "Customers" nav: pending missing-points disputes
  const { data: disputesCountData } = useQuery({
    queryKey: ['disputes-pending-count'],
    queryFn: disputesApi.getPendingCount,
    enabled: isSuperAdmin || isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const disputesPendingCount: number = disputesCountData?.data?.data?.count ?? 0;

  // "Chat" nav: unread store-chat messages across accessible stores
  const { data: chatUnreadData } = useQuery({
    queryKey: ['chat-unread-count'],
    queryFn: chatApi.getUnreadCount,
    refetchInterval: 30_000,
    retry: false,
  });
  const chatUnreadCount: number = chatUnreadData?.data?.data?.count ?? 0;

  // "Transactions" nav: transactions with an action waiting (PENDING + FLAGGED)
  const { data: transactionsCountData } = useQuery({
    queryKey: ['transactions-pending-count'],
    queryFn: pointsApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  const transactionsPendingCount: number = transactionsCountData?.data?.data?.count ?? 0;

  // "Scheduling" nav: time-off / fill-in requests awaiting manager approval
  const { data: schedulingCountData } = useQuery({
    queryKey: ['scheduling-pending-count'],
    queryFn: schedulingApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  const schedulingPendingCount: number = schedulingCountData?.data?.data?.count ?? 0;

  // "Promotions" nav: business promo requests awaiting DevAdmin review
  const { data: promotionsCountData } = useQuery({
    queryKey: ['promotions-pending-count'],
    queryFn: promotionsApi.getPendingCount,
    enabled: isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const promotionsPendingCount: number = promotionsCountData?.data?.data?.count ?? 0;

  // "Hot Food" nav: orders awaiting store acceptance, across all stores
  const { data: hotFoodCountData } = useQuery({
    queryKey: ['hot-food-pending-count'],
    queryFn: hotFoodApi.getAdminPendingCount,
    enabled: isDevAdmin || isSuperAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const hotFoodPendingCount: number = hotFoodCountData?.data?.data?.count ?? 0;

  // "Order List" nav: custom categories awaiting DevAdmin review
  const { data: categoriesCountData } = useQuery({
    queryKey: ['order-categories-pending-count'],
    queryFn: orderCategoriesApi.getPendingCount,
    enabled: isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const categoriesPendingCount: number = categoriesCountData?.data?.data?.count ?? 0;

  // "Billing" nav: periods with at least one unpaid record (same data for DevAdmin + SuperAdmin)
  const { data: billingCountData } = useQuery({
    queryKey: ['billing-pending-count'],
    queryFn: billingApi.getPendingCount,
    enabled: isDevAdmin || isSuperAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const billingPendingCount: number = billingCountData?.data?.data?.count ?? 0;

  return {
    unreadCount, supportUnread, careersNewCount, requestsPendingCount, disputesPendingCount, chatUnreadCount,
    transactionsPendingCount, schedulingPendingCount, promotionsPendingCount, hotFoodPendingCount,
    categoriesPendingCount, billingPendingCount,
  };
}
