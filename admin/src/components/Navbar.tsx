import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/offers', label: 'Offers', icon: '📢' },
  { to: '/banners', label: 'Banners', icon: '🖼️' },
  { to: '/transactions', label: 'Transactions', icon: '🧾' },
  { to: '/staff', label: 'Staff', icon: '👥' },
  { to: '/customers', label: 'Customers', icon: '🙋' },
];

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev Admin',
  SUPER_ADMIN: 'Super Admin',
};

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const initials = (user?.name || user?.phone || '?').slice(0, 2).toUpperCase();

  function handleLogout() { logout(); navigate('/login'); }

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
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}
          >
            <span style={s.linkIcon}>{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
        {isDevAdmin && (
          <>
            <NavLink to="/analytics" style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}>
              <span style={s.linkIcon}>📈</span>Analytics
            </NavLink>
            <NavLink to="/billing" style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}>
              <span style={s.linkIcon}>💳</span>Billing
            </NavLink>
          </>
        )}
      </div>

      <div style={s.right}>
        <div style={s.userPill}>
          <div style={s.avatar}>{initials}</div>
          <div style={s.userInfo}>
            <div style={s.userName}>{user?.name || user?.phone}</div>
            <div style={{ ...s.roleTag, ...(isDevAdmin ? s.roleTagDev : {}) }}>
              {ROLE_LABELS[user?.role || ''] || user?.role}
            </div>
          </div>
        </div>
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

  links: { display: 'flex', gap: 2, flex: 1, flexWrap: 'nowrap', overflow: 'auto' },
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
  logout: {
    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
    padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
};
