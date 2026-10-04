// Shelf deals from Labels: a label with a deal ("2 for $5") is advertised in the customer app's Today's Deals at every store that carries
// it, without anyone posting it again as an offer. HQ can hide one (Label.dealHiddenInApp) on the Offers page.
//
// They are sent in the shape of a deal offer, so even an app from before this shows them in Today's Deals. Their id starts with "shelf-",
// and `source` is "SHELF", so nothing mistakes one for a real offer (it cannot be edited, ended or given results).

import prisma from '../config/prisma';
import { resolveEffectivePrice } from './labelPricing';
import { endedSaleView } from './labelSale';
import { isRestrictedCategory } from './dealSuggest';

const FAR_FUTURE = new Date('2099-12-31T23:59:59.999Z');

export async function shelfDealsForStore(storeId: string, now: Date = new Date()) {
  const labels = await prisma.label.findMany({
    where: { dealText: { not: null }, dealHiddenInApp: false, storeLabels: { some: { storeId } } },
    include: { storeLabels: { where: { storeId } } },
    orderBy: { updatedAt: 'desc' },
    take: 120,   // room for the ones left out below; the app gets 30
  });
  return labels
    // Tobacco, vape and alcohol label deals never show in the app (Google Play policy), whatever the label says
    .filter((l) => l.dealText && l.dealText.trim() && !isRestrictedCategory(l.category))
    .slice(0, 30)
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
