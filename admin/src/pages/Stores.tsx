import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { storesApi, disputesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import Modal from '../components/Modal';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { showPhone, phoneDigits } from '../lib/phoneText';
import { useSingleFlight } from '../hooks/useSingleFlight';

const ALL_CATEGORIES = [
  { value: 'GAS',           label: 'Gas',          icon: '⛽' },
  { value: 'DIESEL',        label: 'Diesel',        icon: '🚛' },
  { value: 'HOT_FOODS',     label: 'Hot Foods',     icon: '🌮' },
  { value: 'GROCERIES',     label: 'Groceries',     icon: '🛒' },
  { value: 'FROZEN_FOODS',  label: 'Frozen Foods',  icon: '🧊' },
  { value: 'FRESH_FOODS',   label: 'Fresh Foods',   icon: '🥗' },
  { value: 'OTHER',         label: 'Other',         icon: '🏪' },
] as const;

interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  shiftsPerDay: number;
  gasPricePerGallon: number | null;
  dieselPricePerGallon: number | null;
  gasPriceUpdatedAt: string | null;
  dieselPriceUpdatedAt: string | null;
  enabledCategories: string[];
  hotFoodEnabled: boolean;
  todayHours: string | null;
  minimumAge: number | null;
  isActive: boolean;
}

interface FormState {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  latitude: string;
  longitude: string;
  requiresAgeGate: boolean;
}

type DayOfWeek = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

// Display order (Sunday first, matching a typical US weekly calendar).
// The backend's own enum happens to be declared Monday-first for shift
// scheduling, so this is deliberately its own ordering, not a reuse.
const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'SUN', label: 'Sunday' },
  { value: 'MON', label: 'Monday' },
  { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' },
  { value: 'SAT', label: 'Saturday' },
];

interface DayForm {
  isClosed: boolean;
  isOpen24Hours: boolean;
  openTime: string;
  closeTime: string;
}

const BLANK_DAY: DayForm = { isClosed: false, isOpen24Hours: false, openTime: '', closeTime: '' };

interface Holiday {
  id: string;
  date: string;
  label: string;
  isClosed: boolean;
  isOpen24Hours: boolean;
  openTime: string | null;
  closeTime: string | null;
}

