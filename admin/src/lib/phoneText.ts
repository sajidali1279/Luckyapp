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
  const raw = String(phone ?? '');
  const digits = raw.replace(/\D/g, '');
  // Ten digits, or "+1" and ten digits (how stores keep their number): read as (580) 924-9898. Anything else is shown as it is.
  const ten = /^\+?1?[\s-]*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{4}$/.test(raw) && (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) ? digits.slice(-10) : '';
  return ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw;
}
