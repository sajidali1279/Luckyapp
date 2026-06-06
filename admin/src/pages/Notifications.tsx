import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { superAdminApi, devAdminApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { downloadInvoicePdf } from '../utils/invoicePdf';

interface Notification {
  id: string;
  type: 'BILLING' | 'TRANSACTION' | 'SCHEDULE' | 'REVENUE' | 'PLATFORM';
  category: 'billing' | 'transactions' | 'scheduling' | 'customers';
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  severity: 'info' | 'warning' | 'error' | 'success';
  actionUrl?: string;
  actionLabel?: string;
  period?: string;
  totalAmount?: number;
  paidAt?: string | null;
  requestId?: string;
  storeId?: string;
  requestType?: string;
}

// Severity color palette
const SEV: Record<string, { border: string; readBg: string; unreadBg: string; text: string; btnBorder: string }> = {
  success: { border: '#10b981', readBg: '#fff',    unreadBg: '#f0fdf4', text: '#065f46', btnBorder: '#10b981' },
  warning: { border: '#f59e0b', readBg: '#fff',    unreadBg: '#fffbeb', text: '#92400e', btnBorder: '#f59e0b' },
  error:   { border: '#ef4444', readBg: '#fff',    unreadBg: '#fef2f2', text: '#7f1d1d', btnBorder: '#ef4444' },
  info:    { border: '#3b82f6', readBg: '#fff',    unreadBg: '#eff6ff', text: '#1e3a8a', btnBorder: '#3b82f6' },
};

// Category chip styles
const CAT: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  billing:      { label: 'Billing',      icon: '💳', color: '#1e3a8a', bg: '#dbeafe' },
  transactions: { label: 'Transactions', icon: '🧾', color: '#7c2d12', bg: '#ffedd5' },
  scheduling:   { label: 'Scheduling',   icon: '📅', color: '#065f46', bg: '#d1fae5' },
  customers:    { label: 'Customers',    icon: '🏪', color: '#4c1d95', bg: '#ede9fe' },
};

// Schedule sub-type icon override
const SCHEDULE_ICON: Record<string, string> = {
  TIME_OFF: '🏖️',
  FILL_IN:  '🔄',
};

type TabKey = 'all' | 'billing' | 'transactions' | 'scheduling' | 'customers' | 'send';

