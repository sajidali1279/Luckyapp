// One product, one barcode, however the camera read it: an iPhone reads a package's 12-digit UPC as EAN-13 with a leading 0, an Android
// phone as the 12 digits. Barcodes are matched on their digits without leading zeros, the same rule as the server (backend utils/barcode.ts).

export function barcodeKey(barcode: string): string {
  const b = barcode.trim();
  if (/^\d+$/.test(b)) return b.replace(/^0+/, '') || '0';
  return b.toUpperCase();
}

/** True when two barcodes are the same product. */
export function sameBarcode(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && barcodeKey(a) === barcodeKey(b);
}
