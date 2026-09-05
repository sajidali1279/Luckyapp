import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { storesApi, disputesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

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
  const [kwStoreId, setKwStoreId] = useState<string | null>(null);
  const [kwMappings, setKwMappings] = useState<{ id: string; keyword: string; category: string }[]>([]);
  const [kwLoading, setKwLoading] = useState(false);
  const [kwForm, setKwForm] = useState({ keyword: '', category: 'GROCERIES' });
  const [kwSaving, setKwSaving] = useState(false);

  const [confirmRegenId, setConfirmRegenId] = useState<string | null>(null);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Store updated');
      setEditStore(null);
    },
    onError: () => toast.error('Failed to save'),
  });

  const activeMutation = useMutation({
    mutationFn: ({ storeId, isActive }: { storeId: string; isActive: boolean }) =>
      storesApi.update(storeId, { isActive }),
    onSuccess: (_, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success(isActive ? 'Store reactivated' : 'Store deactivated');
    },
    onError: () => toast.error('Failed to update store status'),
  });

  const gasMutation = useMutation({
    mutationFn: ({ storeId, payload }: { storeId: string; payload: object }) =>
      storesApi.updateGasPrices(storeId, payload),
    onSuccess: (_, { storeId }) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      // Clear the inline form for this store
      setGasForms((prev) => { const n = { ...prev }; delete n[storeId]; return n; });
      toast.success('⛽ Gas prices updated - staff notified');
    },
    onError: () => toast.error('Failed to update gas prices'),
  });

  function getGasForm(store: Store) {
    return gasForms[store.id] ?? {
      gas:    store.gasPricePerGallon    != null ? store.gasPricePerGallon.toFixed(3)    : '',
      diesel: store.dieselPricePerGallon != null ? store.dieselPricePerGallon.toFixed(3) : '',
    };
  }

  function setGasField(storeId: string, field: 'gas' | 'diesel', value: string) {
    setGasForms((prev) => ({ ...prev, [storeId]: { ...getGasFormById(storeId, field), [field]: value } }));
  }

  function getGasFormById(storeId: string, _field: string) {
    return gasForms[storeId] ?? { gas: '', diesel: '' };
  }

  function saveGasPrices(store: Store) {
    const gf = getGasForm(store);
    const payload: Record<string, number> = {};
    const gas    = parseFloat(gf.gas);
    const diesel = parseFloat(gf.diesel);
    if (gf.gas.trim()    !== '' && !isNaN(gas))    payload.gasPricePerGallon    = gas;
    if (gf.diesel.trim() !== '' && !isNaN(diesel)) payload.dieselPricePerGallon = diesel;
    if (Object.keys(payload).length === 0) { toast.error('Enter at least one price'); return; }
    gasMutation.mutate({ storeId: store.id, payload });
  }

  function gasFormDirty(store: Store) {
    const gf = getGasForm(store);
    const origGas    = store.gasPricePerGallon    != null ? store.gasPricePerGallon.toFixed(3)    : '';
    const origDiesel = store.dieselPricePerGallon != null ? store.dieselPricePerGallon.toFixed(3) : '';
    return gf.gas !== origGas || gf.diesel !== origDiesel;
  }

  async function loadApiKey(storeId: string) {
    setApiKeyStoreId(storeId);
    if (apiKeys[storeId]) { setApiKeyVisible((p) => ({ ...p, [storeId]: true })); return; }
    try {
      const res = await storesApi.getApiKey(storeId);
      const key = res.data.data.apiKey;
      setApiKeys((p) => ({ ...p, [storeId]: key }));
      setApiKeyVisible((p) => ({ ...p, [storeId]: true }));
    } catch { toast.error('Failed to load API key'); }
    setApiKeyStoreId(null);
  }

  async function regenApiKey(storeId: string) {
    try {
      const res = await storesApi.regenerateApiKey(storeId);
      const key = res.data.data.apiKey;
      setApiKeys((p) => ({ ...p, [storeId]: key }));
      setApiKeyVisible((p) => ({ ...p, [storeId]: true }));
      toast.success('API key regenerated - update config.json on the store PC');
    } catch { toast.error('Failed to regenerate API key'); }
  }

  function copyApiKey(key: string) {
    navigator.clipboard.writeText(key).then(() => toast.success('Copied to clipboard'));
  }

  async function openKwModal(storeId: string) {
    setKwStoreId(storeId);
    setKwForm({ keyword: '', category: 'GROCERIES' });
    setKwLoading(true);
    try {
      const res = await storesApi.getKeywordMappings(storeId);
      setKwMappings(res.data.data ?? []);
    } catch { toast.error('Failed to load mappings'); }
    setKwLoading(false);
  }

  async function addKwMapping() {
    if (!kwStoreId || !kwForm.keyword.trim()) { toast.error('Enter a keyword'); return; }
    setKwSaving(true);
    try {
      await storesApi.addKeywordMapping(kwStoreId, kwForm.keyword.trim(), kwForm.category);
      const res = await storesApi.getKeywordMappings(kwStoreId);
      setKwMappings(res.data.data ?? []);
      setKwForm((f) => ({ ...f, keyword: '' }));
      toast.success('Mapping added');
    } catch { toast.error('Failed to add mapping'); }
    setKwSaving(false);
  }

  async function deleteKwMapping(id: string) {
    if (!kwStoreId) return;
    try {
      await storesApi.deleteKeywordMapping(kwStoreId, id);
      setKwMappings((prev) => prev.filter((m) => m.id !== id));
    } catch { toast.error('Failed to delete mapping'); }
  }

  function openEdit(store: Store) {
    setEditStore(store);
    setForm({
      name: store.name,
      address: store.address,
      city: store.city,
      state: store.state,
      zipCode: store.zipCode,
      phone: store.phone ?? '',
      latitude: store.latitude != null ? String(store.latitude) : '',
      longitude: store.longitude != null ? String(store.longitude) : '',
      requiresAgeGate: store.minimumAge === 21,
    });
    setEnabledCats(store.enabledCategories ?? []);
  }

  function toggleCat(cat: string) {
    setEnabledCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  async function openHoursModal(storeId: string) {
    setHoursStoreId(storeId);
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
    } catch {
      toast.error('Failed to load store hours');
    }
    setHoursLoading(false);
  }

  function setDay(day: DayOfWeek, patch: Partial<DayForm>) {
    setWeekForm((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  async function saveWeekHours() {
    if (!hoursStoreId) return;
    for (const d of DAYS) {
      const day = weekForm[d.value];
      if (!day.isClosed && !day.isOpen24Hours && (!day.openTime || !day.closeTime)) {
        toast.error(`Set open/close times for ${d.label}, mark it closed, or open 24 hours`);
        return;
      }
    }
    setWeekSaving(true);
    try {
      const payload = DAYS.map((d) => ({
        dayOfWeek: d.value,
        isClosed: weekForm[d.value].isClosed,
        isOpen24Hours: weekForm[d.value].isOpen24Hours,
        openTime: weekForm[d.value].isClosed || weekForm[d.value].isOpen24Hours ? null : weekForm[d.value].openTime,
        closeTime: weekForm[d.value].isClosed || weekForm[d.value].isOpen24Hours ? null : weekForm[d.value].closeTime,
      }));
      await storesApi.updateHours(hoursStoreId, payload);
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Weekly hours saved');
    } catch {
      toast.error('Failed to save weekly hours');
    }
    setWeekSaving(false);
  }

  async function addHoliday() {
    if (!hoursStoreId) return;
    if (!newHoliday.date) { toast.error('Pick a date'); return; }
    if (!newHoliday.label.trim()) { toast.error('Name this holiday (e.g. Thanksgiving)'); return; }
    if (!newHoliday.isClosed && !newHoliday.isOpen24Hours && (!newHoliday.openTime || !newHoliday.closeTime)) {
      toast.error('Set open/close times, mark it closed, or open 24 hours');
      return;
    }
    setHolidaySaving(true);
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
    } catch {
      toast.error('Failed to add holiday hours');
    }
    setHolidaySaving(false);
  }

  async function removeHoliday(holidayId: string) {
    if (!hoursStoreId) return;
    try {
      await storesApi.deleteHoliday(hoursStoreId, holidayId);
      setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
      qc.invalidateQueries({ queryKey: ['stores'] });
    } catch {
      toast.error('Failed to remove holiday hours');
    }
  }

  async function geocodeAddress() {
    const query = [form.address, form.city, form.state, form.zipCode].filter(Boolean).join(', ');
    if (!query.trim()) { toast.error('Enter an address first'); return; }
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results = await res.json();
      if (!results.length) { toast.error('Address not found - try a more specific address'); return; }
      const { lat, lon } = results[0];
      setForm((f) => ({ ...f, latitude: parseFloat(lat).toFixed(6), longitude: parseFloat(lon).toFixed(6) }));
      toast.success('Coordinates filled in - verify they look correct!');
    } catch {
      toast.error('Geocoding failed - check your connection');
    } finally {
      setGeocoding(false);
    }
  }

  function save() {
    if (!editStore) return;
    const lat = form.latitude.trim() === '' ? null : parseFloat(form.latitude);
    const lng = form.longitude.trim() === '' ? null : parseFloat(form.longitude);
    if ((lat != null && isNaN(lat)) || (lng != null && isNaN(lng))) {
      toast.error('Enter valid coordinates');
      return;
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      zipCode: form.zipCode.trim() || undefined,
      phone: form.phone.trim() || undefined,
      latitude: lat,
      longitude: lng,
      enabledCategories: enabledCats,
      minimumAge: form.requiresAgeGate ? 21 : null,
    };
    mutation.mutate({ storeId: editStore.id, payload });
  }

  const setF = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

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
        message="Customers stop seeing this store anywhere in the app (gas prices, offers, hot food) and staff assigned here lose access immediately. You can reactivate it any time from this page."
        confirmLabel="Deactivate"
        danger
        onConfirm={() => { if (confirmDeactivateId) { activeMutation.mutate({ storeId: confirmDeactivateId, isActive: false }); } setConfirmDeactivateId(null); }}
        onCancel={() => setConfirmDeactivateId(null)}
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
                    <span style={s.detailVal}>{store.phone}</span>
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
                <div style={s.gasSectionLabel}>
                  ⛽ Gas Prices
                  {store.gasPriceUpdatedAt && (
                    <span style={s.gasUpdatedAt}>
                      Updated {new Date(store.gasPriceUpdatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div style={s.gasRow}>
                  <div style={s.gasField}>
                    <label style={s.gasLabel}>⛽ Gas $/gal</label>
                    <input
                      style={s.gasInput}
                      type="number"
                      step="0.001"
                      min="0"
                      max="20"
                      placeholder="0.000"
                      value={getGasForm(store).gas}
                      onChange={(e) => setGasField(store.id, 'gas', e.target.value)}
                    />
                    {!categoryEnabled(store, 'GAS') && (
                      <span style={s.gasDisabledHint}>Gas is disabled here, hidden from customers</span>
                    )}
                  </div>
                  <div style={s.gasField}>
                    <label style={s.gasLabel}>🚛 Diesel $/gal</label>
                    <input
                      style={s.gasInput}
                      type="number"
                      step="0.001"
                      min="0"
                      max="20"
                      placeholder="0.000"
                      value={getGasForm(store).diesel}
                      onChange={(e) => setGasField(store.id, 'diesel', e.target.value)}
                    />
                    {!categoryEnabled(store, 'DIESEL') && (
                      <span style={s.gasDisabledHint}>Diesel is disabled here, hidden from customers</span>
                    )}
                  </div>
                  <button
                    style={{
                      ...s.gasUpdateBtn,
                      ...(gasFormDirty(store) ? s.gasUpdateBtnActive : {}),
                    }}
                    onClick={() => saveGasPrices(store)}
                    disabled={!gasFormDirty(store) || gasMutation.isPending}
                  >
                    {gasMutation.isPending ? '…' : 'Update'}
                  </button>
                </div>

                {isDevAdmin && (
                  <>
                    <div style={s.divider} />
                    <div style={s.apiKeySection}>
                      <div style={s.apiKeyLabel}>🔑 Printer Agent API Key</div>
                      {apiKeyVisible[store.id] && apiKeys[store.id] ? (
                        <div style={s.apiKeyBox}>
                          <code style={s.apiKeyCode}>{apiKeys[store.id]}</code>
                          <div style={s.apiKeyBtns}>
                            <button style={s.apiKeyBtn} onClick={() => copyApiKey(apiKeys[store.id])}>📋 Copy</button>
                            <button style={{ ...s.apiKeyBtn, color: '#E63946', borderColor: '#fca5a5' }} onClick={() => setConfirmRegenId(store.id)}>🔄 Regenerate</button>
                            <button style={{ ...s.apiKeyBtn, color: TEXT_MUTED }} onClick={() => setApiKeyVisible((p) => ({ ...p, [store.id]: false }))}>Hide</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          style={s.apiKeyRevealBtn}
                          onClick={() => loadApiKey(store.id)}
                          disabled={apiKeyStoreId === store.id}
                        >
                          {apiKeyStoreId === store.id ? 'Loading…' : '🔓 Reveal API Key'}
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
                      onClick={() => store.isActive ? setConfirmDeactivateId(store.id) : activeMutation.mutate({ storeId: store.id, isActive: true })}
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
                  <button style={{ ...s.editBtn, borderColor: color, color }} onClick={() => openEdit(store)}>
                    ✏️ Edit Store
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POS Keyword Mappings Modal */}
      {kwStoreId && (
        <div style={s.backdrop} onClick={() => setKwStoreId(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.dragHandle} />
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>🗂️ POS Keyword Mappings</div>
              <div style={s.modalSub}>
                {stores.find((st) => st.id === kwStoreId)?.name} - Map POS receipt labels to Lucky Stop categories
              </div>
            </div>
            <div style={s.kwHint}>
              When the printer-agent parses a receipt, it checks these keywords first (case-insensitive, partial match).
              If a line contains the keyword, it's classified into the chosen category - overriding the built-in patterns.
              <br /><br />
              <strong>Example:</strong> your POS prints "FUEL GRD 1" → add keyword <code>fuel grd</code> → GAS
            </div>

            {/* Existing mappings */}
            {kwLoading ? (
              <div style={{ padding: '20px 0', color: TEXT_MUTED, textAlign: 'center' }}>Loading…</div>
            ) : kwMappings.length === 0 ? (
              <div style={s.kwEmpty}>No custom mappings yet - built-in keyword patterns will be used.</div>
            ) : (
              <div style={s.kwList}>
                {kwMappings.map((m) => {
                  const catMeta = ALL_CATEGORIES.find((c) => c.value === m.category);
                  return (
                    <div key={m.id} style={s.kwRow}>
                      <code style={s.kwKeyword}>{m.keyword}</code>
                      <span style={s.kwArrow}>→</span>
                      <span style={s.kwCat}>{catMeta?.icon} {catMeta?.label ?? m.category}</span>
                      <button style={s.kwDeleteBtn} onClick={() => deleteKwMapping(m.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new mapping */}
            <div style={s.sectionLabel}>Add Mapping</div>
            <div style={s.kwAddRow}>
              <input
                style={{ ...s.input, flex: 2 }}
                placeholder="e.g. fuel grd 1"
                value={kwForm.keyword}
                onChange={(e) => setKwForm((f) => ({ ...f, keyword: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addKwMapping()}
              />
              <select
                style={{ ...s.input, flex: 1, cursor: 'pointer' }}
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

            <div style={s.modalActions}>
              <button style={s.saveBtn} onClick={() => setKwStoreId(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Store Hours Modal */}
      {hoursStoreId && (
        <div style={s.backdrop} onClick={() => setHoursStoreId(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.dragHandle} />
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>🕐 Store Hours</div>
              <div style={s.modalSub}>{stores.find((st) => st.id === hoursStoreId)?.name}</div>
            </div>

            {hoursLoading ? (
              <div style={{ padding: '20px 0', color: TEXT_MUTED, textAlign: 'center' }}>Loading…</div>
            ) : (
              <>
                <div style={s.sectionLabel}>Weekly Schedule</div>
                <div style={s.hoursWeekList}>
                  {DAYS.map((d) => {
                    const day = weekForm[d.value];
                    return (
                      <div key={d.value} style={s.hoursDayRow}>
                        <div style={s.hoursDayLabel}>{d.label}</div>
                        <div style={s.hoursDayControls}>
                          <button type="button"
                            style={{ ...s.hoursChip, ...(day.isClosed ? s.hoursChipOffRed : {}) }}
                            onClick={() => setDay(d.value, { isClosed: !day.isClosed })}
                          >
                            Closed
                          </button>
                          <button type="button"
                            style={{ ...s.hoursChip, ...(day.isOpen24Hours ? s.hoursChipOnGreen : {}) }}
                            onClick={() => setDay(d.value, { isOpen24Hours: !day.isOpen24Hours, isClosed: false })}
                            disabled={day.isClosed}
                          >
                            24 Hours
                          </button>
                          {!day.isClosed && !day.isOpen24Hours && (
                            <>
                              <input style={s.hoursTimeInput} type="time" value={day.openTime} onChange={(e) => setDay(d.value, { openTime: e.target.value })} />
                              <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
                              <input style={s.hoursTimeInput} type="time" value={day.closeTime} onChange={(e) => setDay(d.value, { closeTime: e.target.value })} />
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

                <div style={{ ...s.sectionLabel, marginTop: 26 }}>Holiday / Special-Date Hours</div>
                <div style={s.catHint}>
                  Overrides the regular weekly schedule for one specific date, e.g. closed on Thanksgiving, or shorter hours on Christmas Eve.
                </div>
                {holidays.length === 0 ? (
                  <div style={s.kwEmpty}>No holiday overrides yet.</div>
                ) : (
                  <div style={s.kwList}>
                    {holidays.map((h) => (
                      <div key={h.id} style={s.kwRow}>
                        <span style={s.holidayDate}>
                          {new Date(`${h.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span style={{ flex: 1, color: '#555' }}>{h.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: h.isClosed ? '#b91c1c' : '#15803d' }}>{scheduleSummary(h)}</span>
                        <button style={s.kwDeleteBtn} onClick={() => removeHoliday(h.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={s.sectionLabel}>Add a Date Override</div>
                <div style={s.fieldRow}>
                  <div style={s.field}>
                    <label style={s.label}>Date</label>
                    <input style={s.input} type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((f) => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div style={{ ...s.field, flex: 2 }}>
                    <label style={s.label}>Label</label>
                    <input style={s.input} placeholder="Thanksgiving" value={newHoliday.label} onChange={(e) => setNewHoliday((f) => ({ ...f, label: e.target.value }))} />
                  </div>
                </div>
                <div style={s.hoursDayControls}>
                  <button type="button"
                    style={{ ...s.hoursChip, ...(newHoliday.isClosed ? s.hoursChipOffRed : {}) }}
                    onClick={() => setNewHoliday((f) => ({ ...f, isClosed: !f.isClosed }))}
                  >
                    Closed
                  </button>
                  <button type="button"
                    style={{ ...s.hoursChip, ...(newHoliday.isOpen24Hours ? s.hoursChipOnGreen : {}) }}
                    onClick={() => setNewHoliday((f) => ({ ...f, isOpen24Hours: !f.isOpen24Hours, isClosed: false }))}
                    disabled={newHoliday.isClosed}
                  >
                    24 Hours
                  </button>
                  {!newHoliday.isClosed && !newHoliday.isOpen24Hours && (
                    <>
                      <input style={s.hoursTimeInput} type="time" value={newHoliday.openTime} onChange={(e) => setNewHoliday((f) => ({ ...f, openTime: e.target.value }))} />
                      <span style={{ color: TEXT_MUTED, fontSize: 13 }}>to</span>
                      <input style={s.hoursTimeInput} type="time" value={newHoliday.closeTime} onChange={(e) => setNewHoliday((f) => ({ ...f, closeTime: e.target.value }))} />
                    </>
                  )}
                </div>
                <button style={{ ...s.kwAddBtn, width: '100%', marginTop: 10 }} onClick={addHoliday} disabled={holidaySaving}>
                  {holidaySaving ? '…' : '+ Add Holiday Hours'}
                </button>
              </>
            )}

            <div style={s.modalActions}>
              <button style={{ ...s.cancelBtn, flex: 1 }} onClick={() => setHoursStoreId(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editStore && (
        <div style={s.backdrop} onClick={() => setEditStore(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.dragHandle} />
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Edit Store</div>
              <div style={s.modalSub}>{editStore.name}</div>
            </div>

            {/* Store Details */}
            <div style={s.sectionLabel}>Store Details</div>
            <div style={s.fieldRow}>
              <div style={s.field}>
                <label style={s.label}>Store Name</label>
                <input style={s.input} value={form.name} onChange={setF('name')} placeholder="Lucky Stop #1" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Phone</label>
                <input style={s.input} value={form.phone} onChange={setF('phone')} placeholder="+1 555-0100" />
              </div>
            </div>

            {/* Address */}
            <div style={s.sectionLabel}>Address</div>
            <div style={s.field}>
              <label style={s.label}>Street Address</label>
              <input style={s.input} value={form.address} onChange={setF('address')} placeholder="123 Main St" />
            </div>
            <div style={s.fieldRow}>
              <div style={{ ...s.field, flex: 2 }}>
                <label style={s.label}>City</label>
                <input style={s.input} value={form.city} onChange={setF('city')} placeholder="Atlanta" />
              </div>
              <div style={s.field}>
                <label style={s.label}>State</label>
                <input style={s.input} value={form.state} onChange={setF('state')} placeholder="GA" />
              </div>
              <div style={s.field}>
                <label style={s.label}>ZIP Code</label>
                <input style={s.input} value={form.zipCode} onChange={setF('zipCode')} placeholder="30301" />
              </div>
            </div>

            {/* Coordinates */}
            <div style={s.sectionLabel}>Location Coordinates</div>
            <div style={s.geocodeHint}>
              Fill in the address above, then click <strong>Auto-fill</strong> to get coordinates automatically - or enter them manually.
            </div>
            <button style={s.geocodeBtn} onClick={geocodeAddress} disabled={geocoding}>
              {geocoding ? '⏳ Looking up…' : '🔍 Auto-fill from Address'}
            </button>
            <div style={s.fieldRow}>
              <div style={s.field}>
                <label style={s.label}>Latitude</label>
                <input style={s.input} value={form.latitude} onChange={setF('latitude')} placeholder="33.749001" />
              </div>
              <div style={s.field}>
                <label style={s.label}>Longitude</label>
                <input style={s.input} value={form.longitude} onChange={setF('longitude')} placeholder="-84.388001" />
              </div>
            </div>

            {/* Age gate */}
            <div style={s.sectionLabel}>Age-Restricted Store</div>
            <div style={s.catHint}>
              For stores like a liquor store, customers must confirm they're 21+ before the app shows this store's content.
            </div>
            <button
              type="button"
              style={{ ...s.catToggleBtn, width: '100%', flexDirection: 'row', justifyContent: 'center', marginBottom: 8, ...(form.requiresAgeGate ? s.catToggleBtnOn : s.catToggleBtnOff) }}
              onClick={() => setForm((f) => ({ ...f, requiresAgeGate: !f.requiresAgeGate }))}
            >
              <span>🔞 Requires 21+ Confirmation</span>
              <span style={s.catToggleCheck}>{form.requiresAgeGate ? '✓' : '✕'}</span>
            </button>

            {/* Categories */}
            <div style={s.sectionLabel}>Available Categories</div>
            <div style={s.catHint}>
              Toggle which product categories are available at this store. Empty = all categories enabled.
            </div>
            <div style={s.catToggleGrid}>
              {ALL_CATEGORIES.map(cat => {
                const on = enabledCats.length === 0 || enabledCats.includes(cat.value);
                return (
                  <button key={cat.value}
                    type="button"
                    style={{ ...s.catToggleBtn, ...(on ? s.catToggleBtnOn : s.catToggleBtnOff) }}
                    onClick={() => {
                      if (enabledCats.length === 0) {
                        // Currently "all" — clicking one turns on explicit list of all EXCEPT this
                        setEnabledCats(ALL_CATEGORIES.map(c => c.value).filter(v => v !== cat.value));
                      } else {
                        toggleCat(cat.value);
                      }
                    }}>
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span style={s.catToggleCheck}>{on ? '✓' : '✕'}</span>
                  </button>
                );
              })}
            </div>
            {enabledCats.length > 0 && enabledCats.length < ALL_CATEGORIES.length && (
              <button style={s.resetCatBtn} onClick={() => setEnabledCats([])}>
                Reset to all enabled
              </button>
            )}

            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setEditStore(null)}>Cancel</button>
              <button style={s.saveBtn} onClick={save} disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: PRIMARY },
  subtitle: { margin: '4px 0 0', color: TEXT_MUTED, fontSize: 14 },
  countPill: { background: PRIMARY, color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 15, fontWeight: 700, alignSelf: 'center' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 0 },
  cardInactive: { opacity: 0.72, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' },
  inactiveBanner: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 700, borderRadius: 9, padding: '7px 11px', marginBottom: 12, textAlign: 'center' },

  cardTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 },
  cardInfo: { flex: 1, minWidth: 0 },
  storeName: { fontWeight: 700, fontSize: 15, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
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
  gasDisabledHint: { fontSize: 11, fontWeight: 600, color: '#b91c1c', marginTop: 2 },

  editBtn: { marginTop: 4, width: '100%', padding: '8px 0', borderRadius: 9, border: '1.5px solid', background: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' },

  apiKeySection: { paddingTop: 4 },
  apiKeyLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 },
  apiKeyRevealBtn: { fontSize: 14, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #dee2e6', background: '#f8f9fb', cursor: 'pointer', color: PRIMARY },
  apiKeyBox: { background: '#f8f9fb', borderRadius: 10, padding: '10px 12px', border: '1px solid #e9ecef' },
  apiKeyCode: { display: 'block', fontSize: 13, fontFamily: 'monospace', color: PRIMARY, wordBreak: 'break-all' as const, marginBottom: 8 },
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
  kwDeleteBtn: { background: 'none', border: 'none', color: '#E63946', cursor: 'pointer', fontWeight: 800, fontSize: 14, padding: '0 4px', lineHeight: 1 },
  kwAddRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  kwAddBtn: { padding: '9px 16px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap' as const },

  empty: { textAlign: 'center', padding: '60px 0', color: TEXT_MUTED, fontSize: 15 },

  // Modal
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#fff', borderRadius: 22, padding: '28px 28px 24px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  dragHandle: { width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 18px' },
  modalHeader: { marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 800, color: PRIMARY },
  modalSub: { fontSize: 15, color: TEXT_MUTED, marginTop: 3 },

  sectionLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 18 },
  fieldRow: { display: 'flex', gap: 12, marginBottom: 0 },
  field: { flex: 1, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 14, fontWeight: 600, color: '#555' },
  input: { border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '9px 12px', fontSize: 15, color: '#1a1a2e', outline: 'none', transition: 'border-color 0.15s' },

  catSectionLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 },
  catPillRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 4 },
  catPill: { fontSize: 13, fontWeight: 600, borderRadius: 20, padding: '3px 9px', border: '1px solid' },
  catPillOn: { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' },
  catPillOff: { background: '#f9f9f9', borderColor: '#e5e7eb', color: '#aaa', textDecoration: 'line-through' },


  catHint: { fontSize: 14, color: TEXT_MUTED, background: '#f8f9fb', borderRadius: 8, padding: '8px 12px', marginBottom: 10 },
  catToggleGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 },
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

  modalActions: { display: 'flex', gap: 10, marginTop: 22 },
  cancelBtn: { flex: 1, padding: '11px 0', background: '#fff', border: '1.5px solid #dee2e6', color: TEXT_MUTED, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { flex: 2, padding: '11px 0', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
