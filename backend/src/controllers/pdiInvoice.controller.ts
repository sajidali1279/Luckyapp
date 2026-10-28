// Invoices to PDI (2026-10-27; vendors read off the invoice since 2026-10-28): the page's server side. A person picks the store and adds the
// photos of one paper invoice; the photos are stored privately (utils/pdiPhotos.ts) and read in the background (utils/pdiRead.ts), and the
// page asks until the reading is done. The vendor is read off the invoice and matched by its names (utils/pdiVendors.ts); a vendor seen for
// the first time is chosen or added once, and its printed name is remembered. Then the page shows every line with what to look at
// (utils/pdiInvoice.ts): a person corrects what was misread, confirms a units per case once (remembered for the vendor's product), or
// accepts a problem after looking. The file for PDI downloads once nothing is left open.
// HQ can use it for any store, a manager for the stores they manage; anyone using it can add a vendor, HQ edits them. Off until HQ switches
// it on (Settings > Features: Invoices to PDI).
import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';
import { feature } from '../utils/appSettings';
import { audit } from '../utils/audit';
import { isRealDateKey, storeDateKey } from '../utils/storeTime';
import {
  convertInvoice, pdiFile, pdiFileName, fullUpc, headerProblems, lineProblems, linesTotalCents, printedCents,
  KnownUnits, PaperInvoice, PdiFileError, Problem, VendorRules,
} from '../utils/pdiInvoice';
import { readInvoice, paperFromRead, InvoicePhoto, PdiReadError, MAX_PHOTOS } from '../utils/pdiRead';
import { matchVendor, vendorKey } from '../utils/pdiVendors';
import { preparePhoto, storePhoto, photoLinks, fetchPhoto, destroyPhotos } from '../utils/pdiPhotos';

export const MAX_READS_PER_HOUR = 30; // everyone together: a stuck page cannot run up the AI bill
const STALE_READ_MS = 10 * 60_000;    // a reading this old did not finish (the server restarted on the way): shown as failed
const PAGE = 30;
const MAX_LINES = 400;
const OFF = 'Invoices to PDI is switched off. HQ can switch it on in Settings > Features.';

type Vendor = NonNullable<Awaited<ReturnType<typeof prisma.pdiVendor.findUnique>>>;
type Row = NonNullable<Awaited<ReturnType<typeof prisma.pdiInvoice.findUnique>>> & { store: { id: string; name: string }; vendor: Vendor | null };
const withParts = { store: { select: { id: true, name: true } }, vendor: true } as const;

/** What the file needs to know about a vendor, from its row. */
export function vendorRules(v: Vendor | null): VendorRules | null {
  if (!v) return null;
  return {
    code: v.pdiCode ?? '', name: v.name, sellsBy: v.sellsBy === 'EACH' ? 'EACH' : 'CASE',
    itemDigits: v.itemDigits === 'LAST6' || v.itemDigits === 'NONE' ? v.itemDigits : 'FIRST6', itemLength: v.itemLength,
  };
}

// ── Who may see which store ──────────────────────────────────────────────────

/** The stores a person may use: null for every store (HQ, or a manager with access to all of them). */
async function storeIdsFor(user: { id: string; role: Role }): Promise<string[] | null> {
  if (hasMinRole(user.role, Role.SUPER_ADMIN)) return null;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { allStoresAccess: true } });
  if (u?.allStoresAccess) return null;
  const roles = await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } });
  return roles.map((r) => r.storeId);
}

async function canUseStore(user: { id: string; role: Role }, storeId: string): Promise<boolean> {
  const ids = await storeIdsFor(user);
  return ids === null || ids.includes(storeId);
}

/** The invoice, if this person may open it (the answer is sent otherwise). A reading that never finished is shown as failed. */
async function loadFor(req: AuthRequest, res: Response, id = String(req.params.id)): Promise<Row | null> {
  const row = await prisma.pdiInvoice.findUnique({ where: { id }, include: withParts }) as Row | null;
  if (!row) { res.status(404).json({ success: false, error: 'That invoice is not here any more.' }); return null; }
  if (!(await canUseStore(req.user!, row.storeId))) { res.status(403).json({ success: false, error: 'That invoice is for a store you do not manage.' }); return null; }
  if (row.status === 'READING' && row.readStartedAt && Date.now() - row.readStartedAt.getTime() > STALE_READ_MS) {
    const readError = 'The reading did not finish. Read it again.';
    await prisma.pdiInvoice.update({ where: { id: row.id }, data: { status: 'FAILED', readError } });
    return { ...row, status: 'FAILED', readError };
  }
  return row;
}

