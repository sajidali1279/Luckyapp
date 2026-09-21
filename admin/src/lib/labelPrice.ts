// A shelf-label price, the same rule the server applies (backend/src/utils/labelPrice.ts): dollars and cents, 0.01 to 999.99, at most
// two decimals. The server is the one that enforces it; this only lets a price box say so before anything is sent.

export const PRICE_MESSAGE = 'Enter a price such as 3.99 (from 0.01 to 999.99, at most two decimals).';

/** "3.99" for a good price, null for anything else. A leading "$" and spaces are ignored. */
export function canonicalPrice(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/^\$\s*/, '');
  if (!/^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  const value = Number(text);
  if (!(value >= 0.01 && value <= 999.99)) return null;
  return value.toFixed(2);
}

/** The sentence for a price box that holds something that is not a price, or null when it is fine (or still empty). */
export function priceProblem(text: string): string | null {
  return text.trim() === '' || canonicalPrice(text) !== null ? null : PRICE_MESSAGE;
}

/** How far a price moves, as a whole percent (+14, -50), or null when either side is not a price. */
export function priceChangePercent(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = canonicalPrice(from);
  const b = canonicalPrice(to);
  if (a === null || b === null) return null;
  return Math.round(((Number(b) - Number(a)) / Number(a)) * 100);
}

/** More than half up or down: worth a second look before it goes to every store. */
export const BIG_PRICE_CHANGE_PERCENT = 50;
