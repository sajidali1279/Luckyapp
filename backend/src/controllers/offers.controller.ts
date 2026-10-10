import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { OfferType, Prisma, ProductCategory, Role, Tier } from '@prisma/client';
import cloudinary from '../config/cloudinary';
import { audit } from '../utils/audit';
import { announceOffer } from '../utils/offerAnnounce';
import { hasMinRole } from '../middleware/auth';
import { CASHBACK_RATE_CAP } from '../config/constants';
import { refuse } from '../utils/refusal';
import { startOfStoreDate } from '../utils/storeTime';
import { storeDateKey } from '../utils/storeTime';
import { checkHours, offerPaysAt, hoursText } from '../utils/offerHours';
import { shelfDealsForStore } from '../utils/shelfDeals';
import { estimateOffer } from '../utils/offerEstimate';
import { isRestrictedCategory } from '../utils/dealSuggest';
import { AUDIENCES, forCustomer, audienceText } from '../utils/offerAudience';
import { budgetSpent, budgetSpentMany } from '../utils/offerBudget';
import { promotionIdeas } from '../utils/promotionIdeas';
import { cachedAnalytics, bucketTime } from '../utils/analyticsCache';
import { offerLift } from '../utils/offerLift';

// ─── Offers ───────────────────────────────────────────────────────────────────

// Total cashback is held at CASHBACK_RATE_CAP of a sale (10%) whatever is configured, so a bonus above that can never
// be paid. Refusing it here catches a typo (50 for 5) when it is made, not on every sale afterwards.
const MAX_BONUS_TEXT = `${Math.round(CASHBACK_RATE_CAP * 100)}%`;
const BONUS_TOO_BIG = `A bonus can be at most ${MAX_BONUS_TEXT}, because total cashback is capped at ${MAX_BONUS_TEXT} of the sale.`;
const MAX_CENTS_PER_GALLON = 40; // about the 10% ceiling on a $4 gallon
export const MANAGER_CASHBACK_MESSAGE = 'Cashback promotions need HQ approval. Ask a Super Admin to set one up for your store, or post a Deal (a price special) instead.';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
// Multipart forms send everything as text: 'true' is true and anything else (including 'false') is not
export const flag = (v: unknown) => v === true || v === 'true';
// tierBonusRates arrives as a JSON string in a multipart form and as an object in a JSON body
const tierMapInput = (v: unknown) => {
  if (typeof v !== 'string') return v;
  if (v.trim() === '') return undefined;
  try { return JSON.parse(v); } catch { return v; }
};

const tierMapField = z.preprocess(tierMapInput, z.record(z.string(), z.number().min(0).max(CASHBACK_RATE_CAP, BONUS_TOO_BIG))
  .refine((m) => Object.keys(m).every((k) => k in Tier), 'Tier bonuses must be for Bronze, Silver, Gold, Diamond or Platinum.').optional());
const cpgField = z.coerce.number().min(0).max(MAX_CENTS_PER_GALLON, `A per-gallon bonus can be at most ${MAX_CENTS_PER_GALLON} cents.`);

