// Customer receipt scanning (2026-10-11, in testing). The customer photographs their paper receipt; AI reads it; the checks below decide
// whether it can be a sale; one that passes becomes held sales (one per category) that a manager or HQ approves like any held sale, so
// nothing is credited without a person looking while this is tested. HQ decides who can use it: off, test accounts only, or everyone.
import prisma from '../config/prisma';
import { ProductCategory } from '@prisma/client';

// ── Who can use it ───────────────────────────────────────────────────────────

export const RECEIPT_SCAN_KEY = 'RECEIPT_SCAN';
export type ScanMode = 'OFF' | 'TEST' | 'ALL';
export interface ScanSettings { mode: ScanMode; testPhones: string[] }
export const SCAN_DEFAULTS: ScanSettings = { mode: 'OFF', testPhones: [] };

/** The last 10 digits: "+1 (650) 555-0123", "6505550123" and "16505550123" are the same phone. */
export const phoneKey = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);

export async function loadScanSettings(): Promise<ScanSettings> {
  const row = await prisma.appConfig.findUnique({ where: { key: RECEIPT_SCAN_KEY } });
  if (!row) return SCAN_DEFAULTS;
  try {
    const v = JSON.parse(row.value);
    const mode: ScanMode = ['OFF', 'TEST', 'ALL'].includes(v?.mode) ? v.mode : 'OFF';
    const testPhones = Array.isArray(v?.testPhones) ? v.testPhones.map(String).map(phoneKey).filter((x: string) => x.length === 10) : [];
    return { mode, testPhones };
  } catch { return SCAN_DEFAULTS; }
}

/** Whether this customer may scan receipts now. */
export function canScan(settings: ScanSettings, user: { phone?: string | null; role: string }): boolean {
  if (user.role !== 'CUSTOMER') return false;
  if (settings.mode === 'ALL') return true;
  if (settings.mode === 'TEST') return settings.testPhones.includes(phoneKey(user.phone));
  return false;
}

// ── What the AI reads ────────────────────────────────────────────────────────

/** The categories the reader may give a line. Lottery, money orders, gift cards and the like earn nothing. */
export const READ_CATEGORIES = ['GROCERIES', 'FROZEN_FOODS', 'FRESH_FOODS', 'GAS', 'DIESEL', 'HOT_FOODS', 'TOBACCO', 'ALCOHOL', 'NOT_ELIGIBLE', 'OTHER'] as const;
export type ReadCategory = typeof READ_CATEGORIES[number];

export interface ReceiptRead {
  isReceipt: boolean;
  merchantName: string | null; storeNumber: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null;
  date: string | null; time: string | null;            // "YYYY-MM-DD", "HH:MM" (24 h), as printed
  receiptNumber: string | null;
  subtotal: number | null; tax: number | null; total: number | null;
  items: { name: string; amount: number; category: ReadCategory; gallons: number | null }[];
  readable: 'good' | 'partial' | 'poor';
  concerns: string[];
}

export const READ_PROMPT = `This should be a photo of a paper receipt from a Lucky Stop gas station / convenience store in Texas.
Read it carefully and return ONLY a JSON object (no markdown, no explanation) with exactly these fields:
{
  "isReceipt": true or false (false if this is not a store receipt, e.g. a screenshot, a hand-written note, or something else),
  "merchantName": the store name as printed, or null,
  "storeNumber": the store number if printed (e.g. "4" from "Lucky Stop #4" or "Store 0004"), or null,
  "address": the street address line, or null, "city": or null, "state": two letters or null, "zip": 5 digits or null,
  "phone": the store phone as printed, or null,
  "date": the sale date as "YYYY-MM-DD", or null, "time": the sale time as 24-hour "HH:MM", or null,
  "receiptNumber": the transaction / receipt / ticket / sequence number, or null,
  "subtotal": number or null, "tax": number or null, "total": the amount paid as a number, or null,
  "items": one entry per sold line: {"name": as printed, "amount": the line amount as a number (positive; a refund or discount line negative),
    "category": one of GROCERIES (packaged food, snacks, drinks, candy, household), FROZEN_FOODS, FRESH_FOODS (fruit, sandwiches, dairy),
    GAS (gasoline), DIESEL, HOT_FOODS (food made in store: chicken, tenders, burritos, pizza, taquitos, corn dogs, coffee),
    TOBACCO (cigarettes, cigars, vapes), ALCOHOL (beer, wine), NOT_ELIGIBLE (lottery, money order, gift card, prepaid card, bill payment,
    cash back, deposit, fee), OTHER,
    "gallons": the gallons for a fuel line, else null},
  "readable": "good" if everything above was clear, "partial" if some of it was cut off or blurry, "poor" if most of it could not be read,
  "concerns": a list of short notes about anything suspicious: the numbers look edited or written over, it is a photo of a screen,
    several receipts in one photo, the total does not match the lines, the receipt is cut off; [] when nothing looks wrong
}
Read only what is printed. Never guess a number: use null when you cannot read it.`;

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(/[$,\s]/g, '')))) return Math.round(Number(v.replace(/[$,\s]/g, '')) * 100) / 100;
  return null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
