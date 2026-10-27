// Invoices to PDI: reading the photos (2026-10-27). All the photos of one paper invoice go to Claude in one request, so the parts where they
// overlap can be matched and every printed line comes back once. Each supplier's layout is described (from the three invoices the owner
// confirmed), and the answer is held to a JSON schema. What is read is only a proposal: utils/pdiInvoice.ts checks it line by line
// (check digits, quantity x price, subtotals, the total) and a person looks at anything that does not add up before a file is made.
import type Anthropic from '@anthropic-ai/sdk';
import { cropForReading } from './receiptCrop';
import { PaperInvoice, PaperLine, PdiSupplier, PDI_SUPPLIERS } from './pdiInvoice';

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
export interface InvoiceRead {
  paper: PaperInvoice;
  unreadable: string[];  // what the reader says it could not make out
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  costCents: number | null;
}

// ── What the reader is told ──────────────────────────────────────────────────

const GENERAL = `These photos show ONE paper invoice from a vendor to a convenience store. A long invoice is photographed in several parts that
overlap; the photos may come in any order. Put the invoice back together top to bottom and give every printed item line exactly once: where
two photos show the same lines, use them once; never drop a line that only one photo shows.

Copy what is printed, character for character, digit for digit. Do not correct, round, add up or guess anything: the numbers are checked
afterwards against each other. Thermal paper fades; read small digits with care (0 and 8, 1 and 7, 3 and 8, 5 and 6 look alike) and compare
with the same digit elsewhere on the paper. When a value cannot be read, give null for it and say what and where in "unreadable"; never
invent one. Money is given as printed with its decimals ("25.15", "1.9500"); quantities are whole numbers. Dates are YYYY-MM-DD.`;

const LAYOUTS: Record<PdiSupplier, string> = {
  FRITO: `Frito-Lay route invoice (thermal printer).
- Header: INVOICE # is the invoice number (digits only); DATE like "01 Aug 2026" becomes 2026-08-01; TOTAL DUE is the total.
- Item rows have the columns QTY EACH, UPC, DESCRIPTION, ITEM, EACH COST, TOTAL AMOUNT, RETAIL AMOUNT, TAX. The UPC column holds only the
  last digits of the UPC (for example 25955, 3422 or 78): copy them as printed. ITEM is 8 digits; on some rows it is printed on the row
  below, next to case-pack text such as "1 5REG" (ignore that text).
- quantity = QTY EACH; price = EACH COST (4 decimals, for example 1.9500); amount = TOTAL AMOUNT; item = ITEM; units = null; group = null.
- The rows sit under section titles "**SALES**" and "**RETURNS**", each under a line "MANUFACTURER: 28400 FRITOLAY": give that 5-digit
  number as manufacturer on every row of its section. A row under RETURNS has isReturn true, with its quantity as printed (positive).
- summary.units = TOTAL EXTENDED EACHES SOLD; summary.cases = null. groups: none (an empty list).`,
  EFDINC: `Ed F. Davis, Inc. beer invoice (dot-matrix print).
- Header: Invoice is the invoice number; Date (the year may be cut off, like "08/04/202": give the full date you can tell and say so in
  "unreadable"); Total Sale is the total.
- Columns: ID (6 digits), QTY, PRODUCT, UPC (like 0-18200-20038-0), PRICE, DEP, DISC, NET, TOTAL.
- A long product name can run into the UPC column: "BDL CHELADA 24/12oz. 2/10-18200-20351-0" is the product "BDL CHELADA 24/12oz. 2/1" and
  the UPC "0-18200-20351-0". The UPC is always the last 0-00000-00000-0 group right before the price.
- item = ID; quantity = QTY; price = NET (the price after the discount); amount = TOTAL; units = null; manufacturer = null; group = null;
  isReturn false.
- summary.cases = the quantity printed after "Totals"; summary.units = null. groups: none (an empty list).`,
  PEPSIC: `PepsiCo Beverages invoice (thermal printer).
- Header: INVOICE # is the invoice number (a leading digit may be faint: read it with care); the date like 08/19/2026 becomes 2026-08-19;
  Amount Due is the total.
- Items are grouped under bold package headers such as "11OZ PL 1/12 TBG", "12OZ CN 12/2 FM" or "5G BIB": give that header as group on
  every item under it.
- Each item takes two printed lines: first "DESCRIPTION UPC" (the UPC like 0-48500-20603-4 or 8-10063-71107-8), then
  "Whlsl Cases Units Net Amount", for example "33.00  1  12 25.15  25.15". Units and Net can print run together, like "1225.15": that is
  units 12 and net 25.15.
- quantity = Cases; units = Units; price = Net; amount = Amount; item = null; manufacturer = null; isReturn false.
- Each group ends with "SUBTOTAL cases units amount": give one entry in groups per package header, in order, with its subtotal.
- summary.cases and summary.units: Cases and Total Units in the SALES SUMMARY near the top.`,
};

