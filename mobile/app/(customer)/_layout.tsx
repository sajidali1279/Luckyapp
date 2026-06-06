import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { notificationsApi } from '../../services/api';
import DrawerShell, { NavGroup, NavItem } from '../../components/DrawerShell';
import {
  HomeIcon, StarIcon, ClockIcon, MegaphoneIcon, TrophyIcon,
  BriefcaseIcon, ShoppingBagIcon, BellIcon, FlameIcon,
} from '../../components/Icons';

export default function CustomerLayout() {
  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const bottomItems: [NavItem, NavItem] = [
    { route: '/(customer)/home',    icon: (p) => <HomeIcon {...p} strokeWidth={2} />, label: 'Home' },
    { route: '/(customer)/rewards', icon: (p) => <StarIcon {...p} strokeWidth={2} />, label: 'Rewards' },
  ];

  const groups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/(customer)/home',     icon: (p) => <HomeIcon {...p} />,   label: 'Home' },
        { route: '/(customer)/rewards',  icon: (p) => <StarIcon {...p} />,   label: 'Rewards' },
        { route: '/(customer)/history',  icon: (p) => <ClockIcon {...p} />,  label: 'History' },
        { route: '/(customer)/hot-food', icon: (p) => <FlameIcon {...p} />,  label: 'Hot Food' },
      ],
    },
    {
      title: 'Discover',
      items: [
        { route: '/(customer)/ads',             icon: (p) => <MegaphoneIcon {...p} />,  label: 'Ads & Promotions' },
        { route: '/(customer)/leaderboard',     icon: (p) => <TrophyIcon {...p} />,     label: 'Leaderboard' },
        { route: '/(customer)/careers',         icon: (p) => <BriefcaseIcon {...p} />,  label: 'Careers' },
        { route: '/(customer)/request-product', icon: (p) => <ShoppingBagIcon {...p} />, label: 'Request a Product' },
      ],
    },
    {
      title: 'Account',
      items: [
        { route: '/(customer)/notifications', icon: (p) => <BellIcon {...p} />, label: 'Notifications', badge: unreadCount },
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
        <Tabs.Screen name="hot-food" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="careers" />
        <Tabs.Screen name="request-product" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </DrawerShell>
  );
}