// tierBonusRates: per-tier bonus map e.g. {"BRONZE": 0.03, "GOLD": 0.01}
// When set, bonusRate should be the max of tierBonusRates values (for offer ordering)
export const offerSchema = z.object({
  title: z.string({ required_error: 'Add a title.' }).trim().min(1, 'Add a title.').max(100, 'The title can be at most 100 characters.'),
  description: z.string().max(500, 'The description can be at most 500 characters.').optional().default(''),
  type: z.nativeEnum(OfferType).default(OfferType.ALL_STORES),
  storeId: z.preprocess(blankToUndefined, z.string().uuid('Choose a store from the list.').optional()),
  category: z.preprocess(blankToUndefined, z.nativeEnum(ProductCategory).optional()),
  bonusRate: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(CASHBACK_RATE_CAP, BONUS_TOO_BIG).optional()),
  tierBonusRates: tierMapField.optional().nullable(),
  gasBonusCentsPerGallon: z.preprocess(blankToUndefined, cpgField.optional().nullable()),
  dealText: z.preprocess(blankToUndefined, z.string().trim().max(40, 'The deal text can be at most 40 characters.').optional()),
  // The same in Spanish (optional): shown to customers who use the app in Spanish
  titleEs: z.preprocess(blankToUndefined, z.string().trim().max(100, 'The Spanish title can be at most 100 characters.').optional()),
  descriptionEs: z.preprocess(blankToUndefined, z.string().trim().max(500, 'The Spanish description can be at most 500 characters.').optional()),
  dealTextEs: z.preprocess(blankToUndefined, z.string().trim().max(40, 'The Spanish deal text can be at most 40 characters.').optional()),
  requires21: z.preprocess(flag, z.boolean()).optional().default(false),
  // Who it is for, and its limits (HQ)
  audience: z.preprocess(blankToUndefined, z.enum(AUDIENCES, { message: 'Choose who the promotion is for.' }).optional()),
  audienceTier: z.preprocess(blankToUndefined, z.nativeEnum(Tier, { message: 'Choose a tier.' }).optional()),
  audienceDays: z.preprocess(blankToUndefined, z.coerce.number().int('Give whole days.').min(1, 'At least 1 day.').max(365, 'At most 365 days.').optional()),
  budgetCap: z.preprocess(blankToUndefined, z.coerce.number().min(1, 'A budget of at least $1.').max(100_000, 'A budget of at most $100,000.').optional()),
  dailyCapPerCustomer: z.preprocess(blankToUndefined, z.coerce.number().min(0.01, 'A daily limit of at least 1 cent.').max(1_000, 'A daily limit of at most $1,000.').optional()),
  startDate: z.string({ required_error: 'Choose a start date.' }).datetime({ message: 'Choose a start date.' }),
  endDate: z.string({ required_error: 'Choose an end date.' }).datetime({ message: 'Choose an end date.' }),
}).superRefine((d, ctx) => {
  const start = new Date(d.startDate).getTime();
  const end = new Date(d.endDate).getTime();
  if (!(start < end)) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date must be after the start date.' });
  else if (end <= Date.now()) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'That end date has already passed.' });
  if (d.type === OfferType.SPECIFIC_STORE && !d.storeId) ctx.addIssue({ code: 'custom', path: ['storeId'], message: 'Choose which store this is for.' });
  if (d.audience === 'TIER_UP' && !d.audienceTier) ctx.addIssue({ code: 'custom', path: ['audienceTier'], message: 'Choose the lowest tier it is for.' });
  const pays = (d.bonusRate ?? 0) > 0 || (d.gasBonusCentsPerGallon ?? 0) > 0 || Object.values(d.tierBonusRates ?? {}).some((v) => v > 0);
  if (!pays && !d.dealText) ctx.addIssue({ code: 'custom', path: ['bonusRate'], message: 'Add a bonus (a percentage or cents per gallon) or a deal text.' });
  if (d.gasBonusCentsPerGallon != null && d.category !== ProductCategory.GAS && d.category !== ProductCategory.DIESEL) {
    ctx.addIssue({ code: 'custom', path: ['gasBonusCentsPerGallon'], message: 'A cents-per-gallon promotion must be for Gas or Diesel.' });
  }
}).transform((data) => {
  // A cents-per-gallon promotion pays cents only. It used to carry a percentage too (cents / 100), which paid that many
  // percent of the sale when the gallons were unknown.
  if (data.gasBonusCentsPerGallon != null) {
    data.bonusRate = undefined;
    data.tierBonusRates = undefined;
  }
  // Auto-compute bonusRate as max of tierBonusRates values when per-tier bonuses are set
  if (data.tierBonusRates && Object.keys(data.tierBonusRates).length > 0 && !data.bonusRate) {
    data.bonusRate = Math.max(...Object.values(data.tierBonusRates));
  }
  if (data.type === OfferType.ALL_STORES) data.storeId = undefined;
  // only the audience's own setting is kept (a tier for "tier and up", days for a win-back or new customers)
  if (data.audience !== 'TIER_UP') data.audienceTier = undefined;
  if (data.audience !== 'LAPSED' && data.audience !== 'NEW') data.audienceDays = undefined;
  return data;
});

/** True when the raw request asks for any cashback (a percentage, per-tier percentages or cents per gallon). */
function asksForCashback(body: Record<string, unknown> | undefined): boolean {
  const positive = (v: unknown) => Number(v) > 0;
  if (positive(body?.bonusRate) || positive(body?.gasBonusCentsPerGallon)) return true;
  const tiers = tierMapInput(body?.tierBonusRates);
  if (typeof tiers === 'string') return true; // unreadable: treat as a request and refuse
  return !!tiers && typeof tiers === 'object' && Object.values(tiers as Record<string, unknown>).some(positive);
}

export async function createOffer(req: AuthRequest, res: Response) {
  const isManager = req.user!.role === Role.STORE_MANAGER;

  // A store manager's promotion would go live at once for every customer and cost the store, so cashback is set by HQ
  // (a Deal, which changes no cashback, is still theirs to post)
  if (isManager && (req.body?.audience && req.body.audience !== 'EVERYONE' || req.body?.budgetCap || req.body?.dailyCapPerCustomer)) {
    res.status(403).json({ success: false, error: 'Who a promotion is for, and its limits, are set by HQ.' });
    return;
  }
  if (isManager && asksForCashback(req.body)) {
    res.status(403).json({ success: false, error: MANAGER_CASHBACK_MESSAGE });
    return;
  }

  const parsed = offerSchema.safeParse(req.body);
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  // Happy hours (days and times, store time); without them it pays all day
  const hours = checkHours(req.body ?? {});
  if (!hours.ok) { res.status(400).json({ success: false, error: hours.message }); return; }
  const lastDayReminder = req.body?.lastDayReminder === undefined ? true : flag(req.body.lastDayReminder);

  // Store managers can only create store-specific offers for a store they're
  // actually assigned to — prefer the store they picked in the UI (a real
  // store-selector exists for multi-store managers), only falling back to
  // their first assigned store if they didn't pick one of their own.
  if (isManager) {
    const managerStoreIds = req.user!.storeIds ?? [];
    const requestedStoreId = parsed.data.storeId;
    const targetStoreId = requestedStoreId && managerStoreIds.includes(requestedStoreId)
      ? requestedStoreId
      : managerStoreIds[0];

    if (!targetStoreId) {
      res.status(403).json({ success: false, error: 'No store assigned to your account' });
      return;
    }
    parsed.data.type = OfferType.SPECIFIC_STORE;
    parsed.data.storeId = targetStoreId;
  } else if (parsed.data.storeId) {
    const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId }, select: { id: true } });
    if (!store) {
      res.status(400).json({ success: false, error: 'That store does not exist. Choose one from the list.' });
      return;
    }
  }

  let imageUrl: string | undefined;
  if (req.file && !/^image\//.test(req.file.mimetype)) { res.status(400).json({ success: false, error: 'That file is not a picture. Use a JPG, PNG or WebP.' }); return; }
  if (req.file) {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'luckystop/offers', resource_type: 'image' },
        (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
      ).end(req.file!.buffer);
    });
    imageUrl = result.secure_url;
  }

  const offer = await prisma.offer.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ...parsed.data, ...hours.hours, lastDayReminder, imageUrl, startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate) } as any,
  });

  // Customers hear about it when it STARTS: now if it already has, otherwise the hourly job announces it on its first day. A single-store promotion goes
  // to that store's customers, not to everyone. The message expires when the promotion ends.
  if (offer.startDate.getTime() <= Date.now() + 60_000) {
    announceOffer({ id: offer.id, title: offer.title, titleEs: offer.titleEs, storeId: offer.storeId, endDate: offer.endDate, createdAt: offer.createdAt, audience: offer.audience, audienceTier: offer.audienceTier, audienceDays: offer.audienceDays }).catch((e) => console.error('[offers] announcement failed:', e?.message ?? e));
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_OFFER', entity: 'offer', entityId: offer.id,
    details: {
      title: offer.title, type: offer.type, category: offer.category, bonusRate: offer.bonusRate,
      gasBonusCentsPerGallon: offer.gasBonusCentsPerGallon, dealText: offer.dealText,
      startDate: offer.startDate, endDate: offer.endDate, happyHours: hoursText(offer),
      audience: audienceText(offer), budgetCap: offer.budgetCap, dailyCapPerCustomer: offer.dailyCapPerCustomer,
    },
    storeId: offer.storeId,
  });

  res.status(201).json({ success: true, data: offer });
}

