import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { billingApi } from '../services/api';
import ErrorState from '../components/ErrorState';
import ConfirmModal from '../components/ConfirmModal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { serverMessage } from '../lib/apiError';
import { storeDayTime } from '../lib/storeDates';
import {
  TIERS, CATEGORY_NAMES, GAS_CATEGORIES, CASHBACK_WARN, CASHBACK_CAP, MAX_TIER_RATE, MAX_CATEGORY_BONUS, MAX_GAS_CENTS,
  MIN_THRESHOLD_POINTS, EXAMPLE_SALE, exampleGallons, pct, pctOne, money, tierName,
  stateFromRows, applyChanges, refusalFor, changeLines, effectLines, holdWarnings, touchesAppText, gasFill, salePays,
  type TierKey, type TierRow, type CategoryRow, type TierChange, type CategoryChange, type RateState,
} from '../lib/rateRules';

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

// Text colours that pass 4.5 to 1 on white (the old bright green and orange were about 2 to 1)
const GREEN_TEXT = '#1a7a3a';
const AMBER_TEXT = '#8a4b00';
const RED_TEXT = '#b42318';

const APP_TEXT_NOTE = 'The customer app shows fixed numbers (1 to 5% cashback, 5,000 to 45,000 points to reach a tier) and does not follow this page. Tell customers about this change.';

type Field = 'cashbackRate' | 'gasCentsPerGallon' | 'pointsThreshold';
type TierDraft = Partial<Record<Field, string>>;

interface Plan {
  title: string;
  lines: string[];
  effects: string[];
  warnings: string[];
  notes: string[];
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void>;
}

interface LastChange { at: string; by: string; summary: string }

/** 0.02 -> "2", 0.0125 -> "1.25" */
const pctInput = (rate: number) => String(parseFloat((rate * 100).toFixed(3)));

function serverText(row: TierRow, field: Field): string {
  if (field === 'cashbackRate') return pctInput(row.cashbackRate);
  if (field === 'gasCentsPerGallon') return row.gasCentsPerGallon == null ? '' : String(row.gasCentsPerGallon);
  return String(row.pointsThreshold ?? 0);
}

/** Two texts mean the same number ("2" and "2.0"); an empty gas box only equals another empty one. */
function sameText(field: Field, a: string, b: string): boolean {
  if (field === 'gasCentsPerGallon' && (a.trim() === '' || b.trim() === '')) return a.trim() === b.trim();
  return parseFloat(a) === parseFloat(b);
}

