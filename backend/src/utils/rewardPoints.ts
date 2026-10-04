// A reward's points from what the item sells for (2026-10-04). A point is a cent of cashback (100 points = $1, catalog.controller.ts
// takes pointsCost / 100 dollars off the balance), so a reward costs its shelf price x 100, rounded up to the next 25 points: easy
// numbers, and the owner never gives more than the shelf price ($2.29 = 250 pts, $1.99 = 200 pts).
//
// A reward linked to a Labels catalog item (RedemptionCatalogItem.labelId) follows that item's chain price: syncRewardPoints is called
// wherever a chain price changes (Labels edit, import, merge). pointsForPrice is the same in admin/src/lib/rewardPoints.ts.

import { Prisma, PrismaClient } from '@prisma/client';
import { audit } from './audit';

export const REWARD_POINT_STEP = 25;
export const REWARD_POINTS_MAX = 100_000;

/** Points for a price ("2.29", 2.29): price x 100 rounded up to the next 25. null without a usable price. */
export function pointsForPrice(price: string | number | null | undefined): number | null {
  const p = Number(price);
  if (price == null || price === '' || !Number.isFinite(p) || p <= 0) return null;
  const cents = Math.round(p * 100);
  return Math.min(REWARD_POINTS_MAX, Math.ceil(cents / REWARD_POINT_STEP) * REWARD_POINT_STEP);
}

export type RewardPointChange = { id: string; title: string; from: number; to: number; price: string };
type Db = PrismaClient | Prisma.TransactionClient;

/** Sets the points of every reward linked to these items to their price's points. Returns what changed (for the Activity Log). */
export async function syncRewardPoints(db: Db, labelIds: string[]): Promise<RewardPointChange[]> {
  if (!labelIds.length) return [];
  const rewards = await db.redemptionCatalogItem.findMany({
    where: { labelId: { in: [...new Set(labelIds)] } },
    select: { id: true, title: true, pointsCost: true, label: { select: { priceText: true } } },
  });
  const changes: RewardPointChange[] = [];
  for (const r of rewards) {
    const to = pointsForPrice(r.label?.priceText);
    if (to == null || to === r.pointsCost) continue;   // no price: the points stay as they were
    await db.redemptionCatalogItem.update({ where: { id: r.id }, data: { pointsCost: to } });
    changes.push({ id: r.id, title: r.title, from: r.pointsCost, to, price: r.label!.priceText! });
  }
  return changes;
}

/** One Activity Log line for the rewards whose points followed a price change. */
export function auditRewardSync(actor: { id: string; name?: string; role: string }, changes: RewardPointChange[], because: string): void {
  if (!changes.length) return;
  audit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'CATALOG_POINTS_FOLLOWED_PRICE', entity: 'catalog_item', entityId: changes[0].id,
    details: {
      summary: `Reward points followed the price (${because}): ${changes.slice(0, 10).map((c) => `${c.title} ${c.from.toLocaleString('en-US')} to ${c.to.toLocaleString('en-US')} pts ($${c.price})`).join('; ')}${changes.length > 10 ? `; and ${changes.length - 10} more` : ''}`,
      rewards: changes.slice(0, 200),
    },
    storeId: null,
  });
}