export async function getActiveOffers(req: AuthRequest, res: Response) {
  const { storeId, includeScheduled } = req.query as { storeId?: string; includeScheduled?: string };
  const now = new Date();

  // HQ (web admin) can also ask for promotions that are switched on but have not started yet, so a promotion made for
  // next week is not invisible until its first day. Customers and the mobile screens never get them.
  const withScheduled = includeScheduled === '1' && hasMinRole(req.user!.role, Role.SUPER_ADMIN);

  // A customer who has explicitly declined the 21+ prompt shouldn't even
  // receive age-restricted offers (not just have them blurred client-side)
  // until they opt back in from Profile. A customer who hasn't been asked
  // yet still needs the data, so it can render blurred with a prompt.
  let hideRestricted = false;
  if (req.user!.role === Role.CUSTOMER) {
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { age21Confirmed: true, age21Declined: true } });
    hideRestricted = !!me?.age21Declined && !me?.age21Confirmed;
  }

  let offers = await prisma.offer.findMany({
    where: {
      isActive: true,
      ...(withScheduled ? {} : { startDate: { lte: now } }),
      ...(withScheduled ? {} : { budgetReachedAt: null }),   // a promotion whose budget is used up pays nothing, so it is not shown (HQ sees it)
      endDate: { gte: now },
      ...(hideRestricted ? { requires21: false } : {}),
      // With storeId (mobile): show ALL_STORES + that store's specific offers
      // Without storeId (admin): show everything, store managers need to see their specific offers
      ...(storeId ? {
        OR: [
          { type: OfferType.ALL_STORES },
          { storeId },
        ],
      } : {}),
    },
    orderBy: { startDate: 'desc' },
    include: { store: { select: { name: true, address: true, city: true, state: true, phone: true } } },
  });

  // A customer sees only the promotions they are in the audience of (a tier and up, a win-back, new customers, birthday month)
  if (req.user!.role === Role.CUSTOMER) offers = await forCustomer(offers, req.user!.id, now);
  // HQ sees what each promotion with a budget has paid so far
  const spent = withScheduled ? await budgetSpentMany(offers.filter((o) => o.budgetCap != null).map((o) => o.id)) : new Map<string, number>();
  // onNow: false only for a happy-hour promotion outside its hours (shown all day, pays in its hours); hoursText says when
  const data: Record<string, unknown>[] = offers.map((o) => ({
    ...o, onNow: offerPaysAt(o, now), hoursText: hoursText(o),
    ...(withScheduled ? { audienceText: audienceText(o), ...(o.budgetCap != null ? { budgetSpent: spent.get(o.id) ?? 0 } : {}) } : {}),
  }));
  // A customer at a store also sees that store's shelf deals (labels with a deal, e.g. "2 for $5") in Today's Deals, as deals
  if (req.user!.role === Role.CUSTOMER && storeId) {
    try { data.push(...(await shelfDealsForStore(storeId, now))); } catch (e) { console.error('[offers] shelf deals failed:', (e as Error).message); }
  }

  res.json({ success: true, data });
}

const updateOfferSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(100, 'The title can be at most 100 characters.').optional(),
  description: z.string().trim().max(500, 'The description can be at most 500 characters.').optional(),   // empty clears it
  type: z.nativeEnum(OfferType).optional(),
  storeId: z.string().uuid().nullable().optional(),
  category: z.nativeEnum(ProductCategory).nullable().optional(),
  bonusRate: z.coerce.number().min(0).max(CASHBACK_RATE_CAP, BONUS_TOO_BIG).nullable().optional(),
  tierBonusRates: z.record(z.string(), z.number().min(0).max(CASHBACK_RATE_CAP, BONUS_TOO_BIG))
    .refine((m) => Object.keys(m).every((k) => k in Tier), 'Tier bonuses must be for Bronze, Silver, Gold, Diamond or Platinum.').nullable().optional(),
  gasBonusCentsPerGallon: cpgField.nullable().optional(),
  dealText: z.string().min(1).max(40, 'The deal text can be at most 40 characters.').nullable().optional(),
  requires21: z.preprocess(flag, z.boolean()).optional(),   // "false" is false (z.coerce.boolean made any text true)
  // Spanish words: empty takes them off (the English shows)
  titleEs: z.string().trim().max(100, 'The Spanish title can be at most 100 characters.').transform((v) => v || null).nullable().optional(),
  descriptionEs: z.string().trim().max(500, 'The Spanish description can be at most 500 characters.').transform((v) => v || null).nullable().optional(),
  dealTextEs: z.string().trim().max(40, 'The Spanish deal text can be at most 40 characters.').transform((v) => v || null).nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  audience: z.enum(AUDIENCES, { message: 'Choose who the promotion is for.' }).optional(),
  audienceTier: z.nativeEnum(Tier, { message: 'Choose a tier.' }).nullable().optional(),
  audienceDays: z.coerce.number().int().min(1, 'At least 1 day.').max(365, 'At most 365 days.').nullable().optional(),
  budgetCap: z.coerce.number().min(1, 'A budget of at least $1.').max(100_000, 'A budget of at most $100,000.').nullable().optional(),
  dailyCapPerCustomer: z.coerce.number().min(0.01, 'A daily limit of at least 1 cent.').max(1_000, 'A daily limit of at most $1,000.').nullable().optional(),
}).refine(d => {
  if (d.startDate && d.endDate) return new Date(d.startDate) < new Date(d.endDate);
  return true;
}, { message: 'The end date must be after the start date.' });

// The mobile edit form rounds a rate to whole percent before sending it back, so a half-point difference is that
// rounding and not a change
const sameRate = (a: number | null | undefined, b: number | null | undefined) => Math.abs((a ?? 0) - (b ?? 0)) <= 0.005 + 1e-9;

export async function updateOffer(req: AuthRequest, res: Response) {
  const { offerId } = req.params;

  const parsed = updateOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }

  // Store managers can only edit offers belonging to one of their stores
  if (req.user!.role === Role.STORE_MANAGER) {
    const existing = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!existing || !req.user!.storeIds?.includes(existing.storeId ?? '')) {
      res.status(403).json({ success: false, error: 'You can only edit offers for your store' });
      return;
    }
    // Cannot change type or storeId
    delete parsed.data.type;
    delete parsed.data.storeId;

    // Nor what the promotion pays: that is set by HQ. The values the edit form sends back unchanged are dropped
    // (the stored ones stay exactly as they are); anything different is refused.
    const d = parsed.data;
    const existingHasCashback = (existing.bonusRate ?? 0) > 0 || existing.tierBonusRates != null || existing.gasBonusCentsPerGallon != null;
    const wantsChange =
      (d.bonusRate !== undefined && !sameRate(d.bonusRate, existing.bonusRate)) ||
      (d.tierBonusRates !== undefined && JSON.stringify(d.tierBonusRates ?? null) !== JSON.stringify(existing.tierBonusRates ?? null)) ||
      (d.gasBonusCentsPerGallon !== undefined && (d.gasBonusCentsPerGallon ?? null) !== (existing.gasBonusCentsPerGallon ?? null)) ||
      (existingHasCashback && d.category !== undefined && (d.category ?? null) !== (existing.category ?? null));
    if (wantsChange) {
      res.status(403).json({ success: false, error: MANAGER_CASHBACK_MESSAGE });
      return;
    }
    delete d.bonusRate;
    delete d.tierBonusRates;
    delete d.gasBonusCentsPerGallon;
    // nor who it is for, or its limits (HQ's)
    delete d.audience; delete d.audienceTier; delete d.audienceDays; delete d.budgetCap; delete d.dailyCapPerCustomer;
    if (existingHasCashback) delete d.category;
  }

  // Happy hours and the last-day push: HQ only (a manager's edit leaves them as they are). Sent only when they are being changed.
  let hoursEdit: Record<string, unknown> = {};
  if (req.user!.role !== Role.STORE_MANAGER) {
    const b = req.body ?? {};
    if ('happyFrom' in b || 'happyTo' in b || 'happyDays' in b) {
      const hours = checkHours(b);
      if (!hours.ok) { res.status(400).json({ success: false, error: hours.message }); return; }
      hoursEdit = { ...hours.hours };
    }
    if ('lastDayReminder' in b) hoursEdit.lastDayReminder = flag(b.lastDayReminder);
  }

  const { startDate, endDate, ...rest } = parsed.data;
  const before = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!before) { res.status(404).json({ success: false, error: 'That offer does not exist.' }); return; }
  // What it would be after this edit: it still has to be for a store that exists (one store), pay something or show a deal, and keep
  // cents per gallon to Gas and Diesel (a new offer is held to the same rules by offerSchema)
  const next = { ...before, ...rest };
  if (next.type === OfferType.SPECIFIC_STORE) {
    if (!next.storeId) { res.status(400).json({ success: false, error: 'Choose which store this is for.' }); return; }
    if (rest.storeId && rest.storeId !== before.storeId && !(await prisma.store.findUnique({ where: { id: rest.storeId }, select: { id: true } }))) {
      res.status(400).json({ success: false, error: 'That store does not exist. Choose one from the list.' }); return;
    }
  } else if (rest.type === OfferType.ALL_STORES) {
    (rest as Record<string, unknown>).storeId = null;
  }
  const nextTiers = (next.tierBonusRates ?? null) as Record<string, number> | null;
  const nextPays = (next.bonusRate ?? 0) > 0 || (next.gasBonusCentsPerGallon ?? 0) > 0 || Object.values(nextTiers ?? {}).some((v) => v > 0);
  if (!nextPays && !next.dealText) { res.status(400).json({ success: false, error: 'Add a bonus (a percentage or cents per gallon) or a deal text.' }); return; }
  if (next.gasBonusCentsPerGallon != null && next.category !== ProductCategory.GAS && next.category !== ProductCategory.DIESEL) {
    res.status(400).json({ success: false, error: 'A cents-per-gallon promotion must be for Gas or Diesel.' }); return;
  }
  if (next.audience === 'TIER_UP' && !next.audienceTier) { res.status(400).json({ success: false, error: 'Choose the lowest tier it is for.' }); return; }
  if (rest.audience && rest.audience !== 'TIER_UP') (rest as Record<string, unknown>).audienceTier = null;
  if (rest.audience && rest.audience !== 'LAPSED' && rest.audience !== 'NEW') (rest as Record<string, unknown>).audienceDays = null;
  // The budget: a stopped promotion starts again when it is raised above what it has paid, or taken off
  if (rest.budgetCap !== undefined && before.budgetReachedAt) {
    if (rest.budgetCap == null || rest.budgetCap > (await budgetSpent(offerId)) + 0.005) (rest as Record<string, unknown>).budgetReachedAt = null;
  }
  // The dates it would have after this edit: the last day on or after the first, and not already over ("End now" sends now)
  const nextStart = startDate ? new Date(startDate) : before.startDate;
  const nextEnd = endDate ? new Date(endDate) : before.endDate;
  if (isNaN(nextStart.getTime()) || isNaN(nextEnd.getTime())) { res.status(400).json({ success: false, error: 'Pick real dates.' }); return; }
  if (endDate && nextEnd.getTime() < Date.now() - 5 * 60_000) { res.status(400).json({ success: false, error: 'The last day has already passed. To stop the offer now, use End now.' }); return; }
  if (nextEnd.getTime() < nextStart.getTime()) { res.status(400).json({ success: false, error: 'The last day is before the first day.' }); return; }
  const offer = await prisma.offer.update({
    where: { id: offerId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      ...rest,
      ...hoursEdit,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
    } as any,
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_OFFER', entity: 'offer', entityId: offer.id,
    details: {
      title: offer.title, isActive: offer.isActive,
      summary: (() => {
        const changes: string[] = [];
        if (before.title !== offer.title) changes.push(`renamed from "${before.title}"`);
        if (+before.startDate !== +offer.startDate) changes.push(`now starts ${storeDateKey(offer.startDate)}`);
        if (+before.endDate !== +offer.endDate) changes.push(offer.endDate.getTime() <= Date.now() + 60_000 ? 'ended early' : `now ends ${storeDateKey(offer.endDate)}`);
        if (hoursText(before) !== hoursText(offer)) changes.push(hoursText(offer) ? `happy hours ${hoursText(offer)}` : 'happy hours removed (all day)');
        if (audienceText(before) !== audienceText(offer)) changes.push(`now for ${audienceText(offer)}`);
        if ((before.budgetCap ?? null) !== (offer.budgetCap ?? null)) changes.push(offer.budgetCap != null ? `budget $${offer.budgetCap.toFixed(2)}${before.budgetReachedAt && !offer.budgetReachedAt ? ' (started again)' : ''}` : 'no budget');
        if ((before.dailyCapPerCustomer ?? null) !== (offer.dailyCapPerCustomer ?? null)) changes.push(offer.dailyCapPerCustomer != null ? `at most $${offer.dailyCapPerCustomer.toFixed(2)} a customer a day` : 'no daily limit');
        return `Offer "${offer.title}" ${changes.length ? changes.join(', ') : 'edited'}`;
      })(),
    },
    storeId: offer.storeId,
  });

  res.json({ success: true, data: offer });
}

