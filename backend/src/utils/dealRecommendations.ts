// Deal recommendations for the label catalog (admin, Labels > Deals). The system has no sales per product (sales are kept by category),
// so the recommendations come from the catalog itself, each with its reason:
//
//   Fix:   a deal that saves nothing ("2 for $3.50" on a $1.69 item is $1.75 each), one that takes more than 40% off (a typo?), or one
//          written another way than "2 for $5.00".
//   Line:  the other items of its product line (10+ shared barcode digits), same size and price, nearly all have one deal; this one not.
//   Brand: the same for the same maker (7-9 shared digits), same size and price, when three or more of them agree.
//   Idea:  every item with no deal, outside the categories HQ leaves out (Tobacco and Tobacco Accessories), gets a deal within its
//          category's max discount (utils/dealSuggest.ts): as near the limit as a shelf price allows, or what deals on similar-priced
//          items there save when that is less.
//   Over:  a deal that takes more off than its category's limit (the owner gives away more than HQ allows), resized to the limit.
//
// The system has no cost per item, so the limits are what keep a deal from losing money.

import { sharedDigits, sizeOf } from './labelSimilar';
import { DealLimits, DEAL_LIMITS_DEFAULT, limitFor, suggestDeal } from './dealSuggest';

export type DealRecoKind = 'no-saving' | 'too-deep' | 'over-limit' | 'format' | 'line' | 'brand' | 'idea';

export interface DealRecoItem {
  id: string;
  productName: string;
  category: string | null;
  barcode: string | null;
  priceText: string | null;
  dealText: string | null;
}

export interface DealReco {
  key: string;                 // what a dismissal is kept against: the item, the kind and the suggestion (a new suggestion shows again)
  kind: DealRecoKind;
  labelId: string;
  productName: string;
  category: string | null;
  price: string;
  currentDeal: string | null;
  suggestedDeal: string | null;
  saving: number | null;       // what the suggested deal saves, as a fraction of buying the same number at the price
  reason: string;
}

const DEAL = /^\s*(\d{1,2})\s*for\s*\$?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*$/i;

/** "2 for $5.00" (any spacing, "For", a comma or no "$") as a number and a total, or null for other deals ("BOGO"). */
export function parseDeal(text: string | null | undefined): { qty: number; total: number } | null {
  const m = DEAL.exec(text ?? '');
  if (!m) return null;
  const qty = Number(m[1]), total = Number(m[2].replace(',', '.'));
  return qty >= 2 && total > 0 ? { qty, total } : null;
}

export const dealText = (qty: number, total: number) => `${qty} for $${total.toFixed(2)}`;
const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (f: number) => `${Math.round(f * 100)}%`;
const savingOf = (price: number, d: { qty: number; total: number }) => 1 - d.total / (d.qty * price);

/** A total near the target a shelf would show ($0.25 steps under $5, $0.50 above) that saves 5 to 30%; null when none does. */
export function niceTotal(price: number, qty: number, target: number): number | null {
  const step = target < 5 ? 0.25 : 0.5;
  const base = Math.round(target / step);
  const candidates = [base - 2, base - 1, base, base + 1, base + 2].map((k) => Math.round(k * step * 100) / 100)
    .filter((c) => c > 0 && savingOf(price, { qty, total: c }) >= 0.05 && savingOf(price, { qty, total: c }) <= 0.30);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}

