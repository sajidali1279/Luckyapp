import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav style={s.nav}>
      <div style={s.brand}>⛽ Lucky Stop Admin</div>
      <div style={s.links}>
        <NavLink to="/" end style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}>Dashboard</NavLink>
        {isSuperAdmin && (
          <>
            <NavLink to="/offers" style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}>Offers</NavLink>
            <NavLink to="/banners" style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}>Banners</NavLink>
          </>
        )}
        <NavLink to="/transactions" style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}>Transactions</NavLink>
        {isDevAdmin && (
          <NavLink to="/billing" style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}>Billing</NavLink>
        )}
      </div>
      <div style={s.right}>
        <span style={s.userInfo}>{user?.name || user?.phone} · <span style={s.role}>{user?.role}</span></span>
        <button style={s.logout} onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex', alignItems: 'center', padding: '0 32px',
    height: 60, background: '#1D3557', position: 'sticky', top: 0, zIndex: 100,
  },
  brand: { color: '#fff', fontWeight: 800, fontSize: 18, marginRight: 40, whiteSpace: 'nowrap' },
  links: { display: 'flex', gap: 4, flex: 1 },
  link: { color: 'rgba(255,255,255,0.7)', textDecoration: 'none', padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500 },
  linkActive: { color: '#fff', background: 'rgba(255,255,255,0.15)' },
  right: { display: 'flex', alignItems: 'center', gap: 16 },
  userInfo: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  role: { color: '#F4A261', fontWeight: 600 },
  logout: { background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
};
