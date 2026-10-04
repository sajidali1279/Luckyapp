// Sizing a deal so the owner does not give away too much: HQ sets a maximum discount per category (Labels > Deals > Deal limits; the system
// has no cost per item, so this is what keeps a deal from losing money), and a deal is the "N for $X" the owner would write: rounded the
// way their deals in that category are (mostly .00 or .50; .60 to .90 in some), as deep as their own changes to suggestions go, and never
// past the limit. Tobacco and Tobacco Accessories are left out by default.
//
// It learns from the owner: every time a suggested deal is changed before it is applied (Labels > Deals, or the Add/Edit form), the change
// is kept (DealSuggestionEdit), and the next suggestions in that category follow it: the ending it was rounded to, how much it takes
// off, and whether it is 2 for or 3 for at that price.
//
// Kept the same in backend/src/utils/dealSuggest.ts and admin/src/lib/dealSuggest.ts (no imports, so both can use it as is).

export interface DealLimits {
  defaultPct: number;                       // for a category with no limit of its own
  categories: Record<string, number>;       // lower-case category name -> max discount %
  excluded: string[];                       // lower-case category names that get no deal suggestions
}

export const DEAL_LIMITS_DEFAULT: DealLimits = {
  defaultPct: 8,
  categories: {
    candy: 12, snacks: 12, gummies: 12,
    drinks: 10, water: 10, soda: 10, 'soft drinks': 10, 'energy drinks': 10, juice: 10, coffee: 10, tea: 10, 'protein drinks': 10,
  },
  excluded: ['tobacco', 'tobacco accessories'],
};

export const MIN_SAVING = 0.03;   // a deal that saves less than 3% is not worth a label
export const MIN_PRICE = 0.5;     // nor is one on an item under 50 cents
const SLACK = 0.005;              // "12%" allows 12.06% (2 for $3.50 on a $1.99 item): half a point of rounding
const key = (c: string | null | undefined) => (c ?? '').trim().toLowerCase();

/** The max discount for a category as a fraction (0.12), or null when the category gets no deals. */
export function limitFor(limits: DealLimits, category: string | null | undefined): number | null {
  const k = key(category);
  if (limits.excluded.includes(k)) return null;
  const pct = limits.categories[k] ?? limits.defaultPct;
  return Math.max(0, Math.min(50, pct)) / 100;
}

const DEAL = /^\s*(\d{1,2})\s*for\s*\$?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*$/i;

/** "2 for $5.00" (any spacing, "For", a comma or no "$") as a number and a total, or null for other deals ("BOGO"). */
export function parseDeal(text: string | null | undefined): { qty: number; total: number } | null {
  const m = DEAL.exec(text ?? '');
  if (!m) return null;
  const qty = Number(m[1]), total = Number(m[2].replace(',', '.'));
  return qty >= 2 && total > 0 ? { qty, total } : null;
}

/** How a deal's total ends: what the owner rounds to. */
export type Ending = 'whole' | 'half' | 'dime' | 'quarter' | 'nine' | 'other';
export const ENDING_TEXT: Record<Ending, string> = {
  whole: '.00', half: '.50', dime: '.60, .70, .80 and the like', quarter: '.25 or .75', nine: 'a 9 (.49, .99)', other: 'other cents',
};
export function endingOf(cents: number): Ending {
  const c = ((Math.round(cents) % 100) + 100) % 100;
  if (c === 0) return 'whole';
  if (c === 50) return 'half';
  if (c % 10 === 0) return 'dime';
  if (c === 25 || c === 75) return 'quarter';
  if (c % 10 === 9) return 'nine';
  return 'other';
}

/** One change to a suggested deal: what was suggested and what the owner set instead. */
export interface DealEdit { category: string | null; price: number; suggested: string; chosen: string }