// ── Reading in the background ────────────────────────────────────────────────

const inFlight = new Set<Promise<void>>();
/** For tests: resolves when every reading started so far has finished. */
export async function readsSettled(): Promise<void> { await Promise.all([...inFlight]); }

/** The invoice number, date and total as the list and the duplicate warning use them. */
function headerOf(paper: PaperInvoice) {
  const digits = (paper.invoiceNumber ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return { invoiceNumber: digits || null, invoiceDate: paper.date && isRealDateKey(paper.date) ? paper.date : null, totalCents: printedCents(paper.total) };
}

/** Reads the photos (given, or fetched from storage for a second reading) and finds the vendor by the name read. A vendor a person chose
 *  before stays when the name read now matches none. */
function startRead(id: string, photos: InvoicePhoto[] | null, photoIds: string[], vendorId: string | null) {
  const job = (async () => {
    try {
      const shots = photos ?? await Promise.all(photoIds.map(async (p) => ({ buffer: await fetchPhoto(p), mediaType: 'image/jpeg' })));
      const vendors = await prisma.pdiVendor.findMany({ select: { id: true, name: true, aliases: true, readerNotes: true } });
      const read = await readInvoice(shots, vendors.filter((v) => v.readerNotes).map((v) => ({ name: v.name, notes: v.readerNotes! })));
      const matched = matchVendor(read.vendor.name, vendors);
      await prisma.pdiInvoice.update({ where: { id }, data: {
        status: 'READ', paper: read.paper as any, ...headerOf(read.paper), checked: [], readError: null, readModel: read.model,
        vendorId: matched?.id ?? vendorId, vendorRead: read.vendor.name,
        readUsage: { ...read.usage, costCents: read.costCents, unreadable: read.unreadable, vendor: read.vendor } as any,
      } });
    } catch (e: any) {
      if (!(e instanceof PdiReadError)) console.error('[pdi] reading failed:', id, e?.message ?? e);
      const readError = e instanceof PdiReadError ? e.message : 'The reading failed. Try again.';
      await prisma.pdiInvoice.update({ where: { id }, data: { status: 'FAILED', readError } }).catch(() => {});
    }
  })();
  inFlight.add(job);
  void job.finally(() => inFlight.delete(job));
}

async function readsThisHour(): Promise<number> {
  return prisma.pdiInvoice.count({ where: { readStartedAt: { gte: new Date(Date.now() - 3_600_000) } } });
}

// ── The review: every line with its problems ─────────────────────────────────

async function knownUnitsFor(vendorId: string | null): Promise<(upc: string) => KnownUnits | undefined> {
  if (!vendorId) return () => undefined;
  const rows = await prisma.pdiProductUnits.findMany({ where: { vendorId } });
  const byUpc = new Map(rows.map((r) => [r.upc, { units: r.unitsPerCase, from: r.source === 'CONFIRMED' ? 'confirmed' as const : 'learned' as const }]));
  return (upc) => byUpc.get(fullUpc(upc));
}

/** What the page shows: each problem with a key (to accept it), whether it may be accepted (not blocking, and the file can still be
 *  made), and whether it is. */
function review(row: Row, known: (upc: string) => KnownUnits | undefined) {
  const paper = row.paper as unknown as PaperInvoice | null;
  if (!paper) return null;
  const conv = convertInvoice(vendorRules(row.vendor), paper, { knownUnits: known, today: storeDateKey() });
  const checked = new Set(row.checked);
  const blocking = new Set(headerProblems(conv.header).map((p) => p.field));
  const mark = (key: string, p: Problem, fileable: boolean) => {
    const canCheck = fileable && !p.blocking;
    return { ...p, key, canCheck, checked: canCheck && checked.has(key) };
  };
  const lines = conv.lines.map((c, i) => {
    const fileable = lineProblems(c.line).length === 0;
    return { line: c.line, unitsFrom: c.unitsFrom, problems: c.problems.map((p) => mark(`${i}|${p.field}|${p.message}`, p, fileable)) };
  });
  const problems = conv.problems.map((p) => mark(`-|${p.field}|${p.message}`, p, !blocking.has(p.field) && lines.length > 0));
  const open = [...problems, ...lines.flatMap((l) => l.problems)].filter((p) => !p.checked).length;
  return {
    header: conv.header, lines, problems, open,
    canDownload: open === 0 && lines.length > 0 && blocking.size === 0,
    fileName: blocking.size === 0 ? pdiFileName(conv.header) : null,
    linesTotalCents: linesTotalCents(conv.lines.map((c) => c.line)),
  };
}

const vendorOut = (v: Vendor | null) => (v ? { id: v.id, name: v.name, pdiCode: v.pdiCode, sellsBy: v.sellsBy, itemDigits: v.itemDigits, itemLength: v.itemLength } : null);

async function present(row: Row) {
  const [known, people, duplicates] = await Promise.all([
    knownUnitsFor(row.vendorId),
    prisma.user.findMany({ where: { id: { in: [row.createdById, row.downloadedById, row.updatedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    row.invoiceNumber && row.vendorId ? prisma.pdiInvoice.findMany({
      where: { vendorId: row.vendorId, invoiceNumber: row.invoiceNumber, id: { not: row.id } },
      select: { id: true, status: true, createdAt: true, store: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5,
    }) : Promise.resolve([]),
  ]);
  const name = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? 'Someone' : null);
  const usage = row.readUsage as { vendor?: { name: string | null; address: string | null; phone: string | null } } | null;
  return {
    id: row.id, store: row.store, vendor: vendorOut(row.vendor), vendorRead: row.vendorRead, vendorPrinted: usage?.vendor ?? null,
    status: row.status, readError: row.readError, readModel: row.readModel, readUsage: row.readUsage,
    createdAt: row.createdAt, createdBy: name(row.createdById), updatedAt: row.updatedAt, updatedBy: name(row.updatedById),
    downloadedAt: row.downloadedAt, downloadedBy: name(row.downloadedById),
    photos: row.photoIds.map(photoLinks), paper: row.paper, review: review(row, known),
    duplicates: duplicates.map((d) => ({ id: d.id, status: d.status, createdAt: d.createdAt, storeName: d.store.name })),
  };
}

/** Remembers a printed name as one of the vendor's names, so the next invoice printed that way finds it. */
async function learnName(vendor: Vendor, printed: string | null) {
  const key = vendorKey(printed);
  if (!key || key === vendorKey(vendor.name) || vendor.aliases.includes(key)) return;
  await prisma.pdiVendor.update({ where: { id: vendor.id }, data: { aliases: [...vendor.aliases, key].slice(-50) } });
}

// ── The invoice routes ───────────────────────────────────────────────────────

/** GET /pdi-invoices/meta: whether it is on, and the stores this person may pick. */
export async function pdiMeta(req: AuthRequest, res: Response) {
  const ids = await storeIdsFor(req.user!);
  const stores = await prisma.store.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  res.json({ success: true, data: {
    enabled: feature('pdiInvoices'), readerReady: !!process.env.ANTHROPIC_API_KEY, maxPhotos: MAX_PHOTOS, stores,
    canEditVendors: hasMinRole(req.user!.role, Role.SUPER_ADMIN),
  } });
}

/** GET /pdi-invoices?storeId&vendorId&page: the invoices done so far, newest first. */
export async function listPdiInvoices(req: AuthRequest, res: Response) {
  const ids = await storeIdsFor(req.user!);
  const storeId = typeof req.query.storeId === 'string' && req.query.storeId ? req.query.storeId : null;
  if (storeId && ids && !ids.includes(storeId)) { res.status(403).json({ success: false, error: 'That store is not one you manage.' }); return; }
  const vendorId = typeof req.query.vendorId === 'string' && req.query.vendorId ? req.query.vendorId : null;
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const where = { ...(storeId ? { storeId } : ids ? { storeId: { in: ids } } : {}), ...(vendorId ? { vendorId: vendorId === 'none' ? null : vendorId } : {}) };
  const [rows, total] = await Promise.all([
    prisma.pdiInvoice.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE, skip: (page - 1) * PAGE, include: withParts }) as Promise<Row[]>,
    prisma.pdiInvoice.count({ where }),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } });
  const stale = (r: Row) => r.status === 'READING' && !!r.readStartedAt && Date.now() - r.readStartedAt.getTime() > STALE_READ_MS;
  res.json({ success: true, data: {
    invoices: rows.map((r) => ({
      id: r.id, store: r.store, vendor: r.vendor ? { id: r.vendor.id, name: r.vendor.name } : null, vendorRead: r.vendorRead, status: stale(r) ? 'FAILED' : r.status,
      invoiceNumber: r.invoiceNumber, invoiceDate: r.invoiceDate, totalCents: r.totalCents, photoCount: r.photoIds.length,
      createdAt: r.createdAt, createdBy: people.find((p) => p.id === r.createdById)?.name ?? null, downloadedAt: r.downloadedAt,
    })),
    total, page, pages: Math.max(1, Math.ceil(total / PAGE)),
  } });
}

/** POST /pdi-invoices (multipart "photos" + storeId): store the photos and start reading them. The vendor is read off the invoice. */
export async function createPdiInvoice(req: AuthRequest, res: Response) {
  if (!feature('pdiInvoices')) { res.status(403).json({ success: false, code: 'OFF', error: OFF }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ success: false, error: 'Invoice reading is not set up on the server.' }); return; }
  const { storeId } = req.body as { storeId?: string };
  if (!storeId || !(await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }))) { res.status(400).json({ success: false, error: 'Pick the store.' }); return; }
  if (!(await canUseStore(req.user!, storeId))) { res.status(403).json({ success: false, error: 'That store is not one you manage.' }); return; }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) { res.status(400).json({ success: false, error: 'Add the photos of the invoice.' }); return; }
  if (files.length > MAX_PHOTOS) { res.status(400).json({ success: false, error: `At most ${MAX_PHOTOS} photos for one invoice.` }); return; }
  if ((await readsThisHour()) >= MAX_READS_PER_HOUR) { res.status(429).json({ success: false, error: 'Many invoices were read in the last hour. Try again in a little while.' }); return; }
  const prepared = await Promise.all(files.map((f) => preparePhoto(f.buffer)));
  const bad = prepared.findIndex((p) => 'error' in p);
  if (bad >= 0) { res.status(400).json({ success: false, error: `Photo ${bad + 1}: ${(prepared[bad] as { error: string }).error}` }); return; }
  const data = prepared.map((p) => (p as { data: Buffer }).data);
  const photoIds = await Promise.all(data.map(storePhoto));
  const row = await prisma.pdiInvoice.create({ data: { storeId, status: 'READING', photoIds, readStartedAt: new Date(), createdById: req.user!.id } });
  startRead(row.id, data.map((buffer) => ({ buffer, mediaType: 'image/jpeg' })), photoIds, null);
  res.status(201).json({ success: true, data: { id: row.id } });
}

