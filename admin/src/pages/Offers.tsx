import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { offersApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { serverMessage } from '../lib/apiError';
import { storeToday, addDays, monthEnd, dayLabel, startOfStoreDay, endOfStoreDay, storeDayLong, storeDayTime } from '../lib/storeDates';
import { CASHBACK_CAP, MAX_CENTS_PER_GALLON, findClashes, tiersAtCeiling, pctText, type Clash, type DraftPromo, type PostedOffer } from '../lib/offerRules';
import { useTierRates, useCategoryRates } from './dashboard/queries';

// ─── Suggestion Templates ─────────────────────────────────────────────────────

type Template = {
  icon: string;
  group: string;
  title: string;
  description: string;
  bonusRate: string;
  category: string;
};

const TEMPLATES: Template[] = [
  // ⛽ Gas & Diesel
  { icon: '⛽', group: 'Gas & Diesel', title: 'Double Gas Points Weekend', description: 'Earn 2x cashback on all gas purchases this weekend. Fill up and save more at Lucky Stop!', bonusRate: '3', category: 'GAS' },
  { icon: '⛽', group: 'Gas & Diesel', title: 'Full Tank Friday', description: 'Fill up on Friday and earn double credits on every gallon. More gas, more rewards.', bonusRate: '3', category: 'GAS' },
  { icon: '⛽', group: 'Gas & Diesel', title: 'Gas Saver Monday', description: 'Kick off the week with 3x points on all gas purchases every Monday.', bonusRate: '6', category: 'GAS' },
  { icon: '🚛', group: 'Gas & Diesel', title: 'Diesel Driver Deal', description: 'Truckers and fleet drivers earn bonus cashback on every diesel fill. Valid all week.', bonusRate: '3', category: 'DIESEL' },
  { icon: '🚛', group: 'Gas & Diesel', title: 'Diesel Double Up Week', description: 'Earn 6% cashback on all diesel fills this week. A special thank-you to our big rig regulars.', bonusRate: '3', category: 'DIESEL' },
  // 🌮 Hot Foods
  { icon: '🌮', group: 'Hot Foods', title: 'Hot Food Happy Hour', description: 'Double points on all hot food purchases, all day, every day this week.', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '☕', group: 'Hot Foods', title: 'Morning Commuter Special', description: 'Earn 10% cashback on hot coffee and breakfast items. Start your day rewarded.', bonusRate: '3', category: 'HOT_FOODS' },
  { icon: '🌮', group: 'Hot Foods', title: 'Taco Tuesday', description: 'Double cashback on all hot foods every Tuesday. Make Tuesday your Lucky Stop day!', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '🌮', group: 'Hot Foods', title: 'Lunch Rush Deal', description: 'Grab lunch and earn bonus credits on all hot food items, all day this week.', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '❄️', group: 'Hot Foods', title: 'Cold Weather Comfort', description: 'Warm up and earn more. Double points on all hot foods and hot beverages this week.', bonusRate: '7', category: 'HOT_FOODS' },
  // 🛒 Groceries
  { icon: '🛒', group: 'Groceries', title: 'Weekend Grocery Bonus', description: 'Double credits on all grocery purchases Saturday and Sunday. Stock up and save.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🛒', group: 'Groceries', title: 'Stock Up & Save', description: 'Earn 8% cashback on grocery orders this week. Every item counts toward your balance.', bonusRate: '3', category: 'GROCERIES' },
  { icon: '🥗', group: 'Groceries', title: 'Fresh Food Friday', description: 'Double cashback on all fresh produce and fresh foods every Friday.', bonusRate: '5', category: 'FRESH_FOODS' },
  { icon: '🧊', group: 'Groceries', title: 'Frozen Food Frenzy', description: 'Earn 10% on all frozen food items this week. Great deals on freezer favorites.', bonusRate: '5', category: 'FROZEN_FOODS' },
  { icon: '🥗', group: 'Groceries', title: 'Healthy Choice Week', description: 'Earn bonus credits on all fresh and frozen foods. Eating well pays off at Lucky Stop.', bonusRate: '5', category: 'FRESH_FOODS' },
  // 🎉 Seasonal
  { icon: '☀️', group: 'Seasonal', title: 'Summer Road Trip Bonus', description: 'All summer long - earn double points on gas. Hit the road and rack up rewards at Lucky Stop.', bonusRate: '3', category: 'GAS' },
  { icon: '🎄', group: 'Seasonal', title: 'Holiday Bonus Weekend', description: 'Earn 2x on all purchases during the holiday weekend. Happy holidays from Lucky Stop!', bonusRate: '5', category: '' },
  { icon: '🎓', group: 'Seasonal', title: 'Back to School Special', description: 'Extra credits on snacks, drinks, and groceries all August. Fuel up for the school year!', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🎆', group: 'Seasonal', title: 'Fourth of July Flash Sale', description: '3x points on all purchases on July 4th only. Celebrate and save at Lucky Stop!', bonusRate: '10', category: '' },
  { icon: '🏈', group: 'Seasonal', title: 'Game Day Double Points', description: 'Double points on all snacks and beverages on game day. Score big rewards at Lucky Stop.', bonusRate: '5', category: 'HOT_FOODS' },
  { icon: '🎊', group: 'Seasonal', title: 'New Year Triple Points', description: 'Start the new year right - triple points on all purchases for the first 3 days of January.', bonusRate: '10', category: '' },
  // 💎 Loyalty
  { icon: '💎', group: 'Loyalty', title: 'Thank You Month', description: 'Every purchase earns 2x cashback this month. Our way of saying thank you to our loyal customers.', bonusRate: '5', category: '' },
  { icon: '⚡', group: 'Loyalty', title: 'Flash 24-Hour Sale', description: "Triple points for exactly 24 hours - today only! Don't miss this limited-time Lucky Stop deal.", bonusRate: '10', category: '' },
  { icon: '💰', group: 'Loyalty', title: 'Big Spender Bonus', description: 'Earn 3x points on every purchase this week. The more you shop, the more you earn.', bonusRate: '10', category: '' },
  { icon: '🌟', group: 'Loyalty', title: 'Weekend Double Points', description: 'Every Saturday and Sunday, earn double cashback on all purchases store-wide.', bonusRate: '5', category: '' },
  { icon: '🎁', group: 'Loyalty', title: 'Surprise Bonus Week', description: 'Surprise! All customers earn extra cashback on every purchase this week. No limits, no exclusions.', bonusRate: '5', category: '' },
  // 🥤 Products (category-wide, not brand-specific: the system applies a promotion to a whole category, not one product)
  { icon: '🥤', group: 'Products', title: 'Cold Drinks Double Points Day', description: 'Earn double cashback on cold drinks today. Grab your favorite and get rewarded at Lucky Stop!', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🥤', group: 'Products', title: 'Soda Six-Pack Bonus', description: 'Pick up a six-pack of soda and earn 2x points. Any brand, any flavor, all count.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🔵', group: 'Products', title: 'Soda Fiesta Week', description: 'Earn double cashback on soda purchases this week. Stock up and save.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '🔵', group: 'Products', title: 'Weekend Soda Rush', description: 'Grab a cold soda this weekend and earn 3x points. The refreshing choice that keeps on rewarding.', bonusRate: '7', category: 'GROCERIES' },
  { icon: '🟢', group: 'Products', title: 'Energy Drink Madness', description: 'Fuel your day with an energy drink and earn triple cashback. Any brand, every can.', bonusRate: '10', category: 'GROCERIES' },
  { icon: '🟢', group: 'Products', title: 'Energy Drink Monday Boost', description: 'Start your week with an energy drink and earn 3x points every Monday. Stay charged, stay rewarded.', bonusRate: '10', category: 'GROCERIES' },
  { icon: '🐂', group: 'Products', title: 'Energy Drink Week', description: 'Energy drinks earn you double cashback all week long. Pick up your favorite and soar with rewards.', bonusRate: '7', category: 'GROCERIES' },
  { icon: '🐂', group: 'Products', title: 'Energy Drink Multi-Pack Bonus', description: 'Buy a multi-pack of energy drinks and earn 3x points. The more cans, the more credits back in your Lucky Stop wallet.', bonusRate: '10', category: 'GROCERIES' },
  { icon: '🟡', group: 'Products', title: 'Snack Attack', description: 'Double points on snack purchases this week. Chips, pretzels, and more. Snack big, earn big!', bonusRate: '7', category: 'GROCERIES' },
  { icon: '🟡', group: 'Products', title: 'Game Day Snack Bundle', description: 'Stock up on snacks for game day and earn 2x cashback. Snack smarter at Lucky Stop.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '☕', group: 'Products', title: 'Coffee Lover Bonus', description: 'Earn 3x points on all hot coffee purchases this week. Whether it\'s your morning cup or afternoon pick-me-up - you\'re covered.', bonusRate: '10', category: 'HOT_FOODS' },
  { icon: '☕', group: 'Products', title: 'Coffee Double Points Days', description: 'Coffee earns double cashback every day this week. Wake up and earn at Lucky Stop.', bonusRate: '7', category: 'HOT_FOODS' },
  { icon: '💧', group: 'Products', title: 'Hydration Rewards Week', description: 'Earn double cashback on all bottled water purchases. Any brand, stay hydrated and rewarded.', bonusRate: '5', category: 'GROCERIES' },
  { icon: '💧', group: 'Products', title: 'Water Case Bonus', description: 'Buy a case of water and earn 3x points instantly. Stock up at Lucky Stop and save big on your balance.', bonusRate: '10', category: 'GROCERIES' },
];

const TEMPLATE_GROUPS = [...new Set(TEMPLATES.map((t) => t.group))];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'GROCERIES', label: 'Groceries' },
  { value: 'FROZEN_FOODS', label: 'Frozen Foods' },
  { value: 'FRESH_FOODS', label: 'Fresh Foods' },
  { value: 'GAS', label: 'Gas' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'HOT_FOODS', label: 'Hot Foods' },
  { value: 'OTHER', label: 'Other' },
];

