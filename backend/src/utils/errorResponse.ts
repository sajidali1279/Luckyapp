import { Prisma } from '@prisma/client';

// What the last-resort error handler answers. Most handlers check their own input; the ones that do not, and every race, used to
// end here as "Internal server error" (500) for things that are not the server's fault: a record someone else just deleted, a link
// to something that no longer exists, a file over the size limit, a request the database could not read. Those now get a status
// and a sentence the admin and the app can show. Anything else is still a 500 (and is logged with its full detail by the caller).
export function errorResponse(err: unknown): { status: number; error: string } {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return { status: 404, error: 'That item no longer exists. Refresh and try again.' };
    if (err.code === 'P2003') return { status: 400, error: 'That refers to something that no longer exists. Refresh and try again.' };
    if (err.code === 'P2002') return { status: 409, error: 'That already exists.' };
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, error: 'Something in the request was not in the right form. Check what was typed and try again.' };
  }
  const e = err as { code?: string; type?: string; status?: number } | null;
  if (e?.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'That file is too big (10 MB at most).' };
  if (e?.code === 'LIMIT_UNEXPECTED_FILE') return { status: 400, error: 'Only one file can be sent here.' };
  if (e?.type === 'entity.parse.failed') return { status: 400, error: 'The request could not be read.' };
  if (e?.type === 'entity.too.large') return { status: 413, error: 'That is too much to send at once.' };
  return { status: 500, error: 'Internal server error' };
}
