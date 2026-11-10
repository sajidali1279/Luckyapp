// Item names from the stores' PDI item lists for the order list's and stock requests' name suggestions (2026-11-08): after the names the
// stores have ordered before, the PDI items whose name has every word typed, from the person's own stores (HQ: any store). Only for an
// app that asks for them (?pdi=1): an older app would show them as "0x".
import prisma from '../config/prisma';
import { appCategoryFor } from './pdiDepartments';

export interface NameSuggestion { name: string; category: string | null; count: number; source?: 'pdi' }

/** Up to `room` PDI item names matching `q`, leaving out the names already suggested. */
export async function pdiNameSuggestions(q: string, storeIds: string[] | null, already: Set<string>, room: number): Promise<NameSuggestion[]> {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 0).slice(0, 5);
  if (room <= 0 || !words.length || q.trim().length < 2) return [];
  const rows = await prisma.pdiItem.findMany({
    where: { ...(storeIds ? { storeId: { in: storeIds } } : {}), AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) },
    select: { name: true, department: true }, orderBy: { name: 'asc' }, take: 60,
  });
  const out: NameSuggestion[] = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (!key || already.has(key)) continue;
    already.add(key);
    // the category its PDI department gives, when the department is one kind of product (2026-11-11: Candy, Tobacco, Beer...)
    out.push({ name: r.name.trim(), category: appCategoryFor(r.department), count: 0, source: 'pdi' });
    if (out.length >= room) break;
  }
  return out;
}
