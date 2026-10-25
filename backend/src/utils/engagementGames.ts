// The prize game (2026-10-25, admin > Engagement > Prize game): spin the wheel, a scratch card or a lucky number. What keeps it a free game
// and not a lottery is all decided here, on the server:
//   - one free play per customer per store day, for everyone, with no purchase needed: buying never adds a play or changes the odds;
//   - the server draws the result (crypto random, with HQ's weights) before the app animates anything; the app only shows it;
//   - prizes are points, paid like any bonus line (tied to the hidden SYSTEM challenge e5 / e6 / e7), inside a hard monthly budget; once
//     what is left could not pay the top prize the game closes until next month, so nobody ever wins a prize that is then not paid.
// The play is claimed (engagement_events GAME_PLAY, key = the store day, points = the prize in dollars) in the same transaction as the
// budget check and the payout, so two taps or two server copies can never play twice or overspend.
import { randomInt } from 'crypto';
import prisma from '../config/prisma';
import { engagement } from './appSettings';
import { payBonus } from './engagement';
import { ensureBudgetLock, spentThisMonth, takeFromBudget } from './engagementBudget';
import { raiseTierFor } from './tier';
import { addStoreDays, startOfStoreDate, storeDateKey } from './storeTime';
import type { GameKind, GamePrize } from './engagementConfig';

export const GAME_KIND = 'GAME_PLAY';
const NAME: Record<GameKind, string> = { SPIN: 'Spin the wheel', SCRATCH: 'Scratch card', LUCKY: 'Lucky number' };

export const topPrize = (prizes: GamePrize[]) => Math.max(0, ...prizes.map((p) => p.pts));

/** Each prize with its chance (0 to 1), in HQ's order (the wheel draws them in this order). */
export function oddsOf(prizes: GamePrize[]) {
  const total = prizes.reduce((t, p) => t + p.weight, 0);
  return prizes.map((p) => ({ pts: p.pts, chance: total > 0 ? p.weight / total : 0 }));
}

/** Picks a prize with HQ's weights: a whole number below the total weight from crypto, never Math.random. */
export function drawPrize(prizes: GamePrize[], rnd: (max: number) => number = (max) => randomInt(max)): number {
  const total = prizes.reduce((t, p) => t + p.weight, 0);
  let r = rnd(total);
  for (let i = 0; i < prizes.length; i++) {
    if (r < prizes[i].weight) return i;
    r -= prizes[i].weight;
  }
  return prizes.length - 1;
}

/** Whether the game runs on this store day (switched on, inside its dates). The budget is looked at separately. */
function runsOn(day: string): boolean {
  const g = engagement().games;
  return g.enabled && (!g.since || day >= g.since) && (!g.endsOn || day <= g.endsOn);
}

const nextPlayAt = (day: string) => startOfStoreDate(addStoreDays(day, 1)).toISOString();

/** What the app shows: off, or the game, its odds, whether it is open (budget) and whether this customer has played today. */
export async function gameFor(customerId: string, now: Date = new Date()) {
  const g = engagement().games;
  const day = storeDateKey(now);
  if (!runsOn(day)) return { enabled: false as const };
  const [played, spent] = await Promise.all([
    prisma.engagementEvent.findFirst({ where: { customerId, kind: GAME_KIND, key: day }, select: { points: true, createdAt: true } }),
    spentThisMonth(prisma, GAME_KIND, now),
  ]);
  return {
    enabled: true as const,
    game: g.game,
    prizes: oddsOf(g.prizes),
    open: g.monthlyBudgetPts - spent >= topPrize(g.prizes),
    since: g.since,
    endsOn: g.endsOn,
    played: played ? { pts: Math.round(played.points * 100), at: played.createdAt.toISOString() } : null,
    nextPlayAt: nextPlayAt(day),
  };
}

/** Where the points are added: the store the app says the customer is at (it only sends one nearby), else the store they last bought at. */
async function prizeStore(customerId: string, hint: unknown): Promise<string | null> {
  if (typeof hint === 'string' && /^[0-9a-f-]{36}$/i.test(hint)) {
    const s = await prisma.store.findFirst({ where: { id: hint, isActive: true }, select: { id: true } });
    if (s) return s.id;
  }
  const last = await prisma.pointsTransaction.findFirst({ where: { customerId, status: 'APPROVED', purchaseAmount: { gt: 0 } }, orderBy: { createdAt: 'desc' }, select: { storeId: true } });
  return last?.storeId ?? null;
}

/** Any number from 1 to 9 but `pick` (the number shown when a lucky number play wins nothing). */
const otherThan = (pick: number) => { const n = randomInt(1, 9); return n >= pick ? n + 1 : n; };

export type PlayResult =
  | { ok: true; pts: number; index: number; number: number | null; nextPlayAt: string }
  | { ok: false; code: 'OFF' | 'BAD_PICK' | 'NO_STORE' | 'CLOSED' | 'ALREADY'; error: string; played?: { pts: number } };

export async function playGame(customerId: string, o: { storeId?: unknown; pick?: unknown }, now: Date = new Date()): Promise<PlayResult> {
  const g = engagement().games;
  const day = storeDateKey(now);
  if (!runsOn(day)) return { ok: false, code: 'OFF', error: 'The prize game is not on right now.' };
  let pick: number | null = null;
  if (g.game === 'LUCKY') {
    if (typeof o.pick !== 'number' || !Number.isInteger(o.pick) || o.pick < 1 || o.pick > 9) return { ok: false, code: 'BAD_PICK', error: 'Pick a number from 1 to 9.' };
    pick = o.pick;
  }
  const storeId = await prizeStore(customerId, o.storeId);
  if (!storeId) return { ok: false, code: 'NO_STORE', error: 'Turn on location or visit a Lucky Stop to play.' };
  await ensureBudgetLock(GAME_KIND);
  const index = drawPrize(g.prizes);
  const pts = g.prizes[index].pts;
  const top = topPrize(g.prizes);
  const out = await prisma.$transaction(async (tx) => {
    // the budget first (it holds the lock): when what is left could not pay the top prize, the game is closed and no play is used up
    if (top > 0 && (await takeFromBudget(tx, GAME_KIND, g.monthlyBudgetPts, top, now)) === 0) return 'CLOSED' as const;
    const made = await tx.engagementEvent.createMany({ data: [{ customerId, kind: GAME_KIND, key: day, points: pts / 100 }], skipDuplicates: true });
    if (made.count === 0) return 'ALREADY' as const;
    if (pts > 0) await payBonus(tx, { customerId, storeId, points: pts, note: `${NAME[g.game]} prize`, kind: g.game });
    return 'PLAYED' as const;
  });
  if (out === 'CLOSED') return { ok: false, code: 'CLOSED', error: "This month's prizes have all been won. The game is back next month." };
  if (out === 'ALREADY') {
    const p = await prisma.engagementEvent.findFirst({ where: { customerId, kind: GAME_KIND, key: day }, select: { points: true } });
    return { ok: false, code: 'ALREADY', error: 'You have played today. Come back tomorrow.', ...(p ? { played: { pts: Math.round(p.points * 100) } } : {}) };
  }
  if (pts > 0) {
    try { await raiseTierFor(customerId); } catch (e: any) { console.error('[games] tier check failed:', e?.message ?? e); }   // the prize is paid either way
  }
  // the lucky number shown: their own number when the draw won a prize, another one when it did not
  return { ok: true, pts, index, number: pick === null ? null : pts > 0 ? pick : otherThan(pick), nextPlayAt: nextPlayAt(day) };
}
