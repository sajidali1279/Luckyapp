// Challenges (2026-10-05): HQ sets them up on the admin Offers page; customers see theirs with their progress in the app. How a sale
// counts and how a reward is credited: utils/challenges.ts.

import { Response } from 'express';
import { z } from 'zod';
import { ProductCategory, Role, Tier } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { AUDIENCES, audienceText, membersInAudience } from '../utils/offerAudience';
import { challengesFor, challengeStats } from '../utils/challenges';
import { resolveAudience } from '../utils/audience';
import { saveNotificationMany } from '../utils/push';
import { sendExpoBatch } from '../utils/pushSend';

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const money = (n: number) => `$${n.toFixed(2)}`;

const challengeSchema = z.object({
  kind: z.enum(['SPEND', 'VISITS'], { message: 'Choose Spend or Visits.' }),
  title: z.string({ required_error: 'Add a title.' }).trim().min(1, 'Add a title.').max(100, 'The title can be at most 100 characters.'),
  titleEs: z.preprocess(blank, z.string().trim().max(100, 'The Spanish title can be at most 100 characters.').optional()),
  description: z.preprocess(blank, z.string().trim().max(500, 'The description can be at most 500 characters.').optional()),
  descriptionEs: z.preprocess(blank, z.string().trim().max(500, 'The Spanish description can be at most 500 characters.').optional()),
  category: z.preprocess(blank, z.nativeEnum(ProductCategory, { message: 'Choose a category from the list.' }).optional()),
  storeId: z.preprocess(blank, z.string().uuid('Choose a store from the list.').optional()),
  target: z.coerce.number({ message: 'Give the target as a number.' }).positive('The target must be more than 0.'),
  minPurchase: z.preprocess(blank, z.coerce.number().min(0).max(1_000, 'A minimum of at most $1,000.').optional()),
  reward: z.coerce.number({ message: 'Give the reward as a number.' }).min(0.01, 'A reward of at least 1 cent.').max(1_000, 'A reward of at most $1,000.'),
  repeats: z.preprocess((v) => v === true || v === 'true', z.boolean()).optional().default(false),
  audience: z.preprocess(blank, z.enum(AUDIENCES).optional()),
  audienceTier: z.preprocess(blank, z.nativeEnum(Tier).optional()),
  audienceDays: z.preprocess(blank, z.coerce.number().int().min(1).max(365).optional()),
  startDate: z.string({ required_error: 'Choose a start date.' }).datetime({ message: 'Choose a start date.' }),
  endDate: z.string({ required_error: 'Choose an end date.' }).datetime({ message: 'Choose an end date.' }),
}).superRefine((d, ctx) => {
  if (!(new Date(d.startDate) < new Date(d.endDate))) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date must be after the start date.' });
  else if (new Date(d.endDate).getTime() <= Date.now()) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'That end date has already passed.' });
  if (d.kind === 'SPEND' && d.target > 10_000) ctx.addIssue({ code: 'custom', path: ['target'], message: 'A spend target of at most $10,000.' });
  if (d.kind === 'VISITS' && (!Number.isInteger(d.target) || d.target < 2 || d.target > 100)) ctx.addIssue({ code: 'custom', path: ['target'], message: 'Give the number of purchases, from 2 to 100.' });
  if (d.kind === 'SPEND' && d.reward >= d.target) ctx.addIssue({ code: 'custom', path: ['reward'], message: 'The reward must be less than what has to be spent.' });
  if (d.audience === 'TIER_UP' && !d.audienceTier) ctx.addIssue({ code: 'custom', path: ['audienceTier'], message: 'Choose the lowest tier it is for.' });
}).transform((d) => ({
  ...d,
  repeats: d.kind === 'VISITS' ? d.repeats : false,                 // spending is once; every Nth visit may repeat
  minPurchase: d.kind === 'VISITS' ? d.minPurchase : undefined,
  audienceTier: d.audience === 'TIER_UP' ? d.audienceTier : undefined,
  audienceDays: d.audience === 'LAPSED' || d.audience === 'NEW' ? d.audienceDays : undefined,
}));

/** "Spend $30 on groceries, get $3 back" / "Every 5th purchase of $2 or more earns $1" (English, for HQ and the Activity Log). */
export function challengeRule(c: { kind: string; target: number; reward: number; minPurchase: number | null; category: string | null; repeats: boolean }): string {
  const cat = c.category ? ` on ${c.category.replace(/_/g, ' ').toLowerCase()}` : '';
  if (c.kind === 'SPEND') return `Spend ${money(c.target)}${cat}, get ${money(c.reward)} back`;
  const min = c.minPurchase ? ` of ${money(c.minPurchase)} or more` : '';
  return `${c.repeats ? 'Every' : 'The'} ${c.target}${['th', 'st', 'nd', 'rd'][c.target % 10 > 3 || [11, 12, 13].includes(c.target % 100) ? 0 : c.target % 10]} purchase${cat}${min} earns ${money(c.reward)}`;
}