/** GET /pdi-invoices/:id: the invoice, its photos, and the review. */
export async function getPdiInvoice(req: AuthRequest, res: Response) {
  const row = await loadFor(req, res);
  if (!row) return;
  res.json({ success: true, data: await present(row) });
}

/** PATCH /pdi-invoices/:id { vendorId?, paper?, check?: [{ key, on }], units?: [{ upc, unitsPerCase }] }: the vendor it is from (its
 *  printed name is remembered for that vendor), corrections, problems accepted after a look, and units per case confirmed for the vendor's
 *  products. */
export async function updatePdiInvoice(req: AuthRequest, res: Response) {
  const row = await loadFor(req, res);
  if (!row) return;
  if (row.status === 'READING') { res.status(409).json({ success: false, error: 'It is still being read.' }); return; }
  const { vendorId, paper, check, units } = req.body as { vendorId?: unknown; paper?: unknown; check?: unknown; units?: unknown };
  const data: Record<string, unknown> = { updatedById: req.user!.id };
  let vendor = row.vendor;
  if (vendorId !== undefined) {
    if (typeof vendorId !== 'string' || !(vendor = await prisma.pdiVendor.findUnique({ where: { id: vendorId } }))) {
      res.status(400).json({ success: false, error: 'That vendor is not here any more.' }); return;
    }
    data.vendorId = vendor.id;
    await learnName(vendor, row.vendorRead);
    if (row.status === 'DONE') data.status = 'READ';
  }
  if (paper !== undefined) {
    const clean = paperFromRead(paper).paper;
    if (clean.lines.length > MAX_LINES) { res.status(400).json({ success: false, error: `At most ${MAX_LINES} lines on one invoice.` }); return; }
    Object.assign(data, { paper: clean as any, ...headerOf(clean) });
    if (row.status === 'DONE') data.status = 'READ'; // the file made before this change is out of date
  }
  if (Array.isArray(check)) {
    const set = new Set(row.checked);
    for (const c of check.slice(0, 500)) {
      if (typeof c?.key !== 'string' || c.key.length > 600) continue;
      if (c.on) set.add(c.key); else set.delete(c.key);
    }
    data.checked = [...set].slice(-2000);
  }
  const confirmed = Array.isArray(units) ? units.slice(0, MAX_LINES).filter((u: any) => typeof u?.upc === 'string' && /^\d{11}$/.test(u.upc)
    && Number.isSafeInteger(u.unitsPerCase) && u.unitsPerCase >= 1 && u.unitsPerCase <= 999_999) : [];
  if (confirmed.length && !vendor) { res.status(400).json({ success: false, error: 'Say which vendor this invoice is from first.' }); return; }
  for (const u of confirmed as { upc: string; unitsPerCase: number; description?: unknown }[]) {
    const key = { vendorId: vendor!.id, upc: fullUpc(u.upc) };
    const description = typeof u.description === 'string' ? u.description.slice(0, 60) : null;
    await prisma.pdiProductUnits.upsert({
      where: { vendorId_upc: key },
      create: { ...key, unitsPerCase: u.unitsPerCase, source: 'CONFIRMED', description, updatedById: req.user!.id },
      update: { unitsPerCase: u.unitsPerCase, source: 'CONFIRMED', ...(description ? { description } : {}), updatedById: req.user!.id },
    });
  }
  const saved = await prisma.pdiInvoice.update({ where: { id: row.id }, data: data as any, include: withParts }) as Row;
  res.json({ success: true, data: await present(saved) });
}

