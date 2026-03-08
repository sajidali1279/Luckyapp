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
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
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

  const access = await prisma.userStoreRole.findUnique({
    where: { userId_storeId: { userId: user.id, storeId } },
  });

  if (!access) {
    res.status(403).json({ success: false, error: 'No access to this store' });
    return;
  }

  next();
}
