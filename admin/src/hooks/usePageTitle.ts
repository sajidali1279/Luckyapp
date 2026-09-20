import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// The browser tab, history and screen readers all read the page title. Before, every page was "Lucky Stop Admin".
const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/analytics': 'Analytics',
  '/inventory-analytics': 'Inventory Intelligence',
  '/offers': 'Offers',
  '/banners': 'Banners',
  '/notices': 'Notices',
  '/catalog': 'Catalog',
  '/promotions': 'Promotions',
  '/hot-food': 'Hot Food',
  '/chat': 'Chat',
  '/scheduling': 'Scheduling',
  '/staff': 'Staff',
  '/customers': 'Customers',
  '/store-requests': 'Requests',
  '/order-list': 'Order List',
  '/scanned-products': 'Scanned Products',
  '/labels': 'Labels',
  '/careers': 'Careers',
  '/transactions': 'Transactions',
  '/daily-reports': 'Daily Reports',
  '/daily-tasks': 'Daily Tasks',
  '/rates': 'Tier Rates',
  '/leaderboard': 'Leaderboard',
  '/activity': 'Activity Log',
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
