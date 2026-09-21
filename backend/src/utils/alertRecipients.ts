// Who is told about something that needs a decision. One place, so every alert reaches the right people and never someone who has left.

import { Role } from '@prisma/client';
import prisma from '../config/prisma';

/**
 * A sale held for review: the ACTIVE managers of that store (or with chain-wide access) and every ACTIVE Super Admin.
 * Before, every store manager and Super Admin in the chain was told about every store's flagged sale, deactivated ones included.
 */
export async function flaggedSaleRecipientIds(storeId: string): Promise<string[]> {
  const [managers, hq] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: Role.STORE_MANAGER, OR: [{ allStoresAccess: true }, { storeRoles: { some: { storeId } } }] },
      select: { id: true },
    }),
    prisma.user.findMany({ where: { isActive: true, role: Role.SUPER_ADMIN }, select: { id: true } }),
  ]);
  return [...new Set([...managers, ...hq].map((u) => u.id))];
}
