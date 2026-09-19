import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlobalSearch from '../components/GlobalSearch';
import NoticeBanner, { usePinnedNotice } from '../components/NoticeBanner';
import { useAuthStore } from '../store/authStore';
import { handleGlowMove } from '../lib/motion';
import { s, readSetting, writeSetting } from './dashboard/shared';
import { useStores } from './dashboard/queries';
import AttentionInbox from './dashboard/Inbox';
import OperationsView from './dashboard/Operations';
import BusinessView from './dashboard/Business';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function QuickActions({ isDevAdmin }: { isDevAdmin: boolean }) {
  const navigate = useNavigate();
  const actions = isDevAdmin ? [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '⚠️', label: 'Disputes', to: '/customers?tab=disputes' },
    { icon: '🏪', label: 'Stores', to: '/stores' },
    { icon: '💳', label: 'Billing', to: '/billing' },
    { icon: '📈', label: 'Analytics', to: '/analytics' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ] : [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '⚠️', label: 'Disputes', to: '/customers?tab=disputes' },
    { icon: '👥', label: 'Staff', to: '/staff' },
    { icon: '🙋', label: 'Customers', to: '/customers' },
    { icon: '🏆', label: 'Leaderboard', to: '/leaderboard' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ];
  return (
    <div style={s.quickActions}>
      {actions.map((a) => (
        <button key={a.to} className="dash-quick-btn" style={s.quickBtn} onMouseMove={handleGlowMove} onClick={() => navigate(a.to)}>
          <span style={{ fontSize: 15 }}>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

const VIEWS = ['operations', 'business'] as const;
type View = (typeof VIEWS)[number];

export default function Dashboard() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const { notice: pinnedNotice, dismiss: dismissNotice } = usePinnedNotice();
  const storesQ = useStores();
  const [view, setView] = useState<View>(() => readSetting('dash-view', VIEWS, 'operations'));
  const pickView = (v: View) => { setView(v); writeSetting('dash-view', v); };
  const activeStores = (storesQ.data?.data?.data || []).length;

  return (
    <div style={s.container}>

      {/* ── Welcome ── */}
      <div className="dash-fade-in" style={{ ...s.welcomeCard, animationDelay: '0ms' }}>
        <div>
          <div style={s.welcomeDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={s.welcomeTitle}>{greeting()}, {user?.name?.split(' ')[0] || 'Admin'} 👋</h1>
          <p style={s.welcomeSub}>
            {isDevAdmin
              ? 'Full system access - billing, analytics, and platform settings.'
              : `Managing ${storesQ.isLoading ? '…' : activeStores} Lucky Stop locations across the network.`}
          </p>
        </div>
        <div style={{ ...s.roleBadge, ...(isDevAdmin ? s.roleBadgeDev : {}) }}>
          {isDevAdmin ? '⚡ Dev Admin' : '🏢 Super Admin'}
        </div>
      </div>

      {/* ── Search and quick actions, side by side ── */}
      {isSuperAdmin && (
        <div className="dash-fade-in" style={{ ...s.toolRow, animationDelay: '5ms' }}>
          <div style={{ flex: '0 1 300px', minWidth: 220 }}><GlobalSearch /></div>
          <QuickActions isDevAdmin={isDevAdmin} />
        </div>
      )}

      {/* ── Pinned Notice ── */}
      {pinnedNotice && (
        <div className="dash-fade-in" style={{ animationDelay: '15ms' }}>
          <NoticeBanner notice={pinnedNotice} onDismiss={() => dismissNotice(pinnedNotice.id)} />
        </div>
      )}

      {/* ── Everything waiting for a decision ── */}
      {isSuperAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '30ms' }}>
          <AttentionInbox />
        </div>
      )}

      {/* ── DevAdmin: day-to-day operations, or the business side ── */}
      {isDevAdmin && (
        <div style={s.viewTabs} role="tablist" aria-label="Dashboard view">
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => pickView(v)}
              style={{ ...s.viewTab, ...(view === v ? s.viewTabOn : {}) }}>
              {v === 'operations' ? 'Operations' : 'Business'}
            </button>
          ))}
        </div>
      )}

      {isDevAdmin && view === 'business' ? <BusinessView /> : <OperationsView />}
    </div>
  );
}
