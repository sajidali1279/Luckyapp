// Offers autopilot (HQ, Offers page > Autopilot card): its switch, weekly budget and offers a week; this week's auto offers with what
// each has paid; the last runs; and "Stop all". The weekly run itself is utils/offerAutopilot.ts.
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { budgetSpentMany } from '../utils/offerBudget';
import { AUTOPILOT_LIMITS, canRunNow, loadAutopilot, recentRuns, runAutopilot, saveAutopilot, stopAutoOffers, weekOf, WORKED_PER_DOLLAR, RUN_HOUR } from '../utils/offerAutopilot';
import { addStoreDays } from '../utils/storeTime';

async function state(now: Date = new Date()) {
  const [config, runs] = await Promise.all([loadAutopilot(), recentRuns(5)]);
  const week = weekOf(now);
  const offers = await prisma.offer.findMany({
    where: { autoWeek: week.from },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, autoNote: true, quiet: true, budgetCap: true, budgetReachedAt: true, startDate: true, endDate: true, category: true, storeId: true },
  });
  const spent = await budgetSpentMany(offers.map((o) => o.id));
  const thisRun = runs.find((r) => r.week.from === week.from) ?? null;
  return {
    config,
    limits: AUTOPILOT_LIMITS,
    workedPerDollar: WORKED_PER_DOLLAR,
    runHour: RUN_HOUR,
    week,
    ranThisWeek: !!thisRun,
    nextRun: thisRun || !canRunNow(now, true) ? addStoreDays(week.from, 7) : week.from,
    offers: offers.map((o) => ({ ...o, spent: Math.round((spent.get(o.id) ?? 0) * 100) / 100, running: o.endDate > now && !o.budgetReachedAt })),
    runs,
  };
}

/** GET /offers/autopilot (HQ) */
export async function getAutopilot(_req: AuthRequest, res: Response) {
  res.json({ success: true, data: await state() });
}

const schema = z.object({
  enabled: z.boolean().optional(),
  weeklyBudget: z.coerce.number({ invalid_type_error: 'Give the weekly budget in dollars.' })
    .min(AUTOPILOT_LIMITS.weeklyBudget.min, `A weekly budget of at least $${AUTOPILOT_LIMITS.weeklyBudget.min}.`)
    .max(AUTOPILOT_LIMITS.weeklyBudget.max, `A weekly budget of at most $${AUTOPILOT_LIMITS.weeklyBudget.max.toLocaleString('en-US')}.`).optional(),
  perWeek: z.coerce.number({ invalid_type_error: 'Give how many offers a week.' }).int('Give a whole number of offers.')
    .min(AUTOPILOT_LIMITS.perWeek.min, `At least ${AUTOPILOT_LIMITS.perWeek.min} offer a week.`)
    .max(AUTOPILOT_LIMITS.perWeek.max, `At most ${AUTOPILOT_LIMITS.perWeek.max} offers a week.`).optional(),
});

/** PUT /offers/autopilot (HQ): switch it on or off, or change the budget or the number of offers. Switched on, it runs at once if it can. */
export async function setAutopilot(req: AuthRequest, res: Response) {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const before = await loadAutopilot();
  const next = {
    ...before,
    ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)),
    changedAt: new Date().toISOString(),
    changedBy: req.user!.name || null,
  };
  await saveAutopilot(next);
  const changes: string[] = [];
  if (next.enabled !== before.enabled) changes.push(next.enabled ? 'switched on' : 'switched off');
  if (next.weeklyBudget !== before.weeklyBudget) changes.push(`weekly budget $${before.weeklyBudget} to $${next.weeklyBudget}`);
  if (next.perWeek !== before.perWeek) changes.push(`offers a week ${before.perWeek} to ${next.perWeek}`);
  if (changes.length) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'OFFER_AUTOPILOT_SET', entity: 'offer', entityId: 'autopilot',
      details: { summary: `Offers autopilot: ${changes.join(', ')}`, ...parsed.data }, storeId: null,
    });
  }
  let ran = false;
  if (next.enabled && !before.enabled) ran = (await runAutopilot(new Date(), { switchedOn: true })).ran;
  res.json({ success: true, data: { ...(await state()), ranNow: ran } });
}

/** POST /offers/autopilot/stop (HQ): this week's auto offers end now (the switch stays as it is). */
export async function stopAutopilotOffers(req: AuthRequest, res: Response) {
  const count = await stopAutoOffers();
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'OFFER_AUTOPILOT_STOP', entity: 'offer', entityId: 'autopilot',
    details: { summary: `Ended ${count} auto offer${count === 1 ? '' : 's'} now` }, storeId: null,
  });
  res.json({ success: true, data: { ...(await state()), stopped: count } });
}
