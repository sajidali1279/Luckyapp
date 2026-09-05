/**
 * Pure-JS CODE128 barcode encoder. Renders directly to static SVG <rect>
 * markup at HTML-build time, with no DOM, no canvas, and no runtime
 * <script> execution needed inside the printed page.
 *
 * expo-print's WebView-based print/PDF pipeline snapshots the page itself,
 * not necessarily after any inline <script> has finished (or even run at
 * all, unlike a real browser tab, admin web's window.print() flow). A
 * previous fix tried bundling JsBarcode inline to run client-side inside
 * the print HTML, but the printed output still only ever showed the plain
 * barcode number, never the scannable graphic. Generating the bars as
 * plain markup here, before the HTML string is ever handed to expo-print,
 * removes that dependency entirely.
 *
 * The pattern table below is the real CODE128 symbol table, taken
 * verbatim from the JsBarcode v3.11.5 source already vendored in this
 * repo (see jsbarcodeSource.ts), not retyped from memory, verified
 * byte-for-byte against an independent CODE128 encoder before use.
 */

const BARS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
  '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
  '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
  '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
  '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
  '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
  '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
  '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
  '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110',
  '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011',
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

export interface Code128Svg {
  /** <rect> elements only, embed inside a caller-provided <svg viewBox="0 0 modules height"> */
  rects: string;
  /** total module count, i.e. the natural viewBox width in module units */
  modules: number;
}

/**
 * Encodes `value` as CODE128, auto-selecting Code Set C (2 digits per
 * symbol, half the width) for pure even-length digit strings, the
 * common case for UPC/EAN product codes on shelf labels, and falling
 * back to Code Set B (one printable ASCII char per symbol) otherwise.
 *
 * `quietZone` adds blank module-width padding on each side (a real quiet
 * zone matters for scanners to reliably lock onto the barcode's edges).
 */
export function code128ToSvg(value: string, height: number, quietZone = 0): Code128Svg {
  const isNumericEven = value.length > 0 && value.length % 2 === 0 && /^[0-9]+$/.test(value);

  let symbols: number[];
  if (isNumericEven) {
    symbols = [START_C];
    for (let i = 0; i < value.length; i += 2) {
      symbols.push(parseInt(value.slice(i, i + 2), 10));
    }
  } else {
    symbols = [START_B];
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      // Set B covers printable ASCII 32-126; anything outside that range
      // (not expected for a real barcode value) maps to a space rather
      // than producing an out-of-table symbol.
      symbols.push(code >= 32 && code <= 126 ? code - 32 : 0);
    }
  }

  let checksum = symbols[0];
  for (let i = 1; i < symbols.length; i++) {
    checksum += symbols[i] * i;
  }
  checksum %= 103;
  symbols.push(checksum, STOP);

  const bits = symbols.map((s) => BARS[s]).join('');

  let rects = '';
  let x = quietZone;
  let i = 0;
  while (i < bits.length) {
    const bit = bits[i];
    let runLen = 0;
    while (i < bits.length && bits[i] === bit) {
      runLen++;
      i++;
    }
    if (bit === '1') {
      rects += `<rect x="${x}" y="0" width="${runLen}" height="${height}"/>`;
    }
    x += runLen;
  }

  return { rects, modules: bits.length + quietZone * 2 };
}
