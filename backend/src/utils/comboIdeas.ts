// Combo ideas for HQ (2026-10-10, Offers > Deals): two things that go together, sold for one price. Coffee with something sweet, hot food
// with a 12oz can or a 20oz drink, chips with a 24oz soda, jerky with a sports drink, candy with an energy drink.
//
// What the ideas are built from (there is no register connection, so nothing knows which exact items sold together):
//  - the Labels catalog: the items that fit each pairing, with their prices and categories;
//  - what moves: how often each item was put on an order list or asked for in a stock request in the last 60 days, and how often each
//    hot food item was ordered in the app;
//  - when it sells: the busiest 3 hours of the pairing's category in the last 60 days of approved sales.
// The combo price is the two prices together less a saving inside HQ's deal limits (Labels > Deals > Deal limits; the lower of the two
// categories' limits), rounded the way the owner's deals are (.00 or .50 first). A side with no priced item (no chips in the catalog, say)
// is shown as "any bag of chips" with no price, for HQ to set.
//
// The ideas change every day: each pairing starts at a different one of its best pairs, so the list keeps offering new combos. HQ can hide
// an idea (kept in DealRecommendationDismissal with a "combo|" key). Tobacco and alcohol are never paired. Nothing is posted from here:
// "Use this idea" fills in the deal form.

import prisma from '../config/prisma';
import { addStoreDays, storeDateKey, storeHour } from './storeTime';
import { loadDealLimits } from './dealLimits';
import { limitFor, isRestrictedCategory, type DealLimits } from './dealSuggest';

export const COMBO_BASIS_DAYS = 60;
export const COMBO_KEY_PREFIX = 'combo|';
const MIN_TIMING_SALES = 30;      // fewer sales of the category in 60 days than this, and its busiest hours are noise
const PER_RULE = 6;               // ideas per pairing

export type ComboRule = 'COFFEE_SWEET' | 'HOTFOOD_CAN' | 'HOTFOOD_DRINK' | 'CHIPS_SODA' | 'JERKY_SPORTS' | 'CANDY_ENERGY';

interface Item { id: string; name: string; price: number | null; category: string | null; source: 'label' | 'hotfood' }
interface Side { key: string; name: string; nameEs: string; price: number | null; category: string | null; moved: number; generic: boolean }

interface Pairing {
  rule: ComboRule;
  label: string;                     // what HQ reads: "Coffee + something sweet"
  a: (i: Item) => boolean;
  b: (i: Item) => boolean;
  anyA: { en: string; es: string };  // when no item in the catalog fits
  anyB: { en: string; es: string };
  why: string;
  timing: 'HOT_FOODS' | 'GROCERIES';
  offerCategory: 'HOT_FOODS' | 'GROCERIES';
}

const cat = (i: Item) => (i.category ?? '').trim().toLowerCase();
const has = (re: RegExp) => (i: Item) => re.test(i.name);
const DRINK_CATS = ['soda', 'soft drinks', 'drinks', 'juice', 'tea', 'water'];
const SPORTS = /gatorade|gatorlyte|powerade|propel|electrolit|body ?armor|prime hydration/i;   // some are filed under Energy Drinks
const isHotFood = (i: Item) => i.source === 'hotfood' && !/coffee|cappuccino|latte|caf[eé]|tea\b|drink|soda|water/i.test(i.name);
const isHotCoffee = (i: Item) => i.source === 'hotfood' && /coffee|cappuccino|latte|caf[eé]/i.test(i.name);
const isSweet = (i: Item) => i.source === 'label' && (cat(i) === 'bakery'
  || /donut|honey ?bun|muffin|croissant|concha|danish|cinnamon roll|pastry|kolache|pop ?tarts|cupcake|twinkie|zinger|pound cake|banana bread/i.test(i.name));
const isChips = (i: Item) => i.source === 'label' && !/chips ahoy|chocolate chip|cookie/i.test(i.name)
  && (cat(i) === 'chips' || /\bchips?\b|lay'?s|doritos|cheetos|takis|ruffles|fritos|pringles|funyuns|tostitos|hot fries|sabritas|zapp'?s/i.test(i.name));

