import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { hasMinRole } from '../middleware/auth';

// Whether someone may use a store's staff tools (chat, alerts, requests): HQ, a manager over all stores (allStoresAccess), or anyone
// assigned to that store. The same rule as requireStoreAccess, for handlers where the store comes from a record, not the address.
// Several handlers kept their own copy that forgot the all-stores manager, who was then refused at every store not assigned to them.
export async function canUseStore(userId: string, role: Role | string, storeId: string): Promise<boolean> {
  if (hasMinRole(role as Role, Role.SUPER_ADMIN)) return true;
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { allStoresAccess: true } });
  if (me?.allStoresAccess) return true;
  return !!(await prisma.userStoreRole.findUnique({ where: { userId_storeId: { userId, storeId } } }));
}

// Every store someone may use: all active stores for HQ and the all-stores manager, otherwise their own
export async function usableStoreIds(userId: string, role: Role | string): Promise<string[]> {
  const all = hasMinRole(role as Role, Role.SUPER_ADMIN)
    || !!(await prisma.user.findUnique({ where: { id: userId }, select: { allStoresAccess: true } }))?.allStoresAccess;
  if (all) return (await prisma.store.findMany({ where: { isActive: true }, select: { id: true } })).map((s) => s.id);
  return (await prisma.userStoreRole.findMany({ where: { userId }, select: { storeId: true } })).map((r) => r.storeId);
}
