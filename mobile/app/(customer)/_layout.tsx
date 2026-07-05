import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants';
import { notificationsApi } from '../../services/api';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';
import {
  HomeIcon, StarIcon, ClockIcon, MegaphoneIcon, TrophyIcon,
  BriefcaseIcon, ShoppingBagIcon, BellIcon, FlameIcon,
  UserIcon, BookOpenIcon, ClipboardIcon,
} from '../../components/Icons';

export default function CustomerLayout() {
  const { t } = useTranslation();
  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(customer)/home',    icon: (p) => <HomeIcon {...p} strokeWidth={2} />, label: t('nav.home') },
    { route: '/(customer)/rewards', icon: (p) => <StarIcon {...p} strokeWidth={2} />, label: t('nav.rewards') },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/(customer)/home',     icon: (p) => <HomeIcon {...p} />,    label: t('nav.home') },
        { route: '/(customer)/rewards',  icon: (p) => <StarIcon {...p} />,    label: t('nav.rewards') },
        { route: '/(customer)/history',  icon: (p) => <ClockIcon {...p} />,   label: t('nav.history') },
        { route: '/(customer)/hot-food', icon: (p) => <FlameIcon {...p} />,   label: t('nav.hotFood') },
      ],
    },
    {
      title: 'Discover',
      items: [
        { route: '/(customer)/ads',             icon: (p) => <MegaphoneIcon {...p} />,   label: t('nav.adsPromos') },
        { route: '/(customer)/leaderboard',     icon: (p) => <TrophyIcon {...p} />,      label: t('nav.leaderboard') },
        { route: '/(customer)/careers',         icon: (p) => <BriefcaseIcon {...p} />,   label: t('nav.careers') },
        { route: '/(customer)/request-product', icon: (p) => <ShoppingBagIcon {...p} />, label: t('nav.requestProduct') },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(customer)/notifications', icon: (p) => <BellIcon {...p} />,      label: t('nav.alerts'), badge: unreadCount },
        { route: '/(customer)/my-disputes',   icon: (p) => <ClipboardIcon {...p} />, label: t('nav.myDisputes') },
        { route: '/(customer)/guide',         icon: (p) => <BookOpenIcon {...p} />,  label: t('nav.guide') },
        { route: '/(customer)/profile',       icon: (p) => <UserIcon {...p} />,      label: t('nav.profile') },
      ],
    },
  ];

  return (
    <DrawerShell bottomItems={bottomItems} groups={groups} headerColor={COLORS.primary}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="rewards" />
        <Tabs.Screen name="ads" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="hot-food" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="careers" />
        <Tabs.Screen name="request-product" />
        <Tabs.Screen name="my-disputes" />
        <Tabs.Screen name="guide" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </DrawerShell>
  );
}
