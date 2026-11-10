// Receipt lines checked against the store's PDI item list (2026-11-07). The register prints PDI's own item names, cut to about 19
// letters, so a line can be found in the store's list by its name. PDI's departments are broad (GROC holds coffee, milk and frozen pizza
// alike), so they only settle what they are sure of; every other line keeps the reader's category:
//   tobacco -> TOBACCO and alcohol -> ALCOHOL (both earn the tier's base rate, as Other), hot food -> HOT_FOODS, ice cream -> FROZEN_FOODS,
//   propane -> OTHER, lottery -> NOT_ELIGIBLE; and a line the reader called tobacco or alcohol that PDI files as groceries is GROCERIES.
//   Which department is which, in both the Texas and the Oklahoma naming styles, is in utils/pdiDepartments.ts (2026-11-10).
// On 39 real scans the reader once called "CROWNS LIGHT LONG" (cigarettes) alcohol, and a few names matched another product by a short
// prefix: so a line is matched only by its whole name, or as the start of PDI names when it is long enough to have been cut off, and only
// when every item it can be is in the same department.
import prisma from '../config/prisma';
import type { ReadCategory, ReceiptRead } from './receiptScan';
import { departmentKind, deptKey, type DepartmentKind } from './pdiDepartments';

/** What a kind of PDI department settles about a receipt line (GROCERY only corrects a line read as tobacco or alcohol). */
const DECISIVE: Partial<Record<DepartmentKind, ReadCategory>> = { TOBACCO: 'TOBACCO', ALCOHOL: 'ALCOHOL', HOT_FOOD: 'HOT_FOODS', FROZEN: 'FROZEN_FOODS', PROPANE: 'OTHER', LOTTERY: 'NOT_ELIGIBLE' };

/** A name as the register and PDI both might write it: capitals, letters and digits, single spaces ("CROWNS $.35FF 100 G" -> "CROWNS 35FF 100 G"). */
export const nameKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// a name this long on the receipt may have been cut off by the register, so PDI names that start with it count
const CUT_AT = 12;

/** The one department a receipt line's name belongs to in this list, or null (not found, or it could be items in different departments). */
export function departmentOf(name: string, list: { key: string; department: string | null }[]): string | null {
  const k = nameKey(name);
  if (k.length < 3) return null;
  let hits = list.filter((i) => i.key === k);
  if (!hits.length && k.length >= CUT_AT) hits = list.filter((i) => i.key.startsWith(k));
  const depts = new Set(hits.map((h) => deptKey(h.department)).filter(Boolean));
  return depts.size === 1 ? [...depts][0] : null;
}

/** The reading with each line's category settled by the store's PDI list where it is sure; the reader's own category is kept on the line
 *  (aiCategory) when PDI changes it. Pure: the list is passed in. */
export function settleCategories(read: ReceiptRead, list: { name: string; department: string | null }[]): ReceiptRead {
  if (!list.length || !read.items?.length) return read;
  const keyed = list.map((i) => ({ key: nameKey(i.name), department: i.department }));
  const items = read.items.map((it) => {
    if (!it?.name || it.prepay || it.category === 'NOT_ELIGIBLE' || it.category === 'GAS' || it.category === 'DIESEL') return it;
    const dept = departmentOf(it.name, keyed);
    if (!dept) return it;
    // a lottery department in PDI never earns (2026-11-08)
    const kind = departmentKind(dept);
    const settled = (kind && DECISIVE[kind]) ?? (kind === 'GROCERY' && (it.category === 'TOBACCO' || it.category === 'ALCOHOL') ? 'GROCERIES' : null);
    return settled && settled !== it.category ? { ...it, category: settled, aiCategory: it.category, pdiDepartment: dept } : { ...it, pdiDepartment: dept };
  });
  return { ...read, items };
}

/** The reading settled against this store's PDI list (unchanged when the store has none uploaded yet). */
export async function withPdiCategories(storeId: string, read: ReceiptRead): Promise<ReceiptRead> {
  if (!read.items?.length) return read;
  const list = await prisma.pdiItem.findMany({ where: { storeId }, select: { name: true, department: true } });
  return settleCategories(read, list);
}
