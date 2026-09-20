// CSV cells for spreadsheet files an admin will open in Excel or Google Sheets.
//
// A cell whose text starts with = + - or @ is read as a formula, and some customer-typed text (a name) ends up in
// these files. Text that starts that way gets a leading apostrophe, which spreadsheets show as plain text.
// Phone numbers and plain numbers ('+12815550100', '-5.00') cannot run anything and are left as they are.

const LOOKS_NUMERIC = /^[+-]?\d[\d\s().-]*$/;
const FORMULA_START = /^[=+\-@\t\r]/;

/** A text cell: quoted when it holds a comma, quote or line break, and defused when a spreadsheet would read it as a formula. */
export function csvText(value: string | null | undefined): string {
  if (value == null) return '';
  let s = String(value);
  if (FORMULA_START.test(s) && !LOOKS_NUMERIC.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
