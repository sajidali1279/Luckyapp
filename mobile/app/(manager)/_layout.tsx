import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants';
import { notificationsApi, employeeRequestApi, productRequestApi, storeRequestApi, chatApi, supportApi, schedulingApi, disputeApi } from '../../services/api';
import { useAuthStore, isStoreManagerOrAbove } from '../../store/authStore';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';
import {
  HomeIcon, BellIcon, PackageIcon, ClipboardIcon, UserIcon,
  TagIcon, ImageIcon, MessageCircleIcon, ListIcon, TrophyIcon, BookOpenIcon,
  HeadphonesIcon, CalendarIcon, AlertTriangleIcon, PrinterIcon,
} from '../../components/Icons';

export default function ManagerLayout() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const { data: empReqData } = useQuery({
    queryKey: ['employee-requests-pending-count'],
    queryFn: () => employeeRequestApi.getPendingCount(),
    refetchInterval: 60000,
  });
  const empReqPending: number = empReqData?.data?.data?.count ?? 0;

  const { data: productReqData } = useQuery({
    queryKey: ['product-requests-pending-count'],
    queryFn: () => productRequestApi.getPendingCount(),
    refetchInterval: 60000,
  });
  const productReqPending: number = productReqData?.data?.data?.count ?? 0;

  const { data: storeReqData } = useQuery({
    queryKey: ['store-requests-pending-count'],
    queryFn: () => storeRequestApi.getPendingCount(),
    refetchInterval: 60000,
  });
  const storeReqPending: number = storeReqData?.data?.data?.count ?? 0;

  const { data: chatUnreadData } = useQuery({
    queryKey: ['chat-unread-count'],
    queryFn: () => chatApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const chatUnread: number = chatUnreadData?.data?.data?.count ?? 0;

  const { data: scheduleReqData } = useQuery({
    queryKey: ['scheduling-pending-count'],
    queryFn: () => schedulingApi.getPendingCount(),
    refetchInterval: 60000,
  });
  const scheduleReqPending: number = scheduleReqData?.data?.data?.count ?? 0;

  const { data: supportUnreadData } = useQuery({
    queryKey: ['support-unread'],
    queryFn: () => supportApi.getUnreadCount(),
    enabled: isStoreManagerOrAbove(user?.role),
    refetchInterval: 30000,
  });
  const supportUnread: number = supportUnreadData?.data?.data?.count ?? 0;

  const { data: disputesCountData } = useQuery({
    queryKey: ['disputes-pending-count', storeId],
    queryFn: () => disputeApi.getPendingCount(storeId!),
    enabled: !!storeId,
    refetchInterval: 60000,
  });
  const disputesPending: number = disputesCountData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(manager)/home',       icon: (p) => <HomeIcon {...p} strokeWidth={2} />,    label: t('nav.dashboard') },
    { route: '/(manager)/order-list', icon: (p) => <PackageIcon {...p} strokeWidth={2} />, label: t('nav.orderList') },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Inventory',
      items: [
        { route: '/(manager)/home',       icon: (p) => <HomeIcon {...p} />,      label: t('nav.dashboard') },
        { route: '/(manager)/order-list', icon: (p) => <PackageIcon {...p} />,   label: t('nav.orderList') },
        { route: '/(manager)/catalog',    icon: (p) => <ListIcon {...p} />,      label: 'Store Catalog' },
        { route: '/(manager)/labels',     icon: (p) => <PrinterIcon {...p} />,   label: 'Labels' },
        { route: '/(manager)/requests',   icon: (p) => <ClipboardIcon {...p} />, label: t('nav.itemRequests'), badge: empReqPending + productReqPending + storeReqPending },
        { route: '/(manager)/disputes',   icon: (p) => <AlertTriangleIcon {...p} />, label: t('nav.disputes'), badge: disputesPending },
      ],
    },
    {
      title: 'Promotions',
      items: [
        { route: '/(manager)/offers',  icon: (p) => <TagIcon {...p} />,   label: t('nav.offers') },
        { route: '/(manager)/banners', icon: (p) => <ImageIcon {...p} />, label: t('nav.banners') },
      ],
    },
    {
      title: 'Team',
      items: [
        { route: '/(manager)/schedule', icon: (p) => <CalendarIcon {...p} />,      label: t('nav.teamSchedule'), badge: scheduleReqPending },
        { route: '/(manager)/chat',     icon: (p) => <MessageCircleIcon {...p} />, label: t('nav.teamChat'), badge: chatUnread },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(manager)/notifications', icon: (p) => <BellIcon {...p} />,        label: t('nav.alerts'), badge: unreadCount },
        { route: '/(manager)/leaderboard',   icon: (p) => <TrophyIcon {...p} />,     label: t('nav.staffRankings') },
        ...(isStoreManagerOrAbove(user?.role) ? [{ route: '/(manager)/support', icon: (p: any) => <HeadphonesIcon {...p} />, label: t('nav.support'), badge: supportUnread } as NavItem] : []),
        { route: '/(manager)/guide',         icon: (p) => <BookOpenIcon {...p} />,   label: t('nav.guide') },
        { route: '/(manager)/profile',       icon: (p) => <UserIcon {...p} />,       label: t('nav.profile') },
      ],
    },
  ];

  return (
    <DrawerShell bottomItems={bottomItems} groups={groups} headerColor={COLORS.managerPrimary}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="order-list" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="disputes" />
        <Tabs.Screen name="support" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="offers" />
        <Tabs.Screen name="banners" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="catalog" />
        <Tabs.Screen name="labels" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="guide" />
      </Tabs>
    </DrawerShell>
  );
}
