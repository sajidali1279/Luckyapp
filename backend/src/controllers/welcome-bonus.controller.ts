import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest as Request } from '../types';

const VALID_REWARD_TYPES = ['FOUNTAIN_DRINK', 'COFFEE', 'SODA_12OZ', 'HOT_SNACK'];

const REWARD_LABELS: Record<string, { label: string; emoji: string }> = {
  FOUNTAIN_DRINK: { label: 'Free Fountain Drink', emoji: '🥤' },
  COFFEE:         { label: 'Free Coffee',          emoji: '☕' },
  SODA_12OZ:      { label: 'Free 12oz Soda',       emoji: '🥤' },
  HOT_SNACK:      { label: 'Free Hot Food Snack',  emoji: '🌮' },
};

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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

    const todayClaim = await prisma.welcomeBonusClaim.findUnique({
      where: { customerId_day: { customerId, day: dayNumber } },
    });

    const claimedReward = todayClaim ? REWARD_LABELS[todayClaim.rewardType] : null;

    return res.json({
      success: true,
      data: {
        active: true,
        dayNumber,
        totalDays: 7,
        // Available choices (only sent when not yet claimed today)
        rewards: !todayClaim ? VALID_REWARD_TYPES.map(rt => ({ rewardType: rt, ...REWARD_LABELS[rt] })) : undefined,
        // Claimed info
        claimed: !!todayClaim,
        confirmed: todayClaim?.confirmedAt != null,
        claimCode: todayClaim?.claimCode ?? null,
        rewardType: todayClaim?.rewardType ?? null,
        rewardLabel: claimedReward?.label ?? null,
        rewardEmoji: claimedReward?.emoji ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

// POST /welcome-bonus/claim — customer claims today's reward (body: { rewardType })
export async function claimWelcomeBonus(req: Request, res: Response) {
  try {
    const customerId = req.user!.id;
    const { rewardType } = req.body as { rewardType?: string };

    if (!rewardType || !VALID_REWARD_TYPES.includes(rewardType)) {
      return res.status(400).json({ success: false, error: 'Invalid rewardType. Choose FOUNTAIN_DRINK, COFFEE, SODA_12OZ, or HOT_SNACK.' });
    }

    const user = await prisma.user.findUnique({ where: { id: customerId }, select: { createdAt: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const dayNumber = getDayNumber(user.createdAt);

    if (dayNumber < 1 || dayNumber > 7) {
      return res.status(400).json({ success: false, error: 'Welcome bonus has expired' });
    }

    // Already claimed today — return existing
    const existing = await prisma.welcomeBonusClaim.findUnique({
      where: { customerId_day: { customerId, day: dayNumber } },
    });
    if (existing) {
      const reward = REWARD_LABELS[existing.rewardType];
      return res.json({
        success: true,
        data: {
          claimCode: existing.claimCode,
          rewardType: existing.rewardType,
          rewardLabel: reward?.label,
          rewardEmoji: reward?.emoji,
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

    const claim = await prisma.welcomeBonusClaim.create({
      data: { customerId, day: dayNumber, rewardType, claimCode },
    });

    const reward = REWARD_LABELS[claim.rewardType];
    return res.json({
      success: true,
      data: {
        claimCode: claim.claimCode,
        rewardType: claim.rewardType,
        rewardLabel: reward?.label,
        rewardEmoji: reward?.emoji,
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
      data: { confirmedAt: new Date(), confirmedById: req.user!.id, storeId: storeId ?? null },
    });

    const reward = REWARD_LABELS[confirmed.rewardType];
    return res.json({
      success: true,
      data: { rewardLabel: reward?.label, rewardEmoji: reward?.emoji, day: confirmed.day },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}
