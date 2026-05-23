import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { superAdminApi, devAdminApi, supportApi, careersApi } from '../services/api';

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev Admin',
  SUPER_ADMIN: 'Super Admin',
  STORE_MANAGER: 'Store Manager',
};

// ─── Dropdown ─────────────────────────────────────────────────────────────────

type DropdownItem = { to: string; icon: string; label: string; badge?: number };

function NavDropdown({ label, icon, items, activeRoutes }: {
  label: string; icon: string; items: DropdownItem[]; activeRoutes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [btnHov, setBtnHov] = useState(false);
  const [hovItem, setHovItem] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = activeRoutes.some(r => r === '/' ? location.pathname === '/' : location.pathname.startsWith(r));

  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(o => !o);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t) && btnRef.current && !btnRef.current.contains(t))
        setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        onMouseEnter={() => setBtnHov(true)}
        onMouseLeave={() => setBtnHov(false)}
        style={{ ...ds.btn, ...(isActive || open ? ds.btnActive : (btnHov ? ds.btnHov : {})) }}
      >
        <span style={ds.icon}>{icon}</span>
        {label}
        <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.7, transition: 'transform 0.15s ease', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {open && (
        <div ref={menuRef} style={{ ...ds.menu, top: menuPos.top, left: menuPos.left }}>
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                ...ds.item,
                ...(isActive ? ds.itemActive : (hovItem === item.to ? ds.itemHov : {})),
              })}
              onMouseEnter={() => setHovItem(item.to)}
              onMouseLeave={() => setHovItem(null)}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span style={ds.badge}>{item.badge}</span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </>
  );
}

const ds: Record<string, React.CSSProperties> = {
  btn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'rgba(255,255,255,0.6)', padding: '6px 12px', borderRadius: 8,
    fontSize: 13, fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    transition: 'color 0.15s ease, background 0.15s ease',
  },
  btnActive: { color: '#fff', background: 'rgba(255,255,255,0.15)', fontWeight: 700 },
  btnHov: { color: 'rgba(255,255,255,0.92)', background: 'rgba(255,255,255,0.08)' },
  icon: { fontSize: 14 },
  menu: {
    position: 'fixed',
    background: '#fff', borderRadius: 12,
    boxShadow: '0 12px 36px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
    minWidth: 180, zIndex: 200,
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.06)',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', textDecoration: 'none',
    color: '#1D3557', fontSize: 13, fontWeight: 500,
    transition: 'background 0.1s ease',
  },
  itemActive: { background: '#EFF6FF', color: '#1D3557', fontWeight: 700 },
  itemHov: { background: '#f1f5f9', color: '#1D3557' },
  badge: {
    marginLeft: 'auto', background: '#E63946', color: '#fff',
    borderRadius: 8, padding: '1px 6px', fontSize: 9, fontWeight: 800, lineHeight: 1.4,
  },
};

// ─── HoverLink ─────────────────────────────────────────────────────────────────

