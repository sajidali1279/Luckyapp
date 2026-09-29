import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlobalSearch from '../components/GlobalSearch';
import NoticeBanner, { usePinnedNotice } from '../components/NoticeBanner';
import { useAuthStore } from '../store/authStore';
import { readSetting, writeSetting } from './dashboard/shared';
import { Page, PageHeader, Tabs, Button, Badge } from '../components/kit';
import Glyph from '../components/Glyph';
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {actions.map((a) => (
        <Button key={a.to} size="sm" icon={<Glyph e={a.icon} />} onClick={() => navigate(a.to)}>{a.label}</Button>
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

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

  return (
    <Page>
      <PageHeader
        title={`${greeting()}, ${user?.name?.split(' ')[0] || 'Admin'}`}
        description={`${today}. ${isDevAdmin
          ? 'Full system access: billing, analytics and platform settings.'
          : `Managing ${storesQ.isLoading ? '…' : activeStores} Lucky Stop locations.`}`}
        actions={<Badge tone="neutral" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderColor: 'rgba(255,255,255,0.24)' }}>{isDevAdmin ? 'Dev Admin' : 'Super Admin'}</Badge>}
      >
        {isSuperAdmin && (
          // Above the sections below it, so the search results are never hidden behind the "Needs your attention" panel
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', position: 'relative', zIndex: 20 }}>
            <div style={{ flex: '0 1 300px', minWidth: 220 }}><GlobalSearch /></div>
            <QuickActions isDevAdmin={isDevAdmin} />
          </div>
        )}
      </PageHeader>

      {pinnedNotice && (
        <div style={{ marginBottom: 16 }}>
          <NoticeBanner notice={pinnedNotice} onDismiss={() => dismissNotice(pinnedNotice.id)} />
        </div>
      )}

      {isSuperAdmin && <AttentionInbox />}

      {isDevAdmin && (
        <Tabs
          ariaLabel="Dashboard view"
          value={view}
          onChange={pickView}
          tabs={[{ value: 'operations', label: 'Operations' }, { value: 'business', label: 'Business' }]}
          style={{ marginTop: 8 }}
        />
      )}

      {isDevAdmin && view === 'business' ? <BusinessView /> : <OperationsView />}
    </Page>
  );
}
