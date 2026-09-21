// Who a broadcast message goes to. One place, so the preview the admin sees and the message that is sent always count the same people.
//
// Only ACTIVE accounts: a restricted customer and a deactivated employee are not messaged. "Customers at a store" means customers with an
// approved purchase there in the last six months (before, anyone with any sale there, even one that was rejected, and however long ago).
// Anonymized ("deleted") customers are never included.

import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { excludeDeletedCustomers } from './accountDeletion';

export type BroadcastTarget = 'ALL_CUSTOMERS' | 'STORE_CUSTOMERS' | 'ALL_STAFF' | 'STORE_STAFF';
export const BROADCAST_TARGETS: BroadcastTarget[] = ['ALL_CUSTOMERS', 'STORE_CUSTOMERS', 'ALL_STAFF', 'STORE_STAFF'];
export const CUSTOMER_RECENCY_MONTHS = 6;

export interface AudienceMember { id: string; tokens: string[] }

const withTokens = { id: true, pushTokens: { select: { token: true } } } as const;
const shape = (rows: { id: string; pushTokens: { token: string }[] }[]): AudienceMember[] => rows.map((r) => ({ id: r.id, tokens: r.pushTokens.map((t) => t.token) }));

export async function resolveAudience(target: BroadcastTarget, storeId?: string, now: Date = new Date()): Promise<AudienceMember[]> {
  if (target === 'ALL_CUSTOMERS') {
    return shape(await prisma.user.findMany({ where: { role: Role.CUSTOMER, isActive: true, ...excludeDeletedCustomers }, select: withTokens }));
  }
  if (target === 'STORE_CUSTOMERS') {
    const since = new Date(now);
    since.setMonth(since.getMonth() - CUSTOMER_RECENCY_MONTHS);
    const rows = await prisma.pointsTransaction.findMany({
      where: { storeId, status: 'APPROVED', createdAt: { gte: since } },
      select: { customerId: true },
      distinct: ['customerId'],
    });
    const ids = rows.map((r) => r.customerId);
    if (ids.length === 0) return [];
    return shape(await prisma.user.findMany({ where: { id: { in: ids }, role: Role.CUSTOMER, isActive: true, ...excludeDeletedCustomers }, select: withTokens }));
  }
  if (target === 'ALL_STAFF') {
    return shape(await prisma.user.findMany({ where: { role: { in: [Role.EMPLOYEE, Role.STORE_MANAGER] }, isActive: true }, select: withTokens }));
  }
  // STORE_STAFF: the people assigned to the store, and managers with chain-wide access, who oversee every store
  return shape(await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: [Role.EMPLOYEE, Role.STORE_MANAGER] }, storeRoles: { some: { storeId } } },
        { role: Role.STORE_MANAGER, allStoresAccess: true },
      ],
    },
    select: withTokens,
  }));
}

/** People, phones (each counted once) and people with no phone signed in, for the preview and the answer. */
export function countAudience(members: AudienceMember[]) {
  const phones = new Set(members.flatMap((m) => m.tokens));
  return { people: members.length, phones: phones.size, withoutPhone: members.filter((m) => m.tokens.length === 0).length };
}

/** The plain words for a target, for sentences ("13 customers", "3 staff at Lucky Stop #4"). */
export function targetWords(target: BroadcastTarget, storeName?: string): string {
  switch (target) {
    case 'ALL_CUSTOMERS': return 'customers';
    case 'STORE_CUSTOMERS': return `customers of ${storeName ?? 'the store'}`;
    case 'ALL_STAFF': return 'staff';
    case 'STORE_STAFF': return `staff at ${storeName ?? 'the store'}`;
  }
}