const nullable = (type: 'string' | 'integer') => ({ anyOf: [{ type }, { type: 'null' }] });

/** The shape of the answer (the API holds the reader to it). */
export const READ_SCHEMA = {
  type: 'object',
  properties: {
    invoiceNumber: { ...nullable('string'), description: 'the invoice number as printed, digits only' },
    date: { ...nullable('string'), description: 'the invoice date, YYYY-MM-DD' },
    total: { ...nullable('string'), description: 'the amount due as printed, for example 3778.20' },
    lines: {
      type: 'array',
      description: 'every item line, in the order printed, each once',
      items: {
        type: 'object',
        properties: {
          upc: { ...nullable('string'), description: 'as printed, with its dashes' },
          description: nullable('string'),
          item: { ...nullable('string'), description: "the supplier's item number or ID, as printed" },
          quantity: nullable('integer'),
          units: nullable('integer'),
          price: nullable('string'),
          amount: nullable('string'),
          isReturn: { type: 'boolean' },
          manufacturer: nullable('string'),
          group: nullable('string'),
        },
        required: ['upc', 'description', 'item', 'quantity', 'units', 'price', 'amount', 'isReturn', 'manufacturer', 'group'],
        additionalProperties: false,
      },
    },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, cases: nullable('integer'), units: nullable('integer'), amount: nullable('string') },
        required: ['name', 'cases', 'units', 'amount'],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'object',
      properties: { cases: nullable('integer'), units: nullable('integer') },
      required: ['cases', 'units'],
      additionalProperties: false,
    },
    unreadable: { type: 'array', items: { type: 'string' }, description: 'anything that could not be read, and where' },
  },
  required: ['invoiceNumber', 'date', 'total', 'lines', 'groups', 'summary', 'unreadable'],
  additionalProperties: false,
} as const;

export function readPrompt(supplier: PdiSupplier, photoCount: number): string {
  const name = PDI_SUPPLIERS.find((s) => s.code === supplier)?.name ?? supplier;
  return `${GENERAL}\n\nThis invoice is from ${name}, in ${photoCount} photo${photoCount === 1 ? '' : 's'}.\n${LAYOUTS[supplier]}`;
}

// ── The answer, as the checks take it ────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : null);

/** The reader's JSON as a PaperInvoice; anything of the wrong kind becomes null, which the checks then name. */
export function paperFromRead(raw: any): { paper: PaperInvoice; unreadable: string[] } {
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
  return {
    paper: { invoiceNumber: str(raw?.invoiceNumber), date: str(raw?.date), total: str(raw?.total), lines, groups, summary },
    unreadable: (Array.isArray(raw?.unreadable) ? raw.unreadable : []).filter((u: unknown) => typeof u === 'string').slice(0, 50),
  };
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Reads one invoice from its photos. `client` is for tests; the server's key is used otherwise. */
export async function readInvoice(supplier: PdiSupplier, photos: InvoicePhoto[], client?: Anthropic): Promise<InvoiceRead> {
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
  content.push({ type: 'text', text: readPrompt(supplier, photos.length) });

  let message: Anthropic.Message | null = null;
  let model = PDI_READ_MODELS[0];
  for (const candidate of PDI_READ_MODELS) {
    model = candidate;
    try {
      message = await api.messages.stream({
        model,
        max_tokens: MAX_OUTPUT,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: jsonSchemaOutputFormat(READ_SCHEMA as any) },
        messages: [{ role: 'user', content }],
      }).finalMessage();
      break;
    } catch (e) {
      if (e instanceof AnthropicClient.NotFoundError && candidate !== PDI_READ_MODELS[PDI_READ_MODELS.length - 1]) continue; // not on this account
      if (e instanceof AnthropicClient.RateLimitError || e instanceof AnthropicClient.InternalServerError) throw new PdiReadError('The reader is busy right now. Try again in a minute.');
      if (e instanceof AnthropicClient.APIError) throw new PdiReadError(`The reader could not take these photos (${e.status ?? 'no answer'}). Try again, or with fewer photos.`);
      throw e;
    }
  }
  if (!message) throw new PdiReadError('The reader did not answer. Try again.');
  if (message.stop_reason === 'refusal') throw new PdiReadError('The reader would not read these photos. Check they show the invoice.');
  if (message.stop_reason === 'max_tokens') throw new PdiReadError('The invoice is too long to read in one go. Split it: read the photos in two invoices.');
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new PdiReadError('The reader\'s answer could not be understood. Try again.'); }
  const { paper, unreadable } = paperFromRead(raw);
  const inputTokens = message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
  const outputTokens = message.usage.output_tokens;
  const price = PRICES[message.model] ?? PRICES[model];
  return {
    paper, unreadable, model: message.model ?? model,
    usage: { inputTokens, outputTokens },
    costCents: price ? Math.round((inputTokens * price[0] + outputTokens * price[1]) / 10_000) : null,
  };
}