export default function Rates() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, TierDraft>>({});
  const [catDraft, setCatDraft] = useState<Record<string, string>>({});
  const [showPerGallon, setShowPerGallon] = useState<boolean | null>(null); // null until the rates arrive, then follows what is live
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['tier-rates'], queryFn: () => billingApi.getTierRates() });
  const { data: catData, isLoading: catLoading, isError: catError, refetch: catRefetch } = useQuery({ queryKey: ['category-rates'], queryFn: () => billingApi.getCategoryRates() });
  const { data: lastData } = useQuery({ queryKey: ['rates-last-change'], queryFn: () => billingApi.getRatesLastChange(), retry: false });

  const tiers: TierRow[] = data?.data?.data || [];
  const catRows: CategoryRow[] = catData?.data?.data || [];
  const last: LastChange | null = lastData?.data?.data ?? null;
  const before: RateState = stateFromRows(tiers, catRows);
  const liveCents = tiers.some((t) => t.gasCentsPerGallon != null);
  const viewCents = showPerGallon ?? liveCents;
  const ratesReady = tiers.length > 0 && !catError && !catLoading && catRows.length > 0;

  // ── What the boxes show: the person's typing, or else what the server has ─────────────────────────────────────
  const rowOf = (tier: string) => tiers.find((r) => r.tier === tier);
  const shown = (tier: string, field: Field) => draft[tier]?.[field] ?? (rowOf(tier) ? serverText(rowOf(tier)!, field) : '');
  const setField = (tier: string, field: Field, value: string) => setDraft((p) => ({ ...p, [tier]: { ...p[tier], [field]: value } }));
  const isDirty = (tier: string) => {
    const row = rowOf(tier);
    return !!row && Object.entries(draft[tier] ?? {}).some(([f, v]) => !sameText(f as Field, v as string, serverText(row, f as Field)));
  };
  const dirtyTiers = TIERS.filter((t) => isDirty(t));
  const catShown = (cat: string) => catDraft[cat] ?? pctInput(before.categories[cat] ?? 0);
  const catIsDirty = (cat: string) => catDraft[cat] !== undefined && parseFloat(catDraft[cat]) !== parseFloat(pctInput(before.categories[cat] ?? 0));
  const dirtyCats = CATEGORIES.filter((c) => catIsDirty(c));

  function undoTier(tier: string) { setDraft((p) => { const n = { ...p }; delete n[tier]; return n; }); }
  function undoCat(cat: string) { setCatDraft((p) => { const n = { ...p }; delete n[cat]; return n; }); }

  /** What the person changed in one tier's row, as a change the server understands (or the sentence to say what is wrong with it). */
  function buildChange(tier: string): { change: TierChange | null; error: string | null } {
    const d = draft[tier]; const row = rowOf(tier);
    if (!d || !row) return { change: null, error: null };
    const name = tierName(tier);
    const c: TierChange = { tier };
    if (d.cashbackRate !== undefined && !sameText('cashbackRate', d.cashbackRate, serverText(row, 'cashbackRate'))) {
      const v = parseFloat(d.cashbackRate);
      if (!isFinite(v) || v < 0) return { change: null, error: `${name} cashback must be a number from 0 to ${parseFloat((MAX_TIER_RATE * 100).toFixed(2))}.` };
      c.cashbackRate = parseFloat((v / 100).toFixed(6));
    }
    if (d.gasCentsPerGallon !== undefined && !sameText('gasCentsPerGallon', d.gasCentsPerGallon, serverText(row, 'gasCentsPerGallon'))) {
      if (d.gasCentsPerGallon.trim() === '') c.gasCentsPerGallon = null;
      else {
        const v = parseFloat(d.gasCentsPerGallon);
        if (!isFinite(v) || v < 0) return { change: null, error: `${name} cents per gallon must be a number (leave it empty to pay gas as a percent).` };
        c.gasCentsPerGallon = v;
      }
    }
    if (tier !== 'BRONZE' && d.pointsThreshold !== undefined && !sameText('pointsThreshold', d.pointsThreshold, serverText(row, 'pointsThreshold'))) {
      const v = parseFloat(d.pointsThreshold);
      if (!isFinite(v) || v < 0 || !Number.isInteger(v)) return { change: null, error: `${name} points to reach the tier must be a whole number.` };
      c.pointsThreshold = v;
    }
    const any = c.cashbackRate !== undefined || c.gasCentsPerGallon !== undefined || c.pointsThreshold !== undefined;
    return { change: any ? c : null, error: null };
  }

  function needRates(): boolean {
    if (ratesReady) return true;
    toast.error('The rates did not all load, so the effect of a change cannot be shown. Use Try Again first.');
    return false;
  }

  // ── Saving: every change is confirmed first, then sent as one all-or-nothing request ──────────────────────────
  async function saveTiers(changes: TierChange[], after?: () => void) {
    setBusy(true);
    try {
      const res = await billingApi.updateTierRates(changes);
      const body = res.data;
      qc.setQueryData(['tier-rates'], (old: any) => (old ? { ...old, data: { ...old.data, data: body.data } } : old));
      if (body.lastChange) qc.setQueryData(['rates-last-change'], { data: { success: true, data: body.lastChange } });
      qc.invalidateQueries({ queryKey: ['tier-rates'] });
      setDraft((p) => { const n = { ...p }; for (const c of changes) delete n[c.tier]; return n; });
      setPlan(null);
      toast.success(body.changed ? (changes.length === 1 ? `${tierName(changes[0].tier)} saved` : `${body.changed} tiers saved`) : 'Nothing was different, so nothing changed');
      after?.();
    } catch (e) {
      setPlan(null);
      toast.error(serverMessage(e, 'Could not save. Nothing was changed.'), { duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  async function saveCategories(changes: CategoryChange[]) {
    setBusy(true);
    const failed: string[] = [];
    let lastText: LastChange | null = null;
    let lastError = '';
    for (const c of changes) {
      try {
        const res = await billingApi.updateCategoryRate(c.category, c.cashbackRate);
        if (res.data?.lastChange) lastText = res.data.lastChange;
        setCatDraft((p) => { const n = { ...p }; delete n[c.category]; return n; });
      } catch (e) {
        failed.push(CATEGORY_NAMES[c.category] ?? c.category);
        lastError = serverMessage(e, 'Could not save.');
      }
    }
    if (lastText) qc.setQueryData(['rates-last-change'], { data: { success: true, data: lastText } });
    await qc.invalidateQueries({ queryKey: ['category-rates'] });
    setPlan(null);
    setBusy(false);
    if (failed.length === 0) toast.success(changes.length === 1 ? `${CATEGORY_NAMES[changes[0].category]} bonus saved` : `${changes.length} bonuses saved`);
    else toast.error(`${failed.join(', ')} not saved. ${lastError}`, { duration: 8000 });
  }

  function openTierPlan(tiersToSave: string[], opts: Partial<Pick<Plan, 'title' | 'confirmLabel' | 'danger'>> & { after?: () => void } = {}) {
    if (!needRates()) return;
    const changes: TierChange[] = [];
    for (const t of tiersToSave) {
      const { change, error } = buildChange(t);
      if (error) { toast.error(error, { duration: 7000 }); return; }
      if (change) changes.push(change);
    }
    if (changes.length === 0) { toast('No changes to save'); return; }
    const problem = refusalFor(before, changes);
    if (problem) { toast.error(problem, { duration: 9000 }); return; }
    const afterState = applyChanges(before, changes);
    const byGallon = TIERS.filter((t) => afterState.tiers[t]?.gasCentsPerGallon != null).length;
    const mixed = byGallon > 0 && byGallon < TIERS.length && changes.some((c) => c.gasCentsPerGallon !== undefined);
    setPlan({
      title: opts.title ?? (changes.length === 1 ? `Save the ${tierName(changes[0].tier)} rates?` : `Save ${changes.length} tiers?`),
      lines: changeLines(before, changes),
      effects: effectLines(before, changes),
      warnings: [
        ...holdWarnings(before, changes),
        ...(mixed ? [`Only ${byGallon} of the ${TIERS.length} tiers would be paid for gas by the gallon. The others stay a percent of the sale.`] : []),
      ],
      notes: touchesAppText(changes) ? [APP_TEXT_NOTE] : [],
      confirmLabel: opts.confirmLabel ?? 'Save changes',
      danger: opts.danger,
      run: () => saveTiers(changes, opts.after),
    });
  }

  function openCategoryPlan(cats: string[]) {
    if (!needRates()) return;
    const changes: CategoryChange[] = [];
    for (const cat of cats) {
      const v = parseFloat(catShown(cat));
      if (!isFinite(v) || v < 0) { toast.error(`${CATEGORY_NAMES[cat]} bonus must be a number from 0 to ${parseFloat((MAX_CATEGORY_BONUS * 100).toFixed(2))}.`); return; }
      changes.push({ category: cat, cashbackRate: parseFloat((v / 100).toFixed(6)) });
    }
    const problem = refusalFor(before, [], changes);
    if (problem) { toast.error(problem, { duration: 9000 }); return; }
    setPlan({
      title: changes.length === 1 ? `Save the ${CATEGORY_NAMES[changes[0].category]} bonus?` : `Save ${changes.length} bonuses?`,
      lines: changeLines(before, [], changes),
      effects: effectLines(before, [], changes),
      warnings: holdWarnings(before, [], changes),
      notes: [],
      confirmLabel: 'Save changes',
      run: () => saveCategories(changes),
    });
  }

  function switchGasToPercent() {
    if (!liveCents) {
      // Nothing is live yet, so this only closes the ¢/gallon view and drops any unsaved cents typed there
      setShowPerGallon(false);
      setDraft((p) => {
        const n: Record<string, TierDraft> = {};
        for (const [t, d] of Object.entries(p)) {
          const rest: TierDraft = { ...d };
          delete rest.gasCentsPerGallon;
          if (Object.keys(rest).length) n[t] = rest;
        }
        return n;
      });
      return;
    }
    if (!needRates()) return;
    const changes: TierChange[] = tiers.filter((t) => t.gasCentsPerGallon != null).map((t) => ({ tier: t.tier, gasCentsPerGallon: null }));
    const problem = refusalFor(before, changes);
    if (problem) { toast.error(problem, { duration: 9000 }); return; }
    setPlan({
      title: 'Pay gas as a percent of the sale?',
      lines: ['Every tier stops paying gas by the gallon and pays a percent of the sale instead (the tier rate plus the Gas and Diesel bonus).'],
      effects: effectLines(before, changes),
      warnings: holdWarnings(before, changes),
      notes: ['This changes what every gas customer earns from the next sale. To go back you have to type the cents for each tier again.'],
      confirmLabel: 'Switch to percent',
      danger: true,
      run: () => saveTiers(changes, () => setShowPerGallon(false)),
    });
  }

  const enterSaves = (tier: string) => (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') openTierPlan([tier]); };

  // ── Worked examples (from the rates on screen) ────────────────────────────────────────────────────────────────
  const bronzeGroceries = ratesReady ? salePays(before, 'BRONZE', 'GROCERIES') : 0;
  const goldFill = ratesReady ? gasFill(before, 'GOLD') : null;

  const planMessage = plan && (
    <div style={{ textAlign: 'left' }}>
      {plan.lines.map((l, i) => <div key={i} style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{l}</div>)}
      {plan.effects.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong>What it does</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{plan.effects.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
      {plan.warnings.map((w, i) => <div key={i} style={s.confirmWarn}>⚠️ {w}</div>)}
      {plan.notes.map((n, i) => <div key={i} style={s.confirmNote}>ℹ️ {n}</div>)}
      <div style={{ marginTop: 10, fontWeight: 700, color: '#111827' }}>It applies to the next sale. Sales already started keep their rate.</div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>🏆 Cashback Rates</h1>
          <p style={s.subtitle}>
            Set the base cashback % each customer tier earns. Promotions stack on top of these.
          </p>
        </div>
        {dirtyTiers.length > 0 && (
          <button style={s.saveAllBtn} onClick={() => openTierPlan(dirtyTiers)}>
            💾 Save {dirtyTiers.length} change{dirtyTiers.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div style={s.storeCostNote}>
        💡 Store cost = cashback paid out × (1 + that store's platform fee). The platform fee is set per store on Billing, Stores tab, not here.
      </div>
      <div style={s.appNote}>
        📱 The customer app shows fixed tier numbers (1 to 5% cashback, 5,000 to 45,000 points to reach a tier, +5, +7 and +10 cents a gallon). It does not follow this page, so tell customers if you change a tier's cashback or points.
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError  && <ErrorState message="Could not load rates. Check your connection." onRetry={refetch} />}

      {!isLoading && !isError && tiers.length === 0 && (
        <div style={s.error}>No tier data returned. The backend may need to be restarted.</div>
      )}

      {tiers.length > 0 && (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow style={s.thead}>
                <TableHead style={{ ...s.th, width: 170 }}>Tier</TableHead>
                <TableHead style={s.th}>
                  Cashback %
                  <div style={s.thSub}>earned on every purchase, at most {parseFloat((MAX_TIER_RATE * 100).toFixed(2))}%</div>
                </TableHead>
                <TableHead style={s.th}>
                  Gas ¢ / gallon
                  <div style={s.thSub}>optional, replaces the % for gas and diesel (at most {MAX_GAS_CENTS})</div>
                </TableHead>
                <TableHead style={s.th}>
                  Points to reach the tier
                  <div style={s.thSub}>earned in a half-year, 100 points = $1 of cashback</div>
                </TableHead>
                <TableHead style={{ ...s.th, width: 100 }}><span className="sr-only">Save or undo</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TIERS.map((tierKey) => {
                const r = rowOf(tierKey);
                if (!r) return null;
                const meta = TIER_META[tierKey];
                const name = tierName(tierKey);
                const dirty = isDirty(tierKey);
                const rateNum = parseFloat(shown(tierKey, 'cashbackRate'));
                const ptsNum = parseFloat(shown(tierKey, 'pointsThreshold'));

                return (
                  <TableRow key={tierKey} style={{ ...s.tr, ...(dirty ? s.trDirty : {}) }}>
                    <TableCell style={s.td}>
                      <div style={s.tierCell}>
                        <span style={{ ...s.dot, background: meta.color }} />
                        <div>
                          <div style={s.tierName}>{meta.emoji} {name}</div>
                          <div style={s.tierSub}>
                            {tierKey === 'BRONZE' ? 'New customers' : `${(r.pointsThreshold ?? 0).toLocaleString('en-US')} points to reach`}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number" min="0" max={MAX_TIER_RATE * 100} step="0.5"
                          aria-label={`${name} cashback percent`}
                          value={shown(tierKey, 'cashbackRate')}
                          onChange={(e) => setField(tierKey, 'cashbackRate', e.target.value)}
                          onKeyDown={enterSaves(tierKey)}
                          style={{ ...s.input, ...(dirty ? s.inputDirty : {}) }}
                          placeholder="e.g. 3"
                        />
                        <span style={s.suffix}>%</span>
                        {isFinite(rateNum) && shown(tierKey, 'cashbackRate') !== '' && (
                          <span style={s.preview}>{pct(rateNum / 100)} back per $1</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number" min="0" max={MAX_GAS_CENTS} step="0.5"
                          aria-label={`${name} gas cents per gallon`}
                          value={shown(tierKey, 'gasCentsPerGallon')}
                          onChange={(e) => setField(tierKey, 'gasCentsPerGallon', e.target.value)}
                          onKeyDown={enterSaves(tierKey)}
                          style={{ ...s.input, ...(dirty ? s.inputDirty : {}) }}
                          placeholder="empty = use %"
                        />
                        {shown(tierKey, 'gasCentsPerGallon') !== '' ? <span style={s.suffix}>¢</span> : null}
                      </div>
                      {r.gasCentsPerGallon != null && !dirty && (
                        <div style={s.gasActive}>Active: {r.gasCentsPerGallon}¢/gal for GAS & DIESEL</div>
                      )}
                    </TableCell>

                    <TableCell style={s.td}>
                      {tierKey === 'BRONZE' ? (
                        <span style={{ fontSize: 14, color: TEXT_MUTED }}>Starting tier</span>
                      ) : (
                        <div style={s.inputGroup}>
                          <input
                            type="number" min={MIN_THRESHOLD_POINTS} step="500"
                            aria-label={`${name} points to reach the tier`}
                            value={shown(tierKey, 'pointsThreshold')}
                            onChange={(e) => setField(tierKey, 'pointsThreshold', e.target.value)}
                            onKeyDown={enterSaves(tierKey)}
                            style={{ ...s.input, width: 110, ...(dirty ? s.inputDirty : {}) }}
                            placeholder="e.g. 5000"
                          />
                          <span style={s.suffix}>pts</span>
                          {isFinite(ptsNum) && shown(tierKey, 'pointsThreshold') !== '' && (
                            <span style={s.preview}>= {money(ptsNum / 100)} of cashback</span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    <TableCell style={{ ...s.td, textAlign: 'right' }}>
                      {dirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} aria-label={`Save ${name}`} disabled={busy} onClick={() => openTierPlan([tierKey])}>Save</button>
                          <button style={s.undoBtn} aria-label={`Undo ${name}`} onClick={() => undoTier(tierKey)}>↩</button>
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
          <div style={s.lastChange}>
            {last
              ? <>Last changed by <strong>{last.by}</strong>, {storeDayTime(last.at)}: {last.summary}</>
              : 'No change has been recorded yet. From now on every change to a rate is recorded here and in the Activity Log.'}
          </div>
        </div>
      )}

      {/* ── Category Bonus Rates ─────────────────────────────────────────── */}
      <div style={s.sectionHeader}>
        <div>
          <h2 style={s.sectionTitle}>📦 Category Bonus Rates</h2>
          <p style={s.sectionSubtitle}>
            This bonus adds to the tier base rate on every purchase in this category. It is not a
            promotion, it is a permanent part of the rate. The columns to the right show the
            resulting total cashback % for each tier.
          </p>
        </div>
        {dirtyCats.length > 0 && (
          <button style={s.saveAllBtn} onClick={() => openCategoryPlan(dirtyCats)}>
            💾 Save {dirtyCats.length} change{dirtyCats.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {catLoading && <TableSkeleton columns={7} />}
      {catError && <ErrorState message="Could not load the category bonuses. Check your connection." onRetry={catRefetch} />}

      {!catLoading && !catError && (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow style={s.thead}>
                <TableHead style={{ ...s.th, width: 180 }}>Category</TableHead>
                <TableHead style={s.th}>
                  Bonus %
                  <div style={s.thSub}>added on top of tier base rate, at most {parseFloat((MAX_CATEGORY_BONUS * 100).toFixed(2))}%</div>
                </TableHead>
                {TIERS.map((tierKey) => (
                  <TableHead key={tierKey} style={{ ...s.th, textAlign: 'center' as const }}>
                    {TIER_META[tierKey].emoji} {tierName(tierKey)}
                    <div style={s.thSub}>total cashback %</div>
                  </TableHead>
                ))}
                <TableHead style={{ ...s.th, width: 100 }}><span className="sr-only">Save or undo</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CATEGORIES.map((cat) => {
                const meta = CAT_META[cat];
                const isGasDiesel = GAS_CATEGORIES.includes(cat);
                const dirty = catIsDirty(cat);
                const rawVal = catShown(cat);
                const numVal = parseFloat(rawVal);
                const bonusFraction = isFinite(numVal) ? numVal / 100 : 0;

                return (
                  <TableRow key={cat} style={{ ...s.tr, ...(dirty ? s.trDirty : {}) }}>
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
                          type="number" min="0" max={MAX_CATEGORY_BONUS * 100} step="0.5"
                          aria-label={`${meta.label} bonus percent`}
                          value={rawVal}
                          onChange={(e) => setCatDraft((p) => ({ ...p, [cat]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') openCategoryPlan([cat]); }}
                          style={{ ...s.input, ...(dirty ? s.inputDirty : {}) }}
                          placeholder="0"
                        />
                        <span style={s.suffix}>%</span>
                        {isFinite(numVal) && numVal > 0 && <span style={s.preview}>+{numVal.toFixed(1)}% bonus</span>}
                        {isFinite(numVal) && numVal === 0 && <span style={{ ...s.preview, color: TEXT_MUTED }}>no bonus</span>}
                      </div>
                    </TableCell>
                    {TIERS.map((tierKey) => {
                      const t = before.tiers[tierKey];
                      const byGallon = isGasDiesel && !!t && t.gasCentsPerGallon != null && t.gasCentsPerGallon > 0;
                      if (byGallon) {
                        return <TableCell key={tierKey} style={{ ...s.td, textAlign: 'center' as const }}><span style={s.byGallonTag}>by the gallon</span></TableCell>;
                      }
                      const total = (t?.cashbackRate ?? 0) + bonusFraction;
                      const over10 = total > CASHBACK_CAP + 1e-9;
                      const over75 = total > CASHBACK_WARN + 1e-9;
                      return (
                        <TableCell key={tierKey} style={{ ...s.td, textAlign: 'center' as const }}>
                          <span
                            style={over10 ? s.tagRed : over75 ? s.tagAmber : s.effectiveTag}
                            title={over10 ? `A sale never pays more than ${pct(CASHBACK_CAP)}` : over75 ? `Sales over ${pct(CASHBACK_WARN)} are held for a manager` : undefined}
                          >
                            {over10 ? '⛔ ' : over75 ? '⚠ ' : ''}{pct(total)}
                          </span>
                        </TableCell>
                      );
                    })}
                    <TableCell style={{ ...s.td, textAlign: 'right' }}>
                      {dirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} aria-label={`Save ${meta.label}`} disabled={busy} onClick={() => openCategoryPlan([cat])}>Save</button>
                          <button style={s.undoBtn} aria-label={`Undo ${meta.label}`} onClick={() => undoCat(cat)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}><span aria-hidden="true">✓</span><span className="sr-only">Saved</span></span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div style={s.legend}>
            ⚠ over {pct(CASHBACK_WARN)}: those sales are held for a manager to review. ⛔ over {pct(CASHBACK_CAP)}: a sale never pays more than {pct(CASHBACK_CAP)}.
            {' '}Gas and Diesel are paid by the gallon for a tier that has a ¢/gallon rate, so this bonus is not used for that tier.
          </div>
        </div>
      )}

      {/* ── Gas & Diesel Mode ────────────────────────────────────────────── */}
      <div style={s.sectionHeader}>
        <div>
          <h2 style={s.sectionTitle}>⛽ Gas & Diesel Mode</h2>
          <p style={s.sectionSubtitle}>
            Choose how cashback is calculated for gas and diesel. In ¢/gallon mode each tier earns a flat
            rate per gallon pumped. Gold, Diamond and Platinum also get a fixed extra 5, 7 and 10 cents a gallon
            (set in the code, paid on top, not part of the platform fee). Active promotions still stack on top as a % of the purchase amount.
          </p>
        </div>
      </div>

      <div style={s.gasModeCard}>
        <div style={s.gasModeToggleRow}>
          <button
            style={{ ...s.modeBtn, ...(viewCents ? {} : s.modeBtnActive) }}
            aria-pressed={!viewCents}
            disabled={busy}
            onClick={switchGasToPercent}
          >
            💲 % of amount
          </button>
          <button
            style={{ ...s.modeBtn, ...(viewCents ? s.modeBtnActive : {}) }}
            aria-pressed={viewCents}
            onClick={() => setShowPerGallon(true)}
          >
            ⛽ ¢ / gallon
          </button>

          {liveCents ? (
            <span style={s.liveBadge}>● LIVE: ¢/gallon</span>
          ) : (
            <span style={s.liveInactiveBadge}>● LIVE: % of amount</span>
          )}

          <span style={s.gasModeHint}>
            {viewCents
              ? 'Base = ¢/gallon × gallons pumped · promos still add on top as % of purchase'
              : 'Base = tier % × purchase amount · set the bonus % for Gas and Diesel in the table above'}
          </span>
        </div>

        {viewCents && !liveCents && (
          <div style={s.gasModeWarning}>
            ⚠️ ¢/gallon mode is not active yet. Enter a rate for each tier below and click <strong>Save</strong> to switch.
          </div>
        )}

        {viewCents && tiers.length > 0 && (
          <Table style={{ ...s.table, marginTop: 16 }}>
            <TableHeader>
              <TableRow style={s.thead}>
                <TableHead style={{ ...s.th, width: 200 }}>Tier</TableHead>
                <TableHead style={s.th}>
                  ¢ / gallon
                  <div style={s.thSub}>applies to GAS & DIESEL, at most {MAX_GAS_CENTS}</div>
                </TableHead>
                <TableHead style={s.th}>
                  What a {money(EXAMPLE_SALE)} fill pays
                  <div style={s.thSub}>{exampleGallons.toFixed(1)} gallons, fixed extra included</div>
                </TableHead>
                <TableHead style={{ ...s.th, width: 100 }}><span className="sr-only">Save or undo</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TIERS.map((tierKey) => {
                const r = rowOf(tierKey);
                if (!r) return null;
                const meta = TIER_META[tierKey];
                const name = tierName(tierKey);
                const dirty = isDirty(tierKey);
                const cpgVal = shown(tierKey, 'gasCentsPerGallon');
                const cpgNum = parseFloat(cpgVal);
                const bonusCents = before.tiers[tierKey]?.gasBonusCents ?? 0;
                const fill = cpgVal !== '' && isFinite(cpgNum) && cpgNum > 0
                  ? gasFill({ ...before, tiers: { ...before.tiers, [tierKey]: { ...before.tiers[tierKey], gasCentsPerGallon: cpgNum } } }, tierKey)
                  : null;

                return (
                  <TableRow key={tierKey} style={{ ...s.tr, ...(dirty ? s.trDirty : {}) }}>
                    <TableCell style={s.td}>
                      <div style={s.tierCell}>
                        <span style={{ ...s.dot, background: meta.color }} />
                        <div>
                          <div style={s.tierName}>{meta.emoji} {name}</div>
                          <div style={s.tierSub}>{tierKey === 'BRONZE' ? 'New customers' : `${(r.pointsThreshold ?? 0).toLocaleString('en-US')} points to reach`}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number" min="0" max={MAX_GAS_CENTS} step="0.5"
                          aria-label={`${name} gas cents per gallon`}
                          value={cpgVal}
                          onChange={(e) => setField(tierKey, 'gasCentsPerGallon', e.target.value)}
                          onKeyDown={enterSaves(tierKey)}
                          style={{ ...s.input, ...(dirty ? s.inputDirty : {}) }}
                          placeholder="e.g. 3"
                        />
                        {cpgVal !== '' && <span style={s.suffix}>¢</span>}
                      </div>
                    </TableCell>
                    <TableCell style={s.td}>
                      {fill ? (
                        <div>
                          <span style={s.effectiveTag}>{money(fill.total)} ({pctOne(fill.percent)} of the sale)</span>
                          {bonusCents > 0 && <div style={s.tierSub}>{cpgNum}¢ + {bonusCents}¢ fixed extra = {parseFloat((cpgNum + bonusCents).toFixed(2))}¢ a gallon</div>}
                        </div>
                      ) : (
                        <span style={{ fontSize: 14, color: TEXT_MUTED }}>enter a rate</span>
                      )}
                    </TableCell>
                    <TableCell style={{ ...s.td, textAlign: 'right' }}>
                      {dirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} aria-label={`Save ${name}`} disabled={busy} onClick={() => openTierPlan([tierKey])}>Save</button>
                          <button style={s.undoBtn} aria-label={`Undo ${name}`} onClick={() => undoTier(tierKey)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}><span aria-hidden="true">✓</span><span className="sr-only">Saved</span></span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {viewCents && dirtyTiers.length > 1 && (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button style={s.saveAllBtn} disabled={busy} onClick={() => openTierPlan(dirtyTiers, { title: `Save ${dirtyTiers.length} tiers?` })}>
              💾 Save {dirtyTiers.length} tiers together
            </button>
          </div>
        )}
      </div>

      {/* How it works, with the numbers on this page */}
      <div style={s.infoGrid}>
        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>📐 How rates apply</div>
          <p style={s.infoCardText}>
            When an employee grants points, the customer's tier rate is used automatically,
            plus any category bonus for that purchase (see the table above). A sale never pays more than {pct(CASHBACK_CAP)}.
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}>
              <span>Bronze customer, {money(EXAMPLE_SALE)} of groceries</span>
              <span style={{ color: AMBER_TEXT, fontWeight: 700 }}>{ratesReady ? `${pct(before.tiers.BRONZE.cashbackRate)} + ${pct(before.categories.GROCERIES ?? 0)}` : ' - '}</span>
            </div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns</span>
              <span style={{ fontWeight: 800 }}>{ratesReady ? `= ${money(bronzeGroceries)}` : ' - '}</span>
            </div>
          </div>
        </div>

        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>⛽ Gas by the gallon</div>
          <p style={s.infoCardText}>
            For GAS and DIESEL you can set a flat cents-per-gallon rate instead of a percentage. Gold, Diamond and
            Platinum get a fixed extra on top, paid whichever way gas is set.
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}><span>Gold customer, {money(EXAMPLE_SALE)} fill ({exampleGallons.toFixed(1)} gal)</span><span style={{ color: AMBER_TEXT, fontWeight: 700 }}>{goldFill ? `${money(goldFill.cashback)} + ${money(goldFill.bonus)}` : ' - '}</span></div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns</span>
              <span style={{ fontWeight: 800 }}>{goldFill ? `= ${money(goldFill.total)} (${pctOne(goldFill.percent)})` : ' - '}</span>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!plan}
        title={plan?.title ?? ''}
        message={planMessage}
        confirmLabel={busy ? 'Saving…' : (plan?.confirmLabel ?? 'Save changes')}
        danger={plan?.danger}
        busy={busy}
        onConfirm={() => { plan?.run(); }}
        onCancel={() => setPlan(null)}
      />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },

  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16 },
  title: { margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: PRIMARY },
  subtitle: { margin: 0, color: TEXT_MUTED, fontSize: 14 },

  saveAllBtn: {
    padding: '10px 20px', background: PRIMARY, color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 14, fontWeight: 700, flexShrink: 0,
    boxShadow: '0 2px 8px rgba(29,53,87,0.25)',
  },

  error: { textAlign: 'center' as const, color: '#b42318', padding: 40, background: '#fff5f5', borderRadius: 10 },

  storeCostNote: {
    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
    padding: '10px 16px', fontSize: 14, color: '#1d4ed8', marginBottom: 12,
  },
  appNote: {
    background: '#fff8e6', border: '1px solid #f3d98b', borderRadius: 10,
    padding: '10px 16px', fontSize: 14, color: '#5c4400', marginBottom: 24,
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
    fontSize: 14, fontWeight: 700, color: TEXT_MUTED,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    borderBottom: '2px solid #e9ecef',
  },
  thSub: { fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, color: TEXT_MUTED, fontSize: 12, marginTop: 2 },
  tr: { borderBottom: '1px solid #f1f3f5', transition: 'background 0.15s' },
  trDirty: { background: '#fffbf0' },
  td: { padding: '14px 16px', verticalAlign: 'middle' as const },

  tierCell: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  tierName: { fontWeight: 700, fontSize: 14, color: PRIMARY },
  tierSub: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },

  inputGroup: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  input: {
    width: 90, padding: '7px 10px',
    border: '1.5px solid #dee2e6', borderRadius: 7,
    fontSize: 15, fontWeight: 600, color: PRIMARY,
    outline: 'none', transition: 'border 0.15s',
  },
  inputDirty: { borderColor: '#F4A226' },
  suffix: { fontSize: 15, color: TEXT_MUTED, fontWeight: 600 },
  preview: { fontSize: 13, color: GREEN_TEXT, fontStyle: 'italic' },
  gasActive: { fontSize: 13, color: AMBER_TEXT, marginTop: 4 },

  saveBtn: {
    padding: '6px 14px', background: GREEN_TEXT, color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 700,
  },
  undoBtn: {
    padding: '6px 10px', background: '#f8f9fa',
    border: '1px solid #dee2e6', borderRadius: 6,
    cursor: 'pointer', fontSize: 15, color: TEXT_MUTED,
  },
  savedTag: { fontSize: 14, color: GREEN_TEXT, fontWeight: 600 },
  lastChange: { padding: '12px 16px', fontSize: 14, color: TEXT_MUTED, borderTop: '1px solid #f1f3f5' },

  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    margin: '36px 0 16px', gap: 16,
  },
  sectionTitle: { margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: PRIMARY },
  sectionSubtitle: { margin: 0, color: TEXT_MUTED, fontSize: 15 },
  catEmoji: { fontSize: 22, lineHeight: 1, flexShrink: 0 },
  gasModeCard: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    padding: '20px 24px', marginBottom: 28,
  },
  gasModeToggleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  modeBtn: {
    padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
    border: '1.5px solid #dee2e6', background: '#f8f9fa',
    fontSize: 15, fontWeight: 600, color: TEXT_MUTED, transition: 'all 0.15s',
  },
  modeBtnActive: {
    background: PRIMARY, color: '#fff', border: '1.5px solid #1D3557',
  },
  gasModeHint: { fontSize: 14, color: TEXT_MUTED, fontStyle: 'italic', marginLeft: 4 },
  liveBadge: {
    display: 'inline-block', padding: '3px 10px',
    background: '#e8f8ed', color: GREEN_TEXT,
    borderRadius: 20, fontSize: 14, fontWeight: 700,
    border: '1px solid #a3d9b1',
  },
  liveInactiveBadge: {
    display: 'inline-block', padding: '3px 10px',
    background: '#e8f0fb', color: PRIMARY,
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
    background: '#e8f8ed', color: GREEN_TEXT,
    borderRadius: 20, fontSize: 14, fontWeight: 700,
  },
  tagAmber: {
    display: 'inline-block', padding: '3px 10px',
    background: '#fff3d6', color: AMBER_TEXT,
    borderRadius: 20, fontSize: 14, fontWeight: 700,
  },
  tagRed: {
    display: 'inline-block', padding: '3px 10px',
    background: '#fde8e8', color: RED_TEXT,
    borderRadius: 20, fontSize: 14, fontWeight: 700,
  },
  byGallonTag: {
    display: 'inline-block', padding: '3px 10px',
    background: '#f1f3f5', color: TEXT_MUTED,
    borderRadius: 20, fontSize: 13, fontWeight: 600,
  },
  legend: { padding: '12px 16px', fontSize: 13, color: TEXT_MUTED, borderTop: '1px solid #f1f3f5', lineHeight: 1.5 },

  confirmNote: { marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#eef4ff', color: '#1e3a8a', fontSize: 14, lineHeight: 1.45 },
  confirmWarn: { marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fff8e6', color: '#5c4400', fontSize: 14, lineHeight: 1.45 },

  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  infoCard: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    padding: '18px 20px',
  },
  infoCardTitle: { fontWeight: 700, fontSize: 14, color: PRIMARY, marginBottom: 8 },
  infoCardText: { fontSize: 15, color: TEXT_MUTED, lineHeight: 1.55, margin: '0 0 12px' },
  calcBox: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  calcRow: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 15, color: '#495057' },
};