export const PAIRINGS: Pairing[] = [
  {
    rule: 'COFFEE_SWEET', label: 'Coffee + something sweet',
    a: (i) => isHotCoffee(i) || (i.source === 'label' && cat(i) === 'coffee'), b: isSweet,
    anyA: { en: 'any hot coffee', es: 'cualquier café caliente' }, anyB: { en: 'any pastry', es: 'cualquier pan dulce' },
    why: 'Coffee and a pastry are a morning pair: one sign at the coffee bar sells the second item.',
    timing: 'HOT_FOODS', offerCategory: 'HOT_FOODS',
  },
  {
    rule: 'HOTFOOD_CAN', label: 'Hot food + a 12oz can',
    a: isHotFood, b: (i) => i.source === 'label' && ['soda', 'soft drinks', 'juice', 'tea'].includes(cat(i)) && (/\b12\s?oz\b/i.test(i.name) || (/\bcan\b/i.test(i.name) && !/\d\s?oz/i.test(i.name))),
    anyA: { en: 'any hot food item', es: 'cualquier comida caliente' }, anyB: { en: 'any 12oz can', es: 'cualquier lata de 12oz' },
    why: 'A can is the cheapest drink to add to a meal, so the combo price stays low and easy to say yes to.',
    timing: 'HOT_FOODS', offerCategory: 'HOT_FOODS',
  },
  {
    rule: 'HOTFOOD_DRINK', label: 'Hot food + a 20oz drink',
    a: isHotFood, b: (i) => i.source === 'label' && DRINK_CATS.includes(cat(i)) && /\b20\s?oz\b|16\.9\s?oz|18\.5\s?oz/i.test(i.name),
    anyA: { en: 'any hot food item', es: 'cualquier comida caliente' }, anyB: { en: 'any 20oz drink', es: 'cualquier bebida de 20oz' },
    why: 'Most hot food is eaten in the car: a cold bottle next to the hot case turns a snack into a meal.',
    timing: 'HOT_FOODS', offerCategory: 'HOT_FOODS',
  },
  {
    rule: 'CHIPS_SODA', label: 'Chips + a 24oz soda',
    a: isChips, b: (i) => i.source === 'label' && ['soda', 'soft drinks'].includes(cat(i)) && /\b24\s?oz\b/i.test(i.name),
    anyA: { en: 'any bag of chips', es: 'cualquier bolsa de papitas' }, anyB: { en: 'any 24oz soda', es: 'cualquier refresco de 24oz' },
    why: 'Salty snacks sell thirst: the 24oz bottle is the drink most people grab with chips on the road.',
    timing: 'GROCERIES', offerCategory: 'GROCERIES',
  },
  {
    rule: 'JERKY_SPORTS', label: 'Jerky + a sports drink',
    a: (i) => i.source === 'label' && cat(i) === 'jerky', b: has(SPORTS),
    anyA: { en: 'any jerky', es: 'cualquier carne seca' }, anyB: { en: 'any sports drink', es: 'cualquier bebida deportiva' },
    why: 'Jerky is a working snack (drivers, crews): pair it with what they drink on the job.',
    timing: 'GROCERIES', offerCategory: 'GROCERIES',
  },
  {
    rule: 'CANDY_ENERGY', label: 'Candy + an energy drink',
    a: (i) => i.source === 'label' && ['candy', 'gummies'].includes(cat(i)), b: (i) => i.source === 'label' && cat(i) === 'energy drinks' && /\b16\s?oz\b/i.test(i.name) && !SPORTS.test(i.name),
    anyA: { en: 'any candy', es: 'cualquier dulce' }, anyB: { en: 'any 16oz energy drink', es: 'cualquier bebida energética de 16oz' },
    why: 'An afternoon pick-me-up: both are impulse buys made at the counter.',
    timing: 'GROCERIES', offerCategory: 'GROCERIES',
  },
];