/** POST /pdi-invoices/:id/read: read the photos again (what was corrected is replaced by the new reading). */
export async function rereadPdiInvoice(req: AuthRequest, res: Response) {
  if (!feature('pdiInvoices')) { res.status(403).json({ success: false, code: 'OFF', error: OFF }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ success: false, error: 'Invoice reading is not set up on the server.' }); return; }
  const row = await loadFor(req, res);
  if (!row) return;
  if (row.status === 'READING') { res.status(409).json({ success: false, error: 'It is being read now.' }); return; }
  if (!row.photoIds.length) { res.status(400).json({ success: false, error: 'This invoice has no photos to read.' }); return; }
  if ((await readsThisHour()) >= MAX_READS_PER_HOUR) { res.status(429).json({ success: false, error: 'Many invoices were read in the last hour. Try again in a little while.' }); return; }
  await prisma.pdiInvoice.update({ where: { id: row.id }, data: { status: 'READING', readStartedAt: new Date(), readError: null, updatedById: req.user!.id } });
  startRead(row.id, null, row.photoIds, row.vendorId);
  res.json({ success: true });
}

/** GET /pdi-invoices/:id/file: the file for PDI, once nothing is left open. */
export async function downloadPdiFile(req: AuthRequest, res: Response) {
  const row = await loadFor(req, res);
  if (!row) return;
  const rev = review(row, await knownUnitsFor(row.vendorId));
  if (!rev || (row.status !== 'READ' && row.status !== 'DONE')) { res.status(409).json({ success: false, error: 'It has not been read yet.' }); return; }
  if (!rev.canDownload || !rev.fileName) { res.status(409).json({ success: false, error: `Look at every marked problem first: ${rev.open} still open.`, open: rev.open }); return; }
  let text: string;
  try { text = pdiFile(rev.header, rev.lines.map((l) => l.line)); }
  catch (e) { if (e instanceof PdiFileError) { res.status(409).json({ success: false, error: e.message }); return; } throw e; }
  await prisma.pdiInvoice.update({ where: { id: row.id }, data: { status: 'DONE', downloadedAt: new Date(), downloadedById: req.user!.id } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'PDI_FILE_DOWNLOADED', entity: 'PdiInvoice', entityId: row.id,
    details: { vendor: row.vendor?.name, code: rev.header.supplierCode, invoiceNumber: rev.header.invoiceNumber, total: rev.header.totalCents / 100, lines: rev.lines.length },
    storeId: row.storeId, storeName: row.store.name,
  });
  res.setHeader('Content-Type', 'text/plain; charset=us-ascii');
  res.setHeader('Content-Disposition', `attachment; filename="${rev.fileName}"`);
  res.send(text);
}

