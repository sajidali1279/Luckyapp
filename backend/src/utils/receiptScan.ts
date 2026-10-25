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

// HQ's Grant & Redeem page reads receipts too (2026-10-16, controllers/hqReceipt.controller.ts). Its rows are kept with the customer's
// scans so the same receipt is caught both ways, but they are not the customer's scans: never counted against the customer's daily limit
// and never shown in their app. HQ_READ = read, not used yet; HQ_ENTERED = HQ granted points from it.
export const HQ_READ = 'HQ_READ';
export const HQ_ENTERED = 'HQ';
export const HQ_SCAN_STATUSES = [HQ_READ, HQ_ENTERED];

// ── What the AI reads ────────────────────────────────────────────────────────

/** The categories the reader may give a line. Lottery, money orders, gift cards and the like earn nothing. */
export const READ_CATEGORIES = ['GROCERIES', 'FROZEN_FOODS', 'FRESH_FOODS', 'GAS', 'DIESEL', 'HOT_FOODS', 'TOBACCO', 'ALCOHOL', 'NOT_ELIGIBLE', 'OTHER'] as const;
export type ReadCategory = typeof READ_CATEGORIES[number];

export interface ReceiptRead {
  isReceipt: boolean;
  merchantName: string | null; storeNumber: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null;
  date: string | null; time: string | null;            // "YYYY-MM-DD", "HH:MM" (24 h), as printed
  seconds: number | null;                              // the seconds of the sale time when printed (10/16/26 6:04:55 PM)
  receiptNumber: string | null;                        // the transaction number: TRAN#1013532 (one number per sale, always going up)
  register: string | null;                             // the register / drawer: DR#1
  stan: string | null; invoice: string | null;         // card receipts: Stan and Invoice #, also always going up (2026-10-16)
  kind: 'SALE' | 'PREPAY' | 'VOID' | 'REFUND' | 'OTHER';   // a void or refund earns nothing; a prepay line is fuel not pumped yet
  copy: 'MERCHANT' | 'CUSTOMER' | null;
  subtotal: number | null; tax: number | null; total: number | null;
  items: { name: string; amount: number; category: ReadCategory; gallons: number | null; prepay: boolean }[];
  // How it was paid (2026-10-13): the card's last 4 digits and the authorization code tell one purchase from another
  paymentMethod: 'CASH' | 'CARD' | 'OTHER' | null; cardBrand: string | null; cardLast4: string | null; authCode: string | null;
  cardAid: string | null;                              // the chip's application id (AID: A0000000980840): the card's own brand, whatever network ran it
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
  "seconds": the seconds of the sale time if printed (54 from "6:04:54 PM"), or null,
  "receiptNumber": the transaction number, digits only (1013532 from "TRAN#1013532", usually at the very bottom next to the date), or null,
  "register": the register / drawer number (1 from "DR#1"), or null,
  "stan": the "Stan" number, digits only, or null, "invoice": the "Invoice #" number, digits only, or null,
  "kind": "VOID" if it says VOID TICKET or VOID, "REFUND" if it is a refund or return, "PREPAY" if it says PRE-AUTHORIZED RECEIPT,
    PREPAID RECEIPT, PREAUTH or PREPAY Receipt, "SALE" for an ordinary sale, "OTHER" otherwise,
  "copy": "MERCHANT" if it says MERCHANT COPY, "CUSTOMER" if it says CUSTOMER COPY, else null,
  "subtotal": number or null, "tax": number or null, "total": the amount paid as a number, or null,
  "items": one entry per sold line above the Subtotal, in the Amount column: {"name": as printed,
    "amount": the line amount as a number (positive; a refund line negative; "Dsc" discount lines printed under an item are already taken
    off the item's amount, so they are not lines of their own),
    "category": one of GROCERIES (packaged food, snacks, drinks, candy, household), FROZEN_FOODS, FRESH_FOODS (fruit, sandwiches, dairy),
    GAS (gasoline), DIESEL, HOT_FOODS (food made in store: chicken, tenders, burritos, pizza, taquitos, corn dogs, coffee),
    TOBACCO (cigarettes, cigars, vapes), ALCOHOL (beer, wine), NOT_ELIGIBLE (lottery, money order, gift card, prepaid card, bill payment,
    cash back, deposit, fee), OTHER,
    "gallons": the gallons for a fuel line ("27.148G" is 27.148), else null,
    "prepay": true for a fuel prepay line ("PREPAY CA #03", "PREPAY CR #05": paid before pumping), else false}.
    A line named "TAX" with a quantity, above the Subtotal, is a sold item counted in the Subtotal: list it (category OTHER).
    "Change" and the CASH / CREDIT / PREAUTH payment lines are not items,
  "paymentMethod": "CASH", "CARD" (credit, debit, EBT card) or "OTHER", or null if not printed,
  "cardBrand": the card brand as printed (e.g. "VISA", "MASTERCARD", "AMEX", "DISCOVER", "DEBIT"), or null,
  "cardLast4": the last 4 digits of the payment card number (from e.g. "Acct/Card #: ****1234"), or null. A loyalty program account
    (e.g. "Loyalty Program: Skupos ... Acct # : ****9518") is NOT the payment card,
  "authCode": the card approval / authorization code (e.g. "Auth #: 012345", "APPR CODE 4H7K2B"), or null,
  "cardAid": the card's "AID" (e.g. "A0000000980840"), or null,
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
const digitsOrNull = (v: unknown, min: number, max: number) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= min && d.length <= max ? d : null; };
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
    seconds: Number.isInteger(o.seconds) && o.seconds >= 0 && o.seconds < 60 ? o.seconds : (typeof o.seconds === 'string' && /^\d{1,2}$/.test(o.seconds) && Number(o.seconds) < 60 ? Number(o.seconds) : null),
    receiptNumber: str(o.receiptNumber),
    register: digitsOrNull(o.register, 1, 4),
    stan: digitsOrNull(o.stan, 4, 20), invoice: digitsOrNull(o.invoice, 3, 20),
    kind: ['SALE', 'PREPAY', 'VOID', 'REFUND', 'OTHER'].includes(o.kind) ? o.kind : 'SALE',
    copy: o.copy === 'MERCHANT' || o.copy === 'CUSTOMER' ? o.copy : null,
    subtotal: num(o.subtotal), tax: num(o.tax), total: num(o.total),
    items: (Array.isArray(o.items) ? o.items : []).slice(0, 80).map((it: any) => ({
      name: str(it?.name) ?? '',
      amount: num(it?.amount) ?? 0,
      category: (READ_CATEGORIES as readonly string[]).includes(it?.category) ? it.category : 'OTHER',
      gallons: num(it?.gallons),
      prepay: it?.prepay === true,
    })).filter((it: { name: string; amount: number }) => it.name || it.amount),
    paymentMethod: ['CASH', 'CARD', 'OTHER'].includes(o.paymentMethod) ? o.paymentMethod : null,
    cardBrand: str(o.cardBrand)?.toUpperCase().slice(0, 20) ?? null,
    cardLast4: /^\d{4}$/.test(String(o.cardLast4 ?? '').trim()) ? String(o.cardLast4).trim() : null,
    authCode: (() => { const a = String(o.authCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return a.length >= 4 && a.length <= 12 ? a : null; })(),
    cardAid: (() => { const a = String(o.cardAid ?? '').toUpperCase().replace(/[^A-F0-9]/g, ''); return a.length >= 10 && a.length <= 32 ? a : null; })(),
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
    // Fuel paid before pumping: what was pumped is not on this receipt (a $50 prepay can be $20 pumped and $30 back), 2026-10-16
    if (it.prepay && it.amount > 0) { leftOut.push(it.name ? `${it.name} (prepaid gas)` : 'prepaid gas'); continue; }
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

// ── The same receipt again ───────────────────────────────────────────────────

export interface ScanFacts {
  customerId: string; date: string | null; time: string | null; receiptNumber: string | null; total: number | null;
  items?: number[] | null; cardLast4?: string | null; authCode?: string | null;
  seconds?: number | null; stan?: string | null; invoice?: string | null;
}
/** A scan's facts from what the AI read. */
export function factsOf(customerId: string, r: any, total: number | null): ScanFacts {
  return {
    customerId, date: r?.date ?? null, time: r?.time ?? null, receiptNumber: r?.receiptNumber ?? null, total,
    items: Array.isArray(r?.items) ? r.items.map((it: any) => Number(it?.amount)).filter((n: number) => Number.isFinite(n) && n !== 0) : null,
    cardLast4: r?.cardLast4 ?? null, authCode: r?.authCode ?? null,
    seconds: Number.isInteger(r?.seconds) ? r.seconds : null, stan: r?.stan ?? null, invoice: r?.invoice ?? null,
  };
}

/**
 * The receipt's one identity (2026-10-16): the store and its transaction number. The register prints one TRAN# per sale and it only goes
 * up, so another photo of the same receipt, by anyone, has the same identity even when the total or the time is misread. Null without one.
 */
export function receiptIdentity(storeId: string, read: { receiptNumber: string | null }): string | null {
  const d = digitsOf(read.receiptNumber);
  return d.length >= 3 ? `${storeId}|T${d}` : null;
}

/** The sale time printed on the receipt (store time, to the second when printed), or the start of its day. */
export function receiptMoment(read: { date: string | null; time: string | null; seconds?: number | null }, startOfDay: (d: string) => Date): Date | null {
  if (!read.date) return null;
  const day = startOfDay(read.date);
  if (!read.time) return day;
  return new Date(day.getTime() + (Number(read.time.slice(0, 2)) * 60 + Number(read.time.slice(3))) * 60_000 + (read.seconds ?? 0) * 1000);
}
const sameAmounts = (a?: number[] | null, b?: number[] | null) => {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
  return x.every((v, i) => Math.abs(v - y[i]) < 0.005);
};
const digitsOf = (n: string | null) => (n ?? '').replace(/\D/g, '').replace(/^0+/, '');
const minutesOf = (t: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);

/**
 * Whether two scans at the same store are the same receipt. Another photo of a receipt is never read exactly the same way: "Trans #1234"
 * and "1234", a number missed, the time a minute off, and (found in testing 2026-10-13) a DIFFERENT number picked, since a receipt prints
 * several (transaction, register, ticket). So, on the same date:
 *  - the card's authorization code decides when both have one; two different cards are two purchases;
 *  - the same receipt number digits, at about the same time, is the same receipt even if the total was misread;
 *  - the same money (the total, or every line amount) within 3 minutes is the same receipt for the same customer, and for another customer
 *    when two or more line amounts match too (two people buying a $1.99 coffee a minute apart are two receipts);
 *  - with no time on one of them: the same money is the same receipt unless both numbers were read and differ.
 * A customer's second purchase of the same total on the same day (two coffees) is a different receipt: its time differs.
 */
export function sameReceipt(a: ScanFacts, b: ScanFacts): boolean {
  if (!a.date || a.date !== b.date) return false;
  // The card terminal's own numbers (2026-10-16): Stan and Invoice # are one per card sale, so they decide when both were read
  if (a.stan && b.stan) return a.stan === b.stan;
  if (a.invoice && b.invoice) return a.invoice === b.invoice;
  if (a.authCode && b.authCode) return a.authCode === b.authCode;
  if (a.cardLast4 && b.cardLast4 && a.cardLast4 !== b.cardLast4) return false;
  const da = digitsOf(a.receiptNumber), db = digitsOf(b.receiptNumber);
  const bothNumbers = da.length >= 3 && db.length >= 3;
  const sameNumber = bothNumbers && (da === db || da.endsWith(db) || db.endsWith(da));
  const ma = minutesOf(a.time), mb = minutesOf(b.time);
  const timesKnown = ma != null && mb != null;
  const closeInTime = timesKnown && Math.abs(ma! - mb!) <= 3;
  if (sameNumber && (!timesKnown || closeInTime)) return true;
  // Printed to the second: two sales at one store within 2 seconds of each other are one receipt, unless their numbers say otherwise
  if (timesKnown && a.seconds != null && b.seconds != null && Math.abs((ma! * 60 + a.seconds) - (mb! * 60 + b.seconds)) <= 2 && !(bothNumbers && !sameNumber)) return true;
  const sameTotal = a.total != null && b.total != null && Math.abs(a.total - b.total) < 0.005;
  const sameLines = sameAmounts(a.items, b.items);
  if (!sameTotal && !sameLines) return false;
  if (timesKnown) {
    if (!closeInTime) return false;
    if (a.customerId === b.customerId) return true;
    return (sameLines && (a.items?.length ?? 0) >= 2) || !bothNumbers;   // one $1.99 coffee each is not proof
  }
  return !bothNumbers || sameNumber;
}

// ── Numbers that only go up ──────────────────────────────────────────────────

export interface SequencePoint { at: Date; receiptNumber: string | null; stan: string | null; invoice: string | null; register: string | null }
const SEQ_SLACK_MS = 2 * 60_000;           // a minute or two of misread time is not a contradiction
const TRAN_PER_HOUR = 150;                 // far more sales than a store rings up in an hour
const NEAR = { receiptNumber: 50_000, stan: 1_000_000, invoice: 100_000 } as const;   // further apart than this: another counter (another terminal)

/**
 * Where a receipt's numbers do not fit the store's real receipts (2026-10-16). The transaction number, the Stan and the Invoice # only go up
 * through the day, so a receipt printed later than another must have bigger numbers, and only so many sales fit in an hour. A made-up or
 * edited receipt rarely gets all three right. Returns the names of the numbers that do not fit (none: fine).
 */
export function sequenceProblems(here: SequencePoint, known: SequencePoint[]): string[] {
  const out = new Set<string>();
  for (const field of ['receiptNumber', 'stan', 'invoice'] as const) {
    const v = Number(digitsOf(here[field]) || NaN);
    if (!Number.isFinite(v)) continue;
    for (const k of known) {
      const kv = Number(digitsOf(k[field]) || NaN);
      if (!Number.isFinite(kv) || Math.abs(kv - v) > NEAR[field]) continue;
      if (field === 'receiptNumber' && here.register && k.register && here.register !== k.register) continue;
      const dt = here.at.getTime() - k.at.getTime();
      if ((dt > SEQ_SLACK_MS && v < kv) || (dt < -SEQ_SLACK_MS && v > kv) || (v === kv && Math.abs(dt) > SEQ_SLACK_MS)) { out.add(field); break; }
      if (field === 'receiptNumber' && Math.abs(v - kv) > TRAN_PER_HOUR * Math.max(Math.abs(dt), SEQ_SLACK_MS) / 3_600_000 + 20) { out.add(field); break; }
    }
  }
  return [...out];
}

/** Flags that only tell the reviewer something: a scan with only these can still be approved at once. */
export const INFO_FLAGS = ['RECEIPT_SCAN', 'NEW_CARD', 'MERCHANT_COPY', 'PREPAY_LEFT_OUT'];

/** The checks a scan passes to be approved at once (the rest of the rules, amount, account age, spot check, are in the controller). */
export function cleanRead(read: ReceiptRead, flags: string[]): boolean {
  return read.readable === 'good' && read.concerns.length === 0 && !!read.receiptNumber && !!read.time && read.items.length > 0
    && flags.every((f) => INFO_FLAGS.includes(f));
}

