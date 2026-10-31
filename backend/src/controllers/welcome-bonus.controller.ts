import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest as Request } from '../types';
import { storeDateKey, storeDaysBetween, storeDayStart } from '../utils/storeTime';
import { canUseStore } from '../utils/storeAccess';
import { isCustomerAccount, NOT_A_CUSTOMER } from '../utils/customerOnly';
import { resolveServedBy, servedByDetails, ServedBy } from '../utils/servedBy';
import { audit } from '../utils/audit';
import { welcome, welcomeAt } from '../utils/appSettings';

// HQ's Grant & Redeem page (2026-10-15) hands the gift out for an employee with no phone: the Activity Log keeps who served
function auditHQGift(req: Request, servedBy: ServedBy | null, customerId: string, rewardType: string, day: number, storeId?: string) {
  if (!servedBy) return;
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'WELCOME_GIFT', entity: 'welcome_bonus_claim', entityId: customerId,
    details: { rewardType, day, ...servedByDetails(servedBy) },
    storeId: storeId ?? null,
  });
}

// The items, the number of days and on/off are HQ's (2026-10-17, admin Settings > Joining bonus, utils/appSettings.ts welcome()).
// They were fixed here: 7 days, fountain drink, coffee, 12oz soda, hot snack.

/** An item's words and picture, switched off or not (a gift given before it was switched off still shows its name). */
function itemOf(rewardType: string): { label: string; labelEs: string; emoji: string } {
  const i = welcome().items.find((x) => x.key === rewardType);
  return i ? { label: i.name, labelEs: i.nameEs, emoji: i.emoji } : { label: 'Free item', labelEs: 'Artículo gratis', emoji: '🎁' };
}
/** The items a customer can choose today, for the app (both languages: the app shows the one it is set to). At a store, only the items that store offers. */
const choices = (storeId?: string) => { const keys = welcomeAt(storeId).itemKeys; return welcome().items.filter((i) => i.active && (!keys || keys.includes(i.key))).map((i) => ({ rewardType: i.key, label: i.name, labelEs: i.nameEs, emoji: i.emoji })); };
const uuidOnly = (v: unknown): string | undefined => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined);

/**
 * What the customer has spent at this store today (the store's day): approved sales only (a sale held for a manager counts once it is approved, so a held or later rejected sale cannot unlock the item).
 * Not a reward line, not test data, and a sale that was never finished, rejected or voided does not count (2026-10-20, "spend $X to get your free item").
 */
export async function welcomeSpentToday(customerId: string, storeId: string, now: Date = new Date()): Promise<number> {
  const r = await prisma.pointsTransaction.aggregate({
    where: { customerId, storeId, createdAt: { gte: storeDayStart(now) }, isTestData: false, challengeId: null, referralId: null, status: 'APPROVED' },
    _sum: { purchaseAmount: true },
  });
  return Math.round((r._sum.purchaseAmount ?? 0) * 100) / 100;
}

/** The spend a store asks for today and how far the customer is (spent is null when the store is not known, or nothing is asked). */
async function spendInfo(customerId: string, storeId?: string) {
  const required = welcomeAt(storeId).minSpend;
  if (required <= 0) return { required: 0, spent: null as number | null, unlocked: true as boolean | null };
  if (!storeId) return { required, spent: null as number | null, unlocked: null as boolean | null };
  const spent = await welcomeSpentToday(customerId, storeId);
  return { required, spent, unlocked: spent + 0.005 >= required };
}

/**
 * May this item be handed over at this store now? null = yes. The store has to offer it, and the customer has to have spent what the store asks
 * today. Where the chain or any store has a rule, the store must be named, so an old cashier app cannot hand it out without the checks.
 */
