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

/** Never offered as a reward: tobacco, alcohol, lottery, CBD, propane and PDI's test department. */
export const notARewardDepartment = (d: string | null | undefined): boolean => {
  const kind = departmentKind(d);
  return kind === 'TOBACCO' || kind === 'ALCOHOL' || kind === 'LOTTERY' || kind === 'CBD' || kind === 'PROPANE' || kind === 'TEST';
};

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
