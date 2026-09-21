// Sending push messages and reading what the push service says back.
//
// Expo's push service answers a batch with one "ticket" per phone: "ok", or an error, and an error of DeviceNotRegistered means the app was
// uninstalled and that phone will never receive anything again. Before, every answer was thrown away: a refused batch counted as sent, a failed
// batch of a chain-wide send was swallowed (or, for a store, reported as an error after some phones already had the message, which invited a
// duplicate), and dead phones stayed on file for ever (production: one employee account with 17 phones, one manager with 10).

import prisma from '../config/prisma';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export interface PushOutcome {
  /** Phones the message was offered to (each phone counted once) */
  attempted: number;
  /** Phones the push service accepted (that is "handed to Apple or Google", not "shown on the screen") */
  accepted: number;
  /** Phones the push service refused, or that were in a batch it never answered */
  failed: number;
  /** Phones it said are gone (app uninstalled), now taken off file */
  removed: number;
  /** Batches that failed once and were sent again */
  retried: number;
  /** A few plain reasons for the failures, for the Activity Log */
  reasons: string[];
}

type Ticket = { status?: string; message?: string; details?: { error?: string } } | null | undefined;
type Post = { ok: true; tickets: Ticket[] | null } | { ok: false; reason: string; retryable: boolean };

async function post(chunk: string[], message: { title: string; body: string; actionUrl?: string }): Promise<Post> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk.map((to) => ({ to, title: message.title, body: message.body, sound: 'default', ...(message.actionUrl && { data: { actionUrl: message.actionUrl } }) }))),
    });
    if (res.ok === false) {
      const status = (res as { status?: number }).status ?? 0;
      return { ok: false, reason: status === 429 ? 'The push service asked us to slow down (429)' : `The push service answered ${status || 'an error'}`, retryable: status === 429 || status >= 500 || status === 0 };
    }
    let json: { data?: Ticket[] } | null = null;
    try { json = (await res.json()) as { data?: Ticket[] }; } catch { /* the body could not be read: the batch was accepted, the tickets are unknown */ }
    return { ok: true, tickets: Array.isArray(json?.data) ? json!.data! : null };
  } catch {
    return { ok: false, reason: 'Could not reach the push service', retryable: true };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends one message to many phones, 100 to a batch, and reports what really happened. A batch that fails is sent once more (after a pause) before
 * it is counted as failed; the answer for each phone is read; a phone the service says is gone is removed from the database. Never throws.
 */
export async function sendExpoBatch(
  tokens: string[],
  message: { title: string; body: string; actionUrl?: string },
  options: { retryDelayMs?: number } = {},
): Promise<PushOutcome> {
  const unique = [...new Set(tokens)];
  const outcome: PushOutcome = { attempted: unique.length, accepted: 0, failed: 0, removed: 0, retried: 0, reasons: [] };
  const dead: string[] = [];
  const retryDelayMs = options.retryDelayMs ?? Number(process.env.PUSH_RETRY_DELAY_MS ?? 1500);   // the environment variable lets a test run without the pause

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    let result = await post(chunk, message);
    if (!result.ok && result.retryable) {
      outcome.retried += 1;
      await sleep(retryDelayMs);
      result = await post(chunk, message);
    }
    if (!result.ok) {
      outcome.failed += chunk.length;
      if (outcome.reasons.length < 5) outcome.reasons.push(`${chunk.length} phone${chunk.length === 1 ? '' : 's'}: ${result.reason}`);
      continue;
    }
    if (!result.tickets) { outcome.accepted += chunk.length; continue; }   // an answer with no per-phone detail: taken as accepted
    chunk.forEach((token, j) => {
      const t = result.tickets![j];
      if (t?.status === 'error') {
        outcome.failed += 1;
        if (t.details?.error === 'DeviceNotRegistered') dead.push(token);
        else if (outcome.reasons.length < 5) outcome.reasons.push(t.message ?? t.details?.error ?? 'The push service refused a phone');
      } else {
        outcome.accepted += 1;
      }
    });
  }

  if (dead.length > 0) {
    try {
      outcome.removed = (await prisma.pushToken.deleteMany({ where: { token: { in: dead } } })).count;
    } catch { /* taking dead phones off file is housekeeping: it must not turn a sent message into an error */ }
  }
  return outcome;
}
