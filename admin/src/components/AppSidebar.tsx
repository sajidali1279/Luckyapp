import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { superAdminApi, devAdminApi, supportApi, careersApi, storeRequestApi, productRequestApi, employeeRequestApi, disputesApi, chatApi } from '../services/api';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Tag,
  Image,
  Gift,
  MessageSquare,
  Calendar,
  Users,
  UserCircle,
  ClipboardList,
  ShoppingCart,
  Briefcase,
  Trophy,
  Percent,
  Megaphone,
  Receipt,
  Activity,
  Store,
  CreditCard,
  Bell,
  Headphones,
  FileText,
  ClipboardCheck,
  ListChecks,
  LogOut,
  Fuel,
  Flame,
  ChevronRight,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev Admin',
  SUPER_ADMIN: 'Super Admin',
  STORE_MANAGER: 'Store Manager',
};

const ROLE_COLOR: Record<string, string> = {
  DEV_ADMIN: 'oklch(0.55 0.18 285)',
  SUPER_ADMIN: 'oklch(0.50 0.22 27)',
  STORE_MANAGER: 'oklch(0.58 0.14 145)',
};

type NavItem = {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  end?: boolean;
};

function SidebarNavItem({ to, icon, label, badge, end: isEnd }: NavItem) {
  const location = useLocation();
  const isActive = isEnd
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
        style={isActive ? {
          backgroundColor: 'oklch(0.50 0.22 27)',
          color: 'oklch(0.97 0.005 27)',
          fontWeight: 600,
        } : undefined}
      >
        <NavLink to={to} end={isEnd}>
          {icon}
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
      {badge != null && badge > 0 && (
        <SidebarMenuBadge
          style={{
            backgroundColor: isActive ? 'oklch(0.97 0.005 27 / 0.22)' : 'oklch(0.50 0.22 27)',
            color: 'oklch(0.97 0.005 27)',
            fontWeight: 700,
            fontSize: 10,
            minWidth: 18,
            height: 18,
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
          }}
        >
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const initials = (user?.name || user?.phone || '?').slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[user?.role || ''] || user?.role || '';
  const avatarColor = ROLE_COLOR[user?.role || ''] || 'oklch(0.50 0.22 27)';

  const { data: notifData } = useQuery({
    queryKey: isDevAdmin ? ['dev-admin-notifications'] : ['super-admin-notifications'],
    queryFn: () => isDevAdmin ? devAdminApi.getNotifications() : superAdminApi.getNotifications(),
    enabled: isSuperAdmin || isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const unreadCount: number = (notifData?.data?.data ?? []).filter((n: any) => !n.isRead).length;

  const { data: supportUnreadData } = useQuery({
    queryKey: ['support-unread'],
    queryFn: supportApi.getUnreadCount,
    enabled: isDevAdmin || isSuperAdmin,
    refetchInterval: 30_000,
    retry: false,
  });
  const supportUnread: number = supportUnreadData?.data?.data?.count ?? 0;

  const { data: careersCountData } = useQuery({
    queryKey: ['careers-new-count'],
    queryFn: careersApi.getNewCount,
    enabled: isSuperAdmin || isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const careersNewCount: number = careersCountData?.data?.data?.count ?? 0;

  // "Requests" nav = store-alert requests + product requests (both tabs of the Requests page)
  const { data: storeRequestsCountData } = useQuery({
    queryKey: ['store-requests-pending-count'],
    queryFn: storeRequestApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  const { data: productRequestsCountData } = useQuery({
    queryKey: ['product-requests-pending-count'],
    queryFn: productRequestApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  const requestsPendingCount: number =
    (storeRequestsCountData?.data?.data?.count ?? 0) + (productRequestsCountData?.data?.data?.count ?? 0);

  // "Order List" nav — employee item requests awaiting review
  const { data: itemRequestsCountData } = useQuery({
    queryKey: ['employee-requests-pending-count'],
    queryFn: employeeRequestApi.getPendingCount,
    refetchInterval: 60_000,
    retry: false,
  });
  const itemRequestsPendingCount: number = itemRequestsCountData?.data?.data?.count ?? 0;

  // "Customers" nav — pending missing-points disputes
  const { data: disputesCountData } = useQuery({
    queryKey: ['disputes-pending-count'],
    queryFn: disputesApi.getPendingCount,
    enabled: isSuperAdmin || isDevAdmin,
    refetchInterval: 60_000,
    retry: false,
  });
  const disputesPendingCount: number = disputesCountData?.data?.data?.count ?? 0;

  // "Chat" nav — unread store-chat messages across accessible stores
  const { data: chatUnreadData } = useQuery({
    queryKey: ['chat-unread-count'],
    queryFn: chatApi.getUnreadCount,
    refetchInterval: 30_000,
    retry: false,
  });
  const chatUnreadCount: number = chatUnreadData?.data?.data?.count ?? 0;

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <Sidebar collapsible="icon" variant="floating">
      {/* Brand */}
      <SidebarHeader style={{ padding: '14px 12px 10px' }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="Lucky Stop Admin"
              style={{ padding: '6px 8px', borderRadius: 10, cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              <div>
                {/* Logo mark */}
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  flexShrink: 0,
                  background: 'oklch(0.50 0.22 27)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px oklch(0.50 0.22 27 / 0.45)',
                }}>
                  <Fuel style={{ width: 17, height: 17, color: 'oklch(0.97 0.005 27)' }} />
                </div>

                {/* Brand name */}
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
                  <span style={{
                    fontWeight: 800,
                    fontSize: 13.5,
                    letterSpacing: '0.02em',
                    color: 'oklch(0.92 0.012 245)',
                  }}>
                    Lucky Stop
                  </span>
                  <span style={{
                    fontSize: 10.5,
                    color: 'oklch(0.48 0.022 245)',
                    marginTop: 2,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                  }}>
                    Admin Console
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent style={{
        padding: '2px 0',
        scrollbarWidth: 'thin',
        scrollbarColor: 'oklch(0.28 0.045 245) transparent',
      }}>
        {/* Overview */}
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/" icon={<LayoutDashboard size={16} />} label="Dashboard" end />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/inventory-analytics" icon={<Package size={16} />} label="Inventory Intelligence" />
              )}
              {isDevAdmin && (
                <SidebarNavItem to="/analytics" icon={<TrendingUp size={16} />} label="Analytics" />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Content */}
        <SidebarGroup>
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/offers" icon={<Tag size={16} />} label="Offers" />
              <SidebarNavItem to="/banners" icon={<Image size={16} />} label="Banners" />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/catalog" icon={<Gift size={16} />} label="Catalog" />
              )}
              {isDevAdmin && (
                <SidebarNavItem to="/promotions" icon={<Megaphone size={16} />} label="Promotions" />
              )}
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/hot-food" icon={<Flame size={16} />} label="Hot Food" />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* People */}
        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/chat" icon={<MessageSquare size={16} />} label="Chat" badge={chatUnreadCount} />
              <SidebarNavItem to="/scheduling" icon={<Calendar size={16} />} label="Scheduling" />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/staff" icon={<Users size={16} />} label="Staff" />
              )}
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/customers" icon={<UserCircle size={16} />} label="Customers" badge={disputesPendingCount} />
              )}
              <SidebarNavItem to="/store-requests" icon={<ClipboardList size={16} />} label="Requests" badge={requestsPendingCount} />
              <SidebarNavItem to="/order-list" icon={<ShoppingCart size={16} />} label="Order List" badge={itemRequestsPendingCount} />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/careers" icon={<Briefcase size={16} />} label="Careers" badge={careersNewCount} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Reports */}
        <SidebarGroup>
          <SidebarGroupLabel>Reports</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/transactions" icon={<Receipt size={16} />} label="Transactions" />
              {!isStoreManager && (
                <SidebarNavItem to="/daily-reports" icon={<ClipboardCheck size={16} />} label="Daily Reports" />
              )}
              {!isStoreManager && (
                <SidebarNavItem to="/daily-tasks" icon={<ListChecks size={16} />} label="Daily Tasks" />
              )}
              {(isDevAdmin || isSuperAdmin) && (
                <>
                  <SidebarNavItem to="/rates" icon={<Percent size={16} />} label="Tier Rates" />
                  <SidebarNavItem to="/leaderboard" icon={<Trophy size={16} />} label="Leaderboard" />
                </>
              )}
              {isDevAdmin && (
                <SidebarNavItem to="/activity" icon={<Activity size={16} />} label="Activity Log" />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin */}
        {(isDevAdmin || isSuperAdmin) && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarNavItem to="/stores" icon={<Store size={16} />} label="Stores" />
                  {isDevAdmin && (
                    <SidebarNavItem to="/billing" icon={<CreditCard size={16} />} label="Billing" />
                  )}
                  {isSuperAdmin && (
                    <SidebarNavItem to="/my-billing" icon={<CreditCard size={16} />} label="Billing" />
                  )}
                  <SidebarNavItem
                    to="/notifications"
                    icon={<Bell size={16} />}
                    label="Notifications"
                    badge={unreadCount}
                  />
                  {(isDevAdmin || isSuperAdmin) && (
                    <SidebarNavItem to="/support" icon={<Headphones size={16} />} label="Support" badge={supportUnread} />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <SidebarSeparator />

        {/* Docs */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/documents" icon={<FileText size={16} />} label="Docs" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: user identity + sign out */}
      <SidebarFooter style={{ padding: '8px 10px 10px' }}>
        {/* Divider */}
        <div style={{
          height: 1,
          background: 'oklch(0.24 0.042 245 / 0.65)',
          marginBottom: 8,
        }} />

        {/* Profile link */}
        <NavLink
          to="/profile"
          style={{ textDecoration: 'none', display: 'block' }}
        >
          {({ isActive }) => (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 8px',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'background 150ms ease',
              background: isActive ? 'oklch(0.50 0.22 27)' : 'transparent',
            }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'oklch(0.21 0.048 245)';
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: isActive ? 'oklch(0.97 0.005 27 / 0.25)' : avatarColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'oklch(0.97 0.005 27)',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.02em',
                flexShrink: 0,
              }}>
                {initials}
              </div>

              {/* Name + role */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isActive ? 'oklch(0.97 0.005 27)' : 'oklch(0.87 0.015 245)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user?.name || user?.phone}
                </div>
                <div style={{
                  fontSize: 10.5,
                  color: isActive ? 'oklch(0.97 0.005 27 / 0.7)' : 'oklch(0.48 0.022 245)',
                  marginTop: 1,
                }}>
                  {roleLabel}
                </div>
              </div>

              <ChevronRight size={12} style={{
                color: isActive ? 'oklch(0.97 0.005 27 / 0.6)' : 'oklch(0.40 0.022 245)',
                flexShrink: 0,
              }} />
            </div>
          )}
        </NavLink>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            marginTop: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'oklch(0.42 0.022 245)',
            fontSize: 12.5,
            fontWeight: 500,
            transition: 'color 150ms ease, background 150ms ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.50 0.22 27 / 0.12)';
            (e.currentTarget as HTMLButtonElement).style.color = 'oklch(0.65 0.22 27)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'oklch(0.42 0.022 245)';
          }}
        >
          <LogOut size={13} />
          <span>Sign out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
