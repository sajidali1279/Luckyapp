import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { superAdminApi, devAdminApi, supportApi, careersApi } from '../services/api';
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
  Megaphone,
  Receipt,
  Activity,
  Store,
  CreditCard,
  Bell,
  Headphones,
  FileText,
  User,
  LogOut,
  Fuel,
  Flame,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev Admin',
  SUPER_ADMIN: 'Super Admin',
  STORE_MANAGER: 'Store Manager',
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
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <NavLink to={to} end={isEnd}>
          {icon}
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
      {badge != null && badge > 0 && <SidebarMenuBadge>{badge}</SidebarMenuBadge>}
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
    enabled: isDevAdmin,
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

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <Sidebar collapsible="icon" variant="floating">
      {/* Brand header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="Lucky Stop Admin"
              className="cursor-pointer"
              onClick={() => navigate('/')}
            >
              <div>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #1D3557, #2c6fad)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Fuel style={{ width: 16, height: 16, color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Lucky Stop</span>
                  <span style={{ fontSize: 11, color: 'var(--sidebar-foreground)', opacity: 0.45, marginTop: 2 }}>Admin</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Overview */}
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/" icon={<LayoutDashboard />} label="Dashboard" end />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/inventory-analytics" icon={<Package />} label="Inventory Intelligence" />
              )}
              {isDevAdmin && (
                <SidebarNavItem to="/analytics" icon={<TrendingUp />} label="Analytics" />
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
              <SidebarNavItem to="/offers" icon={<Tag />} label="Offers" />
              <SidebarNavItem to="/banners" icon={<Image />} label="Banners" />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/catalog" icon={<Gift />} label="Catalog" />
              )}
              {isDevAdmin && (
                <SidebarNavItem to="/promotions" icon={<Megaphone />} label="Promotions" />
              )}
              <SidebarNavItem to="/hot-food/menu" icon={<Flame />} label="Hot Food Menu" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* People */}
        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/chat" icon={<MessageSquare />} label="Chat" />
              <SidebarNavItem to="/scheduling" icon={<Calendar />} label="Scheduling" />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/staff" icon={<Users />} label="Staff" />
              )}
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/customers" icon={<UserCircle />} label="Customers" />
              )}
              <SidebarNavItem to="/store-requests" icon={<ClipboardList />} label="Requests" />
              <SidebarNavItem to="/order-list" icon={<ShoppingCart />} label="Order List" />
              <SidebarNavItem to="/hot-food/orders" icon={<Flame />} label="Hot Food Orders" />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/careers" icon={<Briefcase />} label="Careers" badge={careersNewCount} />
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
              <SidebarNavItem to="/transactions" icon={<Receipt />} label="Transactions" />
              {(isDevAdmin || isSuperAdmin) && (
                <>
                  <SidebarNavItem to="/rates" icon={<Trophy />} label="Tier Rates" />
                  <SidebarNavItem to="/leaderboard" icon={<Activity />} label="Leaderboard" />
                </>
              )}
              {isDevAdmin && (
                <SidebarNavItem to="/activity" icon={<Activity />} label="Activity Log" />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin (Super Admin + Dev Admin) */}
        {(isDevAdmin || isSuperAdmin) && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarNavItem to="/stores" icon={<Store />} label="Stores" />
                  {isDevAdmin && (
                    <SidebarNavItem to="/billing" icon={<CreditCard />} label="Billing" />
                  )}
                  {isSuperAdmin && (
                    <SidebarNavItem to="/my-billing" icon={<CreditCard />} label="Billing" />
                  )}
                  <SidebarNavItem
                    to="/notifications"
                    icon={<Bell />}
                    label="Notifications"
                    badge={unreadCount}
                  />
                  {isDevAdmin && (
                    <SidebarNavItem to="/support" icon={<Headphones />} label="Support" badge={supportUnread} />
                  )}
                  {isSuperAdmin && (
                    <SidebarNavItem to="/support" icon={<Headphones />} label="Support" />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <SidebarSeparator />

        {/* Docs — all roles */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/documents" icon={<FileText />} label="Docs" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: user + logout */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={user?.name || user?.phone || ''} size="lg">
              <NavLink to="/profile">
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #1D3557, #2c5282)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 12,
                }}>
                  {initials}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name || user?.phone}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>
                    {ROLE_LABELS[user?.role || ''] || user?.role}
                  </span>
                </div>
                <User style={{ marginLeft: 'auto', width: 14, height: 14, opacity: 0.4 }} />
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign out" onClick={handleLogout}>
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
