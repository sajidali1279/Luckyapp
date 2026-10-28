// Invoices to PDI: reading the photos (2026-10-27; any vendor since 2026-10-28). All the photos of one paper invoice go to Claude in one
// request, so the parts where they overlap can be matched and every printed line comes back once. The reader is told what each value means
// on any vendor's invoice, plus the notes kept for vendors whose layouts have catches (pdi_vendors.readerNotes), and reads the vendor's
// name off the invoice (utils/pdiVendors.ts matches it). The answer is held to a JSON schema. What is read is only a proposal:
// utils/pdiInvoice.ts checks it line by line (check digits, quantity x price, subtotals, the total) and a person looks at anything that
// does not add up before a file is made.
import type Anthropic from '@anthropic-ai/sdk';
import { cropForReading } from './receiptCrop';
import { PaperInvoice, PaperLine } from './pdiInvoice';

/** Tried first; the next one if this account does not have it (the reading is measured on real invoices before the page is switched on). */
export const PDI_READ_MODELS = ['claude-opus-5-5', 'claude-opus-4-8'];
export const MAX_PHOTOS = 12;
const MAX_PIXELS_CUT = 1_150_000; // the reader's whole limit for the cut-out paper: invoice print is small
const MAX_OUTPUT = 64_000;

/** Dollars per million tokens (input, output), for the cost shown with each reading; a model not listed shows no cost. */
const PRICES: Record<string, [number, number]> = { 'claude-opus-4-8': [5, 25], 'claude-sonnet-5': [3, 15] };

/** A reading that could not be done, in words for the person on the page. */
export class PdiReadError extends Error {}

export interface InvoicePhoto { buffer: Buffer; mediaType: string }
/** How a vendor's invoices are laid out, for the reader (pdi_vendors.readerNotes). */
export interface VendorNotes { name: string; notes: string }
export interface InvoiceRead {
  paper: PaperInvoice;
  vendor: { name: string | null; address: string | null; phone: string | null }; // as printed: utils/pdiVendors.ts finds whose it is
  unreadable: string[];  // what the reader says it could not make out
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  costCents: number | null;
}

// ── What the reader is told ──────────────────────────────────────────────────

const GENERAL = `These photos show ONE paper invoice from a vendor (a supplier) to a convenience store. A long invoice is photographed in several
parts that overlap; the photos may come in any order. Put the invoice back together top to bottom and give every printed item line exactly
once: where two photos show the same lines, use them once; never drop a line that only one photo shows.

Copy what is printed, character for character, digit for digit. Do not correct, round, add up or guess anything: the numbers are checked
afterwards against each other. Thermal paper fades; read small digits with care (0 and 8, 1 and 7, 3 and 8, 5 and 6 look alike) and compare
with the same digit elsewhere on the paper. Every value is text: when a value is not printed, give an empty string ""; when it is printed
but cannot be read, give "" and say what and where in "unreadable". Never invent a value. Money is given as printed with its decimals
("25.15", "1.9500"); quantities and units as the whole numbers printed ("2", "24"). Dates are YYYY-MM-DD.`;

const FIELDS = `What to give:
- vendor: the vendor's name as printed at the top of the invoice (the company selling), with its address and phone if printed. Not the
  store: the store is the customer (bill to, ship to, sold to).
- invoiceNumber, date, total: the invoice's number, its date and the amount due.
- lines: every item line, top to bottom, each once:
  - upc: the UPC or barcode number as printed, with its dashes. Some vendors print only the last few digits of each UPC under a heading
    such as "MANUFACTURER: 28400" that gives the rest: copy the digits as printed and give that heading's number as manufacturer on every
    line under it.
  - description: the product name as printed.
  - item: the vendor's own item number, code or ID for the product, if printed.
  - quantity: how many were delivered, as the vendor counts them (cases, or single items).
  - units: the number of single units, only when the invoice prints it as its own column besides the quantity (for example "Cases 2
    Units 24"); otherwise "".
  - price: the price of one of what the quantity counts, after any discount (the net price), as printed.
  - amount: the line's total as printed.
  - isReturn: true for a return, credit or pick-up line (its quantity as printed, positive).
  - group: the package or section header the line is printed under, when the invoice groups lines under headers that each have a subtotal.
- groups: one entry per such header, in order, with its printed subtotal (cases, units, amount).
- summary: the total cases and the total units printed for the whole invoice, if printed.
- charges: amounts added to the invoice that are not item lines (a deposit, a fuel surcharge, a delivery fee, a tax), each with its name and
  amount as printed. Not a discount already taken off a line's net price.`;

export function readPrompt(photoCount: number, vendorNotes: VendorNotes[] = []): string {
  const notes = vendorNotes.filter((v) => v.notes && v.notes.trim()).map((v) => `- ${v.name}: ${v.notes.trim()}`).join('\n');
  return `${GENERAL}\n\n${FIELDS}\n\nThe invoice is in ${photoCount} photo${photoCount === 1 ? '' : 's'}.`
    + (notes ? `\n\nNotes on some vendors' invoices (use them when the invoice is from that vendor):\n${notes}` : '');
}

