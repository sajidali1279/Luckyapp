// Friends leaderboard for the app (2026-10-24): the board, and joining or leaving it. The rules (circles, opt-in, names, the number) are in
// utils/friendsBoard.ts.
import { Response } from 'express';
import { AuthRequest } from '../types';
import { isCustomerAccount, NOT_A_CUSTOMER } from '../utils/customerOnly';
import { engagement } from '../utils/appSettings';
import { friendsBoardFor, setJoined } from '../utils/friendsBoard';

/** GET /engagement/friends?when=this|last */
export async function getFriendsBoard(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  res.json({ success: true, data: await friendsBoardFor(req.user!.id, req.query.when === 'last' ? 'last' : 'this') });
}

/** POST /engagement/friends/join (show me on my circles' boards) and DELETE (take me off). Both can be repeated safely. */
export async function joinFriendsBoard(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  if (!engagement().friendsBoard.enabled) { res.status(400).json({ success: false, error: 'The friends leaderboard is not on right now.' }); return; }
  await setJoined(req.user!.id, true);
  res.json({ success: true, data: await friendsBoardFor(req.user!.id) });
}
export async function leaveFriendsBoard(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  await setJoined(req.user!.id, false);   // leaving always works, even while it is switched off
  res.json({ success: true, data: { joined: false } });
}
