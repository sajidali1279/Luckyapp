// Every page the Command Palette can jump to, and who may see it. Mirrors AppSidebar.tsx's own groups and role checks — kept as a
// separate, parallel list on purpose (not a shared data source AppSidebar.tsx renders from) so this new feature cannot regress the
// sidebar's own already-tested markup. If a route or its role gate changes in AppSidebar.tsx, change it here too.
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, TrendingUp, Package, Tag, Image, Gift, MessageSquare, Calendar, Users, UserCircle,
  ClipboardList, ShoppingCart, Briefcase, Trophy, Percent, Megaphone, Receipt, Activity, Store, CreditCard,
  Bell, Headphones, FileText, ClipboardCheck, ListChecks, Barcode, Printer, Flame, User, Pin,
} from 'lucide-react';
import type { BadgeKey } from '../hooks/useAdminBadges';

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  group: string;
  /** undefined = every signed-in admin role; otherwise only these roles see it. */
  roles?: ('DEV_ADMIN' | 'SUPER_ADMIN' | 'STORE_MANAGER')[];
  /** Which useAdminBadges() field to show a live count from, if any. */
  badgeKey?: BadgeKey;
}

export const NAV_ITEMS: NavEntry[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { to: '/inventory-analytics', label: 'Inventory Intelligence', icon: Package, group: 'Overview' },
  { to: '/analytics', label: 'Analytics', icon: TrendingUp, group: 'Overview', roles: ['DEV_ADMIN'] },

  { to: '/offers', label: 'Offers', icon: Tag, group: 'Content' },
  { to: '/banners', label: 'Banners', icon: Image, group: 'Content' },
  { to: '/notices', label: 'Notices', icon: Pin, group: 'Content' },
  { to: '/catalog', label: 'Catalog', icon: Gift, group: 'Content' },
  { to: '/promotions', label: 'Promotions', icon: Megaphone, group: 'Content', roles: ['DEV_ADMIN'], badgeKey: 'promotionsPendingCount' },
  { to: '/hot-food', label: 'Hot Food', icon: Flame, group: 'Content', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'hotFoodPendingCount' },

  { to: '/chat', label: 'Chat', icon: MessageSquare, group: 'People', badgeKey: 'chatUnreadCount' },
  { to: '/scheduling', label: 'Scheduling', icon: Calendar, group: 'People', badgeKey: 'schedulingPendingCount' },
  { to: '/staff', label: 'Staff', icon: Users, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/customers', label: 'Customers', icon: UserCircle, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'disputesPendingCount' },
  { to: '/store-requests', label: 'Requests', icon: ClipboardList, group: 'People', badgeKey: 'requestsPendingCount' },
  { to: '/order-list', label: 'Order List', icon: ShoppingCart, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'categoriesPendingCount' },
  { to: '/scanned-products', label: 'Scanned Products', icon: Barcode, group: 'People' },
  { to: '/labels', label: 'Labels', icon: Printer, group: 'People' },
  { to: '/careers', label: 'Careers', icon: Briefcase, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'careersNewCount' },

  { to: '/transactions', label: 'Transactions', icon: Receipt, group: 'Reports', badgeKey: 'transactionsPendingCount' },
  { to: '/daily-reports', label: 'Daily Reports', icon: ClipboardCheck, group: 'Reports' },
  { to: '/daily-tasks', label: 'Daily Tasks', icon: ListChecks, group: 'Reports' },
  { to: '/rates', label: 'Cashback Rates', icon: Percent, group: 'Reports', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, group: 'Reports', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/activity', label: 'Activity Log', icon: Activity, group: 'Reports', roles: ['DEV_ADMIN'] },

  { to: '/stores', label: 'Stores', icon: Store, group: 'Admin', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/billing', label: 'Billing', icon: CreditCard, group: 'Admin', roles: ['DEV_ADMIN'], badgeKey: 'billingPendingCount' },
  { to: '/my-billing', label: 'Billing', icon: CreditCard, group: 'Admin', roles: ['SUPER_ADMIN'], badgeKey: 'billingPendingCount' },
  { to: '/notifications', label: 'Notifications', icon: Bell, group: 'Admin', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'unreadCount' },

  { to: '/support', label: 'Support', icon: Headphones, group: 'Support', badgeKey: 'supportUnread' },
  { to: '/documents', label: 'Docs', icon: FileText, group: 'Docs' },
  { to: '/profile', label: 'Profile', icon: User, group: 'Account' },
];

export function visibleNavItems(role: string | undefined): NavEntry[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role as any));
}
