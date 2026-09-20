// Phone numbers are stored as ten digits ('9405551212'). These helpers turn whatever was typed or verified into that form.

/** The last ten digits of a phone number, however it was written ('+1 (940) 555-1212' gives '9405551212'). */
export function lastTenDigits(text: string): string {
  return text.replace(/\D/g, '').slice(-10);
}

/**
 * The account phone for a signup: the number Firebase verified by SMS (E.164), which the number the app sent must
 * agree with. Null when they differ or the verified number is not a full ten digits. Before, any tail of the verified
 * number was accepted, so one person could also open an account as "1" plus ten digits (a second welcome bonus) or
 * as a one-digit phone.
 */
export function canonicalPhone(submitted: string, verifiedE164: string): string | null {
  const verified = lastTenDigits(verifiedE164);
  if (verified.length !== 10) return null;
  return lastTenDigits(submitted) === verified ? verified : null;
}

/** A staff phone as the admin typed it: ten digits, with or without a leading 1. Null when it is not a full number. */
export function staffPhone(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? ten : null;
}