export async function deleteOffer(req: AuthRequest, res: Response) {
  if (req.user!.role === Role.STORE_MANAGER) {
    const existing = await prisma.offer.findUnique({ where: { id: req.params.offerId } });
    if (!existing || !req.user!.storeIds?.includes(existing.storeId ?? '')) {
      res.status(403).json({ success: false, error: 'You can only delete offers for your store' });
      return;
    }
  }
  if (!(await prisma.offer.findUnique({ where: { id: req.params.offerId }, select: { id: true } }))) {
    res.status(404).json({ success: false, error: 'That offer does not exist.' });
    return;
  }
  const deleted = await prisma.offer.update({
    where: { id: req.params.offerId }, data: { isActive: false },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_OFFER', entity: 'offer', entityId: deleted.id,
    details: { title: deleted.title, type: deleted.type },
    storeId: deleted.storeId,
  });
  res.json({ success: true, message: 'Offer deactivated' });
}

/** The offer when this person may change it (HQ: any; a store manager: their own stores'), or a reply already sent. */
async function offerToChange(req: AuthRequest, res: Response) {
  const offer = await prisma.offer.findUnique({ where: { id: req.params.offerId } });
  if (!offer) { res.status(404).json({ success: false, error: 'That offer does not exist.' }); return null; }
  if (req.user!.role === Role.STORE_MANAGER && !req.user!.storeIds?.includes(offer.storeId ?? '')) {
    res.status(403).json({ success: false, error: 'You can only change offers for your store' });
    return null;
  }
  return offer;
}