// Fallback category derivation for old API responses without the category field
function deriveCategory(n: any): Notification['category'] {
  switch (n.type) {
    case 'BILLING':     return 'billing';
    case 'REVENUE':     return 'billing';
    case 'TRANSACTION': return 'transactions';
    case 'SCHEDULE':    return 'scheduling';
    case 'PLATFORM':
      if (n.title?.toLowerCase().includes('customer')) return 'customers';
      return 'transactions';
    default:            return 'billing';
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  // Local read tracking — persisted in localStorage across sessions
  const [localRead, setLocalRead] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('admin-notif-read-v2');
      return new Set(s ? JSON.parse(s) : []);
    } catch { return new Set(); }
  });

  function persistRead(next: Set<string>) {
    try { localStorage.setItem('admin-notif-read-v2', JSON.stringify([...next])); } catch {}
  }

  function markRead(ids: string[]) {
    setLocalRead(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      persistRead(next);
      return next;
    });
  }

  function markAllRead() {
    const next = new Set([...localRead, ...allNotifications.map(n => n.id)]);
    setLocalRead(next);
    persistRead(next);
  }

  const { data: notifData, isLoading, isError, refetch } = useQuery({
    queryKey: isDevAdmin ? ['dev-admin-notifications'] : ['super-admin-notifications'],
    queryFn: () => isDevAdmin ? devAdminApi.getNotifications() : superAdminApi.getNotifications(),
    enabled: !!user && (isDevAdmin || user?.role === 'SUPER_ADMIN'),
    refetchInterval: 60_000,
    retry: false,
  });

  const { data: invoiceData } = useQuery({
    queryKey: ['super-admin-invoices'],
    queryFn: () => superAdminApi.getInvoices(),
    staleTime: 5 * 60_000,
    enabled: !isDevAdmin,
  });

  const { data: storesData } = useQuery({
    queryKey: ['stores-list'],
    queryFn: () => storesApi.getAll(),
    staleTime: 10 * 60_000,
  });
  const stores: { id: string; name: string; city: string }[] = storesData?.data?.data ?? [];

  // Normalize notifications — derive category from type if backend hasn't deployed yet
  const rawNotifications: Notification[] = (notifData?.data?.data ?? []).map((n: any) => ({
    ...n,
    category: n.category ?? deriveCategory(n),
  }));
  const invoices: any[] = invoiceData?.data?.data ?? [];

  // In-page filter state
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>('');

  function isEffectivelyRead(n: Notification) { return n.isRead || localRead.has(n.id); }
  function unreadCount(list: Notification[]) { return list.filter(n => !isEffectivelyRead(n)).length; }

  const allNotifications = rawNotifications;
  const totalUnread = unreadCount(allNotifications);

  function byCategory(tab: TabKey) {
    if (tab === 'all' || tab === 'send') return allNotifications;
    return allNotifications.filter(n => n.category === tab);
  }

  // Apply tab + inline filters
  const tabFiltered = byCategory(activeTab);
  const displayed = tabFiltered
    .filter(n => !unreadOnly || !isEffectivelyRead(n))
    .filter(n => !severityFilter || n.severity === severityFilter);

  const filtersActive = unreadOnly || !!severityFilter;

  function clearFilters() { setUnreadOnly(false); setSeverityFilter(''); }

  function handleNavigate(n: Notification) {
    markRead([n.id]);
    if (!n.actionUrl) return;
    // Pass pre-filter state for transaction deep-links
    if (n.type === 'TRANSACTION') {
      navigate(n.actionUrl, { state: { statusFilter: 'REJECTED' } });
    } else {
      navigate(n.actionUrl);
    }
  }

  function handleDownloadPdf(n: Notification) {
    markRead([n.id]);
    const invoice = invoices.find(inv => inv.period === n.period);
    if (!invoice) { toast.error('Invoice data not loaded. Visit the Billing page first.'); return; }
    downloadInvoicePdf(invoice);
  }

  // ── Broadcast form state ──
  const [bTarget, setBTarget] = useState('ALL_CUSTOMERS');
  const [bStoreId, setBStoreId] = useState('');
  const [bTitle, setBTitle] = useState('');
  const [bBody, setBBody] = useState('');

  const broadcastMutation = useMutation({
    mutationFn: () => superAdminApi.broadcast({ target: bTarget, storeId: bStoreId || undefined, title: bTitle, body: bBody }),
    onSuccess: (res) => {
      const { recipientCount } = res.data.data;
      toast.success(`Push sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}!`);
      setBTitle(''); setBBody('');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Broadcast failed'),
  });

  // ── Tab definitions ──
  const SUPER_TABS: { key: TabKey; label: string }[] = [
    { key: 'all',          label: 'All' },
    { key: 'billing',      label: '💳 Billing' },
    { key: 'transactions', label: '🧾 Transactions' },
    { key: 'scheduling',   label: '📅 Scheduling' },
    { key: 'send',         label: '📢 Send Push' },
  ];
  const DEV_TABS: { key: TabKey; label: string }[] = [
    { key: 'all',          label: 'All' },
    { key: 'billing',      label: '💰 Revenue' },
    { key: 'transactions', label: '📊 Transactions' },
    { key: 'customers',    label: '🏪 Customers' },
    { key: 'scheduling',   label: '📅 Scheduling' },
    { key: 'send',         label: '📢 Send Push' },
  ];
  const TABS = isDevAdmin ? DEV_TABS : SUPER_TABS;

  const EMPTY_STATES: Record<TabKey, { icon: string; title: string; text: string }> = {
    all:          { icon: '✅', title: 'All clear!',              text: 'No notifications right now. Billing alerts and activity updates will appear here.' },
    billing:      { icon: '💳', title: 'No billing alerts',       text: 'All invoices are settled and up to date.' },
    transactions: { icon: '🧾', title: 'No transaction alerts',   text: 'No rejected transactions to review — everything looks good.' },
    scheduling:   { icon: '📅', title: 'No pending requests',     text: 'No pending time-off or fill-in requests from employees.' },
    customers:    { icon: '🏪', title: 'No customer alerts',      text: 'Customer activity updates will appear here.' },
    send:         { icon: '',   title: '',                         text: '' },
  };

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>
            Notifications
            {totalUnread > 0 && <span style={s.badge}>{totalUnread}</span>}
          </h1>
          <p style={s.subtitle}>
            {isDevAdmin
              ? 'Revenue, platform health, and schedule alerts'
              : 'Billing, transaction alerts, and schedule requests'}
          </p>
        </div>
        <div style={s.headerActions}>
          {totalUnread > 0 && (
            <button style={s.markAllBtn} onClick={markAllRead}>
              ✓ Mark all read
            </button>
          )}
          <button style={s.refreshBtn} onClick={() => refetch()} title="Refresh notifications">
            ↻
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabRow}>
        {TABS.map(t => {
          const cnt = t.key !== 'send' ? unreadCount(byCategory(t.key)) : 0;
          return (
            <button
              key={t.key}
              style={{ ...s.tab, ...(activeTab === t.key ? s.tabActive : {}) }}
              onClick={() => { setActiveTab(t.key); setSeverityFilter(''); setUnreadOnly(false); }}
            >
              {t.label}
              {cnt > 0 && (
                <span style={{ ...s.tabBadge, ...(activeTab === t.key ? s.tabBadgeActive : {}) }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Inline Filters (hidden on Send Push tab) ── */}
      {activeTab !== 'send' && (
        <div style={s.filterBar}>
          <div style={s.filterGroup}>
            <span style={s.filterLabel}>Severity</span>
            {(['', 'error', 'warning', 'info', 'success'] as const).map(sv => (
              <button
                key={sv || 'all'}
                style={{
                  ...s.filterPill,
                  ...(severityFilter === sv ? s.filterPillActive : {}),
                  ...(sv === 'error'   ? { borderColor: '#ef4444', ...(severityFilter === sv ? { background: '#ef4444', color: '#fff' } : { color: '#ef4444' }) } : {}),
                  ...(sv === 'warning' ? { borderColor: '#f59e0b', ...(severityFilter === sv ? { background: '#f59e0b', color: '#fff' } : { color: '#b45309' }) } : {}),
                  ...(sv === 'info'    ? { borderColor: '#3b82f6', ...(severityFilter === sv ? { background: '#3b82f6', color: '#fff' } : { color: '#1d4ed8' }) } : {}),
                  ...(sv === 'success' ? { borderColor: '#10b981', ...(severityFilter === sv ? { background: '#10b981', color: '#fff' } : { color: '#065f46' }) } : {}),
                }}
                onClick={() => setSeverityFilter(sv)}
              >
                {sv === ''        ? 'All'
                : sv === 'error'   ? '🚨 Error'
                : sv === 'warning' ? '⚠️ Warning'
                : sv === 'info'    ? 'ℹ️ Info'
                :                   '✅ Success'}
              </button>
            ))}
          </div>

          <div style={s.filterGroup}>
            <button
              style={{ ...s.filterPill, ...(unreadOnly ? { ...s.filterPillActive, background: '#1D3557', borderColor: '#1D3557', color: '#fff' } : {}) }}
              onClick={() => setUnreadOnly(v => !v)}
            >
              🔵 Unread only
              {unreadOnly && totalUnread > 0 && <span style={s.filterCount}>{totalUnread}</span>}
            </button>
            {filtersActive && (
              <button style={s.clearBtn} onClick={clearFilters}>✕ Clear</button>
            )}
          </div>
        </div>
      )}

      {/* Result count when filtered */}
      {activeTab !== 'send' && filtersActive && !isLoading && !isError && (
        <div style={s.resultCount}>
          Showing {displayed.length} of {tabFiltered.length} notification{tabFiltered.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* ── Send Push Panel ── */}
      {activeTab === 'send' ? (
        <div style={sp.panel}>
          <div style={sp.panelHeader}>
            <div style={sp.panelIcon}>📢</div>
            <div>
              <div style={sp.panelTitle}>Send Push Notification</div>
              <div style={sp.panelSub}>Compose a message and send it instantly to customers or staff</div>
            </div>
          </div>

          <div style={sp.field}>
            <label style={sp.label}>Audience</label>
            <select style={sp.select} value={bTarget} onChange={(e) => { setBTarget(e.target.value); setBStoreId(''); }}>
              <option value="ALL_CUSTOMERS">👥 All Customers (chain-wide)</option>
              <option value="STORE_CUSTOMERS">🏪 Customers at a Specific Store</option>
              <option value="ALL_STAFF">👔 All Staff (chain-wide)</option>
              <option value="STORE_STAFF">🏪 Staff at a Specific Store</option>
            </select>
          </div>

          {(bTarget === 'STORE_CUSTOMERS' || bTarget === 'STORE_STAFF') && (
            <div style={sp.field}>
              <label style={sp.label}>Store</label>
              <select style={sp.select} value={bStoreId} onChange={(e) => setBStoreId(e.target.value)}>
                <option value="">— Select a store —</option>
                {stores.map((st) => (
                  <option key={st.id} value={st.id}>{st.name} — {st.city}</option>
                ))}
              </select>
            </div>
          )}

          <div style={sp.field}>
            <label style={sp.label}>Title <span style={sp.charCount}>{bTitle.length}/65</span></label>
            <input
              style={sp.input}
              placeholder="e.g. 🎉 Weekend Special at Lucky Stop!"
              value={bTitle}
              maxLength={65}
              onChange={(e) => setBTitle(e.target.value)}
            />
          </div>

          <div style={sp.field}>
            <label style={sp.label}>Message <span style={sp.charCount}>{bBody.length}/200</span></label>
            <textarea
              style={sp.textarea}
              placeholder="e.g. Get double points on all gas purchases this Saturday and Sunday only. Visit any Lucky Stop location to redeem!"
              value={bBody}
              maxLength={200}
              rows={4}
              onChange={(e) => setBBody(e.target.value)}
            />
          </div>

          {bTitle && bBody && (
            <div style={sp.preview}>
              <div style={sp.previewLabel}>Preview</div>
              <div style={sp.previewCard}>
                <div style={sp.previewTitle}>{bTitle}</div>
                <div style={sp.previewBody}>{bBody}</div>
              </div>
            </div>
          )}

          <button
            style={{
              ...sp.sendBtn,
              ...((broadcastMutation.isPending || !bTitle.trim() || !bBody.trim() ||
                ((bTarget === 'STORE_CUSTOMERS' || bTarget === 'STORE_STAFF') && !bStoreId))
                ? sp.sendBtnDisabled : {}),
            }}
            disabled={broadcastMutation.isPending || !bTitle.trim() || !bBody.trim() ||
              ((bTarget === 'STORE_CUSTOMERS' || bTarget === 'STORE_STAFF') && !bStoreId)}
            onClick={() => broadcastMutation.mutate()}
          >
            {broadcastMutation.isPending ? 'Sending…' : '📤 Send Push Notification'}
          </button>

          <div style={sp.hint}>
            Recipients will receive both a push notification on their device and an in-app inbox message.
            Only users with a registered device token will receive push alerts.
          </div>
        </div>

      ) : isLoading ? (
        <div style={s.empty}>Loading notifications…</div>

      ) : isError ? (
        <div style={{ ...s.empty, color: '#ef4444' }}>Failed to load notifications. Please refresh.</div>

      ) : displayed.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>{filtersActive ? '🔍' : EMPTY_STATES[activeTab].icon}</div>
          <div style={s.emptyTitle}>{filtersActive ? 'No matches' : EMPTY_STATES[activeTab].title}</div>
          <div style={s.emptyText}>
            {filtersActive
              ? <>No notifications match your current filters. <button style={s.emptyLink} onClick={clearFilters}>Clear filters</button></>
              : EMPTY_STATES[activeTab].text}
          </div>
        </div>

      ) : (
        <div style={s.list}>
          {displayed.map(n => {
            const sev   = SEV[n.severity] ?? SEV.info;
            const cat   = CAT[n.category] ?? CAT.billing;
            const read  = isEffectivelyRead(n);
            const isPaidBilling = n.severity === 'success' && !!n.period && !isDevAdmin;
            const schedIcon = n.requestType ? (SCHEDULE_ICON[n.requestType] ?? cat.icon) : cat.icon;
            const cardIcon = n.type === 'SCHEDULE' ? schedIcon : cat.icon;

            return (
              <div
                key={n.id}
                style={{
                  ...s.card,
                  borderLeft: `4px solid ${sev.border}`,
                  background: read ? sev.readBg : sev.unreadBg,
                  cursor: n.actionUrl ? 'pointer' : 'default',
                  opacity: read ? 0.88 : 1,
                }}
                onClick={() => n.actionUrl && handleNavigate(n)}
              >
                {/* Top row: icon + title + category chip | time + unread dot */}
                <div style={s.cardTop}>
                  <div style={s.cardLeft}>
                    <span style={s.cardIcon}>{cardIcon}</span>
                    <div>
                      <div style={{ ...s.cardTitle, color: read ? '#374151' : '#111827' }}>
                        {n.title}
                        {!read && <span style={s.unreadDot} />}
                      </div>
                      <span style={{ ...s.categoryChip, color: cat.color, background: cat.bg }}>
                        {cat.label}
                        {n.type === 'SCHEDULE' && n.requestType && (
                          <> · {n.requestType === 'TIME_OFF' ? 'Time Off' : 'Extra Shift'}</>
                        )}
                      </span>
                    </div>
                  </div>
                  <div style={s.timeStamp}>{timeAgo(n.createdAt)}</div>
                </div>

                {/* Message */}
                <div style={{ ...s.message, color: sev.text }}>{n.message}</div>

                {/* Paid stamp */}
                {isPaidBilling && n.paidAt && (
                  <div style={s.paidStamp}>
                    ✓ Paid on {new Date(n.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                )}

                {/* Action row — stop propagation so card click doesn't double-fire */}
                <div style={s.actionRow} onClick={e => e.stopPropagation()}>
                  {n.actionUrl && (
                    <button
                      style={{ ...s.actionBtn, borderColor: sev.btnBorder, color: sev.text }}
                      onClick={() => handleNavigate(n)}
                    >
                      {n.actionLabel ?? 'View'} →
                    </button>
                  )}
                  {isPaidBilling && (
                    <button style={s.pdfBtn} onClick={() => handleDownloadPdf(n)}>
                      📄 Invoice PDF
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px', maxWidth: 800 },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    margin: 0, fontSize: 26, fontWeight: 800, color: '#111827',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  subtitle: { margin: '4px 0 0', color: '#6b7280', fontSize: 14 },
  badge: {
    background: '#ef4444', color: '#fff',
    borderRadius: 12, padding: '2px 9px', fontSize: 14, fontWeight: 700,
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  markAllBtn: {
    background: 'none', border: '1.5px solid #d1d5db', color: '#6b7280',
    borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  refreshBtn: {
    background: 'none', border: '1.5px solid #d1d5db', color: '#374151',
    borderRadius: 8, padding: '7px 12px', fontSize: 17, fontWeight: 700, cursor: 'pointer',
    lineHeight: 1,
  },

  tabRow: {
    display: 'flex', gap: 4, flexWrap: 'wrap',
    marginBottom: 24, borderBottom: '2px solid #e5e7eb', paddingBottom: 0,
  },
  tab: {
    background: 'none', border: 'none', padding: '9px 16px',
    fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer',
    borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: 6,
    borderBottom: '2px solid transparent', marginBottom: -2, transition: 'color 0.15s',
  },
  tabActive: { color: '#1D3557', borderBottom: '2px solid #1D3557', background: '#f8faff' },
  tabBadge: {
    background: '#e5e7eb', color: '#6b7280',
    borderRadius: 10, padding: '1px 7px', fontSize: 12, fontWeight: 700,
  },
  tabBadgeActive: { background: '#ef4444', color: '#fff' },

  list: { display: 'flex', flexDirection: 'column', gap: 12 },

  card: {
    borderRadius: 14, padding: '18px 20px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 10,
    transition: 'box-shadow 0.15s',
  },
  cardTop: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', gap: 12,
  },
  cardLeft: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  cardIcon: { fontSize: 24, lineHeight: 1, flexShrink: 0, marginTop: 1 },
  cardTitle: {
    fontSize: 15, fontWeight: 700, marginBottom: 5,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  unreadDot: {
    display: 'inline-block', width: 8, height: 8,
    borderRadius: '50%', background: '#3b82f6', flexShrink: 0,
  },
  categoryChip: {
    display: 'inline-block',
    fontSize: 12, fontWeight: 700,
    padding: '3px 9px', borderRadius: 6,
  },
  timeStamp: { fontSize: 13, color: '#9ca3af', flexShrink: 0, paddingTop: 2 },

  message: { fontSize: 14, lineHeight: 1.65, paddingLeft: 36 },
  paidStamp: { fontSize: 13, fontWeight: 600, color: '#065f46', paddingLeft: 36 },

  actionRow: { display: 'flex', gap: 10, paddingLeft: 36, flexWrap: 'wrap' },
  actionBtn: {
    background: '#fff', border: '1.5px solid',
    borderRadius: 8, padding: '6px 14px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  pdfBtn: {
    background: '#fff', border: '1.5px solid #10b981', color: '#065f46',
    borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },

  filterBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 12,
    padding: '12px 16px', marginBottom: 16,
    background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb',
  },
  filterGroup: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  filterLabel: { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 },
  filterPill: {
    background: '#fff', border: '1.5px solid #d1d5db', color: '#374151',
    borderRadius: 20, padding: '5px 12px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
  },
  filterPillActive: { background: '#1D3557', borderColor: '#1D3557', color: '#fff' },
  filterCount: {
    marginLeft: 6, background: 'rgba(255,255,255,0.3)',
    borderRadius: 10, padding: '1px 6px', fontSize: 12,
  },
  clearBtn: {
    background: 'none', border: '1.5px solid #fca5a5', color: '#dc2626',
    borderRadius: 20, padding: '5px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  resultCount: { fontSize: 13, color: '#6b7280', marginBottom: 12, paddingLeft: 4 },

  empty: { textAlign: 'center', padding: '60px 0', color: '#6b7280', fontSize: 15 },
  emptyState: { textAlign: 'center', padding: '80px 0' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6b7280', lineHeight: 1.6 },
  emptyLink: { background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: 0 },
};

const sp: Record<string, React.CSSProperties> = {
  panel: { maxWidth: 560 },
  panelHeader: {
    display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28,
    padding: '20px 24px',
    background: 'linear-gradient(135deg, #1D3557 0%, #457B9D 100%)',
    borderRadius: 16,
  },
  panelIcon: { fontSize: 40, lineHeight: 1 },
  panelTitle: { fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 },
  panelSub: { fontSize: 15, color: 'rgba(255,255,255,0.7)' },
  field: { marginBottom: 18 },
  label: { display: 'block', fontSize: 14, fontWeight: 700, color: '#1D3557', marginBottom: 6 },
  charCount: { fontWeight: 400, color: '#6b7280', fontSize: 13 },
  select: {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1.5px solid #d1d5db', fontSize: 14, color: '#111827',
    background: '#fff', cursor: 'pointer',
  },
  input: {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1.5px solid #d1d5db', fontSize: 14, color: '#111827',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1.5px solid #d1d5db', fontSize: 14, color: '#111827',
    resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'inherit',
  },
  preview: {
    marginBottom: 20, padding: '14px 18px',
    background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb',
  },
  previewLabel: {
    fontSize: 12, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
  },
  previewCard: {
    background: '#fff', borderRadius: 10, padding: '14px 16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #1D3557',
  },
  previewTitle: { fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 4 },
  previewBody: { fontSize: 14, color: '#374151', lineHeight: 1.5 },
  sendBtn: {
    width: '100%', padding: '14px',
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
  },
  sendBtnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  hint: { marginTop: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.6 },
};
