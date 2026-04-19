/**
 * receipt-parser.js
 * Parses Verifone C-store Control Center receipt text into structured line items.
 * Extracts ASCII text from ESC/POS binary data, then classifies each line.
 */

// ─── Category keyword maps ────────────────────────────────────────────────────

const PATTERNS = [
  {
    category: 'GAS',
    regex: /\b(unleaded|regular|premium|super|midgrade|87\s*oct|89\s*oct|91\s*oct|93\s*oct|e85|pump\s*#?\s*\d|fuel\s*sale|gasoline)\b/i,
  },
  {
    category: 'DIESEL',
    regex: /\b(diesel|def\b|ultra\s*low|ulsd)\b/i,
  },
  {
    category: 'TOBACCO_VAPES',
    regex: /\b(marlboro|newport|camel|winston|pall\s*mall|kool|basic|misty|doral|pyramid|cigarette|cigar|cigarillo|swisher|black\s*mild|backwood|vape|juul|njoy|smok|blu\s*e.?cig|tobacco|chewing|dip|skoal|grizzly|copenhagen)\b/i,
  },
  {
    category: 'HOT_FOODS',
    regex: /\b(hot\s*dog|hotdog|roller|taquito|tornados?|burrito|pizza|pretzel|chicken|wing|sandwich|sub|panini|empanada|kolache|biscuit|breakfast|coffee|cappuccino|latte|mocha|espresso|hot\s*choc|cocoa|fountain|soda\s*fount|slushie|smoothie|energy|red\s*bull|monster|rockstar|celsius)\b/i,
  },
  {
    category: 'FROZEN_FOODS',
    regex: /\b(icee|slurpee|slush|frozen|ice\s*cream|popsicle|fudge\s*bar|drumstick|dilly)\b/i,
  },
  {
    category: 'FRESH_FOODS',
    regex: /\b(banana|apple|orange|grape|salad|fruit|yogurt|sandwich\s*fresh|deli|boiled\s*egg)\b/i,
  },
  {
    category: 'GROCERIES',
    regex: /\b(chip|crisp|snack|pretzel\s*bag|popcorn|nuts|jerky|beef\s*stick|candy|chocolate|gum|mint|cookie|cracker|cereal|granola|bar|water|juice|tea|gatorade|powerade|vitamin\s*water|milk|beer|wine|seltzer|hard\s*seltzer|cider|malt|six\s*pack|twelve\s*pack|case\s*of|12\s*pack|24\s*pack|sour\s*cream|cheese|butter|bread|bun|tortilla)\b/i,
  },
];

/**
 * Extract printable ASCII text from an ESC/POS binary buffer.
 * ESC/POS uses control codes (0x00–0x1F, 0x7F+) for formatting —
 * we keep lines that contain printable ASCII words.
 */
function extractText(buffer) {
  // Replace ESC/POS GS/ESC command sequences with spaces, keep printable ASCII
  let text = '';
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if (b === 0x0a || b === 0x0d) {
      text += '\n';
    } else if (b >= 0x20 && b < 0x7f) {
      text += String.fromCharCode(b);
    } else {
      text += ' '; // replace control/non-ASCII bytes with space
    }
  }
  return text;
}

/**
 * Parse a line to extract a dollar amount.
 * Returns null if no amount found.
 */
function parseAmount(line) {
  // Match price patterns: $39.89 or 39.89 at end of line
  const match = line.match(/\$?\s*(\d{1,5}\.\d{2})\s*$/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Classify a receipt line into a ProductCategory.
 * customPatterns (from store keyword mappings) take priority over defaults.
 */
function classifyLine(line, customPatterns = []) {
  for (const { keyword, category } of customPatterns) {
    if (line.toLowerCase().includes(keyword)) return category;
  }
  for (const { category, regex } of PATTERNS) {
    if (regex.test(line)) return category;
  }
  return null; // not a product line
}

/**
 * Parse ESC/POS buffer into { txRef, total, items }
 * where items = [{category, amount}]
 * customPatterns: [{ keyword, category }] from store keyword mappings (checked first)
 */
function parseReceiptBuffer(buffer, customPatterns = []) {
  const text = extractText(buffer);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const items = [];
  let total = 0;
  let txRef = null;

  for (const line of lines) {
    const upper = line.toUpperCase();

    // Skip header/footer lines
    if (/^(thank|receipt|cashier|store|date|time|auth|ref|approval|invoice|change|cash|visa|mc|amex|discover|debit|credit|subtotal|tax|total|balance|welcome|please|come\s*back)/i.test(upper)) {
      // Capture TOTAL line
      if (/\bTOTAL\b/.test(upper) && !/SUB/.test(upper)) {
        const amt = parseAmount(line);
        if (amt) total = amt;
      }
      // Capture transaction/invoice ref
      if (/\b(invoice|ticket|trans|ref)\b.*:?\s*(\w+)/i.test(line)) {
        const m = line.match(/(\w{4,})\s*$/);
        if (m) txRef = m[1];
      }
      continue;
    }

    const amount = parseAmount(line);
    if (!amount || amount <= 0) continue;

    const category = classifyLine(line, customPatterns);
    if (!category) continue;

    // Merge consecutive same-category items (e.g. multi-line gas entries)
    const last = items[items.length - 1];
    if (last && last.category === category) {
      last.amount = parseFloat((last.amount + amount).toFixed(2));
    } else {
      items.push({ category, amount });
    }
  }

  // Fallback txRef: timestamp-based
  if (!txRef) txRef = `AUTO-${Date.now()}`;

  // Fallback total: sum of items
  if (!total && items.length) {
    total = parseFloat(items.reduce((s, i) => s + i.amount, 0).toFixed(2));
  }

  // If total exists but no items were categorized, create an OTHER item
  if (total > 0 && items.length === 0) {
    items.push({ category: 'OTHER', amount: total });
  }

  return { txRef, total, items };
}

module.exports = { parseReceiptBuffer, extractText, classifyLine };