// Dates are store days (Central time), wherever the admin is opened. They used to be the UTC date and the browser's
// midnight, which started a promotion at 7 pm the evening before and drew its first day a day early.
function todayStr() { return storeToday(); }
/** The default end: a month from today (starting on the 20th it ends on the 19th of next month). */
function defaultEndStr() { return monthEnd(storeToday()); }
function fmtDate(d: string) { return storeDayLong(d); }

type PostKind = 'promo' | 'quick' | 'deal';
type QuickDuration = 'today' | '3d' | '1w' | '2w' | '1m';
/** Everything the "are you sure" box shows before a post goes to customers. */
type Pending = { kind: PostKind; fd: FormData; title: string; what: string; where: string; when: string; example: string | null; notes: string[]; clashes: Clash[]; notify: string };

const BONUS_TOO_BIG = `A bonus can be at most ${CASHBACK_CAP * 100}%, because total cashback is capped at ${CASHBACK_CAP * 100}% of a sale.`;
/** A percentage typed as 7.5 as the fraction the server stores (0.075), without 0.07500000000000001. */
function frac(pct: number) { return parseFloat((pct / 100).toFixed(4)); }
/** "Today" is one store day, "1 Week" is seven, counting today. */
function quickEndKey(d: QuickDuration): string {
  const t = storeToday();
  return d === 'today' ? t : d === '3d' ? addDays(t, 2) : d === '1w' ? addDays(t, 6) : d === '2w' ? addDays(t, 13) : monthEnd(t);
}
/** Drops the "Valid Sep 1 to Sep 30" or "Valid this week" sentence a generated description ends with, so a reused offer does not carry old dates. */
function stripValidity(desc: string): string {
  return desc.replace(/\s*Valid (?:[A-Z][a-z]{2} \d{1,2}(?:, \d{4})? (?:to|–|-) [A-Z][a-z]{2} \d{1,2}, \d{4}|today|3 days|this week|2 weeks|this month)\.$/, '').trim();
}

