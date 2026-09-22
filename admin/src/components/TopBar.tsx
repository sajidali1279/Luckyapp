import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search, RotateCw } from 'lucide-react';
import { SidebarTrigger, useSidebar } from './ui/sidebar';
import { useDialog } from '../hooks/useDialog';
import { titleFor } from '../hooks/usePageTitle';
import { useAdminBadges, BADGE_LABELS, type BadgeKey } from '../hooks/useAdminBadges';
import { NAV_ITEMS } from '../lib/navItems';
import CommandPalette from './CommandPalette';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

const badgeTarget = (key: BadgeKey) => NAV_ITEMS.find((i) => i.badgeKey === key)?.to ?? '/';

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function BellPopover() {
  const navigate = useNavigate();
  const badges = useAdminBadges();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useDialog(open, boxRef, () => setOpen(false), false);

  const waiting = (Object.keys(BADGE_LABELS) as BadgeKey[])
    .map((key) => ({ key, count: (badges[key] as number) ?? 0 }))
    .filter((x) => x.count > 0);
  const total = waiting.reduce((sum, x) => sum + x.count, 0);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={total > 0 ? `${total} ${total === 1 ? 'item needs' : 'items need'} attention` : 'Nothing needs attention'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={s.iconBtn}
      >
        🔔
        {total > 0 && <span style={s.bellDot}>{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div ref={boxRef} role="dialog" aria-modal="false" aria-label="What needs attention" tabIndex={-1} style={s.popover}>
          <div style={s.popoverTitle}>What needs attention</div>
          {waiting.length === 0 ? (
            <div style={s.popoverEmpty}>Nothing is waiting right now.</div>
          ) : (
            <ul style={s.popoverList}>
              {waiting.map(({ key, count }) => (
                <li key={key}>
                  <button
                    type="button"
                    style={s.popoverRow}
                    onClick={() => { setOpen(false); navigate(badgeTarget(key)); }}
                  >
                    <span style={s.popoverCount}>{count}</span>
                    <span>{count === 1 ? BADGE_LABELS[key].one : BADGE_LABELS[key].many}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// The single row across every page (S2): the phone menu opener the sidebar never had, a real page title, a way to jump anywhere
// (Ctrl/Cmd+K), what's waiting for a decision from wherever you are (not only the Dashboard), and how stale the numbers on screen are.
export default function TopBar() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { isMobile, setOpenMobile } = useSidebar();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [, forceTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Picking a page closes the slide-out menu on a phone (it used to stay open over the page you just chose)
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { await queryClient.refetchQueries({ type: 'active' }); } finally { setRefreshedAt(Date.now()); setRefreshing(false); }
  }

  return (
    <div style={s.bar}>
      <SidebarTrigger aria-label={isMobile ? 'Open the menu' : 'Collapse or expand the sidebar'} style={s.trigger} />
      <h1 style={s.title}>{titleFor(pathname)}</h1>
      <button type="button" style={s.searchBtn} onClick={() => setPaletteOpen(true)}>
        <Search size={14} aria-hidden="true" />
        <span style={s.searchBtnText}>Search</span>
        <kbd style={s.kbd}>{navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <div style={s.right}>
        <span style={s.freshness}>Updated {timeAgo(refreshedAt)}</span>
        <button type="button" style={s.iconBtn} aria-label="Refresh the counts on this page" onClick={refresh} disabled={refreshing}>
          <RotateCw size={15} style={refreshing ? s.spin : undefined} aria-hidden="true" />
        </button>
        <BellPopover />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e9ecef', minHeight: 52,
  },
  trigger: { color: PRIMARY, flexShrink: 0 },
  title: { margin: 0, fontSize: 16, fontWeight: 800, color: PRIMARY, flexShrink: 0, whiteSpace: 'nowrap' as const },
  searchBtn: {
    display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4, padding: '6px 10px', borderRadius: 8,
    border: '1px solid #e5e5ea', background: '#f8f9fa', color: TEXT_MUTED, cursor: 'pointer', fontSize: 13.5,
    flex: '0 1 260px', minWidth: 0,
  },
  searchBtnText: { flex: 1, textAlign: 'left' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  kbd: { fontSize: 10.5, fontWeight: 700, color: TEXT_MUTED, background: '#fff', border: '1px solid #e5e5ea', borderRadius: 4, padding: '1px 5px', flexShrink: 0 },
  right: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 },
  freshness: { fontSize: 12, color: TEXT_MUTED, whiteSpace: 'nowrap' as const },
  iconBtn: {
    position: 'relative', width: 34, height: 34, borderRadius: 8, border: '1px solid transparent', background: 'transparent',
    color: PRIMARY, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
  },
  spin: { animation: 'spin 0.8s linear infinite' },
  bellDot: {
    position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 8, background: '#b91c1c', color: '#fff',
    fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1,
  },
  popover: {
    position: 'absolute', top: 40, right: 0, width: 320, maxHeight: 380, overflowY: 'auto' as const,
    background: '#fff', borderRadius: 12, boxShadow: '0 12px 36px rgba(0,0,0,0.18)', border: '1px solid #eee', zIndex: 40,
  },
  popoverTitle: { fontSize: 12.5, fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, padding: '12px 14px 6px' },
  popoverEmpty: { padding: '10px 14px 16px', fontSize: 14, color: TEXT_MUTED },
  popoverList: { listStyle: 'none', margin: 0, padding: '2px 6px 8px' },
  popoverRow: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8,
    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: PRIMARY, textAlign: 'left' as const,
  },
  popoverCount: {
    fontSize: 12, fontWeight: 800, color: '#fff', background: '#b91c1c', borderRadius: 10, minWidth: 20, height: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0,
  },
};