async function welcomeGate(customerId: string, storeId: string | undefined, rewardType: string): Promise<{ status: number; code: string; error: string; data?: unknown } | null> {
  const w = welcome();
  if (!storeId) return w.minSpend > 0 || Object.keys(w.stores).length > 0 ? { status: 400, code: 'STORE_REQUIRED', error: 'Choose which store you are at to hand out the welcome gift.' } : null;
  const here = welcomeAt(storeId);
  if (!here.offered) return { status: 400, code: 'NOT_HERE', error: 'The welcome gift is not offered at this store.' };
  if (here.itemKeys && !here.itemKeys.includes(rewardType)) {
    const names = choices(storeId).map((c) => c.label).join(', ');
    return { status: 400, code: 'ITEM_NOT_HERE', error: `That item is not offered at this store.${names ? ` Offered here: ${names}.` : ''}` };
  }
  if (here.minSpend > 0) {
    const spent = await welcomeSpentToday(customerId, storeId);
    if (spent + 0.005 < here.minSpend) {
      return { status: 400, code: 'SPEND_MORE', error: `Spend $${here.minSpend.toFixed(2)} here today to unlock the free item. This customer has spent $${spent.toFixed(2)} so far.`, data: { required: here.minSpend, spent } };
    }
  }
  return null;
}
const canChoose = (rewardType: unknown): rewardType is string => typeof rewardType === 'string' && welcome().items.some((i) => i.key === rewardType && i.active);
/** The claimed item's words, as the app has always read them (rewardLabel / rewardEmoji), plus the Spanish name. */
const claimedWords = (rewardType: string) => { const i = itemOf(rewardType); return { rewardLabel: i.label, rewardLabelEs: i.labelEs, rewardEmoji: i.emoji }; };

/** Which day of the bonus it is for this customer, or null when they do not get it (past their days, or they joined while HQ had it
 *  switched off). Customers who joined before it was switched off keep their days. */
