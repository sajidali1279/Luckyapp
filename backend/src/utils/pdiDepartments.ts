// What a PDI department is (2026-11-10). The stores' PDI set-ups name departments in two styles: the Oklahoma stores (5, 6, 7, 11) use
// GROC, CIGS, GROC FOOD STAMP, K K CHICKEN, ICE; the Texas stores (2, 8, 9, 10, 12 and the others) use GROCERY, CIGERETTES, CIGARS, WINE,
// LIQUOR, LOTTO, ICE CREAM, CANDY and a long list of truck stop departments. Every place that reads a department (receipt lines, scan
// names, the rewards picker) asks here, so a new store's file with either style is read the same way. Names are compared in capitals with
// single spaces ("Lottery Scratchoffs" is LOTTERY SCRATCHOFFS).

export type DepartmentKind = 'TOBACCO' | 'ALCOHOL' | 'LOTTERY' | 'HOT_FOOD' | 'FROZEN' | 'PROPANE' | 'CBD' | 'TEST' | 'GROCERY';

/** A department name as it is compared: capitals, single spaces. */
export const deptKey = (d: string | null | undefined): string => (d ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

const KINDS: Record<string, DepartmentKind> = {
  // tobacco: cigarettes, cartons, cigars
  CIGS: 'TOBACCO', CIGERETTES: 'TOBACCO', CIGARETTES: 'TOBACCO', 'CIG CARTON': 'TOBACCO', CIGARS: 'TOBACCO',
  // alcohol
  BEER: 'ALCOHOL', WINE: 'ALCOHOL', LIQUOR: 'ALCOHOL',
  // hot food made in the store
  'K K CHICKEN': 'HOT_FOOD', 'HOT FOOD': 'HOT_FOOD',
  // ICE at the Oklahoma stores is Blue Bell ice cream
  ICE: 'FROZEN', 'ICE CREAM': 'FROZEN',
  PROPANE: 'PROPANE',
  'CBD PRODUCTS': 'CBD',
  'TEST A DEPT': 'TEST',
  // packaged goods and store supplies (never tobacco or alcohol)
  GROC: 'GROCERY', 'GROC FOOD STAMP': 'GROCERY', 'FOOD STAMP': 'GROCERY', 'TAX GROCERY': 'GROCERY', TAX: 'GROCERY', 'NO TAX': 'GROCERY',
  'SOFT DRINK': 'GROCERY', DELI: 'GROCERY', GROCERY: 'GROCERY', 'NON TAX': 'GROCERY', 'NON TAX GROCERY': 'GROCERY', 'NON-TAX GROCERY': 'GROCERY',
  'NON-TAXABLE ITEMS': 'GROCERY', CANDY: 'GROCERY', GUM: 'GROCERY', WATER: 'GROCERY', 'ENEGY DRINK': 'GROCERY', 'ENERGY DRINK': 'GROCERY',
  COFFEE: 'GROCERY', FOUNTAIN: 'GROCERY', HBA: 'GROCERY', 'CLEANING SUPPLIES': 'GROCERY', 'AUTOMOTIVE &TRUCK ACCESORIES': 'GROCERY',
  'CHEMICAL/DEICER/LUBRICANT': 'GROCERY', 'TAPES/PAPER PRODUCT AND STAT': 'GROCERY', 'CELLUR PHONE AND ACCESSORIE': 'GROCERY',
  TOOLS: 'GROCERY', CLOCK: 'GROCERY', 'APPLIANCE AND 12V APPLIANCE': 'GROCERY', 'LIGHT AND LENSES': 'GROCERY', 'CARGO CONTROL DEVICES': 'GROCERY',
  GLOVES: 'GROCERY', 'THERMOSES/JUGS/COOLERS': 'GROCERY', 'CB RADIO ACCESORIES': 'GROCERY', WIRING: 'GROCERY', KNIVES: 'GROCERY',
  'AIR FRESH': 'GROCERY', 'AIR SYSTEM PRODUCT': 'GROCERY', PADLOCKS: 'GROCERY', 'HARWARD AND FASTENERS': 'GROCERY',
  'VEHICULE SAFTY DEVICES': 'GROCERY', 'SHOWER AND BATH': 'GROCERY',
};

/** The kind of a PDI department, or null when it is mixed or unknown (New Item Department, a name not seen yet). */
export function departmentKind(d: string | null | undefined): DepartmentKind | null {
  const k = deptKey(d);
  if (!k) return null;
  if (/LOTT|LOTTERY|LTRY/.test(k)) return 'LOTTERY';
  return KINDS[k] ?? null;
}

const NOT_A_REWARD = new Set<DepartmentKind>(['TOBACCO', 'ALCOHOL', 'LOTTERY', 'CBD', 'PROPANE', 'TEST']);

/** Never offered as a reward: tobacco, alcohol, lottery, CBD, propane and PDI's test department. */
export const notARewardDepartment = (d: string | null | undefined): boolean => {
  const kind = departmentKind(d);
  return !!kind && NOT_A_REWARD.has(kind);
};
export const notARewardKind = (k: DepartmentKind | null | undefined): boolean => !!k && NOT_A_REWARD.has(k);

// Scratch-off tickets filed under GROCERY (2026-11-10): stores 8 and 9 keep about 45 each there ("100X Monopoly", "Hot 7s", "Bingo
// Extra", "50X Cashword", "$50K Poker", "88 Fortunes"). A ticket is known by its name AND a whole-dollar ticket price ($1 to $100):
// "FOUR LOKO JACKPOT" ($3.79, beer) and the 4K cigars ($0.99) are not tickets.
const TICKET_PRICES = new Set([100, 200, 300, 500, 1000, 2000, 2500, 3000, 5000, 10000]);
const TICKET_NAME = /\b\d{1,4} ?X\b|\bX ?\d{1,3}\b|CASHWORD|CROSSWORD|MONOPOLY|BINGO|\b\d*7S\b|\bFORTUNES?\b|JACKPOT|LOTERIA|EL DINERO|WINNERS? CIRCLE|\bPOKER\b|\bTHE CASH\b|\$\d[\d,]* ?(K|MILLION)\b|\$\d+ OR \$\d+|SCRATCH|LOTTO|LOTTERY|POWER ?BALL|MEGA ?MILLIONS|\bPICK ?[2-4]\b|\bCASH ?(5|FIVE)\b|TWO ?STEP|ALL ?OR ?NOTHING/i;

/** A lottery ticket by its name and price, whatever department it is filed under. */
export const looksLikeTicket = (name: string | null | undefined, priceCents: number | null | undefined): boolean =>
  !!name && priceCents != null && TICKET_PRICES.has(priceCents) && TICKET_NAME.test(name);

// a department that says plainly what the product is keeps its word; a grocery, mixed or unknown one gives way to a ticket's name
const CLEAR = new Set<DepartmentKind>(['TOBACCO', 'ALCOHOL', 'LOTTERY', 'HOT_FOOD', 'FROZEN', 'PROPANE', 'CBD', 'TEST']);

/** What one store's item is: its department's kind, or LOTTERY for a ticket filed under groceries or a mixed department. */
export function itemKind(department: string | null | undefined, name: string | null | undefined, priceCents: number | null | undefined): DepartmentKind | null {
  const k = departmentKind(department);
  if (k && CLEAR.has(k)) return k;
  return looksLikeTicket(name, priceCents) ? 'LOTTERY' : k;
}

// A product one store files as tobacco, alcohol, lottery or CBD is that at every store (2026-11-10): store 9 files the 4K cigars under
// GROCERY while stores 8, 10 and 12 file them under CIGARS (when most of the other stores agree). Lottery first, then tobacco, alcohol, CBD.
const RESTRICTED: DepartmentKind[] = ['LOTTERY', 'TOBACCO', 'ALCOHOL', 'CBD'];

/** The restricted kind (lottery, tobacco, alcohol, CBD) MOST of these stores (and at least 2) give a product, or null. Not any one store:
 *  store 7 files Alpo dog food under CIGS and store 2 a bath tissue under CIGERETTES, and one store's slip must not spread. */
export function restrictedKind(kinds: (DepartmentKind | null)[]): DepartmentKind | null {
  for (const r of RESTRICTED) { const n = kinds.filter((k) => k === r).length; if (n >= 2 && n * 2 > kinds.length) return r; }
  return null;
}

// Only a general department gives way to the other stores (2026-11-10). A specific one keeps its word even against most stores: stores
// 2, 8 and 10 file window wipers under CIGARS and CB radio parts under "Lottery Online" (their price books were copied from one another),
// while store 9 files them, rightly, under VEHICULE SAFTY DEVICES and CB RADIO ACCESORIES.
const GENERAL = new Set(['GROC', 'GROCERY', 'GROC FOOD STAMP', 'FOOD STAMP', 'TAX GROCERY', 'TAX', 'NO TAX', 'NON TAX', 'NON TAX GROCERY',
  'NON-TAX GROCERY', 'NON-TAXABLE ITEMS', 'NEW ITEM DEPARTMENT', 'HOT FOOD', 'K K CHICKEN', 'DELI', 'SOFT DRINK']);
export const isGeneralDepartment = (d: string | null | undefined) => !deptKey(d) || GENERAL.has(deptKey(d));

// The app product category a scanned barcode gets from its PDI department: only departments that are one kind of product. Decided
// 2026-11-07 for CIGS and BEER (Tobacco 173 of 175, Beer 8 of 8); the Texas departments added 2026-11-10 are named for one kind of product
// and use the category names already in the app's lists.
const APP_CATEGORY: Record<string, string> = {
  CIGS: 'Tobacco', CIGERETTES: 'Tobacco', CIGARETTES: 'Tobacco', 'CIG CARTON': 'Tobacco', CIGARS: 'Tobacco',
  BEER: 'Beer', CANDY: 'Candy', GUM: 'Gum', WATER: 'Water', 'ENEGY DRINK': 'Energy Drinks', 'ENERGY DRINK': 'Energy Drinks',
  COFFEE: 'Coffee', FOUNTAIN: 'Fountain', 'AUTOMOTIVE &TRUCK ACCESORIES': 'Automotive', 'CELLUR PHONE AND ACCESSORIE': 'Electronics',
};

/** The app product category for a PDI department, or null (staff pick it). */
export const appCategoryFor = (d: string | null | undefined): string | null => APP_CATEGORY[deptKey(d)] ?? null;

// Short store codes (a game number like 2236, a vendor's item number) are padded to 11 digits by the upload, so the same short code can
// be a lottery game at one store and a CB radio part at another. Real barcodes are the same product everywhere; a short code only
// counts across stores when the names share a word too ("2236 HOUSTON TEXANS" and "2236 Houston Texans").
const isShortCode = (code: string) => /^0000/.test(code);
const nameWords = (n: string) => new Set(n.toUpperCase().replace(/[^A-Z]+/g, ' ').split(' ').filter((w) => w.length >= 4));

/** The restricted kind most of the other stores give the same product (lottery, tobacco, alcohol, CBD), or null. */
export function restrictedAcrossStores(code: string, name: string, others: { name: string; kind: DepartmentKind | null }[], department?: string | null): DepartmentKind | null {
  if (department !== undefined && !isGeneralDepartment(department)) return null;
  if (!isShortCode(code)) return restrictedKind(others.map((o) => o.kind));
  const mine = nameWords(name);
  return restrictedKind(others.filter((o) => [...nameWords(o.name)].some((w) => mine.has(w))).map((o) => o.kind));
}
