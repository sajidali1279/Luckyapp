// What the deal suggestions learn from the owner (utils/dealSuggest.ts does the learning): each suggested deal changed before it was
// applied, on Labels > Deals or in the Add/Edit form, is kept here. Nothing is deleted: "start over" for a category only sets a date
// (AppConfig DEAL_LEARNING_SINCE) before which its changes are not used.

import prisma from '../config/prisma';
import { DealEdit, DealLimits, DealStyle, Ending, ENDING_TEXT, explainEdit, limitFor, parseDeal } from './dealSuggest';

export const DEAL_LEARNING_SINCE_KEY = 'DEAL_LEARNING_SINCE';
const key = (c: string | null | undefined) => (c ?? '').trim().toLowerCase();

/** The same deal, however it is written ("2 For $3.5" is "2 for $3.50"). */
export function sameDeal(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = parseDeal(a), y = parseDeal(b);
  if (x && y) return x.qty === y.qty && Math.round(x.total * 100) === Math.round(y.total * 100);
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

export async function loadLearningSince(): Promise<Record<string, string>> {
  const row = await prisma.appConfig.findUnique({ where: { key: DEAL_LEARNING_SINCE_KEY } });
  try { return row ? JSON.parse(row.value) ?? {} : {}; } catch { return {}; }
}

export type KeptEdit = DealEdit & { productName: string; at: Date; by: string | null };

/** The changes the suggestions learn from, oldest first (the latest 2,000, after each category's "start over"). */
export async function loadDealEdits(): Promise<KeptEdit[]> {
  const [rows, since] = await Promise.all([
    prisma.dealSuggestionEdit.findMany({ orderBy: { createdAt: 'desc' }, take: 2000 }),
    loadLearningSince(),
  ]);
  return rows.reverse()
    .filter((r) => { const s = since[key(r.category)]; return !s || r.createdAt > new Date(s); })
    .map((r) => ({ category: r.category, price: r.price, suggested: r.suggested, chosen: r.chosen, productName: r.productName, at: r.createdAt, by: r.editedByName }));
}

/** Keeps the suggestions the owner changed (the ones set as suggested teach nothing new). A failure is logged: the deal is set anyway. */
export async function recordDealEdits(
  rows: { labelId: string; productName: string; category: string | null; priceText: string | null; suggested: string | null | undefined; chosen: string | null | undefined }[],
  actor: { id: string; name?: string | null },
): Promise<number> {
  const data = rows
    .filter((r) => r.suggested && r.chosen && parseDeal(r.suggested) && Number(r.priceText) > 0 && !sameDeal(r.suggested, r.chosen))
    .map((r) => ({
      labelId: r.labelId, productName: r.productName, category: r.category, price: Number(r.priceText),
      suggested: r.suggested!.trim(), chosen: r.chosen!.trim(), editedById: actor.id, editedByName: actor.name ?? null,
    }));
  if (!data.length) return 0;
  try {
    await prisma.dealSuggestionEdit.createMany({ data });
  } catch (err) {
    console.error('recordDealEdits failed', err);
    return 0;
  }
  return data.length;
}

/** What it learned, per category with changes: for the "What the suggestions learned" section of Labels > Deals. */
export function learningSummary(edits: KeptEdit[], styles: Record<string, DealStyle>, limits: DealLimits) {
  const cats = new Map<string, KeptEdit[]>();
  edits.forEach((e) => cats.set(key(e.category), [...(cats.get(key(e.category)) ?? []), e]));
  return [...cats.entries()].map(([k, list]) => {
    const st = styles[k];
    const limit = limitFor(limits, list[list.length - 1].category);
    const ranked = (Object.entries(st?.endings ?? {}) as [Ending, number][]).sort((a, b) => b[1] - a[1]);
    const top = ranked.filter(([, w], i) => i === 0 || w >= ranked[0][1] * 0.6).slice(0, 3).map(([e]) => ENDING_TEXT[e]);
    return {
      category: list[list.length - 1].category ?? '',
      changes: list.length,
      roundsTo: top,
      saving: st?.target ?? null,
      limit,
      pastLimit: st?.target != null && limit != null && st.target > limit + 0.005,
      threeUnder: st && st.threeUnder !== 1 ? st.threeUnder : null,
      recent: list.slice(-8).reverse().map((e) => ({
        productName: e.productName, price: e.price.toFixed(2), suggested: e.suggested, chosen: e.chosen, why: explainEdit(e), at: e.at, by: e.by,
      })),
    };
  }).sort((a, b) => b.changes - a.changes);
}