/** DELETE /pdi-invoices/:id: HQ, or the person who added it while no file has been made from it. */
export async function deletePdiInvoice(req: AuthRequest, res: Response) {
  const row = await loadFor(req, res);
  if (!row) return;
  const hq = hasMinRole(req.user!.role, Role.SUPER_ADMIN);
  if (!hq && (row.createdById !== req.user!.id || row.status === 'DONE')) {
    res.status(403).json({ success: false, error: row.status === 'DONE' ? 'A file was made from it, so only HQ can delete it.' : 'Only HQ or the person who added it can delete it.' });
    return;
  }
  await prisma.pdiInvoice.delete({ where: { id: row.id } });
  await destroyPhotos(row.photoIds);
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'PDI_INVOICE_DELETED', entity: 'PdiInvoice', entityId: row.id,
    details: { vendor: row.vendor?.name ?? row.vendorRead, invoiceNumber: row.invoiceNumber, status: row.status }, storeId: row.storeId, storeName: row.store.name,
  });
  res.json({ success: true });
}

// ── The vendor routes ────────────────────────────────────────────────────────

const SELLS_BY = ['CASE', 'EACH'];
const ITEM_DIGITS = ['FIRST6', 'LAST6', 'NONE'];

/** A vendor's settings from a request, checked; `partial` for an edit (only what is sent). Returns the error in words instead. */
function vendorInput(body: any, partial: boolean): { data: Record<string, unknown> } | { error: string } {
  const data: Record<string, unknown> = {};
  const has = (k: string) => body?.[k] !== undefined;
  if (!partial || has('name')) {
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 60) return { error: 'Give the vendor a name (up to 60 characters).' };
    data.name = name;
  }
  if (!partial || has('pdiCode')) {
    const code = typeof body?.pdiCode === 'string' ? body.pdiCode.trim().toUpperCase() : '';
    if (code && !/^[A-Z0-9]{1,6}$/.test(code)) return { error: "The vendor's code in PDI is 1 to 6 letters or digits, as it is set up in PDI." };
    data.pdiCode = code || null;
  }
  if (!partial || has('sellsBy')) {
    if (!SELLS_BY.includes(body?.sellsBy)) return { error: 'Say whether its quantities count cases or single items.' };
    data.sellsBy = body.sellsBy;
  }
  if (!partial || has('itemDigits')) {
    if (!ITEM_DIGITS.includes(body?.itemDigits)) return { error: 'Say how its item numbers go in the file.' };
    data.itemDigits = body.itemDigits;
  }
  if (has('itemLength')) {
    const n = body.itemLength;
    if (n !== null && n !== '' && !(Number.isSafeInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 12)) return { error: 'Item numbers have 1 to 12 digits.' };
    data.itemLength = n === null || n === '' ? null : Number(n);
  }
  if (has('readerNotes')) {
    const notes = typeof body.readerNotes === 'string' ? body.readerNotes.trim().slice(0, 2000) : '';
    data.readerNotes = notes || null;
  }
  if (has('aliases')) {
    if (!Array.isArray(body.aliases)) return { error: 'The names it is printed as must be a list.' };
    data.aliases = [...new Set(body.aliases.map((a: unknown) => vendorKey(typeof a === 'string' ? a : '')).filter(Boolean))].slice(0, 50);
  }
  return { data };
}

