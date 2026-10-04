// HQ's max discount per category for deal suggestions (Labels > Deals > Deal limits), kept in app_config as JSON. The sizing itself is
// utils/dealSuggest.ts. Missing or unreadable: the defaults (Candy and Snacks 12%, drinks 10%, the rest 8%, Tobacco left out).

import { z } from 'zod';
import prisma from '../config/prisma';
import { DealLimits, DEAL_LIMITS_DEFAULT } from './dealSuggest';

export const DEAL_LIMITS_KEY = 'DEAL_LIMITS';

export const dealLimitsSchema = z.object({
  defaultPct: z.number({ message: 'Give the limit for other categories as a number.' }).min(0).max(50, 'A limit can be at most 50%.'),
  categories: z.record(z.string().trim().min(1).max(100), z.number().min(0, 'A limit cannot be below 0%.').max(50, 'A limit can be at most 50%.'))
    .refine((r) => Object.keys(r).length <= 200, 'At most 200 categories.'),
  excluded: z.array(z.string().trim().min(1).max(100)).max(200),
}).transform((l) => ({
  defaultPct: Math.round(l.defaultPct * 10) / 10,
  categories: Object.fromEntries(Object.entries(l.categories).map(([k, v]) => [k.trim().toLowerCase(), Math.round(v * 10) / 10])),
  excluded: [...new Set(l.excluded.map((c) => c.trim().toLowerCase()))],
}));

export async function loadDealLimits(): Promise<DealLimits> {
  const row = await prisma.appConfig.findUnique({ where: { key: DEAL_LIMITS_KEY } });
  if (!row) return DEAL_LIMITS_DEFAULT;
  try {
    const parsed = dealLimitsSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : DEAL_LIMITS_DEFAULT;
  } catch {
    return DEAL_LIMITS_DEFAULT;
  }
}
