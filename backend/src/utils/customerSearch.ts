// The Customers page's search box and its page settings, in one place so the list and the CSV export agree.
//
// Before, a phone number only matched when it was typed as the ten digits stored ("(940) 290-2772", "+19402902772" and "1 9402902772" found
// nobody), a space around a name found nobody, "%" and "_" (wildcards in the database's LIKE) matched every customer, and a page of 0, "abc" or
// a limit of 100000 was a 500 or a request for everyone.

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { TEST_PHONE_PREFIXES } from './testAccounts';

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

// Shared by the list and the export, so "what you see is what you get" - the CSV always matches whatever
// is filtered on screen at the moment you click Export.
const FILTER_FIELDS = {
  status: z.enum(['active', 'restricted'], { message: 'status must be active or restricted.' }).optional(),
  hasBalance: z.enum(['true'], { message: 'hasBalance must be true.' }).optional(),
  hasNote: z.enum(['true'], { message: 'hasNote must be true.' }).optional(),
  joinedWithin: z.enum(['week'], { message: 'joinedWithin must be week.' }).optional(),
  hideTest: z.enum(['true'], { message: 'hideTest must be true.' }).optional(),
};

export const CUSTOMER_SORTS = ['joined_desc', 'joined_asc', 'spend_desc', 'balance_desc'] as const;
export type CustomerSort = typeof CUSTOMER_SORTS[number];

export const customerListQuery = z.object({
  search: z.string({ message: 'The search must be text.' }).max(60, 'The search is too long (60 characters at most).').optional(),
  page: whole('page').min(1, 'The page must be 1 or more.').max(100000, 'That page is out of range.').default(1),
  limit: whole('page size').min(1, 'The page size must be at least 1.').max(100, 'A page holds at most 100 customers.').default(50),
  sort: z.enum(CUSTOMER_SORTS, { message: `sort must be one of ${CUSTOMER_SORTS.join(', ')}.` }).default('joined_desc'),
  ...FILTER_FIELDS,
});

export const customerExportQuery = z.object({
  search: z.string({ message: 'The search must be text.' }).max(60, 'The search is too long (60 characters at most).').optional(),
  isActive: z.enum(['true', 'false'], { message: 'isActive must be true or false.' }).optional(),
  ...FILTER_FIELDS,
});

type CustomerFilters = {
  status?: 'active' | 'restricted';
  hasBalance?: 'true';
  hasNote?: 'true';
  joinedWithin?: 'week';
  hideTest?: 'true';
};

/** The optional filter checkboxes as where-clauses, combined with AND so they never collide with the
 * search text's own OR (name-or-phone) when merged into one where. */
export function customerFilterClauses(f: CustomerFilters): Prisma.UserWhereInput[] {
  const clauses: Prisma.UserWhereInput[] = [];
  if (f.status === 'active') clauses.push({ isActive: true });
  if (f.status === 'restricted') clauses.push({ isActive: false });
  if (f.hasBalance === 'true') clauses.push({ pointsBalance: { gt: 0 } });
  if (f.hasNote === 'true') clauses.push({ fraudNote: { not: null } });
  if (f.joinedWithin === 'week') clauses.push({ createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });
  if (f.hideTest === 'true') clauses.push({ NOT: { OR: TEST_PHONE_PREFIXES.map((p) => ({ phone: { startsWith: p } })) } });
  return clauses;
}
