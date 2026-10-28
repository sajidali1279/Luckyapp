// Invoices to PDI: which vendor an invoice is from (2026-10-28). The reader copies the vendor's name off the invoice ("Rolling Frito-Lay
// Sales, LP", "PEPSICO BEVERAGES COMPANY"); this finds the vendor it belongs to among pdi_vendors by its names: the vendor's own name and
// every name it has been printed as before (aliases, added when a person says which vendor an invoice is). No vendor list to pick from:
// there will be many vendors (the owner, 2026-10-27).

/** Words that say what kind of company it is, not which one. */
const NOISE = new Set(['INC', 'INCORPORATED', 'LLC', 'LP', 'LLP', 'LTD', 'CO', 'CORP', 'CORPORATION', 'COMPANY', 'THE', 'OF', 'AND']);

/** A name as it is compared: capitals, letters and digits only, the words above dropped. "Rolling Frito-Lay Sales, LP" -> "ROLLING FRITO
 *  LAY SALES". */
export function vendorKey(name: string | null | undefined): string {
  return String(name ?? '').toUpperCase().slice(0, 200).replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
    .filter((w) => w && !NOISE.has(w)).join(' ');
}

export interface VendorNames { id: string; name: string; aliases: string[] }

/** The vendor a printed name belongs to: the one with a name whose words all appear in it (or the other way round), the longest such
 *  name winning. Null when none matches, or when two vendors match equally well (a person then says which). */
export function matchVendor<T extends VendorNames>(printed: string | null | undefined, vendors: T[]): T | null {
  const read = vendorKey(printed);
  if (!read) return null;
  const readWords = new Set(read.split(' '));
  let best: { vendor: T; words: number } | null = null;
  let tie = false;
  for (const v of vendors) {
    for (const key of [vendorKey(v.name), ...v.aliases.map(vendorKey)]) {
      if (!key) continue;
      const words = key.split(' ');
      const fits = words.every((w) => readWords.has(w)) || [...readWords].every((w) => words.includes(w));
      if (!fits) continue;
      const n = Math.min(words.length, readWords.size);
      if (!best || n > best.words) { best = { vendor: v, words: n }; tie = false; }
      else if (n === best.words && best.vendor.id !== v.id) tie = true;
    }
  }
  return best && !tie ? best.vendor : null;
}