// ── Matching an item to the order list and stock request lines that name it ──
const STOP = new Set(['the', 'and', 'with', 'of', 'oz', 'fl', 'can', 'bottle', 'pack', 'pk', 'ct', 'lb', 'lit', 'liter', 'ltr', 'ml', 'regular', 'original', 'bag', 'big', 'king', 'size']);
export function tokens(name: string): Set<string> {
  return new Set(name.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+(\.\d+)?(oz|z|ml|l|lt|ct|pk)?$/.test(w)));
}
/** Does a line ("2 cases red bull 12oz") name this item ("Red Bull 12oz")? Every word of the shorter name must appear in the longer. */
export function sameThing(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

/** The combo price: the two prices less a saving between 4% and the limit, rounded like the owner's deals. Null when nothing fits. */
export function comboPrice(together: number, limit: number): number | null {
  if (together < 1 || limit < 0.04) return null;
  const lo = Math.ceil(together * (1 - limit) * 100);
  const hi = Math.floor(together * 0.96 * 100);
  const target = together * (1 - Math.min(limit, 0.08)) * 100;
  // .00 and .50 first (most of the owner's deals), then .99 / .49 and quarters. Only when none of those fits (a narrow window on a small
  // total): a price ending in 9, then in 0.
  const roundScore = (c: number) => { const e = c % 100; return e === 0 ? 3 : e === 50 ? 2.6 : e === 99 ? 1.6 : e === 49 ? 1.2 : e === 25 || e === 75 ? 0.8 : 0; };
  const fallbackScore = (c: number) => (c % 10 === 9 ? 1 : c % 10 === 0 ? 0.5 : 0);
  for (const endingScore of [roundScore, fallbackScore]) {
    let best: { c: number; score: number } | null = null;
    for (let c = lo; c <= hi; c++) {
      const e = endingScore(c);
      if (e === 0) continue;
      const score = e - Math.abs(c - target) / Math.max(25, together * 4);   // the ending matters most, then staying near the target saving
      if (!best || score > best.score) best = { c, score };
    }
    if (best) return best.c / 100;
  }
  return null;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const BLOCKS = [6, 9, 12, 15, 18] as const;
const BLOCK_EN: Record<number, string> = { 6: '6 to 9 AM', 9: '9 AM to noon', 12: 'noon to 3 PM', 15: '3 to 6 PM', 18: '6 to 9 PM' };
const CAT_EN: Record<string, string> = { HOT_FOODS: 'Hot food', GROCERIES: 'Store items' };

export interface ComboIdea {
  id: string;                       // the key HQ hides it by
  rule: ComboRule;
  pairing: string;
  a: { name: string; price: number | null; moved: number; generic: boolean };
  b: { name: string; price: number | null; moved: number; generic: boolean };
  together: number | null;          // the two prices added up
  price: number | null;             // the combo price
  saving: number | null;
  why: string[];
  timing: string | null;
  offer: { title: string; titleEs: string; dealText: string; dealTextEs: string; description: string; descriptionEs: string; category: 'HOT_FOODS' | 'GROCERIES' };
}

export interface ComboIdeasResult {
  basis: { days: number; from: string; to: string; items: number; lines: number; hotFoodOrders: number };
  ideas: ComboIdea[];
  hidden: number;
}

/** Works out today's combo ideas. `dismissed` = keys HQ has hidden. */
export async function comboIdeas(now: Date = new Date(), dismissed: Set<string> = new Set()): Promise<ComboIdeasResult> {
  const today = storeDateKey(now);
  const since = new Date(now.getTime() - COMBO_BASIS_DAYS * 86_400_000);
  const [labels, menu, catalog, orderLines, requestLines, hotOrders, sales, limits, liveDeals] = await Promise.all([
    prisma.label.findMany({ select: { id: true, productName: true, priceText: true, category: true } }),
    prisma.hotFoodMenuItem.findMany({ where: { isAvailable: true }, select: { id: true, name: true, price: true, category: true } }),
    prisma.hotFoodCatalogItem.findMany({ select: { id: true, name: true, price: true } }),
    prisma.orderListItem.findMany({ where: { list: { openedAt: { gte: since } } }, select: { name: true } }),
    prisma.employeeRequestLine.findMany({ where: { request: { createdAt: { gte: since } } }, select: { name: true } }),
    prisma.hotFoodOrderItem.findMany({ where: { order: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } }, select: { name: true, quantity: true } }),
    prisma.pointsTransaction.findMany({
      where: { status: 'APPROVED', isTestData: false, challengeId: null, referralId: null, createdAt: { gte: since, lt: now }, category: { in: ['HOT_FOODS', 'GROCERIES'] }, store: { isActive: true } },
      select: { purchaseAmount: true, category: true, createdAt: true },
    }),
    loadDealLimits(),
    prisma.offer.findMany({ where: { isActive: true, endDate: { gt: now }, dealText: { not: null } }, select: { title: true } }),
  ]);

  const price = (t: string | null) => { const n = parseFloat(String(t ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
  const items: Item[] = [
    ...labels.filter((l) => !isRestrictedCategory(l.category)).map((l) => ({ id: l.id, name: l.productName.trim(), price: price(l.priceText), category: l.category, source: 'label' as const })),
    ...menu.map((m) => ({ id: m.id, name: m.name.trim(), price: m.price > 0 ? m.price : null, category: 'hot food', source: 'hotfood' as const })),
    ...catalog.map((c) => ({ id: c.id, name: c.name.trim(), price: c.price > 0 ? c.price : null, category: 'hot food', source: 'hotfood' as const })),
  ];
  // The same hot food item can be on the chain catalog and a store menu: keep one per name
  const seen = new Set<string>();
  const unique = items.filter((i) => { const k = `${i.source}|${i.name.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });

  // How much each item moves
  const lineTokens = [...orderLines, ...requestLines].map((l) => tokens(l.name));
  const hotCount = new Map<string, number>();
  for (const o of hotOrders) { const k = o.name.trim().toLowerCase(); hotCount.set(k, (hotCount.get(k) ?? 0) + (o.quantity || 1)); }
  const moved = new Map<string, number>();
  for (const i of unique) {
    if (i.source === 'hotfood') { moved.set(i.id, hotCount.get(i.name.toLowerCase()) ?? 0); continue; }
    const t = tokens(i.name);
    let n = 0;
    for (const lt of lineTokens) if (sameThing(t, lt)) n++;
    moved.set(i.id, n);
  }

  // When each category sells most
  const timingText = (category: 'HOT_FOODS' | 'GROCERIES'): string | null => {
    const list = sales.filter((s) => s.category === category);
    if (list.length < MIN_TIMING_SALES) return null;
    const byBlock = new Map<number, number>();
    let total = 0;
    for (const s of list) {
      const h = storeHour(s.createdAt);
      const b = BLOCKS.find((x) => h >= x && h < x + 3);
      if (b == null) continue;
      byBlock.set(b, (byBlock.get(b) ?? 0) + s.purchaseAmount); total += s.purchaseAmount;
    }
    if (total <= 0) return null;
    const [block, amount] = [...byBlock.entries()].sort((x, y) => y[1] - x[1])[0];
    const share = Math.round((amount / total) * 100);
    if (share < 25) return null;   // spread through the day: no hour worth naming
    return `${CAT_EN[category]} sells most ${BLOCK_EN[block]} (${share}% of daytime sales in the last ${COMBO_BASIS_DAYS} days): the time to have this combo up front.`;
  };
  const timing = { HOT_FOODS: timingText('HOT_FOODS'), GROCERIES: timingText('GROCERIES') };

  const live = new Set(liveDeals.map((o) => o.title.trim().toLowerCase()));
  const dayNumber = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86_400_000);
  const ideasByRule: ComboIdea[][] = [];
  let hidden = 0;

  for (const p of PAIRINGS) {
    const side = (match: (i: Item) => boolean, any: { en: string; es: string }): Side[] => {
      const fit = unique.filter((i) => i.price != null && match(i))
        .map((i) => ({ key: i.id, name: i.name, nameEs: i.name, price: i.price, category: i.category, moved: moved.get(i.id) ?? 0, generic: false }))
        .sort((x, y) => y.moved - x.moved || x.name.localeCompare(y.name));
      return fit.length > 0 ? fit.slice(0, 8) : [{ key: 'any', name: any.en, nameEs: any.es, price: null, category: null, moved: 0, generic: true }];
    };
    const As = side(p.a, p.anyA);
    const Bs = side(p.b, p.anyB);

    // Every pair of the best few on each side, best movers first, then today's turn so the list changes daily
    const pairs: { a: Side; b: Side; score: number }[] = [];
    for (const a of As.slice(0, 5)) for (const b of Bs.slice(0, 5)) pairs.push({ a, b, score: (a.moved + 1) * (b.moved + 1) });
    pairs.sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name) || x.b.name.localeCompare(y.b.name));
    const start = pairs.length > 0 ? dayNumber % pairs.length : 0;
    const turn = [...pairs.slice(start), ...pairs.slice(0, start)];
    // Lead with the strongest pair, then today's turn
    const ordered = [pairs[0], ...turn.filter((x) => x !== pairs[0])].filter(Boolean);

    const out: ComboIdea[] = [];
    const usedA = new Map<string, number>();
    for (const { a, b } of ordered) {
      if (out.length >= PER_RULE) break;
      if ((usedA.get(a.key) ?? 0) >= 2) continue;   // variety: one item leads at most two ideas
      const id = `${COMBO_KEY_PREFIX}${p.rule}|${a.key}|${b.key}`;
      if (dismissed.has(id)) { hidden++; continue; }
      const title = `${show(a.name)} + ${show(b.name)}`;
      if (live.has(title.toLowerCase())) continue;   // already running as a deal
      const lim = Math.min(limitOf(limits, a), limitOf(limits, b));
      const together = a.price != null && b.price != null ? Math.round((a.price + b.price) * 100) / 100 : null;
      const comboAt = together != null ? comboPrice(together, lim) : null;
      const saving = together != null && comboAt != null ? Math.round((together - comboAt) * 100) / 100 : null;
      const why = [p.why];
      if (a.moved + b.moved > 0) {
        const parts = [a, b].filter((s) => s.moved > 0).map((s) => `${s.name} came up ${s.moved} time${s.moved === 1 ? '' : 's'}`);
        why.push(`What moves: ${parts.join(' and ')} on order lists, stock requests or hot food orders in the last ${COMBO_BASIS_DAYS} days.`);
      }
      if (together != null && comboAt == null) why.push(`At ${usd(together)} together there is no round price inside the deal limit (${Math.round(lim * 100)}%): set one yourself.`);
      if (a.generic || b.generic) why.push('No priced item in Labels fits one side, so it reads "any". Add the price before you post it.');
      usedA.set(a.key, (usedA.get(a.key) ?? 0) + 1);
      out.push({
        id, rule: p.rule, pairing: p.label,
        a: { name: a.name, price: a.price, moved: a.moved, generic: a.generic },
        b: { name: b.name, price: b.price, moved: b.moved, generic: b.generic },
        together, price: comboAt, saving, why, timing: timing[p.timing],
        offer: {
          title: title.slice(0, 100),
          titleEs: `${show(a.nameEs)} + ${show(b.nameEs)}`.slice(0, 100),
          dealText: comboAt != null ? `Both for ${usd(comboAt)}` : '',
          dealTextEs: comboAt != null ? `Ambos por ${usd(comboAt)}` : '',
          description: comboAt != null && saving != null
            ? `${show(a.name)} and ${show(b.name)} together for ${usd(comboAt)}. You save ${usd(saving)}.`
            : `${show(a.name)} and ${show(b.name)} together for one price.`,
          descriptionEs: comboAt != null && saving != null
            ? `${show(a.nameEs)} y ${show(b.nameEs)} juntos por ${usd(comboAt)}. Ahorras ${usd(saving)}.`
            : `${show(a.nameEs)} y ${show(b.nameEs)} juntos por un solo precio.`,
          category: p.offerCategory,
        },
      });
    }
    ideasByRule.push(out);
  }

  // One from each pairing in turn, so the list mixes coffee, hot food, chips and the rest
  const ideas: ComboIdea[] = [];
  for (let i = 0; i < PER_RULE; i++) for (const list of ideasByRule) if (list[i]) ideas.push(list[i]);

  return {
    basis: { days: COMBO_BASIS_DAYS, from: addStoreDays(today, -COMBO_BASIS_DAYS), to: today, items: unique.length, lines: lineTokens.length, hotFoodOrders: hotOrders.length },
    ideas, hidden,
  };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// What customers read: without a store shorthand in front of the name ("(H) Honey Bun Glazed" is the Honey Bun Glazed)
export const show = (s: string) => cap(s.replace(/^\(\w{1,3}\)\s*/, '').trim());
function limitOf(limits: DealLimits, s: Side): number {
  // A hot food item or an "any" side has no Labels category: the default limit applies
  return limitFor(limits, s.category === 'hot food' ? null : s.category) ?? limitFor(limits, null) ?? 0.08;
}
