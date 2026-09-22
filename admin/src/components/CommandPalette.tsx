import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pin } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDialog } from '../hooks/useDialog';
import { visibleNavItems } from '../lib/navItems';
import { useAdminBadges, type BadgeKey } from '../hooks/useAdminBadges';
import { usePinnedPages } from '../hooks/usePinnedPages';
import { readRecents, pushRecent } from '../lib/recentPages';
import { customersApi, staffApi } from '../services/api';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

type Row =
  | { kind: 'nav'; key: string; to: string; label: string; group: string; count: number; pinned: boolean }
  | { kind: 'customer'; key: string; to: string; label: string; sub: string }
  | { kind: 'staff'; key: string; to: string; label: string; sub: string };

const GROUP_TITLE: Record<string, string> = { customer: 'Customers', staff: 'Staff' };

interface Props {
  open: boolean;
  onClose: () => void;
}

// Ctrl/Cmd+K from anywhere: jump to any page this role can see, or straight to a customer or staff record by name or phone. Reaches
// every page, not only the Dashboard, where the same kind of search lived before (components/GlobalSearch.tsx, still there — this is
// the same idea, everywhere).
export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isDevOrSuper = user?.role === 'DEV_ADMIN' || user?.role === 'SUPER_ADMIN';
  const badges = useAdminBadges();
  const { pinned: pinnedPaths, isPinned, togglePin } = usePinnedPages();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useDialog(open, dialogRef, onClose, false);
  useEffect(() => { if (open) { setQuery(''); setDebounced(''); setSelected(0); requestAnimationFrame(() => inputRef.current?.focus()); } }, [open]);
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(t); }, [query]);

  const active = open && isDevOrSuper && debounced.length >= 2;
  const { data: customerData, isFetching: customersLoading } = useQuery({
    queryKey: ['customers', debounced], queryFn: () => customersApi.list(debounced), enabled: active,
  });
  const customerResults = (customerData?.data?.data?.customers ?? []).slice(0, 5);

  const { data: staffData } = useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list(), enabled: open && isDevOrSuper });
  const staffResults = active
    ? (staffData?.data?.data ?? []).filter((s: any) =>
        s.name?.toLowerCase().includes(debounced.toLowerCase()) || s.phone?.includes(debounced)
      ).slice(0, 5)
    : [];

  const items = useMemo(() => visibleNavItems(user?.role), [user?.role]);
  const recentPaths = useMemo(() => (open && !query.trim() ? readRecents() : []), [open, query]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const countFor = (i: (typeof items)[number]) => (i.badgeKey ? (badges[i.badgeKey as BadgeKey] as number) ?? 0 : 0);
    const navRows: Row[] = (q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items).map((i) => ({
      kind: 'nav' as const, key: i.to, to: i.to, label: i.label, group: i.group,
      count: countFor(i), pinned: isPinned(i.to),
    }));
    if (!q) {
      // No query yet: pinned pages first (in the order pinned), then recent (most recently opened via this palette, excluding
      // anything already shown as pinned), then everything else grouped as usual.
      const pinned: Row[] = pinnedPaths.map((p) => items.find((i) => i.to === p)).filter((i): i is NonNullable<typeof i> => !!i)
        .map((i) => ({ kind: 'nav' as const, key: 'pinned-' + i.to, to: i.to, label: i.label, group: 'Pinned', count: countFor(i), pinned: true }));
      const recent: Row[] = recentPaths.filter((p) => !pinnedPaths.includes(p)).map((p) => items.find((i) => i.to === p)).filter((i): i is NonNullable<typeof i> => !!i)
        .map((i) => ({ kind: 'nav' as const, key: 'recent-' + i.to, to: i.to, label: i.label, group: 'Recent', count: countFor(i), pinned: false }));
      return [...pinned, ...recent, ...navRows];
    }
    // Both params: highlightId alone would only ever work if that customer happened to already be on page 1 of the unfiltered list
    // (the page is not scoped to one customer on its own) — the search narrows the list down to them, highlightId then scrolls to
    // and pulses the right card once it renders.
    const customerRows: Row[] = active ? customerResults.map((c: any) => ({
      kind: 'customer' as const, key: 'cust-' + c.id,
      to: `/customers?search=${encodeURIComponent(c.phone || c.name || '')}&highlightId=${c.id}`,
      label: c.name || 'Unnamed', sub: c.phone,
    })) : [];
    const staffRows: Row[] = active ? staffResults.map((st: any) => ({
      kind: 'staff' as const, key: 'staff-' + st.id, to: `/staff?search=${encodeURIComponent(st.name || st.phone)}`, label: st.name || st.phone, sub: st.phone,
    })) : [];
    return [...navRows, ...customerRows, ...staffRows];
  }, [items, query, recentPaths, pinnedPaths, isPinned, badges, active, customerResults, staffResults]);

  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => {
    const row = rows[selected];
    if (!row) return;
    listRef.current?.querySelector(`#cmdk-${CSS.escape(row.key)}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, rows]);

  function activate(row: Row) {
    pushRecent(row.kind === 'nav' ? row.to : row.to.split('?')[0]);
    navigate(row.to);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => (rows.length ? (i + 1) % rows.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0)); }
    else if (e.key === 'Enter' && e.shiftKey) {
      // Shift+Enter pins or unpins the highlighted page instead of opening it, and stays open so several
      // can be pinned in a row. A plain button inside the listbox's option row would itself become a second,
      // rule-breaking child of the listbox in the accessible tree, so this stays keyboard-only on purpose.
      e.preventDefault();
      const row = rows[selected];
      if (row && row.kind === 'nav') togglePin(row.to);
    }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[selected]) activate(rows[selected]); }
  }

  if (!open) return null;

  const selectedRow = rows[selected];
  const selectedNavRow = selectedRow?.kind === 'nav' ? selectedRow : undefined;
  let lastGroup = '';
  const showSearching = active && customersLoading && customerResults.length === 0;
  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1} style={s.box} onClick={(e) => e.stopPropagation()}>
        <div style={s.searchRow}>
          <span aria-hidden="true" style={s.searchIcon}>🔎</span>
          <input
            ref={inputRef}
            style={s.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isDevOrSuper ? 'Jump to a page, or search customers and staff...' : 'Jump to a page...'}
            aria-label={isDevOrSuper ? 'Jump to a page, or search customers and staff' : 'Jump to a page'}
            aria-activedescendant={rows[selected] ? `cmdk-${rows[selected].key}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            autoComplete="off"
          />
          <kbd style={s.kbd}>Esc</kbd>
        </div>
        {rows.length === 0 ? (
          <div style={s.empty}>{showSearching ? 'Searching…' : `No matches for "${query}".`}</div>
        ) : (
          <ul id="cmdk-list" role="listbox" aria-label="Results" ref={listRef} style={s.list}>
            {rows.map((row, i) => {
              const group = row.kind === 'nav' ? row.group : GROUP_TITLE[row.kind];
              const showHeader = group !== lastGroup;
              lastGroup = group;
              return (
                <Fragment key={row.key}>
                  {/* role="presentation" so this <li> (and the header's) is skipped in the accessible tree: a listbox's only real
                      children may be option (or group) roles, an <li> with no role in between would fail that. */}
                  {showHeader && <li role="presentation" style={s.groupLabel}>{group}</li>}
                  <li role="presentation">
                    <button
                      id={`cmdk-${row.key}`}
                      type="button"
                      role="option"
                      aria-selected={i === selected}
                      style={{ ...s.row, ...(i === selected ? s.rowActive : {}) }}
                      onMouseEnter={() => setSelected(i)}
                      onClick={() => activate(row)}
                    >
                      <span style={s.rowLabel}>
                        {row.label}
                        {row.kind === 'nav' && row.pinned && <span style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' as const, border: 0 }}>, pinned</span>}
                      </span>
                      {row.kind === 'nav' ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {row.pinned && <Pin aria-hidden="true" size={12} style={{ color: i === selected ? 'rgba(255,255,255,0.75)' : TEXT_MUTED, flexShrink: 0 }} />}
                          {row.count > 0 && <span style={{ ...s.countBadge, ...(i === selected ? s.countBadgeActive : {}) }}>{row.count}</span>}
                        </span>
                      ) : (
                        <span style={{ ...s.rowHint, ...(i === selected ? { color: 'rgba(255,255,255,0.75)' } : {}) }}>{row.sub}</span>
                      )}
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
        <div style={s.footer}>
          <span><kbd style={s.kbdSmall}>&uarr;</kbd><kbd style={s.kbdSmall}>&darr;</kbd> move</span>
          <span><kbd style={s.kbdSmall}>&crarr;</kbd> open</span>
          {selectedNavRow && (
            <span><kbd style={s.kbdSmall}>Shift</kbd>+<kbd style={s.kbdSmall}>&crarr;</kbd> {selectedNavRow.pinned ? 'unpin' : 'pin'}</span>
          )}
          <span><kbd style={s.kbdSmall}>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(15,20,30,0.55)', zIndex: 1200,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 16px',
  },
  box: {
    width: '100%', maxWidth: 560, maxHeight: '70vh', background: '#fff', borderRadius: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  searchRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #eee' },
  searchIcon: { fontSize: 16 },
  input: { flex: 1, border: 'none', outline: 'none', fontSize: 16, color: PRIMARY, background: 'transparent', minWidth: 0 },
  kbd: { fontSize: 11, fontWeight: 700, color: TEXT_MUTED, background: '#f4f4f7', border: '1px solid #e5e5ea', borderRadius: 5, padding: '2px 6px', flexShrink: 0 },
  kbdSmall: { fontSize: 10, fontWeight: 700, color: TEXT_MUTED, background: '#f4f4f7', border: '1px solid #e5e5ea', borderRadius: 4, padding: '1px 5px', marginRight: 2 },
  empty: { padding: '28px 18px', textAlign: 'center' as const, color: TEXT_MUTED, fontSize: 14.5 },
  list: { listStyle: 'none', margin: 0, padding: '6px', overflowY: 'auto' as const, flex: 1 },
  groupLabel: { fontSize: 11.5, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, padding: '8px 10px 4px' },
  row: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '9px 12px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 14.5, color: PRIMARY, textAlign: 'left' as const,
  },
  rowActive: { background: PRIMARY, color: '#fff' },
  rowLabel: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  rowHint: { fontSize: 12.5, color: TEXT_MUTED, flexShrink: 0 },
  countBadge: { fontSize: 11.5, fontWeight: 700, color: '#fff', background: '#b91c1c', borderRadius: 8, padding: '1px 7px', flexShrink: 0 },
  countBadgeActive: { background: 'rgba(255,255,255,0.25)' },
  footer: { display: 'flex', gap: 16, padding: '9px 18px', borderTop: '1px solid #eee', fontSize: 12, color: TEXT_MUTED },
};
