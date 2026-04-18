import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { superAdminApi, devAdminApi, supportApi } from '../services/api';

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev Admin',
  SUPER_ADMIN: 'Super Admin',
  STORE_MANAGER: 'Store Manager',
};

// ─── Generic Dropdown ─────────────────────────────────────────────────────────

type DropdownItem = { to: string; icon: string; label: string; badge?: number };

function NavDropdown({ label, icon, items, activeRoutes }: {
  label: string;
  icon: string;
  items: DropdownItem[];
  activeRoutes: string[];
}) {
  const [open, setOpen] = useState(false);
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
      <button ref={btnRef} onClick={handleOpen}
        style={{ ...ds.btn, ...(isActive || open ? ds.btnActive : {}) }}>
        <span style={ds.icon}>{icon}</span>
        {label}
        <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div ref={menuRef} style={{ ...ds.menu, top: menuPos.top, left: menuPos.left }}>
          {items.map(item => (
            <NavLink key={item.to} to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({ ...ds.item, ...(isActive ? ds.itemActive : {}) })}>
              <span>{item.icon}</span>
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
  },
  btnActive: { color: '#fff', background: 'rgba(255,255,255,0.15)', fontWeight: 700 },
  icon: { fontSize: 14 },
  menu: {
    position: 'fixed',
    background: '#fff', borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    minWidth: 170, zIndex: 200,
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.08)',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', textDecoration: 'none',
    color: '#1D3557', fontSize: 13, fontWeight: 500,
  },
  itemActive: { background: '#EFF6FF', color: '#1D3557', fontWeight: 700 },
  badge: {
    marginLeft: 'auto', background: '#E63946', color: '#fff',
    borderRadius: 8, padding: '1px 6px',
    fontSize: 9, fontWeight: 800, lineHeight: 1.4,
  },
};