export function welcomeDay(createdAt: Date, now: Date = new Date()): number | null {
  const w = welcome();
  const day = getDayNumber(createdAt, now);
  if (day < 1 || day > w.days) return null;
  if (!w.enabled && !(w.offSince && createdAt.getTime() < Date.parse(w.offSince))) return null;
  return day;
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Which day of the week-long bonus it is, in store days (Central): day 1 is the day the customer signed up at the store's clock.
// It used to count UTC days, which turn over at 7 pm in Texas: a customer could take one free item at 6:59 pm and the next at
// 7:00 pm, and someone signing up in the evening got a "day 1" a few hours long.
export function getDayNumber(createdAt: Date, now: Date = new Date()): number {
  return storeDaysBetween(storeDateKey(createdAt), storeDateKey(now)) + 1;
}

// GET /welcome-bonus, customer views their current bonus status
export async function getWelcomeBonusStatus(req: Request, res: Response) {
  try {
    const customerId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: customerId }, select: { createdAt: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    // The store the customer is at (the app sends the nearest one): its own rules, items and spend
    const storeId = uuidOnly(req.query?.storeId);

    const dayNumber = welcomeDay(user.createdAt);

    if (dayNumber == null) {
      return res.json({ success: true, data: { active: false } });
    }

    const todayClaim = await prisma.welcomeBonusClaim.findUnique({
      where: { customerId_day: { customerId, day: dayNumber } },
    });
    // Nothing to choose (HQ switched every item off) and nothing chosen: no card today
    // (or this store does not offer it)
    if (!todayClaim && (choices(storeId).length === 0 || !welcomeAt(storeId).offered)) return res.json({ success: true, data: { active: false } });

    return res.json({
      success: true,
      data: {
        active: true,
        dayNumber,
        totalDays: welcome().days,
        // What this store asks to be spent today first, and how far the customer is
        spend: await spendInfo(customerId, storeId),
        // Available choices (only sent when not yet claimed today)
        rewards: !todayClaim ? choices(storeId) : undefined,
        // Claimed info
        claimed: !!todayClaim,
        confirmed: todayClaim?.confirmedAt != null,
        claimCode: todayClaim?.claimCode ?? null,
        rewardType: todayClaim?.rewardType ?? null,
        ...(todayClaim ? claimedWords(todayClaim.rewardType) : { rewardLabel: null, rewardLabelEs: null, rewardEmoji: null }),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// POST /welcome-bonus/claim, customer claims today's reward (body: { rewardType })
export async function claimWelcomeBonus(req: Request, res: Response) {
  try {
    const customerId = req.user!.id;
    const { rewardType } = req.body as { rewardType?: string };

    if (!canChoose(rewardType)) {
      return res.status(400).json({ success: false, error: "That item is not offered any more. Pull down to see today's choices." });
    }

    const user = await prisma.user.findUnique({ where: { id: customerId }, select: { createdAt: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const dayNumber = welcomeDay(user.createdAt);

    if (dayNumber == null) {
      return res.status(400).json({ success: false, error: 'Welcome bonus has expired' });
    }

    // Already claimed today, return existing
    const existing = await prisma.welcomeBonusClaim.findUnique({
      where: { customerId_day: { customerId, day: dayNumber } },
    });
    if (existing) {
      return res.json({
        success: true,
        data: {
          claimCode: existing.claimCode,
          rewardType: existing.rewardType,
          ...claimedWords(existing.rewardType),
          confirmed: existing.confirmedAt != null,
        },
      });
    }

    // Generate unique 6-char code
    let claimCode = generateCode();
    for (let i = 0; i < 10; i++) {
      const conflict = await prisma.welcomeBonusClaim.findUnique({ where: { claimCode } });
      if (!conflict) break;
      claimCode = generateCode();
    }

    // A double tap sends two claims at once: the second hits the one-per-day rule. Answer it with the claim that exists, not a server error.
    const claim = await prisma.welcomeBonusClaim.create({
      data: { customerId, day: dayNumber, rewardType, claimCode },
    }).catch(async (e: any) => {
      if (e?.code !== 'P2002') throw e;
      const again = await prisma.welcomeBonusClaim.findUnique({ where: { customerId_day: { customerId, day: dayNumber } } });
      if (!again) throw e;
      return again;
    });

    return res.json({
      success: true,
      data: {
        claimCode: claim.claimCode,
        rewardType: claim.rewardType,
        ...claimedWords(claim.rewardType),
        confirmed: false,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// GET /welcome-bonus/customer/:qrCode, employee fetches unconfirmed claim for a customer
export async function getCustomerWelcomeBonus(req: Request, res: Response) {
  try {
    const { qrCode } = req.params;
    const customer = await prisma.user.findUnique({
      where: { qrCode },
      select: { id: true, name: true, createdAt: true, role: true },
    });
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (!isCustomerAccount(customer)) return res.status(403).json({ success: false, error: NOT_A_CUSTOMER });
    const storeId = uuidOnly(req.query?.storeId);   // the store the cashier is at (2026-10-20): its rules, items and spend
    if (storeId && !welcomeAt(storeId).offered) return res.json({ success: true, data: null });

    const dayNumber = welcomeDay(customer.createdAt);
    if (dayNumber == null) {
      return res.json({ success: true, data: null });
    }

    const claim = await prisma.welcomeBonusClaim.findUnique({
      where: { customerId_day: { customerId: customer.id, day: dayNumber } },
    });

    if (claim?.confirmedAt != null) {
      return res.json({ success: true, data: null });   // today's item was already handed over
    }
    // Not chosen in the customer's app yet (2026-10-10): an app that asks with ?offer=1 lets the cashier give it straight from the scan
    // (POST /welcome-bonus/give). Older cashier apps do not ask, and get nothing here, as before.
    if (!claim) {
      if (req.query.offer !== '1' || choices(storeId).length === 0) return res.json({ success: true, data: null });
      return res.json({
        success: true,
        data: { claimed: false, day: dayNumber, totalDays: welcome().days, customerName: customer.name, rewards: choices(storeId), spend: await spendInfo(customer.id, storeId) },
      });
    }

    return res.json({
      success: true,
      data: {
        claimed: true,
        claimId: claim.id,
        claimCode: claim.claimCode,
        day: claim.day,
        totalDays: welcome().days,
        rewardType: claim.rewardType,
        ...claimedWords(claim.rewardType),
        customerName: customer.name,
        spend: await spendInfo(customer.id, storeId),
        itemHere: !storeId || !welcomeAt(storeId).itemKeys || welcomeAt(storeId).itemKeys!.includes(claim.rewardType),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// POST /welcome-bonus/confirm, employee confirms the claim
export async function confirmWelcomeBonus(req: Request, res: Response) {
  try {
    const { claimCode, storeId } = req.body as { claimCode?: string; storeId?: string };
    if (!claimCode) return res.status(400).json({ success: false, error: 'claimCode required' });

    const claim = await prisma.welcomeBonusClaim.findUnique({ where: { claimCode } });
    if (!claim) return res.status(404).json({ success: false, error: 'Claim code not found' });
    if (claim.confirmedAt) return res.status(400).json({ success: false, error: 'Already confirmed' });
    // One free item a day: a code is good on its own day only, so unused days cannot be saved up and taken in one visit
    const owner = await prisma.user.findUnique({ where: { id: claim.customerId }, select: { createdAt: true } });
    if (!owner || claim.day !== welcomeDay(owner.createdAt)) {
      return res.status(400).json({ success: false, error: `That code was for day ${claim.day} of the welcome bonus and has expired. Today's reward needs today's code.` });
    }
    // Counted at a store the cashier works at
    if (storeId && !(req.user!.storeIds ?? []).includes(storeId) && !(await canUseStore(req.user!.id, req.user!.role, storeId))) {
      return res.status(403).json({ success: false, error: 'You can only hand out rewards at a store you work at.' });
    }
    // This store's rules: it offers the item, and the customer has spent what it asks today
    const gate = await welcomeGate(claim.customerId, storeId, claim.rewardType);
    if (gate) return res.status(gate.status).json({ success: false, code: gate.code, error: gate.error, data: gate.data });
    const served = await resolveServedBy(req.user!, req.body.servedById, storeId);
    if (!served.ok) return res.status(served.status).json({ success: false, error: served.error });

    // Only if still unconfirmed, so a double tap cannot confirm (and log) the same free item twice
    const { count } = await prisma.welcomeBonusClaim.updateMany({
      where: { claimCode, confirmedAt: null },
      data: { confirmedAt: new Date(), confirmedById: req.user!.id, storeId: storeId ?? null },
    });
    if (count === 0) return res.status(400).json({ success: false, error: 'Already confirmed' });
    const confirmed = await prisma.welcomeBonusClaim.findUniqueOrThrow({ where: { claimCode } });
    auditHQGift(req, served.servedBy, confirmed.customerId, confirmed.rewardType, confirmed.day, storeId);

    return res.json({
      success: true,
      data: { ...claimedWords(confirmed.rewardType), rewardType: confirmed.rewardType, day: confirmed.day, totalDays: welcome().days },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// POST /welcome-bonus/give { qrCode, rewardType, storeId } (2026-10-10): the cashier gives today's welcome item straight from the scan,
// for a new customer who did not choose it in their app first. Same rules: days 1 to 7 of the account, one item a day, at a store the
// cashier works at, recorded with who gave it. If the customer had chosen one in the app and not picked it up, that one is used, with
// the item the cashier actually handed over.
export async function giveWelcomeBonus(req: Request, res: Response) {
  try {
    const { qrCode, rewardType, storeId } = req.body as { qrCode?: string; rewardType?: string; storeId?: string };
    if (!qrCode) return res.status(400).json({ success: false, error: 'Scan the customer first.' });
    if (!canChoose(rewardType)) return res.status(400).json({ success: false, error: 'Choose the item you are handing over.' });
    const customer = await prisma.user.findUnique({ where: { qrCode }, select: { id: true, createdAt: true, role: true, isActive: true } });
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (!isCustomerAccount(customer)) return res.status(403).json({ success: false, error: NOT_A_CUSTOMER });
    if (!customer.isActive) return res.status(403).json({ success: false, error: 'This account is restricted. It cannot get rewards right now.' });
    const day = welcomeDay(customer.createdAt);
    if (day == null) {
      const w = welcome();
      return res.status(400).json({ success: false, error: w.enabled ? `The welcome gift is only for the first ${w.days} day${w.days === 1 ? '' : 's'} after signing up.` : 'The welcome gift is switched off for new sign-ups.' });
    }
    if (storeId && !(req.user!.storeIds ?? []).includes(storeId) && !(await canUseStore(req.user!.id, req.user!.role, storeId))) {
      return res.status(403).json({ success: false, error: 'You can only hand out rewards at a store you work at.' });
    }
    const gate = await welcomeGate(customer.id, storeId, rewardType);
    if (gate) return res.status(gate.status).json({ success: false, code: gate.code, error: gate.error, data: gate.data });
    const served = await resolveServedBy(req.user!, req.body.servedById, storeId);
    if (!served.ok) return res.status(served.status).json({ success: false, error: served.error });
    const given = { confirmedAt: new Date(), confirmedById: req.user!.id, storeId: storeId ?? null, rewardType };
    const existing = await prisma.welcomeBonusClaim.findUnique({ where: { customerId_day: { customerId: customer.id, day } } });
    if (existing) {
      // Only if still not handed over, so two cashiers (or a double tap) cannot give today's item twice
      const { count } = await prisma.welcomeBonusClaim.updateMany({ where: { id: existing.id, confirmedAt: null }, data: given });
      if (count === 0) return res.status(400).json({ success: false, error: "Today's welcome gift was already given." });
    } else {
      let claimCode = generateCode();
      for (let i = 0; i < 10 && (await prisma.welcomeBonusClaim.findUnique({ where: { claimCode } })); i++) claimCode = generateCode();
      try {
        await prisma.welcomeBonusClaim.create({ data: { customerId: customer.id, day, claimCode, ...given } });
      } catch (e: any) {
        if (e?.code === 'P2002') return res.status(400).json({ success: false, error: "Today's welcome gift was already given." });
        throw e;
      }
    }
    auditHQGift(req, served.servedBy, customer.id, rewardType, day, storeId);
    return res.json({ success: true, data: { ...claimedWords(rewardType), rewardType, day, totalDays: welcome().days } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}
