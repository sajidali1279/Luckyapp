// Shelf deals from Labels: a label with a deal ("2 for $5") is advertised in the customer app's Today's Deals at every store that carries
// it, without anyone posting it again as an offer. HQ can hide one (Label.dealHiddenInApp) on the Offers page.
//
// They are sent in the shape of a deal offer, so even an app from before this shows them in Today's Deals. Their id starts with "shelf-",
// and `source` is "SHELF", so nothing mistakes one for a real offer (it cannot be edited, ended or given results).

import prisma from '../config/prisma';
import { resolveEffectivePrice } from './labelPricing';
import { endedSaleView } from './labelSale';
import { isRestrictedCategory } from './dealSuggest';
import { rule } from './appSettings';

const FAR_FUTURE = new Date('2099-12-31T23:59:59.999Z');

/** How many label deals a store shows: HQ's number (Settings > Rewards & offers > Promotions, 2026-10-18); it was a fixed 30. */
export const shelfDealsPerStore = () => rule('shelfDealsPerStore');

export async function shelfDealsForStore(storeId: string, now: Date = new Date()) {
  const most = shelfDealsPerStore();
  if (most <= 0) return [];
  const labels = await prisma.label.findMany({
    where: { dealText: { not: null }, dealHiddenInApp: false, storeLabels: { some: { storeId } } },
    include: { storeLabels: { where: { storeId } } },
    orderBy: { updatedAt: 'desc' },
    take: most + 90,   // room for the ones left out below
  });
  return labels
    // Tobacco, vape and alcohol label deals never show in the app (Google Play policy), whatever the label says
    .filter((l) => l.dealText && l.dealText.trim() && !isRestrictedCategory(l.category))
    .slice(0, most)
    .map((l) => {
      const price = resolveEffectivePrice(l, endedSaleView(l.storeLabels[0] ?? null, now));
      return {
        id: `shelf-${l.id}`,
        source: 'SHELF',
        labelId: l.id,
        title: l.productName,
        description: '',
        regularPrice: price,   // the app words it ("Regular price $2.79", in English or Spanish)
        dealText: l.dealText!.trim(),
        imageUrl: null,
        type: 'SPECIFIC_STORE',
        storeId,
        category: null,
        bonusRate: null,
        tierBonusRates: null,
        gasBonusCentsPerGallon: null,
        requires21: false,
        startDate: l.updatedAt,
        endDate: FAR_FUTURE,
        isActive: true,
        onNow: true,
        hoursText: null,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        store: null,
      };
    });
}

/**
 * For HQ's list (2026-10-18): at how many active stores each label deal is in the app right now. A store shows only its first
 * shelfDealsPerStore() label deals (most recently changed first, not hidden, not tobacco or alcohol), so a deal can be allowed and still
 * not show anywhere. Same order and rules as shelfDealsForStore.
 */
export async function shelfDealsShownAt(): Promise<{ shownAt: Map<string, number>; stores: number; perStore: number }> {
  const most = shelfDealsPerStore();
  const rows = await prisma.storeLabel.findMany({
    where: { store: { isActive: true }, label: { dealText: { not: null }, dealHiddenInApp: false } },
    select: { storeId: true, label: { select: { id: true, dealText: true, category: true, updatedAt: true } } },
  });
  const byStore = new Map<string, { id: string; at: number }[]>();
  for (const r of rows) {
    if (!r.label.dealText?.trim() || isRestrictedCategory(r.label.category)) continue;
    const list = byStore.get(r.storeId) ?? [];
    list.push({ id: r.label.id, at: r.label.updatedAt.getTime() });
    byStore.set(r.storeId, list);
  }
  const shownAt = new Map<string, number>();
  for (const list of byStore.values()) {
    list.sort((a, b) => b.at - a.at);
    for (const l of list.slice(0, Math.max(0, most))) shownAt.set(l.id, (shownAt.get(l.id) ?? 0) + 1);
  }
  const stores = await prisma.store.count({ where: { isActive: true } });
  return { shownAt, stores, perStore: most };
}

