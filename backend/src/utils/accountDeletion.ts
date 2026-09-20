/**
 * accountDeletion.ts
 * Customer self-service account deletion, done the way the privacy policy
 * promises: personal information is removed, transaction records are
 * anonymised and kept for billing integrity.
 *
 * The user row is NOT deleted. Transactions, redemptions, ratings and hot food
 * orders reference it through RESTRICT foreign keys, so a hard delete fails for
 * any customer who has ever earned or spent anything. Instead the row is
 * scrubbed and deactivated, and everything that lists, counts or ranks
 * customers leaves it out through excludeDeletedCustomers.
 */

import { Prisma, Tier } from '@prisma/client';

// Real phones are digits only, so this can never collide with a live account.
// Rewriting the phone also frees the number to register again.
export const DELETED_PHONE_PREFIX = 'deleted-';

// Where-fragment for user queries that must not see anonymised customers.
// For queries on another model, nest it under the relation, e.g. customer: excludeDeletedCustomers.
export const excludeDeletedCustomers: Prisma.UserWhereInput = {
  NOT: { phone: { startsWith: DELETED_PHONE_PREFIX } },
};

const REMOVED_TEXT = '[removed]';

export async function anonymizeCustomerAccount(db: Prisma.TransactionClient, userId: string): Promise<void> {
  // Personal content with no business value once the person is gone
  await db.userNotification.deleteMany({ where: { userId } });
  await db.pushToken.deleteMany({ where: { userId } });
  await db.welcomeBonusClaim.deleteMany({ where: { customerId: userId } });
  await db.tierBenefitClaim.deleteMany({ where: { userId } });
  await db.productRequest.deleteMany({ where: { customerId: userId } });
  await db.businessPromotion.deleteMany({ where: { requesterId: userId } });
  await db.userStoreRole.deleteMany({ where: { userId } });

  // Records the store keeps stay, minus free text written about the person
  await db.pointsDispute.updateMany({ where: { customerId: userId }, data: { description: REMOVED_TEXT } });
  await db.hotFoodOrder.updateMany({ where: { customerId: userId }, data: { note: null } });
  await db.pointsTransaction.updateMany({ where: { customerId: userId }, data: { notes: 'ACCOUNT_DELETED' } });

  await db.user.update({
    where: { id: userId },
    data: {
      phone: `${DELETED_PHONE_PREFIX}${userId}`,
      name: 'Deleted customer',
      email: null,
      emailVerified: false,
      pinHash: null,
      pinHistory: { set: [] },
      qrCode: null,
      avatarUrl: null,
      isActive: false,
      isProfileComplete: false,
      // Unspent credit is forfeited with the account
      pointsBalance: 0,
      periodPoints: 0,
      tier: Tier.BRONZE,
      age21Confirmed: false,
      age21Declined: false,
      fraudNote: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}