export function recommendDeals(items: DealRecoItem[], limits: DealLimits = DEAL_LIMITS_DEFAULT): DealReco[] {
  const limitOf = (c: string | null) => limitFor(limits, c);
  const pctText = (l: number) => `${Math.round(l * 100)}%`;
  const priced = items
    .map((i) => ({ ...i, price: i.priceText != null && !Number.isNaN(Number(i.priceText)) ? Number(i.priceText) : null, deal: parseDeal(i.dealText) }))
    .filter((i) => i.price != null && i.price > 0) as (DealRecoItem & { price: number; deal: { qty: number; total: number } | null })[];
  const out: DealReco[] = [];
  const add = (i: (typeof priced)[number], kind: DealRecoKind, suggested: string | null, reason: string) => {
    const s = parseDeal(suggested);
    out.push({
      key: `${i.id}|${kind}|${suggested ?? ''}`, kind, labelId: i.id, productName: i.productName, category: i.category,
      price: i.price.toFixed(2), currentDeal: i.dealText, suggestedDeal: suggested, saving: s ? Math.round(savingOf(i.price, s) * 1000) / 1000 : null, reason,
    });
  };

  // Savings of the "N for $X" deals in each category, to size a fix or an idea like the deals around it
  const byCat = new Map<string, typeof priced>();
  priced.forEach((i) => { const c = i.category ?? ''; byCat.set(c, [...(byCat.get(c) ?? []), i]); });
  const typicalSaving = (i: (typeof priced)[number], qty: number): { saving: number; n: number } | null => {
    const near = (byCat.get(i.category ?? '') ?? []).filter((x) => x.id !== i.id && x.deal && x.deal.qty === qty && Math.abs(x.price - i.price) <= 0.4 * i.price)
      .map((x) => savingOf(x.price, x.deal!)).filter((s) => s > 0).sort((a, b) => a - b);
    if (near.length < 3) return null;
    return { saving: near[Math.floor(near.length / 2)], n: near.length };
  };

  const handled = new Set<string>();
  // ── Fix ──
  for (const i of priced) {
    if (!i.dealText) continue;
    if (i.deal) {
      const s = savingOf(i.price, i.deal);
      if (s <= 0.001) {
        const typical = typicalSaving(i, 2);
        const fix = suggestDeal(i.price, limitOf(i.category) ?? limits.defaultPct / 100, typical?.saving);
        add(i, 'no-saving', fix ? fix.text : null,
          `${i.dealText} is ${money(i.deal.total / i.deal.qty)} each, ${s < -0.001 ? 'more than' : 'the same as'} the ${money(i.price)} price: it saves nothing.`);
        handled.add(i.id);
        continue;
      }
      if (s > 0.40) {
        add(i, 'too-deep', null, `${i.dealText} takes ${pct(s)} off the ${money(i.price)} price. Check it is not a typo.`);
        handled.add(i.id);
        continue;
      }
      const canon = dealText(i.deal.qty, i.deal.total);
      if (canon !== i.dealText.trim()) {
        add(i, 'format', canon, `Written "${i.dealText}". Every other deal reads like "${canon}".`);
        handled.add(i.id);
        continue;
      }
      // Deeper than HQ's limit for the category: information (a supplier often pays for such a deal), shown last
      const limit = limitOf(i.category);
      if (limit != null && s > limit + 0.005) {
        const resized = suggestDeal(i.price, limit);
        add(i, 'over-limit', resized ? resized.text : null,
          `${i.dealText} takes ${pct(s)} off; the ${i.category ?? 'category'} limit is ${pctText(limit)}. Fine if a supplier pays for it.${resized ? '' : ' No deal fits the limit at this price.'}`);
        handled.add(i.id);
      }
    }
  }

  // ── Line and brand: the same size and price, the same deal ──
  for (const i of priced) {
    if (handled.has(i.id) || !i.barcode) continue;
    const size = sizeOf(i.productName);
    const mine = i.deal ? dealText(i.deal.qty, i.deal.total) : i.dealText ? i.dealText.trim() : '';
    for (const [kind, min, max, need] of [['line', 10, 13, 2], ['brand', 7, 9, 3]] as const) {
      if (kind === 'brand' && !size) continue;   // across a brand only the size makes two items comparable
      const sib = priced.filter((x) => x.id !== i.id && x.barcode && x.price === i.price && sizeOf(x.productName) === size
        && sharedDigits(x.barcode, i.barcode) >= min && sharedDigits(x.barcode, i.barcode) <= max);
      if (sib.length < need) continue;
      const counts = new Map<string, number>();
      sib.forEach((x) => { const d = x.deal ? dealText(x.deal.qty, x.deal.total) : (x.dealText ?? '').trim(); counts.set(d, (counts.get(d) ?? 0) + 1); });
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top || n / sib.length < 0.75 || top === mine) continue;
      const names = sib.filter((x) => (x.deal ? dealText(x.deal.qty, x.deal.total) : (x.dealText ?? '').trim()) === top).slice(0, 2).map((x) => x.productName);
      add(i, kind, top, `${n} of the ${sib.length} other ${kind === 'line' ? 'items in its product line' : 'same-brand items'} at ${money(i.price)}${size ? ` (${size})` : ''} are "${top}" (${names.join(', ')}${n > 2 ? ', ...' : ''}); this one is ${mine ? `"${mine}"` : 'not on a deal'}.`);
      handled.add(i.id);
      break;
    }
  }

  // ── Ideas: every item with no deal, within its category's limit ──
  for (const [cat, list] of byCat) {
    for (const i of list) {
      if (i.dealText || handled.has(i.id)) continue;
      const limit = limitOf(i.category);
      if (limit == null) continue;   // left out (Tobacco)
      const typical = typicalSaving(i, 2);
      const deal = suggestDeal(i.price, limit, typical?.saving);
      if (!deal) continue;
      const withDeal = list.filter((x) => x.deal).length;
      add(i, 'idea', deal.text,
        `${cat || 'No category'} limit ${pctText(limit)}: ${deal.text} saves ${pct(deal.saving)}.`
        + (typical && typical.saving < limit ? ` ${typical.n} deals on ${cat} items near ${money(i.price)} save about ${pct(typical.saving)}.` : '')
        + (list.length ? ` ${withDeal} of ${list.length} ${cat || ''} items have a deal now.` : ''));
    }
  }

  const order: DealRecoKind[] = ['no-saving', 'too-deep', 'format', 'line', 'brand', 'idea', 'over-limit'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.category ?? '').localeCompare(b.category ?? '') || a.productName.localeCompare(b.productName));
}
