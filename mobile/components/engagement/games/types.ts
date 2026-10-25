// The prize game's shapes, as the server sends them (backend utils/engagementGames.ts, 2026-10-25).
export type GameKind = 'SPIN' | 'SCRATCH' | 'LUCKY';
export type Prize = { pts: number; chance: number };
export type GameState =
  | { enabled: false }
  | { enabled: true; game: GameKind; prizes: Prize[]; open: boolean; since: string | null; endsOn: string | null; played: { pts: number; at: string } | null; nextPlayAt: string };
export type PlayResult = { ok: true; pts: number; index: number; number: number | null; nextPlayAt: string };

export const GAME_EMOJI: Record<GameKind, string> = { SPIN: '🎡', SCRATCH: '🎟️', LUCKY: '🍀' };