/** POST /offers/:offerId/image (multipart "image"): a new picture for an offer already posted (it is not announced again). */
export async function setOfferImage(req: AuthRequest, res: Response) {
  const offer = await offerToChange(req, res);
  if (!offer) return;
  if (!req.file) { res.status(400).json({ success: false, error: 'Choose a picture to upload.' }); return; }
  if (!/^image\//.test(req.file.mimetype)) { res.status(400).json({ success: false, error: 'That file is not a picture. Use a JPG, PNG or WebP.' }); return; }
  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'luckystop/offers', resource_type: 'image' },
      (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
    ).end(req.file!.buffer);
  });
  const updated = await prisma.offer.update({ where: { id: offer.id }, data: { imageUrl: result.secure_url } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_OFFER', entity: 'offer', entityId: offer.id,
    details: { title: offer.title, summary: `Offer "${offer.title}" ${offer.imageUrl ? 'picture changed' : 'picture added'}` },
    storeId: offer.storeId,
  });
  res.json({ success: true, data: updated });
}

/** DELETE /offers/:offerId/image: the offer shows without a picture. */
export async function removeOfferImage(req: AuthRequest, res: Response) {
  const offer = await offerToChange(req, res);
  if (!offer) return;
  if (!offer.imageUrl) { res.json({ success: true, data: offer }); return; }
  const updated = await prisma.offer.update({ where: { id: offer.id }, data: { imageUrl: null } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_OFFER', entity: 'offer', entityId: offer.id,
    details: { title: offer.title, summary: `Offer "${offer.title}" picture removed` },
    storeId: offer.storeId,
  });
  res.json({ success: true, data: updated });
}

// Returns all past offers (expired or inactive) for the admin reuse panel
export async function getOffersHistory(req: AuthRequest, res: Response) {
  const now = new Date();
  const storeFilter = req.user!.role === Role.STORE_MANAGER
    ? { storeId: { in: req.user!.storeIds ?? [] } }
    : {};
  const offers = await prisma.offer.findMany({
    where: { ...storeFilter, OR: [{ isActive: false }, { endDate: { lt: now } }] },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: { store: { select: { name: true } } },
  });
  res.json({ success: true, data: offers });
}

// ─── Banners ──────────────────────────────────────────────────────────────────

const bannerSchema = z.object({
  title: z.string({ required_error: 'Add a title for the banner.' }).trim().min(1, 'Add a title for the banner.').max(100, 'The title can be at most 100 characters.'),
  linkUrl: z.preprocess(blankToUndefined, z.string().trim().max(500, 'The link can be at most 500 characters.')
    .refine((u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } }, 'The link must be a web address starting with http:// or https://.')
    .optional()),
  sortOrder: z.preprocess(blankToUndefined, z.coerce.number().int('The order must be a whole number.').min(0, 'The order must be between 0 and 999.').max(999, 'The order must be between 0 and 999.').optional()),
  storeId: z.preprocess(blankToUndefined, z.string().uuid('Choose a store from the list.').optional()),
});

export async function createBanner(req: AuthRequest, res: Response) {
  const parsed = bannerSchema.safeParse(req.body);
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }
  const { title, linkUrl, sortOrder } = parsed.data;

  // Store managers can target any of their assigned stores — prefer the
  // store picked in the UI, falling back to their first store if the
  // requested one isn't actually theirs (or none was specified).
  const requestedBannerStoreId = parsed.data.storeId;
  const storeId = req.user!.role === Role.STORE_MANAGER
    ? (requestedBannerStoreId && req.user!.storeIds?.includes(requestedBannerStoreId)
        ? requestedBannerStoreId
        : req.user!.storeIds?.[0] || null)
    : (requestedBannerStoreId || null);

  if (req.user!.role === Role.STORE_MANAGER && !storeId) {
    res.status(403).json({ success: false, error: 'No store assigned to your account' });
    return;
  }

  if (req.user!.role !== Role.STORE_MANAGER && storeId) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) {
      res.status(400).json({ success: false, error: 'That store does not exist. Choose one from the list.' });
      return;
    }
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'Banner image required' });
    return;
  }

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'luckystop/banners', resource_type: 'image' },
      (err, r) => (err ? reject(err) : resolve(r as { secure_url: string }))
    ).end(req.file!.buffer);
  });

  const banner = await prisma.banner.create({
    data: {
      title,
      imageUrl: result.secure_url,
      storeId,
      linkUrl: linkUrl || null,
      sortOrder: sortOrder ?? 0,
    },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_BANNER', entity: 'banner', entityId: banner.id,
    details: { title: banner.title },
    storeId: banner.storeId,
  });
  res.status(201).json({ success: true, data: banner });
}

export async function getActiveBanners(req: AuthRequest, res: Response) {
  const { storeId } = req.query as { storeId?: string };

  // With a store (the customer and staff apps): the all-store banners plus that store's own.
  // With none: HQ (web admin) sees every banner so a one-store banner can still be found and removed, and a store
  // manager sees the all-store banners plus their own stores'. Anyone else gets the all-store banners only.
  let where: Prisma.BannerWhereInput;
  if (!storeId && hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    where = { isActive: true };
  } else if (!storeId && req.user!.role === Role.STORE_MANAGER) {
    where = { isActive: true, OR: [{ storeId: null }, { storeId: { in: req.user!.storeIds ?? [] } }] };
  } else {
    where = { isActive: true, OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])] };
  }

  const banners = await prisma.banner.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  res.json({ success: true, data: banners });
}

export async function deleteBanner(req: AuthRequest, res: Response) {
  if (req.user!.role === Role.STORE_MANAGER) {
    const existing = await prisma.banner.findUnique({ where: { id: req.params.bannerId } });
    if (!existing || !req.user!.storeIds?.includes(existing.storeId ?? '')) {
      res.status(403).json({ success: false, error: 'You can only delete banners for your store' });
      return;
    }
  }
  const deletedBanner = await prisma.banner.update({
    where: { id: req.params.bannerId }, data: { isActive: false },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_BANNER', entity: 'banner', entityId: deletedBanner.id,
    details: { title: deletedBanner.title },
    storeId: deletedBanner.storeId,
  });
  res.json({ success: true, message: 'Banner removed' });
}

