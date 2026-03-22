import { useQuery } from '@tanstack/react-query';
import { superAdminApi } from '../services/api';

interface Notification {
  id: string;
  type: 'BILLING' | 'TRANSACTION';
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  severity: 'info' | 'warning' | 'error';
}

const SEVERITY_STYLES: Record<string, { border: string; bg: string; icon: string; color: string }> = {
  warning: { border: '#f59e0b', bg: '#fffbeb', icon: '⚠️', color: '#92400e' },
  error:   { border: '#E63946', bg: '#fff5f5', icon: '🚨', color: '#7f1d1d' },
  info:    { border: '#3b82f6', bg: '#eff6ff', icon: 'ℹ️', color: '#1e3a8a' },
};

const TYPE_LABELS: Record<string, string> = {
  BILLING: '💳 Billing',
  TRANSACTION: '🧾 Transaction',
};

export default function Notifications() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['super-admin-notifications'],
    queryFn: () => superAdminApi.getNotifications(),
    refetchInterval: 60_000, // refresh every minute
  });

  const notifications: Notification[] = data?.data?.data ?? [];
  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>
            Notifications
            {hasUnread && <span style={s.badge}>{notifications.length}</span>}
          </h1>
          <p style={s.subtitle}>Billing alerts and activity updates for your stores</p>
        </div>
      </div>

      {isLoading ? (
        <div style={s.empty}>Loading notifications…</div>
      ) : isError ? (
        <div style={{ ...s.empty, color: '#E63946' }}>Failed to load notifications. Please refresh the page.</div>
      ) : notifications.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>✅</div>
          <div style={s.emptyTitle}>All clear!</div>
          <div style={s.emptyText}>No notifications at this time. You'll see billing alerts and activity updates here.</div>
        </div>
      ) : (
        <div style={s.list}>
          {notifications.map((n) => {
            const sv = SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.info;
            return (
              <div key={n.id} style={{ ...s.card, borderLeft: `4px solid ${sv.border}`, background: sv.bg }}>
                <div style={s.cardTop}>
                  <div style={s.cardLeft}>
                    <span style={s.icon}>{sv.icon}</span>
                    <div>
                      <div style={s.cardTitle}>{n.title}</div>
                      <div style={{ ...s.typeTag, color: sv.color }}>{TYPE_LABELS[n.type] ?? n.type}</div>
                    </div>
                  </div>
                  <div style={s.time}>
                    {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ ...s.message, color: sv.color }}>{n.message}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={s.infoBox}>
        <strong>About notifications:</strong> These alerts are generated automatically from your billing records and transaction activity. Billing notifications appear when a new invoice is ready or payment is outstanding.
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 800, margin: '0 auto', padding: '32px 24px' },
  header: { marginBottom: 28 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557', display: 'flex', alignItems: 'center', gap: 10 },
  subtitle: { margin: '4px 0 0', color: '#6c757d', fontSize: 14 },
  badge: {
    background: '#E63946', color: '#fff', borderRadius: 12,
    padding: '2px 9px', fontSize: 13, fontWeight: 700,
  },

  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    borderRadius: 12, padding: '18px 20px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardLeft: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  icon: { fontSize: 22, lineHeight: 1, marginTop: 1 },
  cardTitle: { fontWeight: 700, fontSize: 15, color: '#1D3557', marginBottom: 2 },
  typeTag: { fontSize: 11, fontWeight: 600 },
  time: { fontSize: 12, color: '#6c757d', flexShrink: 0, marginLeft: 16 },
  message: { fontSize: 13, lineHeight: 1.6, marginLeft: 34 },

  empty: { textAlign: 'center', padding: '60px 0', color: '#6c757d', fontSize: 15 },
  emptyState: { textAlign: 'center', padding: '80px 0' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6c757d', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 },

  infoBox: { marginTop: 28, background: '#f8f9fb', border: '1px solid #e9ecef', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#6c757d', lineHeight: 1.6 },
};
