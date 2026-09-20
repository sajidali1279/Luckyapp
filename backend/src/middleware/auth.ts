import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { AuthRequest, AuthUser } from '../types';
import prisma from '../config/prisma';

// Role hierarchy — higher index = more privilege
const ROLE_HIERARCHY: Role[] = [
  Role.CUSTOMER,
  Role.EMPLOYEE,
  Role.STORE_MANAGER,
  Role.SUPER_ADMIN,
  Role.DEV_ADMIN,
];

export function roleRank(role: Role): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return roleRank(userRole) >= roleRank(minRole);
}

// Verify JWT and attach user to request
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  let payload: AuthUser;
  try {
    // Only the algorithm we sign with (HS256) is accepted
    payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as AuthUser;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  // Signed with the same secret, the 10-minute PIN-reset token ({ phone, purpose }) is not a session: it has no
  // account id, and it must never be usable as one.
  if (typeof payload.id !== 'string' || (payload as unknown as { purpose?: unknown }).purpose) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  // Confirm the account still exists and hasn't been deactivated, and refresh
  // storeIds from the DB — a JWT signature alone doesn't reflect deletions,
  // deactivations, or store-assignment changes that happened after it was
  // issued (tokens are valid for up to 30 days). storeIds specifically is
  // mutable post-issuance (addUserStore/removeUserStore), and a real security
  // audit (2026-09-10) found many store-scoped routes trust req.user.storeIds
  // directly with no live requireStoreAccess check backing them up — a
  // manager removed from a store could otherwise keep acting on it for up to
  // 30 days. role is deliberately left alone here: nothing in this codebase
  // updates a user's role after account creation, so there's no equivalent
  // staleness risk to guard against there.
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { isActive: true, sessionsValidAfter: true, storeRoles: { select: { storeId: true } } },
  });
  if (!dbUser || !dbUser.isActive) {
    res.status(401).json({ success: false, error: 'Account no longer active. Please sign in again.' });
    return;
  }
  // A PIN reset ends every session issued before it, so a lost phone's session stops working. Compared in whole
  // seconds, like the token's own issue time, so signing in right after the reset is never refused.
  const issuedAt = (payload as unknown as { iat?: number }).iat;
  if (dbUser.sessionsValidAfter && (typeof issuedAt !== 'number' || issuedAt < Math.floor(dbUser.sessionsValidAfter.getTime() / 1000))) {
    res.status(401).json({ success: false, error: 'Your session has ended. Please sign in again.' });
    return;
  }

  req.user = { ...payload, storeIds: dbUser.storeRoles.map((r) => r.storeId) };
  next();
}

// Require a minimum role level
export function requireRole(minRole: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    if (!hasMinRole(req.user.role, minRole)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

// Employee/Manager can only act on stores they belong to
export async function requireStoreAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const { user } = req;
  if (!user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  // DevAdmin and SuperAdmin have access to all stores
  if (hasMinRole(user.role, Role.SUPER_ADMIN)) {
    next();
    return;
  }

  const storeId = req.params.storeId || req.body.storeId;
  if (!storeId) {
    res.status(400).json({ success: false, error: 'Store ID required' });
    return;
  }

  // Check allStoresAccess flag — grants a STORE_MANAGER chain-wide access
  // (used for the single manager who oversees all stores)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { allStoresAccess: true },
  });
  if (dbUser?.allStoresAccess) {
    next();
    return;
  }

  const access = await prisma.userStoreRole.findUnique({
    where: { userId_storeId: { userId: user.id, storeId } },
  });

  if (!access) {
    res.status(403).json({ success: false, error: 'No access to this store' });
    return;
  }

  next();
}
