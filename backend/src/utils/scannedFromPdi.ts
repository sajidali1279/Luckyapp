// Every product in the stores' PDI item lists in Scanned products (2026-11-11, the owner: "add all the items into the scanned products
// ignoring the duplicated"). Scanned products is the app's barcode-to-name book: the order list, stock requests, Labels and the manager's
// Store catalog look a scan up there first. A product already in it (scanned by staff, from Open Food Facts, or named from PDI on a scan)
// is left exactly as it is; the rest are added with PDI's name and, for a department that is one kind of product, its category. Run by
// HQ's button and after every PDI list upload (new items). Lottery tickets, PDI's test department and a store's own short codes (padded,
// not a product barcode) are left out. Nothing here makes a shelf label: only a person saving a scan does that (utils/labelSync.ts).
import prisma from '../config/prisma';
import { getCatalog } from './itemCatalog';
import { pdiKey } from './pdiItemList';
import { appCategoryFor } from './pdiDepartments';

const CHUNK = 2000;
const LEFT_OUT = new Set(['LOTTERY', 'TEST']);

export interface ScannedFill { added: number; already: number; leftOut: number }

export async function addPdiToScanned(): Promise<ScannedFill> {
  const cat = await getCatalog();
  const existing = await prisma.scannedProduct.findMany({ select: { barcode: true } });
  const have = new Set(existing.map((e) => pdiKey(e.barcode)));
  const out: ScannedFill = { added: 0, already: 0, leftOut: 0 };
  const rows: { barcode: string; name: string; category: string | null; source: string; scanCount: number }[] = [];
  for (const p of cat.products) {
    if (/^0000/.test(p.code) || !/^\d{11,13}$/.test(p.code) || LEFT_OUT.has(p.kind ?? '') || p.prices.some((x) => LEFT_OUT.has(x.kind ?? ''))) { out.leftOut++; continue; }
    if (have.has(p.key)) { out.already++; continue; }
    have.add(p.key);
    const name = p.name.trim().slice(0, 200);
    if (!name) { out.leftOut++; continue; }
    rows.push({ barcode: p.upc, name, category: appCategoryFor(p.department) ?? (p.kind === 'TOBACCO' ? 'Tobacco' : null), source: 'pdi', scanCount: 0 });
  }
  for (let i = 0; i < rows.length; i += CHUNK) {
    const r = await prisma.scannedProduct.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    out.added += r.count;
  }
  out.already += rows.length - out.added;   // added by someone else in the meantime
  return out;
}
