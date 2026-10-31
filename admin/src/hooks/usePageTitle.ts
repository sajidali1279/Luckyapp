import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// The browser tab, history and screen readers all read the page title. Before, every page was "Lucky Stop Admin".
const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/analytics': 'Analytics',
  '/inventory-analytics': 'Inventory intelligence',
  '/offers': 'Offers',
  '/banners': 'Banners',
  '/notices': 'Notices',
  '/catalog': 'Rewards catalog',
  '/promotions': 'Promotions',
  '/hot-food': 'Hot food',
  '/missing-persons': 'Missing persons',
  '/engagement': 'Engagement',
  '/chat': 'Chat',
  '/scheduling': 'Scheduling',
  '/staff': 'Staff',
  '/customers': 'Customers',
  '/grant-redeem': 'Grant & Redeem',
  '/store-requests': 'Requests',
  '/order-list': 'Order list',
  '/scanned-products': 'Scanned products',
  '/labels': 'Labels',
  '/pdi-invoices': 'Invoices to PDI',
  '/careers': 'Careers',
  '/transactions': 'Transactions',
  '/daily-reports': 'Daily reports',
  '/daily-tasks': 'Daily tasks',
  '/rates': 'Cashback rates',
  '/settings': 'Settings',
  '/leaderboard': 'Leaderboard',
  '/activity': 'Activity log',
  '/stores': 'Stores',
  '/billing': 'Billing',
  '/my-billing': 'Billing',
  '/notifications': 'Notifications',
  '/support': 'Support',
  '/documents': 'Docs',
  '/profile': 'Profile',
};

export function titleFor(path: string): string {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (TITLES[clean]) return TITLES[clean];
  const parent = Object.keys(TITLES).filter((k) => k !== '/' && clean.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0];
  return parent ? TITLES[parent] : 'Page not found';
}

export function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${titleFor(pathname)} | Lucky Stop Admin`;
  }, [pathname]);
}
