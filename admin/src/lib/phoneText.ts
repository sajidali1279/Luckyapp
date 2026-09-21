// Phone numbers as people type and read them. An account's phone is always ten digits, and a pasted "+1 (281) 555-0100"
// is the same number as "2815550100": the leading country 1 is dropped, never a digit from the end.

/** The digits of whatever was typed or pasted ("+1 (281) 555-0100", "1-281-555-0100", "281 555 0100"), at most ten. */
export function phoneDigits(text: string): string {
  const d = String(text ?? '').replace(/\D/g, '');
  return d.length > 10 && d.startsWith('1') ? d.slice(1, 11) : d.slice(0, 10);
}

/** The text a phone box shows while someone types: (281) 555-0100. */
export function typedPhone(text: string): string {
  const d = phoneDigits(text);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** A stored number for reading: (281) 555-0100. Anything that is not ten digits is shown as it is. */
export function showPhone(phone: string | null | undefined): string {
  const d = String(phone ?? '');
  return /^\d{10}$/.test(d) ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}