/** Tells the challenge's audience it has started, once (announcedAt is claimed first), in each person's language. */
export async function announceChallenge(c: { id: string; title: string; titleEs: string | null; storeId: string | null; endDate: Date; audience: string; audienceTier: string | null; audienceDays: number | null }): Promise<number> {
  const { count } = await prisma.challenge.updateMany({ where: { id: c.id, announcedAt: null }, data: { announcedAt: new Date() } });
  if (count === 0) return 0;
  const members = await membersInAudience(c, await resolveAudience(c.storeId ? 'STORE_CUSTOMERS' : 'ALL_CUSTOMERS', c.storeId ?? undefined));
  const url = '/(customer)/home?scrollTo=challenges';
  const groups = [
    { people: members.filter((m) => m.language !== 'es'), title: '🏆 New challenge!', body: `${c.title}. See your progress in the Lucky Stop app.` },
    { people: members.filter((m) => m.language === 'es'), title: '🏆 ¡Nuevo reto!', body: `${c.titleEs?.trim() || c.title}. Mira tu progreso en la app de Lucky Stop.` },
  ];
  for (const g of groups) {
    if (g.people.length === 0) continue;
    await saveNotificationMany(g.people.map((m) => m.id), g.title, g.body, 'OFFER', url, c.endDate);
    await sendExpoBatch(g.people.flatMap((m) => m.tokens), { title: g.title, body: g.body, actionUrl: url });
  }
  return members.length;
}

/** The challenges that have started and not been announced (the hourly job, with the offers). */
export async function announceStartedChallenges(now: Date = new Date()): Promise<number> {
  const due = await prisma.challenge.findMany({ where: { isActive: true, announcedAt: null, startDate: { lte: now }, endDate: { gte: now } } });
  let n = 0;
  for (const c of due) n += await announceChallenge(c);
  return n;
}

// POST /challenges (HQ)
export async function createChallenge(req: AuthRequest, res: Response) {
  const parsed = challengeSchema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const d = parsed.data;
  if (d.storeId && !(await prisma.store.findUnique({ where: { id: d.storeId }, select: { id: true } }))) {
    res.status(400).json({ success: false, error: 'That store does not exist. Choose one from the list.' }); return;
  }
  const c = await prisma.challenge.create({
    data: {
      kind: d.kind, title: d.title, titleEs: d.titleEs ?? null, description: d.description ?? '', descriptionEs: d.descriptionEs ?? null,
      category: d.category ?? null, storeId: d.storeId ?? null, target: d.target, minPurchase: d.minPurchase ?? null, reward: d.reward, repeats: d.repeats,
      audience: d.audience ?? 'EVERYONE', audienceTier: d.audienceTier ?? null, audienceDays: d.audienceDays ?? null,
      startDate: new Date(d.startDate), endDate: new Date(d.endDate), createdById: req.user!.id,
    },
  });
  if (c.startDate.getTime() <= Date.now() + 60_000) announceChallenge(c).catch((e) => console.error('[challenges] announcement failed:', e?.message ?? e));
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CHALLENGE_CREATE', entity: 'challenge', entityId: c.id,
    details: { summary: `Challenge "${c.title}": ${challengeRule(c)}${c.audience !== 'EVERYONE' ? `, for ${audienceText(c)}` : ''}` },
    storeId: c.storeId,
  });
  res.status(201).json({ success: true, data: c });
}

// GET /challenges (HQ): every challenge, newest first, with who took part, how often it was earned and what it paid
export async function listChallenges(_req: AuthRequest, res: Response) {
  const rows = await prisma.challenge.findMany({ orderBy: { startDate: 'desc' }, take: 100, include: { store: { select: { name: true } } } });
  const stats = await challengeStats(rows.map((r) => r.id));
  const now = Date.now();
  res.json({
    success: true,
    data: rows.map((c) => ({
      ...c, rule: challengeRule(c), audienceText: audienceText(c), ...stats.get(c.id),
      state: !c.isActive || c.endDate.getTime() < now ? 'ENDED' : c.startDate.getTime() > now ? 'SCHEDULED' : 'LIVE',
    })),
  });
}

const editSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(100).optional(),
  titleEs: z.string().trim().max(100).transform((v) => v || null).nullable().optional(),
  description: z.string().trim().max(500).optional(),
  descriptionEs: z.string().trim().max(500).transform((v) => v || null).nullable().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /challenges/:id (HQ): its words, a new last day, or End now. What it asks and pays stays as posted (fair to those part way).
export async function updateChallenge(req: AuthRequest, res: Response) {
  const parsed = editSchema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const before = await prisma.challenge.findUnique({ where: { id: req.params.id } });
  if (!before) { res.status(404).json({ success: false, error: 'That challenge does not exist.' }); return; }
  const d = parsed.data;
  if (d.endDate && new Date(d.endDate).getTime() < before.startDate.getTime()) { res.status(400).json({ success: false, error: 'The last day is before the first day.' }); return; }
  const c = await prisma.challenge.update({ where: { id: before.id }, data: { ...d, ...(d.endDate ? { endDate: new Date(d.endDate) } : {}) } });
  const changes: string[] = [];
  if (before.title !== c.title) changes.push(`renamed from "${before.title}"`);
  if (+before.endDate !== +c.endDate) changes.push(c.endDate.getTime() <= Date.now() + 60_000 ? 'ended early' : `now ends ${c.endDate.toISOString().slice(0, 10)}`);
  if (before.isActive && !c.isActive) changes.push('stopped');
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CHALLENGE_UPDATE', entity: 'challenge', entityId: c.id,
    details: { summary: `Challenge "${c.title}" ${changes.length ? changes.join(', ') : 'edited'}` },
    storeId: c.storeId,
  });
  res.json({ success: true, data: c });
}

// GET /challenges/mine?storeId= (customer): their running challenges, with their progress
export async function myChallenges(req: AuthRequest, res: Response) {
  if (req.user!.role !== Role.CUSTOMER) { res.json({ success: true, data: [] }); return; }
  const storeId = typeof req.query.storeId === 'string' && req.query.storeId ? req.query.storeId : null;
  res.json({ success: true, data: await challengesFor(req.user!.id, storeId) });
}