// Every value is text ("" when not printed or unreadable): the API allows at most 16 fields that may be one type or another (anyOf, or
// "type": [..., "null"]) in a schema, and a schema over that is refused with a 400 before any photo is read (2026-10-27, 17 such fields)
const text = (description = '') => (description ? { type: 'string', description } : { type: 'string' }) as { type: 'string'; description?: string };

/** The shape of the answer (the API holds the reader to it). No field may be null and none is optional: see `text` above. */
export const READ_SCHEMA = {
  type: 'object',
  properties: {
    vendor: {
      type: 'object',
      properties: { name: text('the vendor (seller) as printed, not the store'), address: text(), phone: text() },
      required: ['name', 'address', 'phone'],
      additionalProperties: false,
    },
    invoiceNumber: text('the invoice number as printed'),
    date: text('the invoice date, YYYY-MM-DD'),
    total: text('the amount due as printed, for example 3778.20'),
    lines: {
      type: 'array',
      description: 'every item line, in the order printed, each once',
      items: {
        type: 'object',
        properties: {
          upc: text('as printed, with its dashes'),
          description: text(),
          item: text("the vendor's item number or ID, as printed"),
          quantity: text('the whole number printed'),
          units: text('the units, only when printed as their own column'),
          price: text('one of what is counted, after discounts'),
          amount: text(),
          isReturn: { type: 'boolean' },
          manufacturer: text(),
          group: text(),
        },
        required: ['upc', 'description', 'item', 'quantity', 'units', 'price', 'amount', 'isReturn', 'manufacturer', 'group'],
        additionalProperties: false,
      },
    },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: text(), cases: text(), units: text(), amount: text() },
        required: ['name', 'cases', 'units', 'amount'],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'object',
      properties: { cases: text(), units: text() },
      required: ['cases', 'units'],
      additionalProperties: false,
    },
    charges: {
      type: 'array',
      description: 'deposits, surcharges, fees and taxes that are not item lines',
      items: { type: 'object', properties: { name: text(), amount: text() }, required: ['name', 'amount'], additionalProperties: false },
    },
    unreadable: { type: 'array', items: { type: 'string' }, description: 'anything that could not be read, and where' },
  },
  required: ['vendor', 'invoiceNumber', 'date', 'total', 'lines', 'groups', 'summary', 'charges', 'unreadable'],
  additionalProperties: false,
} as const;

// ── The answer, as the checks take it ────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);   // nothing on an invoice is longer
/** A whole number given as a number (the page) or as the digits printed (the reader); anything else is null. */
const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : typeof v === 'string' && /^\s*-?\d{1,9}\s*$/.test(v) ? Number(v.trim()) : null);

/** The reader's JSON as a PaperInvoice and the vendor as printed; anything of the wrong kind becomes null, which the checks then name. */
export function paperFromRead(raw: any): { paper: PaperInvoice; vendor: InvoiceRead['vendor']; unreadable: string[] } {
  const lines: PaperLine[] = (Array.isArray(raw?.lines) ? raw.lines : []).map((l: any) => ({
    upc: str(l?.upc), description: str(l?.description), item: str(l?.item), quantity: int(l?.quantity), units: int(l?.units),
    price: str(l?.price), amount: str(l?.amount), isReturn: l?.isReturn === true, manufacturer: str(l?.manufacturer), group: str(l?.group),
  }));
  const groups = (Array.isArray(raw?.groups) ? raw.groups : []).filter((g: any) => str(g?.name)).map((g: any) => ({
    name: str(g.name)!, ...(int(g.cases) !== null ? { cases: int(g.cases)! } : {}), ...(int(g.units) !== null ? { units: int(g.units)! } : {}),
    ...(str(g.amount) ? { amount: str(g.amount)! } : {}),
  }));
  const summary = {
    ...(int(raw?.summary?.cases) !== null ? { cases: int(raw.summary.cases)! } : {}),
    ...(int(raw?.summary?.units) !== null ? { units: int(raw.summary.units)! } : {}),
  };
  const charges = (Array.isArray(raw?.charges) ? raw.charges : []).filter((c: any) => str(c?.name) || str(c?.amount)).slice(0, 50)
    .map((c: any) => ({ name: str(c.name) ?? 'Charge', amount: str(c.amount) }));
  return {
    paper: { invoiceNumber: str(raw?.invoiceNumber), date: str(raw?.date), total: str(raw?.total), lines, groups, summary, charges },
    vendor: { name: str(raw?.vendor?.name), address: str(raw?.vendor?.address), phone: str(raw?.vendor?.phone) },
    unreadable: (Array.isArray(raw?.unreadable) ? raw.unreadable : []).filter((u: unknown) => typeof u === 'string').slice(0, 50),
  };
}

