import { Prisma } from '@prisma/client';

// What the last-resort error handler answers. Most handlers check their own input; the ones that do not, and every race, used to
// end here as "Internal server error" (500) for things that are not the server's fault: a record someone else just deleted, a link
// to something that no longer exists, a file over the size limit, a request the database could not read. Those now get a status
// and a sentence the admin and the app can show. Anything else is still a 500 (and is logged with its full detail by the caller).
// P2024 no free connection, P2028 a transaction that ran out of time or was closed, P2034 a write conflict or deadlock,
// P1001/P1002 the database could not be reached or answered too late, P1008 an operation timed out, P1017 the connection was closed
const BUSY_CODES = new Set(['P2024', 'P2028', 'P2034', 'P1001', 'P1002', 'P1008', 'P1017']);
const BUSY = 'The server is busy for a moment. Try again in a few seconds.';

export function errorResponse(err: unknown): { status: number; error: string } {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return { status: 404, error: 'That item no longer exists. Refresh and try again.' };
    if (err.code === 'P2003') return { status: 400, error: 'That refers to something that no longer exists. Refresh and try again.' };
    if (err.code === 'P2002') return { status: 409, error: 'That already exists.' };
    // The database was slow or busy (2026-11-15): a step that ran out of time, two sales for one customer at once, a connection that
    // dropped. A step in a transaction is rolled back, so trying again is safe: say so instead of "Internal server error".
    if (BUSY_CODES.has(err.code)) return { status: 503, error: BUSY };
  }
  if (err instanceof Prisma.PrismaClientInitializationError || err instanceof Prisma.PrismaClientRustPanicError) return { status: 503, error: BUSY };
  if (err instanceof Prisma.PrismaClientUnknownRequestError && /timed out|closed|connection|transaction/i.test(String(err.message))) return { status: 503, error: BUSY };
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, error: 'Something in the request was not in the right form. Check what was typed and try again.' };
  }
  const e = err as { code?: string; type?: string; status?: number } | null;
  if (e?.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'That file is too big (10 MB at most).' };
  if (e?.code === 'LIMIT_UNEXPECTED_FILE') return { status: 400, error: 'Only one file can be sent here.' };
  // Any other upload limit (multer 2: too many parts, a field too long) and an upload cut off on the way (a phone that lost signal):
  // the request's fault, not the server's (2026-10-16; these were 500s)
  if ((err as { name?: string } | null)?.name === 'MulterError') return { status: 400, error: 'The upload could not be read. Try again with one photo.' };
  const msg = String((err as { message?: unknown } | null)?.message ?? '');
  if (/Unexpected end of form|Malformed part header|Boundary not found|Unexpected end of multipart/i.test(msg)) return { status: 400, error: 'The upload was cut off. Check the connection and try again.' };
  if (e?.type === 'entity.parse.failed') return { status: 400, error: 'The request could not be read.' };
  if (e?.type === 'entity.too.large') return { status: 413, error: 'That is too much to send at once.' };
  return { status: 500, error: 'Something went wrong on our side. Try again; if it keeps happening, tell the store.' };
}
