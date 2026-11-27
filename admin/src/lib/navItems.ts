// Every page the Command Palette can jump to, and who may see it. Mirrors AppSidebar.tsx's own groups and role checks — kept as a
// separate, parallel list on purpose (not a shared data source AppSidebar.tsx renders from) so this new feature cannot regress the
// sidebar's own already-tested markup. If a route or its role gate changes in AppSidebar.tsx, change it here too.
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, TrendingUp, Package, Tag, Image, Gift, MessageSquare, Calendar, Users, UserCircle,
  ClipboardList, ShoppingCart, Briefcase, Trophy, Percent, Megaphone, Receipt, Activity, Store, CreditCard,
  Bell, Headphones, FileText, ClipboardCheck, ListChecks, Barcode, Printer, Flame, User, Pin, ScanLine, UserSearch, Sparkles, ReceiptText, Boxes, Clover, SlidersHorizontal,
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
  { to: '/inventory-analytics', label: 'Inventory intelligence', icon: Package, group: 'Overview' },
  { to: '/analytics', label: 'Analytics', icon: TrendingUp, group: 'Overview', roles: ['DEV_ADMIN'] },

  { to: '/cuatro', label: 'Cuatro', icon: Clover, group: 'Mascot', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },

  { to: '/offers', label: 'Offers', icon: Tag, group: 'Customers & rewards', badgeKey: 'offerRequestsPendingCount' },
  { to: '/engagement', label: 'Engagement', icon: Sparkles, group: 'Customers & rewards', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/catalog', label: 'Rewards catalog', icon: Gift, group: 'Customers & rewards' },
  // Banners are not used any more (2026-11-07): off the menu; the page stays at /banners so old ones can still be found
  { to: '/notices', label: 'Notices', icon: Pin, group: 'Customers & rewards' },
  { to: '/promotions', label: 'Promotions', icon: Megaphone, group: 'Customers & rewards', roles: ['DEV_ADMIN'], badgeKey: 'promotionsPendingCount' },
  { to: '/missing-persons', label: 'Missing persons', icon: UserSearch, group: 'Customers & rewards', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'missingRequestsPendingCount' },

  { to: '/hot-food', label: 'Hot food', icon: Flame, group: 'Hot food', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'hotFoodPendingCount' },

  { to: '/items', label: 'Items', icon: Boxes, group: 'Products & stock' },
  { to: '/labels', label: 'Labels', icon: Printer, group: 'Products & stock' },
  { to: '/scanned-products', label: 'Scanned products', icon: Barcode, group: 'Products & stock' },
  { to: '/pdi-invoices', label: 'Invoices to PDI', icon: ReceiptText, group: 'Products & stock' },
  { to: '/order-list', label: 'Order list', icon: ShoppingCart, group: 'Products & stock', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'categoriesPendingCount' },
  { to: '/store-requests', label: 'Requests', icon: ClipboardList, group: 'Products & stock', badgeKey: 'requestsPendingCount' },

  { to: '/chat', label: 'Chat', icon: MessageSquare, group: 'People', badgeKey: 'chatUnreadCount' },
  { to: '/scheduling', label: 'Scheduling', icon: Calendar, group: 'People', badgeKey: 'schedulingPendingCount' },
  { to: '/staff', label: 'Staff', icon: Users, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/customers', label: 'Customers', icon: UserCircle, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'disputesPendingCount' },
  { to: '/grant-redeem', label: 'Grant & Redeem', icon: ScanLine, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/careers', label: 'Careers', icon: Briefcase, group: 'People', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'careersNewCount' },

  { to: '/transactions', label: 'Transactions', icon: Receipt, group: 'Reports', badgeKey: 'transactionsPendingCount' },
  { to: '/daily-reports', label: 'Daily reports', icon: ClipboardCheck, group: 'Reports' },
  { to: '/daily-tasks', label: 'Daily tasks', icon: ListChecks, group: 'Reports' },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, group: 'Reports', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/activity', label: 'Activity log', icon: Activity, group: 'Reports', roles: ['DEV_ADMIN'] },

  { to: '/stores', label: 'Stores', icon: Store, group: 'Setup', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/rates', label: 'Cashback rates', icon: Percent, group: 'Setup', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal, group: 'Setup', roles: ['DEV_ADMIN', 'SUPER_ADMIN'] },
  { to: '/billing', label: 'Billing', icon: CreditCard, group: 'Setup', roles: ['DEV_ADMIN'], badgeKey: 'billingPendingCount' },
  { to: '/my-billing', label: 'Billing', icon: CreditCard, group: 'Setup', roles: ['SUPER_ADMIN'], badgeKey: 'billingPendingCount' },
  { to: '/notifications', label: 'Notifications', icon: Bell, group: 'Setup', roles: ['DEV_ADMIN', 'SUPER_ADMIN'], badgeKey: 'unreadCount' },

  { to: '/support', label: 'Support', icon: Headphones, group: 'Support', badgeKey: 'supportUnread' },
  { to: '/documents', label: 'Docs', icon: FileText, group: 'Docs' },
  { to: '/profile', label: 'Profile', icon: User, group: 'Account' },
];

export function visibleNavItems(role: string | undefined): NavEntry[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role as any));
}
