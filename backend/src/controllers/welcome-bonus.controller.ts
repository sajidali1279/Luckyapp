import { Request, Response } from 'express';
import prisma from '../lib/prisma';

// Day → reward assignment (1-indexed, cycles over 4 items for 7 days)
const DAY_REWARDS: Record<number, string> = {
  1: 'FOUNTAIN_DRINK',
  2: 'COFFEE',
  3: 'SODA_12OZ',
  4: 'HOT_SNACK',
  5: 'FOUNTAIN_DRINK',
  6: 'COFFEE',
  7: 'SODA_12OZ',
};

const REWARD_LABELS: Record<string, { label: string; emoji: string }> = {
  FOUNTAIN_DRINK: { label: 'Free Fountain Drink', emoji: '🥤' },
  COFFEE:         { label: 'Free Coffee',          emoji: '☕' },
  SODA_12OZ:      { label: 'Free 12oz Soda',       emoji: '🥤' },
  HOT_SNACK:      { label: 'Free Hot Food Snack',  emoji: '🌮' },
};

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Returns midnight UTC of a given date
function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function getDayNumber(createdAt: Date): number {
  const creation = toDateOnly(createdAt);
  const today = toDateOnly(new Date());
  const diffMs = today.getTime() - creation.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

// GET /welcome-bonus — customer views their current bonus status
export async function getWelcomeBonusStatus(req: Request, res: Response) {
  try {
    const customerId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: customerId }, select: { createdAt: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const dayNumber = getDayNumber(user.createdAt);

    if (dayNumber < 1 || dayNumber > 7) {
      return res.json({ success: true, data: { active: false } });
    }

    const rewardType = DAY_REWARDS[dayNumber];
    const reward = REWARD_LABELS[rewardType];

    // Fetch all claims for this customer
    const claims = await prisma.welcomeBonusClaim.findMany({ where: { customerId } });
    const claimsMap = Object.fromEntries(claims.map(c => [c.day, c]));

    const todayClaim = claimsMap[dayNumber] ?? null;

    return res.json({
      success: true,
      data: {
        active: true,
        dayNumber,
        totalDays: 7,
        rewardType,
        rewardLabel: reward.label,
        rewardEmoji: reward.emoji,
        claimed: !!todayClaim,
        confirmed: todayClaim?.confirmedAt != null,
        claimCode: todayClaim?.claimCode ?? null,
        claimedAt: todayClaim?.claimedAt ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// POST /welcome-bonus/claim — customer claims today's reward
export async function claimWelcomeBonus(req: Request, res: Response) {
  try {
    const customerId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: customerId }, select: { createdAt: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const dayNumber = getDayNumber(user.createdAt);

    if (dayNumber < 1 || dayNumber > 7) {
      return res.status(400).json({ success: false, error: 'Welcome bonus has expired' });
    }

    // Check if already claimed today
    const existing = await prisma.welcomeBonusClaim.findUnique({
      where: { customerId_day: { customerId, day: dayNumber } },
    });
    if (existing) {
      return res.json({
        success: true,
        data: {
          claimCode: existing.claimCode,
          rewardType: existing.rewardType,
          rewardLabel: REWARD_LABELS[existing.rewardType]?.label,
          rewardEmoji: REWARD_LABELS[existing.rewardType]?.emoji,
          confirmed: existing.confirmedAt != null,
        },
      });
    }

    const rewardType = DAY_REWARDS[dayNumber];

    // Generate unique 6-char code
    let claimCode = generateCode();
    let attempts = 0;
    while (attempts < 10) {
      const conflict = await prisma.welcomeBonusClaim.findUnique({ where: { claimCode } });
      if (!conflict) break;
      claimCode = generateCode();
      attempts++;
    }

    const claim = await prisma.welcomeBonusClaim.create({
      data: { customerId, day: dayNumber, rewardType, claimCode },
    });

    return res.json({
      success: true,
      data: {
        claimCode: claim.claimCode,
        rewardType: claim.rewardType,
        rewardLabel: REWARD_LABELS[claim.rewardType]?.label,
        rewardEmoji: REWARD_LABELS[claim.rewardType]?.emoji,
        confirmed: false,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// GET /welcome-bonus/customer/:qrCode — employee fetches unconfirmed claim for a customer
export async function getCustomerWelcomeBonus(req: Request, res: Response) {
  try {
    const { qrCode } = req.params;
    const customer = await prisma.user.findUnique({
      where: { qrCode },
      select: { id: true, name: true, createdAt: true },
    });
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

    const dayNumber = getDayNumber(customer.createdAt);
    if (dayNumber < 1 || dayNumber > 7) {
      return res.json({ success: true, data: null });
    }

    const claim = await prisma.welcomeBonusClaim.findUnique({
      where: { customerId_day: { customerId: customer.id, day: dayNumber } },
    });

    if (!claim || claim.confirmedAt != null) {
      return res.json({ success: true, data: null });
    }

    const reward = REWARD_LABELS[claim.rewardType];

    return res.json({
      success: true,
      data: {
        claimId: claim.id,
        claimCode: claim.claimCode,
        day: claim.day,
        rewardType: claim.rewardType,
        rewardLabel: reward?.label,
        rewardEmoji: reward?.emoji,
        customerName: customer.name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// POST /welcome-bonus/confirm — employee confirms the claim
export async function confirmWelcomeBonus(req: Request, res: Response) {
  try {
    const { claimCode, storeId } = req.body as { claimCode?: string; storeId?: string };
    if (!claimCode) return res.status(400).json({ success: false, error: 'claimCode required' });

    const claim = await prisma.welcomeBonusClaim.findUnique({ where: { claimCode } });
    if (!claim) return res.status(404).json({ success: false, error: 'Claim code not found' });
    if (claim.confirmedAt) return res.status(400).json({ success: false, error: 'Already confirmed' });

    const confirmed = await prisma.welcomeBonusClaim.update({
      where: { claimCode },
      data: {
        confirmedAt: new Date(),
        confirmedById: req.user!.id,
        storeId: storeId ?? null,
      },
    });

    const reward = REWARD_LABELS[confirmed.rewardType];
    return res.json({
      success: true,
      data: {
        rewardLabel: reward?.label,
        rewardEmoji: reward?.emoji,
        day: confirmed.day,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}
