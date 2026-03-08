import { Role } from '@prisma/client';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  phone: string;
  role: Role;
  storeIds?: string[];  // Stores this employee/manager belongs to
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
