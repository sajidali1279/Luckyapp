// Settings (HQ and Dev Admin, 2026-10-12): the switches and rules that change how the app works, in one place, each with who changed it
// last, and a History of every settings change. The rules come from the server's list (utils/appSettings.ts): new ones show up here as they
// are added. Cashback rates keep their own page (linked).
// 2026-10-17: page margins like every other page, "Find a setting" across the tabs, a warning before a tab switch throws unsaved edits away,
// and the things set on other pages gathered in one card.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Tabs, Card } from '../components/kit';
import { C, FONT, INPUT, PRIMARY } from '../lib/theme';
import AppVersionsCard from '../components/AppVersionsCard';
import ReceiptScanPanel from '../components/ReceiptScanPanel';
import ReferralsPanel from '../components/ReferralsPanel';
import { DealLimitsCard } from '../components/DealsPanel';
import ConfirmModal from '../components/ConfirmModal';
import { RulesCard, FeaturesCard, BusinessCard, HistoryCard, LastChanged, useSettings } from '../components/SettingsCards';
import AppThemeSettings from '../components/AppThemeSettings';
import { useAnyUnsaved } from '../lib/unsaved';
import PointsExpirySettings from '../components/PointsExpirySettings';

type Tab = 'features' | 'hotfood' | 'review' | 'receipts' | 'rewards' | 'care' | 'deals' | 'staff' | 'app' | 'history';
const TABS: { value: Tab; label: string }[] = [
  { value: 'features', label: 'Features' },
  { value: 'hotfood', label: 'Hot food' },
  { value: 'review', label: 'Sales review' },
  { value: 'receipts', label: 'Receipt scanning' },
  { value: 'rewards', label: 'Rewards & offers' },
  { value: 'care', label: 'Customer care' },
  { value: 'deals', label: 'Deals' },
  { value: 'staff', label: 'Staff' },
  { value: 'app', label: 'App' },
  { value: 'history', label: 'History' },
];
// Links made before the tabs were split still land somewhere sensible
const OLD: Record<string, Tab> = { app: 'app' };
const GROUP_TAB: Record<string, Tab> = { hotFood: 'hotfood', review: 'review', receipts: 'receipts', offers: 'rewards', perks: 'rewards', care: 'care', staff: 'staff' };
const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.value, t.label])) as Record<Tab, string>;

const narrow = { maxWidth: 820, display: 'grid', gap: 16 } as const;

// What "Find a setting" can find besides the rules and switches the server lists: the cards with their own forms, and the pages
// where the rest is set
type Hit = { label: string; words: string; tab?: Tab; target?: string; href?: string; where: string };
const FIXED: Hit[] = [
  { label: 'Contact details in the app', words: 'support phone email hours help screen call', tab: 'app', target: 'business-row', where: 'App' },
  { label: 'App updates (oldest version allowed)', words: 'version update force old app store', tab: 'app', where: 'App' },
  { label: 'Receipt scanning: on or off, who can use it, latest scans', words: 'receipt scan photo test phones everyone', tab: 'receipts', where: 'Receipt scanning' },
  { label: 'Refer a friend: rewards, minimum purchase, limits', words: 'referral invite friend code reward', tab: 'rewards', where: 'Rewards & offers' },
  { label: 'Deal limits: largest discount per category', words: 'deal discount limit category', tab: 'deals', where: 'Deals' },
  { label: 'Points expiry: on or off, days, warning push', words: 'expire expiry expiring points days old balance warning', tab: 'rewards', target: 'points-expiry', where: 'Rewards & offers' },
  { label: 'History of settings changes', words: 'history log who changed audit', tab: 'history', where: 'History' },
  { label: 'Joining bonus: free items for new customers', words: 'welcome joining bonus free item new customer days', href: '/offers?tab=welcome', where: 'Offers page' },
  { label: 'Cashback rates, tiers, gas cents per gallon, category bonuses', words: 'cashback rate tier bronze silver gold diamond platinum gas cents gallon bonus points', href: '/rates', where: 'Cashback Rates page' },
];