/** For a request without the answer format: the same shape, as plain JSON. */
const JSON_ONLY = `Answer with only one JSON object, no other text, with exactly these keys: vendor (name, address, phone), invoiceNumber, date,
total, lines (each with upc, description, item, quantity, units, price, amount, isReturn, manufacturer, group), groups (each with name,
cases, units, amount), summary (cases, units), charges (each with name, amount) and unreadable (a list of strings). Every value is a
string ("" when not printed), except isReturn (true or false).`;

/** What the API said, in its own words (shown to the person, and logged): never the request, never the key. */
function apiMessage(e: any): string {
  const said = e?.error?.error?.message ?? e?.error?.message ?? e?.message ?? 'no message';
  return String(said).replace(/\s+/g, ' ').slice(0, 300);
}

/** The JSON object in an answer: the whole text, or what sits between its first { and last } (a code fence around it). */
function jsonIn(text: string): unknown {
  for (const candidate of [text, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)]) {
    try { return JSON.parse(candidate); } catch { /* the next way */ }
  }
  return undefined;
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Reads one invoice from its photos. `vendorNotes`: the layouts of vendors whose invoices have catches. `client` is for tests; the
 *  server's key is used otherwise. */
export async function readInvoice(photos: InvoicePhoto[], vendorNotes: VendorNotes[] = [], client?: Anthropic): Promise<InvoiceRead> {
  if (!photos.length) throw new PdiReadError('Add the photos of the invoice.');
  if (photos.length > MAX_PHOTOS) throw new PdiReadError(`At most ${MAX_PHOTOS} photos for one invoice.`);
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
  const { jsonSchemaOutputFormat } = await import('@anthropic-ai/sdk/helpers/json-schema');
  const api = client ?? new AnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  // only the paper goes to the reader, not the counter or the floor around it (receiptCrop.ts), with as much of the paper as it can take
  const cut = await Promise.all(photos.map((p) => cropForReading(p.buffer, p.mediaType, MAX_PIXELS_CUT)));
  const content: Anthropic.ContentBlockParam[] = [];
  cut.forEach((c, i) => {
    content.push({ type: 'text', text: `Photo ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: c.mediaType as 'image/jpeg', data: c.buffer.toString('base64') } });
  });
  content.push({ type: 'text', text: readPrompt(photos.length, vendorNotes) });

  // The answer is held to READ_SCHEMA. Should the API refuse that format (400), the same model is asked again for plain JSON and its
  // answer parsed, as the receipt reader does; a model this account does not have (404) is skipped for the next one.
  const ask = (model: string, schema: boolean) => api.messages.stream({
    model,
    max_tokens: MAX_OUTPUT,
    thinking: { type: 'adaptive' },
    output_config: schema ? { effort: 'high', format: jsonSchemaOutputFormat(READ_SCHEMA as any) } : { effort: 'high' },
    messages: [{ role: 'user', content: schema ? content : [...content, { type: 'text', text: JSON_ONLY }] }],
  }).finalMessage();
  let message: Anthropic.Message | null = null;
  let model = PDI_READ_MODELS[0];
  let refused: string | null = null;
  models: for (const candidate of PDI_READ_MODELS) {
    model = candidate;
    for (const schema of [true, false]) {
      try {
        message = await ask(candidate, schema);
        break models;
      } catch (e) {
        if (e instanceof AnthropicClient.NotFoundError) continue models;                       // not on this account
        if (e instanceof AnthropicClient.RateLimitError || e instanceof AnthropicClient.InternalServerError) throw new PdiReadError('The reader is busy right now. Try again in a minute.');
        if (e instanceof AnthropicClient.BadRequestError) {
          refused = apiMessage(e);
          console.error(`[pdi-read] ${candidate} refused the request${schema ? ' (with the answer format)' : ''}: ${refused}`);
          if (schema) continue;                                                                  // once more, without the format
          continue models;
        }
        if (e instanceof AnthropicClient.APIError) { console.error(`[pdi-read] ${candidate}: ${apiMessage(e)}`); throw new PdiReadError(`The reader could not take these photos (${e.status ?? 'no answer'}: ${apiMessage(e)}). Try again.`); }
        throw e;
      }
    }
  }
  if (!message) throw new PdiReadError(refused ? `The reader refused the request: ${refused}` : 'The reader did not answer. Try again.');
  if (message.stop_reason === 'refusal') throw new PdiReadError('The reader would not read these photos. Check they show the invoice.');
  if (message.stop_reason === 'max_tokens') throw new PdiReadError('The invoice is too long to read in one go. Split it: read the photos in two invoices.');
  const answer = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const raw = jsonIn(answer);
  if (raw === undefined) throw new PdiReadError('The answer from the reader could not be understood. Try again.');
  const { paper, vendor, unreadable } = paperFromRead(raw);
  const inputTokens = message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
  const outputTokens = message.usage.output_tokens;
  const price = PRICES[message.model] ?? PRICES[model];
  return {
    paper, vendor, unreadable, model: message.model ?? model,
    usage: { inputTokens, outputTokens },
    costCents: price ? Math.round((inputTokens * price[0] + outputTokens * price[1]) / 10_000) : null,
  };
}
