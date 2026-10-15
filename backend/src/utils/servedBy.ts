// HQ's Grant & Redeem page (2026-10-15): an employee with no phone sends HQ photos of the customer's QR and the receipt, and HQ enters
// the sale or redemption on the admin site for them. HQ names the employee who served the customer: a sale records them as servedById
// (their sales counts and the customer's rating go to them), and the Activity Log names them on every action. Only HQ may name someone
// else; the cashier's own app never sends it, and a cashier who tries is refused.
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { hasMinRole } from '../middleware/auth';
import { canUseStore } from './storeAccess';
import { AuthUser } from '../types';

export type ServedBy = { id: string; name: string | null };
export type ServedByResult = { ok: true; servedBy: ServedBy | null } | { ok: false; status: number; error: string };

const STAFF_ROLES: string[] = [Role.EMPLOYEE, Role.STORE_MANAGER];

/** The employee HQ named (body field servedById), checked: an active employee or store manager who works at this store. None named = null. */
export async function resolveServedBy(actor: AuthUser, servedById: unknown, storeId: string | null | undefined): Promise<ServedByResult> {
  if (servedById === undefined || servedById === null || servedById === '') return { ok: true, servedBy: null };
  if (!hasMinRole(actor.role, Role.SUPER_ADMIN)) return { ok: false, status: 403, error: 'Only HQ can enter a sale or redemption for another employee.' };
  if (typeof servedById !== 'string' || servedById.length > 64) return { ok: false, status: 400, error: 'Pick the employee who served the customer.' };
  const staff = await prisma.user.findUnique({ where: { id: servedById }, select: { id: true, name: true, role: true, isActive: true } });
  if (!staff || !STAFF_ROLES.includes(staff.role)) return { ok: false, status: 400, error: 'That person is not an employee or store manager. Pick the employee who served the customer.' };
  const who = staff.name || 'That employee';
  if (!staff.isActive) return { ok: false, status: 400, error: `${who} is switched off. Pick an active employee.` };
  if (storeId && !(await canUseStore(staff.id, staff.role, storeId))) {
    return { ok: false, status: 400, error: `${who} does not work at that store. Pick someone from that store, or add them to it on the Staff page.` };
  }
  return { ok: true, servedBy: { id: staff.id, name: staff.name } };
}

/** What the Activity Log keeps about it: who served, and that HQ entered it */
export function servedByDetails(s: ServedBy | null): Record<string, unknown> {
  return s ? { servedById: s.id, servedByName: s.name, enteredByHQ: true } : {};
}

/** The active employees and store managers who can work at a store: the "Served by" list on the page */
export async function storeStaff(storeId: string): Promise<{ id: string; name: string | null; phone: string; role: string }[]> {
  return prisma.user.findMany({
    where: {
      role: { in: [Role.EMPLOYEE, Role.STORE_MANAGER] }, isActive: true,
      OR: [{ storeRoles: { some: { storeId } } }, { allStoresAccess: true }],
    },
    select: { id: true, name: true, phone: true, role: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
}
