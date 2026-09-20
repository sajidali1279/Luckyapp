import { Response } from 'express';
import { z } from 'zod';

/**
 * Answers a refused request with the first problem as one plain sentence in `error` (the admin and the mobile apps show it as
 * it is) and the full zod detail in `details`. Our own messages are complete sentences ending in a period; anything else is a
 * stock zod message that needs its field name in front.
 */
export function refuse(res: Response, error: z.ZodError): void {
  const first = error.issues[0];
  const field = first?.path.join('.') ?? '';
  const text = !first ? 'Some of the values were not accepted.' : first.message.endsWith('.') || !field ? first.message : `${field}: ${first.message}`;
  res.status(400).json({ success: false, error: text, details: error.flatten() });
}
