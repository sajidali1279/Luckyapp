// The Customers page's search box and its page settings, in one place so the list and the CSV export agree.
//
// Before, a phone number only matched when it was typed as the ten digits stored ("(940) 290-2772", "+19402902772" and "1 9402902772" found
// nobody), a space around a name found nobody, "%" and "_" (wildcards in the database's LIKE) matched every customer, and a page of 0, "abc" or
// a limit of 100000 was a 500 or a request for everyone.

import { Prisma } from '@prisma/client';
import { z } from 'zod';

/**
 * A where-fragment for the search text: part of a name in any case, or a phone number written any way (brackets, dashes, spaces, "+1", a
 * leading 1). Empty text means everyone; text that is only wildcard characters means no one, not everyone.
 */
export function customerSearchWhere(raw: string): Prisma.UserWhereInput {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  const q = trimmed.replace(/[%_\\]/g, ''); // wildcards in LIKE: they must not act as wildcards, and no name or phone holds one
  if (q === '') return { id: { in: [] } };
  const digits = q.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const or: Prisma.UserWhereInput[] = [{ name: { contains: q, mode: 'insensitive' } }];
  if (ten.length > 0) or.push({ phone: { contains: ten } });
  return { OR: or };
}

const whole = (what: string) => z.coerce.number({ message: `The ${what} must be a number.` }).int(`The ${what} must be a whole number.`);

export const customerListQuery = z.object({
  search: z.string({ message: 'The search must be text.' }).max(60, 'The search is too long (60 characters at most).').optional(),
  page: whole('page').min(1, 'The page must be 1 or more.').max(100000, 'That page is out of range.').default(1),
  limit: whole('page size').min(1, 'The page size must be at least 1.').max(100, 'A page holds at most 100 customers.').default(50),
});

export const customerExportQuery = z.object({
  search: z.string({ message: 'The search must be text.' }).max(60, 'The search is too long (60 characters at most).').optional(),
  isActive: z.enum(['true', 'false'], { message: 'isActive must be true or false.' }).optional(),
});