const taken = (e: any) => e?.code === 'P2002';

/** GET /pdi-vendors: every vendor, with how many invoices and remembered products each has. */
export async function listPdiVendors(_req: AuthRequest, res: Response) {
  const [vendors, invoices, units] = await Promise.all([
    prisma.pdiVendor.findMany({ orderBy: { name: 'asc' } }),
    prisma.pdiInvoice.groupBy({ by: ['vendorId'], _count: { _all: true } }),
    prisma.pdiProductUnits.groupBy({ by: ['vendorId'], _count: { _all: true } }),
  ]);
  const n = (rows: any[], id: string) => rows.find((r) => r.vendorId === id)?._count?._all ?? 0;
  res.json({ success: true, data: vendors.map((v) => ({ ...v, invoiceCount: n(invoices, v.id), productCount: n(units, v.id) })) });
}

/** POST /pdi-vendors { name, pdiCode, sellsBy, itemDigits, itemLength?, readerNotes?, invoiceId? }: a vendor seen for the first time.
 *  With invoiceId, that invoice is set to it and its printed name remembered. */
export async function createPdiVendor(req: AuthRequest, res: Response) {
  const input = vendorInput(req.body, false);
  if ('error' in input) { res.status(400).json({ success: false, error: input.error }); return; }
  const invoiceId = typeof req.body?.invoiceId === 'string' ? req.body.invoiceId : null;
  const invoice = invoiceId ? await loadFor(req, res, invoiceId) : null;
  if (invoiceId && !invoice) return;
  let vendor: Vendor;
  try {
    vendor = await prisma.pdiVendor.create({ data: { ...(input.data as any), createdById: req.user!.id, updatedById: req.user!.id } });
  } catch (e) {
    if (taken(e)) { res.status(409).json({ success: false, error: 'Another vendor already has that PDI code.' }); return; }
    throw e;
  }
  if (invoice) {
    await learnName(vendor, invoice.vendorRead);
    await prisma.pdiInvoice.update({ where: { id: invoice.id }, data: { vendorId: vendor.id, updatedById: req.user!.id } });
  }
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'PDI_VENDOR_CREATED', entity: 'PdiVendor', entityId: vendor.id, details: input.data });
  res.status(201).json({ success: true, data: vendor });
}