export default function Settings() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') ?? '';
  const tab = (TABS.some((t) => t.value === asked) ? asked : OLD[asked] ?? 'features') as Tab;
  const unsaved = useAnyUnsaved();
  const [leaving, setLeaving] = useState<null | (() => void)>(null);
  // Switching tabs throws the open tab's form away: ask first when it has edits nobody saved
  const guarded = (go: () => void) => (unsaved ? setLeaving(() => go) : go());
  const goTab = (v: Tab, target?: string) => guarded(() => { setParams(target ? { tab: v, find: target } : { tab: v }, { replace: true }); });

  // ── Find a setting ──
  const q = useSettings();
  const [find, setFind] = useState('');
  const hits: Hit[] = useMemo(() => {
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const data = q.data?.data?.data;
    const all: Hit[] = [
      ...((data?.rules ?? []) as { key: string; group: string; label: string; help: string; section?: string }[]).map((r) => ({
        label: r.label, words: `${r.help} ${r.section ?? ''}`, tab: GROUP_TAB[r.group], target: `rule-${r.key}-row`, where: TAB_LABEL[GROUP_TAB[r.group]] })),
      ...((data?.features ?? []) as { key: string; label: string; help: string }[]).map((f) => ({
        label: `${f.label} (switch)`, words: f.help, tab: 'features' as Tab, target: `feature-${f.key}-row`, where: 'Features' })),
      ...FIXED,
    ];
    return all.filter((h) => { const text = `${h.label} ${h.words} ${h.where}`.toLowerCase(); return words.every((w) => text.includes(w)); }).slice(0, 8);
  }, [find, q.data]);
  const open = (h: Hit) => { setFind(''); if (h.href) guarded(() => navigate(h.href!)); else if (h.tab) goTab(h.tab, h.target); };

  // The setting looked for: scrolled to and outlined for a moment, once its card has drawn
  const target = params.get('find');
  useEffect(() => {
    if (!target) return;
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById(target);
      if (!el && ++tries < 20) return;
      clearInterval(t);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.animate([{ boxShadow: `0 0 0 3px ${PRIMARY}` }, { boxShadow: `0 0 0 3px ${PRIMARY}` }, { boxShadow: '0 0 0 3px transparent' }], { duration: 1800 });
        el.querySelector('input')?.focus({ preventScroll: true });
      }
      setParams({ tab }, { replace: true });
    }, 150);
    return () => clearInterval(t);
  }, [target]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page>
      <PageHeader title="Settings" description="How the app works for customers and staff, for every store" />

      <div style={{ position: 'relative', maxWidth: 520, marginBottom: 12 }}>
        <input
          aria-label="Find a setting"
          type="search"
          placeholder="Find a setting (e.g. receipt, refill, cancel, support phone)"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) open(hits[0]); if (e.key === 'Escape') setFind(''); }}
          style={{ ...INPUT, width: '100%' }}
        />
        {find.trim() && (
          <div role="listbox" aria-label="Settings found" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: C.surface ?? '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(15,23,42,.12)', overflow: 'hidden' }}>
            {hits.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: FONT.small, color: C.muted }}>No setting matches "{find.trim()}".</div>
            ) : hits.map((h, i) => (
              <button key={`${h.label}-${i}`} type="button" role="option" aria-selected={i === 0} onClick={() => open(h)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: i === 0 ? '#f3f6fa' : 'transparent', border: 'none', borderTop: i ? `1px solid ${C.border}` : 'none', padding: '9px 12px', cursor: 'pointer' }}>
                <div style={{ fontSize: FONT.body, fontWeight: 600, color: C.text }}>{h.label}</div>
                <div style={{ fontSize: FONT.caption, color: C.muted }}>{h.href ? `On the ${h.where}` : `Settings › ${h.where}`}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Tabs ariaLabel="Settings" value={tab} onChange={(v) => goTab(v as Tab)} tabs={TABS} />

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
          <div style={narrow}><RulesCard group="receipts" title="Receipt scanning limits" intro="How many scans a customer can make, which ones are approved at once, and when the card and cash checks hold a scan for a manager." /></div>
        </div>
      )}

      {tab === 'rewards' && (
        <div style={narrow}>
          <Card padding={16}>
            <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: 6 }}>Set on other pages</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: FONT.body, color: C.text2 }}>
              <li><Link to="/rates" style={{ color: PRIMARY, fontWeight: 700 }}>Cashback Rates</Link>: tier cashback, gas cents per gallon, points to reach a tier, category bonuses</li>
              <li><Link to="/offers?tab=welcome" style={{ color: PRIMARY, fontWeight: 700 }}>Offers › Joining bonus</Link>: free items for new customers</li>
              <li><Link to="/offers" style={{ color: PRIMARY, fontWeight: 700 }}>Offers</Link>: promotions, deals and challenges themselves</li>
            </ul>
          </Card>
          <PointsExpirySettings />
          <RulesCard group="perks" title="Tier perks and rewards" intro="What each tier gets beyond cashback, how long a reward code from the app lasts, and the invite-code window. The app shows these numbers to customers." />
          <div>
            <ReferralsPanel part="deal" />
            <LastChanged actions={['REFERRAL_SETTINGS_UPDATE']} />
          </div>
          <RulesCard group="offers" title="Promotions" intro="When the last-day reminder goes out, and who counts as away or new for promotions that do not set their own days." />
        </div>
      )}

      {tab === 'care' && (
        <div style={narrow}>
          <RulesCard group="care" title="Customer care" intro="Credits HQ and managers can give, and how long customers have to report a problem or keep a product request open." />
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
          <RulesCard group="staff" title="Staff" intro="When someone counts as working (check-ins, Who's where, hot food alerts), and when managers are reminded about an old gas price." />
        </div>
      )}

      {tab === 'app' && (
        <div style={narrow}>
          <BusinessCard />
          <AppThemeSettings />
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

      <ConfirmModal
        open={!!leaving}
        title="Leave without saving?"
        danger
        confirmLabel="Leave without saving"
        message={<p style={{ margin: 0 }}>This tab has changes that are not saved. They are lost if you leave it. To keep them, choose Stay and press Save.</p>}
        onConfirm={() => { const go = leaving; setLeaving(null); go?.(); }}
        onCancel={() => setLeaving(null)}
        cancelLabel="Stay"
      />
    </Page>
  );
}
