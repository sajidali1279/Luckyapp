import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useAdminBadges } from '../hooks/useAdminBadges';
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
  Pin,
  ChevronRight,
  Barcode,
  Printer,
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

// Visually hidden, still read aloud by screen readers
const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
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
  const toPath = to.split('?')[0];
  const isActive = isEnd
    ? location.pathname === toPath
    : location.pathname === toPath || location.pathname.startsWith(toPath + '/');

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
          {/* A bare number reads as "Transactions 3": say what it counts */}
          <span style={SR_ONLY}>{badge === 1 ? ' item waiting' : ' items waiting'}</span>
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const initials = (user?.name || user?.phone || '?').slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[user?.role || ''] || user?.role || '';
  const avatarColor = ROLE_COLOR[user?.role || ''] || 'oklch(0.50 0.22 27)';

  const {
    unreadCount, supportUnread, careersNewCount, requestsPendingCount, disputesPendingCount, chatUnreadCount,
    transactionsPendingCount, schedulingPendingCount, promotionsPendingCount, hotFoodPendingCount,
    categoriesPendingCount, billingPendingCount,
  } = useAdminBadges();

  // Empty the cache too, so the next person to sign in on this tab never sees the previous session's data
  function handleLogout() { queryClient.clear(); logout(); navigate('/login'); }

  return (
    <Sidebar collapsible="icon" variant="floating" role="complementary" aria-label="Menu and account">
      {/* Brand */}
      <SidebarHeader style={{ padding: '14px 12px 10px' }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="Lucky Stop Admin"
              style={{ padding: '6px 8px', borderRadius: 10, cursor: 'pointer' }}
            >
              {/* A real link (it was a div with a click handler, so the keyboard could not reach it) */}
              <NavLink to="/" end aria-label="Lucky Stop Admin, go to the Dashboard">
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
                    color: 'oklch(0.72 0.02 245)',
                    marginTop: 2,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                  }}>
                    Admin Console
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Main menu" style={{
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
              <SidebarNavItem to="/inventory-analytics" icon={<Package size={16} />} label="Inventory Intelligence" />
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
              <SidebarNavItem to="/notices" icon={<Pin size={16} />} label="Notices" />
              <SidebarNavItem to="/catalog" icon={<Gift size={16} />} label="Catalog" />
              {isDevAdmin && (
                <SidebarNavItem to="/promotions" icon={<Megaphone size={16} />} label="Promotions" badge={promotionsPendingCount} />
              )}
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/hot-food" icon={<Flame size={16} />} label="Hot Food" badge={hotFoodPendingCount} />
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
              <SidebarNavItem to="/scheduling" icon={<Calendar size={16} />} label="Scheduling" badge={schedulingPendingCount} />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/staff" icon={<Users size={16} />} label="Staff" />
              )}
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to={disputesPendingCount > 0 ? '/customers?tab=disputes' : '/customers'} icon={<UserCircle size={16} />} label="Customers" badge={disputesPendingCount} />
              )}
              <SidebarNavItem to="/store-requests" icon={<ClipboardList size={16} />} label="Requests" badge={requestsPendingCount} />
              {(isDevAdmin || isSuperAdmin) && (
                <SidebarNavItem to="/order-list" icon={<ShoppingCart size={16} />} label="Order List" badge={categoriesPendingCount} />
              )}
              <SidebarNavItem to="/scanned-products" icon={<Barcode size={16} />} label="Scanned Products" />
              <SidebarNavItem to="/labels" icon={<Printer size={16} />} label="Labels" />
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
              <SidebarNavItem to="/transactions" icon={<Receipt size={16} />} label="Transactions" badge={transactionsPendingCount} />
              <SidebarNavItem to="/daily-reports" icon={<ClipboardCheck size={16} />} label="Daily Reports" />
              <SidebarNavItem to="/daily-tasks" icon={<ListChecks size={16} />} label="Daily Tasks" />
              {(isDevAdmin || isSuperAdmin) && (
                <>
                  <SidebarNavItem to="/rates" icon={<Percent size={16} />} label="Cashback Rates" />
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
                    <SidebarNavItem to="/billing" icon={<CreditCard size={16} />} label="Billing" badge={billingPendingCount} />
                  )}
                  {isSuperAdmin && (
                    <SidebarNavItem to="/my-billing" icon={<CreditCard size={16} />} label="Billing" badge={billingPendingCount} />
                  )}
                  <SidebarNavItem
                    to="/notifications"
                    icon={<Bell size={16} />}
                    label="Notifications"
                    badge={unreadCount}
                  />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <SidebarSeparator />

        {/* Support - StoreManager+ (submits/views own tickets; DevAdmin gets the full inbox) */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem to="/support" icon={<Headphones size={16} />} label="Support" badge={supportUnread} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
                  color: isActive ? 'oklch(0.97 0.005 27 / 0.7)' : 'oklch(0.72 0.02 245)',
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
            color: 'oklch(0.72 0.02 245)',
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
            (e.currentTarget as HTMLButtonElement).style.color = 'oklch(0.72 0.02 245)';
          }}
        >
          <LogOut size={13} />
          <span>Sign out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