/** What the suggestions follow in a category, learned from its deals and from the owner's changes to suggestions there. */
export interface DealStyle {
  endings: Record<Ending, number>;   // how strongly each ending is preferred (the highest that fits wins)
  target: number | null;             // the saving the owner's changes set (the middle one), null when there are none
  confidence: number;                // how much the changes count: 1 change a third, 3 or more fully
  threeUnder: number;                // "3 for" on items priced under this, "2 for" from it up
  changes: number;                   // changes learned from
}

// Before anything is learned: .00 and .50 first, .60 to .90 when neither fits
const PRIOR: Record<Ending, number> = { whole: 1, half: 1, dime: 0.3, quarter: 0, nine: 0, other: 0 };
const RECENT = 20;   // the changes that count: the latest 20 in a category

const share = (totals: number[]) => {
  const out: Record<Ending, number> = { whole: 0, half: 0, dime: 0, quarter: 0, nine: 0, other: 0 };
  totals.forEach((t) => { out[endingOf(Math.round(t * 100))] += 1 / totals.length; });
  return out;
};
const savingOf = (price: number, d: { qty: number; total: number }) => 1 - d.total / (d.qty * price);

/**
 * The style for one category. `deals` are its deals in the catalog (how the owner writes them), `allDeals` every deal in the catalog (for a
 * category with fewer than 3), `edits` its changes to suggestions, oldest first.
 */
export function learnStyle(deals: (string | null)[], allDeals: (string | null)[], edits: DealEdit[]): DealStyle {
  const totals = (list: (string | null)[]) => list.map(parseDeal).filter((d): d is { qty: number; total: number } => !!d).map((d) => d.total);
  const own = totals(deals);
  const catalog = own.length >= 3 ? share(own) : share(totals(allDeals));
  const catalogWeight = own.length >= 3 ? 2 : 1;
  const recent = edits.slice(-RECENT).map((e) => ({ e, d: parseDeal(e.chosen) })).filter((x) => x.d && x.e.price > 0) as { e: DealEdit; d: { qty: number; total: number } }[];
  const confidence = Math.min(1, recent.length / 3);
  const chosen = recent.length ? share(recent.map((x) => x.d.total)) : null;
  const endings = { ...PRIOR };
  (Object.keys(endings) as Ending[]).forEach((k) => {
    endings[k] = PRIOR[k] + (Number.isFinite(catalog[k]) ? catalog[k] * catalogWeight : 0) + (chosen ? chosen[k] * 4 * confidence : 0);
  });
  const savings = recent.map((x) => savingOf(x.e.price, x.d)).filter((s) => s > 0).sort((a, b) => a - b);
  const target = savings.length ? savings[Math.floor(savings.length / 2)] : null;
  // 3 for or 2 for: the latest changes win (a "3 for" at $1.29 makes items under $1.30 "3 for"; a "2 for" at $0.89 makes it start below)
  let threeUnder = 1;
  recent.forEach(({ e, d }) => {
    if (d.qty === 3) threeUnder = Math.max(threeUnder, Math.round((e.price + 0.01) * 100) / 100);
    else if (d.qty === 2 && e.price < threeUnder) threeUnder = e.price;
  });
  return { endings, target, confidence, threeUnder, changes: recent.length };
}

/** The style of every category (lower-case name; '' for one with no name), from the catalog and the changes kept. */
export function learnStyles(items: { category: string | null; dealText: string | null }[], edits: DealEdit[]): Record<string, DealStyle> {
  const all = items.map((i) => i.dealText);
  const cats = new Set([...items.map((i) => key(i.category)), ...edits.map((e) => key(e.category))]);
  const out: Record<string, DealStyle> = {};
  cats.forEach((c) => {
    out[c] = learnStyle(items.filter((i) => key(i.category) === c).map((i) => i.dealText), all, edits.filter((e) => key(e.category) === c));
  });
  if (!out['']) out[''] = learnStyle([], all, []);
  return out;
}
export const styleFor = (styles: Record<string, DealStyle> | null | undefined, category: string | null | undefined): DealStyle | undefined =>
  styles ? styles[key(category)] ?? styles[''] : undefined;

