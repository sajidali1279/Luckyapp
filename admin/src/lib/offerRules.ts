// What a new promotion does next to the ones already posted, and where the 10% ceiling bites. Plain functions, so the
// confirmation box and the tests use the same answers.
//
// The server applies ONE promotion to a sale (backend/src/utils/offerPick.ts): the most specific category first, then
// the store's own promotion over the chain-wide one, then the larger bonus, then the newer one. The clash check below
// follows the same order, for promotions in the same category.

/** CASHBACK_RATE_CAP in backend/src/config/constants.ts: total cashback never passes this share of a sale, and the server refuses a larger bonus. */
export const CASHBACK_CAP = 0.10;
/** The largest cents-per-gallon bonus the server accepts (about 10% of a $4 gallon). */
export const MAX_CENTS_PER_GALLON = 40;

export interface PostedOffer {
  id: string;
  title: string;
  type: 'ALL_STORES' | 'SPECIFIC_STORE';
  storeId: string | null;
  store?: { name?: string } | null;
  category: string | null;
  bonusRate: number | null;
  tierBonusRates?: Record<string, number> | null;
  gasBonusCentsPerGallon: number | null;
  dealText?: string | null;
  startDate: string;
  endDate: string;
}

export interface DraftPromo {
  type: 'ALL_STORES' | 'SPECIFIC_STORE';
  storeId: string | null;
  /** null = every category */
  category: string | null;
  /** bonus as a fraction (0.05); for per-tier bonuses, the highest tier's rate */
  percent: number | null;
  tiers: Record<string, number> | null;
  centsPerGallon: number | null;
  startMs: number;
  endMs: number;
}

export interface Clash {
  offer: PostedOffer;
  /** true: the new promotion applies where they overlap; false: the posted one does; null: whichever pays more on the sale */
  draftWins: boolean | null;
  text: string;
}

const paysCashback = (o: PostedOffer) => !o.dealText && (o.bonusRate != null || o.gasBonusCentsPerGallon != null);
const topPercent = (o: { bonusRate?: number | null; tierBonusRates?: Record<string, number> | null }) =>
  o.tierBonusRates && Object.keys(o.tierBonusRates).length > 0 ? Math.max(...Object.values(o.tierBonusRates)) : (o.bonusRate ?? 0);

export function findClashes(draft: DraftPromo, posted: PostedOffer[]): Clash[] {
  const out: Clash[] = [];
  const draftOneStore = draft.type === 'SPECIFIC_STORE';
  for (const o of posted) {
    if (!paysCashback(o)) continue;
    if ((o.category ?? null) !== (draft.category ?? null)) continue;
    if (Date.parse(o.endDate) < draft.startMs || Date.parse(o.startDate) > draft.endMs) continue;
    const oneStore = o.type === 'SPECIFIC_STORE';
    if (oneStore && draftOneStore && o.storeId !== draft.storeId) continue; // different stores never meet
    const name = `"${o.title}"`;
    const where = oneStore ? (o.store?.name ?? 'one store') : 'all stores';
    if (draftOneStore && !oneStore) {
      out.push({ offer: o, draftWins: true, text: `${name} (${where}) is also live. At this store yours applies instead, because a store's own promotion beats the chain's.` });
    } else if (!draftOneStore && oneStore) {
      out.push({ offer: o, draftWins: false, text: `${name} (${where}) stays in charge at that store, because a store's own promotion beats the chain's. Yours applies everywhere else.` });
    } else if ((draft.centsPerGallon != null) !== (o.gasBonusCentsPerGallon != null)) {
      out.push({ offer: o, draftWins: null, text: `${name} (${where}) covers the same sales. Only one promotion applies to a sale: whichever pays more on that sale.` });
    } else {
      const mine = draft.centsPerGallon != null ? draft.centsPerGallon : (draft.percent ?? 0);
      const theirs = o.gasBonusCentsPerGallon != null ? o.gasBonusCentsPerGallon : topPercent(o);
      const wins = mine >= theirs; // an exact tie goes to the newer one, which is this one
      out.push({ offer: o, draftWins: wins, text: wins
        ? `${name} (${where}) covers the same sales. Only one applies: yours, because it is the larger bonus.`
        : `${name} (${where}) covers the same sales. Only one applies: that one, because it is the larger bonus, so yours adds nothing while both are live.` });
    }
  }
  return out;
}

const TIER_LABEL: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', DIAMOND: 'Diamond', PLATINUM: 'Platinum' };
const NON_GAS = (c: string) => c !== 'GAS' && c !== 'DIESEL';

/** The tiers whose total (tier rate + category bonus + this bonus) passes the ceiling, so they earn the ceiling and no more. */
export function tiersAtCeiling(draft: DraftPromo, tierRates: { tier: string; cashbackRate: number }[], catRates: { category: string; cashbackRate: number }[]): string[] {
  if (draft.centsPerGallon != null || draft.percent == null) return [];
  const cat = draft.category
    ? (catRates.find((c) => c.category === draft.category)?.cashbackRate ?? 0)
    : Math.max(0, ...catRates.filter((c) => NON_GAS(c.category)).map((c) => c.cashbackRate)); // store-wide: the biggest category bonus
  return tierRates
    .filter((t) => t.cashbackRate + cat + (draft.tiers?.[t.tier] ?? draft.percent ?? 0) > CASHBACK_CAP + 1e-9)
    .map((t) => TIER_LABEL[t.tier] ?? t.tier);
}

/** '1.5' for 0.015, '5' for 0.05, without the whole-number rounding the old Reuse did. */
export function pctText(rate: number): string {
  return String(parseFloat((rate * 100).toFixed(2)));
}
