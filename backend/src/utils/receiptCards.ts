// Receipt cards (2026-10-13, reworked 2026-10-16): what the server remembers about the cards on a customer's scanned receipts, so receipts
// picked up off the floor stand out. Only the card brand and its last 4 digits are kept (allowed by the card rules), on the scan itself,
// refused scans included; customers never see this, HQ does on the customer's profile. A real customer pays with the same card or two
// again and again; someone scanning receipts off the floor shows a new card nearly every time. So a new card is approved (no work for the
// staff) and every card is counted, and a scan is HELD for a manager when the pattern says so:
//   NEW_CARD            the card's first scan on this account (only noted, not held)
//   ONE_TIME_CARDS      a new card, and the account already has receiptOneTimeCards cards seen only once in 90 days
//   CARD_OTHER_ACCOUNT  the card is on another customer's scan or HQ entry (could be family: a person decides)
//   MANY_CARDS          more cards than receiptMaxCards30d on this customer's receipts in 30 days
//   NO_CARD             paid in cash, or no card on the receipt (always held; over receiptCashPerWeek such receipts a week is refused)
//   PAST_REJECTED       one of this customer's scans was rejected in the last receiptRejectHoldDays days
// A card proven in person never counts against the customer: on a receipt HQ entered for them, or on a receipt that had already earned
// points at the register (the cashier scanned their QR for that very sale).
import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { rule } from './appSettings';

const DAY = 86_400_000;

// Debit networks that run a card of any brand (one Visa debit card was PULSE on one receipt and INTERLNK on another, 2026-10-16)
const ROUTING_NETWORKS = ['DEBIT', 'USDEBIT', 'PULSE', 'INTERLNK', 'INTERLINK', 'STAR', 'NYCE', 'ACCEL', 'SHAZAM', 'JEANIE', 'AFFN', 'CU24'];

/** "Master Card", "MC" and "MASTERCARD" are one brand; a debit network (PULSE, STAR...) is no brand; unknown brands are kept as printed. */
export function brandKey(b: string | null | undefined): string | null {
  const s = (b ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return null;
  if (s.startsWith('VISA')) return 'VISA';
  if (s === 'MC' || s.startsWith('MASTER') || s.startsWith('MAESTRO')) return 'MASTERCARD';
  if (s.startsWith('AMEX') || s.startsWith('AMERICANEXPRESS')) return 'AMEX';
  if (s.startsWith('DISC')) return 'DISCOVER';
  if (s.includes('EBT')) return 'EBT';
  if (ROUTING_NETWORKS.some((n) => s === n || s.startsWith(n))) return null;
  return s.slice(0, 20);
}

// The chip's application id names the card's own brand, whatever network ran the sale
const AID_BRANDS: [string, string][] = [
  ['A000000003', 'VISA'], ['A000000098', 'VISA'], ['A000000004', 'MASTERCARD'], ['A000000042', 'MASTERCARD'],
  ['A000000025', 'AMEX'], ['A000000152', 'DISCOVER'], ['A000000324', 'DISCOVER'], ['A000000065', 'JCB'], ['A000000333', 'UNIONPAY'],
];
export function brandOfAid(aid: string | null | undefined): string | null {
  const a = (aid ?? '').toUpperCase();
  return AID_BRANDS.find(([p]) => a.startsWith(p))?.[1] ?? null;
}

/** The brand to keep for a read receipt's card: from the chip id when printed, else from the printed brand. */
export const cardBrandOf = (read: { cardAid?: string | null; cardBrand?: string | null }) => brandOfAid(read.cardAid) ?? brandKey(read.cardBrand);

/** The same card: the same last 4, and the same brand when both are known. */
export const sameCard = (a: { last4: string; brand: string | null }, b: { last4: string; brand: string | null }) =>
  a.last4 === b.last4 && (!a.brand || !b.brand || brandKey(a.brand) === brandKey(b.brand) || !brandKey(a.brand) || !brandKey(b.brand));

export type ScanOutcome = 'APPROVED' | 'REJECTED' | 'HELD';

/** What became of a scan: approved at once or by a manager, rejected, or still waiting. */
export function outcomeOf(status: string, saleStatuses: string[]): ScanOutcome {
  if (status === 'AUTO' || saleStatuses.includes(TransactionStatus.APPROVED)) return 'APPROVED';
  if (saleStatuses.length > 0 && saleStatuses.every((s) => s === TransactionStatus.REJECTED || s === 'VOIDED')) return 'REJECTED';
  return 'HELD';
}

export interface ScanWithOutcome {
  id: string; customerId: string; createdAt: Date; cardLast4: string | null; cardBrand: string | null; paymentMethod: string | null;
  total: number | null; outcome: ScanOutcome;
}

/** Held or approved scans (refused and failed ones never became sales) with what became of them. */
export async function scansWithOutcome(where: Record<string, unknown>): Promise<ScanWithOutcome[]> {
  const scans = await prisma.receiptScan.findMany({
    where: { ...where, status: { in: ['HELD', 'AUTO'] } },
    select: { id: true, customerId: true, createdAt: true, cardLast4: true, cardBrand: true, paymentMethod: true, total: true, status: true, transactionIds: true },
    orderBy: { createdAt: 'desc' },
  });
  const ids = scans.flatMap((s) => s.transactionIds ?? []);
  const sales = ids.length ? await prisma.pointsTransaction.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }) : [];
  const statusOf = new Map(sales.map((s) => [s.id, s.status as string]));
  return scans.map((s) => ({
    id: s.id, customerId: s.customerId, createdAt: s.createdAt, cardLast4: s.cardLast4, cardBrand: s.cardBrand, paymentMethod: s.paymentMethod,
    total: s.total, outcome: outcomeOf(s.status, (s.transactionIds ?? []).map((t) => statusOf.get(t)).filter(Boolean) as string[]),
  }));
}

