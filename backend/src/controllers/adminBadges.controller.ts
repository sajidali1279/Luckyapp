import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { RequestStatus } from '@prisma/client';

// ─── GET /admin/badges ─────────────────────────────────────────────────────
// One request for every "something is waiting for you" count the admin shell's sidebar badges and command
// palette bell need, instead of the 13 separate pending/unread-count requests the admin used to fire on
// every page load (docs/confidential/admin-audit/02-shell.md, finding #12 and batch S3). Kept alongside the
// original 13 routes rather than replacing them, in case anything else still calls one directly.
//
// DEV_ADMIN and SUPER_ADMIN only (the route requires it): the admin web is web-admin-only for these two
// roles (Store Manager and Employee are mobile-only), so every count below always takes the "every active
// store" branch the original functions used for these roles, never the "only my assigned stores" branch a
// Store Manager caller would have taken.
//
// Each count below reproduces its own original controller's exact where-clause, not an approximation, so a
// number here never drifts from what that page's own dedicated endpoint would still say.
export async function getAdminBadgeCounts(req: AuthRequest, res: Response) {
  const user = req.user!;
  const isDevAdmin = user.role === 'DEV_ADMIN';

  const activeStores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
  const storeIds = activeStores.map((s) => s.id);

  if (storeIds.length === 0) {
    res.json({
      success: true,
      data: {
        transactionsPendingCount: 0, disputesPendingCount: 0, requestsPendingCount: 0, chatUnreadCount: 0,
        schedulingPendingCount: 0, promotionsPendingCount: 0, hotFoodPendingCount: 0, categoriesPendingCount: 0,
        billingPendingCount: 0, careersNewCount: 0, supportUnread: 0,
      },
    });
    return;
  }

  // chat.controller.ts getUnreadCount needs this admin's own last-read-per-store before it can count unread
  // messages, so it runs as its own two-step query rather than folding into the flat Promise.all below.
  const chatUnreadPromise = (async () => {
    const chatReads = await prisma.chatRead.findMany({
      where: { userId: user.id, storeId: { in: storeIds } },
      select: { storeId: true, lastReadAt: true },
    });
    const readMap = new Map(chatReads.map((r) => [r.storeId, r.lastReadAt]));
    return prisma.chatMessage.count({
      where: {
        userId: { not: user.id },
        OR: storeIds.map((storeId) => ({ storeId, createdAt: { gt: readMap.get(storeId) ?? new Date(0) } })),
      },
    });
  })();

  const [
    transactionsPendingCount,
    disputesPendingCount,
    storeRequestsCount,
    productRequestsCount,
    itemRequestsCount,
    chatUnreadCount,
    schedulingPendingCount,
    promotionsPendingCount,
    hotFoodPendingCount,
    categoriesPendingCount,
    unpaidPeriods,
    careersNewCount,
    supportUnread,
  ] = await Promise.all([
    // points.controller.ts getTransactionsPendingCount
    prisma.pointsTransaction.count({ where: { storeId: { in: storeIds }, status: { in: ['PENDING', 'FLAGGED'] } } }),
    // dispute.controller.ts getPendingDisputeCount
    prisma.pointsDispute.count({ where: { status: 'PENDING' } }),
    // storeRequest.controller.ts getPendingCount
    prisma.storeRequest.count({ where: { storeId: { in: storeIds }, status: 'PENDING' } }),
    // productRequest.controller.ts getPendingProductRequestCount
    prisma.productRequest.count({ where: { storeId: { in: storeIds }, status: 'PENDING', expiresAt: { gte: new Date() } } }),
    // employeeRequest.controller.ts getItemRequestsPendingCount (admin branch)
    prisma.employeeItemRequest.count({ where: { status: 'PENDING' } }),
    chatUnreadPromise,
    // schedule.controller.ts getRequestsPendingCount
    prisma.shiftRequest.count({ where: { storeId: { in: storeIds }, status: RequestStatus.PENDING } }),
    // promotions.controller.ts getPendingPromotionCount — DevAdmin's own review queue only
    isDevAdmin ? prisma.businessPromotion.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    // hotFood.controller.ts getAdminPendingCount
    prisma.hotFoodOrder.count({ where: { status: 'PENDING' } }),
    // orderCategory.controller.ts getPendingCategoryCount — DevAdmin's own review queue only
    isDevAdmin ? prisma.orderCategory.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    // billing.controller.ts getBillingPendingCount
    prisma.billingRecord.findMany({ where: { isPaid: false }, select: { period: true }, distinct: ['period'] }),
    // careers.controller.ts getNewApplicationCount
    prisma.jobApplication.count({ where: { status: 'NEW' } }),
    // support.controller.ts getUnreadCount — a DevAdmin sees every non-DevAdmin sender; anyone else (here,
    // always a SuperAdmin) sees only replies on threads they themselves started
    isDevAdmin
      ? prisma.supportMessage.count({ where: { isRead: false, senderRole: { not: 'DEV_ADMIN' } } })
      : prisma.supportMessage.count({ where: { isRead: false, senderRole: 'DEV_ADMIN', thread: { fromUserId: user.id } } }),
  ]);

  res.json({
    success: true,
    data: {
      transactionsPendingCount,
      disputesPendingCount,
      requestsPendingCount: storeRequestsCount + productRequestsCount + itemRequestsCount,
      chatUnreadCount,
      schedulingPendingCount,
      promotionsPendingCount,
      hotFoodPendingCount,
      categoriesPendingCount,
      billingPendingCount: unpaidPeriods.length,
      careersNewCount,
      supportUnread,
    },
  });
}
