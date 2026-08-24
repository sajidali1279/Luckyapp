import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants';
import { schedulingApi, notificationsApi, hotFoodApi, chatApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';
import {
  HomeIcon, CameraIcon, CalendarIcon, MessageCircleIcon,
  ClipboardIcon, BellIcon, TrophyIcon, PackageIcon, FlameIcon,
  UserIcon, BookOpenIcon, FileCheckIcon, ListChecksIcon, TagIcon,
} from '../../components/Icons';

export default function EmployeeLayout() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  // Across every store the employee is assigned to, not just their first —
  // otherwise a multi-store employee's badge only ever reflected one store.
  const { data: hotFoodCountData } = useQuery({
    queryKey: ['hot-food-pending-count'],
    queryFn: () => hotFoodApi.getMyStoresPendingCount(),
    refetchInterval: 30_000,
  });
  const hotFoodCount: number = hotFoodCountData?.data?.data?.count ?? 0;

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

  const { data: chatUnreadData } = useQuery({
    queryKey: ['chat-unread-count'],
    queryFn: () => chatApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const chatUnread: number = chatUnreadData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(employee)/home', icon: (p) => <HomeIcon {...p} strokeWidth={2} />,   label: t('nav.home') },
    { route: '/(employee)/scan', icon: (p) => <CameraIcon {...p} strokeWidth={2} />, label: t('nav.scan') },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/(employee)/home', icon: (p) => <HomeIcon {...p} />,   label: t('nav.home') },
        { route: '/(employee)/scan', icon: (p) => <CameraIcon {...p} />, label: t('nav.scanGrant') },
      ],
    },
    {
      title: 'Work',
      items: [
        { route: '/(employee)/schedule',   icon: (p) => <CalendarIcon {...p} />,      label: t('nav.schedule'), badge: vacancyCount },
        { route: '/(employee)/chat',       icon: (p) => <MessageCircleIcon {...p} />, label: t('nav.chat'), badge: chatUnread },
        { route: '/(employee)/requests',   icon: (p) => <ClipboardIcon {...p} />,     label: t('nav.requests') },
        { route: '/(employee)/labels',     icon: (p) => <TagIcon {...p} />,           label: 'Labels' },
        { route: '/(employee)/stock-request', icon: (p) => <PackageIcon {...p} />,       label: t('nav.stockRequest') },
        { route: '/(employee)/hot-food',      icon: (p) => <FlameIcon {...p} />,         label: t('nav.hotFoodOrders'), badge: hotFoodCount },
        { route: '/(employee)/daily-report',  icon: (p) => <FileCheckIcon {...p} />,     label: 'Daily Report' },
        { route: '/(employee)/daily-tasks',   icon: (p) => <ListChecksIcon {...p} />,    label: 'Daily Tasks' },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(employee)/notifications', icon: (p) => <BellIcon {...p} />,      label: t('nav.alerts'), badge: unreadCount },
        { route: '/(employee)/leaderboard',   icon: (p) => <TrophyIcon {...p} />,    label: t('nav.staffRankings') },
        { route: '/(employee)/guide',         icon: (p) => <BookOpenIcon {...p} />,  label: t('nav.guide') },
        { route: '/(employee)/profile',       icon: (p) => <UserIcon {...p} />,      label: t('nav.profile') },
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
        <Tabs.Screen name="labels" />
        <Tabs.Screen name="stock-request" />
        <Tabs.Screen name="hot-food" />
        <Tabs.Screen name="daily-report" />
        <Tabs.Screen name="daily-tasks" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="guide" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </DrawerShell>
  );
}
