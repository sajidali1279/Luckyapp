import { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { offersApi, storesApi, offerRequestsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { C, FONT, RADIUS, INPUT } from '../lib/theme';
import { Page, PageHeader, SectionTitle, Tabs, Button, Chip, Card, Badge, Notice, EmptyState, Field } from '../components/kit';
import { LayoutTemplate, Zap, Plus, X, AlertTriangle, Info, MapPin, Globe, Tag, ChevronDown, ChevronRight, BarChart3, RotateCcw, Trash2, Pencil, Square, Clock, BellOff } from 'lucide-react';
import Modal from '../components/Modal';
import { serverMessage } from '../lib/apiError';
import OfferResultsModal from '../components/OfferResultsModal';
import { storeToday, addDays, monthEnd, dayLabel, startOfStoreDay, endOfStoreDay, storeDayLong, storeDayTime } from '../lib/storeDates';
import { CASHBACK_CAP, MAX_CENTS_PER_GALLON, findClashes, tiersAtCeiling, pctText, type Clash, type DraftPromo, type PostedOffer } from '../lib/offerRules';
import { useTierRates, useCategoryRates } from './dashboard/queries';
import CostEstimate, { type EstimateInput } from '../components/offers/CostEstimate';
import OfferRequestsPanel from '../components/offers/OfferRequestsPanel';
import OfferCalendar from '../components/offers/OfferCalendar';
import ShelfDealsSection from '../components/offers/ShelfDealsSection';
import ChallengesPanel from '../components/offers/ChallengesPanel';
import { HappyHoursField, LastDayToggle, NO_HOURS, ALL_DAY, hoursFrom, hoursPayload, hoursProblem, hoursLabel, type HappyHours } from '../components/offers/HappyHours';
import { ImagePick } from '../components/offers/ImagePick';
import { SpanishFields, NO_SPANISH, spanishFrom, type SpanishWords } from '../components/offers/SpanishFields';
import { PhonePreview, type PreviewOffer } from '../components/offers/PhonePreview';
import { AudienceLimitsField, NO_AUDIENCE, audienceFrom, audiencePayload, audienceProblem, audienceLabel, type AudienceLimitsValue } from '../components/offers/AudienceLimits';

// ─── Suggestion Templates ─────────────────────────────────────────────────────

type Template = {
  icon: string;
  group: string;
  title: string;
  description: string;   // {bonus} becomes the percentage ("3%"): the words never promise more than the promotion pays
  bonusRate: string;
  category: string;
  hours?: HappyHours;    // the days (all day on them) or hours it pays in
  length?: number | 'month';   // how many days it runs from today (default a month)
};

// Days 0 = Sunday .. 6 = Saturday. "Every Tuesday" templates pay only on Tuesdays (all day), "3 to 6 PM" ones only then.
const onDays = (...days: number[]): HappyHours => ({ days, from: ALL_DAY, to: ALL_DAY });
const between = (from: string, to: string): HappyHours => ({ days: [], from, to });

const TEMPLATES: Template[] = [
  // Gas & Diesel
  { icon: '⛽', group: 'Gas & Diesel', title: 'Weekend Gas Bonus', description: 'Earn an extra {bonus} cashback on gas every Saturday and Sunday. Fill up and save at Lucky Stop!', bonusRate: '3', category: 'GAS', hours: onDays(6, 0) },
  { icon: '⛽', group: 'Gas & Diesel', title: 'Full Tank Friday', description: 'Fill up on a Friday and earn an extra {bonus} cashback on gas.', bonusRate: '3', category: 'GAS', hours: onDays(5) },
  { icon: '⛽', group: 'Gas & Diesel', title: 'Gas Saver Monday', description: 'Start the week with an extra {bonus} cashback on gas every Monday.', bonusRate: '3', category: 'GAS', hours: onDays(1) },
  { icon: '🚛', group: 'Gas & Diesel', title: 'Diesel Driver Deal', description: 'Truckers and fleet drivers earn an extra {bonus} cashback on every diesel fill.', bonusRate: '3', category: 'DIESEL' },
  { icon: '🚛', group: 'Gas & Diesel', title: 'Diesel Week', description: 'An extra {bonus} cashback on all diesel this week. A thank-you to our big rig regulars.', bonusRate: '3', category: 'DIESEL', length: 7 },
  // Hot Foods
  { icon: '🌮', group: 'Hot Foods', title: 'Hot Food Happy Hour', description: 'Earn an extra {bonus} cashback on hot food from 3 to 6 PM.', bonusRate: '5', category: 'HOT_FOODS', hours: between('15:00', '18:00') },
  { icon: '☕', group: 'Hot Foods', title: 'Morning Commuter Special', description: 'Earn an extra {bonus} cashback on hot food and coffee from 5 to 10 AM. Start your day rewarded.', bonusRate: '5', category: 'HOT_FOODS', hours: between('05:00', '10:00') },
  { icon: '🌮', group: 'Hot Foods', title: 'Taco Tuesday', description: 'An extra {bonus} cashback on hot food every Tuesday. Make Tuesday your Lucky Stop day!', bonusRate: '5', category: 'HOT_FOODS', hours: onDays(2) },
  { icon: '🌮', group: 'Hot Foods', title: 'Lunch Rush Deal', description: 'Grab lunch and earn an extra {bonus} cashback on hot food from 11 AM to 2 PM.', bonusRate: '5', category: 'HOT_FOODS', hours: between('11:00', '14:00') },
  { icon: '❄️', group: 'Hot Foods', title: 'Cold Weather Comfort', description: 'Warm up and earn an extra {bonus} cashback on hot food and hot drinks this week.', bonusRate: '5', category: 'HOT_FOODS', length: 7 },
  // Groceries
  { icon: '🛒', group: 'Groceries', title: 'Weekend Grocery Bonus', description: 'An extra {bonus} cashback on groceries every Saturday and Sunday. Stock up and save.', bonusRate: '3', category: 'GROCERIES', hours: onDays(6, 0) },
  { icon: '🛒', group: 'Groceries', title: 'Stock Up & Save', description: 'An extra {bonus} cashback on groceries all week. Every item counts toward your balance.', bonusRate: '3', category: 'GROCERIES', length: 7 },
  { icon: '🥗', group: 'Groceries', title: 'Fresh Food Friday', description: 'An extra {bonus} cashback on fresh food every Friday.', bonusRate: '5', category: 'FRESH_FOODS', hours: onDays(5) },
  { icon: '🧊', group: 'Groceries', title: 'Frozen Food Week', description: 'An extra {bonus} cashback on frozen food all week. Great savings on freezer favorites.', bonusRate: '5', category: 'FROZEN_FOODS', length: 7 },
  { icon: '🥗', group: 'Groceries', title: 'Healthy Choice Week', description: 'An extra {bonus} cashback on fresh food all week. Eating well pays off at Lucky Stop.', bonusRate: '5', category: 'FRESH_FOODS', length: 7 },
  // Seasonal
  { icon: '☀️', group: 'Seasonal', title: 'Summer Road Trip Bonus', description: 'All summer long, an extra {bonus} cashback on gas. Hit the road and rack up rewards at Lucky Stop.', bonusRate: '3', category: 'GAS' },
  { icon: '🎄', group: 'Seasonal', title: 'Holiday Weekend Bonus', description: 'An extra {bonus} cashback on every purchase over the holiday weekend. Happy holidays from Lucky Stop!', bonusRate: '5', category: '', length: 3 },
  { icon: '🎓', group: 'Seasonal', title: 'Back to School Special', description: 'An extra {bonus} cashback on groceries, snacks and drinks included. Fuel up for the school year!', bonusRate: '3', category: 'GROCERIES' },
  { icon: '🎆', group: 'Seasonal', title: 'Fourth of July Bonus', description: 'An extra {bonus} cashback on every purchase, July 4th only. Celebrate and save at Lucky Stop!', bonusRate: '5', category: '', length: 1 },
  { icon: '🏈', group: 'Seasonal', title: 'Game Day Bonus', description: 'An extra {bonus} cashback on hot food on game day. Score big at Lucky Stop.', bonusRate: '5', category: 'HOT_FOODS', length: 1 },
  { icon: '🎊', group: 'Seasonal', title: 'New Year Bonus', description: 'Start the year right: an extra {bonus} cashback on every purchase for the first 3 days of January.', bonusRate: '5', category: '', length: 3 },
  // Loyalty
  { icon: '💎', group: 'Loyalty', title: 'Thank You Month', description: 'An extra {bonus} cashback on every purchase this month. Our way of saying thank you.', bonusRate: '3', category: '', length: 'month' },
  { icon: '⚡', group: 'Loyalty', title: 'Flash Sale', description: "Today only: an extra {bonus} cashback on every purchase. Don't miss it!", bonusRate: '5', category: '', length: 1 },
  { icon: '🌟', group: 'Loyalty', title: 'Weekend Bonus', description: 'An extra {bonus} cashback on every purchase, every Saturday and Sunday.', bonusRate: '3', category: '', hours: onDays(6, 0) },
  { icon: '🎁', group: 'Loyalty', title: 'Surprise Bonus Week', description: 'Surprise! An extra {bonus} cashback on every purchase this week.', bonusRate: '3', category: '', length: 7 },
  // Products: a promotion pays on a whole category, so these name the category and say the product is in it
  { icon: '🥤', group: 'Products', title: 'Cold Drinks Day', description: 'An extra {bonus} cashback on groceries today, cold drinks and sodas included.', bonusRate: '5', category: 'GROCERIES', length: 1 },
  { icon: '🟢', group: 'Products', title: 'Energy Drink Monday', description: 'An extra {bonus} cashback on groceries every Monday, energy drinks included. Stay charged, stay rewarded.', bonusRate: '5', category: 'GROCERIES', hours: onDays(1) },
  { icon: '🟡', group: 'Products', title: 'Snack Attack Week', description: 'An extra {bonus} cashback on groceries this week, chips and snacks included.', bonusRate: '5', category: 'GROCERIES', length: 7 },
  { icon: '☕', group: 'Products', title: 'Coffee Lover Week', description: 'An extra {bonus} cashback on hot food and coffee this week.', bonusRate: '5', category: 'HOT_FOODS', length: 7 },
  { icon: '💧', group: 'Products', title: 'Hydration Week', description: 'An extra {bonus} cashback on groceries this week, bottled water included.', bonusRate: '3', category: 'GROCERIES', length: 7 },
];

// Each template in Spanish: [title, description], {bonus} as in English
const TEMPLATE_ES: Record<string, [string, string]> = {
  'Weekend Gas Bonus': ['Bono de gasolina de fin de semana', 'Gana un {bonus} extra de reembolso en gasolina cada sábado y domingo. ¡Llena el tanque y ahorra en Lucky Stop!'],
  'Full Tank Friday': ['Viernes de tanque lleno', 'Llena el tanque un viernes y gana un {bonus} extra de reembolso en gasolina.'],
  'Gas Saver Monday': ['Lunes de ahorro en gasolina', 'Empieza la semana con un {bonus} extra de reembolso en gasolina cada lunes.'],
  'Diesel Driver Deal': ['Oferta para conductores de diésel', 'Camioneros y flotillas ganan un {bonus} extra de reembolso en cada carga de diésel.'],
  'Diesel Week': ['Semana del diésel', 'Un {bonus} extra de reembolso en todo el diésel esta semana. Un agradecimiento a nuestros clientes de siempre.'],
  'Hot Food Happy Hour': ['Hora feliz de comida caliente', 'Gana un {bonus} extra de reembolso en comida caliente de 3 a 6 PM.'],
  'Morning Commuter Special': ['Especial de la mañana', 'Gana un {bonus} extra de reembolso en comida caliente y café de 5 a 10 AM. Empieza tu día con premio.'],
  'Taco Tuesday': ['Martes de Tacos', 'Un {bonus} extra de reembolso en comida caliente cada martes. ¡Haz del martes tu día de Lucky Stop!'],
  'Lunch Rush Deal': ['Oferta de la hora del almuerzo', 'Compra tu almuerzo y gana un {bonus} extra de reembolso en comida caliente de 11 AM a 2 PM.'],
  'Cold Weather Comfort': ['Calorcito para el frío', 'Caliéntate y gana un {bonus} extra de reembolso en comida caliente y bebidas calientes esta semana.'],
  'Weekend Grocery Bonus': ['Bono de abarrotes de fin de semana', 'Un {bonus} extra de reembolso en abarrotes cada sábado y domingo. Surte tu despensa y ahorra.'],
  'Stock Up & Save': ['Surte y ahorra', 'Un {bonus} extra de reembolso en abarrotes toda la semana. Cada artículo suma a tu saldo.'],
  'Fresh Food Friday': ['Viernes de comida fresca', 'Un {bonus} extra de reembolso en comida fresca cada viernes.'],
  'Frozen Food Week': ['Semana de congelados', 'Un {bonus} extra de reembolso en comida congelada toda la semana. Grandes ahorros en tus favoritos del congelador.'],
  'Healthy Choice Week': ['Semana saludable', 'Un {bonus} extra de reembolso en comida fresca toda la semana. Comer bien vale la pena en Lucky Stop.'],
  'Summer Road Trip Bonus': ['Bono de viaje de verano', 'Todo el verano, un {bonus} extra de reembolso en gasolina. Sal a la carretera y acumula premios en Lucky Stop.'],
  'Holiday Weekend Bonus': ['Bono de fin de semana festivo', 'Un {bonus} extra de reembolso en todas tus compras el fin de semana festivo. ¡Felices fiestas de parte de Lucky Stop!'],
  'Back to School Special': ['Especial de regreso a clases', 'Un {bonus} extra de reembolso en abarrotes, incluidos snacks y bebidas. ¡Prepárate para el año escolar!'],
  'Fourth of July Bonus': ['Bono del 4 de julio', 'Un {bonus} extra de reembolso en todas tus compras, solo el 4 de julio. ¡Celebra y ahorra en Lucky Stop!'],
  'Game Day Bonus': ['Bono de día de partido', 'Un {bonus} extra de reembolso en comida caliente el día del partido. Anota en grande en Lucky Stop.'],
  'New Year Bonus': ['Bono de Año Nuevo', 'Empieza bien el año: un {bonus} extra de reembolso en todas tus compras los primeros 3 días de enero.'],
  'Thank You Month': ['Mes de agradecimiento', 'Un {bonus} extra de reembolso en cada compra este mes. Nuestra forma de darte las gracias.'],
  'Flash Sale': ['Venta relámpago', 'Solo hoy: un {bonus} extra de reembolso en todas tus compras. ¡No te lo pierdas!'],
  'Weekend Bonus': ['Bono de fin de semana', 'Un {bonus} extra de reembolso en cada compra, cada sábado y domingo.'],
  'Surprise Bonus Week': ['Semana de bono sorpresa', '¡Sorpresa! Un {bonus} extra de reembolso en cada compra esta semana.'],
  'Cold Drinks Day': ['Día de bebidas frías', 'Un {bonus} extra de reembolso en abarrotes hoy, incluidas bebidas frías y refrescos.'],
  'Energy Drink Monday': ['Lunes de bebidas energéticas', 'Un {bonus} extra de reembolso en abarrotes cada lunes, incluidas las bebidas energéticas. Mantente con energía y con premio.'],
  'Snack Attack Week': ['Semana de antojos', 'Un {bonus} extra de reembolso en abarrotes esta semana, incluidas papitas y snacks.'],
  'Coffee Lover Week': ['Semana del café', 'Un {bonus} extra de reembolso en comida caliente y café esta semana.'],
  'Hydration Week': ['Semana de hidratación', 'Un {bonus} extra de reembolso en abarrotes esta semana, incluida el agua embotellada.'],
};

/** The words with the template's own percentage in them ("an extra 3% cashback"). */
const templateText = (tm: Template, rate = tm.bonusRate) => tm.description.replace('{bonus}', `${rate}%`);
/** "Sat, Sun, all day · 1 month" for the template list. */
const templateWhen = (tm: Template) => [tm.hours ? hoursLabel(hoursPayload(tm.hours)) : null, tm.length === 1 ? 'Today only' : typeof tm.length === 'number' ? `${tm.length} days` : '1 month'].filter(Boolean).join(' · ');

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
type Pending = { kind: PostKind; fd: FormData; title: string; what: string; where: string; when: string; example: string | null; notes: string[]; clashes: Clash[]; notify: string; estimate: EstimateInput; preview: PreviewOffer };
type MainTab = 'promotions' | 'deals' | 'challenges' | 'requests' | 'calendar';
const MAIN_TABS: MainTab[] = ['promotions', 'deals', 'challenges', 'requests', 'calendar'];

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Offers() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const isHQ = user?.role === 'SUPER_ADMIN' || user?.role === 'DEV_ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as MainTab | null;
  const [mainTab, setMainTabState] = useState<MainTab>(urlTab && MAIN_TABS.includes(urlTab) && (isHQ || urlTab === 'deals' || urlTab === 'calendar') ? urlTab : 'promotions');
  function setMainTab(v: MainTab) {
    setMainTabState(v);
    setSearchParams((sp) => { const n = new URLSearchParams(sp); if (v === 'promotions') n.delete('tab'); else n.set('tab', v); return n; }, { replace: true });
  }
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
  const [hours, setHours] = useState<HappyHours>(NO_HOURS);
  const [lastDayReminder, setLastDayReminder] = useState(true);
  const [spanish, setSpanish] = useState<SpanishWords>(NO_SPANISH);
  const [dealSpanish, setDealSpanish] = useState<SpanishWords>(NO_SPANISH);
  const [aud, setAud] = useState<AudienceLimitsValue>(NO_AUDIENCE);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [resultsFor, setResultsFor] = useState<{ id: string; title: string } | null>(null);
  // Change a live or scheduled offer's words and dates, or end it now (it then shows under Past as Ended, with its results)
  const [editing, setEditing] = useState<any | null>(null);
  const [endingNow, setEndingNow] = useState<any | null>(null);
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
    queryKey: ['offers-history'], queryFn: () => offersApi.getHistory(), enabled: showHistory || mainTab === 'calendar',
  });
  // getAccessible() avoids a pointless 403 for Store Manager (getAll() is
  // SuperAdmin+ only) — the store picker this feeds is already hidden for
  // that role, but there's no reason to fire a call guaranteed to fail.
  const { data: storesData } = useQuery({ queryKey: ['accessible-stores'], queryFn: () => storesApi.getAccessible() });
  // Store managers' requests waiting for HQ (the Requests tab's count; the panel shares this list)
  const { data: requestsData } = useQuery({ queryKey: ['offer-requests'], queryFn: () => offerRequestsApi.list(), enabled: isHQ });
  const waitingRequests = ((requestsData?.data?.data ?? []) as any[]).filter((r) => r.status === 'PENDING').length;

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

  const editMutation = useMutation({
    mutationFn: async ({ id, data, picture }: { id: string; data: object; picture?: { file: File | null; remove: boolean } }) => {
      const res = await offersApi.update(id, data);
      if (picture?.file) await offersApi.setImage(id, picture.file);
      else if (picture?.remove) await offersApi.removeImage(id);
      return res;
    },
    onSuccess: (_r, v) => {
      toast.success((v.data as any).ending ? 'Offer ended' : 'Offer saved');
      qc.invalidateQueries({ queryKey: ['offers'] }); qc.invalidateQueries({ queryKey: ['offers-history'] });
      setEditing(null);
    },
    onError: (err) => toast.error(serverMessage(err, 'Could not save the offer')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => offersApi.delete(id),
    onSuccess: () => { toast.success('Scheduled offer cancelled'); qc.invalidateQueries({ queryKey: ['offers'] }); qc.invalidateQueries({ queryKey: ['offers-history'] }); },
    onError: (err) => toast.error(serverMessage(err, 'Failed to remove the offer')),
  });

  function resetForm() {
    setShowForm(false);
    setTitle(''); setDescription(''); setBonusRate('');
    setUseTierBonuses(false); setTierBonuses({ BRONZE: '', SILVER: '', GOLD: '', DIAMOND: '', PLATINUM: '' });
    setType('ALL_STORES'); setStoreId(''); setCategory(null); setGasBonusCpg(''); setGasBonusType('cpg');
    setStartDate(todayStr()); setEndDate(defaultEndStr()); setImageFile(null); setRequires21(false);
    setHours(NO_HOURS); setLastDayReminder(true); setSpanish(NO_SPANISH); setAud(NO_AUDIENCE);

  }

  function resetQuick() {
    setShowQuick(false);
    setQuickBonus(''); setQuickCpg(''); setQuickBonusMode('pct');
    setQuickCategory(''); setQuickDuration('1w');
  }

  function applyTemplate(t: Template) {
    setTitle(t.title);
    setDescription(templateText(t));
    const es = TEMPLATE_ES[t.title];
    setSpanish(es ? { titleEs: es[0], descriptionEs: es[1].replace('{bonus}', `${t.bonusRate}%`), dealTextEs: '' } : NO_SPANISH);
    setBonusRate(t.bonusRate);
    setCategory(t.category || '');
    setGasBonusType('pct');
    setHours(t.hours ?? NO_HOURS);
    setStartDate(todayStr());
    setEndDate(t.length === undefined || t.length === 'month' ? defaultEndStr() : addDays(storeToday(), t.length - 1));
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
    setHours(hoursFrom(offer));
    setLastDayReminder(offer.lastDayReminder !== false);
    setSpanish(spanishFrom(offer));
    setAud(audienceFrom(offer));
    setStartDate(todayStr());
    setEndDate(defaultEndStr());
    setShowForm(true);
    setShowQuick(false); setShowTemplates(false);
    setTimeout(() => document.getElementById('offer-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
    toast.success(tiers && !keepTiers && !isCpg
      ? 'Form filled from past offer. Per-tier rates are not available for gas, so its highest rate is used - update the dates and submit'
      : 'Form filled from past offer - update the dates and submit');
  }

  // A deal again: the same product, deal text, words, category, stores and 21+, with new dates (the picture is chosen again)
  function reuseDeal(offer: any) {
    setDealTitle(offer.title ?? '');
    setDealText(offer.dealText ?? '');
    setDealDescription(offer.description && offer.description !== offer.dealText ? offer.description : '');
    setDealCategory(offer.category ?? '');
    setDealType(isStoreManager ? 'SPECIFIC_STORE' : (offer.type || 'ALL_STORES'));
    setDealStoreId(offer.storeId || '');
    setDealRequires21(!!offer.requires21);
    setDealSpanish(spanishFrom(offer));
    setDealStartDate(todayStr()); setDealEndDate(defaultEndStr());
    setDealImageFile(null);
    setShowDealForm(true);
    setTimeout(() => document.getElementById('deal-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
    toast.success('Deal form filled in. Check the dates and post it.');
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
    const hoursIssue = hoursProblem(hours);
    if (hoursIssue) { toast.error(hoursIssue); return; }
    const audIssue = audienceProblem(aud);
    if (audIssue) { toast.error(audIssue); return; }

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
    const hp = hoursPayload(hours);
    if (hp.happyFrom) { fd.append('happyDays', JSON.stringify(hp.happyDays)); fd.append('happyFrom', hp.happyFrom); fd.append('happyTo', hp.happyTo); }
    fd.append('lastDayReminder', String(lastDayReminder));
    for (const [k, v] of Object.entries(audiencePayload(aud))) if (v != null && v !== '') fd.append(k, String(v));
    if (spanish.titleEs.trim()) fd.append('titleEs', spanish.titleEs.trim());
    if (spanish.descriptionEs.trim()) fd.append('descriptionEs', spanish.descriptionEs.trim());

    const draft: DraftPromo = {
      type, storeId: type === 'SPECIFIC_STORE' ? storeId : null, category: category || null,
      percent: tierMap ? Math.max(...Object.values(tierMap)) : isCpg ? null : frac(pct),
      tiers: tierMap, centsPerGallon: isCpg ? cpg : null, startMs, endMs,
    };
    const label = hoursLabel(hp);
    askToPost(describePost('promo', fd, autoTitle, `${bonusDisplay} on ${catLabel.toLowerCase()} purchases${label ? `, ${label}` : ''}`, draft, whereText(type, storeId), whenText(startMs, endMs, false)));
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
    const who = fd.get('audience') && fd.get('audience') !== 'EVERYONE' ? ` in its audience (${audienceLabel({ audience: String(fd.get('audience')), audienceTier: String(fd.get('audienceTier') ?? ''), audienceDays: String(fd.get('audienceDays') ?? '') })})` : '';
    const notify = single
      ? `Customers of ${where}${who} (an approved purchase there in the last 6 months) are notified ${timing}.`
      : who ? `Customers${who} are notified ${timing}.` : `Every customer is notified ${timing}.`;
    // What the customer's phone will show (the same words, picture and hours as the post)
    const str = (k: string) => String(fd.get(k) ?? '');
    const happyDays = fd.get('happyDays') ? JSON.parse(str('happyDays')) as number[] : [];
    const preview: PreviewOffer = {
      kind: kind === 'deal' ? 'deal' : 'promo',
      title: str('title'), description: str('description'), dealText: str('dealText') || undefined,
      titleEs: str('titleEs') || undefined, descriptionEs: str('descriptionEs') || undefined, dealTextEs: str('dealTextEs') || undefined,
      bonus: draft ? { pct: draft.centsPerGallon != null ? null : draft.percent, cents: draft.centsPerGallon, tiers: !!draft.tiers } : null,
      hours: fd.get('happyFrom') ? { days: happyDays, from: str('happyFrom'), to: str('happyTo') } : null,
      where: single ? where.replace(/ only$/, '') : 'All Lucky Stop stores',
      image: (fd.get('image') as File | null) ?? null,
      single,
    };
    return { kind, fd, title, what, where, when, example, notes, clashes, notify, estimate: draft ? estimateOf(draft, fd) : null, preview };
  }

  /** The promotion as the estimate takes it (the same fields the post sends). */
  function estimateOf(draft: DraftPromo, fd?: FormData): EstimateInput {
    return {
      storeId: draft.storeId ?? undefined, category: draft.category ?? '',
      bonusRate: draft.centsPerGallon != null ? undefined : draft.percent ?? undefined,
      tierBonusRates: draft.tiers ?? undefined, gasBonusCentsPerGallon: draft.centsPerGallon ?? undefined,
      startDate: new Date(draft.startMs).toISOString(), endDate: new Date(draft.endMs).toISOString(),
      ...(fd?.get('happyFrom') ? { happyDays: JSON.parse(String(fd.get('happyDays') ?? '[]')), happyFrom: fd.get('happyFrom'), happyTo: fd.get('happyTo') } : {}),
      ...Object.fromEntries(['audience', 'audienceTier', 'audienceDays', 'budgetCap', 'dailyCapPerCustomer'].filter((k) => fd?.get(k)).map((k) => [k, fd!.get(k)])),
    };
  }

  /** The full form as it stands, for the live estimate under it; null until it has a bonus. */
  function formEstimate(): EstimateInput {
    if (category === null || !startDate || !endDate || endDate < startDate || endDate < storeToday()) return null;
    if (type === 'SPECIFIC_STORE' && !storeId) return null;
    if (hoursProblem(hours) || audienceProblem(aud)) return null;
    const isGasDiesel = category === 'GAS' || category === 'DIESEL';
    const cpg = isGasDiesel && gasBonusType === 'cpg' ? parseFloat(gasBonusCpg) : NaN;
    let tiers: Record<string, number> | null = null;
    if (useTierBonuses && !isGasDiesel) {
      tiers = {};
      for (const t of TIERS) { const v = parseFloat(tierBonuses[t]); if (v > 0) tiers[t] = frac(v); }
      if (Object.keys(tiers).length === 0) return null;
    }
    const pct = parseFloat(bonusRate);
    if (!tiers && !(cpg > 0) && !(pct > 0)) return null;
    const hp = hoursPayload(hours);
    return {
      storeId: type === 'SPECIFIC_STORE' ? storeId : undefined, category,
      ...(cpg > 0 ? { gasBonusCentsPerGallon: cpg } : tiers ? { tierBonusRates: tiers } : { bonusRate: frac(pct) }),
      startDate: startOfStoreDay(startDate).toISOString(), endDate: endOfStoreDay(endDate).toISOString(),
      ...(hp.happyFrom ? hp : {}),
      ...Object.fromEntries(Object.entries(audiencePayload(aud)).filter(([, v]) => v != null)),
    };
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
    if (dealSpanish.titleEs.trim()) fd.append('titleEs', dealSpanish.titleEs.trim());
    if (dealSpanish.dealTextEs.trim()) fd.append('dealTextEs', dealSpanish.dealTextEs.trim());
    if (dealSpanish.descriptionEs.trim()) fd.append('descriptionEs', dealSpanish.descriptionEs.trim());
    askToPost(describePost('deal', fd, dealTitle.trim(), `${dealText.trim()} - ${dealTitle.trim()}`, null, whereText(dealType, dealStoreId), whenText(startMs, endMs, false)));
  }

  function resetDealForm() {
    setShowDealForm(false);
    setDealTitle(''); setDealText(''); setDealDescription('');
    setDealCategory(''); setDealType('ALL_STORES'); setDealStoreId('');
    setDealStartDate(todayStr()); setDealEndDate(defaultEndStr());
    setDealImageFile(null); setDealRequires21(false); setDealSpanish(NO_SPANISH);

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

  if (isError) return <Page><ErrorState message="Failed to load offers." onRetry={refetch} /></Page>;

  const isGasQuick = quickCategory === 'GAS' || quickCategory === 'DIESEL';

  return (
    <Page>
      {resultsFor && <OfferResultsModal offer={resultsFor} onClose={() => setResultsFor(null)} />}
      {editing && (
        <OfferEditModal
          offer={editing}
          canEditHours={isHQ && !editing.dealText}
          saving={editMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={(data, picture) => editMutation.mutate({ id: editing.id, data, picture })}
        />
      )}
      <ConfirmModal
        open={!!endingNow}
        title="End this offer now?"
        message="Customers stop seeing it right away. It moves to Past as Ended, with its results kept, and you can Reuse it later."
        confirmLabel="End now"
        danger
        onConfirm={() => { if (endingNow) editMutation.mutate({ id: endingNow.id, data: { endDate: new Date().toISOString(), ending: true } }); setEndingNow(null); }}
        onCancel={() => setEndingNow(null)}
      />
      <ConfirmModal
        open={!!confirmDeleteId}
        title="Cancel this scheduled offer?"
        message="It will not start and customers never see it. It stays under Past as Removed, where Reuse can bring it back."
        confirmLabel="Cancel it"
        danger
        onConfirm={() => { if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmModal
        open={!!pending}
        title={pending?.kind === 'deal' ? 'Post this deal?' : 'Post this promotion?'}
        maxWidth={820}
        message={pending && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 340px', minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>{pending.what}</div>
            <div><strong>Where:</strong> {pending.where}</div>
            {pending.fd.get('audience') && pending.fd.get('audience') !== 'EVERYONE' && <div><strong>Who:</strong> {audienceLabel({ audience: String(pending.fd.get('audience')), audienceTier: String(pending.fd.get('audienceTier') ?? ''), audienceDays: String(pending.fd.get('audienceDays') ?? '') })}, only they see it, are told and get it</div>}
            {(pending.fd.get('budgetCap') || pending.fd.get('dailyCapPerCustomer')) && <div><strong>Limits:</strong> {[pending.fd.get('budgetCap') ? `stops after $${Number(pending.fd.get('budgetCap')).toFixed(2)} of extra cashback` : null, pending.fd.get('dailyCapPerCustomer') ? `at most $${Number(pending.fd.get('dailyCapPerCustomer')).toFixed(2)} a customer a day` : null].filter(Boolean).join('; ')}</div>}
            <div><strong>When:</strong> {pending.when}</div>
            {pending.example && <div><strong>Example:</strong> {pending.example}</div>}
            {pending.clashes.map((c) => (
              <Notice key={c.offer.id} tone="warning" icon={<AlertTriangle size={15} />} style={{ marginTop: 6 }}>{c.text}</Notice>
            ))}
            {pending.notes.map((n, i) => <Notice key={i} tone="neutral" icon={<Info size={15} />} style={{ marginTop: 6 }}>{n}</Notice>)}
            {pending.estimate && <div style={{ marginTop: 6 }}><CostEstimate input={pending.estimate} /></div>}
            <div style={{ marginTop: 8, fontWeight: 600, color: C.text }}>{pending.notify}</div>
          </div>
          <div style={{ flex: '0 0 auto', margin: '0 auto' }}><PhonePreview offer={pending.preview} /></div>
          </div>
        )}
        confirmLabel={createMutation.isPending ? 'Posting…' : 'Post now'}
        busy={createMutation.isPending}
        onConfirm={confirmPost}
        onCancel={() => setPending(null)}
      />

      <PageHeader
        title="Offers"
        description="Promotions add cashback automatically. Deals show price specials in the app."
        actions={mainTab === 'requests' || mainTab === 'calendar' || mainTab === 'challenges' ? undefined : mainTab === 'promotions' ? (isStoreManager ? undefined :
          <>
            <Button icon={<LayoutTemplate />} aria-pressed={showTemplates}
              onClick={() => { setShowTemplates(!showTemplates); setShowForm(false); setShowQuick(false); }}>
              Templates
            </Button>
            <Button icon={<Zap />} aria-pressed={showQuick}
              onClick={() => { setShowQuick(!showQuick); setShowForm(false); setShowTemplates(false); }}>
              Quick post
            </Button>
            <Button variant={showForm ? 'secondary' : 'primary'} icon={showForm ? <X /> : <Plus />}
              onClick={() => { setShowForm(!showForm); setShowTemplates(false); setShowQuick(false); }}>
              {showForm ? 'Cancel' : 'New promotion'}
            </Button>
          </>
        ) : (
          <Button variant={showDealForm ? 'secondary' : 'primary'} icon={showDealForm ? <X /> : <Plus />} onClick={() => setShowDealForm(!showDealForm)}>
            {showDealForm ? 'Cancel' : 'New deal'}
          </Button>
        )}
      />

      <Tabs
        ariaLabel="Offer type"
        value={mainTab}
        onChange={(v) => { setMainTab(v); if (v !== 'deals') setShowDealForm(false); if (v !== 'promotions') { setShowForm(false); setShowTemplates(false); setShowQuick(false); } }}
        tabs={[
          { value: 'promotions', label: 'Promotions', count: promotionOffers.length },
          { value: 'deals', label: 'Deals', count: dealOffers.length },
          ...(isHQ ? [{ value: 'challenges' as const, label: 'Challenges' }] : []),
          ...(isHQ ? [{ value: 'requests' as const, label: 'Requests', count: waitingRequests || undefined }] : []),
          { value: 'calendar', label: 'Calendar' },
        ]}
      />

      {/* Quick post */}
      {showQuick && (
        <Card style={{ marginBottom: 24, maxWidth: 880 }}>
          <SectionTitle>Quick post</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={s.group}>
              <div style={s.groupLabel}>Category</div>
              <div style={s.chips}>
                {[
                  { value: '', label: 'All' },
                  { value: 'GAS', label: 'Gas' },
                  { value: 'DIESEL', label: 'Diesel' },
                  { value: 'HOT_FOODS', label: 'Hot Foods' },
                  { value: 'GROCERIES', label: 'Groceries' },
                  { value: 'FROZEN_FOODS', label: 'Frozen' },
                  { value: 'FRESH_FOODS', label: 'Fresh' },
                  { value: 'OTHER', label: 'Other' },
                ].map(c => (
                  <Chip key={c.value} selected={quickCategory === c.value}
                    onClick={() => {
                      setQuickCategory(c.value);
                      if (c.value === 'GAS' || c.value === 'DIESEL') setQuickBonusMode('cpg');
                      else setQuickBonusMode('pct');
                    }}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={s.group}>
              {isGasQuick && (
                <div style={{ ...s.chips, marginBottom: 4 }}>
                  <Chip selected={quickBonusMode === 'pct'} onClick={() => setQuickBonusMode('pct')}>% Cashback</Chip>
                  <Chip selected={quickBonusMode === 'cpg'} onClick={() => setQuickBonusMode('cpg')}>¢/Gallon</Chip>
                </div>
              )}
              {quickBonusMode === 'cpg' && isGasQuick ? (
                <>
                  <div style={s.groupLabel}>Cents per gallon</div>
                  <div style={s.chips}>
                    {['1', '2', '3', '5', '10'].map(v => (
                      <Chip key={v} selected={quickCpg === v} onClick={() => setQuickCpg(v)}>+{v}¢</Chip>
                    ))}
                    <input
                      type="number" min="0" max={MAX_CENTS_PER_GALLON} step="0.5"
                      aria-label="Custom cents per gallon bonus"
                      value={quickCpg}
                      onChange={e => setQuickCpg(e.target.value)}
                      className="ui-input" style={{ ...INPUT, width: 96, height: 32, padding: '0 10px' }}
                      placeholder="Custom"
                    />
                    <span style={s.unit}>¢/gal</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={s.groupLabel}>Bonus</div>
                  <div style={s.chips}>
                    {['1', '2', '3', '5', '10'].map(v => (
                      <Chip key={v} selected={quickBonus === v} onClick={() => setQuickBonus(v)}>+{v}%</Chip>
                    ))}
                    <input
                      type="number" min="0" max={CASHBACK_CAP * 100} step="0.5"
                      aria-label="Custom bonus percent"
                      value={quickBonus}
                      onChange={e => setQuickBonus(e.target.value)}
                      className="ui-input" style={{ ...INPUT, width: 96, height: 32, padding: '0 10px' }}
                      placeholder="Custom"
                    />
                    <span style={s.unit}>%</span>
                  </div>
                </>
              )}
            </div>

            <div style={s.group}>
              <div style={s.groupLabel}>Duration</div>
              <div style={s.chips}>
                {([['today', 'Today'], ['3d', '3 Days'], ['1w', '1 Week'], ['2w', '2 Weeks'], ['1m', '1 Month']] as const).map(([val, label]) => (
                  <Chip key={val} selected={quickDuration === val} onClick={() => setQuickDuration(val)}>{label}</Chip>
                ))}
              </div>
            </div>
          </div>

          {(() => {
            const useCpg = isGasQuick && quickBonusMode === 'cpg';
            const hasValue = useCpg ? (parseFloat(quickCpg) > 0) : (parseFloat(quickBonus) > 0);
            if (!hasValue) return null;
            const bonusDisplay = useCpg ? `+${quickCpg}¢/gal` : `+${quickBonus}%`;
            const catLabel = quickCategory ? CATEGORIES.find(c => c.value === quickCategory)?.label : 'All Categories';
            return (
              <div style={s.previewRow}>
                <span style={{ fontSize: FONT.body, color: C.text2 }}>
                  Will post <strong style={{ color: C.text }}>{bonusDisplay} {catLabel} Bonus</strong>
                  {' '}· {({ today: 'Today only', '3d': '3 days', '1w': '1 week', '2w': '2 weeks', '1m': '1 month' } as const)[quickDuration]}
                </span>
                <Button variant="primary" onClick={handleQuickPost} disabled={createMutation.isPending}>Review and post</Button>
              </div>
            );
          })()}
        </Card>
      )}

      {/* Templates */}
      {showTemplates && (
        <Card style={{ marginBottom: 24, maxWidth: 880 }}>
          <SectionTitle>Promotion templates</SectionTitle>
          <p style={{ margin: '-4px 0 14px', color: C.muted, fontSize: FONT.body }}>Pick one to fill in the form: the bonus, the days or hours it pays, and how long it runs. Change anything, then post it. If you change the bonus, check the description says the same.</p>
          <div style={{ ...s.chips, marginBottom: 14 }}>
            {TEMPLATE_GROUPS.map((g) => (
              <Chip key={g} selected={activeGroup === g} onClick={() => setActiveGroup(g)}>
                {g} ({TEMPLATES.filter((t) => t.group === g).length})
              </Chip>
            ))}
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
            {groupedTemplates.map((t, i) => (
              <div key={i} style={{ ...s.templateRow, borderTop: i ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: FONT.body, color: C.text }}>{t.title}</div>
                  <div style={{ fontSize: FONT.small, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{templateText(t)}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {t.bonusRate && <Badge tone="info">+{t.bonusRate}% bonus</Badge>}
                    <Badge>{t.category ? catName(t.category) : 'Store-wide'}</Badge>
                    <Badge icon={<Clock size={12} />}>{templateWhen(t)}</Badge>
                  </div>
                </div>
                <Button size="sm" onClick={() => applyTemplate(t)}>Use</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create / edit form */}
      {showForm && (
        <Card style={{ marginBottom: 28, maxWidth: 880 }}>
          <form id="offer-form" onSubmit={handleCreate}>
            <h2 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 600 }}>{title || 'New promotion'}</h2>

            <div style={s.formSection}>
              <div style={s.stepLabel}>1. Category <span style={{ color: C.muted, fontWeight: 400 }}>(required)</span></div>
              <div style={s.chips}>
                {[
                  { value: '', label: 'Store-wide' },
                  { value: 'GAS', label: 'Gas' },
                  { value: 'DIESEL', label: 'Diesel' },
                  { value: 'HOT_FOODS', label: 'Hot Foods' },
                  { value: 'GROCERIES', label: 'Groceries' },
                  { value: 'FROZEN_FOODS', label: 'Frozen' },
                  { value: 'FRESH_FOODS', label: 'Fresh' },
                  { value: 'OTHER', label: 'Other' },
                ].map(c => (
                  <Chip key={c.value} selected={category === c.value}
                    onClick={() => { setCategory(c.value); setGasBonusCpg(''); setGasBonusType('cpg'); setBonusRate(''); }}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>

            {category !== null && (
              <div style={s.formSection}>
                <div style={s.stepLabel}>2. Bonus</div>
                {(category === 'GAS' || category === 'DIESEL') ? (
                  <div>
                    <div style={{ ...s.chips, marginBottom: 12 }}>
                      <Chip selected={gasBonusType === 'cpg'} onClick={() => setGasBonusType('cpg')}>¢ per gallon</Chip>
                      <Chip selected={gasBonusType === 'pct'} onClick={() => setGasBonusType('pct')}>% of amount</Chip>
                    </div>
                    {gasBonusType === 'cpg' ? (
                      <div>
                        <div style={s.inline}>
                          <input type="number" min="0" max={MAX_CENTS_PER_GALLON} step="0.5" aria-label="Cents per gallon bonus"
                            className="ui-input" style={{ ...INPUT, width: 120 }}
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
                        <div style={s.inline}>
                          <input type="number" min="0" max={CASHBACK_CAP * 100} step="0.5" aria-label="Bonus percent of the purchase amount"
                            className="ui-input" style={{ ...INPUT, width: 120 }}
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
                  <div>
                    <div style={{ ...s.inline, flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                      <div style={s.inline}>
                        <input type="number" min="0" max={CASHBACK_CAP * 100} step="0.5" aria-label="Bonus percent, same for all tiers"
                          className="ui-input" style={{ ...INPUT, width: 120 }}
                          value={bonusRate} onChange={e => { const v = e.target.value; if (bonusRate && description.includes(`extra ${bonusRate}% cashback`)) setDescription(description.replace(`extra ${bonusRate}% cashback`, `extra ${v || '?'}% cashback`)); if (bonusRate && spanish.descriptionEs.includes(`${bonusRate}% extra`)) setSpanish({ ...spanish, descriptionEs: spanish.descriptionEs.replace(`${bonusRate}% extra`, `${v || '?'}% extra`) }); setBonusRate(v); }}
                          placeholder="e.g. 3" />
                        <span style={s.unit}>% bonus, same for all tiers</span>
                      </div>
                      <Chip selected={useTierBonuses} onClick={() => setUseTierBonuses(!useTierBonuses)}>
                        {useTierBonuses ? 'Per-tier on' : 'Per-tier?'}
                      </Chip>
                    </div>
                    {useTierBonuses && (
                      <div style={{ background: C.subtle, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        {TIERS.map(tier => (
                          <div key={tier} style={s.inline}>
                            <span style={{ fontSize: FONT.body, minWidth: 76, fontWeight: 500, color: C.text2 }}>{tier[0] + tier.slice(1).toLowerCase()}</span>
                            <input type="number" min="0" max={CASHBACK_CAP * 100} step="0.5" value={tierBonuses[tier]} aria-label={`${tier[0]}${tier.slice(1).toLowerCase()} bonus percent`}
                              onChange={e => setTierBonuses(p => ({ ...p, [tier]: e.target.value }))}
                              className="ui-input" style={{ ...INPUT, width: 76 }} placeholder="%" />
                            <span style={s.unit}>%</span>
                          </div>
                        ))}
                        <div style={{ gridColumn: '1 / -1', fontSize: FONT.small, color: C.muted }}>A tier left blank gets no bonus from this promotion, not the top tier's rate.</div>
                      </div>
                    )}
                    {bonusRate && !isNaN(parseFloat(bonusRate)) && parseFloat(bonusRate) > 0 && (
                      <div style={s.calcHint}>$20 purchase → +${(20 * parseFloat(bonusRate) / 100).toFixed(2)} bonus cashback on top of base rate</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {category !== null && (
              <div style={s.formSection}>
                <div style={s.stepLabel}>3. Dates and stores</div>
                <div style={s.twoCol}>
                  <Field label="Start date" htmlFor="offer-start" required>
                    <input id="offer-start" className="ui-input" style={INPUT} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </Field>
                  <Field label="End date" htmlFor="offer-end" required>
                    <input id="offer-end" className="ui-input" style={INPUT} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </Field>
                </div>
                {isStoreManager ? (
                  <Notice icon={<MapPin size={15} />}>This promotion will apply to your store only.</Notice>
                ) : (
                  <Field label="Apply to" htmlFor="offer-scope">
                    <select id="offer-scope" className="ui-input" style={INPUT} value={type} onChange={e => { setType(e.target.value as any); setStoreId(''); }}>
                      <option value="ALL_STORES">All stores</option>
                      <option value="SPECIFIC_STORE">One store only</option>
                    </select>
                    {type === 'SPECIFIC_STORE' && (
                      <select aria-label="Choose a store" className="ui-input" style={INPUT} value={storeId} onChange={e => setStoreId(e.target.value)}>
                        <option value="">Choose a store</option>
                        {stores.map((store: any) => (
                          <option key={store.id} value={store.id}>{store.name} - {store.city}, {store.state}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
              </div>
            )}

            {category !== null && (
              <div style={s.formSection}>
                <div style={s.stepLabel}>4. Title and image</div>
                <input aria-label="Title" className="ui-input" style={INPUT} value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="Leave blank to write one for you" />
                <textarea aria-label="Description" className="ui-input" style={{ ...INPUT, height: 72, resize: 'vertical' }} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional, written for you if blank)" />
                <SpanishFields idPrefix="offer" value={spanish} onChange={setSpanish} english={{ title, description }} />
                <ImagePick id="offer-image" file={imageFile} onFile={setImageFile} category={category || null} />
              </div>
            )}

            {category !== null && (
              <div style={s.formSection}>
                <div style={s.stepLabel}>5. Age restriction</div>
                <AgeToggle on={requires21} onToggle={() => setRequires21(!requires21)} />
              </div>
            )}

            {category !== null && !isStoreManager && (
              <div style={s.formSection}>
                <div style={s.stepLabel}>6. Happy hours <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></div>
                <HappyHoursField idPrefix="offer-hours" value={hours} onChange={setHours} />
              </div>
            )}

            {category !== null && !isStoreManager && (
              <div style={s.formSection}>
                <div style={s.stepLabel}>7. Who it's for, and limits <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></div>
                <AudienceLimitsField idPrefix="offer-aud" value={aud} onChange={setAud} />
              </div>
            )}

            {category !== null && !isStoreManager && (
              <div style={s.formSection}>
                <div style={s.stepLabel}>8. Reminder and cost</div>
                <LastDayToggle on={lastDayReminder} onToggle={() => setLastDayReminder(!lastDayReminder)} />
                <CostEstimate input={formEstimate()} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, paddingTop: 16 }}>
              <Button variant="primary" type="submit" disabled={createMutation.isPending || category === null}>
                {createMutation.isPending ? 'Creating...' : 'Create Offer'}
              </Button>
              <Button onClick={resetForm}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {mainTab === 'requests' && isHQ && <OfferRequestsPanel />}
      {mainTab === 'challenges' && isHQ && <ChallengesPanel />}
      {mainTab === 'calendar' && <OfferCalendar offers={offers} past={pastOffers} stores={stores} />}

      {/* Promotions */}
      {mainTab === 'promotions' && (
        <>
          {isStoreManager && (
            <Notice icon={<Info size={15} />} style={{ marginBottom: 18, maxWidth: 880 }}>
              Cashback promotions are set by HQ. To ask for one for your store, open Offers in the Lucky Stop app and use Ask HQ. You can post a Deal (a price special) yourself on the Deals tab.
            </Notice>
          )}
          {isLoading ? (
            <CardSkeleton count={4} />
          ) : promotionOffers.length === 0 ? (
            <EmptyState icon={<Tag size={22} />} title="No promotions" description="Nothing is live or scheduled. Customers see no promotion right now. Use a template or post one." />
          ) : (
            <>
              {livePromotions.length > 0 ? (
                <>
                  <SectionTitle>Live Now ({livePromotions.length})</SectionTitle>
                  <div style={s.grid}>
                    {livePromotions.map((offer: any) => (
                      <OfferCard key={offer.id} offer={offer} onReuse={isStoreManager ? undefined : () => reuseOffer(offer)} onResults={isHQ ? () => setResultsFor(offer) : undefined} onEdit={() => setEditing(offer)} onEndNow={() => setEndingNow(offer)} />
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState title="Nothing is live right now" description="Customers see no promotion until a scheduled one starts." />
              )}
              {scheduledPromotions.length > 0 && (
                <>
                  <SectionTitle style={{ marginTop: 28 }}>Scheduled ({scheduledPromotions.length})</SectionTitle>
                  <div style={s.grid}>
                    {scheduledPromotions.map((offer: any) => (
                      <OfferCard key={offer.id} offer={offer} isScheduled onDelete={() => setConfirmDeleteId(offer.id)} onReuse={isStoreManager ? undefined : () => reuseOffer(offer)} onEdit={() => setEditing(offer)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          <div style={{ marginTop: 32 }}>
            <Button variant="ghost" icon={showHistory ? <ChevronDown /> : <ChevronRight />} aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)} style={{ paddingLeft: 6 }}>
              Past promotions
            </Button>
            {showHistory && (
              pastPromotions.length === 0 ? (
                <div style={s.pastNote}>No past promotions found.</div>
              ) : (
                <>
                  <p style={s.pastNote}>{pastPromotions.length} past promotions. Reuse fills in the form with any of them.</p>
                  <div style={s.grid}>
                    {pastPromotions.map((offer: any) => (
                      <OfferCard key={offer.id} offer={offer} isPast onReuse={isStoreManager ? undefined : () => reuseOffer(offer)} onResults={isHQ ? () => setResultsFor(offer) : undefined} />
                    ))}
                  </div>
                </>
              )
            )}
          </div>
        </>
      )}

      {/* Deals */}
      {mainTab === 'deals' && (
        <>
          {showDealForm && (
            <Card style={{ marginBottom: 28, maxWidth: 880 }}>
              <form id="deal-form" onSubmit={handleCreateDeal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h2 style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 600 }}>{dealTitle || 'New deal'}</h2>
                <Field label="Product or item name" htmlFor="deal-title" required>
                  <input id="deal-title" className="ui-input" style={INPUT} value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="e.g. Monster Energy, 2-Liter Pepsi" />
                </Field>
                <Field label="Deal text" htmlFor="deal-text" required hint="Shown large in the app.">
                  <input id="deal-text" className="ui-input" style={INPUT} value={dealText} onChange={(e) => setDealText(e.target.value)} placeholder="e.g. 2 for $5, 3 for $4, Buy 2 Get 1 Free" maxLength={40} />
                </Field>
                <Field label="Description (optional)" htmlFor="deal-desc">
                  <input id="deal-desc" className="ui-input" style={INPUT} value={dealDescription} onChange={(e) => setDealDescription(e.target.value)} placeholder="Any extra details about the deal" />
                </Field>
                <SpanishFields idPrefix="deal" value={dealSpanish} onChange={setDealSpanish} english={{ title: dealTitle, description: dealDescription, dealText }} withDeal />
                <ImagePick id="deal-image" file={dealImageFile} onFile={setDealImageFile} category={dealCategory || null} />
                <div style={s.twoCol}>
                  <Field label="Start date" htmlFor="deal-start" required>
                    <input id="deal-start" className="ui-input" style={INPUT} type="date" value={dealStartDate} onChange={(e) => setDealStartDate(e.target.value)} />
                  </Field>
                  <Field label="End date" htmlFor="deal-end" required>
                    <input id="deal-end" className="ui-input" style={INPUT} type="date" value={dealEndDate} onChange={(e) => setDealEndDate(e.target.value)} />
                  </Field>
                </div>
                {isStoreManager ? (
                  <Notice icon={<MapPin size={15} />}>This deal will apply to your store only.</Notice>
                ) : (
                  <>
                    <Field label="Apply to" htmlFor="deal-scope">
                      <select id="deal-scope" className="ui-input" style={INPUT} value={dealType} onChange={(e) => { setDealType(e.target.value as any); setDealStoreId(''); }}>
                        <option value="ALL_STORES">All {stores.length || ''} stores</option>
                        <option value="SPECIFIC_STORE">One store only</option>
                      </select>
                    </Field>
                    {dealType === 'SPECIFIC_STORE' && (
                      <Field label="Store" htmlFor="deal-store" required>
                        <select id="deal-store" className="ui-input" style={INPUT} value={dealStoreId} onChange={(e) => setDealStoreId(e.target.value)}>
                          <option value="">Choose a store</option>
                          {stores.map((store: any) => (
                            <option key={store.id} value={store.id}>{store.name} - {store.city}, {store.state}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </>
                )}
                <Field label="Product category (optional)" htmlFor="deal-category">
                  <select id="deal-category" className="ui-input" style={INPUT} value={dealCategory} onChange={(e) => setDealCategory(e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Age restriction">
                  <AgeToggle on={dealRequires21} onToggle={() => setDealRequires21(!dealRequires21)} />
                </Field>
                <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                  <Button variant="primary" type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Post Deal'}
                  </Button>
                  <Button onClick={resetDealForm}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {isLoading ? (
            <CardSkeleton count={4} />
          ) : dealOffers.length === 0 ? (
            <EmptyState icon={<Tag size={22} />} title="No deals" description='Nothing is live or scheduled. Click "New deal" to post one.' />
          ) : (
            <>
              {liveDeals.length > 0 ? (
                <>
                  <SectionTitle>Live Now ({liveDeals.length})</SectionTitle>
                  <div style={s.grid}>
                    {liveDeals.map((offer: any) => (
                      <DealCard key={offer.id} offer={offer} onEdit={() => setEditing(offer)} onEndNow={() => setEndingNow(offer)} onReuse={() => reuseDeal(offer)} />
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState title="No deal is live right now" />
              )}
              {scheduledDeals.length > 0 && (
                <>
                  <SectionTitle style={{ marginTop: 28 }}>Scheduled ({scheduledDeals.length})</SectionTitle>
                  <div style={s.grid}>
                    {scheduledDeals.map((offer: any) => (
                      <DealCard key={offer.id} offer={offer} isScheduled onDelete={() => setConfirmDeleteId(offer.id)} onEdit={() => setEditing(offer)} onReuse={() => reuseDeal(offer)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ marginTop: 32 }}>
            <Button variant="ghost" icon={showHistory ? <ChevronDown /> : <ChevronRight />} aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)} style={{ paddingLeft: 6 }}>
              Past deals
            </Button>
            {showHistory && (
              pastDeals.length === 0 ? (
                <div style={s.pastNote}>No past deals found.</div>
              ) : (
                <div style={{ ...s.grid, marginTop: 12 }}>
                  {pastDeals.map((offer: any) => (
                    <DealCard key={offer.id} offer={offer} isPast onReuse={() => reuseDeal(offer)} />
                  ))}
                </div>
              )
            )}
          </div>
          {isHQ && <ShelfDealsSection />}
        </>
      )}
    </Page>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function catName(c: string) { return c.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()); }

function AgeToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: FONT.body, color: C.text2 }}>
        <input type="checkbox" checked={on} onChange={onToggle} style={{ width: 16, height: 16, accentColor: C.primary, cursor: 'pointer' }} />
        Age-restricted (21+)
      </label>
      {on && <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Customers see this blurred with a 21+ prompt until they confirm their age.</div>}
    </div>
  );
}

function OfferTags({ offer, isPast, isScheduled }: { offer: any; isPast?: boolean; isScheduled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
      {isScheduled ? <Badge tone="info">Starts {storeDayLong(offer.startDate)}</Badge>
        : isPast ? <Badge>{offer.isActive === false ? 'Removed' : 'Ended'}</Badge>
        : <Badge tone="success">Live</Badge>}
      <Badge icon={offer.type === 'ALL_STORES' ? <Globe size={12} /> : <MapPin size={12} />}>
        {offer.type === 'ALL_STORES' ? 'All Stores' : (offer.store?.name ?? 'Store')}
      </Badge>
      {offer.category && <Badge>{catName(offer.category)}</Badge>}
      {offer.requires21 && <Badge tone="warning">21+</Badge>}
      {offer.titleEs && <Badge title={`In Spanish: ${offer.titleEs}`}>ES</Badge>}
      {audienceLabel(offer) && <Badge tone="info">{audienceLabel(offer)}</Badge>}
      {offer.budgetReachedAt && <Badge tone="warning">Budget used up</Badge>}
    </div>
  );
}

function bonusText(offer: any): string | null {
  if (offer.gasBonusCentsPerGallon != null) return `+${offer.gasBonusCentsPerGallon}¢ / gallon`;
  if (offer.tierBonusRates && Object.keys(offer.tierBonusRates).length > 0) {
    return Object.entries(offer.tierBonusRates as Record<string, number>)
      .map(([tier, rate]) => `${tier[0]}${tier.slice(1).toLowerCase()} +${pctText(rate)}%`).join(' · ');
  }
  if (offer.bonusRate) return `+${pctText(offer.bonusRate)}% ${offer.category ? offer.category.replace(/_/g, ' ').toLowerCase() : 'store-wide'}`;
  return null;
}

function OfferCard({ offer, onDelete, onReuse, onResults, onEdit, onEndNow, isPast, isScheduled }: {
  offer: any; onDelete?: () => void; onReuse?: () => void; onResults?: () => void; onEdit?: () => void; onEndNow?: () => void; isPast?: boolean; isScheduled?: boolean;
}) {
  const bonus = bonusText(offer);
  const hours = offer.hoursText ?? hoursLabel(offer);
  return (
    <Card padding={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {offer.imageUrl && <img src={offer.imageUrl} alt={offer.title} style={s.img} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div style={s.cardBody}>
        <OfferTags offer={offer} isPast={isPast} isScheduled={isScheduled} />
        <h3 style={s.cardTitle}>{offer.title}</h3>
        {bonus && <div style={s.bonus}>{bonus}</div>}
        {hours && (
          <div style={s.hours}>
            <Clock size={13} aria-hidden /> Pays {hours}
            {!isPast && !isScheduled && offer.onNow != null && <Badge tone={offer.onNow ? 'success' : 'neutral'} style={{ marginLeft: 4 }}>{offer.onNow ? 'On now' : 'Not on now'}</Badge>}
          </div>
        )}
        {offer.description && <p style={s.cardDesc}>{offer.description}</p>}
        <div style={s.cardDate}>{fmtDate(offer.startDate)} to {fmtDate(offer.endDate)}</div>
        {!isPast && offer.lastDayReminder === false && <div style={{ ...s.cardDate, marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}><BellOff size={12} aria-hidden /> No last-day reminder</div>}
        {offer.budgetCap != null && <BudgetBar spent={offer.budgetSpent ?? 0} cap={offer.budgetCap} reached={!!offer.budgetReachedAt} />}
        {offer.dailyCapPerCustomer != null && <div style={{ ...s.cardDate, marginTop: 4 }}>At most ${Number(offer.dailyCapPerCustomer).toFixed(2)} a customer a day</div>}
      </div>
      <div style={s.cardActions}>
        {onResults && !isScheduled && <Button size="sm" icon={<BarChart3 />} onClick={onResults} aria-label={`Results of ${offer.title}`}>Results</Button>}
        {onReuse && <Button size="sm" icon={<RotateCcw />} onClick={onReuse} aria-label={`Reuse ${offer.title}`}>Reuse</Button>}
        {!isPast && onEdit && <Button size="sm" icon={<Pencil />} onClick={onEdit} aria-label={`Edit ${offer.title}`}>Edit</Button>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!isPast && !isScheduled && onEndNow && <Button size="sm" variant="danger" icon={<Square />} onClick={onEndNow} aria-label={`End ${offer.title} now`}>End now</Button>}
          {!isPast && isScheduled && onDelete && <Button size="sm" variant="danger" icon={<Trash2 />} onClick={onDelete} aria-label={`Cancel ${offer.title}`}>Cancel</Button>}
        </span>
      </div>
    </Card>
  );
}

function DealCard({ offer, onDelete, onEdit, onEndNow, onReuse, isPast, isScheduled }: { offer: any; onDelete?: () => void; onEdit?: () => void; onEndNow?: () => void; onReuse?: () => void; isPast?: boolean; isScheduled?: boolean }) {
  return (
    <Card padding={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {offer.imageUrl && <img src={offer.imageUrl} alt={offer.title} style={s.img} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div style={s.cardBody}>
        <OfferTags offer={offer} isPast={isPast} isScheduled={isScheduled} />
        <div style={s.dealText}>{offer.dealText}</div>
        <h3 style={s.cardTitle}>{offer.title}</h3>
        {offer.description && offer.description !== offer.dealText && <p style={s.cardDesc}>{offer.description}</p>}
        <div style={s.cardDate}>{fmtDate(offer.startDate)} to {fmtDate(offer.endDate)}</div>
      </div>
      <div style={s.cardActions}>
        {onReuse && <Button size="sm" icon={<RotateCcw />} onClick={onReuse} aria-label={`Reuse ${offer.title}`}>Reuse</Button>}
        {!isPast && onEdit && <Button size="sm" icon={<Pencil />} onClick={onEdit} aria-label={`Edit ${offer.title}`}>Edit</Button>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!isPast && !isScheduled && onEndNow && <Button size="sm" variant="danger" icon={<Square />} onClick={onEndNow} aria-label={`End ${offer.title} now`}>End now</Button>}
          {!isPast && isScheduled && onDelete && <Button size="sm" variant="danger" icon={<Trash2 />} onClick={onDelete} aria-label={`Cancel ${offer.title}`}>Cancel</Button>}
        </span>
      </div>
    </Card>
  );
}

function OfferEditModal({ offer, saving, onClose, onSave, canEditHours }: { offer: any; saving: boolean; onClose: () => void; onSave: (data: object, picture: { file: File | null; remove: boolean }) => void; canEditHours?: boolean }) {
  const started = new Date(offer.startDate).getTime() <= Date.now();
  const [title, setTitle] = useState<string>(offer.title ?? '');
  const [description, setDescription] = useState<string>(offer.description ?? '');
  const [start, setStart] = useState<string>(storeToday(new Date(offer.startDate)));
  const [end, setEnd] = useState<string>(storeToday(new Date(offer.endDate)));
  const [hours, setHours] = useState<HappyHours>(hoursFrom(offer));
  const [lastDay, setLastDay] = useState<boolean>(offer.lastDayReminder !== false);
  const [picture, setPicture] = useState<File | null>(null);
  const [spanish, setSpanish] = useState<SpanishWords>(spanishFrom(offer));
  const [aud, setAud] = useState<AudienceLimitsValue>(audienceFrom(offer));
  const audBefore = JSON.stringify(audiencePayload(audienceFrom(offer)));
  const [removePicture, setRemovePicture] = useState(false);
  const today = storeToday();
  const problem = !title.trim() ? 'Add a title.' : end < today ? 'The last day has already passed.' : end < start ? 'The last day is before the first day.'
    : canEditHours ? (hoursProblem(hours) ?? audienceProblem(aud)) : null;
  const hoursChanged = canEditHours && hoursLabel(hoursPayload(hours)) !== hoursLabel(offer);
  return (
    <Modal title={offer.dealText ? 'Edit deal' : 'Edit promotion'} subtitle={offer.dealText ? 'Change the words, the picture and the dates.' : canEditHours ? 'Change the words, the picture, the dates and the hours. What a promotion pays stays as it was posted; to change that, End it and post a new one.' : 'Change the words, the picture and the dates. What a promotion pays stays as it was posted; to change that, End it and post a new one.'} onClose={onClose} busy={saving} maxWidth={560}>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        onSave({
          title: title.trim(),
          description: description.trim(),   // empty clears it
          titleEs: spanish.titleEs.trim(), descriptionEs: spanish.descriptionEs.trim(),   // empty takes the Spanish off
          ...(offer.dealText ? { dealTextEs: spanish.dealTextEs.trim() } : {}),
          ...(!started ? { startDate: startOfStoreDay(start).toISOString() } : {}),
          endDate: endOfStoreDay(end).toISOString(),
          ...(hoursChanged ? hoursPayload(hours) : {}),
          ...(canEditHours && lastDay !== (offer.lastDayReminder !== false) ? { lastDayReminder: lastDay } : {}),
          ...(canEditHours && JSON.stringify(audiencePayload(aud)) !== audBefore ? audiencePayload(aud) : {}),
        }, { file: picture, remove: removePicture });
      }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Title" htmlFor="edit-offer-title" required>
          <input id="edit-offer-title" className="ui-input" style={INPUT} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="edit-offer-desc">
          <textarea id="edit-offer-desc" className="ui-input" style={{ ...INPUT, minHeight: 72, resize: 'vertical' }} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <SpanishFields idPrefix="edit-offer" value={spanish} onChange={setSpanish} english={{ title, description, dealText: offer.dealText ?? '' }} withDeal={!!offer.dealText} />
        <ImagePick id="edit-offer-image" file={picture} onFile={setPicture} current={offer.imageUrl} removed={removePicture} onRemoveCurrent={setRemovePicture} category={offer.category} label="Picture" />
        <div style={s.twoCol}>
          <Field label="First day" htmlFor="edit-offer-start" hint={started ? 'Already running.' : undefined}>
            <input id="edit-offer-start" className="ui-input" style={INPUT} type="date" value={start} disabled={started} min={today} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Last day" htmlFor="edit-offer-end" hint="Runs to 11:59 pm at the store.">
            <input id="edit-offer-end" className="ui-input" style={INPUT} type="date" value={end} min={start > today ? start : today} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {canEditHours && (
          <>
            <Field label="Happy hours">
              <HappyHoursField idPrefix="edit-offer-hours" value={hours} onChange={setHours} />
            </Field>
            <LastDayToggle on={lastDay} onToggle={() => setLastDay(!lastDay)} />
            <Field label="Who it's for, and limits">
              <AudienceLimitsField idPrefix="edit-offer-aud" value={aud} onChange={setAud} />
            </Field>
            {offer.budgetReachedAt && <Notice tone="warning" style={{ fontSize: FONT.small }}>Its budget is used up, so it has stopped. Raise the budget above the ${Number(offer.budgetSpent ?? 0).toFixed(2)} it has paid to start it again.</Notice>}
          </>
        )}
        {problem && <Notice tone="warning" style={{ fontSize: FONT.small }}>{problem}</Notice>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !!problem}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** What a promotion with a budget has paid so far, of its budget. */
function BudgetBar({ spent, cap, reached }: { spent: number; cap: number; reached: boolean }) {
  const pct = Math.min(100, Math.round((spent / cap) * 100));
  return (
    <div style={{ marginTop: 8 }} aria-label={`Budget: $${spent.toFixed(2)} of $${cap.toFixed(2)} used`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.caption, color: C.muted }}>
        <span>Budget</span><span>${spent.toFixed(2)} of ${cap.toFixed(2)}{reached ? ', stopped' : ''}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.subtle, border: `1px solid ${C.border}`, overflow: 'hidden', marginTop: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: reached || pct >= 90 ? C.danger : C.primary }} />
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  group: { display: 'flex', flexDirection: 'column', gap: 8 },
  groupLabel: { fontSize: FONT.small, fontWeight: 600, color: C.text2 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  unit: { fontSize: FONT.body, color: C.muted, whiteSpace: 'nowrap' },
  inline: { display: 'flex', alignItems: 'center', gap: 8 },
  previewRow: {
    marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  },
  templateRow: { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: C.surface },

  formSection: { padding: '16px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 10 },
  stepLabel: { fontWeight: 600, fontSize: FONT.body, color: C.text },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  calcHint: { fontSize: FONT.small, color: C.muted, marginTop: 6 },
  file: { fontSize: FONT.small, color: C.text2 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 16 },
  img: { width: '100%', height: 150, objectFit: 'cover', borderBottom: `1px solid ${C.border}` },
  cardBody: { padding: '16px 18px 14px', flex: 1 },
  cardTitle: { fontSize: FONT.section, fontWeight: 600, color: C.text, margin: '0 0 4px' },
  bonus: { fontSize: FONT.body, fontWeight: 600, color: C.primary, marginBottom: 6 },
  hours: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: FONT.small, color: C.text2, marginBottom: 6 },
  cardDesc: { color: C.muted, fontSize: FONT.small, margin: '0 0 8px', lineHeight: 1.5 },
  cardDate: { color: C.muted, fontSize: FONT.caption, marginTop: 8 },
  cardActions: { display: 'flex', gap: 6, padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.subtle },
  dealText: { fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4, letterSpacing: '-0.01em' },
  pastNote: { color: C.muted, fontSize: FONT.body, margin: '8px 0 14px' },
};
