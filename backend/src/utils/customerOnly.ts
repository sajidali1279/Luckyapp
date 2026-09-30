// Points, credit, rewards and tier benefits are for customer accounts only. Staff accounts are made without a QR code, but an account
// that was ever a customer keeps its code, and nothing checked the role: a co-worker could have been paid by scanning it.
import { Role } from '@prisma/client';

export const NOT_A_CUSTOMER = 'That code belongs to a staff account, not a customer. Points and rewards are for customer accounts only.';

export function isCustomerAccount(user: { role: Role | string } | null | undefined): boolean {
  return !!user && user.role === Role.CUSTOMER;
}