// ─── Results ──────────────────────────────────────────────────────────────────

// Sales began carrying the promotion that raised them (offerId, offerCashback) on this store day; a promotion that started earlier
// has results from here on only.
export const OFFER_RECORDING_START = startOfStoreDate('2026-09-28');

const money = (n: number) => Math.round(n * 100) / 100;
export { LIFT_MIN_SALES } from '../utils/offerLift';

// GET /offers/:offerId/results (HQ) — what a promotion did: the sales it raised, the customers, the extra cashback it paid, and the
// category's sales while it ran against the same length of time just before it. A deal changes no cashback, so it has no results.
//
// Did it bring extra sales (lift)? The sales it touched were compared with sales it did not touch over the same two stretches: a
// one-store promotion with the other open stores (same category), an all-store promotion for a category with the other categories.
// What the control did is what was expected here without the promotion; the difference is the extra sales, and those over the extra
// cashback paid is the return on it. A store-wide promotion at every store has nothing it did not touch, so it is compared with the
// time before only. Too few sales before (under LIFT_MIN_SALES on either side) and it says it cannot tell yet.
export async function getOfferResults(req: AuthRequest, res: Response) {
  const { offerId } = req.params;
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true, title: true, category: true, type: true, storeId: true, startDate: true, endDate: true, isActive: true, updatedAt: true,
      bonusRate: true, gasBonusCentsPerGallon: true, store: { select: { name: true } },
    },
  });
  if (!offer) { res.status(404).json({ success: false, error: 'That promotion does not exist.' }); return; }
  if (offer.bonusRate == null && offer.gasBonusCentsPerGallon == null) {
    res.status(400).json({ success: false, error: 'A deal changes no cashback, so there are no sale results to show for it.' });
    return;
  }

  const now = new Date();
  if (offer.startDate > now) {
    res.json({ success: true, data: { scheduled: true, startDate: offer.startDate } });
    return;
  }
  // Until it ended, was removed, or now
  let end = offer.endDate < now ? offer.endDate : now;
  const removedEarly = !offer.isActive && offer.updatedAt < end;
  if (removedEarly) end = offer.updatedAt;
  const start = offer.startDate;

  const sales = await prisma.pointsTransaction.findMany({
    where: { offerId },
    select: { status: true, purchaseAmount: true, pointsAwarded: true, offerCashback: true, customerId: true, storeId: true, store: { select: { name: true } } },
  });
  const approved = sales.filter((s) => s.status === 'APPROVED');
  const waiting = sales.filter((s) => s.status === 'PENDING' || s.status === 'FLAGGED').length;
  const byStore = new Map<string, { name: string; sales: number; extraCashback: number }>();
  for (const s of approved) {
    const row = byStore.get(s.storeId) ?? { name: s.store.name, sales: 0, extraCashback: 0 };
    row.sales += 1;
    row.extraCashback += s.offerCashback ?? 0;
    byStore.set(s.storeId, row);
  }

  // The category at its stores while it ran and just before, and whether it brought extra sales (utils/offerLift.ts)
  const extraCashbackPaid = approved.reduce((n, s) => n + (s.offerCashback ?? 0), 0);
  const { during, before, lift } = await offerLift({ storeId: offer.storeId, category: offer.category }, start, end, extraCashbackPaid);

  // Customers whose first purchase ever was while it ran, with it
  const users = [...new Set(approved.map((s) => s.customerId))];
  const firsts = users.length ? await prisma.pointsTransaction.groupBy({
    by: ['customerId'], where: { customerId: { in: users }, status: { not: 'REJECTED' }, challengeId: null, referralId: null }, _min: { createdAt: true },
  }) : [];
  const firstTimers = firsts.filter((f) => f._min.createdAt && f._min.createdAt >= start).length;

  res.json({
    success: true,
    data: {
      scheduled: false,
      title: offer.title,
      category: offer.category,
      where: offer.storeId ? offer.store?.name ?? 'One store' : 'All stores',
      from: start,
      until: end,
      running: offer.isActive && offer.endDate > now,
      removedEarly,
      recordedFrom: start < OFFER_RECORDING_START ? OFFER_RECORDING_START : null,
      sales: approved.length,
      customers: new Set(approved.map((s) => s.customerId)).size,
      salesAmount: money(approved.reduce((n, s) => n + s.purchaseAmount, 0)),
      cashbackOnThoseSales: money(approved.reduce((n, s) => n + s.pointsAwarded, 0)),
      extraCashback: money(approved.reduce((n, s) => n + (s.offerCashback ?? 0), 0)),
      waitingForApproval: waiting,
      byStore: [...byStore.values()].sort((a, b) => b.sales - a.sales).map((r) => ({ ...r, extraCashback: money(r.extraCashback) })),
      categorySales: { during, before },
      lift,
      firstTimers,
    },
  });
}

// ─── Cost estimate ────────────────────────────────────────────────────────────

/**
 * POST /offers/estimate (store manager and HQ): what a promotion would add in cashback, from the last 4 weeks of the same kind of sales
 * (utils/offerEstimate.ts). Takes the same fields as an offer; a store manager's estimate is for one of their own stores.
 */