// ─── Main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
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

  function handleLogout() { logout(); navigate('/login'); }
  const lnk = (isActive: boolean) => ({ ...s.link, ...(isActive ? s.linkActive : {}) });

  // ── Dropdown item lists ────────────────────────────────────────────────────

  const overviewItems: DropdownItem[] = [
    { to: '/',          icon: '📊', label: 'Dashboard'  },
    { to: '/analytics', icon: '📈', label: 'Analytics'  },
  ];

  const overviewItemsBasic: DropdownItem[] = [
    { to: '/', icon: '📊', label: 'Dashboard' },
  ];

  const peopleItemsAdminFull: DropdownItem[] = [
    { to: '/chat',           icon: '💬', label: 'Chat'       },
    { to: '/scheduling',     icon: '📅', label: 'Scheduling' },
    { to: '/staff',          icon: '👥', label: 'Staff'      },
    { to: '/customers',      icon: '🙋', label: 'Customers'  },
    { to: '/store-requests', icon: '📋', label: 'Requests'   },
  ];

  const peopleItemsManager: DropdownItem[] = [
    { to: '/chat',           icon: '💬', label: 'Chat'     },
    { to: '/store-requests', icon: '📋', label: 'Requests' },
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
  const peopleRoutes   = ['/chat', '/scheduling', '/staff', '/customers', '/store-requests'];
  const contentRoutes  = ['/offers', '/banners', '/catalog'];

  return (
    <nav style={s.nav}>
      <div style={s.brand}>
        <span style={s.brandIcon}>⛽</span>
        <div>
          <div style={s.brandName}>Lucky Stop</div>
          <div style={s.brandSub}>Admin</div>
        </div>
      </div>

      <div style={s.links}>

        {/* 1. Overview */}
        {(isDevAdmin || isSuperAdmin) && (
          <NavDropdown label="Overview" icon="📊"
            items={isDevAdmin ? overviewItems : overviewItemsBasic}
            activeRoutes={overviewRoutes} />
        )}
        {isStoreManager && (
          <NavLink to="/" end style={({ isActive }) => lnk(isActive)}>
            <span style={s.linkIcon}>📊</span>Dashboard
          </NavLink>
        )}

        {/* 2. Content */}
        <NavDropdown label="Content" icon="📣"
          items={isStoreManager ? contentItemsManager : contentItemsAll}
          activeRoutes={contentRoutes} />

        {/* 3. People */}
        <NavDropdown label="People" icon="👥"
          items={isStoreManager ? peopleItemsManager : peopleItemsAdminFull}
          activeRoutes={peopleRoutes} />

        {/* 4. Tier Rates */}
        {(isDevAdmin || isSuperAdmin) && (
          <NavLink to="/rates" style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🏆</span>Tier Rates</NavLink>
        )}

        {/* DevAdmin: 5-10 */}
        {isDevAdmin && (
          <>
            <NavLink to="/promotions"  style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>📣</span>Promotions</NavLink>
            <NavLink to="/stores"      style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🏪</span>Stores</NavLink>
            <NavLink to="/transactions" style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🧾</span>Transactions</NavLink>
            <NavLink to="/activity"    style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🔍</span>Activity</NavLink>
            <NavLink to="/leaderboard" style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🏆</span>Leaderboard</NavLink>
            <NavLink to="/billing"     style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>💳</span>Billing</NavLink>
            <NavLink to="/support" style={({ isActive }) => ({ ...lnk(isActive), position: 'relative' })}>
              <span style={s.linkIcon}>🎧</span>Support
              {supportUnread > 0 && <span style={s.notifBadge}>{supportUnread}</span>}
            </NavLink>
            <NavLink to="/notifications" style={({ isActive }) => ({ ...lnk(isActive), position: 'relative' })}>
              <span style={s.linkIcon}>🔔</span>Notifications
              {unreadCount > 0 && <span style={s.notifBadge}>{unreadCount}</span>}
            </NavLink>
          </>
        )}

        {/* SuperAdmin: 5-9 */}
        {isSuperAdmin && (
          <>
            <NavLink to="/stores"       style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🏪</span>Stores</NavLink>
            <NavLink to="/transactions" style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🧾</span>Transactions</NavLink>
            <NavLink to="/activity"     style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🔍</span>Activity</NavLink>
            <NavLink to="/leaderboard"  style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🏆</span>Leaderboard</NavLink>
            <NavLink to="/my-billing"   style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>💳</span>Billing</NavLink>
            <NavLink to="/support" style={({ isActive }) => lnk(isActive)}><span style={s.linkIcon}>🎧</span>Support</NavLink>
            <NavLink to="/notifications" style={({ isActive }) => ({ ...lnk(isActive), position: 'relative' })}>
              <span style={s.linkIcon}>🔔</span>Notifications
              {unreadCount > 0 && <span style={s.notifBadge}>{unreadCount}</span>}
            </NavLink>
          </>
        )}

        {/* StoreManager: Transactions */}
        {isStoreManager && (
          <NavLink to="/transactions" style={({ isActive }) => lnk(isActive)}>
            <span style={s.linkIcon}>🧾</span>Transactions
          </NavLink>
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
        <button style={s.logout} onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex', alignItems: 'center', padding: '0 24px',
    height: 64, background: '#1D3557',
    position: 'sticky', top: 0, zIndex: 100,
    boxShadow: '0 2px 12px rgba(0,0,0,0.2)', gap: 8,
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginRight: 24, paddingRight: 24,
    borderRight: '1px solid rgba(255,255,255,0.12)', flexShrink: 0,
  },
  brandIcon: { fontSize: 26 },
  brandName: { color: '#fff', fontWeight: 900, fontSize: 16, lineHeight: 1 },
  brandSub: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' },

  links: { display: 'flex', gap: 2, flex: 1, flexWrap: 'nowrap', overflow: 'auto', alignItems: 'center' },
  link: {
    color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
    padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  },
  linkActive: { color: '#fff', background: 'rgba(255,255,255,0.15)', fontWeight: 700 },
  linkIcon: { fontSize: 14 },

  right: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 16 },
  userPill: { display: 'flex', alignItems: 'center', gap: 10 },
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
  },
  notifBadge: {
    position: 'absolute', top: 2, right: 2,
    background: '#E63946', color: '#fff',
    borderRadius: 8, padding: '1px 5px',
    fontSize: 9, fontWeight: 800, lineHeight: 1.4,
  },
};
