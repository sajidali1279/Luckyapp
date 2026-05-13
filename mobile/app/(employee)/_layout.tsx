import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { schedulingApi, notificationsApi } from '../../services/api';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';
import {
  HomeIcon, CameraIcon, CalendarIcon, MessageCircleIcon,
  ClipboardIcon, BellIcon, TrophyIcon,
} from '../../components/Icons';

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
    { route: '/(employee)/home', icon: (p) => <HomeIcon {...p} strokeWidth={2} />,   label: 'Home' },
    { route: '/(employee)/scan', icon: (p) => <CameraIcon {...p} strokeWidth={2} />, label: 'Scan' },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/(employee)/home', icon: (p) => <HomeIcon {...p} />,   label: 'Home' },
        { route: '/(employee)/scan', icon: (p) => <CameraIcon {...p} />, label: 'Scan & Grant' },
      ],
    },
    {
      title: 'Work',
      items: [
        { route: '/(employee)/schedule',  icon: (p) => <CalendarIcon {...p} />,      label: 'My Schedule', badge: vacancyCount },
        { route: '/(employee)/chat',      icon: (p) => <MessageCircleIcon {...p} />, label: 'Store Chat' },
        { route: '/(employee)/requests',  icon: (p) => <ClipboardIcon {...p} />,     label: 'Requests' },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(employee)/notifications', icon: (p) => <BellIcon {...p} />,   label: 'Alerts', badge: unreadCount },
        { route: '/(employee)/leaderboard',   icon: (p) => <TrophyIcon {...p} />, label: 'Staff Rankings' },
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