export interface CardCheck { flags: string[]; refuse: string | null }

/** A card on any of the customer's receipts: scans (refused ones too) and HQ entries, with whether it was proven in person. */
interface CardSighting { last4: string; brand: string | null; createdAt: Date; proven: boolean }
async function cardSightings(where: Record<string, unknown>): Promise<(CardSighting & { customerId: string; status: string })[]> {
  const rows = await prisma.receiptScan.findMany({
    where: { ...where, cardLast4: { not: null }, status: { in: ['HELD', 'AUTO', 'REFUSED', 'HQ'] } },
    select: { customerId: true, cardLast4: true, cardBrand: true, createdAt: true, status: true, flags: true },
  });
  return rows.map((r) => ({
    customerId: r.customerId, status: r.status, last4: r.cardLast4!, brand: r.cardBrand, createdAt: r.createdAt,
    proven: r.status === 'HQ' || (r.flags ?? '').includes('AT_REGISTER_CARD'),
  }));
}

/** The card checks for a new scan, before it is saved. */
export async function checkScanCard(customerId: string, card: { last4: string | null; brand: string | null; method: string | null }, now = new Date()): Promise<CardCheck> {
  const flags: string[] = [];
  const mine = await scansWithOutcome({ customerId, createdAt: { gte: new Date(now.getTime() - 365 * DAY) } });

  const rejectDays = rule('receiptRejectHoldDays');
  if (rejectDays > 0 && mine.some((s) => s.outcome === 'REJECTED' && s.createdAt.getTime() >= now.getTime() - rejectDays * DAY)) flags.push('PAST_REJECTED');

  if (!card.last4) {
    const cashWeek = mine.filter((s) => !s.cardLast4 && s.createdAt.getTime() >= now.getTime() - 7 * DAY).length;
    const cap = rule('receiptCashPerWeek');
    if (cashWeek >= cap) {
      return { flags, refuse: cap === 0
        ? 'Only receipts paid by card can be scanned. Show your QR code at the register for cash purchases.'
        : `You can scan ${cap} cash receipt${cap === 1 ? '' : 's'} a week. Show your QR code at the register for cash purchases.` };
    }
    flags.push('NO_CARD');
    return { flags, refuse: null };
  }

  const here = { last4: card.last4, brand: card.brand };
  const seen = await cardSightings({ customerId, createdAt: { gte: new Date(now.getTime() - 90 * DAY) } });
  const proven = seen.filter((s) => s.proven);
  const isProven = (c: { last4: string; brand: string | null }) => proven.some((p) => sameCard(p, c));
  const before = seen.filter((s) => sameCard(s, here));
  if (before.length === 0) flags.push('NEW_CARD');

  // The floor pattern: cards seen once and never again, not counting cards proven in person
  const groups: { last4: string; brand: string | null; count: number }[] = [];
  for (const s of seen) {
    const g = groups.find((x) => sameCard(x, s));
    if (g) { g.count++; if (!g.brand && s.brand) g.brand = s.brand; } else groups.push({ last4: s.last4, brand: s.brand, count: 1 });
  }
  const oneTime = groups.filter((g) => g.count === 1 && !isProven(g) && !sameCard(g, here)).length;
  if (before.length === 0 && !isProven(here) && oneTime >= rule('receiptOneTimeCards')) flags.push('ONE_TIME_CARDS');

  // On another account (held, approved, refused or entered by HQ: the card being tried elsewhere is enough to look)
  const others = await cardSightings({ cardLast4: card.last4, customerId: { not: customerId } });
  if (others.some((s) => sameCard(s, here))) flags.push('CARD_OTHER_ACCOUNT');

  const recent = seen.filter((s) => s.createdAt.getTime() >= now.getTime() - 30 * DAY && !s.proven);
  const distinct: { last4: string; brand: string | null }[] = [];
  for (const c of [...recent, ...(isProven(here) ? [] : [here])]) if (!distinct.some((d) => sameCard(d, c))) distinct.push(c);
  if (distinct.length > rule('receiptMaxCards30d')) flags.push('MANY_CARDS');

  return { flags, refuse: null };
}

