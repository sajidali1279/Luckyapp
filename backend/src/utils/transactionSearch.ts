// The Transactions page's search box: one text box that finds a sale by the customer's name or phone, the
// cashier's name or phone, or the transaction's own id (what a support conversation usually has to go on:
// "a customer says they got no points"). Mirrors customerSearch.ts's own phone-normalizing, wildcard-safe
// approach so the two pages behave the same way.

import { Prisma } from '@prisma/client';

export function transactionSearchWhere(raw: string): Prisma.PointsTransactionWhereInput {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  const q = trimmed.replace(/[%_\\]/g, ''); // wildcards in LIKE must not act as wildcards
  if (q === '') return { id: { in: [] } }; // text that was only wildcard characters: match no one, not everyone
  const digits = q.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  const or: Prisma.PointsTransactionWhereInput[] = [
    { id: { contains: q, mode: 'insensitive' } },
    { customer:  { name: { contains: q, mode: 'insensitive' } } },
    { grantedBy: { name: { contains: q, mode: 'insensitive' } } },
  ];
  if (ten.length > 0) {
    or.push({ customer:  { phone: { contains: ten } } });
    or.push({ grantedBy: { phone: { contains: ten } } });
  }
  return { OR: or };
}
