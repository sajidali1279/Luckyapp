import { OfferType } from '@prisma/client';
import { getTierBonusRate } from './tier';

// Which promotion applies to a sale. Only one can, so the rule has to give the same answer whatever order the
// database returns the rows in (it used to take the first row it saw, and the same $40 sale earned $4.00 or $2.80):
//   1. the most specific category: a promotion for this sale's category beats an all-category one
//   2. then the store's own promotion beats the chain-wide one
//   3. then the larger bonus for THIS sale (a percentage is worth amount x rate, cents per gallon is gallons x cents)
//   4. then the newer one, then the id, so an exact tie still has one answer

export interface PickableOffer {
  id?: string;
  title: string;
  type: OfferType;
  storeId: string | null;
  category: string | null;
  bonusRate: number | null;
  tierBonusRates: unknown;
  gasBonusCentsPerGallon: number | null;
  createdAt?: Date;
}

export interface SaleContext {
  storeId: string;
  category: string;
  tier: string;
  purchaseAmount: number;
  gallons: number | null;
}

/** True when the promotion pays cents per gallon. Its percentage (if an old row still carries one) is ignored. */
export function isCentsPerGallon(o: { gasBonusCentsPerGallon: number | null }): boolean {
  return o.gasBonusCentsPerGallon != null;
}

/** The percentage this promotion adds for a customer of the tier. Zero for a cents-per-gallon promotion. */
export function percentBonus(o: PickableOffer, tier: string): number {
  return isCentsPerGallon(o) ? 0 : getTierBonusRate(o, tier);
}

/** What the promotion would add to this sale, in dollars. */
export function promotionValue(o: PickableOffer, sale: SaleContext): number {
  if (isCentsPerGallon(o)) return sale.gallons != null ? (sale.gallons * (o.gasBonusCentsPerGallon as number)) / 100 : 0;
  return sale.purchaseAmount * percentBonus(o, sale.tier);
}

function isOwnStore(o: PickableOffer, storeId: string): boolean {
  return o.type === OfferType.SPECIFIC_STORE && o.storeId === storeId;
}

export function pickOffer(offers: PickableOffer[], sale: SaleContext): PickableOffer | null {
  const applies = offers.filter((o) =>
    (o.bonusRate !== null || o.gasBonusCentsPerGallon !== null || o.tierBonusRates != null) &&
    (o.type === OfferType.ALL_STORES || o.storeId === sale.storeId),
  );
  const pool = applies.filter((o) => o.category === sale.category);
  const candidates = pool.length > 0 ? pool : applies.filter((o) => o.category === null);
  if (candidates.length === 0) return null;

  const rank = (o: PickableOffer) => ({
    own: isOwnStore(o, sale.storeId) ? 1 : 0,
    value: promotionValue(o, sale),
    made: o.createdAt ? o.createdAt.getTime() : 0,
    id: o.id ?? o.title,
  });
  return [...candidates].sort((a, b) => {
    const x = rank(a); const y = rank(b);
    if (x.own !== y.own) return y.own - x.own;
    if (Math.abs(x.value - y.value) > 1e-9) return y.value - x.value;
    if (x.made !== y.made) return y.made - x.made;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  })[0];
}
