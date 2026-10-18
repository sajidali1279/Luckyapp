// Settings (HQ and Dev Admin, 2026-10-12): the switches and rules that change how the app works, in one place, each with who changed it
// last, and a History of every settings change. The rules come from the server's list (utils/appSettings.ts): new ones show up here as they
// are added. Cashback rates keep their own page (linked).
import { useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { PageHeader, Tabs, Card, Notice } from '../components/kit';
import { C, FONT, PRIMARY } from '../lib/theme';
import AppVersionsCard from '../components/AppVersionsCard';
import ReceiptScanPanel from '../components/ReceiptScanPanel';
import ReferralsPanel from '../components/ReferralsPanel';
import { DealLimitsCard } from '../components/DealsPanel';
import { RulesCard, FeaturesCard, BusinessCard, HistoryCard, LastChanged } from '../components/SettingsCards';

type Tab = 'features' | 'hotfood' | 'review' | 'receipts' | 'rewards' | 'deals' | 'staff' | 'app' | 'history';
const TABS: { value: Tab; label: string }[] = [
  { value: 'features', label: 'Features' },
  { value: 'hotfood', label: 'Hot food' },
  { value: 'review', label: 'Sales review' },
  { value: 'receipts', label: 'Receipt scanning' },
  { value: 'rewards', label: 'Rewards & offers' },
  { value: 'deals', label: 'Deals' },
  { value: 'staff', label: 'Staff' },
  { value: 'app', label: 'App' },
  { value: 'history', label: 'History' },
];
// Links made before the tabs were split still land somewhere sensible
const OLD: Record<string, Tab> = { app: 'app' };

const narrow = { maxWidth: 760, display: 'grid', gap: 16 } as const;

export default function Settings() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') ?? '';
  const tab = (TABS.some((t) => t.value === asked) ? asked : OLD[asked] ?? 'features') as Tab;

  return (
    <>
      <PageHeader title="Settings" description="How the app works for customers and staff, for every store" />
      <Tabs ariaLabel="Settings" value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={TABS} />

      {tab === 'features' && <div style={narrow}><FeaturesCard /></div>}

      {tab === 'hotfood' && (
        <div style={narrow}>
          <RulesCard group="hotFood" title="Hot food orders" intro="Times count from when the order was placed (or marked ready). Hot food hours are set per store on the Stores page." />
        </div>
      )}

      {tab === 'review' && (
        <div style={narrow}>
          <RulesCard group="review" title="When a sale is held for review" intro="A held sale waits for a store manager or HQ to approve it before the customer gets the points. A sale over the 10% cashback ceiling is always held." />
        </div>
      )}

      {tab === 'receipts' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <ReceiptScanPanel />
          <div style={narrow}><RulesCard group="receipts" title="Receipt scanning limits" /></div>
        </div>
      )}

      {tab === 'rewards' && (
        <div style={narrow}>
          <Notice>
            Tier cashback, gas cents per gallon, points to reach a tier and category bonuses are on the{' '}
            <Link to="/rates" style={{ color: PRIMARY, fontWeight: 700 }}>Cashback Rates page</Link>.
          </Notice>
          <Notice>
            The joining bonus (free items for new customers) is on the{' '}
            <Link to="/offers?tab=welcome" style={{ color: PRIMARY, fontWeight: 700 }}>Offers page, Joining bonus tab</Link>.
          </Notice>
          <div>
            <ReferralsPanel part="deal" />
            <LastChanged actions={['REFERRAL_SETTINGS_UPDATE']} />
          </div>
          <RulesCard group="offers" title="Promotions" intro="When the last-day reminder goes out, and who counts as away or new for promotions that do not set their own days." />
        </div>
      )}

      {tab === 'deals' && (
        <div style={narrow}>
          <div>
            <DealLimitsCard />
            <LastChanged actions={['DEAL_LIMITS']} />
          </div>
        </div>
      )}

      {tab === 'staff' && (
        <div style={narrow}>
          <RulesCard group="staff" title="Staff check-in" intro="When someone counts as working, for check-ins, Who's where and hot food alerts." />
        </div>
      )}

      {tab === 'app' && (
        <div style={narrow}>
          <BusinessCard />
          {isDevAdmin ? (
            <div>
              <AppVersionsCard />
              <LastChanged actions={['APP_VERSIONS_UPDATE']} />
            </div>
          ) : (
            <Card padding={16}>
              <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>App updates</div>
              <p style={{ fontSize: FONT.small, color: C.muted, margin: '6px 0 0' }}>The oldest app version allowed is set by the Dev Admin.</p>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && <div style={narrow}><HistoryCard /></div>}
    </>
  );
}
