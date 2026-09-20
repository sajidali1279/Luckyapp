// Who may act on whose account: reset a PIN, deactivate, delete, change store assignments.
//
// A Dev Admin manages every account (acting on yourself is refused separately, where it makes no sense).
// Everyone else manages only accounts strictly BELOW their own role, so a Super Admin can manage store managers,
// employees and customers, but never a Dev Admin or another Super Admin. Before this rule the routes only asked
// "are you at least a Super Admin?", so any Super Admin could reset a Dev Admin's PIN and sign in as them.

import { Role } from '@prisma/client';
import { roleRank } from '../middleware/auth';

export function canManageAccount(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === Role.DEV_ADMIN) return true;
  return roleRank(actorRole) > roleRank(targetRole);
}

export const CANNOT_MANAGE_MESSAGE = 'You can only manage accounts below your own role.';
