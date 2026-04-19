import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { schedulingApi, notificationsApi } from '../../services/api';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';

export default function ManagerLayout() {
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
    { route: '/(manager)/home',     emoji: '🏠', label: 'Home' },
    { route: '/(manager)/schedule', emoji: '📅', label: 'Schedule' },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/(manager)/home',     emoji: '🏠', label: 'Home' },
        { route: '/(manager)/schedule', emoji: '📅', label: 'Schedule', badge: vacancyCount },
      ],
    },
    {
      title: 'Content',
      items: [
        { route: '/(manager)/offers',  emoji: '📢', label: 'Offers' },
        { route: '/(manager)/banners', emoji: '🖼️', label: 'Banners' },
        { route: '/(manager)/chat',    emoji: '💬', label: 'Store Chat' },
      ],
    },
    {
      title: 'Team',
      items: [
        { route: '/(manager)/requests', emoji: '📋', label: 'Requests' },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(manager)/notifications', emoji: '🔔', label: 'Alerts', badge: unreadCount },
      ],
    },
  ];

  return (
    <DrawerShell bottomItems={bottomItems} groups={groups} headerColor={COLORS.secondary}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="offers" />
        <Tabs.Screen name="banners" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </DrawerShell>
  );
}
