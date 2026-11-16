/**
 * Time limits for prisma.$transaction(async (tx) => ...) (2026-11-15). Prisma's own are 2 s to start and 5 s to finish, and Neon answers
 * each query over the network: a step that walks a customer's point batches (a reward, a credit redeem, a hot food order) or waits on
 * another sale's customer lock could run out of time on a slow moment and fail half way (rolled back, but the cashier or customer sees an
 * error). These limits only allow more time; nothing else changes.
 */
export const TX_LIMITS = { maxWait: 10_000, timeout: 30_000 } as const;
