// Redemption Catalog (2026-10-04): a reward's points from what the item sells for, and the Labels catalog item a reward is.
// A point is a cent of cashback (100 pts = $1), so a reward costs its shelf price x 100, rounded up to the next 25 points ($2.29 = 250,
// $1.99 = 200). The server works the points out the same way (backend/src/utils/rewardPoints.ts) and keeps a linked reward's points
// following the item's price.

export const REWARD_POINT_STEP = 25;

/** Points for a price ("2.29", 2.29): price x 100 rounded up to the next 25. null without a usable price. */
export function pointsForPrice(price: string | number | null | undefined): number | null {
  const p = Number(price);
  if (price == null || price === '' || !Number.isFinite(p) || p <= 0) return null;
  return Math.min(100_000, Math.ceil(Math.round(p * 100) / REWARD_POINT_STEP) * REWARD_POINT_STEP);
}

/** Sure enough to offer as "the" match (a reward with no word of its name in the catalog gets none). */
export const GOOD_MATCH = 0.7;

export type RewardMatchItem = { id: string; productName: string; priceText: string | null; category: string | null };

// Words that say nothing about which product it is
const NOISE = new Set(['the', 'a', 'an', 'of', 'and', 'with', 'flavor', 'flavored', 'original', 'classic', 'snack', 'bag', 'size', 'bottle', 'can', 'pack', 'free', 'any', 'regular', 'reg']);

/** Lower case, no punctuation, sizes as one word ("20 oz" and "20oz." both "20oz", "1 liter" "1l"), brand dashes as spaces. */
function words(text: string): string[] {
  const t = text.toLowerCase()
    .replace(/['’]/g, '')
    .replace(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|ounces?|ltr|liters?|litres?|lit|l|ml|ct|count|pk)\b\.?/g, (_, n, u) => {
      const unit = /^fl/.test(u) || /^oun/.test(u) ? 'oz' : /^(ltr|lit|liter|litre|l)$/.test(u.replace(/s$/, '')) ? 'l' : /^(count|ct)$/.test(u) ? 'ct' : u;
      return ` ${Number(n)}${unit} `;
    })
    .replace(/[^a-z0-9.]+/g, ' ');
  return t.split(' ').map((w) => w.replace(/^\.+|\.+$/g, '')).filter((w) => w && !NOISE.has(w));
}
const isSize = (w: string) => /^\d+(\.\d+)?(oz|l|ml|ct|pk)$/.test(w);

/**
 * The catalog items a reward most likely is, best first, with how sure (0 to 1). The product words count most (all of the reward's
 * words in the item is a strong match); the same size adds to it, a different size takes away (a 20 oz reward is not the 2 liter).
 */
export function matchReward(title: string, catalog: RewardMatchItem[], limit = 3): { item: RewardMatchItem; score: number }[] {
  const tw = words(title);
  const tNames = tw.filter((w) => !isSize(w));
  const tSize = tw.find(isSize) ?? null;
  if (!tNames.length) return [];
  const out: { item: RewardMatchItem; score: number }[] = [];
  for (const item of catalog) {
    const iw = words(item.productName);
    const iNames = iw.filter((w) => !isSize(w));
    const iSize = iw.find(isSize) ?? null;
    // a word matches when one starts the other ("cheeto" and "cheetos", "dew" and "dew")
    const hit = (a: string, list: string[]) => list.some((b) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))));
    const found = tNames.filter((w) => hit(w, iNames)).length;
    if (!found) continue;
    const covers = found / tNames.length;                                   // how much of the reward's name is in the item
    const extra = iNames.filter((w) => !hit(w, tNames)).length / Math.max(1, iNames.length);   // the item's words the reward does not have
    let score = covers * 0.75 + (1 - extra) * 0.25;
    if (tSize && iSize) score += tSize === iSize ? 0.15 : -0.25;
    if (tSize && tSize !== iSize) score = Math.min(score, GOOD_MATCH - 0.01);   // another size (or none given) is never "the" match
    out.push({ item, score });
  }
  // sorted on the full score (a plain "Coca Cola 20oz" before "Coca Cola Cherry 20oz"), shown as 0 to 1
  return out.sort((a, b) => b.score - a.score || a.item.productName.length - b.item.productName.length).slice(0, limit)
    .map((m) => ({ item: m.item, score: Math.max(0, Math.min(1, m.score)) }));
}