// "06:00" -> "6:00 AM"
function formatTime12h(t: string): string {
  const [hStr, m] = t.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

function scheduleSummary(s: { isClosed: boolean; isOpen24Hours: boolean; openTime: string | null; closeTime: string | null }): string {
  if (s.isClosed) return 'Closed';
  if (s.isOpen24Hours) return 'Open 24 Hours';
  if (s.openTime && s.closeTime) return `${formatTime12h(s.openTime)} - ${formatTime12h(s.closeTime)}`;
  return 'Not set';
}

function categoryEnabled(store: Pick<Store, 'enabledCategories'>, category: 'GAS' | 'DIESEL'): boolean {
  return store.enabledCategories.length === 0 || store.enabledCategories.includes(category);
}

const DAY_MS = 86_400_000;
/** How old a price is, in words. A price of 0 (what a store starts with) or a missing date means it was never set. Stale is more than two days. */
function priceAge(price: number | null, at: string | null): { text: string; stale: boolean } {
  if (price == null || price <= 0 || !at) return { text: 'never set', stale: true };
  const days = Math.floor((Date.now() - new Date(at).getTime()) / DAY_MS);
  return { text: days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`, stale: days > 2 };
}

/** The problem with a typed price (the server enforces the same rule), or null when it is fine or empty. */
function priceProblem(label: string, text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(t)) return `${label}: enter a price such as 3.499 (at most three decimals).`;
  const v = Number(t);
  if (v < 0.5) return `${label}: the price must be at least $0.50.`;
  if (v > 20) return `${label}: the price can be at most $20.00.`;
  return null;
}

/** A holiday date is stored as midnight UTC of that day, so it is read in UTC ('Nov 26, 2026'). */
function holidayDay(date: string): string {
  const d = new Date(date);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

// Texas and Oklahoma, roughly: a pair outside it is worth a second look (the server refuses anything outside the United States)
const REGION = { latMin: 25.8, latMax: 37.1, lngMin: -106.7, lngMax: -93.5 };

const AVATAR_PALETTE = [
  '#E63946', '#457B9D', '#2DC653', '#F4A261', '#7B2FBE',
  '#0077B6', '#E76F51', '#2A9D8F', '#E9C46A', '#264653',
  '#6A0572', PRIMARY,
];

function storeAvatar(idx: number) { return AVATAR_PALETTE[idx % AVATAR_PALETTE.length]; }

export default function Stores() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', address: '', city: '', state: '', zipCode: '', phone: '', latitude: '', longitude: '', requiresAgeGate: false });
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  // Store Hours modal, its own modal (not part of the general Edit Store
  // one) since it's backed by 2 dedicated endpoints, not the generic
  // updateStore payload.
  const [hoursStoreId, setHoursStoreId] = useState<string | null>(null);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [weekForm, setWeekForm] = useState<Record<DayOfWeek, DayForm>>(
    () => Object.fromEntries(DAYS.map((d) => [d.value, BLANK_DAY])) as Record<DayOfWeek, DayForm>
  );
  const [weekSaving, setWeekSaving] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', label: '', isClosed: true, isOpen24Hours: false, openTime: '', closeTime: '' });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [enabledCats, setEnabledCats] = useState<string[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  // Gas price inline editing: map of storeId → { gas, diesel }
  const [gasForms, setGasForms] = useState<Record<string, { gas: string; diesel: string }>>({});
  const [apiKeyStoreId, setApiKeyStoreId] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  // Whether a key exists per store (never the value itself -- only the hash is
  // stored server-side now, so an existing key can't be "revealed", only
  // regenerated). undefined = not checked yet.
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [kwStoreId, setKwStoreId] = useState<string | null>(null);
  const [kwMappings, setKwMappings] = useState<{ id: string; keyword: string; category: string }[]>([]);
  const [kwLoading, setKwLoading] = useState(false);
  const [kwForm, setKwForm] = useState({ keyword: '', category: 'GROCERIES' });
  const [kwSaving, setKwSaving] = useState(false);

  const [confirmRegenId, setConfirmRegenId] = useState<string | null>(null);
  const [pendingGas, setPendingGas] = useState<{ store: Store; payload: Record<string, number>; lines: string[] } | null>(null);
  const [editError, setEditError] = useState('');
  const [hoursError, setHoursError] = useState('');
  const [kwError, setKwError] = useState('');
  const [allDays, setAllDays] = useState({ openTime: '06:00', closeTime: '22:00' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });

  const stores: Store[] = data?.data?.data ?? [];

  // Pending dispute counts — one query, grouped client-side
  const { data: disputeData } = useQuery({
    queryKey: ['disputes-pending-by-store'],
    queryFn: () => disputesApi.getAll({ status: 'PENDING' }),
    enabled: ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || ''),
  });
  const pendingDisputesByStore: Record<string, number> = {};
  (disputeData?.data?.data || []).forEach((d: any) => {
    pendingDisputesByStore[d.storeId] = (pendingDisputesByStore[d.storeId] || 0) + 1;
  });

  const mutation = useMutation({
    mutationFn: ({ storeId, payload }: { storeId: string; payload: object }) =>
      storesApi.update(storeId, payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success(res.data?.changed === false ? 'Nothing was changed.' : 'Store updated');
      setEditStore(null);
      setEditError('');
    },
    onError: (e: any) => setEditError(failureMessage(e, 'Could not save the store. Nothing was changed.')),
  });
  const runSave = useSingleFlight(mutation);

  const activeMutation = useMutation({
    mutationFn: ({ storeId, isActive }: { storeId: string; isActive: boolean }) =>
      storesApi.update(storeId, { isActive }),
    onSuccess: (_, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success(isActive ? 'Store reopened. It records sales again.' : 'Store deactivated. It no longer records sales or redemptions.');
    },
    onError: (e: any) => toast.error(failureMessage(e, 'Could not change the store. Nothing was changed.')),
  });
  const runActive = useSingleFlight(activeMutation);

  const gasMutation = useMutation({
    mutationFn: ({ storeId, payload }: { storeId: string; payload: object }) =>
      storesApi.updateGasPrices(storeId, payload),
    onSuccess: (res, { storeId }) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      // Clear the inline form for this store
      setGasForms((prev) => { const n = { ...prev }; delete n[storeId]; return n; });
      setPendingGas(null);
      toast.success(res.data?.changed === false ? 'Those prices were already saved.' : '⛽ Prices saved. The store\'s staff were told to update the pumps.');
    },
    onError: (e: any) => { setPendingGas(null); toast.error(failureMessage(e, 'Could not save the prices. Nothing was changed.')); },
  });
  const runGas = useSingleFlight(gasMutation);

  function getGasForm(store: Store) {
    return gasForms[store.id] ?? {
      gas:    store.gasPricePerGallon    != null && store.gasPricePerGallon    > 0 ? store.gasPricePerGallon.toFixed(3)    : '',
      diesel: store.dieselPricePerGallon != null && store.dieselPricePerGallon > 0 ? store.dieselPricePerGallon.toFixed(3) : '',
    };
  }

  // Typing in one box starts from what the form already holds (before, it started from empty and blanked the other box)
  function setGasField(storeId: string, field: 'gas' | 'diesel', value: string) {
    const store = stores.find((st) => st.id === storeId);
    const base = gasForms[storeId] ?? (store ? getGasForm(store) : { gas: '', diesel: '' });
    setGasForms((prev) => ({ ...prev, [storeId]: { ...base, [field]: value } }));
  }

  function gasProblem(store: Store): string | null {
    const gf = getGasForm(store);
    return priceProblem('Gas', gf.gas) ?? priceProblem('Diesel', gf.diesel);
  }

  // Saves the prices that really changed. A move of more than 15%, or a price under $1, asks first with the old and the new price.
  function saveGasPrices(store: Store) {
    const problem = gasProblem(store);
    if (problem) { toast.error(problem); return; }
    const gf = getGasForm(store);
    const payload: Record<string, number> = {};
    const lines: string[] = [];
    let risky = false;
    const consider = (label: string, key: 'gasPricePerGallon' | 'dieselPricePerGallon', text: string, saved: number | null) => {
      if (text.trim() === '') return;
      const v = Number(text);
      if (saved != null && Math.abs(saved - v) < 0.0005) return;
      payload[key] = v;
      const was = saved != null && saved > 0 ? `$${saved.toFixed(3)}` : 'not set';
      const pct = saved != null && saved > 0 ? Math.round(((v - saved) / saved) * 100) : null;
      lines.push(`${label} from ${was} to $${v.toFixed(3)}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}`);
      if ((pct != null && Math.abs(pct) > 15) || v < 1) risky = true;
    };
    consider('Gas', 'gasPricePerGallon', gf.gas, store.gasPricePerGallon);
    consider('Diesel', 'dieselPricePerGallon', gf.diesel, store.dieselPricePerGallon);
    if (Object.keys(payload).length === 0) { toast('Those prices are already saved.'); return; }
    if (risky) { setPendingGas({ store, payload, lines }); return; }
    runGas({ storeId: store.id, payload });
  }

  function gasFormDirty(store: Store) {
    const gf = getGasForm(store);
    const origGas    = store.gasPricePerGallon    != null && store.gasPricePerGallon    > 0 ? store.gasPricePerGallon.toFixed(3)    : '';
    const origDiesel = store.dieselPricePerGallon != null && store.dieselPricePerGallon > 0 ? store.dieselPricePerGallon.toFixed(3) : '';
    return gf.gas !== origGas || gf.diesel !== origDiesel;
  }

  async function checkApiKeyStatus(storeId: string) {
    setApiKeyStoreId(storeId);
    try {
      const res = await storesApi.getApiKey(storeId);
      setApiKeyStatus((p) => ({ ...p, [storeId]: res.data.data.hasApiKey }));
    } catch (e) { toast.error(failureMessage(e, 'Could not check the key.')); }
    setApiKeyStoreId(null);
  }

  async function regenApiKey(storeId: string) {
    try {
      const res = await storesApi.regenerateApiKey(storeId);
      const key = res.data.data.apiKey;
      setApiKeys((p) => ({ ...p, [storeId]: key }));
      setApiKeyVisible((p) => ({ ...p, [storeId]: true }));
      setApiKeyStatus((p) => ({ ...p, [storeId]: true }));
      toast.success('API key regenerated - update config.json on the store PC');
    } catch (e) { toast.error(failureMessage(e, 'Could not regenerate the key. The old key still works.')); }
  }

  function copyApiKey(key: string) {
    navigator.clipboard.writeText(key).then(() => toast.success('Copied to clipboard'));
  }

  async function openKwModal(storeId: string) {
    setKwStoreId(storeId);
    setKwForm({ keyword: '', category: 'GROCERIES' });
    setKwError('');
    setKwLoading(true);
    try {
      const res = await storesApi.getKeywordMappings(storeId);
      setKwMappings(res.data.data ?? []);
    } catch (e) { setKwError(failureMessage(e, 'Could not load the keywords.')); }
    setKwLoading(false);
  }

  async function addKwMapping() {
    if (!kwStoreId || kwSaving) return;
    const word = kwForm.keyword.trim();
    if (!word) { setKwError('Enter the word to look for on the receipt.'); return; }
    if (word.length < 3) { setKwError('A keyword needs at least three characters, because it matches part of a receipt line ("a" would match almost every line).'); return; }
    setKwSaving(true);
    setKwError('');
    try {
      await storesApi.addKeywordMapping(kwStoreId, word, kwForm.category);
      const res = await storesApi.getKeywordMappings(kwStoreId);
      setKwMappings(res.data.data ?? []);
      setKwForm((f) => ({ ...f, keyword: '' }));
      toast.success('Keyword added');
    } catch (e) { setKwError(failureMessage(e, 'Could not add the keyword. Nothing was changed.')); }
    setKwSaving(false);
  }

  async function deleteKwMapping(id: string) {
    if (!kwStoreId) return;
    setKwError('');
    try {
      await storesApi.deleteKeywordMapping(kwStoreId, id);
      setKwMappings((prev) => prev.filter((m) => m.id !== id));
    } catch (e: any) {
      if (e?.response?.status === 404) setKwMappings((prev) => prev.filter((m) => m.id !== id));
      setKwError(failureMessage(e, 'Could not remove the keyword. Nothing was changed.'));
    }
  }

  function openEdit(store: Store) {
    setEditStore(store);
    setForm({
      name: store.name,
      address: store.address,
      city: store.city,
      state: store.state,
      zipCode: store.zipCode,
      phone: showPhone(store.phone),
      latitude: store.latitude != null ? String(store.latitude) : '',
      longitude: store.longitude != null ? String(store.longitude) : '',
      requiresAgeGate: store.minimumAge === 21,
    });
    setEnabledCats(store.enabledCategories ?? []);
    setEditError('');
  }

  function toggleCat(cat: string) {
    setEnabledCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  async function openHoursModal(storeId: string) {
    setHoursStoreId(storeId);
    setHoursError('');
    setHoursLoading(true);
    try {
      const res = await storesApi.getHours(storeId);
      const { weekly, holidays: h } = res.data.data as { weekly: (DayForm & { dayOfWeek: DayOfWeek })[]; holidays: Holiday[] };
      const next = Object.fromEntries(DAYS.map((d) => [d.value, BLANK_DAY])) as Record<DayOfWeek, DayForm>;
      for (const row of weekly) {
        next[row.dayOfWeek] = { isClosed: row.isClosed, isOpen24Hours: row.isOpen24Hours, openTime: row.openTime ?? '', closeTime: row.closeTime ?? '' };
      }
      setWeekForm(next);
      setHolidays(h);
    } catch (e) {
      setHoursError(failureMessage(e, 'Could not load the store hours.'));
    }
    setHoursLoading(false);
  }

  function setDay(day: DayOfWeek, patch: Partial<DayForm>) {
    setWeekForm((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
    setHoursError('');
  }

  // One click for the whole week, so twelve stores take minutes
  function applyToAllDays(day: DayForm) {
    setWeekForm(Object.fromEntries(DAYS.map((d) => [d.value, { ...day }])) as Record<DayOfWeek, DayForm>);
    setHoursError('');
  }

  function weekProblem(): string | null {
    for (const d of DAYS) {
      const day = weekForm[d.value];
      if (day.isClosed || day.isOpen24Hours) continue;
      if (!day.openTime || !day.closeTime) return `${d.label} is open but has no opening or closing time. Set both times, mark it closed, or choose 24 hours.`;
      if (day.openTime === day.closeTime) return `${d.label} opens and closes at the same time (${formatTime12h(day.openTime)}). Use 24 Hours for a day that never closes.`;
    }
    return null;
  }

  async function saveWeekHours() {
    if (!hoursStoreId || weekSaving) return;
    const problem = weekProblem();
    if (problem) { setHoursError(problem); return; }
    setWeekSaving(true);
    setHoursError('');
    try {
      const payload = DAYS.map((d) => ({
        dayOfWeek: d.value,
        isClosed: weekForm[d.value].isClosed,
        isOpen24Hours: weekForm[d.value].isOpen24Hours,
        openTime: weekForm[d.value].isClosed || weekForm[d.value].isOpen24Hours ? null : weekForm[d.value].openTime,
        closeTime: weekForm[d.value].isClosed || weekForm[d.value].isOpen24Hours ? null : weekForm[d.value].closeTime,
      }));
      const res = await storesApi.updateHours(hoursStoreId, payload);
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success(res.data?.changed === false ? 'Those hours were already saved.' : 'Weekly hours saved');
    } catch (e) {
      setHoursError(failureMessage(e, 'Could not save the weekly hours. Nothing was changed.'));
    }
    setWeekSaving(false);
  }

  async function addHoliday() {
    if (!hoursStoreId || holidaySaving) return;
    if (!newHoliday.date) { setHoursError('Pick the date of the holiday.'); return; }
    if (!newHoliday.label.trim()) { setHoursError('Enter a name for the holiday (for example Thanksgiving).'); return; }
    if (!newHoliday.isClosed && !newHoliday.isOpen24Hours && (!newHoliday.openTime || !newHoliday.closeTime)) {
      setHoursError('Set both times for the holiday, mark it closed, or choose 24 hours.');
      return;
    }
    setHolidaySaving(true);
    setHoursError('');
    try {
      const res = await storesApi.addHoliday(hoursStoreId, {
        date: newHoliday.date,
        label: newHoliday.label.trim(),
        isClosed: newHoliday.isClosed,
        isOpen24Hours: newHoliday.isOpen24Hours,
        openTime: newHoliday.isClosed || newHoliday.isOpen24Hours ? null : newHoliday.openTime,
        closeTime: newHoliday.isClosed || newHoliday.isOpen24Hours ? null : newHoliday.closeTime,
      });
      setHolidays((prev) => [...prev.filter((h) => h.date !== res.data.data.date), res.data.data].sort((a, b) => a.date.localeCompare(b.date)));
      setNewHoliday({ date: '', label: '', isClosed: true, isOpen24Hours: false, openTime: '', closeTime: '' });
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Holiday hours added');
    } catch (e) {
      setHoursError(failureMessage(e, 'Could not add the holiday hours. Nothing was changed.'));
    }
    setHolidaySaving(false);
  }

  async function removeHoliday(holidayId: string) {
    if (!hoursStoreId) return;
    setHoursError('');
    try {
      await storesApi.deleteHoliday(hoursStoreId, holidayId);
      setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
      qc.invalidateQueries({ queryKey: ['stores'] });
    } catch (e: any) {
      if (e?.response?.status === 404) setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
      setHoursError(failureMessage(e, 'Could not remove the holiday hours. Nothing was changed.'));
    }
  }

  async function geocodeAddress() {
    const query = [form.address, form.city, form.state, form.zipCode].filter(Boolean).join(', ');
    if (!query.trim()) { setEditError('Enter the address first.'); return; }
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results = await res.json();
      if (!results.length) { setEditError('That address was not found. Try a more specific address, or type the coordinates yourself.'); return; }
      const { lat, lon } = results[0];
      setForm((f) => ({ ...f, latitude: parseFloat(lat).toFixed(6), longitude: parseFloat(lon).toFixed(6) }));
      toast.success('Coordinates filled in - verify they look correct!');
    } catch {
      setEditError('The address lookup could not be reached. Check the connection, or type the coordinates yourself.');
    } finally {
      setGeocoding(false);
    }
  }

  // The same rules the server enforces, so a typo is caught before anything is sent
  function editProblem(): string | null {
    if (!form.name.trim()) return 'Enter the store name.';
    if (!form.address.trim()) return 'Enter the street address.';
    if (!form.city.trim()) return 'Enter the city.';
    if (!/^[A-Za-z]{2}$/.test(form.state.trim())) return 'The state is its two-letter code, such as TX.';
    if (!/^\d{5}(-\d{4})?$/.test(form.zipCode.trim())) return 'The ZIP code is five digits, such as 75090.';
    if (form.phone.trim() && phoneDigits(form.phone).length !== 10) return 'Enter a full ten-digit phone number, or leave it empty.';
    const latText = form.latitude.trim();
    const lngText = form.longitude.trim();
    if ((latText === '') !== (lngText === '')) return 'Give both the latitude and the longitude, or leave both empty.';
    if (latText !== '') {
      const lat = Number(latText);
      const lng = Number(lngText);
      if (isNaN(lat) || isNaN(lng)) return 'The latitude and longitude must be numbers such as 33.7124 and -96.6482.';
      if (lat < 24 || lat > 50 || lng < -125 || lng > -66) return 'Those coordinates are not in the United States. Check that the latitude and longitude are not swapped and that the longitude has its minus sign (for Texas, about 26 to 36 and -94 to -106).';
    }
    return null;
  }

  // Not an error: coordinates that are in the United States but outside Texas and Oklahoma are worth a second look
  function coordinateNote(): string {
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (form.latitude.trim() === '' || form.longitude.trim() === '' || isNaN(lat) || isNaN(lng)) return '';
    return lat < REGION.latMin || lat > REGION.latMax || lng < REGION.lngMin || lng > REGION.lngMax
      ? 'These coordinates are outside Texas and Oklahoma. If that is right, ignore this note; the app finds the nearest store from them.'
      : '';
  }

  function save() {
    if (!editStore || mutation.isPending) return;
    const problem = editProblem();
    if (problem) { setEditError(problem); return; }
    const lat = form.latitude.trim() === '' ? null : parseFloat(form.latitude);
    const lng = form.longitude.trim() === '' ? null : parseFloat(form.longitude);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      zipCode: form.zipCode.trim(),
      phone: form.phone.trim(),   // empty clears the number
      latitude: lat,
      longitude: lng,
      enabledCategories: enabledCats,
      minimumAge: form.requiresAgeGate ? 21 : null,
    };
    setEditError('');
    runSave({ storeId: editStore.id, payload });
  }

  const setF = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setEditError('');
  };
  const storeNameOf = (id: string | null) => stores.find((st) => st.id === id)?.name ?? '';

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmRegenId}
        title="Regenerate API Key"
        message="The old key stops working immediately. You must update config.json on that store's POS device before it can process transactions again."
        confirmLabel="Regenerate"
        danger
        onConfirm={() => { if (confirmRegenId) { regenApiKey(confirmRegenId); } setConfirmRegenId(null); }}
        onCancel={() => setConfirmRegenId(null)}
      />
      <ConfirmModal
        open={!!confirmDeactivateId}
        title="Deactivate Store"
        message="Customers stop seeing this store anywhere in the app (gas prices, offers, hot food), and sales, redemptions and benefit claims can no longer be recorded here. Staff keep their accounts. You can reactivate it any time from this page."
        confirmLabel="Deactivate"
        danger
        onConfirm={() => { if (confirmDeactivateId) { runActive({ storeId: confirmDeactivateId, isActive: false }); } setConfirmDeactivateId(null); }}
        onCancel={() => setConfirmDeactivateId(null)}
      />
      <ConfirmModal
        open={!!pendingGas}
        title={`Change prices at ${pendingGas?.store.name ?? ''}?`}
        message={pendingGas ? (
          <div style={{ textAlign: 'left' }}>
            <ul style={{ margin: '0 0 8px', paddingLeft: 18, lineHeight: 1.7 }}>{pendingGas.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            This is a big move or a very low price. Customers see it at once and the store's staff are told to update the pumps. Check it is right.
          </div>
        ) : ''}
        confirmLabel="Change prices"
        danger
        busy={gasMutation.isPending}
        onConfirm={() => { if (pendingGas) runGas({ storeId: pendingGas.store.id, payload: pendingGas.payload }); }}
        onCancel={() => setPendingGas(null)}
      />
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Stores</h1>
          <p style={s.subtitle}>Manage store details and location coordinates</p>
        </div>
        <div style={s.countPill}>{stores.length} stores</div>
      </div>

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : isError ? (
        <ErrorState message="Failed to load stores." onRetry={refetch} />
      ) : (
        <div style={s.grid}>
          {stores.map((store, idx) => {
            const color = storeAvatar(idx);
            const hasCoords = store.latitude != null && store.longitude != null;
            return (
              <div key={store.id} style={{ ...s.card, ...(store.isActive ? {} : s.cardInactive) }}>
                {!store.isActive && (
                  <div style={s.inactiveBanner}>🚫 Inactive, hidden from customers and staff</div>
                )}
                {/* Card header */}
                <div style={s.cardTop}>
                  <div style={{ ...s.avatar, background: color }}>
                    {store.name[0].toUpperCase()}
                  </div>
                  <div style={s.cardInfo}>
                    <div style={s.storeName}>{store.name}</div>
                    <div style={s.storeSub}>{store.city}, {store.state}</div>
                  </div>
                  <div style={s.badgeStack}>
                    <div style={{ ...s.coordBadge, background: hasCoords ? '#f0fdf4' : '#fff1f2', border: hasCoords ? '1px solid #bbf7d0' : '1px solid #fecaca', color: hasCoords ? '#15803d' : '#b91c1c' }}>
                      {hasCoords ? '📍 Located' : '❌ No coords'}
                    </div>
                    {store.minimumAge === 21 && (
                      <div style={{ ...s.coordBadge, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                        🔞 21+ Required
                      </div>
                    )}
                  </div>
                </div>

                {/* Address row */}
                <div style={s.divider} />
                <div style={s.detailRow}>
                  <span style={s.detailLabel}>Address</span>
                  <span style={s.detailVal}>{store.address}, {store.zipCode}</span>
                </div>
                {store.phone && (
                  <div style={s.detailRow}>
                    <span style={s.detailLabel}>Phone</span>
                    <span style={s.detailVal}>{showPhone(store.phone)}</span>
                  </div>
                )}
                <div style={s.detailRow}>
                  <span style={s.detailLabel}>Today</span>
                  {store.todayHours ? (
                    <span style={s.detailVal}>{store.todayHours}</span>
                  ) : (
                    <span style={{ ...s.detailVal, color: '#b91c1c' }}>Hours not set</span>
                  )}
                </div>
                {hasCoords && (
                  <div style={s.detailRow}>
                    <span style={s.detailLabel}>Coordinates</span>
                    <span style={s.coordText}>{store.latitude!.toFixed(5)}, {store.longitude!.toFixed(5)}</span>
                  </div>
                )}

                {/* ── Category pills ── */}
                <div style={s.divider} />
                <div style={s.catSectionLabel}>Available Categories</div>
                <div style={s.catPillRow}>
                  {ALL_CATEGORIES.map(cat => {
                    const enabled = store.enabledCategories.length === 0 || store.enabledCategories.includes(cat.value);
                    return (
                      <span key={cat.value} style={{ ...s.catPill, ...(enabled ? s.catPillOn : s.catPillOff) }}>
                        {cat.icon} {cat.label}
                      </span>
                    );
                  })}
                </div>

                {/* ── Gas Prices inline editor ── */}
                <div style={s.divider} />
                <div style={s.gasSectionLabel}>⛽ Gas Prices</div>
                <div style={s.gasRow}>
                  {(['gas', 'diesel'] as const).map((kind) => {
                    const saved = kind === 'gas' ? store.gasPricePerGallon : store.dieselPricePerGallon;
                    const at = kind === 'gas' ? store.gasPriceUpdatedAt : store.dieselPriceUpdatedAt;
                    const age = priceAge(saved, at);
                    const enabled = categoryEnabled(store, kind === 'gas' ? 'GAS' : 'DIESEL');
                    return (
                      <div key={kind} style={s.gasField}>
                        <label style={s.gasLabel} htmlFor={`${kind}-${store.id}`}>{kind === 'gas' ? '⛽ Gas $/gal' : '🚛 Diesel $/gal'}</label>
                        <input
                          id={`${kind}-${store.id}`}
                          style={s.gasInput}
                          type="text"
                          inputMode="decimal"
                          maxLength={6}
                          placeholder="0.000"
                          value={getGasForm(store)[kind]}
                          onChange={(e) => setGasField(store.id, kind, e.target.value.replace(/[^0-9.]/g, ''))}
                        />
                        <span style={{ ...s.gasAge, ...(age.stale ? s.gasAgeStale : {}) }}>{age.text === 'never set' ? 'Never set' : `Updated ${age.text}`}</span>
                        {!enabled && (
                          <span style={s.gasDisabledHint}>{kind === 'gas' ? 'Gas' : 'Diesel'} is disabled here, hidden from customers</span>
                        )}
                      </div>
                    );
                  })}
                  <button
                    style={{
                      ...s.gasUpdateBtn,
                      ...(gasFormDirty(store) && !gasProblem(store) ? s.gasUpdateBtnActive : {}),
                    }}
                    aria-label={`Update prices at ${store.name}`}
                    onClick={() => saveGasPrices(store)}
                    disabled={!gasFormDirty(store) || !!gasProblem(store) || gasMutation.isPending}
                  >
                    {gasMutation.isPending ? '…' : 'Update'}
                  </button>
                </div>
                {gasProblem(store) && <div role="alert" style={s.gasError}>{gasProblem(store)}</div>}

                {isDevAdmin && (
                  <>
                    <div style={s.divider} />
                    <div style={s.apiKeySection}>
                      <div style={s.apiKeyLabel}>🔑 Printer Agent API Key</div>
                      {apiKeyVisible[store.id] && apiKeys[store.id] ? (
                        <div style={s.apiKeyBox}>
                          <code style={s.apiKeyCode}>{apiKeys[store.id]}</code>
                          <div style={s.apiKeyHint}>Copy this now - it can't be shown again after you leave this page.</div>
                          <div style={s.apiKeyBtns}>
                            <button style={s.apiKeyBtn} onClick={() => copyApiKey(apiKeys[store.id])}>📋 Copy</button>
                            <button style={{ ...s.apiKeyBtn, color: '#b91c1c', borderColor: '#fca5a5' }} onClick={() => setConfirmRegenId(store.id)}>🔄 Regenerate</button>
                            <button style={{ ...s.apiKeyBtn, color: TEXT_MUTED }} onClick={() => setApiKeyVisible((p) => ({ ...p, [store.id]: false }))}>Hide</button>
                          </div>
                        </div>
                      ) : apiKeyStatus[store.id] !== undefined ? (
                        <div style={s.apiKeyBox}>
                          <div style={s.apiKeyStatusText}>
                            {apiKeyStatus[store.id] ? '✓ A key is configured (not shown again - regenerate for a new one)' : 'No key set yet'}
                          </div>
                          <div style={s.apiKeyBtns}>
                            <button style={s.apiKeyBtn} onClick={() => setConfirmRegenId(store.id)}>🔄 Regenerate</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          style={s.apiKeyRevealBtn}
                          onClick={() => checkApiKeyStatus(store.id)}
                          disabled={apiKeyStoreId === store.id}
                        >
                          {apiKeyStoreId === store.id ? 'Checking…' : '🔎 Check API Key Status'}
                        </button>
                      )}
                    </div>
                  </>
                )}

                {pendingDisputesByStore[store.id] > 0 && (
                  <div style={s.disputeBanner}>
                    <span style={s.disputeBannerDot} />
                    <span style={s.disputeBannerText}>
                      {pendingDisputesByStore[store.id]} pending dispute{pendingDisputesByStore[store.id] > 1 ? 's' : ''}
                    </span>
                    <button style={{ ...s.disputeBannerLink, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate('/customers')}>
                      Review →
                    </button>
                  </div>
                )}

                {isDevAdmin && (
                  <div style={s.cardBtns}>
                    <button
                      style={{ ...s.kwBtn, ...(store.isActive ? { color: '#b91c1c', borderColor: '#fca5a5' } : { color: '#15803d', borderColor: '#86efac' }) }}
                      onClick={() => store.isActive ? setConfirmDeactivateId(store.id) : runActive({ storeId: store.id, isActive: true })}
                      disabled={activeMutation.isPending}
                    >
                      {store.isActive ? '🚫 Deactivate' : '✅ Reactivate'}
                    </button>
                  </div>
                )}

                <div style={s.divider} />
                <div style={s.cardBtns}>
                  <button style={s.kwBtn} onClick={() => openKwModal(store.id)}>
                    🗂️ POS Mappings
                  </button>
                  <button style={s.kwBtn} onClick={() => openHoursModal(store.id)}>
                    🕐 Store Hours
                  </button>
                </div>
                <div style={{ ...s.cardBtns, marginTop: 8 }}>
                  <button style={{ ...s.editBtn, borderColor: color, color: PRIMARY }} onClick={() => openEdit(store)}>
                    ✏️ Edit Store
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POS Keyword Mappings */}
      {kwStoreId && (
        <Modal title="POS Keyword Mappings" subtitle={`${storeNameOf(kwStoreId)} - map POS receipt labels to Lucky Stop categories`} onClose={() => setKwStoreId(null)} maxWidth={560}>
          <div style={s.kwHint}>
            When the printer-agent parses a receipt, it checks these keywords first (case-insensitive, partial match).
            If a line contains the keyword, it's classified into the chosen category - overriding the built-in patterns.
            <br /><br />
            <strong>Example:</strong> your POS prints "FUEL GRD 1" → add keyword <code>fuel grd</code> → GAS
          </div>

          {kwLoading ? (
            <div style={{ padding: '20px 0', color: TEXT_MUTED, textAlign: 'center' }} role="status">Loading…</div>
          ) : kwMappings.length === 0 ? (
            <div style={s.kwEmpty}>No custom mappings yet - built-in keyword patterns will be used.</div>
          ) : (
            <div style={s.kwList}>
              {kwMappings.map((m) => {
                const catMeta = ALL_CATEGORIES.find((c) => c.value === m.category);
                return (
                  <div key={m.id} style={s.kwRow}>
                    <code style={s.kwKeyword}>{m.keyword}</code>
                    <span style={s.kwArrow} aria-hidden="true">→</span>
                    <span style={s.kwCat}>{catMeta?.icon} {catMeta?.label ?? m.category}</span>
                    <button style={s.kwDeleteBtn} aria-label={`Remove the keyword ${m.keyword}`} onClick={() => deleteKwMapping(m.id)}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <div style={s.sectionLabel}>Add Mapping</div>
            <div style={s.kwAddRow}>
              <input
                style={{ ...s.input, flex: 2, minWidth: 0 }}
                aria-label="Keyword to look for on the receipt"
                placeholder="e.g. fuel grd 1"
                value={kwForm.keyword}
                maxLength={40}
                onChange={(e) => { setKwForm((f) => ({ ...f, keyword: e.target.value })); setKwError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && addKwMapping()}
              />
              <select
                style={{ ...s.input, flex: 1, minWidth: 0, cursor: 'pointer' }}
                aria-label="Category the keyword counts as"
                value={kwForm.category}
                onChange={(e) => setKwForm((f) => ({ ...f, category: e.target.value }))}
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
              <button
                style={s.kwAddBtn}
                onClick={addKwMapping}
                disabled={kwSaving || !kwForm.keyword.trim()}
              >
                {kwSaving ? '…' : '+ Add'}
              </button>
            </div>
          </div>
          {kwError && <div role="alert" style={s.errorBox}>{kwError}</div>}
          <div style={s.modalActions}>
            <button style={s.saveBtn} onClick={() => setKwStoreId(null)}>Done</button>
          </div>
        </Modal>
      )}

      {/* Store Hours */}
      {hoursStoreId && (
        <Modal title="Store Hours" subtitle={storeNameOf(hoursStoreId)} onClose={() => setHoursStoreId(null)} busy={weekSaving || holidaySaving} maxWidth={640}>
          {hoursLoading ? (
            <div style={{ padding: '20px 0', color: TEXT_MUTED, textAlign: 'center' }} role="status">Loading…</div>
          ) : (
            <>
              <div>
                <div style={s.sectionLabelFirst}>Fill in the whole week</div>
                <div style={s.presetRow} role="group" aria-label="Fill in the whole week at once">
                  <input style={s.hoursTimeInput} type="time" aria-label="Every day opens at" value={allDays.openTime} onChange={(e) => setAllDays((a) => ({ ...a, openTime: e.target.value }))} />
                  <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
                  <input style={s.hoursTimeInput} type="time" aria-label="Every day closes at" value={allDays.closeTime} onChange={(e) => setAllDays((a) => ({ ...a, closeTime: e.target.value }))} />
                  <button type="button" style={s.presetBtn} disabled={!allDays.openTime || !allDays.closeTime} onClick={() => applyToAllDays({ isClosed: false, isOpen24Hours: false, openTime: allDays.openTime, closeTime: allDays.closeTime })}>Same every day</button>
                  <button type="button" style={s.presetBtn} onClick={() => applyToAllDays({ isClosed: false, isOpen24Hours: true, openTime: '', closeTime: '' })}>Open 24 hours every day</button>
                  <button type="button" style={s.presetBtn} onClick={() => applyToAllDays({ ...weekForm.MON })}>Copy Monday to all days</button>
                </div>
              </div>
              <div>
                <div style={s.sectionLabelFirst}>Weekly Schedule</div>
                <div style={s.hoursWeekList}>
                  {DAYS.map((d) => {
                    const day = weekForm[d.value];
                    return (
                      <div key={d.value} style={s.hoursDayRow}>
                        <div style={s.hoursDayLabel}>{d.label}</div>
                        <div style={s.hoursDayControls}>
                          <button type="button" aria-pressed={day.isClosed} aria-label={`${d.label} closed`}
                            style={{ ...s.hoursChip, ...(day.isClosed ? s.hoursChipOffRed : {}) }}
                            onClick={() => setDay(d.value, { isClosed: !day.isClosed })}
                          >
                            Closed
                          </button>
                          <button type="button" aria-pressed={day.isOpen24Hours} aria-label={`${d.label} open 24 hours`}
                            style={{ ...s.hoursChip, ...(day.isOpen24Hours ? s.hoursChipOnGreen : {}) }}
                            onClick={() => setDay(d.value, { isOpen24Hours: !day.isOpen24Hours, isClosed: false })}
                            disabled={day.isClosed}
                          >
                            24 Hours
                          </button>
                          {!day.isClosed && !day.isOpen24Hours && (
                            <>
                              <input style={s.hoursTimeInput} type="time" aria-label={`${d.label} opens at`} value={day.openTime} onChange={(e) => setDay(d.value, { openTime: e.target.value })} />
                              <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
                              <input style={s.hoursTimeInput} type="time" aria-label={`${d.label} closes at`} value={day.closeTime} onChange={(e) => setDay(d.value, { closeTime: e.target.value })} />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button style={{ ...s.saveBtn, width: '100%' }} onClick={saveWeekHours} disabled={weekSaving}>
                  {weekSaving ? 'Saving…' : 'Save Weekly Hours'}
                </button>
              </div>

              <div>
                <div style={s.sectionLabelFirst}>Holiday / Special-Date Hours</div>
                <div style={s.catHint}>
                  Overrides the regular weekly schedule for one specific date, e.g. closed on Thanksgiving, or shorter hours on Christmas Eve.
                </div>
                {holidays.length === 0 ? (
                  <div style={s.kwEmpty}>No holiday overrides yet.</div>
                ) : (
                  <div style={s.kwList}>
                    {holidays.map((h) => (
                      <div key={h.id} style={s.kwRow}>
                        <span style={s.holidayDate}>{holidayDay(h.date)}</span>
                        <span style={{ flex: 1, color: '#374151' }}>{h.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: h.isClosed ? '#b91c1c' : '#15803d' }}>{scheduleSummary(h)}</span>
                        <button style={s.kwDeleteBtn} aria-label={`Remove the ${h.label} holiday hours`} onClick={() => removeHoliday(h.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={s.sectionLabel}>Add a Date Override</div>
                <div style={s.fieldRow}>
                  <div style={s.field}>
                    <label style={s.label} htmlFor="holiday-date">Date</label>
                    <input id="holiday-date" style={s.input} type="date" value={newHoliday.date} onChange={(e) => { setNewHoliday((f) => ({ ...f, date: e.target.value })); setHoursError(''); }} />
                  </div>
                  <div style={{ ...s.field, flex: 2 }}>
                    <label style={s.label} htmlFor="holiday-label">Label</label>
                    <input id="holiday-label" style={s.input} placeholder="Thanksgiving" maxLength={60} value={newHoliday.label} onChange={(e) => { setNewHoliday((f) => ({ ...f, label: e.target.value })); setHoursError(''); }} />
                  </div>
                </div>
                <div style={s.hoursDayControls}>
                  <button type="button" aria-pressed={newHoliday.isClosed}
                    style={{ ...s.hoursChip, ...(newHoliday.isClosed ? s.hoursChipOffRed : {}) }}
                    onClick={() => setNewHoliday((f) => ({ ...f, isClosed: !f.isClosed }))}
                  >
                    Closed
                  </button>
                  <button type="button" aria-pressed={newHoliday.isOpen24Hours}
                    style={{ ...s.hoursChip, ...(newHoliday.isOpen24Hours ? s.hoursChipOnGreen : {}) }}
                    onClick={() => setNewHoliday((f) => ({ ...f, isOpen24Hours: !f.isOpen24Hours, isClosed: false }))}
                    disabled={newHoliday.isClosed}
                  >
                    24 Hours
                  </button>
                  {!newHoliday.isClosed && !newHoliday.isOpen24Hours && (
                    <>
                      <input style={s.hoursTimeInput} type="time" aria-label="Holiday opens at" value={newHoliday.openTime} onChange={(e) => setNewHoliday((f) => ({ ...f, openTime: e.target.value }))} />
                      <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
                      <input style={s.hoursTimeInput} type="time" aria-label="Holiday closes at" value={newHoliday.closeTime} onChange={(e) => setNewHoliday((f) => ({ ...f, closeTime: e.target.value }))} />
                    </>
                  )}
                </div>
                <button style={{ ...s.kwAddBtn, width: '100%', marginTop: 10 }} onClick={addHoliday} disabled={holidaySaving}>
                  {holidaySaving ? '…' : '+ Add Holiday Hours'}
                </button>
              </div>
            </>
          )}

          {hoursError && <div role="alert" style={s.errorBox}>{hoursError}</div>}
          <div style={s.modalActions}>
            <button style={{ ...s.cancelBtn, flex: 1 }} onClick={() => setHoursStoreId(null)}>Done</button>
          </div>
        </Modal>
      )}

      {/* Edit Store */}
      {editStore && (
        <Modal title="Edit Store" subtitle={editStore.name} onClose={() => setEditStore(null)} busy={mutation.isPending} maxWidth={640}>
          <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate style={s.editForm}>
            <div>
              <div style={s.sectionLabelFirst}>Store Details</div>
              <div style={s.fieldRow}>
                <div style={s.field}>
                  <label style={s.label} htmlFor="store-name">Store Name</label>
                  <input id="store-name" style={s.input} value={form.name} onChange={setF('name')} placeholder="Lucky Stop #1" maxLength={60} />
                </div>
                <div style={s.field}>
                  <label style={s.label} htmlFor="store-phone">Phone</label>
                  <input id="store-phone" style={s.input} value={form.phone} onChange={setF('phone')} placeholder="(580) 555-0100 - empty to clear" />
                </div>
              </div>
            </div>

            <div>
              <div style={s.sectionLabelFirst}>Address</div>
              <div style={s.field}>
                <label style={s.label} htmlFor="store-address">Street Address</label>
                <input id="store-address" style={s.input} value={form.address} onChange={setF('address')} placeholder="123 Main St" maxLength={120} />
              </div>
              <div style={s.fieldRow}>
                <div style={{ ...s.field, flex: 2 }}>
                  <label style={s.label} htmlFor="store-city">City</label>
                  <input id="store-city" style={s.input} value={form.city} onChange={setF('city')} placeholder="Sherman" maxLength={60} />
                </div>
                <div style={s.field}>
                  <label style={s.label} htmlFor="store-state">State</label>
                  <input id="store-state" style={s.input} value={form.state} onChange={setF('state')} placeholder="TX" maxLength={2} />
                </div>
                <div style={s.field}>
                  <label style={s.label} htmlFor="store-zip">ZIP Code</label>
                  <input id="store-zip" style={s.input} value={form.zipCode} onChange={setF('zipCode')} placeholder="75090" maxLength={10} />
                </div>
              </div>
            </div>

            <div>
              <div style={s.sectionLabelFirst}>Location Coordinates</div>
              <div style={s.geocodeHint}>
                Fill in the address above, then click <strong>Auto-fill</strong> to get coordinates automatically - or enter them manually. The app finds the nearest store from these.
              </div>
              <button type="button" style={s.geocodeBtn} onClick={geocodeAddress} disabled={geocoding}>
                {geocoding ? '⏳ Looking up…' : '🔍 Auto-fill from Address'}
              </button>
              <div style={s.fieldRow}>
                <div style={s.field}>
                  <label style={s.label} htmlFor="store-lat">Latitude</label>
                  <input id="store-lat" style={s.input} value={form.latitude} onChange={setF('latitude')} placeholder="33.7124" inputMode="decimal" />
                </div>
                <div style={s.field}>
                  <label style={s.label} htmlFor="store-lng">Longitude</label>
                  <input id="store-lng" style={s.input} value={form.longitude} onChange={setF('longitude')} placeholder="-96.6482" inputMode="decimal" />
                </div>
              </div>
              {coordinateNote() && <div role="status" style={s.noteBox}>{coordinateNote()}</div>}
            </div>

            <div>
              <div style={s.sectionLabelFirst}>Age-Restricted Store</div>
              <div style={s.catHint}>
                For stores like a liquor store, customers must confirm they're 21+ before the app shows this store's content.
              </div>
              <button
                type="button"
                aria-pressed={form.requiresAgeGate}
                style={{ ...s.catToggleBtn, width: '100%', flexDirection: 'row', justifyContent: 'center', marginBottom: 8, ...(form.requiresAgeGate ? s.catToggleBtnOn : s.catToggleBtnOff) }}
                onClick={() => setForm((f) => ({ ...f, requiresAgeGate: !f.requiresAgeGate }))}
              >
                <span>🔞 Requires 21+ Confirmation</span>
                <span style={s.catToggleCheck}>{form.requiresAgeGate ? '✓ On' : '✕ Off'}</span>
              </button>
            </div>

            <div>
              <div style={s.sectionLabelFirst}>Available Categories</div>
              <div style={s.catHint}>
                Toggle which product categories are available at this store. Empty = all categories enabled.
              </div>
              <div style={s.catToggleGrid} role="group" aria-label="Available categories">
                {ALL_CATEGORIES.map(cat => {
                  const on = enabledCats.length === 0 || enabledCats.includes(cat.value);
                  return (
                    <button key={cat.value}
                      type="button"
                      aria-pressed={on}
                      style={{ ...s.catToggleBtn, ...(on ? s.catToggleBtnOn : s.catToggleBtnOff) }}
                      onClick={() => {
                        if (enabledCats.length === 0) {
                          // Currently "all" — clicking one turns on explicit list of all EXCEPT this
                          setEnabledCats(ALL_CATEGORIES.map(c => c.value).filter(v => v !== cat.value));
                        } else {
                          toggleCat(cat.value);
                        }
                      }}>
                      <span aria-hidden="true">{cat.icon}</span>
                      <span>{cat.label}</span>
                      <span style={s.catToggleCheck}>{on ? '✓ On' : '✕ Off'}</span>
                    </button>
                  );
                })}
              </div>
              {enabledCats.length > 0 && enabledCats.length < ALL_CATEGORIES.length && (
                <button type="button" style={s.resetCatBtn} onClick={() => setEnabledCats([])}>
                  Reset to all enabled
                </button>
              )}
            </div>

            {editError && <div role="alert" style={s.errorBox}>{editError}</div>}
            <div style={s.modalActions}>
              <button type="button" style={s.cancelBtn} onClick={() => setEditStore(null)} disabled={mutation.isPending}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 12, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: PRIMARY },
  subtitle: { margin: '4px 0 0', color: TEXT_MUTED, fontSize: 14 },
  countPill: { background: PRIMARY, color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 15, fontWeight: 700, alignSelf: 'center' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 18 },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 0 },
  cardInactive: { opacity: 0.72, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' },
  inactiveBanner: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 9, padding: '7px 11px', marginBottom: 12, textAlign: 'center' },

  cardTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 },
  cardInfo: { flex: 1, minWidth: 0 },
  storeName: { fontWeight: 700, fontSize: 15, color: '#1a1a2e', overflowWrap: 'anywhere' },
  storeSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 2 },
  badgeStack: { display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 },
  coordBadge: { fontSize: 13, fontWeight: 600, padding: '3px 9px', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap' },

  divider: { height: 1, background: '#f0f2f5', margin: '10px 0' },
  detailRow: { display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 },
  detailLabel: { fontSize: 13, color: TEXT_MUTED, fontWeight: 600, width: 78, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.3 },
  detailVal: { fontSize: 15, color: '#444' },
  coordText: { fontFamily: 'monospace', fontSize: 14, color: PRIMARY, background: '#eef2ff', padding: '2px 7px', borderRadius: 5 },

  gasSectionLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  gasUpdatedAt: { fontSize: 12, fontWeight: 500, color: TEXT_MUTED, textTransform: 'none' as const, letterSpacing: 0 },
  gasRow: { display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 4 },
  gasField: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 4 },
  gasLabel: { fontSize: 13, fontWeight: 600, color: '#555' },
  gasInput: { border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 14, fontWeight: 700, color: '#1a1a2e', outline: 'none', width: '100%' },
  gasUpdateBtn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#e2e8f0', color: TEXT_MUTED, fontWeight: 700, fontSize: 15, cursor: 'not-allowed', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 1 },
  gasUpdateBtnActive: { background: PRIMARY, color: '#fff', cursor: 'pointer' },
  gasDisabledHint: { fontSize: 12, fontWeight: 600, color: '#b91c1c', marginTop: 2 },
  gasAge: { fontSize: 12, fontWeight: 600, color: TEXT_MUTED },
  gasAgeStale: { color: '#b91c1c' },
  gasError: { fontSize: 13, fontWeight: 600, color: '#b91c1c', margin: '4px 0 6px', lineHeight: 1.4 },

  editBtn: { marginTop: 4, width: '100%', padding: '8px 0', borderRadius: 9, border: '1.5px solid', background: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' },

  apiKeySection: { paddingTop: 4 },
  apiKeyLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 },
  apiKeyRevealBtn: { fontSize: 14, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #dee2e6', background: '#f8f9fb', cursor: 'pointer', color: PRIMARY },
  apiKeyBox: { background: '#f8f9fb', borderRadius: 10, padding: '10px 12px', border: '1px solid #e9ecef' },
  apiKeyCode: { display: 'block', fontSize: 13, fontFamily: 'monospace', color: PRIMARY, wordBreak: 'break-all' as const, marginBottom: 8 },
  apiKeyHint: { fontSize: 11.5, color: TEXT_MUTED, marginBottom: 8, fontStyle: 'italic' as const },
  apiKeyStatusText: { fontSize: 13, color: TEXT_MUTED, marginBottom: 8 },
  apiKeyBtns: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  apiKeyBtn: { fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1.5px solid #dee2e6', background: '#fff', cursor: 'pointer', color: PRIMARY },

  disputeBanner: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff7ed', borderRadius: 10, padding: '8px 12px', margin: '10px 0 0', border: '1px solid #fed7aa' },
  disputeBannerDot: { width: 8, height: 8, borderRadius: 4, background: '#ea580c', flexShrink: 0 },
  disputeBannerText: { flex: 1, fontSize: 14, fontWeight: 700, color: '#c2410c' },
  disputeBannerLink: { fontSize: 14, fontWeight: 700, color: '#ea580c', textDecoration: 'none' },

  cardBtns: { display: 'flex', gap: 8, marginTop: 4 },
  kwBtn: { flex: 1, padding: '8px 0', borderRadius: 9, border: '1.5px solid #dee2e6', background: '#f8f9fb', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: PRIMARY },

  kwHint: { fontSize: 14, color: TEXT_MUTED, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 13px', marginBottom: 14, lineHeight: 1.6 },
  kwEmpty: { fontSize: 15, color: TEXT_MUTED, padding: '10px 0', marginBottom: 8, textAlign: 'center' as const },
  kwList: { display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 14 },
  kwRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#f8f9fb', borderRadius: 9, padding: '8px 11px', border: '1px solid #e9ecef' },
  kwKeyword: { fontFamily: 'monospace', fontSize: 15, color: PRIMARY, fontWeight: 700, flex: 1 },
  kwArrow: { color: TEXT_MUTED, fontSize: 14 },
  kwCat: { fontSize: 14, fontWeight: 700, color: '#15803d', background: '#f0fdf4', borderRadius: 20, padding: '2px 9px', border: '1px solid #bbf7d0' },
  kwDeleteBtn: { background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 800, fontSize: 14, padding: '0 4px', lineHeight: 1 },
  kwAddRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  kwAddBtn: { padding: '9px 16px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap' as const },

  empty: { textAlign: 'center', padding: '60px 0', color: TEXT_MUTED, fontSize: 15 },

  // Boxes (the dialog itself is components/Modal)
  editForm: { display: 'flex', flexDirection: 'column', gap: 18 },
  errorBox: { fontSize: 15, color: '#7f1d1d', lineHeight: 1.5, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px' },
  noteBox: { fontSize: 14, color: '#78350f', lineHeight: 1.5, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginTop: 4 },
  presetRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  presetBtn: { fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #dee2e6', background: '#f8f9fb', color: PRIMARY, cursor: 'pointer' },
  sectionLabelFirst: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  sectionLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 18 },
  fieldRow: { display: 'flex', gap: 12, marginBottom: 0, flexWrap: 'wrap' },
  field: { flex: '1 1 120px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
  label: { fontSize: 14, fontWeight: 600, color: '#555' },
  input: { border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '9px 12px', fontSize: 15, color: '#1a1a2e', outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box', width: '100%' },

  catSectionLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 },
  catPillRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 4 },
  catPill: { fontSize: 13, fontWeight: 600, borderRadius: 20, padding: '3px 9px', border: '1px solid' },
  catPillOn: { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' },
  catPillOff: { background: '#f9f9f9', borderColor: '#e5e7eb', color: '#6b7280', textDecoration: 'line-through' },


  catHint: { fontSize: 14, color: TEXT_MUTED, background: '#f8f9fb', borderRadius: 8, padding: '8px 12px', marginBottom: 10 },
  catToggleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(120px, 100%), 1fr))', gap: 8, marginBottom: 8 },
  catToggleBtn: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, padding: '10px 6px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  catToggleBtnOn: { background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' },
  catToggleBtnOff: { background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c' },
  catToggleCheck: { fontSize: 13, fontWeight: 800 },
  resetCatBtn: { fontSize: 14, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 8, padding: 0 },

  geocodeHint: { fontSize: 14, color: TEXT_MUTED, background: '#f8f9fb', borderRadius: 8, padding: '9px 12px', marginBottom: 10, lineHeight: 1.5 },
  geocodeBtn: { width: '100%', padding: '10px 0', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14 },

  hoursWeekList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 },
  hoursDayRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#f8f9fb', borderRadius: 10, padding: '9px 12px', border: '1px solid #e9ecef' },
  hoursDayLabel: { fontSize: 14, fontWeight: 700, color: '#1a1a2e', width: 88, flexShrink: 0 },
  hoursDayControls: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  hoursChip: { fontSize: 13, fontWeight: 700, padding: '5px 11px', borderRadius: 20, border: '1.5px solid #dee2e6', background: '#fff', color: TEXT_MUTED, cursor: 'pointer' },
  hoursChipOffRed: { background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c' },
  hoursChipOnGreen: { background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' },
  hoursTimeInput: { border: '1.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px', fontSize: 14, color: '#1a1a2e', outline: 'none' },
  holidayDate: { fontWeight: 700, color: '#1a1a2e', width: 66, flexShrink: 0, fontSize: 14 },

  modalActions: { display: 'flex', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: '11px 0', background: '#fff', border: '1.5px solid #dee2e6', color: TEXT_MUTED, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { flex: 2, padding: '11px 0', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
