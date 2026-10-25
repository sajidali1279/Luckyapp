// Friends leaderboard (2026-10-24, HQ switch in admin > Engagement): a private ranking inside each invite circle. A circle is one inviter
// (the head) and the friends who joined with that inviter's code, one level only, so an A-to-B-to-A loop or a chain of strangers can never
// widen it. A customer sees up to two circles: the one they head ("Your invites") and the one they were invited into.
//
// Privacy, on purpose: nobody appears until they tap Join (an engagement_events row FRIENDS_JOINED, key 'on'; leaving deletes it), and only
// people who joined see numbers. Names only along invite lines: the head sees friends as "Maria G.", friends see the head that way, and
// friends of the same head see each other as "A friend" (a code posted in public can gather strangers). Rows carry the rank, that name or
// none, the number and whether it is you: never an id, phone, store, time or money. Deleted, restricted, staff and test accounts never
// appear, and a circle exists only while its head is a live customer. It pays nothing.
//
// The number is visit days (distinct store days with a purchase, so one sale split into lines or a split purchase counts once) or points
// earned from purchases (reward lines left out), this week (Monday to Sunday, store time) or this month, or the one before.
import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { engagement } from './appSettings';
import { excludeDeletedCustomers } from './accountDeletion';
import { shortName } from './referrals';
import { isTestPhone } from './testAccounts';
import { addStoreDays, startOfStoreDate, storeDateKey, storeMonthStart, storePrevMonthStart } from './storeTime';
import { weekStartKey } from './engagement';

const CIRCLE_CAP = 300;   // an inviter can gather any number of friends; a board never reads more than this

export interface BoardRow { rank: number | null; name: string | null; value: number; isMe: boolean }
export interface Circle { key: 'own' | 'inviter'; headName: string | null; size: number; need: number; locked: boolean; rows: BoardRow[]; more: number }
export type FriendsView = { enabled: false } | { enabled: true; joined: boolean; metric: 'VISITS' | 'POINTS'; period: 'WEEK' | 'MONTH'; when: 'this' | 'last'; circles: Circle[] };

/** The window for this or the last week or month, in store time. */
export function boardWindow(period: 'WEEK' | 'MONTH', when: 'this' | 'last', now: Date = new Date()): { from: Date; to: Date | null } {
  if (period === 'MONTH') return when === 'this' ? { from: storeMonthStart(now), to: null } : { from: storePrevMonthStart(now), to: storeMonthStart(now) };
  const monday = weekStartKey(now);
  return when === 'this' ? { from: startOfStoreDate(monday), to: null } : { from: startOfStoreDate(addStoreDays(monday, -7)), to: startOfStoreDate(monday) };
}

export async function isJoined(customerId: string): Promise<boolean> {
  return !!(await prisma.engagementEvent.findFirst({ where: { customerId, kind: 'FRIENDS_JOINED', key: 'on' }, select: { id: true } }));
}
export async function setJoined(customerId: string, on: boolean): Promise<void> {
  if (on) await prisma.engagementEvent.createMany({ data: [{ customerId, kind: 'FRIENDS_JOINED', key: 'on' }], skipDuplicates: true });
  else await prisma.engagementEvent.deleteMany({ where: { customerId, kind: 'FRIENDS_JOINED' } });
}

/** Competition ranking (1, 2, 2, 4); people with nothing yet are listed after, without a rank. */
export function rankRows<T extends { value: number }>(rows: T[]): (T & { rank: number | null })[] {
  const active = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const out: (T & { rank: number | null })[] = [];
  active.forEach((r, i) => out.push({ ...r, rank: i > 0 && active[i - 1].value === r.value ? out[i - 1].rank : i + 1 }));
  return [...out, ...rows.filter((r) => r.value <= 0).map((r) => ({ ...r, rank: null }))];
}