/** PATCH /pdi-vendors/:id (HQ): a vendor's settings, the names it is printed as, and the notes for the reader. */
export async function updatePdiVendor(req: AuthRequest, res: Response) {
  const input = vendorInput(req.body, true);
  if ('error' in input) { res.status(400).json({ success: false, error: input.error }); return; }
  const id = String(req.params.id);
  if (!(await prisma.pdiVendor.findUnique({ where: { id } }))) { res.status(404).json({ success: false, error: 'That vendor is not here any more.' }); return; }
  try {
    const vendor = await prisma.pdiVendor.update({ where: { id }, data: { ...(input.data as any), updatedById: req.user!.id } });
    audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'PDI_VENDOR_UPDATED', entity: 'PdiVendor', entityId: id, details: input.data });
    res.json({ success: true, data: vendor });
  } catch (e) {
    if (taken(e)) { res.status(409).json({ success: false, error: 'Another vendor already has that PDI code.' }); return; }
    throw e;
  }
}

/** DELETE /pdi-vendors/:id (HQ): a vendor added by mistake. Its invoices wait for a vendor again; its remembered products go. */
export async function deletePdiVendor(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const vendor = await prisma.pdiVendor.findUnique({ where: { id } });
  if (!vendor) { res.status(404).json({ success: false, error: 'That vendor is not here any more.' }); return; }
  await prisma.pdiVendor.delete({ where: { id } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'PDI_VENDOR_DELETED', entity: 'PdiVendor', entityId: id, details: { name: vendor.name, pdiCode: vendor.pdiCode } });
  res.json({ success: true });
}
