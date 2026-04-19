import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { superAdminApi, devAdminApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { downloadInvoicePdf } from '../utils/invoicePdf';

interface Notification {
  id: string;
  type: 'BILLING' | 'TRANSACTION' | 'SCHEDULE' | 'REVENUE' | 'PLATFORM';
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  severity: 'info' | 'warning' | 'error' | 'success';
  // Billing fields
  period?: string;
  totalAmount?: number;
  paidAt?: string | null;
  // Schedule fields
  requestId?: string;
  storeId?: string;
  requestType?: string;
}

const SEVERITY_STYLES: Record<string, { border: string; bg: string; icon: string; color: string }> = {
  success: { border: '#2DC653', bg: '#f0fff4', icon: '✅', color: '#155724' },
  warning: { border: '#f59e0b', bg: '#fffbeb', icon: '⚠️', color: '#92400e' },
  error:   { border: '#E63946', bg: '#fff5f5', icon: '🚨', color: '#7f1d1d' },
  info:    { border: '#3b82f6', bg: '#eff6ff', icon: 'ℹ️', color: '#1e3a8a' },
};

const SCHEDULE_SEVERITY: Record<string, { border: string; bg: string; icon: string; color: string }> = {
  TIME_OFF: { border: '#f59e0b', bg: '#fffbeb', icon: '🏖️', color: '#92400e' },
  FILL_IN:  { border: '#3b82f6', bg: '#eff6ff', icon: '🔄', color: '#1e3a8a' },
};

type TabKey = 'all' | 'billing' | 'schedule' | 'revenue' | 'platform' | 'send';

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const { data: notifData, isLoading, isError } = useQuery({
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

  // ── Broadcast form state ──
  const [bTarget, setBTarget] = useState('ALL_CUSTOMERS');
  const [bStoreId, setBStoreId] = useState('');
  const [bTitle, setBTitle] = useState('');
  const [bBody, setBBody]   = useState('');

  const broadcastMutation = useMutation({
    mutationFn: () => superAdminApi.broadcast({ target: bTarget, storeId: bStoreId || undefined, title: bTitle, body: bBody }),
    onSuccess: (res) => {
      const { recipientCount } = res.data.data;
      toast.success(`Push sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}!`);
      setBTitle(''); setBBody('');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Broadcast failed'),
  });

  const allNotifications: Notification[] = notifData?.data?.data ?? [];
  const invoices: any[] = invoiceData?.data?.data ?? [];
  const unreadCount = allNotifications.filter((n) => !n.isRead).length;

  // DevAdmin tabs
  const revenueNotifs  = allNotifications.filter((n) => n.type === 'REVENUE');
  const platformNotifs = allNotifications.filter((n) => n.type === 'PLATFORM');
  const scheduleNotifsD = allNotifications.filter((n) => n.type === 'SCHEDULE');
  const revenueUnread  = revenueNotifs.filter((n) => !n.isRead).length;
  const platformUnread = platformNotifs.filter((n) => !n.isRead).length;
  const scheduleUnreadD = scheduleNotifsD.filter((n) => !n.isRead).length;

  // SuperAdmin tabs
  const billingNotifs  = allNotifications.filter((n) => n.type === 'BILLING' || n.type === 'TRANSACTION');
  const scheduleNotifs = allNotifications.filter((n) => n.type === 'SCHEDULE');
  const billingUnread  = billingNotifs.filter((n) => !n.isRead).length;
  const scheduleUnread = scheduleNotifs.filter((n) => !n.isRead).length;

  const displayed = isDevAdmin
    ? (activeTab === 'revenue'   ? revenueNotifs
     : activeTab === 'platform'  ? platformNotifs
     : activeTab === 'schedule'  ? scheduleNotifsD
     : allNotifications)
    : (activeTab === 'billing'   ? billingNotifs
     : activeTab === 'schedule'  ? scheduleNotifs
     : allNotifications);

  function handleDownloadPdf(period: string) {
    const invoice = invoices.find((inv) => inv.period === period);
    if (!invoice) { alert('Invoice data not loaded yet. Please visit the Billing tab first.'); return; }
    downloadInvoicePdf(invoice);
  }

  const DEV_TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'all',      label: 'All',          badge: unreadCount },
    { key: 'revenue',  label: '💰 Revenue',    badge: revenueUnread },
    { key: 'platform', label: '⚙️ Platform',   badge: platformUnread },
    { key: 'schedule', label: '📅 Schedule',   badge: scheduleUnreadD },
    { key: 'send',     label: '📢 Send Push' },
  ];

  const SUPER_TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'all',      label: 'All',           badge: unreadCount },
    { key: 'billing',  label: '💳 Billing',    badge: billingUnread },
    { key: 'schedule', label: '📅 Schedule',   badge: scheduleUnread },
    { key: 'send',     label: '📢 Send Push' },
  ];

  const TABS = isDevAdmin ? DEV_TABS : SUPER_TABS;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>
            Notifications
            {unreadCount > 0 && <span style={s.badge}>{unreadCount}</span>}
          </h1>
          <p style={s.subtitle}>{isDevAdmin ? 'Revenue, platform health, and schedule alerts' : 'Billing alerts, schedule requests, and activity updates'}</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabRow}>
        {TABS.map((t) => (
          <button
            key={t.key}
            style={{ ...s.tab, ...(activeTab === t.key ? s.tabActive : {}) }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {(t.badge ?? 0) > 0 && (
              <span style={{ ...s.tabBadge, ...(activeTab === t.key ? s.tabBadgeActive : {}) }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

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
              ...(broadcastMutation.isPending || !bTitle.trim() || !bBody.trim() || ((bTarget === 'STORE_CUSTOMERS' || bTarget === 'STORE_STAFF') && !bStoreId)
                ? sp.sendBtnDisabled : {}),
            }}
            disabled={broadcastMutation.isPending || !bTitle.trim() || !bBody.trim() || ((bTarget === 'STORE_CUSTOMERS' || bTarget === 'STORE_STAFF') && !bStoreId)}
            onClick={() => broadcastMutation.mutate()}
          >
            {broadcastMutation.isPending ? 'Sending…' : '📤 Send Push Notification'}
          </button>

          <div style={sp.hint}>
            Recipients will receive both a push notification on their device and an in-app inbox message. Only active users with devices registered will receive push.
          </div>
        </div>
      ) : isLoading ? (
        <div style={s.empty}>Loading notifications…</div>
      ) : isError ? (
        <div style={{ ...s.empty, color: '#E63946' }}>Failed to load notifications. Please refresh the page.</div>
      ) : displayed.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>{activeTab === 'schedule' ? '📅' : '✅'}</div>
          <div style={s.emptyTitle}>
            {activeTab === 'schedule' ? 'No pending requests' : 'All clear!'}
          </div>
          <div style={s.emptyText}>
            {activeTab === 'schedule'
              ? 'No pending time-off or fill-in requests from employees.'
              : 'No notifications at this time. You\'ll see billing alerts and activity updates here.'}
          </div>
        </div>
      ) : (
        <div style={s.list}>
          {displayed.map((n) => {
            const isSchedule = n.type === 'SCHEDULE';
            const sv = isSchedule
              ? (SCHEDULE_SEVERITY[n.requestType ?? ''] ?? SEVERITY_STYLES.info)
              : (SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.info);
            const isPaidBilling = n.severity === 'success' && (n.type === 'BILLING' || n.type === 'REVENUE') && n.period;

            return (
              <div key={n.id} style={{ ...s.card, borderLeft: `4px solid ${sv.border}`, background: sv.bg }}>
                <div style={s.cardTop}>
                  <div style={s.cardLeft}>
                    <span style={s.icon}>{sv.icon}</span>
                    <div>
                      <div style={s.cardTitle}>{n.title}</div>
                      <div style={{ ...s.typeTag, color: sv.color }}>
                        {isSchedule
                          ? (n.requestType === 'TIME_OFF' ? '🏖️ Time Off Request' : '🔄 Extra Shift Request')
                          : n.type === 'REVENUE'   ? '💰 Revenue'
                          : n.type === 'PLATFORM'  ? '⚙️ Platform'
                          : n.type === 'BILLING'   ? '💳 Billing'
                          : '🧾 Transaction'}
                      </div>
                    </div>
                  </div>
                  <div style={s.cardActions}>
                    {isSchedule && (
                      <button
                        style={s.actionBtn}
                        onClick={() => navigate('/scheduling')}
                      >
                        Take Action →
                      </button>
                    )}
                    {isPaidBilling && !isDevAdmin && (
                      <button style={s.pdfBtn} onClick={() => handleDownloadPdf(n.period!)}>
                        📄 Download Invoice
                      </button>
                    )}
                    {n.type === 'REVENUE' && n.severity === 'warning' && (
                      <button style={s.actionBtn} onClick={() => navigate('/billing')}>
                        Mark Paid →
                      </button>
                    )}
                    <div style={s.time}>
                      {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                <div style={{ ...s.message, color: sv.color }}>{n.message}</div>
                {isPaidBilling && n.paidAt && (
                  <div style={{ ...s.paidStamp, color: sv.color }}>
                    Paid on {new Date(n.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab !== 'send' && (
        <div style={s.infoBox}>
          <strong>About notifications:</strong> Billing alerts appear when invoices are due or paid. Schedule notifications appear when employees submit time-off or fill-in requests.
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 800, margin: '0 auto', padding: '32px 24px' },
  header: { marginBottom: 20 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557', display: 'flex', alignItems: 'center', gap: 10 },
  subtitle: { margin: '4px 0 0', color: '#6c757d', fontSize: 14 },
  badge: { background: '#E63946', color: '#fff', borderRadius: 12, padding: '2px 9px', fontSize: 13, fontWeight: 700 },

  tabRow: { display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e9ecef', paddingBottom: 0 },
  tab: {
    background: 'none', border: 'none', padding: '10px 18px', fontSize: 14, fontWeight: 600,
    color: '#6c757d', cursor: 'pointer', borderRadius: '8px 8px 0 0',
    display: 'flex', alignItems: 'center', gap: 6,
    borderBottom: '2px solid transparent', marginBottom: -2,
    transition: 'color 0.15s',
  },
  tabActive: { color: '#1D3557', borderBottom: '2px solid #1D3557', background: '#f8f9fb' },
  tabBadge: {
    background: '#e9ecef', color: '#6c757d', borderRadius: 10,
    padding: '1px 7px', fontSize: 11, fontWeight: 700,
  },
  tabBadgeActive: { background: '#E63946', color: '#fff' },

  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: { borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardLeft: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  icon: { fontSize: 22, lineHeight: 1, marginTop: 1 },
  cardTitle: { fontWeight: 700, fontSize: 15, color: '#1D3557', marginBottom: 2 },
  typeTag: { fontSize: 11, fontWeight: 600 },
  time: { fontSize: 12, color: '#6c757d', whiteSpace: 'nowrap' },
  message: { fontSize: 13, lineHeight: 1.6, marginLeft: 34 },
  paidStamp: { fontSize: 11, fontWeight: 600, marginLeft: 34, marginTop: 6 },
  cardActions: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 16 },

  actionBtn: {
    background: '#1D3557', border: 'none', color: '#fff',
    borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  pdfBtn: {
    background: '#fff', border: '1.5px solid #2DC653', color: '#155724',
    borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },

  empty: { textAlign: 'center', padding: '60px 0', color: '#6c757d', fontSize: 15 },
  emptyState: { textAlign: 'center', padding: '80px 0' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6c757d', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 },

  infoBox: { marginTop: 28, background: '#f8f9fb', border: '1px solid #e9ecef', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#6c757d', lineHeight: 1.6 },
};

const sp: Record<string, React.CSSProperties> = {
  panel: { maxWidth: 560 },
  panelHeader: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, padding: '20px 24px', background: 'linear-gradient(135deg, #1D3557 0%, #457B9D 100%)', borderRadius: 16 },
  panelIcon: { fontSize: 40, lineHeight: 1 },
  panelTitle: { fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 },
  panelSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  field: { marginBottom: 18 },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: '#1D3557', marginBottom: 6 },
  charCount: { fontWeight: 400, color: '#6c757d', fontSize: 12 },
  select: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #dee2e6', fontSize: 14, color: '#1D3557', background: '#fff', cursor: 'pointer' },
  input: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #dee2e6', fontSize: 14, color: '#1D3557', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #dee2e6', fontSize: 14, color: '#1D3557', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  preview: { marginBottom: 20, padding: '14px 18px', background: '#f8f9fb', borderRadius: 12, border: '1px solid #e9ecef' },
  previewLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 },
  previewCard: { background: '#fff', borderRadius: 10, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #1D3557' },
  previewTitle: { fontSize: 15, fontWeight: 800, color: '#1D3557', marginBottom: 4 },
  previewBody: { fontSize: 14, color: '#495057', lineHeight: 1.5 },
  sendBtn: { width: '100%', padding: '14px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' },
  sendBtnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  hint: { marginTop: 16, fontSize: 12, color: '#6c757d', lineHeight: 1.6 },
};