const realDate = (d: string | null) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, m, day] = d.split('-').map(Number);
  const u = new Date(Date.UTC(y, m - 1, day));
  return u.getUTCFullYear() === y && u.getUTCMonth() === m - 1 && u.getUTCDate() === day ? d : null;
};
const realTime = (t: string | null) => {
  const m = (t ?? '').match(/^(\d{1,2}):(\d{2})$/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

/** The reader's answer, made safe: anything missing or odd becomes null, never a guess. Null when there is no JSON object at all. */
export function parseRead(text: string): ReceiptRead | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: any;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const date = str(o.date); const time = str(o.time);
  return {
    isReceipt: o.isReceipt === true,
    merchantName: str(o.merchantName), storeNumber: str(o.storeNumber),
    address: str(o.address), city: str(o.city), state: str(o.state), zip: str(o.zip), phone: str(o.phone),
    date: realDate(date),
    time: realTime(time),
    receiptNumber: str(o.receiptNumber),
    subtotal: num(o.subtotal), tax: num(o.tax), total: num(o.total),
    items: (Array.isArray(o.items) ? o.items : []).slice(0, 80).map((it: any) => ({
      name: str(it?.name) ?? '',
      amount: num(it?.amount) ?? 0,
      category: (READ_CATEGORIES as readonly string[]).includes(it?.category) ? it.category : 'OTHER',
      gallons: num(it?.gallons),
    })).filter((it: { name: string; amount: number }) => it.name || it.amount),
    readable: ['good', 'partial', 'poor'].includes(o.readable) ? o.readable : 'poor',
    concerns: (Array.isArray(o.concerns) ? o.concerns : []).map(str).filter(Boolean).slice(0, 10) as string[],
  };
}

// ── Which Lucky Stop ─────────────────────────────────────────────────────────

export interface StoreForMatch { id: string; name: string; address: string | null; city: string | null; zipCode: string | null; phone: string | null; isActive: boolean }

const words = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const storeNo = (s: string | null | undefined) => { const m = (s ?? '').match(/(\d+)/); return m ? String(Number(m[1])) : null; };

/**
 * The store the receipt is from, by what is printed on it: the phone number, the street (number and name) with the zip, or the store
 * number with the city or zip. Null when nothing is clear enough, or two stores fit equally.
 */
export function matchStore(read: ReceiptRead, stores: StoreForMatch[]): StoreForMatch | null {
  const phone = phoneKey(read.phone);
  const zip = (read.zip ?? '').slice(0, 5);
  const addr = words(read.address);
  const number = storeNo(read.storeNumber);
  const city = (read.city ?? '').toLowerCase().trim();
  const scored = stores.filter((s) => s.isActive).map((s) => {
    let score = 0;
    if (phone.length === 10 && phoneKey(s.phone) === phone) score += 10;
    const sAddr = words(s.address);
    const sameStreetNumber = addr[0] && sAddr[0] && /^\d+$/.test(addr[0]) && addr[0] === sAddr[0];
    const sharedWords = addr.filter((w) => w.length > 2 && sAddr.includes(w)).length;
    if (sameStreetNumber && sharedWords >= 1) score += 6;
    if (zip && s.zipCode && s.zipCode.slice(0, 5) === zip) score += 3;
    if (number && storeNo(s.name) === number) score += 4;
    if (city && (s.city ?? '').toLowerCase() === city) score += 1;
    return { s, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 7) return null;                    // e.g. phone alone (10), street + zip (9), store number + zip (7)
  if (scored[1] && scored[1].score === best.score) return null;  // two stores fit the same: do not guess
  return best.s;
}

// ── From the lines to sales ──────────────────────────────────────────────────

export interface SaleLine { category: ProductCategory; amount: number; gallons: number | null }

/**
 * The amount per Lucky Stop category: tobacco and alcohol are OTHER; NOT_ELIGIBLE lines earn nothing; a category the store does not
 * give points on is left out. Negative lines (discounts) reduce their category. Gas and diesel keep their gallons.
 */
export function saleLines(read: ReceiptRead, storeCategories: ProductCategory[]): { lines: SaleLine[]; leftOut: string[] } {
  const by = new Map<ProductCategory, { amount: number; gallons: number }>();
  const leftOut: string[] = [];
  for (const it of read.items) {
    if (it.category === 'NOT_ELIGIBLE') { leftOut.push(it.name || 'a line'); continue; }
    const cat = (it.category === 'TOBACCO' || it.category === 'ALCOHOL' ? 'OTHER' : it.category) as ProductCategory;
    if (storeCategories.length > 0 && !storeCategories.includes(cat)) { leftOut.push(it.name || 'a line'); continue; }
    const cur = by.get(cat) ?? { amount: 0, gallons: 0 };
    cur.amount += it.amount; cur.gallons += it.gallons ?? 0;
    by.set(cat, cur);
  }
  const lines = [...by.entries()]
    .map(([category, v]) => ({ category, amount: Math.round(v.amount * 100) / 100, gallons: (category === 'GAS' || category === 'DIESEL') && v.gallons > 0 ? Math.round(v.gallons * 1000) / 1000 : null }))
    .filter((l) => l.amount >= 0.01);
  return { lines, leftOut };
}