const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
type TierKey = typeof TIERS[number];
const TIER_EMOJI: Record<TierKey, string> = { BRONZE: '🥉', SILVER: '🥈', GOLD: '🥇', DIAMOND: '💎', PLATINUM: '👑' };

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Offers() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const [mainTab, setMainTab] = useState<'promotions' | 'deals'>('promotions');
  const [showForm, setShowForm] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeGroup, setActiveGroup] = useState(TEMPLATE_GROUPS[0]);

  // Quick post state
  const [quickCategory, setQuickCategory] = useState('');
  const [quickBonus, setQuickBonus] = useState('');
  const [quickCpg, setQuickCpg] = useState('');
  const [quickBonusMode, setQuickBonusMode] = useState<'pct' | 'cpg'>('pct');
  const [quickDuration, setQuickDuration] = useState<QuickDuration>('1w');
  // Deal form state
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealTitle, setDealTitle] = useState('');
  const [dealText, setDealText] = useState('');
  const [dealDescription, setDealDescription] = useState('');
  const [dealCategory, setDealCategory] = useState('');
  const [dealType, setDealType] = useState<'ALL_STORES' | 'SPECIFIC_STORE'>('ALL_STORES');
  const [dealStoreId, setDealStoreId] = useState('');
  const [dealStartDate, setDealStartDate] = useState(todayStr());
  const [dealEndDate, setDealEndDate] = useState(defaultEndStr());
  const [dealImageFile, setDealImageFile] = useState<File | null>(null);
  const [dealRequires21, setDealRequires21] = useState(false);
  const dealFileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bonusRate, setBonusRate] = useState('');
  const [requires21, setRequires21] = useState(false);
  const [useTierBonuses, setUseTierBonuses] = useState(false);
  const [tierBonuses, setTierBonuses] = useState({ BRONZE: '', SILVER: '', GOLD: '', DIAMOND: '', PLATINUM: '' });
  const [type, setType] = useState<'ALL_STORES' | 'SPECIFIC_STORE'>('ALL_STORES');
  const [storeId, setStoreId] = useState('');
  const [category, setCategory] = useState<string | null>(null); // null = not yet chosen
  const [gasBonusCpg, setGasBonusCpg] = useState(''); // ¢/gallon bonus for GAS/DIESEL offers
  const [gasBonusType, setGasBonusType] = useState<'cpg' | 'pct'>('cpg'); // gas offer bonus mode
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(defaultEndStr());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // The post waiting for "Post now", and a lock so a fast double click can never send it twice
  const [pending, setPending] = useState<Pending | null>(null);
  const sending = useRef(false);

  // A separate key from the dashboard's live-only list, which must not show promotions that have not started
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['offers', 'with-scheduled'], queryFn: () => offersApi.getLiveAndScheduled() });
  const tierRatesQ = useTierRates();
  const catRatesQ = useCategoryRates();
  const tierRates: any[] = tierRatesQ.data?.data?.data || [];
  const catRates: any[] = catRatesQ.data?.data?.data || [];
  const { data: historyData } = useQuery({
    queryKey: ['offers-history'], queryFn: () => offersApi.getHistory(), enabled: showHistory,
  });
  // getAccessible() avoids a pointless 403 for Store Manager (getAll() is
  // SuperAdmin+ only) — the store picker this feeds is already hidden for
  // that role, but there's no reason to fire a call guaranteed to fail.
  const { data: storesData } = useQuery({ queryKey: ['accessible-stores'], queryFn: () => storesApi.getAccessible() });

  const offers: any[] = data?.data?.data || [];
  const pastOffers: any[] = historyData?.data?.data || [];
  const stores: any[] = storesData?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: ({ fd }: { fd: FormData; kind: PostKind }) => offersApi.create(fd),
    onSuccess: (_res, { kind }) => {
      toast.success(kind === 'deal' ? 'Deal posted' : 'Promotion posted');
      if (kind === 'deal') resetDealForm(); else if (kind === 'quick') resetQuick(); else resetForm();
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['offers-history'] });
    },
    // The server's own sentence (a refused form used to come back as an object and crash the page)
    onError: (err) => toast.error(serverMessage(err, 'Could not post it. Please try again.')),
    // Whatever the answer, the box closes and a new post can be sent; the form keeps what was typed unless it worked
    onSettled: () => { sending.current = false; setPending(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => offersApi.delete(id),
    onSuccess: () => { toast.success('Offer removed'); qc.invalidateQueries({ queryKey: ['offers'] }); qc.invalidateQueries({ queryKey: ['offers-history'] }); },
    onError: (err) => toast.error(serverMessage(err, 'Failed to remove the offer')),
  });

  function resetForm() {
    setShowForm(false);
    setTitle(''); setDescription(''); setBonusRate('');
    setUseTierBonuses(false); setTierBonuses({ BRONZE: '', SILVER: '', GOLD: '', DIAMOND: '', PLATINUM: '' });
    setType('ALL_STORES'); setStoreId(''); setCategory(null); setGasBonusCpg(''); setGasBonusType('cpg');
    setStartDate(todayStr()); setEndDate(defaultEndStr()); setImageFile(null); setRequires21(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function resetQuick() {
    setShowQuick(false);
    setQuickBonus(''); setQuickCpg(''); setQuickBonusMode('pct');
    setQuickCategory(''); setQuickDuration('1w');
  }

  function applyTemplate(t: Template) {
    setTitle(t.title);
    setDescription(t.description);
    setBonusRate(t.bonusRate);
    setCategory(t.category || '');
    setGasBonusType('pct');
    setShowForm(true);
    setShowTemplates(false);
    setTimeout(() => document.getElementById('offer-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  // Fill the form from a past promotion exactly as it was: the same percentage (1.5% stays 1.5%), the same per-tier rates,
  // the same age restriction. The old validity sentence in the description is dropped because the dates are new.
  function reuseOffer(offer: any) {
    const tiers: Record<string, number> | null = offer.tierBonusRates && Object.keys(offer.tierBonusRates).length > 0 ? offer.tierBonusRates : null;
    const isCpg = offer.gasBonusCentsPerGallon != null;
    const isGasCategory = offer.category === 'GAS' || offer.category === 'DIESEL';
    const keepTiers = !!tiers && !isCpg && !isGasCategory; // the per-tier boxes exist only for non-gas categories
    setTitle(offer.title);
    setDescription(stripValidity(offer.description || ''));
    setUseTierBonuses(keepTiers);
    setTierBonuses({ BRONZE: '', SILVER: '', GOLD: '', DIAMOND: '', PLATINUM: '', ...Object.fromEntries(Object.entries(tiers ?? {}).map(([k, v]) => [k, pctText(v)])) });
    setBonusRate(!isCpg && !keepTiers && offer.bonusRate ? pctText(offer.bonusRate) : '');
    setCategory(offer.category || '');
    setGasBonusCpg(isCpg ? String(offer.gasBonusCentsPerGallon) : '');
    setGasBonusType(isCpg ? 'cpg' : 'pct');
    setType(offer.type || 'ALL_STORES');
    setStoreId(offer.storeId || '');
    setRequires21(!!offer.requires21);
    setStartDate(todayStr());
    setEndDate(defaultEndStr());
    setShowForm(true);
    setShowQuick(false); setShowTemplates(false);
    setTimeout(() => document.getElementById('offer-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
    toast.success(tiers && !keepTiers && !isCpg
      ? 'Form filled from past offer. Per-tier rates are not available for gas, so its highest rate is used - update the dates and submit'
      : 'Form filled from past offer - update the dates and submit');
  }

  // ── Before anything goes to customers: say exactly what will happen ──────────
  function whereText(t: 'ALL_STORES' | 'SPECIFIC_STORE', sid: string) {
    if (t === 'ALL_STORES') return stores.length ? `All ${stores.length} stores` : 'All stores';
    const st = stores.find((x: any) => x.id === sid);
    return st ? `${st.name} only` : 'One store only';
  }
  function whenText(startMs: number, endMs: number, startsNow: boolean) {
    return `${startsNow ? 'Right now' : storeDayTime(new Date(startMs))} to ${storeDayTime(new Date(endMs))}, Central time`;
  }

  function askToPost(p: Pending) { setPending(p); }

  function confirmPost() {
    if (!pending || sending.current) return; // a second click while the first is on its way does nothing
    sending.current = true;
    createMutation.mutate({ fd: pending.fd, kind: pending.kind });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (category === null) { toast.error('Select a category'); return; }
    if (!startDate || !endDate) { toast.error('Start and end dates are required'); return; }
    if (endDate < startDate) { toast.error('The end date must be on or after the start date'); return; }
    if (endDate < storeToday()) { toast.error('That end date has already passed'); return; }
    if (type === 'SPECIFIC_STORE' && !storeId) { toast.error('Select a store'); return; }

    const isGasDiesel = category === 'GAS' || category === 'DIESEL';
    const isCpg = isGasDiesel && gasBonusType === 'cpg';
    const cpg = parseFloat(gasBonusCpg);
    const pct = parseFloat(bonusRate);
    let tierMap: Record<string, number> | null = null;
    if (useTierBonuses && !isGasDiesel) {
      tierMap = {};
      for (const t of TIERS) {
        const v = parseFloat(tierBonuses[t]);
        if (!isNaN(v) && v > 0) tierMap[t] = frac(v);
      }
      if (Object.keys(tierMap).length === 0) { toast.error('Enter at least one tier bonus rate'); return; }
      if (Math.max(...Object.values(tierMap)) > CASHBACK_CAP + 1e-9) { toast.error(BONUS_TOO_BIG); return; }
    } else if (isCpg) {
      if (isNaN(cpg) || cpg <= 0) { toast.error('Enter the cents-per-gallon bonus'); return; }
      if (cpg > MAX_CENTS_PER_GALLON) { toast.error(`A per-gallon bonus can be at most ${MAX_CENTS_PER_GALLON} cents.`); return; }
    } else {
      if (isNaN(pct) || pct <= 0) { toast.error('Enter the bonus percentage'); return; }
      if (pct > CASHBACK_CAP * 100 + 1e-9) { toast.error(BONUS_TOO_BIG); return; }
    }

    const catLabel = category === '' ? 'Store-wide' : (CATEGORIES.find((c) => c.value === category)?.label ?? category);
    const bonusDisplay = isCpg ? `+${cpg}¢/gal` : tierMap ? 'Per-tier bonus' : `+${pct}%`;
    const autoTitle = title.trim() || `${bonusDisplay} ${catLabel} Promotion`;
    const autoDesc = description.trim() || `${bonusDisplay} bonus on ${catLabel.toLowerCase()} purchases. Valid ${dayLabel(startDate)} to ${dayLabel(endDate)}, ${endDate.slice(0, 4)}.`;

    const startMs = startOfStoreDay(startDate).getTime();
    const endMs = endOfStoreDay(endDate).getTime();
    const fd = new FormData();
    fd.append('title', autoTitle);
    fd.append('description', autoDesc);
    fd.append('type', type);
    fd.append('startDate', new Date(startMs).toISOString());
    fd.append('endDate', new Date(endMs).toISOString());
    if (tierMap) {
      fd.append('tierBonusRates', JSON.stringify(tierMap));
      // bonusRate = max tier bonus (for server ordering)
      fd.append('bonusRate', String(Math.max(...Object.values(tierMap))));
    } else if (isCpg) {
      fd.append('gasBonusCentsPerGallon', String(cpg)); // cents only: no percentage rides along
    } else {
      fd.append('bonusRate', String(frac(pct)));
    }
    if (type === 'SPECIFIC_STORE' && storeId) fd.append('storeId', storeId);
    if (category) fd.append('category', category);
    if (imageFile) fd.append('image', imageFile);
    if (requires21) fd.append('requires21', 'true');

    const draft: DraftPromo = {
      type, storeId: type === 'SPECIFIC_STORE' ? storeId : null, category: category || null,
      percent: tierMap ? Math.max(...Object.values(tierMap)) : isCpg ? null : frac(pct),
      tiers: tierMap, centsPerGallon: isCpg ? cpg : null, startMs, endMs,
    };
    askToPost(describePost('promo', fd, autoTitle, `${bonusDisplay} on ${catLabel.toLowerCase()} purchases`, draft, whereText(type, storeId), whenText(startMs, endMs, false)));
  }

  function handleQuickPost() {
    const isGasDiesel = quickCategory === 'GAS' || quickCategory === 'DIESEL';
    const useCpg = isGasDiesel && quickBonusMode === 'cpg';
    const cpg = parseFloat(quickCpg);
    const bonus = parseFloat(quickBonus);

    if (useCpg) {
      if (isNaN(cpg) || cpg <= 0) { toast.error('Enter a ¢/gallon bonus'); return; }
      if (cpg > MAX_CENTS_PER_GALLON) { toast.error(`A per-gallon bonus can be at most ${MAX_CENTS_PER_GALLON} cents.`); return; }
    } else {
      if (isNaN(bonus) || bonus <= 0) { toast.error('Enter a bonus %'); return; }
      if (bonus > CASHBACK_CAP * 100 + 1e-9) { toast.error(BONUS_TOO_BIG); return; }
    }

    const catLabel = quickCategory
      ? CATEGORIES.find(c => c.value === quickCategory)?.label ?? quickCategory
      : 'All Categories';
    const durationLabel = { today: 'Today', '3d': '3 Days', '1w': 'This Week', '2w': '2 Weeks', '1m': 'This Month' }[quickDuration];
    const bonusDisplay = useCpg ? `+${cpg}¢/gal` : `+${bonus}%`;
    const autoTitle = `${bonusDisplay} ${catLabel} Bonus - ${durationLabel}`;

    // From now until the end of the last store day (so "1 Week" is seven store days, today included)
    const startMs = Date.now();
    const endMs = endOfStoreDay(quickEndKey(quickDuration)).getTime();

    const fd = new FormData();
    fd.append('title', autoTitle);
    fd.append('description', useCpg
      ? `${cpg}¢ per gallon bonus on ${catLabel.toLowerCase()} purchases. Valid ${durationLabel.toLowerCase()}.`
      : `${bonus}% bonus cashback on ${catLabel.toLowerCase()} purchases. Valid ${durationLabel.toLowerCase()}.`);
    fd.append('type', 'ALL_STORES');
    fd.append('startDate', new Date(startMs).toISOString());
    fd.append('endDate', new Date(endMs).toISOString());
    if (quickCategory) fd.append('category', quickCategory);
    if (useCpg) fd.append('gasBonusCentsPerGallon', String(cpg)); // cents only: no percentage rides along
    else fd.append('bonusRate', String(frac(bonus)));

    const draft: DraftPromo = {
      type: 'ALL_STORES', storeId: null, category: quickCategory || null,
      percent: useCpg ? null : frac(bonus), tiers: null, centsPerGallon: useCpg ? cpg : null, startMs, endMs,
    };
    askToPost(describePost('quick', fd, autoTitle, `${bonusDisplay} on ${catLabel.toLowerCase()} purchases`, draft, whereText('ALL_STORES', ''), whenText(startMs, endMs, true)));
  }

  // Everything the confirmation box shows, worked out once
  function describePost(kind: PostKind, fd: FormData, title: string, what: string, draft: DraftPromo | null, where: string, when: string): Pending {
    const notes: string[] = [];
    let example: string | null = null;
    let clashes: Clash[] = [];
    if (draft) {
      if (draft.centsPerGallon != null) example = `A 10-gallon fill earns $${(10 * draft.centsPerGallon / 100).toFixed(2)} more.`;
      else if (draft.tiers) {
        const v = Object.values(draft.tiers);
        example = `On a $20 sale customers earn $${(20 * Math.min(...v)).toFixed(2)} to $${(20 * Math.max(...v)).toFixed(2)} more, depending on their tier.`;
      } else if (draft.percent != null) example = `On a $20 sale customers earn $${(20 * draft.percent).toFixed(2)} more.`;
      const capped = tiersAtCeiling(draft, tierRates, catRates);
      if (capped.length > 0) {
        notes.push(`Total cashback is capped at ${CASHBACK_CAP * 100}% of a sale. At this size ${capped.join(', ')} already reach the cap, so they earn ${CASHBACK_CAP * 100}% in total, less than the full bonus.`);
      }
      clashes = findClashes(draft, offers as PostedOffer[]);
    }
    // Customers are told when the promotion STARTS (right away if it already has), and a single-store promotion goes to that store's customers only
    const startMs = Date.parse(String(fd.get('startDate') ?? ''));
    const startsNow = isNaN(startMs) || startMs <= Date.now() + 60_000;
    const single = fd.get('type') === 'SPECIFIC_STORE';
    const timing = startsNow ? 'right away' : `on its first day (${storeDayLong(new Date(startMs))})`;
    const notify = single
      ? `Customers of ${where} (an approved purchase there in the last 6 months) are notified ${timing}.`
      : `Every customer is notified ${timing}.`;
    return { kind, fd, title, what, where, when, example, notes, clashes, notify };
  }

  function handleCreateDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!dealTitle.trim()) { toast.error('Title is required'); return; }
    if (!dealText.trim()) { toast.error('Deal text is required (e.g. "2 for $5")'); return; }
    if (!dealStartDate || !dealEndDate) { toast.error('Start and end dates are required'); return; }
    if (dealEndDate < dealStartDate) { toast.error('The end date must be on or after the start date'); return; }
    if (dealEndDate < storeToday()) { toast.error('That end date has already passed'); return; }
    if (dealType === 'SPECIFIC_STORE' && !dealStoreId) { toast.error('Select a store'); return; }
    const startMs = startOfStoreDay(dealStartDate).getTime();
    const endMs = endOfStoreDay(dealEndDate).getTime();
    const fd = new FormData();
    fd.append('title', dealTitle.trim());
    fd.append('description', dealDescription.trim() || dealText.trim());
    fd.append('dealText', dealText.trim());
    fd.append('type', dealType);
    fd.append('startDate', new Date(startMs).toISOString());
    fd.append('endDate', new Date(endMs).toISOString());
    if (dealType === 'SPECIFIC_STORE' && dealStoreId) fd.append('storeId', dealStoreId);
    if (dealCategory) fd.append('category', dealCategory);
    if (dealImageFile) fd.append('image', dealImageFile);
    if (dealRequires21) fd.append('requires21', 'true');
    askToPost(describePost('deal', fd, dealTitle.trim(), `${dealText.trim()} - ${dealTitle.trim()}`, null, whereText(dealType, dealStoreId), whenText(startMs, endMs, false)));
  }

  function resetDealForm() {
    setShowDealForm(false);
    setDealTitle(''); setDealText(''); setDealDescription('');
    setDealCategory(''); setDealType('ALL_STORES'); setDealStoreId('');
    setDealStartDate(todayStr()); setDealEndDate(defaultEndStr());
    setDealImageFile(null); setDealRequires21(false);
    if (dealFileRef.current) dealFileRef.current.value = '';
  }

  const groupedTemplates = TEMPLATES.filter((t) => t.group === activeGroup);
  // Live now, and switched on but starting later (HQ sees these too, so a promotion made for next week is not invisible)
  const nowMs = Date.now();
  const started = (o: any) => Date.parse(o.startDate) <= nowMs;
  const promotionOffers = offers.filter((o: any) => !o.dealText);
  const dealOffers = offers.filter((o: any) => o.dealText);
  const livePromotions = promotionOffers.filter(started);
  const scheduledPromotions = promotionOffers.filter((o: any) => !started(o));
  const liveDeals = dealOffers.filter(started);
  const scheduledDeals = dealOffers.filter((o: any) => !started(o));
  const pastPromotions = pastOffers.filter((o: any) => !o.dealText);
  const pastDeals = pastOffers.filter((o: any) => o.dealText);

  if (isError) return <div style={{ padding: 32 }}><ErrorState message="Failed to load offers." onRetry={refetch} /></div>;

  return (
    <div style={s.container}>
      <ConfirmModal
        open={!!confirmDeleteId}
        title="Remove this offer?"
        message="It stops right away and customers will no longer see it. It stays under Past, where you can bring it back with Reuse."
        confirmLabel="Remove"
        danger
        onConfirm={() => { if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmModal
        open={!!pending}
        title={pending?.kind === 'deal' ? 'Post this deal?' : 'Post this promotion?'}
        message={pending && (
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, color: '#111827', marginBottom: 6 }}>{pending.what}</div>
            <div><strong>Where:</strong> {pending.where}</div>
            <div><strong>When:</strong> {pending.when}</div>
            {pending.example && <div><strong>Example:</strong> {pending.example}</div>}
            {pending.clashes.map((c) => (
              <div key={c.offer.id} style={s.confirmNote}>⚠️ {c.text}</div>
            ))}
            {pending.notes.map((n, i) => <div key={i} style={s.confirmNote}>ℹ️ {n}</div>)}
            <div style={{ marginTop: 10, fontWeight: 700, color: '#111827' }}>{pending.notify}</div>
          </div>
        )}
        confirmLabel={createMutation.isPending ? 'Posting…' : 'Post now'}
        busy={createMutation.isPending}
        onConfirm={confirmPost}
        onCancel={() => setPending(null)}
      />
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>📢 Offers & Promotions</h1>
          <p style={s.sub}>Promotions boost cashback automatically - Deals display price specials in the app</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {mainTab === 'promotions' && (
            <>
              <button style={s.templateBtn} onClick={() => { setShowTemplates(!showTemplates); setShowForm(false); setShowQuick(false); }}>
                💡 {showTemplates ? 'Hide' : 'Templates'}
              </button>
              <button style={{ ...s.templateBtn, background: showQuick ? '#e8f8ed' : undefined, borderColor: showQuick ? '#2DC653' : undefined, color: showQuick ? '#1a7a3a' : undefined }}
                onClick={() => { setShowQuick(!showQuick); setShowForm(false); setShowTemplates(false); }}>
                ⚡ Quick Post
              </button>
              <button style={s.addBtn} onClick={() => { setShowForm(!showForm); setShowTemplates(false); setShowQuick(false); }}>
                {showForm ? 'Cancel' : '+ Full Form'}
              </button>
            </>
          )}
          {mainTab === 'deals' && (
            <button style={s.addBtn} onClick={() => setShowDealForm(!showDealForm)}>
              {showDealForm ? 'Cancel' : '+ New Deal'}
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div style={s.mainTabs}>
        <button style={{ ...s.mainTab, ...(mainTab === 'promotions' ? s.mainTabActive : {}) }}
          onClick={() => { setMainTab('promotions'); setShowDealForm(false); }}>
          📢 Promotions
          <span style={{ ...s.tabCount, background: mainTab === 'promotions' ? 'rgba(255,255,255,0.2)' : '#f0f1f2', color: mainTab === 'promotions' ? '#fff' : '#5a6472' }}>{promotionOffers.length}</span>
        </button>
        <button style={{ ...s.mainTab, ...(mainTab === 'deals' ? s.mainTabActive : {}) }}
          onClick={() => { setMainTab('deals'); setShowForm(false); setShowTemplates(false); }}>
          🏷️ Deals
          <span style={{ ...s.tabCount, background: mainTab === 'deals' ? 'rgba(255,255,255,0.2)' : '#f0f1f2', color: mainTab === 'deals' ? '#fff' : '#5a6472' }}>{dealOffers.length}</span>
        </button>
      </div>

      {/* ⚡ Quick Post Panel */}
      {showQuick && (
        <div style={s.quickPanel}>
          <div style={s.quickTitle}>⚡ Quick Post</div>
          <div style={s.quickRow}>
            {/* Category chips */}
            <div style={s.quickGroup}>
              <div style={s.quickLabel}>Category</div>
              <div style={s.quickChips}>
                {[
                  { value: '', label: '🌐 All' },
                  { value: 'GAS', label: '⛽ Gas' },
                  { value: 'DIESEL', label: '🚛 Diesel' },
                  { value: 'HOT_FOODS', label: '🌭 Hot Foods' },
                  { value: 'GROCERIES', label: '🛒 Groceries' },
                  { value: 'FROZEN_FOODS', label: '🧊 Frozen' },
                  { value: 'FRESH_FOODS', label: '🥗 Fresh' },
                ].map(c => (
                  <button key={c.value} type="button"
                    style={{ ...s.chip, ...(quickCategory === c.value ? s.chipActive : {}) }}
                    onClick={() => {
                      setQuickCategory(c.value);
                      if (c.value === 'GAS' || c.value === 'DIESEL') setQuickBonusMode('cpg');
                      else setQuickBonusMode('pct');
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bonus - mode toggle for GAS/DIESEL */}
            <div style={s.quickGroup}>
              {(quickCategory === 'GAS' || quickCategory === 'DIESEL') && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button type="button"
                    style={{ ...s.chip, ...(quickBonusMode === 'pct' ? s.chipActive : {}), fontSize: 14 }}
                    onClick={() => setQuickBonusMode('pct')}>% Cashback</button>
                  <button type="button"
                    style={{ ...s.chip, ...(quickBonusMode === 'cpg' ? s.chipActive : {}), fontSize: 14 }}
                    onClick={() => setQuickBonusMode('cpg')}>⛽ ¢/Gallon</button>
                </div>
              )}
              {quickBonusMode === 'cpg' && (quickCategory === 'GAS' || quickCategory === 'DIESEL') ? (
                <>
                  <div style={s.quickLabel}>¢ per Gallon Bonus</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={s.quickBonusRow}>
                      {['1', '2', '3', '5', '10'].map(v => (
                        <button key={v} type="button"
                          style={{ ...s.chip, ...(quickCpg === v ? s.chipActive : {}) }}
                          onClick={() => setQuickCpg(v)}>
                          +{v}¢
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" min="0" max={MAX_CENTS_PER_GALLON} step="0.5"
                      aria-label="Custom cents per gallon bonus"
                      value={quickCpg}
                      onChange={e => setQuickCpg(e.target.value)}
                      style={s.quickInput}
                      placeholder="custom"
                    />
                    <span style={{ fontSize: 15, color: TEXT_MUTED, fontWeight: 600 }}>¢/gal</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={s.quickLabel}>Bonus %</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={s.quickBonusRow}>
                      {['1', '2', '3', '5', '10'].map(v => (
                        <button key={v} type="button"
                          style={{ ...s.chip, ...(quickBonus === v ? s.chipActive : {}) }}
                          onClick={() => setQuickBonus(v)}>
                          +{v}%
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" min="0" max={CASHBACK_CAP * 100} step="0.5"
                      aria-label="Custom bonus percent"
                      value={quickBonus}
                      onChange={e => setQuickBonus(e.target.value)}
                      style={s.quickInput}
                      placeholder="custom"
                    />
                    <span style={{ fontSize: 15, color: TEXT_MUTED, fontWeight: 600 }}>%</span>
                  </div>
                </>
              )}
            </div>

            {/* Duration */}
            <div style={s.quickGroup}>
              <div style={s.quickLabel}>Duration</div>
              <div style={s.quickChips}>
                {([['today', 'Today'], ['3d', '3 Days'], ['1w', '1 Week'], ['2w', '2 Weeks'], ['1m', '1 Month']] as const).map(([val, label]) => (
                  <button key={val} type="button"
                    style={{ ...s.chip, ...(quickDuration === val ? s.chipActive : {}) }}
                    onClick={() => setQuickDuration(val)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview + Post */}
          {(() => {
            const isGasDiesel = quickCategory === 'GAS' || quickCategory === 'DIESEL';
            const useCpg = isGasDiesel && quickBonusMode === 'cpg';
            const hasValue = useCpg ? (parseFloat(quickCpg) > 0) : (parseFloat(quickBonus) > 0);
            if (!hasValue) return null;
            const bonusDisplay = useCpg ? `+${quickCpg}¢/gal` : `+${quickBonus}%`;
            const catLabel = quickCategory ? CATEGORIES.find(c => c.value === quickCategory)?.label : 'All Categories';
            return (
              <div style={s.quickPreview}>
                <span style={s.quickPreviewText}>
                  📢 Will post: <strong>{bonusDisplay} {catLabel} Bonus</strong>
                  {' '}· {({ today: 'Today only', '3d': '3 days', '1w': '1 week', '2w': '2 weeks', '1m': '1 month' } as const)[quickDuration]}
                </span>
                <button style={s.quickPostBtn} onClick={handleQuickPost} disabled={createMutation.isPending}>
                  ⚡ Review &amp; Post
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Suggestion Templates */}
      {showTemplates && (
        <div style={s.suggestionsBox}>
          <h2 style={s.suggestTitle}>💡 Promotion Templates</h2>
          <p style={s.suggestSub}>Click any template to instantly pre-fill the form - you just set the dates and submit.</p>
          <div style={s.groupTabs}>
            {TEMPLATE_GROUPS.map((g) => (
              <button key={g} style={{ ...s.groupTab, ...(activeGroup === g ? s.groupTabActive : {}) }} onClick={() => setActiveGroup(g)}>
                {g} ({TEMPLATES.filter((t) => t.group === g).length})
              </button>
            ))}
          </div>
          <div style={s.templateGrid}>
            {groupedTemplates.map((t, i) => (
              <div key={i} style={s.templateCard}>
                <div style={s.templateIcon}>{t.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={s.templateTitle}>{t.title}</div>
                  <div style={s.templateDesc}>{t.description}</div>
                  <div style={s.templateMeta}>
                    {t.bonusRate && <span style={s.templateBadge}>+{t.bonusRate}% bonus</span>}
                    {t.category && <span style={s.templateCat}>{t.category.replace(/_/g, ' ')}</span>}
                  </div>
                </div>
                <button style={s.useBtn} onClick={() => applyTemplate(t)}>Use →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <form id="offer-form" style={s.form} onSubmit={handleCreate}>
          <h2 style={{ margin: '0 0 4px', color: PRIMARY, fontSize: 17, fontWeight: 800 }}>
            {title || 'New Promotion'}
          </h2>

          {/* ── Step 1: Category ─────────────────────────────────────────── */}
          <div style={s.formSection}>
            <div style={s.formSectionLabel}>1 · Category <span style={s.required}>required</span></div>
            <div style={s.catGrid}>
              {[
                { value: '',              emoji: '🌐', label: 'Store-wide' },
                { value: 'GAS',           emoji: '⛽', label: 'Gas'        },
                { value: 'DIESEL',        emoji: '🚛', label: 'Diesel'     },
                { value: 'HOT_FOODS',     emoji: '🌭', label: 'Hot Foods'  },
                { value: 'GROCERIES',     emoji: '🛒', label: 'Groceries'  },
                { value: 'FROZEN_FOODS',  emoji: '🧊', label: 'Frozen'     },
                { value: 'FRESH_FOODS',   emoji: '🥗', label: 'Fresh'      },
                { value: 'OTHER',         emoji: '🏪', label: 'Other'      },
              ].map(c => (
                <button key={c.value} type="button"
                  style={{ ...s.catCard, ...(category === c.value ? s.catCardActive : {}) }}
                  onClick={() => { setCategory(c.value); setGasBonusCpg(''); setGasBonusType('cpg'); setBonusRate(''); }}>
                  <span style={{ fontSize: 20 }}>{c.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Bonus (only shown after category chosen) ──────────── */}
          {category !== null && (
            <div style={s.formSection}>
              <div style={s.formSectionLabel}>2 · Bonus</div>

              {(category === 'GAS' || category === 'DIESEL') ? (
                /* Gas/Diesel: toggle between ¢/gal and % */
                <div>
                  <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #dee2e6', width: 'fit-content' }}>
                    <button type="button"
                      style={{ padding: '8px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer', border: 'none', background: gasBonusType === 'cpg' ? PRIMARY : '#f8f9fa', color: gasBonusType === 'cpg' ? '#fff' : TEXT_MUTED }}
                      onClick={() => setGasBonusType('cpg')}>
                      ⛽ ¢ / gallon
                    </button>
                    <button type="button"
                      style={{ padding: '8px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer', border: 'none', borderLeft: '1.5px solid #dee2e6', background: gasBonusType === 'pct' ? PRIMARY : '#f8f9fa', color: gasBonusType === 'pct' ? '#fff' : TEXT_MUTED }}
                      onClick={() => setGasBonusType('pct')}>
                      💲 % of amount
                    </button>
                  </div>
                  {gasBonusType === 'cpg' ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" min="0" max={MAX_CENTS_PER_GALLON} step="0.5" aria-label="Cents per gallon bonus"
                          style={{ ...s.input, width: 120 }}
                          value={gasBonusCpg} onChange={e => setGasBonusCpg(e.target.value)}
                          placeholder="e.g. 2" />
                        <span style={s.unit}>¢ / gallon bonus</span>
                      </div>
                      {gasBonusCpg && !isNaN(parseFloat(gasBonusCpg)) && parseFloat(gasBonusCpg) > 0 && (
                        <div style={s.calcHint}>10 gal fill → +${(10 * parseFloat(gasBonusCpg) / 100).toFixed(2)} cashback on top of base rate</div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" min="0" max={CASHBACK_CAP * 100} step="0.5" aria-label="Bonus percent of the purchase amount"
                          style={{ ...s.input, width: 120 }}
                          value={bonusRate} onChange={e => setBonusRate(e.target.value)}
                          placeholder="e.g. 2" />
                        <span style={s.unit}>% of purchase amount</span>
                      </div>
                      {bonusRate && !isNaN(parseFloat(bonusRate)) && parseFloat(bonusRate) > 0 && (
                        <div style={s.calcHint}>$40 fill-up → +${(40 * parseFloat(bonusRate) / 100).toFixed(2)} cashback on top of base rate</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* All other categories: % only, optional per-tier */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" min="0" max={CASHBACK_CAP * 100} step="0.5" aria-label="Bonus percent, same for all tiers"
                        style={{ ...s.input, width: 120 }}
                        value={bonusRate} onChange={e => setBonusRate(e.target.value)}
                        placeholder="e.g. 3" />
                      <span style={s.unit}>% bonus - same for all tiers</span>
                    </div>
                    <button type="button" onClick={() => setUseTierBonuses(!useTierBonuses)}
                      style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20, border: '1px solid #dee2e6', background: useTierBonuses ? PRIMARY : '#f8f9fa', color: useTierBonuses ? '#fff' : TEXT_MUTED, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontWeight: 600 }}>
                      {useTierBonuses ? '🏆 Per-tier on' : '🏆 Per-tier?'}
                    </button>
                  </div>
                  {useTierBonuses && (
                    <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {TIERS.map(tier => (
                        <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 15, minWidth: 80, fontWeight: 600 }}>{TIER_EMOJI[tier]} {tier[0]+tier.slice(1).toLowerCase()}</span>
                          <input type="number" min="0" max={CASHBACK_CAP * 100} step="0.5" value={tierBonuses[tier]} aria-label={`${tier[0]}${tier.slice(1).toLowerCase()} bonus percent`}
                            onChange={e => setTierBonuses(p => ({ ...p, [tier]: e.target.value }))}
                            style={{ ...s.input, width: 70, margin: 0 }} placeholder="%" />
                          <span style={{ fontSize: 14, color: TEXT_MUTED }}>%</span>
                        </div>
                      ))}
                      <div style={{ gridColumn: '1 / -1', fontSize: 13, color: TEXT_MUTED }}>A tier left blank gets no bonus from this promotion, not the top tier's rate.</div>
                    </div>
                  )}
                  {bonusRate && !isNaN(parseFloat(bonusRate)) && parseFloat(bonusRate) > 0 && (
                    <div style={s.calcHint}>$20 purchase → +${(20 * parseFloat(bonusRate) / 100).toFixed(2)} bonus cashback on top of base rate</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Dates + Scope ─────────────────────────────────────── */}
          {category !== null && (
            <div style={s.formSection}>
              <div style={s.formSectionLabel}>3 · Duration & Scope</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label} htmlFor="offer-start">Start Date *</label>
                  <input id="offer-start" style={s.input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label style={s.label} htmlFor="offer-end">End Date *</label>
                  <input id="offer-end" style={s.input} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              {isStoreManager ? (
                <div style={{ padding: '8px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 15, color: PRIMARY, fontWeight: 600, marginTop: 8 }}>
                  📍 This promotion will apply to your store only
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <label style={s.label} htmlFor="offer-scope">Apply To</label>
                  <select id="offer-scope" style={s.input} value={type} onChange={e => { setType(e.target.value as any); setStoreId(''); }}>
                    <option value="ALL_STORES">🌐 All Stores</option>
                    <option value="SPECIFIC_STORE">📍 Specific Store Only</option>
                  </select>
                  {type === 'SPECIFIC_STORE' && (
                    <>
                      <select aria-label="Choose a store" style={{ ...s.input, marginTop: 8 }} value={storeId} onChange={e => setStoreId(e.target.value)}>
                        <option value="">-- Choose a store --</option>
                        {stores.map((store: any) => (
                          <option key={store.id} value={store.id}>{store.name} - {store.city}, {store.state}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Title + optional image ───────────────────────────── */}
          {category !== null && (
            <div style={s.formSection}>
              <div style={s.formSectionLabel}>4 · Title & Image</div>
              <input aria-label="Title" style={s.input} value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Leave blank to auto-generate" />
              <textarea aria-label="Description" style={{ ...s.input, height: 70, resize: 'vertical', marginTop: 8 }} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional - auto-generated if blank)" />
              <input aria-label="Offer image (optional)" ref={fileRef} type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} style={{ ...s.input, marginTop: 8 }} />
            </div>
          )}

          {category !== null && (
            <div style={s.formSection}>
              <div style={s.formSectionLabel}>5 · Age Restriction</div>
              <button type="button" onClick={() => setRequires21(!requires21)}
                style={{ ...s.age21Toggle, ...(requires21 ? s.age21ToggleOn : {}) }}>
                <span>🔞 Age-restricted (21+)</span>
                <span style={{ fontWeight: 800 }}>{requires21 ? 'ON' : 'OFF'}</span>
              </button>
              {requires21 && (
                <div style={s.age21Hint}>Customers see this blurred with a 21+ prompt until they confirm their age.</div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button style={s.saveBtn} type="submit" disabled={createMutation.isPending || category === null}>
              {createMutation.isPending ? 'Creating...' : 'Create Offer'}
            </button>
            <button style={s.cancelFormBtn} type="button" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── Promotions Tab ── */}
      {mainTab === 'promotions' && (
        <>
          {isLoading ? (
            <CardSkeleton count={4} />
          ) : promotionOffers.length === 0 ? (
            <div style={s.empty}>Nothing is live or scheduled. Customers see no promotion right now. Use a template or post one.</div>
          ) : (
            <>
              {livePromotions.length > 0 ? (
                <>
                  <h2 style={s.sectionHead}>Live Now ({livePromotions.length})</h2>
                  <div style={s.grid}>
                    {livePromotions.map((offer: any) => (
                      <OfferCard key={offer.id} offer={offer} onDelete={() => setConfirmDeleteId(offer.id)} onReuse={() => reuseOffer(offer)} />
                    ))}
                  </div>
                </>
              ) : (
                <div style={s.empty}>Nothing is live right now. Customers see no promotion until a scheduled one starts.</div>
              )}
              {scheduledPromotions.length > 0 && (
                <>
                  <h2 style={{ ...s.sectionHead, marginTop: 28 }}>Scheduled ({scheduledPromotions.length})</h2>
                  <div style={s.grid}>
                    {scheduledPromotions.map((offer: any) => (
                      <OfferCard key={offer.id} offer={offer} isScheduled onDelete={() => setConfirmDeleteId(offer.id)} onReuse={() => reuseOffer(offer)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          <div style={{ marginTop: 40 }}>
            <button style={s.historyToggle} onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? '▾' : '▸'} Past Promotions (click to load &amp; reuse)
            </button>
            {showHistory && (
              pastPromotions.length === 0 ? (
                <div style={s.empty}>No past promotions found.</div>
              ) : (
                <>
                  <p style={{ color: TEXT_MUTED, fontSize: 15, margin: '0 0 16px' }}>
                    {pastPromotions.length} past promotions - click ♻️ Reuse on any to pre-fill the form.
                  </p>
                  <div style={s.grid}>
                    {pastPromotions.map((offer: any) => (
                      <OfferCard key={offer.id} offer={offer} isPast onReuse={() => reuseOffer(offer)} />
                    ))}
                  </div>
                </>
              )
            )}
          </div>
        </>
      )}

      {/* ── Deals Tab ── */}
      {mainTab === 'deals' && (
        <>
          {/* Deal create form */}
          {showDealForm && (
            <form id="deal-form" style={s.form} onSubmit={handleCreateDeal}>
              <h2 style={{ margin: '0 0 16px', color: PRIMARY, fontSize: 17, fontWeight: 800 }}>
                {dealTitle ? `🏷️ ${dealTitle}` : 'New Deal'}
              </h2>
              <label style={s.label} htmlFor="deal-title">Product / Item Name *</label>
              <input id="deal-title" style={s.input} value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="e.g. Monster Energy, 2-Liter Pepsi" />
              <label style={s.label} htmlFor="deal-text">Deal Text * (shown prominently in-app)</label>
              <input id="deal-text" style={s.input} value={dealText} onChange={(e) => setDealText(e.target.value)} placeholder='e.g. 2 for $5, 3 for $4, Buy 2 Get 1 Free' maxLength={40} />
              <label style={s.label} htmlFor="deal-desc">Description (optional)</label>
              <input id="deal-desc" style={s.input} value={dealDescription} onChange={(e) => setDealDescription(e.target.value)} placeholder="Any extra details about the deal..." />
              <label style={s.label} htmlFor="deal-image">Image (optional)</label>
              <input id="deal-image" ref={dealFileRef} type="file" accept="image/*" onChange={e => setDealImageFile(e.target.files?.[0] || null)} style={s.input} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label} htmlFor="deal-start">Start Date *</label>
                  <input id="deal-start" style={s.input} type="date" value={dealStartDate} onChange={(e) => setDealStartDate(e.target.value)} />
                </div>
                <div>
                  <label style={s.label} htmlFor="deal-end">End Date *</label>
                  <input id="deal-end" style={s.input} type="date" value={dealEndDate} onChange={(e) => setDealEndDate(e.target.value)} />
                </div>
              </div>
              {isStoreManager ? (
                <div style={{ padding: '8px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 15, color: PRIMARY, fontWeight: 600 }}>
                  📍 This deal will apply to your store only
                </div>
              ) : (
                <>
                  <label style={s.label} htmlFor="deal-scope">Apply To</label>
                  <select id="deal-scope" style={s.input} value={dealType} onChange={(e) => { setDealType(e.target.value as any); setDealStoreId(''); }}>
                    <option value="ALL_STORES">🌐 All {stores.length || ''} Stores</option>
                    <option value="SPECIFIC_STORE">📍 Specific Store Only</option>
                  </select>
                  {dealType === 'SPECIFIC_STORE' && (
                    <>
                      <label style={s.label} htmlFor="deal-store">Select Store *</label>
                      <select id="deal-store" style={s.input} value={dealStoreId} onChange={(e) => setDealStoreId(e.target.value)}>
                        <option value="">-- Choose a store --</option>
                        {stores.map((store: any) => (
                          <option key={store.id} value={store.id}>{store.name} - {store.city}, {store.state}</option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}
              <label style={s.label} htmlFor="deal-category">Product Category (optional)</label>
              <select id="deal-category" style={s.input} value={dealCategory} onChange={(e) => setDealCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <label style={s.label}>Age Restriction</label>
              <button type="button" onClick={() => setDealRequires21(!dealRequires21)}
                style={{ ...s.age21Toggle, ...(dealRequires21 ? s.age21ToggleOn : {}) }}>
                <span>🔞 Age-restricted (21+)</span>
                <span style={{ fontWeight: 800 }}>{dealRequires21 ? 'ON' : 'OFF'}</span>
              </button>
              {dealRequires21 && (
                <div style={s.age21Hint}>Customers see this blurred with a 21+ prompt until they confirm their age.</div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button style={s.saveBtn} type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Post Deal'}
                </button>
                <button style={s.cancelFormBtn} type="button" onClick={resetDealForm}>Cancel</button>
              </div>
            </form>
          )}

          {isLoading ? (
            <CardSkeleton count={4} />
          ) : dealOffers.length === 0 ? (
            <div style={s.empty}>No live or scheduled deals. Click "+ New Deal" to post one.</div>
          ) : (
            <>
              {liveDeals.length > 0 ? (
                <>
                  <h2 style={s.sectionHead}>Live Now ({liveDeals.length})</h2>
                  <div style={s.grid}>
                    {liveDeals.map((offer: any) => (
                      <DealCard key={offer.id} offer={offer} onDelete={() => setConfirmDeleteId(offer.id)} />
                    ))}
                  </div>
                </>
              ) : (
                <div style={s.empty}>No deal is live right now.</div>
              )}
              {scheduledDeals.length > 0 && (
                <>
                  <h2 style={{ ...s.sectionHead, marginTop: 28 }}>Scheduled ({scheduledDeals.length})</h2>
                  <div style={s.grid}>
                    {scheduledDeals.map((offer: any) => (
                      <DealCard key={offer.id} offer={offer} isScheduled onDelete={() => setConfirmDeleteId(offer.id)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ marginTop: 40 }}>
            <button style={s.historyToggle} onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? '▾' : '▸'} Past Deals (click to load)
            </button>
            {showHistory && (
              pastDeals.length === 0 ? (
                <div style={s.empty}>No past deals found.</div>
              ) : (
                <div style={s.grid}>
                  {pastDeals.map((offer: any) => (
                    <DealCard key={offer.id} offer={offer} isPast />
                  ))}
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Offer Card ───────────────────────────────────────────────────────────────

function OfferCard({ offer, onDelete, onReuse, isPast, isScheduled }: {
  offer: any; onDelete?: () => void; onReuse: () => void; isPast?: boolean; isScheduled?: boolean;
}) {
  return (
    <div style={{ ...s.card, ...(isPast ? s.cardPast : {}) }}>
      {offer.imageUrl && <img src={offer.imageUrl} alt={offer.title} style={s.img} />}
      <div style={s.cardBody}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={offer.type === 'ALL_STORES' ? s.tagAll : s.tagStore}>
            {offer.type === 'ALL_STORES' ? '🌐 All Stores' : `📍 ${offer.store?.name ?? 'Store'}`}
          </span>
          {offer.category && <span style={s.tagCat}>{offer.category.replace(/_/g, ' ')}</span>}
          {offer.requires21 && <span style={s.tag21}>🔞 21+</span>}
          {isPast && <span style={s.tagPast}>{offer.isActive === false ? 'Removed' : 'Ended'}</span>}
          {isScheduled && <span style={s.tagScheduled}>Starts {storeDayLong(offer.startDate)}</span>}
        </div>
        <h3 style={s.cardTitle}>{offer.title}</h3>
        {offer.description && <p style={s.cardDesc}>{offer.description}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {offer.gasBonusCentsPerGallon != null ? (
            <span style={{ ...s.badge, background: '#fff3e0', color: '#c04000', border: '1px solid #ffcc80' }}>
              ⛽ +{offer.gasBonusCentsPerGallon}¢ / gallon
            </span>
          ) : offer.tierBonusRates && Object.keys(offer.tierBonusRates).length > 0 ? (
            Object.entries(offer.tierBonusRates as Record<string, number>).map(([tier, rate]) => (
              <span key={tier} style={s.badge}>{TIER_EMOJI[tier as TierKey]} +{pctText(rate)}%</span>
            ))
          ) : offer.bonusRate ? (
            <span style={{ ...s.badge, background: offer.category ? '#fff0f0' : '#fff5e0', color: offer.category ? '#c0392b' : '#b7700a' }}>
              {offer.category ? '🎯' : '🔥'} +{pctText(offer.bonusRate)}%{offer.category ? ` ${offer.category.replace(/_/g, ' ').toLowerCase()}` : ' store-wide'}
            </span>
          ) : null}
        </div>
        <p style={s.cardDate}>{fmtDate(offer.startDate)} → {fmtDate(offer.endDate)}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={s.reuseBtn} onClick={onReuse}>♻️ Reuse</button>
          {!isPast && onDelete && <button style={s.deleteBtn} onClick={onDelete}>Delete</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({ offer, onDelete, isPast, isScheduled }: { offer: any; onDelete?: () => void; isPast?: boolean; isScheduled?: boolean }) {
  return (
    <div style={{ ...s.card, ...(isPast ? s.cardPast : {}), borderLeft: '4px solid #E63946' }}>
      {offer.imageUrl && <img src={offer.imageUrl} alt={offer.title} style={s.img} />}
      <div style={s.cardBody}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={offer.type === 'ALL_STORES' ? s.tagAll : s.tagStore}>
            {offer.type === 'ALL_STORES' ? '🌐 All Stores' : `📍 ${offer.store?.name ?? 'Store'}`}
          </span>
          {offer.category && <span style={s.tagCat}>{offer.category.replace(/_/g, ' ')}</span>}
          {offer.requires21 && <span style={s.tag21}>🔞 21+</span>}
          {isPast && <span style={s.tagPast}>{offer.isActive === false ? 'Removed' : 'Ended'}</span>}
          {isScheduled && <span style={s.tagScheduled}>Starts {storeDayLong(offer.startDate)}</span>}
        </div>
        <div style={s.dealTextBig}>{offer.dealText}</div>
        <h3 style={s.cardTitle}>{offer.title}</h3>
        {offer.description && offer.description !== offer.dealText && (
          <p style={s.cardDesc}>{offer.description}</p>
        )}
        <p style={s.cardDate}>{fmtDate(offer.startDate)} → {fmtDate(offer.endDate)}</p>
        {!isPast && onDelete && (
          <div style={{ marginTop: 12 }}>
            <button style={s.deleteBtn} onClick={onDelete}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: 'clamp(16px, 4vw, 32px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 800, color: PRIMARY, margin: 0 },
  sub: { color: TEXT_MUTED, marginTop: 4, fontSize: 15 },

  addBtn: { background: '#D62839', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 15 },
  templateBtn: { background: '#fff', color: PRIMARY, borderWidth: '1.5px', borderStyle: 'solid', borderColor: PRIMARY, borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 15 },

  quickPanel: {
    background: '#f0fdf4', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#86efac',
    borderRadius: 16, padding: '20px 24px', marginBottom: 24,
  },
  quickTitle: { fontWeight: 800, fontSize: 15, color: '#14532d', marginBottom: 16 },
  quickRow: { display: 'flex', flexDirection: 'column' as const, gap: 16 },
  quickGroup: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  quickLabel: { fontWeight: 700, fontSize: 13, color: '#166534', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  quickChips: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  quickBonusRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  quickInput: { padding: '8px 12px', borderRadius: 8, borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#86efac', fontSize: 14, width: 90, outline: 'none', background: '#fff' },
  chip: { padding: '6px 14px', borderRadius: 20, borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#d1fae5', background: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#374151' },
  chipActive: { background: '#15803d', color: '#fff', borderColor: '#15803d' },
  quickPreview: { marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', borderRadius: 10, padding: '12px 16px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#86efac', flexWrap: 'wrap' as const },
  quickPreviewText: { fontSize: 14, color: '#166534' },
  quickPostBtn: { background: '#15803d', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 800, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' as const },

  suggestionsBox: { background: '#f8faff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#d0d9f0', borderRadius: 16, padding: 24, marginBottom: 28 },
  suggestTitle: { margin: '0 0 4px', color: PRIMARY, fontSize: 16, fontWeight: 800 },
  suggestSub: { margin: '0 0 16px', color: TEXT_MUTED, fontSize: 15 },
  groupTabs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  groupTab: { padding: '6px 14px', borderRadius: 20, borderWidth: '1px', borderStyle: 'solid', borderColor: '#dee2e6', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: TEXT_MUTED },
  groupTabActive: { background: PRIMARY, color: '#fff', borderColor: PRIMARY },
  templateGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  templateCard: { background: '#fff', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e9ecef' },
  templateIcon: { fontSize: 22, flexShrink: 0, width: 32, textAlign: 'center' },
  templateTitle: { fontWeight: 700, fontSize: 14, color: PRIMARY, marginBottom: 4 },
  templateDesc: { fontSize: 14, color: TEXT_MUTED, lineHeight: 1.5 },
  templateMeta: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  templateBadge: { background: '#fef2f2', color: '#D62839', borderRadius: 6, padding: '2px 8px', fontSize: 13, fontWeight: 700 },
  templateCat: { background: '#f0fdf4', color: '#15803d', borderRadius: 6, padding: '2px 8px', fontSize: 13, fontWeight: 600 },
  useBtn: { background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'center' },

  form: { background: '#fff', borderRadius: 16, padding: '24px 28px', marginBottom: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: 0, borderWidth: '1px', borderStyle: 'solid', borderColor: '#f0f1f2' },
  formSection: { padding: '16px 0', borderBottom: '1px solid #f1f3f5', display: 'flex', flexDirection: 'column' as const, gap: 10 },
  formSectionLabel: { fontWeight: 800, fontSize: 15, color: PRIMARY, marginBottom: 2 },
  required: { fontWeight: 600, fontSize: 13, color: '#D62839', marginLeft: 4 },
  catGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 },
  catCard: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '10px 6px', borderRadius: 10, border: '1.5px solid #e9ecef', background: '#fafafa', cursor: 'pointer', gap: 2, transition: 'all 0.15s' },
  catCardActive: { border: '2px solid #1D3557', background: '#e8f0fb', color: PRIMARY },
  unit: { fontSize: 15, color: TEXT_MUTED, fontWeight: 600, whiteSpace: 'nowrap' as const },
  calcHint: { fontSize: 13, color: '#15803d', fontStyle: 'italic', marginTop: 4 },
  label: { fontWeight: 700, fontSize: 14, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { padding: '10px 14px', borderRadius: 9, borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb', fontSize: 14, width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
  saveBtn: { background: '#0f5132', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  cancelFormBtn: { background: '#f8fafc', color: TEXT_MUTED, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 10, padding: '12px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },

  age21Toggle: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '10px 14px', borderRadius: 9, border: '1.5px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  age21ToggleOn: { background: '#b91c1c', borderColor: '#b91c1c', color: '#fff' },
  age21Hint: { fontSize: 13, color: TEXT_MUTED, marginTop: 6, lineHeight: 1.5 },

  sectionHead: {
    fontSize: 14, fontWeight: 800, color: PRIMARY, marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 8,
    borderLeft: '4px solid #1D3557', paddingLeft: 12,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 18 },
  card: { background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  cardPast: { opacity: 0.75, boxShadow: 'none', borderWidth: '1px', borderStyle: 'solid', borderColor: '#f0f1f2' },
  img: { width: '100%', height: 160, objectFit: 'cover' as const },
  cardBody: { padding: '16px 18px' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 6px' },
  cardDesc: { color: TEXT_MUTED, fontSize: 15, margin: '0 0 8px', lineHeight: 1.5 },
  cardDate: { color: TEXT_MUTED, fontSize: 13, margin: '8px 0 0', fontWeight: 600 },
  badge: { display: 'inline-block', background: '#fef2f2', color: '#D62839', borderRadius: 8, padding: '4px 10px', fontSize: 14, fontWeight: 700 },
  tagAll: { background: '#eff6ff', color: PRIMARY, borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  tagStore: { background: '#fffbeb', color: '#b45309', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  tagCat: { background: '#f0fdf4', color: '#15803d', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  tagScheduled: { background: '#e8f0fb', color: PRIMARY, borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  confirmNote: { marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fff8e6', color: '#5c4400', fontSize: 14, lineHeight: 1.45 },
  tagPast: { background: '#f8fafc', color: TEXT_MUTED, borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  tag21: { background: '#fef2f2', color: '#b91c1c', borderRadius: 6, padding: '3px 9px', fontSize: 13, fontWeight: 700 },
  reuseBtn: { background: '#eff6ff', color: PRIMARY, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  deleteBtn: { background: '#fff1f2', color: '#D62839', borderWidth: '1px', borderStyle: 'solid', borderColor: '#fecaca', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  historyToggle: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: PRIMARY, padding: '8px 0', marginBottom: 8 },
  empty: { color: TEXT_MUTED, textAlign: 'center', padding: 60, fontSize: 14 },

  mainTabs: { display: 'flex', gap: 8, marginBottom: 24 },
  mainTab: {
    padding: '9px 20px', borderRadius: 10,
    borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#e5e7eb',
    background: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 700,
    color: TEXT_MUTED, display: 'flex', alignItems: 'center', gap: 8,
  },
  mainTabActive: { background: PRIMARY, color: '#fff', borderColor: PRIMARY },
  tabCount: { background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 7px', fontSize: 13, fontWeight: 700 },
  dealTextBig: { fontSize: 24, fontWeight: 900, color: '#D62839', marginBottom: 6, letterSpacing: -0.5 },
};
