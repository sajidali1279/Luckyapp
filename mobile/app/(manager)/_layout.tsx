import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { notificationsApi, employeeRequestApi } from '../../services/api';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';
import {
  HomeIcon, BellIcon, PackageIcon, ClipboardIcon, UserIcon,
} from '../../components/Icons';

export default function ManagerLayout() {
  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  // Badge: pending employee item requests
  const { data: empReqData } = useQuery({
    queryKey: ['employee-requests-pending-count'],
    queryFn: () => employeeRequestApi.getPendingCount(),
    refetchInterval: 60000,
  });
  const empReqPending: number = empReqData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(manager)/home',       icon: (p) => <HomeIcon {...p} strokeWidth={2} />,     label: 'Dashboard' },
    { route: '/(manager)/order-list', icon: (p) => <PackageIcon {...p} strokeWidth={2} />,  label: 'Orders' },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Inventory',
      items: [
        { route: '/(manager)/home',       icon: (p) => <HomeIcon {...p} />,     label: 'Dashboard' },
        { route: '/(manager)/order-list', icon: (p) => <PackageIcon {...p} />,  label: 'Order List' },
        { route: '/(manager)/requests',   icon: (p) => <ClipboardIcon {...p} />, label: 'Item Requests', badge: empReqPending },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(manager)/notifications', icon: (p) => <BellIcon {...p} />, label: 'Alerts', badge: unreadCount },
        { route: '/(manager)/profile',       icon: (p) => <UserIcon {...p} />, label: 'Profile' },
      ],
    },
  ];

  return (
    <DrawerShell bottomItems={bottomItems} groups={groups} headerColor={COLORS.secondary}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="order-list" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </DrawerShell>
  );
}
