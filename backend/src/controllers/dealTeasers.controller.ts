// "Coming soon" offers and hot food combos for the app (2026-11-22): the list with countdown data, and Remind me on or off.
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import { refuse } from '../utils/refusal';
import { comingSoon, setReminder } from '../utils/dealTeasers';

/** GET /deals/coming-soon?storeId= : what is coming at this store, soonest first. */
export async function getComingSoon(req: AuthRequest, res: Response) {
  const storeId = typeof req.query.storeId === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.storeId) ? req.query.storeId : null;
  res.json({ success: true, data: await comingSoon(req.user!.id, req.user!.role, storeId) });
}

const remindSchema = z.object({ kind: z.enum(['OFFER', 'COMBO']), id: z.string().uuid(), on: z.boolean() }).strict();

/** POST /deals/remind { kind, id, on }: tell me when it starts (or not). Answers with how many are waiting now. */
export async function postRemind(req: AuthRequest, res: Response) {
  const parsed = remindSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const r = await setReminder(req.user!.id, parsed.data.kind, parsed.data.id, parsed.data.on);
  if ('error' in r) { res.status(409).json({ success: false, error: r.error }); return; }
  res.json({ success: true, data: { waiting: r.waiting, on: parsed.data.on } });
}