/**
 * The deal for a price within a limit: "3 for" under $1 (or where the owner's changes put it) and "2 for" above, at the total that ends the
 * way the category's deals do, nearest the target saving (the owner's changes, else what deals on similar items save, else the limit),
 * and never past the limit. null when no total saves at least 3% within the limit (a very cheap item, or a limit under 3%).
 */
export function suggestDeal(price: number, limit: number, typical?: number | null, style?: DealStyle | null): { qty: number; total: number; saving: number; text: string } | null {
  if (!(price >= MIN_PRICE) || !(limit >= MIN_SAVING)) return null;
  const qty = price < (style?.threeUnder ?? 1) ? 3 : 2;
  const full = Math.round(qty * price * 100);
  const base = Math.min(limit, typical != null && typical >= MIN_SAVING ? typical : limit);
  const target = style?.target != null
    ? Math.max(MIN_SAVING, Math.min(limit, base * (1 - style.confidence) + style.target * style.confidence))
    : base;
  const weights = style?.endings ?? PRIOR;
  let best: { cents: number; saving: number; score: number } | null = null;
  let fallback: { cents: number; saving: number } | null = null;   // when no preferred ending fits: a quarter or a 9, nearest the target
  for (let c = Math.ceil(full * (1 - limit - SLACK)); c <= Math.floor(full * (1 - MIN_SAVING)); c++) {
    const saving = 1 - c / full;
    if (saving > limit + SLACK + 1e-9 || saving < MIN_SAVING - 1e-9) continue;
    const w = weights[endingOf(c)];
    if (w > 0.05) {
      const score = w - Math.abs(saving - target) * 10;   // an ending the owner uses beats a closer saving; a tenth of a point per point off
      if (!best || score > best.score + 1e-9) best = { cents: c, saving, score };
    } else if ((c % 25 === 0 || c % 10 === 9) && (!fallback || Math.abs(saving - target) < Math.abs(fallback.saving - target) - 1e-9)) {
      fallback = { cents: c, saving };
    }
  }
  const pick = best ?? fallback;
  if (!pick) return null;
  const total = pick.cents / 100;
  return { qty, total, saving: Math.round(pick.saving * 1000) / 1000, text: `${qty} for $${total.toFixed(2)}` };
}

/** Why the owner changed a suggestion, in words: the ending, how deep, 2 for or 3 for. */
export function explainEdit(e: DealEdit): string {
  const s = parseDeal(e.suggested), c = parseDeal(e.chosen);
  if (!c) return `set "${e.chosen}" instead`;
  if (!s) return `set ${e.chosen}`;
  const why: string[] = [];
  if (c.qty !== s.qty) why.push(`${c.qty} for instead of ${s.qty} for`);
  const ce = endingOf(Math.round(c.total * 100)), se = endingOf(Math.round(s.total * 100));
  if (ce !== se) why.push(`rounded to .${String(Math.round(c.total * 100) % 100).padStart(2, '0')}`);
  if (e.price > 0) {
    const diff = Math.round((savingOf(e.price, c) - savingOf(e.price, s)) * 1000) / 10;
    if (Math.abs(diff) >= 1) why.push(`${Math.abs(diff)} points ${diff > 0 ? 'more' : 'less'} off (saves ${Math.round(savingOf(e.price, c) * 100)}%)`);
  }
  return why.length ? why.join(', ') : 'a small change';
}

/** Tobacco, vape and alcohol: their label deals never show in the customer app (Google Play policy), whatever the label says. */
export function isRestrictedCategory(category: string | null | undefined): boolean {
  const c = key(category);
  if (/\bbeer\s*salt\b/.test(c)) return false;   // salt for beer is not alcohol
  return /\b(tobacco|vapes?|vaping|e-?cig\w*|cigarettes?|cigars?|cigarillos?|nicotine|hookah|beer|wine|liquor|alcohol|spirits|seltzer)\b/.test(c);
}
