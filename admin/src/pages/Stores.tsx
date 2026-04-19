import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const ALL_CATEGORIES = [
  { value: 'GAS',           label: 'Gas',          icon: '⛽' },
  { value: 'DIESEL',        label: 'Diesel',        icon: '🚛' },
  { value: 'HOT_FOODS',     label: 'Hot Foods',     icon: '🌮' },
  { value: 'GROCERIES',     label: 'Groceries',     icon: '🛒' },
  { value: 'FROZEN_FOODS',  label: 'Frozen Foods',  icon: '🧊' },
  { value: 'FRESH_FOODS',   label: 'Fresh Foods',   icon: '🥗' },
  { value: 'TOBACCO_VAPES', label: 'Tobacco/Vapes', icon: '🚬' },
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
}

const AVATAR_PALETTE = [
  '#E63946', '#457B9D', '#2DC653', '#F4A261', '#7B2FBE',
  '#0077B6', '#E76F51', '#2A9D8F', '#E9C46A', '#264653',
  '#6A0572', '#1D3557',
];

function storeAvatar(idx: number) { return AVATAR_PALETTE[idx % AVATAR_PALETTE.length]; }

export default function Stores() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', address: '', city: '', state: '', zipCode: '', phone: '', latitude: '', longitude: '' });
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

  const { data, isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });

  const stores: Store[] = data?.data?.data ?? [];

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

  const gasMutation = useMutation({
    mutationFn: ({ storeId, payload }: { storeId: string; payload: object }) =>
      storesApi.updateGasPrices(storeId, payload),
    onSuccess: (_, { storeId }) => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      // Clear the inline form for this store
      setGasForms((prev) => { const n = { ...prev }; delete n[storeId]; return n; });
      toast.success('⛽ Gas prices updated — staff notified');
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
    if (!confirm('Regenerate API key? The old key will stop working immediately — update config.json on that store\'s PC.')) return;
    try {
      const res = await storesApi.regenerateApiKey(storeId);
      const key = res.data.data.apiKey;
      setApiKeys((p) => ({ ...p, [storeId]: key }));
      setApiKeyVisible((p) => ({ ...p, [storeId]: true }));
      toast.success('API key regenerated — update config.json on the store PC');
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
    });
    setEnabledCats(store.enabledCategories ?? []);
  }

  function toggleCat(cat: string) {
    setEnabledCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  async function geocodeAddress() {
    const query = [form.address, form.city, form.state, form.zipCode].filter(Boolean).join(', ');
    if (!query.trim()) { toast.error('Enter an address first'); return; }
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results = await res.json();
      if (!results.length) { toast.error('Address not found — try a more specific address'); return; }
      const { lat, lon } = results[0];
      setForm((f) => ({ ...f, latitude: parseFloat(lat).toFixed(6), longitude: parseFloat(lon).toFixed(6) }));
      toast.success('Coordinates filled in — verify they look correct!');
    } catch {
      toast.error('Geocoding failed — check your connection');
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
    };
    mutation.mutate({ storeId: editStore.id, payload });
  }

  const setF = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Stores</h1>
          <p style={s.subtitle}>Manage store details and location coordinates</p>
        </div>
        <div style={s.countPill}>{stores.length} stores</div>
      </div>

      {isLoading ? (
        <div style={s.empty}>Loading stores…</div>
      ) : (
        <div style={s.grid}>
          {stores.map((store, idx) => {
            const color = storeAvatar(idx);
            const hasCoords = store.latitude != null && store.longitude != null;
            return (
              <div key={store.id} style={s.card}>
                {/* Card header */}
                <div style={s.cardTop}>
                  <div style={{ ...s.avatar, background: color }}>
                    {store.name[0].toUpperCase()}
                  </div>
                  <div style={s.cardInfo}>
                    <div style={s.storeName}>{store.name}</div>
                    <div style={s.storeSub}>{store.city}, {store.state}</div>
                  </div>
                  <div style={{ ...s.coordBadge, background: hasCoords ? '#f0fdf4' : '#fff1f2', border: hasCoords ? '1px solid #bbf7d0' : '1px solid #fecaca', color: hasCoords ? '#15803d' : '#b91c1c' }}>
                    {hasCoords ? '📍 Located' : '❌ No coords'}
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
                            <button style={{ ...s.apiKeyBtn, color: '#E63946', borderColor: '#fca5a5' }} onClick={() => regenApiKey(store.id)}>🔄 Regenerate</button>
                            <button style={{ ...s.apiKeyBtn, color: '#6c757d' }} onClick={() => setApiKeyVisible((p) => ({ ...p, [store.id]: false }))}>Hide</button>
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

                <div style={s.divider} />
                <div style={s.cardBtns}>
                  <button style={s.kwBtn} onClick={() => openKwModal(store.id)}>
                    🗂️ POS Mappings
                  </button>
                  <button style={{ ...s.editBtn, flex: 2, borderColor: color, color }} onClick={() => openEdit(store)}>
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
                {stores.find((st) => st.id === kwStoreId)?.name} — Map POS receipt labels to Lucky Stop categories
              </div>
            </div>
            <div style={s.kwHint}>
              When the printer-agent parses a receipt, it checks these keywords first (case-insensitive, partial match).
              If a line contains the keyword, it's classified into the chosen category — overriding the built-in patterns.
              <br /><br />
              <strong>Example:</strong> your POS prints "FUEL GRD 1" → add keyword <code>fuel grd</code> → GAS
            </div>

            {/* Existing mappings */}
            {kwLoading ? (
              <div style={{ padding: '20px 0', color: '#6c757d', textAlign: 'center' }}>Loading…</div>
            ) : kwMappings.length === 0 ? (
              <div style={s.kwEmpty}>No custom mappings yet — built-in keyword patterns will be used.</div>
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
              Fill in the address above, then click <strong>Auto-fill</strong> to get coordinates automatically — or enter them manually.
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
  page: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: '4px 0 0', color: '#6c757d', fontSize: 14 },
  countPill: { background: '#1D3557', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700, alignSelf: 'center' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 0 },

  cardTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 },
  cardInfo: { flex: 1, minWidth: 0 },
  storeName: { fontWeight: 700, fontSize: 15, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  storeSub: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  coordBadge: { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, flexShrink: 0 },

  divider: { height: 1, background: '#f0f2f5', margin: '10px 0' },
  detailRow: { display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 },
  detailLabel: { fontSize: 11, color: '#adb5bd', fontWeight: 600, width: 78, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.3 },
  detailVal: { fontSize: 13, color: '#444' },
  coordText: { fontFamily: 'monospace', fontSize: 12, color: '#1D3557', background: '#eef2ff', padding: '2px 7px', borderRadius: 5 },

  gasSectionLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  gasUpdatedAt: { fontSize: 10, fontWeight: 500, color: '#adb5bd', textTransform: 'none' as const, letterSpacing: 0 },
  gasRow: { display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 4 },
  gasField: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 4 },
  gasLabel: { fontSize: 11, fontWeight: 600, color: '#555' },
  gasInput: { border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 14, fontWeight: 700, color: '#1a1a2e', outline: 'none', width: '100%' },
  gasUpdateBtn: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#e2e8f0', color: '#adb5bd', fontWeight: 700, fontSize: 13, cursor: 'not-allowed', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 1 },
  gasUpdateBtnActive: { background: '#e8532a', color: '#fff', cursor: 'pointer' },

  editBtn: { marginTop: 4, width: '100%', padding: '8px 0', borderRadius: 9, border: '1.5px solid', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' },

  apiKeySection: { paddingTop: 4 },
  apiKeyLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 },
  apiKeyRevealBtn: { fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #dee2e6', background: '#f8f9fb', cursor: 'pointer', color: '#1D3557' },
  apiKeyBox: { background: '#f8f9fb', borderRadius: 10, padding: '10px 12px', border: '1px solid #e9ecef' },
  apiKeyCode: { display: 'block', fontSize: 11, fontFamily: 'monospace', color: '#1D3557', wordBreak: 'break-all' as const, marginBottom: 8 },
  apiKeyBtns: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  apiKeyBtn: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1.5px solid #dee2e6', background: '#fff', cursor: 'pointer', color: '#1D3557' },

  cardBtns: { display: 'flex', gap: 8, marginTop: 4 },
  kwBtn: { flex: 1, padding: '8px 0', borderRadius: 9, border: '1.5px solid #dee2e6', background: '#f8f9fb', fontWeight: 700, fontSize: 12, cursor: 'pointer', color: '#1D3557' },

  kwHint: { fontSize: 12, color: '#6c757d', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 13px', marginBottom: 14, lineHeight: 1.6 },
  kwEmpty: { fontSize: 13, color: '#adb5bd', padding: '10px 0', marginBottom: 8, textAlign: 'center' as const },
  kwList: { display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 14 },
  kwRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#f8f9fb', borderRadius: 9, padding: '8px 11px', border: '1px solid #e9ecef' },
  kwKeyword: { fontFamily: 'monospace', fontSize: 13, color: '#1D3557', fontWeight: 700, flex: 1 },
  kwArrow: { color: '#adb5bd', fontSize: 14 },
  kwCat: { fontSize: 12, fontWeight: 700, color: '#15803d', background: '#f0fdf4', borderRadius: 20, padding: '2px 9px', border: '1px solid #bbf7d0' },
  kwDeleteBtn: { background: 'none', border: 'none', color: '#E63946', cursor: 'pointer', fontWeight: 800, fontSize: 14, padding: '0 4px', lineHeight: 1 },
  kwAddRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  kwAddBtn: { padding: '9px 16px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const },

  empty: { textAlign: 'center', padding: '60px 0', color: '#6c757d', fontSize: 15 },

  // Modal
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#fff', borderRadius: 22, padding: '28px 28px 24px', width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  dragHandle: { width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 18px' },
  modalHeader: { marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 800, color: '#1D3557' },
  modalSub: { fontSize: 13, color: '#6c757d', marginTop: 3 },

  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 18 },
  fieldRow: { display: 'flex', gap: 12, marginBottom: 0 },
  field: { flex: 1, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, fontWeight: 600, color: '#555' },
  input: { border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '9px 12px', fontSize: 13, color: '#1a1a2e', outline: 'none', transition: 'border-color 0.15s' },

  catSectionLabel: { fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 },
  catPillRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 4 },
  catPill: { fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 9px', border: '1px solid' },
  catPillOn: { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' },
  catPillOff: { background: '#f9f9f9', borderColor: '#e5e7eb', color: '#aaa', textDecoration: 'line-through' },

  catHint: { fontSize: 12, color: '#6c757d', background: '#f8f9fb', borderRadius: 8, padding: '8px 12px', marginBottom: 10 },
  catToggleGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 },
  catToggleBtn: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, padding: '10px 6px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  catToggleBtnOn: { background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' },
  catToggleBtnOff: { background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c' },
  catToggleCheck: { fontSize: 11, fontWeight: 800 },
  resetCatBtn: { fontSize: 12, color: '#1D3557', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginBottom: 8, padding: 0 },

  geocodeHint: { fontSize: 12, color: '#6c757d', background: '#f8f9fb', borderRadius: 8, padding: '9px 12px', marginBottom: 10, lineHeight: 1.5 },
  geocodeBtn: { width: '100%', padding: '10px 0', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 14 },

  modalActions: { display: 'flex', gap: 10, marginTop: 22 },
  cancelBtn: { flex: 1, padding: '11px 0', background: '#fff', border: '1.5px solid #dee2e6', color: '#6c757d', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { flex: 2, padding: '11px 0', background: '#0f5132', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