export interface CardSummary {
  last4: string; brand: string | null; firstSeen: Date; lastSeen: Date;
  approved: number; held: number; rejected: number; otherAccounts: { id: string; name: string | null }[];
}

/** HQ's view of a customer's receipt cards: each card with its scans, and the other accounts the same card was scanned on. */
export async function customerReceiptCards(customerId: string) {
  const mine = await scansWithOutcome({ customerId });
  const cards: (CardSummary & { scans: ScanWithOutcome[] })[] = [];
  for (const s of mine) {
    if (!s.cardLast4) continue;
    const c = { last4: s.cardLast4, brand: brandKey(s.cardBrand) };
    let row = cards.find((x) => sameCard(x, c));
    if (!row) { row = { ...c, firstSeen: s.createdAt, lastSeen: s.createdAt, approved: 0, held: 0, rejected: 0, otherAccounts: [], scans: [] }; cards.push(row); }
    if (!row.brand && c.brand) row.brand = c.brand;
    if (s.createdAt < row.firstSeen) row.firstSeen = s.createdAt;
    if (s.createdAt > row.lastSeen) row.lastSeen = s.createdAt;
    row[s.outcome === 'APPROVED' ? 'approved' : s.outcome === 'REJECTED' ? 'rejected' : 'held']++;
  }
  if (cards.length) {
    const others = await prisma.receiptScan.findMany({
      where: { cardLast4: { in: [...new Set(cards.map((c) => c.last4))] }, customerId: { not: customerId }, status: { in: ['HELD', 'AUTO'] } },
      select: { customerId: true, cardLast4: true, cardBrand: true, customer: { select: { id: true, name: true } } },
    });
    for (const o of others) {
      const row = cards.find((c) => sameCard(c, { last4: o.cardLast4!, brand: brandKey(o.cardBrand) }));
      if (row && !row.otherAccounts.some((a) => a.id === o.customerId)) row.otherAccounts.push({ id: o.customerId, name: o.customer?.name ?? null });
    }
  }
  const cash = mine.filter((s) => !s.cardLast4);
  const count = (list: ScanWithOutcome[], o: ScanOutcome) => list.filter((s) => s.outcome === o).length;
  const since30 = Date.now() - 30 * DAY;
  return {
    scans: { total: mine.length, approved: count(mine, 'APPROVED'), held: count(mine, 'HELD'), rejected: count(mine, 'REJECTED') },
    cardsLast30Days: cards.filter((c) => c.lastSeen.getTime() >= since30).length,
    maxCards30Days: rule('receiptMaxCards30d'),
    cards: cards.map(({ scans: _s, ...c }) => c).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()),
    noCard: { approved: count(cash, 'APPROVED'), held: count(cash, 'HELD'), rejected: count(cash, 'REJECTED') },
  };
}
