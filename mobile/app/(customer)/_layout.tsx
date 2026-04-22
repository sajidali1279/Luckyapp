import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { notificationsApi } from '../../services/api';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';

export default function CustomerLayout() {
  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(customer)/home',    emoji: '🏠', label: 'Home' },
    { route: '/(customer)/rewards', emoji: '⭐', label: 'Rewards' },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/(customer)/home',    emoji: '🏠', label: 'Home' },
        { route: '/(customer)/rewards', emoji: '⭐', label: 'Rewards' },
        { route: '/(customer)/history', emoji: '📋', label: 'History' },
      ],
    },
    {
      title: 'Discover',
      items: [
        { route: '/(customer)/ads',         emoji: '📣', label: 'Ads & Promotions' },
        { route: '/(customer)/leaderboard', emoji: '🏆', label: 'Leaderboard' },
        { route: '/(customer)/careers',     emoji: '💼', label: 'Careers' },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(customer)/notifications', emoji: '🔔', label: 'Notifications', badge: unreadCount },
      ],
    },
  ];

  return (
    <DrawerShell bottomItems={bottomItems} groups={groups} headerColor={COLORS.primary}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="scan-receipt" options={{ href: null }} />
        <Tabs.Screen name="rewards" />
        <Tabs.Screen name="catalog" options={{ href: null }} />
        <Tabs.Screen name="ads" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="careers" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </DrawerShell>
  );
}
