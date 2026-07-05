import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { billingApi } from '../services/api';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';

const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
type TierKey = typeof TIERS[number];

const CATEGORIES = ['GROCERIES', 'FROZEN_FOODS', 'FRESH_FOODS', 'GAS', 'DIESEL', 'HOT_FOODS', 'OTHER'] as const;
type CatKey = typeof CATEGORIES[number];

const CAT_META: Record<CatKey, { emoji: string; label: string; desc: string }> = {
  GROCERIES:    { emoji: '🛒', label: 'Groceries',     desc: 'General grocery items'     },
  FROZEN_FOODS: { emoji: '🧊', label: 'Frozen Foods',  desc: 'Frozen & refrigerated'     },
  FRESH_FOODS:  { emoji: '🥗', label: 'Fresh Foods',   desc: 'Deli, produce, fresh prep'  },
  GAS:          { emoji: '⛽', label: 'Gas',           desc: 'Gasoline purchases'         },
  DIESEL:       { emoji: '🚛', label: 'Diesel',        desc: 'Diesel fuel purchases'      },
  HOT_FOODS:    { emoji: '🌭', label: 'Hot Foods',     desc: 'Hot deli & prepared foods'  },
  OTHER:        { emoji: '🏪', label: 'Other',         desc: 'All other in-store items'   },
};

const TIER_META: Record<TierKey, { emoji: string; color: string }> = {
  BRONZE:   { emoji: '🥉', color: '#CD7F32' },
  SILVER:   { emoji: '🥈', color: '#A0A0B0' },
  GOLD:     { emoji: '🥇', color: '#F4A226' },
  DIAMOND:  { emoji: '💎', color: '#00B4D8' },
  PLATINUM: { emoji: '👑', color: '#9B5DE5' },
};

type RateRow = { tier: string; cashbackRate: number; gasCentsPerGallon: number | null; pointsThreshold: number };
type EditState = Record<string, { cashbackRate: string; gasCentsPerGallon: string; pointsThreshold: string }>;
type CatRateRow = { category: string; cashbackRate: number };
type CatEditState = Record<string, string>;

function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

function tierRateFor(tierKey: TierKey, tiers: RateRow[]): number {
  return tiers.find(t => t.tier === tierKey)?.cashbackRate ?? 0;
}

