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
import ConfirmModal from '../components/ConfirmModal';
import { RulesCard, FeaturesCard, BusinessCard, HistoryCard, LastChanged, useSettings } from '../components/SettingsCards';
import { useAnyUnsaved } from '../lib/unsaved';
import PointsExpirySettings from '../components/PointsExpirySettings';

type Tab = 'features' | 'review' | 'receipts' | 'rewards' | 'care' | 'staff' | 'app' | 'history';
const TABS: { value: Tab; label: string }[] = [
  { value: 'features', label: 'Features' },
  { value: 'review', label: 'Sales review' },
  { value: 'receipts', label: 'Receipt scanning' },
  { value: 'rewards', label: 'Rewards & offers' },
  { value: 'care', label: 'Customer care' },
  { value: 'staff', label: 'Staff' },
  { value: 'app', label: 'App' },
  { value: 'history', label: 'History' },
];
// Links made before the tabs were split still land somewhere sensible
const OLD: Record<string, Tab> = { app: 'app' };
// Tabs that moved to the page they belong to (HQ menu reorganised 2026-11-27): an old link or bookmark goes there
const MOVED: Record<string, string> = { hotfood: '/hot-food?tab=rules', deals: '/labels?tab=deals&view=settings' };
const GROUP_TAB: Record<string, Tab> = { review: 'review', receipts: 'receipts', offers: 'rewards', perks: 'rewards', care: 'care', staff: 'staff' };
// Rule groups shown on another page
const GROUP_PAGE: Record<string, { href: string; where: string }> = { hotFood: { href: '/hot-food?tab=rules', where: 'Hot food page (Rules)' } };
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
  { label: 'Deal limits: largest discount per category', words: 'deal discount limit category suggestion', href: '/labels?tab=deals&view=settings', where: 'Labels page (Deals, Settings)' },
  { label: 'Cuatro, the mascot: on or off, where he shows up, his name', words: 'cuatro mascot clover guide tip home empty push voice name', href: '/cuatro', where: 'Cuatro page' },
  { label: "What Cuatro says: HQ's own lines", words: 'cuatro mascot lines says message tip words', href: '/cuatro?tab=says', where: 'Cuatro page' },
  { label: 'Seasonal app theme (Halloween, Thanksgiving, Christmas)', words: 'theme season seasonal look halloween thanksgiving christmas holiday colors', href: '/cuatro?tab=look', where: 'Cuatro page (App look)' },
  { label: 'Flash deals', words: 'flash deal countdown push', href: '/offers?tab=flash', where: 'Offers page' },
  { label: 'Challenge of the week', words: 'weekly challenge featured week', href: '/offers?tab=challenges&open=weeklyChallenge', where: 'Offers page (Challenges)' },
  { label: 'Birthday gift', words: 'birthday gift greeting points', href: '/offers?tab=welcome&open=birthday', where: 'Offers page (Joining & birthday)' },
  { label: 'Streaks, check-in, badges, nudges, prize game and more', words: 'engagement streak punch check-in badges goals nudges welcome series game spin', href: '/engagement', where: 'Engagement page' },
  { label: 'Hot food hours, by store', words: 'hot food hours kitchen open close', href: '/hot-food?tab=availability', where: 'Hot food page (Stores and hours)' },
  { label: 'Points expiry: on or off, days, warning push', words: 'expire expiry expiring points days old balance warning', tab: 'rewards', target: 'points-expiry', where: 'Rewards & offers' },
  { label: 'History of settings changes', words: 'history log who changed audit', tab: 'history', where: 'History' },
  { label: 'Joining bonus: free items for new customers', words: 'welcome joining bonus free item new customer days', href: '/offers?tab=welcome', where: 'Offers page' },
  { label: 'Cashback rates, tiers, gas cents per gallon, category bonuses', words: 'cashback rate tier bronze silver gold diamond platinum gas cents gallon bonus points', href: '/rates', where: 'Cashback rates page' },
];

// Settings that live on the page they belong to (HQ menu reorganised 2026-11-27): listed here so nothing is ever hard to find
const L = { color: PRIMARY, fontWeight: 700 } as const;
const elsewhere = (
  <Card padding={16}>
    <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: 6 }}>Set on other pages</div>
    <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'grid', gap: 4, fontSize: FONT.body, color: C.text2 }}>
      <li><Link to="/rates" style={L}>Cashback rates</Link>: tier cashback, gas cents per gallon, points to reach a tier, category bonuses</li>
      <li><Link to="/offers" style={L}>Offers</Link>: promotions, deals, challenges and the challenge of the week, flash deals, the joining bonus and the birthday gift</li>
      <li><Link to="/engagement" style={L}>Engagement</Link>: streaks, punch cards, check-in, badges, store goals, smart nudges, the welcome series, the prize game</li>
      <li><Link to="/cuatro" style={L}>Cuatro</Link>: the mascot, his lines, and the app's seasonal look</li>
      <li><Link to="/hot-food?tab=rules" style={L}>Hot food › Rules</Link>: order times and limits; <Link to="/hot-food?tab=availability" style={L}>Stores and hours</Link>: each store's hot food hours</li>
      <li><Link to="/labels?tab=deals&view=settings" style={L}>Labels › Deals › Settings</Link>: deal limits for the deal suggestions</li>
    </ul>
  </Card>
);

export default function Settings() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') ?? '';
  const tab = (TABS.some((t) => t.value === asked) ? asked : OLD[asked] ?? 'features') as Tab;
  useEffect(() => { if (MOVED[asked]) navigate(MOVED[asked], { replace: true }); }, [asked]);   // eslint-disable-line react-hooks/exhaustive-deps
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
      ...((data?.rules ?? []) as { key: string; group: string; label: string; help: string; section?: string }[]).map((r) => (GROUP_PAGE[r.group]
        ? { label: r.label, words: `${r.help} ${r.section ?? ''}`, href: GROUP_PAGE[r.group].href, where: GROUP_PAGE[r.group].where }
        : { label: r.label, words: `${r.help} ${r.section ?? ''}`, tab: GROUP_TAB[r.group], target: `rule-${r.key}-row`, where: TAB_LABEL[GROUP_TAB[r.group]] })),
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
          placeholder="Find a setting, e.g. receipt or refill"
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

      {tab === 'features' && <div style={narrow}><FeaturesCard />{elsewhere}</div>}

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
          {elsewhere}
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

      {tab === 'staff' && (
        <div style={narrow}>
          <RulesCard group="staff" title="Staff" intro="When someone counts as working (check-ins, Who's where, hot food alerts), and when managers are reminded about an old gas price." />
        </div>
      )}

      {tab === 'app' && (
        <div style={narrow}>
          <BusinessCard />
          <Card padding={16}>
            <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>Seasonal look</div>
            <p style={{ fontSize: FONT.small, color: C.muted, margin: '6px 0 0' }}>The app's seasonal theme (Halloween, Thanksgiving, Christmas) moved to <Link to="/cuatro?tab=look">Cuatro &gt; App look</Link>.</p>
          </Card>
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