export async function friendsBoardFor(viewerId: string, when: 'this' | 'last' = 'this', now: Date = new Date()): Promise<FriendsView> {
  const cfg = engagement().friendsBoard;
  if (!cfg.enabled) return { enabled: false };
  const joined = await isJoined(viewerId);
  const base = { enabled: true as const, joined, metric: cfg.metric, period: cfg.period, when };
  if (!joined) return { ...base, circles: [] };   // reciprocity: numbers only for people who show their own

  // the two circles: the one I head, and the one I was invited into (one level each)
  const [invitedBy, mine] = await Promise.all([
    prisma.referral.findUnique({ where: { friendId: viewerId }, select: { referrerId: true } }),
    prisma.referral.findMany({ where: { referrerId: viewerId, status: { not: 'CANCELLED' } }, select: { friendId: true }, take: CIRCLE_CAP }),
  ]);
  const siblings = invitedBy ? await prisma.referral.findMany({ where: { referrerId: invitedBy.referrerId, status: { not: 'CANCELLED' } }, select: { friendId: true }, take: CIRCLE_CAP }) : [];
  const circles: { key: 'own' | 'inviter'; head: string; members: string[] }[] = [];
  if (mine.length) circles.push({ key: 'own', head: viewerId, members: [viewerId, ...mine.map((r) => r.friendId)] });
  if (invitedBy) circles.push({ key: 'inviter', head: invitedBy.referrerId, members: [invitedBy.referrerId, ...siblings.map((r) => r.friendId)] });
  if (!circles.length) return { ...base, circles: [] };

  const ids = [...new Set(circles.flatMap((c) => c.members))];
  const [people, joinedRows] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids }, role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers }, select: { id: true, name: true, phone: true } }),
    prisma.engagementEvent.findMany({ where: { customerId: { in: ids }, kind: 'FRIENDS_JOINED', key: 'on' }, select: { customerId: true } }),
  ]);
  const live = new Map(people.filter((p) => !isTestPhone(p.phone)).map((p) => [p.id, p]));
  const optedIn = new Set(joinedRows.map((r) => r.customerId));
  const shown = ids.filter((id) => live.has(id) && optedIn.has(id));
  const w = boardWindow(cfg.period, when, now);
  const sales = shown.length ? await prisma.pointsTransaction.findMany({
    where: { customerId: { in: shown }, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gt: 0 }, createdAt: { gte: w.from, ...(w.to ? { lt: w.to } : {}) } },
    select: { customerId: true, createdAt: true, pointsAwarded: true, gasBonusPoints: true },
  }) : [];
  const value = new Map<string, number>();
  if (cfg.metric === 'POINTS') {
    for (const s of sales) value.set(s.customerId, (value.get(s.customerId) ?? 0) + s.pointsAwarded + (s.gasBonusPoints ?? 0));
    for (const [k, v] of value) value.set(k, Math.round(v * 100));
  } else {
    const days = new Map<string, Set<string>>();
    for (const s of sales) { const d = days.get(s.customerId) ?? new Set<string>(); d.add(storeDateKey(s.createdAt)); days.set(s.customerId, d); }
    for (const [k, d] of days) value.set(k, d.size);
  }

  const out: Circle[] = [];
  for (const c of circles) {
    if (!live.has(c.head)) continue;   // a deleted or restricted head: the circle is gone
    const members = c.members.filter((id) => live.has(id) && optedIn.has(id));
    const nameOf = (id: string) => {
      if (id === viewerId) return shortName(live.get(id)!.name);
      // along invite lines only: the head and their friends see each other; friends of the same head see "A friend"
      return c.head === viewerId || id === c.head ? shortName(live.get(id)!.name) : null;
    };
    const ranked = rankRows(members.map((id) => ({ id, value: value.get(id) ?? 0 })));
    const need = Math.max(0, cfg.minMembers - members.length);
    const top = ranked.slice(0, cfg.maxRows);
    const meRow = ranked.find((r) => r.id === viewerId);
    if (meRow && !top.includes(meRow)) top.push(meRow);   // the viewer's own row always shows
    out.push({
      key: c.key, headName: c.key === 'inviter' ? shortName(live.get(c.head)!.name) : null, size: members.length, need, locked: need > 0,
      rows: need > 0 ? [] : top.map((r) => ({ rank: r.rank, name: nameOf(r.id), value: r.value, isMe: r.id === viewerId })),
      more: need > 0 ? 0 : Math.max(0, ranked.length - top.length),
    });
  }
  return { ...base, circles: out };
}