function HoverLink({ to, icon, label, badge, end: isEnd }: {
  to: string; icon: string; label: string; badge?: number; end?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <NavLink
      to={to}
      end={isEnd}
      style={({ isActive }) => ({
        ...s.link,
        ...(isActive ? s.linkActive : (hov ? s.linkHov : {})),
        ...(badge != null && badge > 0 ? { position: 'relative' as const } : {}),
      })}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={s.linkIcon}>{icon}</span>
      {label}
      {badge != null && badge > 0 && <span style={s.notifBadge}>{badge}</span>}
    </NavLink>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [logoutHov, setLogoutHov] = useState(false);
  const isDevAdmin     = user?.role === 'DEV_ADMIN';
  const isSuperAdmin   = user?.role === 'SUPER_ADMIN';
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

  // ── Dropdown item lists ───────────────────────────────────────────────────

  const overviewItems: DropdownItem[] = [
    { to: '/',          icon: '📊', label: 'Dashboard' },
    { to: '/analytics', icon: '📈', label: 'Analytics' },
  ];
  const overviewItemsBasic: DropdownItem[] = [{ to: '/', icon: '📊', label: 'Dashboard' }];

  const peopleItemsAdminFull: DropdownItem[] = [
    { to: '/chat',           icon: '💬', label: 'Chat'       },
    { to: '/scheduling',     icon: '📅', label: 'Scheduling' },
    { to: '/staff',          icon: '👥', label: 'Staff'      },
    { to: '/customers',      icon: '🙋', label: 'Customers'  },
    { to: '/store-requests', icon: '📋', label: 'Requests'   },
    { to: '/order-list',     icon: '📦', label: 'Order List' },
    { to: '/careers',        icon: '💼', label: 'Careers', badge: careersNewCount },
  ];
  const peopleItemsManager: DropdownItem[] = [
    { to: '/chat',           icon: '💬', label: 'Chat'       },
    { to: '/scheduling',     icon: '📅', label: 'Scheduling' },
    { to: '/store-requests', icon: '📋', label: 'Requests'   },
    { to: '/order-list',     icon: '📦', label: 'Order List' },
  ];
  const contentItemsAll: DropdownItem[] = [
    { to: '/offers',  icon: '📢', label: 'Offers'  },
    { to: '/banners', icon: '🖼️', label: 'Banners' },
    { to: '/catalog', icon: '🎁', label: 'Catalog' },
  ];
  const contentItemsManager: DropdownItem[] = [
    { to: '/offers',  icon: '📢', label: 'Offers'  },
    { to: '/banners', icon: '🖼️', label: 'Banners' },
  ];

  const overviewRoutes = ['/', '/analytics'];
  const peopleRoutes   = ['/chat', '/scheduling', '/staff', '/customers', '/store-requests', '/order-list', '/careers'];
  const contentRoutes  = ['/offers', '/banners', '/catalog'];

  return (
    <nav style={s.nav}>
      <div style={s.brand} onClick={() => navigate('/')} title="Dashboard">
        <span style={s.brandIcon}>⛽</span>
        <div>
          <div style={s.brandName}>Lucky Stop</div>
          <div style={s.brandSub}>Admin</div>
        </div>
      </div>

      <div style={s.links}>

        {/* Overview */}
        {(isDevAdmin || isSuperAdmin) && (
          <NavDropdown label="Overview" icon="📊"
            items={isDevAdmin ? overviewItems : overviewItemsBasic}
            activeRoutes={overviewRoutes} />
        )}
        {isStoreManager && <HoverLink to="/" icon="📊" label="Dashboard" end />}

        {/* Content */}
        <NavDropdown label="Content" icon="📣"
          items={isStoreManager ? contentItemsManager : contentItemsAll}
          activeRoutes={contentRoutes} />

        {/* People */}
        <NavDropdown label="People" icon="👥"
          items={isStoreManager ? peopleItemsManager : peopleItemsAdminFull}
          activeRoutes={peopleRoutes} />

        {/* Tier Rates */}
        {(isDevAdmin || isSuperAdmin) && (
          <HoverLink to="/rates" icon="🏆" label="Tier Rates" />
        )}

        {/* DevAdmin extras */}
        {isDevAdmin && (
          <>
            <HoverLink to="/promotions"   icon="📣" label="Promotions" />
            <HoverLink to="/stores"       icon="🏪" label="Stores" />
            <HoverLink to="/transactions" icon="🧾" label="Transactions" />
            <HoverLink to="/activity"     icon="🔍" label="Activity" />
            <HoverLink to="/leaderboard"  icon="🏆" label="Leaderboard" />
            <HoverLink to="/billing"      icon="💳" label="Billing" />
            <HoverLink to="/support"      icon="🎧" label="Support" badge={supportUnread} />
            <HoverLink to="/notifications" icon="🔔" label="Notifications" badge={unreadCount} />
          </>
        )}

        {/* SuperAdmin extras */}
        {isSuperAdmin && (
          <>
            <HoverLink to="/stores"       icon="🏪" label="Stores" />
            <HoverLink to="/transactions" icon="🧾" label="Transactions" />
            <HoverLink to="/activity"     icon="🔍" label="Activity" />
            <HoverLink to="/leaderboard"  icon="🏆" label="Leaderboard" />
            <HoverLink to="/my-billing"   icon="💳" label="Billing" />
            <HoverLink to="/support"      icon="🎧" label="Support" />
            <HoverLink to="/notifications" icon="🔔" label="Notifications" badge={unreadCount} />
          </>
        )}

        {/* StoreManager extras */}
        {isStoreManager && (
          <HoverLink to="/transactions" icon="🧾" label="Transactions" />
        )}
      </div>

      <div style={s.right}>
        <NavLink to="/profile" style={{ textDecoration: 'none' }}>
          <div style={s.userPill}>
            <div style={s.avatar}>{initials}</div>
            <div style={s.userInfo}>
              <div style={s.userName}>{user?.name || user?.phone}</div>
              <div style={{ ...s.roleTag, ...(isDevAdmin ? s.roleTagDev : isStoreManager ? s.roleTagMgr : {}) }}>
                {ROLE_LABELS[user?.role || ''] || user?.role}
              </div>
            </div>
          </div>
        </NavLink>
        <button
          style={{ ...s.logout, ...(logoutHov ? s.logoutHov : {}) }}
          onMouseEnter={() => setLogoutHov(true)}
          onMouseLeave={() => setLogoutHov(false)}
          onClick={handleLogout}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex', alignItems: 'center', padding: '0 24px',
    height: 64, background: '#1D3557',
    position: 'sticky', top: 0, zIndex: 100,
    boxShadow: '0 2px 16px rgba(0,0,0,0.22)', gap: 8,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginRight: 24, paddingRight: 24,
    borderRight: '1px solid rgba(255,255,255,0.12)', flexShrink: 0,
    cursor: 'pointer',
  },
  brandIcon: { fontSize: 26 },
  brandName: { color: '#fff', fontWeight: 900, fontSize: 16, lineHeight: 1 },
  brandSub: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },

  links: { display: 'flex', gap: 2, flex: 1, flexWrap: 'nowrap', overflow: 'auto', alignItems: 'center' },
  link: {
    color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
    padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    transition: 'color 0.15s ease, background 0.15s ease',
  },
  linkActive: { color: '#fff', background: 'rgba(255,255,255,0.15)', fontWeight: 700 },
  linkHov: { color: 'rgba(255,255,255,0.92)', background: 'rgba(255,255,255,0.08)' },
  linkIcon: { fontSize: 14 },

  right: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 16 },
  userPill: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: 13,
  },
  userInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  userName: { color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1 },
  roleTag: {
    display: 'inline-block', background: 'rgba(255,255,255,0.12)',
    color: '#F4A261', borderRadius: 4, padding: '1px 6px',
    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
  },
  roleTagDev: { color: '#2DC653' },
  roleTagMgr: { color: '#4cc9f0' },
  logout: {
    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
    padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    transition: 'all 0.15s ease',
  },
  logoutHov: {
    background: 'rgba(230,57,70,0.18)', color: '#E63946',
    borderColor: 'rgba(230,57,70,0.4)',
  },
  notifBadge: {
    position: 'absolute', top: 2, right: 2,
    background: '#E63946', color: '#fff',
    borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 800, lineHeight: 1.4,
  },
};
