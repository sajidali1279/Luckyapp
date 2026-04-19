import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { schedulingApi, notificationsApi } from '../../services/api';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';

export default function EmployeeLayout() {
  const { data: vacData } = useQuery({
    queryKey: ['schedule-vacancies'],
    queryFn: () => schedulingApi.getVacancies(),
    refetchInterval: 120000,
  });
  const vacancyCount: number = vacData?.data?.data?.totalVacancies || 0;

  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(employee)/home', emoji: '🏠', label: 'Home' },
    { route: '/(employee)/scan', emoji: '📷', label: 'Scan' },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/(employee)/home', emoji: '🏠', label: 'Home' },
        { route: '/(employee)/scan', emoji: '📷', label: 'Scan & Grant' },
      ],
    },
    {
      title: 'Work',
      items: [
        { route: '/(employee)/schedule',  emoji: '📅', label: 'My Schedule', badge: vacancyCount },
        { route: '/(employee)/chat',      emoji: '💬', label: 'Store Chat' },
        { route: '/(employee)/requests',  emoji: '📋', label: 'Requests' },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(employee)/notifications', emoji: '🔔', label: 'Alerts', badge: unreadCount },
        { route: '/(employee)/leaderboard',   emoji: '⭐', label: 'Staff Rankings' },
      ],
    },
  ];

  return (
    <DrawerShell bottomItems={bottomItems} groups={groups} headerColor={COLORS.secondary}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="scan" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </DrawerShell>
  );
}
