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

// ─── Offers ───────────────────────────────────────────────────────────────────

// Total cashback is held at CASHBACK_RATE_CAP of a sale (10%) whatever is configured, so a bonus above that can never
// be paid. Refusing it here catches a typo (50 for 5) when it is made, not on every sale afterwards.
const MAX_BONUS_TEXT = `${Math.round(CASHBACK_RATE_CAP * 100)}%`;
const BONUS_TOO_BIG = `A bonus can be at most ${MAX_BONUS_TEXT}, because total cashback is capped at ${MAX_BONUS_TEXT} of the sale.`;
const MAX_CENTS_PER_GALLON = 40; // about the 10% ceiling on a $4 gallon
export const MANAGER_CASHBACK_MESSAGE = 'Cashback promotions need HQ approval. Ask a Super Admin to set one up for your store, or post a Deal (a price special) instead.';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
// Multipart forms send everything as text: 'true' is true and anything else (including 'false') is not
const flag = (v: unknown) => v === true || v === 'true';
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
const offerSchema = z.object({
  title: z.string({ required_error: 'Add a title.' }).trim().min(1, 'Add a title.').max(100, 'The title can be at most 100 characters.'),
  description: z.string().max(500, 'The description can be at most 500 characters.').optional().default(''),
  type: z.nativeEnum(OfferType).default(OfferType.ALL_STORES),
  storeId: z.preprocess(blankToUndefined, z.string().uuid('Choose a store from the list.').optional()),
  category: z.preprocess(blankToUndefined, z.nativeEnum(ProductCategory).optional()),
  bonusRate: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(CASHBACK_RATE_CAP, BONUS_TOO_BIG).optional()),
  tierBonusRates: tierMapField.optional().nullable(),
  gasBonusCentsPerGallon: z.preprocess(blankToUndefined, cpgField.optional().nullable()),
  dealText: z.preprocess(blankToUndefined, z.string().trim().max(40, 'The deal text can be at most 40 characters.').optional()),
  requires21: z.preprocess(flag, z.boolean()).optional().default(false),
  startDate: z.string({ required_error: 'Choose a start date.' }).datetime({ message: 'Choose a start date.' }),
  endDate: z.string({ required_error: 'Choose an end date.' }).datetime({ message: 'Choose an end date.' }),
}).superRefine((d, ctx) => {
  const start = new Date(d.startDate).getTime();
  const end = new Date(d.endDate).getTime();
  if (!(start < end)) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date must be after the start date.' });
  else if (end <= Date.now()) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'That end date has already passed.' });
  if (d.type === OfferType.SPECIFIC_STORE && !d.storeId) ctx.addIssue({ code: 'custom', path: ['storeId'], message: 'Choose which store this is for.' });
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
  if (isManager && asksForCashback(req.body)) {
    res.status(403).json({ success: false, error: MANAGER_CASHBACK_MESSAGE });
    return;
  }

  const parsed = offerSchema.safeParse(req.body);
  if (!parsed.success) {
    refuse(res, parsed.error);
    return;
  }

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
    data: { ...parsed.data, imageUrl, startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate) } as any,
  });

  // Customers hear about it when it STARTS: now if it already has, otherwise the hourly job announces it on its first day. A single-store promotion goes
  // to that store's customers, not to everyone. The message expires when the promotion ends.
  if (offer.startDate.getTime() <= Date.now() + 60_000) {
    announceOffer({ id: offer.id, title: offer.title, storeId: offer.storeId, endDate: offer.endDate, createdAt: offer.createdAt }).catch((e) => console.error('[offers] announcement failed:', e?.message ?? e));
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_OFFER', entity: 'offer', entityId: offer.id,
    details: {
      title: offer.title, type: offer.type, category: offer.category, bonusRate: offer.bonusRate,
      gasBonusCentsPerGallon: offer.gasBonusCentsPerGallon, dealText: offer.dealText,
      startDate: offer.startDate, endDate: offer.endDate,
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

  const offers = await prisma.offer.findMany({
    where: {
      isActive: true,
      ...(withScheduled ? {} : { startDate: { lte: now } }),
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

  res.json({ success: true, data: offers });
}

const updateOfferSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(100, 'The title can be at most 100 characters.').optional(),
  description: z.string().min(1).max(500, 'The description can be at most 500 characters.').optional(),
  type: z.nativeEnum(OfferType).optional(),
  storeId: z.string().uuid().nullable().optional(),
  category: z.nativeEnum(ProductCategory).nullable().optional(),
  bonusRate: z.coerce.number().min(0).max(CASHBACK_RATE_CAP, BONUS_TOO_BIG).nullable().optional(),
  tierBonusRates: z.record(z.string(), z.number().min(0).max(CASHBACK_RATE_CAP, BONUS_TOO_BIG)).nullable().optional(),
  gasBonusCentsPerGallon: cpgField.nullable().optional(),
  dealText: z.string().min(1).max(40, 'The deal text can be at most 40 characters.').nullable().optional(),
  requires21: z.coerce.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
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
    if (existingHasCashback) delete d.category;
  }

  const { startDate, endDate, ...rest } = parsed.data;
  const offer = await prisma.offer.update({
    where: { id: offerId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      ...rest,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
    } as any,
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_OFFER', entity: 'offer', entityId: offer.id,
    details: { title: offer.title, isActive: offer.isActive },
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
