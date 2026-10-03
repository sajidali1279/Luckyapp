// One product, one barcode, however it was read. A UPC-A on a package (12 digits) comes back from an iPhone camera as EAN-13 with a
// leading 0, from an Android one as the 12 digits, and from Excel with its leading zeros dropped. All of those are the same product,
// so barcodes are matched on their digits without leading zeros (the GS1 way: every product number is the same when padded to 14).
// Codes with letters (Code 128 / Code 39 store codes) match as typed, ignoring case.

const DIGITS = /^\d+$/;

/** The matching key: "012345678905", "12345678905" and "0012345678905" all give "12345678905". */
export function barcodeKey(barcode: string): string {
  const b = barcode.trim();
  if (DIGITS.test(b)) return b.replace(/^0+/, '') || '0';
  return b.toUpperCase();
}

/** Every stored form that means the same product, for a database `in` lookup: the key padded to each length up to 14. */
export function barcodeVariants(barcode: string): string[] {
  const b = barcode.trim();
  if (!DIGITS.test(b)) return [...new Set([b, b.toUpperCase(), b.toLowerCase()])];
  const key = barcodeKey(b);
  const out = new Set<string>([b]);
  for (let len = key.length; len <= 14; len++) out.add(key.padStart(len, '0'));
  return [...out];
}

/** How a barcode is saved: trimmed, and an EAN-13 that is really a UPC-A (leading 0) saved as the 12 digits printed on the package. */
export function canonicalBarcode(barcode: string): string {
  const b = barcode.trim();
  return DIGITS.test(b) && b.length === 13 && b.startsWith('0') ? b.slice(1) : b;
}

/** True when two barcodes are the same product. */
export function sameBarcode(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && barcodeKey(a) === barcodeKey(b);
}