export async function estimateOfferCost(req: AuthRequest, res: Response) {
  const body = req.body ?? {};
  const isManager = req.user!.role === Role.STORE_MANAGER;
  let storeId: string | undefined = typeof body.storeId === 'string' && body.storeId ? body.storeId : undefined;
  if (isManager) {
    const mine = req.user!.storeIds ?? [];
    storeId = storeId && mine.includes(storeId) ? storeId : mine[0];
    if (!storeId) { res.status(403).json({ success: false, error: 'No store assigned to your account' }); return; }
  }
  const type = storeId ? OfferType.SPECIFIC_STORE : OfferType.ALL_STORES;
  const parsed = offerSchema.safeParse({ ...body, title: 'estimate', description: '', dealText: undefined, type, storeId });
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const hours = checkHours(body);
  if (!hours.ok) { res.status(400).json({ success: false, error: hours.message }); return; }
  const d = parsed.data;
  const est = await estimateOffer({
    storeId: d.storeId ?? null, category: d.category ?? null, bonusRate: d.bonusRate ?? null,
    tierBonusRates: d.tierBonusRates ?? null, gasBonusCentsPerGallon: d.gasBonusCentsPerGallon ?? null,
    startDate: new Date(d.startDate), endDate: new Date(d.endDate), ...hours.hours,
    audience: d.audience ?? null, audienceTier: d.audienceTier ?? null, audienceDays: d.audienceDays ?? null,
    budgetCap: d.budgetCap ?? null, dailyCapPerCustomer: d.dailyCapPerCustomer ?? null,
  });
  res.json({ success: true, data: est });
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

/** GET /offers/ideas (HQ): promotions worked out from the last 8 weeks of sales (utils/promotionIdeas.ts), each ready to post. */
export async function getPromotionIdeas(_req: AuthRequest, res: Response) {
  const data = await cachedAnalytics(`promotion-ideas:${bucketTime(new Date())}`, () => promotionIdeas());
  res.json({ success: true, data });
}

// ─── Spanish ──────────────────────────────────────────────────────────────────

const translateSchema = z.object({
  title: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().max(500).optional().default(''),
  dealText: z.string().trim().max(40).optional().default(''),
}).refine((d) => d.title || d.description || d.dealText, 'Write the English first.');

/**
 * POST /offers/translate (store manager and HQ): a suggested Spanish version of an offer's words, for HQ to read and change before
 * posting. Uses Claude (the same key as the catalog photo import). Prices, "Lucky Stop" and product names stay as they are.
 */
export async function translateOffer(req: AuthRequest, res: Response) {
  const parsed = translateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ success: false, error: 'Suggested translations are not set up on the server. Type the Spanish yourself.' }); return; }
  const { title, description, dealText } = parsed.data;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You translate short promotions for Lucky Stop, a chain of gas stations and convenience stores in Texas, into the everyday Spanish '
        + 'its customers speak (US / Mexican Spanish, speaking to the customer as tú, as the rest of the app does). Keep the meaning exact: never promise more than the English. Keep prices, '
        + 'percentages, numbers, "Lucky Stop" and brand or product names as they are. "2 for $5" is "2 por $5". Keep it as short as the English. '
        + 'Answer with JSON only: {"title": "...", "description": "...", "dealText": "..."}, an empty string for any field you were not given.',
      messages: [{ role: 'user', content: JSON.stringify({ title, description, dealText }) }],
    });
    const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    res.json({ success: true, data: { titleEs: clip(json.title, 100), descriptionEs: clip(json.description, 500), dealTextEs: clip(json.dealText, 40) } });
  } catch (e) {
    console.error('[offers] translate failed:', (e as Error).message);
    res.status(502).json({ success: false, error: 'Could not suggest a translation right now. Try again, or type the Spanish yourself.' });
  }
}

// ─── Shelf deals (from Labels) ────────────────────────────────────────────────

/** GET /offers/shelf-deals (HQ): every label with a deal: how many stores carry it, and whether it is hidden from the app. */
export async function listShelfDeals(_req: AuthRequest, res: Response) {
  const labels = await prisma.label.findMany({
    where: { dealText: { not: null } },
    select: { id: true, productName: true, dealText: true, priceText: true, category: true, dealHiddenInApp: true, updatedAt: true, _count: { select: { storeLabels: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({
    success: true,
    data: labels.filter((l) => l.dealText && l.dealText.trim()).map((l) => ({
      labelId: l.id, productName: l.productName, dealText: l.dealText, priceText: l.priceText, hidden: l.dealHiddenInApp, stores: l._count.storeLabels,
      restricted: isRestrictedCategory(l.category),   // tobacco, vape or alcohol: never shown in the app
    })),
  });
}

/** PATCH /offers/shelf-deals/:labelId (HQ): { hidden: true|false }: hide a label's deal from the app's Today's Deals, or show it again. */
export async function setShelfDealHidden(req: AuthRequest, res: Response) {
  if (typeof req.body?.hidden !== 'boolean') { res.status(400).json({ success: false, error: 'Say whether to hide it (true) or show it (false).' }); return; }
  const label = await prisma.label.findUnique({ where: { id: req.params.labelId }, select: { id: true, productName: true, dealText: true, dealHiddenInApp: true } });
  if (!label || !label.dealText) { res.status(404).json({ success: false, error: 'That label has no deal any more.' }); return; }
  if (label.dealHiddenInApp !== req.body.hidden) {
    await prisma.label.update({ where: { id: label.id }, data: { dealHiddenInApp: req.body.hidden } });
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'SHELF_DEAL_VISIBILITY', entity: 'label', entityId: label.id,
      details: { summary: `${req.body.hidden ? 'Hid' : 'Showed'} the shelf deal "${label.dealText}" for ${label.productName} ${req.body.hidden ? 'from' : 'in'} the app.` },
      storeId: null,
    });
  }
  res.json({ success: true, data: { labelId: label.id, hidden: req.body.hidden } });
}
