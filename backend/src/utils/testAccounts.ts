// 111 to 555 are not real area codes. Those numbers are the team's test accounts, used across launch
// tracking and (from here) the Customers page, so a test customer never inflates a real count.
// Customer phones are stored as bare 10 digits (see utils/phone.ts's canonicalPhone), so a test phone
// starts with one of these prefixes directly, no country code to strip first beyond the usual +1/1 cases
// isTestPhone already handles.
export const TEST_PHONE_PREFIXES = ['111', '222', '333', '444', '555'] as const;
const PREFIX_SET = new Set<string>(TEST_PHONE_PREFIXES);

export function isTestPhone(phone: string): boolean {
  let d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return PREFIX_SET.has(d.slice(0, 3));
}
