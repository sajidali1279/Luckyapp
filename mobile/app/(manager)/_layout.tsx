import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { notificationsApi, employeeRequestApi, hotFoodApi } from '../../services/api';
import { useAuthStore, isAdmin } from '../../store/authStore';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';
import {
  HomeIcon, BellIcon, PackageIcon, ClipboardIcon, UserIcon,
  TagIcon, ImageIcon, MessageCircleIcon, CalendarIcon, TrophyIcon, BookOpenIcon,
  FlameIcon, ListIcon,
} from '../../components/Icons';

export default function ManagerLayout() {
  const { user } = useAuthStore();
  const managerStoreId = user?.storeIds?.[0] ?? '';

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

  const { data: hotFoodData } = useQuery({
    queryKey: ['hot-food-pending-count', managerStoreId],
    queryFn: () => hotFoodApi.getPendingCount(managerStoreId),
    enabled: !!managerStoreId,
    refetchInterval: 30000,
  });
  const hotFoodPending: number = hotFoodData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(manager)/home',       icon: (p) => <HomeIcon {...p} strokeWidth={2} />,     label: 'Dashboard' },
    { route: '/(manager)/order-list', icon: (p) => <PackageIcon {...p} strokeWidth={2} />,  label: 'Orders' },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Inventory',
      items: [
        { route: '/(manager)/home',       icon: (p) => <HomeIcon {...p} />,      label: 'Dashboard' },
        { route: '/(manager)/order-list', icon: (p) => <PackageIcon {...p} />,   label: 'Order List' },
        { route: '/(manager)/requests',   icon: (p) => <ClipboardIcon {...p} />, label: 'Item Requests', badge: empReqPending },
      ],
    },
    {
      title: 'Kitchen',
      items: [
        { route: '/(manager)/hot-food', icon: (p) => <FlameIcon {...p} />, label: 'Hot Food Orders', badge: hotFoodPending },
        ...(isAdmin(user?.role) ? [{ route: '/(manager)/hot-food-catalog' as const, icon: (p: any) => <ListIcon {...p} />, label: 'Item Catalog' }] : []),
      ],
    },
    {
      title: 'Promotions',
      items: [
        { route: '/(manager)/offers',  icon: (p) => <TagIcon {...p} />,   label: 'Offers' },
        { route: '/(manager)/banners', icon: (p) => <ImageIcon {...p} />, label: 'Banners' },
      ],
    },
    {
      title: 'Team',
      items: [
        { route: '/(manager)/chat',     icon: (p) => <MessageCircleIcon {...p} />, label: 'Chat' },
        { route: '/(manager)/schedule', icon: (p) => <CalendarIcon {...p} />,      label: 'Schedule' },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(manager)/notifications', icon: (p) => <BellIcon {...p} />,    label: 'Alerts', badge: unreadCount },
        { route: '/(manager)/leaderboard',   icon: (p) => <TrophyIcon {...p} />,  label: 'Staff Rankings' },
        { route: '/(manager)/guide',         icon: (p) => <BookOpenIcon {...p} />, label: 'Help & Guide' },
        { route: '/(manager)/profile',       icon: (p) => <UserIcon {...p} />,    label: 'Profile' },
      ],
    },
  ];

  return (
    <DrawerShell bottomItems={bottomItems} groups={groups} headerColor={COLORS.secondary}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="order-list" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="hot-food" />
        <Tabs.Screen name="hot-food-catalog" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="offers" />
        <Tabs.Screen name="banners" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="guide" />
      </Tabs>
    </DrawerShell>
  );
}