export default function Rates() {
  const qc = useQueryClient();
  const [form, setForm] = useState<EditState>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tier-rates'],
    queryFn: () => billingApi.getTierRates(),
  });

  // ── Category bonus rates ──────────────────────────────────────────────────
  const [catForm, setCatForm] = useState<CatEditState>({});
  const [catDirty, setCatDirty] = useState<Set<string>>(new Set());
  const [catSaving, setCatSaving] = useState<string | null>(null);

  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ['category-rates'],
    queryFn: () => billingApi.getCategoryRates(),
  });

  const catRates: CatRateRow[] = catData?.data?.data || [];

  useEffect(() => {
    if (catRates.length === 0) return;
    const initial: CatEditState = {};
    for (const r of catRates) {
      initial[r.category] = String((r.cashbackRate * 100).toFixed(1));
    }
    // Ensure all 8 categories are present (default 0)
    for (const cat of CATEGORIES) {
      if (!(cat in initial)) initial[cat] = '0.0';
    }
    setCatForm(initial);
    setCatDirty(new Set());
  }, [catRates.length]);

  const catUpdateMut = useMutation({
    mutationFn: ({ category, rate }: { category: string; rate: number }) =>
      billingApi.updateCategoryRate(category, rate),
    onSuccess: (_res, { category }) => {
      toast.success(`${CAT_META[category as CatKey]?.label ?? category} bonus saved`);
      setCatSaving(null);
      setCatDirty(p => { const n = new Set(p); n.delete(category); return n; });
      qc.invalidateQueries({ queryKey: ['category-rates'] });
    },
    onError: () => { toast.error('Failed to save'); setCatSaving(null); },
  });

  function handleCatChange(cat: string, value: string) {
    setCatForm(p => ({ ...p, [cat]: value }));
    setCatDirty(p => new Set(p).add(cat));
  }

  function handleCatSave(cat: string) {
    const val = parseFloat(catForm[cat] ?? '0');
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error('Bonus must be 0 – 100%');
      return;
    }
    setCatSaving(cat);
    catUpdateMut.mutate({ category: cat, rate: val / 100 });
  }

  function handleCatReset(cat: string) {
    const original = catRates.find(r => r.category === cat);
    setCatForm(p => ({ ...p, [cat]: String(((original?.cashbackRate ?? 0) * 100).toFixed(1)) }));
    setCatDirty(p => { const n = new Set(p); n.delete(cat); return n; });
  }

  const tiers: RateRow[] = data?.data?.data || [];

  // ── Gas & Diesel mode ─────────────────────────────────────────────────────
  const [showPerGallon, setShowPerGallon] = useState(false);

  // Populate form once data loads
  useEffect(() => {
    if (tiers.length === 0) return;
    const initial: EditState = {};
    for (const r of tiers) {
      initial[r.tier] = {
        cashbackRate: String((r.cashbackRate * 100).toFixed(1)),
        gasCentsPerGallon: r.gasCentsPerGallon != null ? String(r.gasCentsPerGallon) : '',
        pointsThreshold: String(r.pointsThreshold ?? 0),
      };
    }
    setForm(initial);
    setDirty(new Set());
    setShowPerGallon(tiers.some(t => t.gasCentsPerGallon != null));
  }, [tiers.length]);

  function switchToPercent() {
    // Clear gasCentsPerGallon for every tier and save
    TIERS.forEach(tierKey => {
      const row = form[tierKey];
      if (!row) return;
      const rate = parseFloat(row.cashbackRate) / 100;
      if (!isNaN(rate)) updateMut.mutate({ tier: tierKey, payload: { cashbackRate: rate, gasCentsPerGallon: null } });
    });
    setShowPerGallon(false);
  }

  const updateMut = useMutation({
    mutationFn: ({ tier, payload }: { tier: string; payload: object }) =>
      billingApi.updateTierRate(tier, payload),
    onSuccess: (_res, { tier }) => {
      toast.success(`${tier[0] + tier.slice(1).toLowerCase()} rate saved`);
      setSaving(null);
      setDirty(p => { const n = new Set(p); n.delete(tier); return n; });
      qc.invalidateQueries({ queryKey: ['tier-rates'] });
    },
    onError: () => { toast.error('Failed to save'); setSaving(null); },
  });

  function handleChange(tier: string, field: 'cashbackRate' | 'gasCentsPerGallon' | 'pointsThreshold', value: string) {
    setForm(p => ({ ...p, [tier]: { ...p[tier], [field]: value } }));
    setDirty(p => new Set(p).add(tier));
  }

  function handleSave(tier: string) {
    const row = form[tier];
    if (!row) return;
    const rate = parseFloat(row.cashbackRate) / 100;
    const cpg = row.gasCentsPerGallon.trim() === '' ? null : parseFloat(row.gasCentsPerGallon);
    const threshold = parseInt(row.pointsThreshold ?? '0', 10);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast.error('Cashback must be 0 – 100%');
      return;
    }
    if (cpg !== null && isNaN(cpg)) {
      toast.error('Enter a valid ¢/gallon or leave blank');
      return;
    }
    if (tier !== 'BRONZE' && (isNaN(threshold) || threshold < 0)) {
      toast.error('Threshold must be a positive number of points');
      return;
    }
    setSaving(tier);
    updateMut.mutate({ tier, payload: { cashbackRate: rate, gasCentsPerGallon: cpg, ...(tier !== 'BRONZE' && { pointsThreshold: threshold }) } });
  }

  function handleSaveAll() {
    const pending = [...dirty];
    if (pending.length === 0) { toast('No changes to save'); return; }
    for (const tier of pending) handleSave(tier);
  }

  function handleReset(tier: string) {
    const original = tiers.find(r => r.tier === tier);
    if (!original) return;
    setForm(p => ({
      ...p,
      [tier]: {
        cashbackRate: String((original.cashbackRate * 100).toFixed(1)),
        gasCentsPerGallon: original.gasCentsPerGallon != null ? String(original.gasCentsPerGallon) : '',
        pointsThreshold: String(original.pointsThreshold ?? 0),
      },
    }));
    setDirty(p => { const n = new Set(p); n.delete(tier); return n; });
  }

  const highestTier = tiers.length > 0
    ? tiers.reduce((max, t) => (t.cashbackRate > max.cashbackRate ? t : max), tiers[0])
    : null;

  const tiersWithGasCpg = tiers.filter(t => t.gasCentsPerGallon != null);
  const highestGasTier = tiersWithGasCpg.length > 0
    ? tiersWithGasCpg.reduce((max, t) => (t.gasCentsPerGallon! > max.gasCentsPerGallon! ? t : max), tiersWithGasCpg[0])
    : null;

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>🏆 Cashback Rates</h1>
          <p style={s.subtitle}>
            Set the base cashback % each customer tier earns. Promotions stack on top of these.
          </p>
        </div>
        {dirty.size > 0 && (
          <button style={s.saveAllBtn} onClick={handleSaveAll}>
            💾 Save {dirty.size} change{dirty.size > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div style={s.storeCostNote}>
        💡 Store cost = cashback paid out × (1 + that store's dev cut rate). Dev cut rate is set per-store on the Stores page, not here.
      </div>

      {isLoading && <div style={s.loading}>Loading rates…</div>}
      {isError  && <ErrorState message="Could not load rates. Check your connection." onRetry={refetch} />}

      {!isLoading && !isError && tiers.length === 0 && (
        <div style={s.error}>No tier data returned. The backend may need to be restarted.</div>
      )}

      {tiers.length > 0 && (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow style={s.thead}>
                <TableHead style={{ ...s.th, width: 160 }}>Tier</TableHead>
                <TableHead style={s.th}>
                  Cashback %
                  <div style={s.thSub}>earned on every purchase</div>
                </TableHead>
                <TableHead style={s.th}>
                  Gas ¢ / gallon
                  <div style={s.thSub}>optional — overrides % for gas & diesel</div>
                </TableHead>
                <TableHead style={s.th}>
                  Min $ earned to reach tier
                  <div style={s.thSub}>period earnings threshold (cashback dollars)</div>
                </TableHead>
                <TableHead style={{ ...s.th, width: 80 }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TIERS.map((tierKey) => {
                const r = tiers.find(x => x.tier === tierKey);
                if (!r) return null;
                const row = form[tierKey];
                const meta = TIER_META[tierKey];
                const isDirty = dirty.has(tierKey);
                const isSaving = saving === tierKey;

                return (
                  <TableRow key={tierKey} style={{ ...s.tr, ...(isDirty ? s.trDirty : {}) }}>
                    {/* Tier label */}
                    <TableCell style={s.td}>
                      <div style={s.tierCell}>
                        <span style={{ ...s.dot, background: meta.color }} />
                        <div>
                          <div style={s.tierName}>{meta.emoji} {tierKey[0] + tierKey.slice(1).toLowerCase()}</div>
                          <div style={s.tierSub}>
                            {tierKey === 'BRONZE' ? 'New customers' : `$${r.pointsThreshold?.toLocaleString() ?? '—'}+ earned`}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Cashback % */}
                    <TableCell style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number"
                          min="0" max="100" step="0.5"
                          value={row?.cashbackRate ?? ''}
                          onChange={e => handleChange(tierKey, 'cashbackRate', e.target.value)}
                          style={{ ...s.input, ...( isDirty ? s.inputDirty : {} ) }}
                          placeholder="e.g. 3"
                        />
                        <span style={s.suffix}>%</span>
                        {row?.cashbackRate && !isNaN(parseFloat(row.cashbackRate)) && (
                          <span style={s.preview}>{fmtPct(parseFloat(row.cashbackRate) / 100)} back per $1</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Gas ¢/gallon */}
                    <TableCell style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number"
                          min="0" step="0.5"
                          value={row?.gasCentsPerGallon ?? ''}
                          onChange={e => handleChange(tierKey, 'gasCentsPerGallon', e.target.value)}
                          style={{ ...s.input, ...( isDirty ? s.inputDirty : {} ) }}
                          placeholder="leave blank to use %"
                        />
                        {row?.gasCentsPerGallon ? <span style={s.suffix}>¢</span> : null}
                      </div>
                      {r.gasCentsPerGallon != null && !isDirty && (
                        <div style={s.gasActive}>Active: {r.gasCentsPerGallon}¢/gal for GAS & DIESEL</div>
                      )}
                    </TableCell>

                    {/* Tier threshold */}
                    <TableCell style={s.td}>
                      {tierKey === 'BRONZE' ? (
                        <span style={{ fontSize: 14, color: '#adb5bd' }}>Starting tier</span>
                      ) : (
                        <div style={s.inputGroup}>
                          <span style={s.suffix}>$</span>
                          <input
                            type="number"
                            min="0" step="10"
                            value={row?.pointsThreshold ?? ''}
                            onChange={e => handleChange(tierKey, 'pointsThreshold', e.target.value)}
                            style={{ ...s.input, width: 100, ...(isDirty ? s.inputDirty : {}) }}
                            placeholder="e.g. 50"
                          />
                          {row?.pointsThreshold && !isNaN(parseInt(row.pointsThreshold)) && (
                            <span style={s.preview}>= {(parseInt(row.pointsThreshold) * 100).toLocaleString()} pts in-app</span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell style={{ ...s.td, textAlign: 'right' }}>
                      {isDirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} disabled={isSaving} onClick={() => handleSave(tierKey)}>
                            {isSaving ? '…' : 'Save'}
                          </button>
                          <button style={s.undoBtn} onClick={() => handleReset(tierKey)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}>✓ Saved</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Category Bonus Rates ─────────────────────────────────────────── */}
      <div style={s.sectionHeader}>
        <div>
          <h2 style={s.sectionTitle}>📦 Category Bonus Rates</h2>
          <p style={s.sectionSubtitle}>
            This bonus adds to the tier base rate on every purchase in this category — it's not a
            promotion, it's a permanent part of the rate. The columns to the right show the
            resulting total cashback % for each tier.
          </p>
        </div>
        {catDirty.size > 0 && (
          <button
            style={s.saveAllBtn}
            onClick={() => [...catDirty].forEach(cat => handleCatSave(cat))}
          >
            💾 Save {catDirty.size} change{catDirty.size > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {catLoading && <div style={s.loading}>Loading category rates…</div>}

      {!catLoading && (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow style={s.thead}>
                <TableHead style={{ ...s.th, width: 180 }}>Category</TableHead>
                <TableHead style={s.th}>
                  Bonus %
                  <div style={s.thSub}>added on top of tier base rate</div>
                </TableHead>
                {TIERS.map(tierKey => (
                  <TableHead key={tierKey} style={{ ...s.th, textAlign: 'center' as const }}>
                    {TIER_META[tierKey].emoji} {tierKey[0] + tierKey.slice(1).toLowerCase()}
                    <div style={s.thSub}>total cashback %</div>
                  </TableHead>
                ))}
                <TableHead style={{ ...s.th, width: 80 }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CATEGORIES.map((cat) => {
                const meta = CAT_META[cat];
                const isGasDiesel = cat === 'GAS' || cat === 'DIESEL';
                const isDirty = catDirty.has(cat);
                const isSaving = catSaving === cat;
                const rawVal = catForm[cat] ?? '0';
                const numVal = parseFloat(rawVal);
                const bonusFraction = !isNaN(numVal) ? numVal / 100 : 0;

                // GAS/DIESEL in ¢/gallon mode — show redirect badge, no editable %
                if (isGasDiesel && showPerGallon) {
                  return (
                    <TableRow key={cat} style={s.tr}>
                      <TableCell style={s.td}>
                        <div style={s.tierCell}>
                          <span style={s.catEmoji}>{meta.emoji}</span>
                          <div>
                            <div style={s.tierName}>{meta.label}</div>
                            <div style={s.tierSub}>{meta.desc}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell style={s.td} colSpan={7}>
                        <span style={s.perGallonBadge}>⛽ ¢/gallon mode — configure per-tier rates below</span>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={cat} style={{ ...s.tr, ...(isDirty ? s.trDirty : {}) }}>
                    <TableCell style={s.td}>
                      <div style={s.tierCell}>
                        <span style={s.catEmoji}>{meta.emoji}</span>
                        <div>
                          <div style={s.tierName}>{meta.label}</div>
                          <div style={s.tierSub}>{meta.desc}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number"
                          min="0" max="20" step="0.5"
                          value={rawVal}
                          onChange={e => handleCatChange(cat, e.target.value)}
                          style={{ ...s.input, ...(isDirty ? s.inputDirty : {}) }}
                          placeholder="0"
                        />
                        <span style={s.suffix}>%</span>
                        {!isNaN(numVal) && numVal > 0 && (
                          <span style={s.preview}>+{numVal.toFixed(1)}% bonus</span>
                        )}
                        {!isNaN(numVal) && numVal === 0 && (
                          <span style={{ ...s.preview, color: '#adb5bd' }}>no bonus</span>
                        )}
                      </div>
                    </TableCell>
                    {TIERS.map(tierKey => (
                      <TableCell key={tierKey} style={{ ...s.td, textAlign: 'center' as const }}>
                        <span style={s.effectiveTag}>{fmtPct(tierRateFor(tierKey, tiers) + bonusFraction)}</span>
                      </TableCell>
                    ))}
                    <TableCell style={{ ...s.td, textAlign: 'right' }}>
                      {isDirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} disabled={isSaving} onClick={() => handleCatSave(cat)}>
                            {isSaving ? '…' : 'Save'}
                          </button>
                          <button style={s.undoBtn} onClick={() => handleCatReset(cat)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}>✓</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Gas & Diesel Mode ────────────────────────────────────────────── */}
      <div style={s.sectionHeader}>
        <div>
          <h2 style={s.sectionTitle}>⛽ Gas & Diesel Mode</h2>
          <p style={s.sectionSubtitle}>
            Choose how cashback is calculated for gas and diesel. In ¢/gallon mode each tier earns a flat
            rate per gallon pumped — active promotions still stack on top as a % of the purchase amount.
          </p>
        </div>
      </div>

      <div style={s.gasModeCard}>
        {/* Mode toggle */}
        <div style={s.gasModeToggleRow}>
          <button
            style={{ ...s.modeBtn, ...(showPerGallon ? {} : s.modeBtnActive) }}
            onClick={switchToPercent}
          >
            💲 % of amount
          </button>
          <button
            style={{ ...s.modeBtn, ...(showPerGallon ? s.modeBtnActive : {}) }}
            onClick={() => setShowPerGallon(true)}
          >
            ⛽ ¢ / gallon
          </button>

          {/* Live status — based on DB state, not local toggle */}
          {tiers.some(t => t.gasCentsPerGallon != null) ? (
            <span style={s.liveBadge}>● LIVE: ¢/gallon</span>
          ) : (
            <span style={s.liveInactiveBadge}>● LIVE: % of amount</span>
          )}

          <span style={s.gasModeHint}>
            {showPerGallon
              ? 'Base = ¢/gallon × gallons pumped · promos still add on top as % of purchase'
              : 'Base = tier % × purchase amount · set bonus % for Gas/Diesel in the table above'}
          </span>
        </div>

        {/* Unsaved reminder when ¢/gallon is selected but nothing is saved yet */}
        {showPerGallon && !tiers.some(t => t.gasCentsPerGallon != null) && (
          <div style={s.gasModeWarning}>
            ⚠️ ¢/gallon mode is not active yet — enter a rate for each tier below and click <strong>Save</strong> to switch.
          </div>
        )}

        {/* Per-tier ¢/gallon table */}
        {showPerGallon && tiers.length > 0 && (
          <Table style={{ ...s.table, marginTop: 16 }}>
            <TableHeader>
              <TableRow style={s.thead}>
                <TableHead style={{ ...s.th, width: 200 }}>Tier</TableHead>
                <TableHead style={s.th}>
                  ¢ / gallon
                  <div style={s.thSub}>applies to GAS & DIESEL</div>
                </TableHead>
                <TableHead style={s.th}>
                  Example (1 gal)
                  <div style={s.thSub}>cashback earned</div>
                </TableHead>
                <TableHead style={{ ...s.th, width: 100 }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TIERS.map((tierKey) => {
                const r = tiers.find(x => x.tier === tierKey);
                if (!r) return null;
                const row = form[tierKey];
                const meta = TIER_META[tierKey];
                const isDirty = dirty.has(tierKey);
                const isSaving = saving === tierKey;
                const cpgVal = row?.gasCentsPerGallon ?? '';
                const cpgNum = parseFloat(cpgVal);

                return (
                  <TableRow key={tierKey} style={{ ...s.tr, ...(isDirty ? s.trDirty : {}) }}>
                    <TableCell style={s.td}>
                      <div style={s.tierCell}>
                        <span style={{ ...s.dot, background: meta.color }} />
                        <div>
                          <div style={s.tierName}>{meta.emoji} {tierKey[0] + tierKey.slice(1).toLowerCase()}</div>
                          <div style={s.tierSub}>
                            {tierKey === 'BRONZE' ? 'New customers' : `$${r.pointsThreshold?.toLocaleString() ?? '—'}+ earned`}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number" min="0" step="0.5"
                          value={cpgVal}
                          onChange={e => handleChange(tierKey, 'gasCentsPerGallon', e.target.value)}
                          style={{ ...s.input, ...(isDirty ? s.inputDirty : {}) }}
                          placeholder="e.g. 3"
                        />
                        {cpgVal !== '' && <span style={s.suffix}>¢</span>}
                      </div>
                    </TableCell>
                    <TableCell style={s.td}>
                      {!isNaN(cpgNum) && cpgNum > 0 ? (
                        <span style={s.effectiveTag}>${(1 * cpgNum / 100).toFixed(2)} cashback</span>
                      ) : (
                        <span style={{ fontSize: 14, color: '#adb5bd' }}>enter rate above</span>
                      )}
                    </TableCell>
                    <TableCell style={{ ...s.td, textAlign: 'right' }}>
                      {isDirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} disabled={isSaving} onClick={() => handleSave(tierKey)}>
                            {isSaving ? '…' : 'Save'}
                          </button>
                          <button style={s.undoBtn} onClick={() => handleReset(tierKey)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}>✓</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* How it works */}
      <div style={s.infoGrid}>
        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>📐 How rates apply</div>
          <p style={s.infoCardText}>
            When an employee grants points, the customer's tier rate is used automatically,
            plus any category bonus for that purchase (see the table above).
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}>
              <span>{highestTier ? `${TIER_META[highestTier.tier as TierKey].emoji} ${highestTier.tier[0] + highestTier.tier.slice(1).toLowerCase()} tier base rate` : 'Tier base rate'}</span>
              <span style={{ color: '#F4A226', fontWeight: 700 }}>{highestTier ? fmtPct(highestTier.cashbackRate) : '—'}</span>
            </div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns on $50</span>
              <span style={{ fontWeight: 800 }}>{highestTier ? `= $${(50 * highestTier.cashbackRate).toFixed(2)}` : '—'}</span>
            </div>
          </div>
        </div>

        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>⛽ Gas ¢/gallon (optional)</div>
          <p style={s.infoCardText}>
            For GAS and DIESEL only, you can set a flat cents-per-gallon rate instead of a percentage.
            Leave blank to use the cashback % for gas too.
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}><span>Gallons pumped</span><span style={{ fontWeight: 700 }}>1 gal</span></div>
            <div style={s.calcRow}>
              <span>{highestGasTier ? `${TIER_META[highestGasTier.tier as TierKey].emoji} ${highestGasTier.tier[0] + highestGasTier.tier.slice(1).toLowerCase()} flat rate` : 'Flat rate'}</span>
              <span style={{ color: '#F4A261', fontWeight: 700 }}>{highestGasTier ? `${highestGasTier.gasCentsPerGallon}¢/gal` : '—'}</span>
            </div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns</span>
              <span style={{ fontWeight: 800 }}>{highestGasTier ? `= $${(1 * highestGasTier.gasCentsPerGallon! / 100).toFixed(2)}` : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },

  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16 },
  title: { margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: 0, color: '#6c757d', fontSize: 14 },

  saveAllBtn: {
    padding: '10px 20px', background: '#1D3557', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 14, fontWeight: 700, flexShrink: 0,
    boxShadow: '0 2px 8px rgba(29,53,87,0.25)',
  },

  loading: { textAlign: 'center' as const, color: '#6c757d', padding: 60, fontSize: 15 },
  error: { textAlign: 'center' as const, color: '#E63946', padding: 40, background: '#fff5f5', borderRadius: 10 },

  storeCostNote: {
    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
    padding: '10px 16px', fontSize: 14, color: '#1d4ed8', marginBottom: 24,
  },

  tableWrap: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    overflow: 'hidden', marginBottom: 28,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8f9fa' },
  th: {
    padding: '12px 16px', textAlign: 'left' as const,
    fontSize: 14, fontWeight: 700, color: '#6c757d',
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    borderBottom: '2px solid #e9ecef',
  },
  thSub: { fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, color: '#adb5bd', fontSize: 12, marginTop: 2 },
  tr: { borderBottom: '1px solid #f1f3f5', transition: 'background 0.15s' },
  trDirty: { background: '#fffbf0' },
  td: { padding: '14px 16px', verticalAlign: 'middle' as const },

  tierCell: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  tierName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  tierSub: { fontSize: 13, color: '#adb5bd', marginTop: 1 },

  inputGroup: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  input: {
    width: 90, padding: '7px 10px',
    border: '1.5px solid #dee2e6', borderRadius: 7,
    fontSize: 15, fontWeight: 600, color: '#1D3557',
    outline: 'none', transition: 'border 0.15s',
  },
  inputDirty: { borderColor: '#F4A226' },
  suffix: { fontSize: 15, color: '#6c757d', fontWeight: 600 },
  preview: { fontSize: 13, color: '#2DC653', fontStyle: 'italic' },
  gasActive: { fontSize: 13, color: '#F4A261', marginTop: 4 },

  saveBtn: {
    padding: '6px 14px', background: '#2DC653', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 700,
  },
  undoBtn: {
    padding: '6px 10px', background: '#f8f9fa',
    border: '1px solid #dee2e6', borderRadius: 6,
    cursor: 'pointer', fontSize: 15, color: '#6c757d',
  },
  savedTag: { fontSize: 14, color: '#2DC653', fontWeight: 600 },

  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    margin: '36px 0 16px', gap: 16,
  },
  sectionTitle: { margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#1D3557' },
  sectionSubtitle: { margin: 0, color: '#6c757d', fontSize: 15 },
  catEmoji: { fontSize: 22, lineHeight: 1, flexShrink: 0 },
  perGallonBadge: {
    display: 'inline-block', padding: '4px 12px',
    background: '#fff3e0', color: '#e65100',
    borderRadius: 20, fontSize: 14, fontWeight: 600,
    border: '1px solid #ffcc80',
  },
  gasModeCard: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    padding: '20px 24px', marginBottom: 28,
  },
  gasModeToggleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  modeBtn: {
    padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
    border: '1.5px solid #dee2e6', background: '#f8f9fa',
    fontSize: 15, fontWeight: 600, color: '#6c757d', transition: 'all 0.15s',
  },
  modeBtnActive: {
    background: '#1D3557', color: '#fff', borderColor: '#1D3557',
  },
  gasModeHint: { fontSize: 14, color: '#6c757d', fontStyle: 'italic', marginLeft: 4 },
  liveBadge: {
    display: 'inline-block', padding: '3px 10px',
    background: '#e8f8ed', color: '#1a7a3a',
    borderRadius: 20, fontSize: 14, fontWeight: 700,
    border: '1px solid #a3d9b1',
  },
  liveInactiveBadge: {
    display: 'inline-block', padding: '3px 10px',
    background: '#e8f0fb', color: '#1D3557',
    borderRadius: 20, fontSize: 14, fontWeight: 700,
    border: '1px solid #b3c8e8',
  },
  gasModeWarning: {
    marginTop: 12, padding: '10px 14px',
    background: '#fff8e1', color: '#7a5c00',
    borderRadius: 8, fontSize: 15,
    border: '1px solid #ffe082',
  },
  effectiveTag: {
    display: 'inline-block', padding: '3px 10px',
    background: '#e8f8ed', color: '#1a7a3a',
    borderRadius: 20, fontSize: 14, fontWeight: 700,
  },

  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  infoCard: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    padding: '18px 20px',
  },
  infoCardTitle: { fontWeight: 700, fontSize: 14, color: '#1D3557', marginBottom: 8 },
  infoCardText: { fontSize: 15, color: '#6c757d', lineHeight: 1.55, margin: '0 0 12px' },
  calcBox: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  calcRow: { display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#495057' },
};
