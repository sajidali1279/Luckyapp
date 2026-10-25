// The prize game for the app (2026-10-25): today's game and one free play a day. Every rule (odds, budget, once a day) is in
// utils/engagementGames.ts.
import { Response } from 'express';
import { AuthRequest } from '../types';
import { isCustomerAccount, NOT_A_CUSTOMER } from '../utils/customerOnly';
import { gameFor, playGame } from '../utils/engagementGames';

/** GET /engagement/games */
export async function getGame(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  res.json({ success: true, data: await gameFor(req.user!.id) });
}

/** POST /engagement/games/play { storeId?, pick? }: today's free play. The result is drawn and paid before the app shows anything. */
export async function postPlay(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  const r = await playGame(req.user!.id, { storeId: req.body?.storeId, pick: req.body?.pick });
  if (!r.ok) { res.status(r.code === 'OFF' || r.code === 'BAD_PICK' ? 400 : 409).json({ success: false, code: r.code, error: r.error, ...(r.played ? { played: r.played } : {}) }); return; }
  res.json({ success: true, data: r });
}
