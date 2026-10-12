// Settings (HQ and Dev Admin, 2026-10-12): the switches that change how the app works, in one place instead of spread over Billing,
// Transactions, Customers and Labels. Each card is the one that lived there before. Cashback rates keep their own page (linked here).
import { useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { PageHeader, Tabs, Card, Notice } from '../components/kit';
import { C, FONT, PRIMARY } from '../lib/theme';
import AppVersionsCard from '../components/AppVersionsCard';
import ReceiptScanPanel from '../components/ReceiptScanPanel';
import ReferralsPanel from '../components/ReferralsPanel';
import { DealLimitsCard } from '../components/DealsPanel';

type Tab = 'app' | 'rewards' | 'deals';
const TABS: { value: Tab; label: string }[] = [
  { value: 'app', label: 'App' },
  { value: 'rewards', label: 'Rewards' },
  { value: 'deals', label: 'Deals' },
];

export default function Settings() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'app') as Tab;

  return (
    <>
      <PageHeader title="Settings" description="How the app works for customers and staff" />
      <Tabs ariaLabel="Settings" value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={TABS} />

      {tab === 'app' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <ReceiptScanPanel />
          {isDevAdmin ? <AppVersionsCard /> : (
            <Card padding={16}>
              <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>App updates</div>
              <p style={{ fontSize: FONT.small, color: C.muted, margin: '6px 0 0' }}>The oldest app version allowed is set by the Dev Admin.</p>
            </Card>
          )}
        </div>
      )}

      {tab === 'rewards' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Notice>
            Tier cashback, gas cents per gallon, points to reach a tier and category bonuses are on the{' '}
            <Link to="/rates" style={{ color: PRIMARY, fontWeight: 700 }}>Cashback Rates page</Link>.
          </Notice>
          <div style={{ maxWidth: 760 }}><ReferralsPanel part="deal" /></div>
        </div>
      )}

      {tab === 'deals' && (
        <div style={{ maxWidth: 760 }}><DealLimitsCard /></div>
      )}
    </>
  );
}
