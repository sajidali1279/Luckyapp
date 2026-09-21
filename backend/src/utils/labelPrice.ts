// What a shelf-label price is, in one place. A price is dollars and cents: digits with at most two decimals, from 0.01 to 999.99,
// stored as "3.99". Before this the server took any text up to seven characters, so "abc", "1..99", "0", "9999999" and "$3.99"
// (which the label then printed as "$$3.99") were all saved and printed on shelves.

import { z } from 'zod';

export const PRICE_MESSAGE = 'Enter a price such as 3.99 (from 0.01 to 999.99, at most two decimals).';

/**
 * "3.99" for a good price, null for anything else. A leading "$" and surrounding spaces are ignored (the label draws its own "$"),
 * and "3", "3.9" and ".99" become "3.00", "3.90" and "0.99".
 */
export function canonicalPrice(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/^\$\s*/, '');
  if (!/^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  const value = Number(text);
  if (!(value >= 0.01 && value <= 999.99)) return null;
  return value.toFixed(2);
}

/** True when two stored prices are the same amount, whatever their spelling ("2.7" and "2.70"); null only equals null. */
export function samePrice(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  return (canonicalPrice(a) ?? a) === (canonicalPrice(b) ?? b);
}

/** A price field for a request body: turns the text into its canonical form or refuses with the sentence above. */
export const priceField = z
  .string({ message: PRICE_MESSAGE })
  .transform((value, ctx) => {
    const price = canonicalPrice(value);
    if (price === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PRICE_MESSAGE });
      return z.NEVER;
    }
    return price;
  });
