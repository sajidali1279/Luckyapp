import { createHash, randomBytes } from 'crypto';
import prisma from '../config/prisma';

// Store.apiKey holds a SHA-256 hash, never the raw key — the raw value is
// shown to DevAdmin exactly once, at generation time, and is not
// recoverable afterward (matching what the merchant agreement already
// told store owners: API keys are hashed before storage). A fast,
// unsalted hash is the right tradeoff here, not bcrypt-style slow hashing:
// the key itself is already a high-entropy random token, not a guessable
// human password, so rainbow-table resistance from salting buys nothing,
// while a fast deterministic hash keeps the auth lookup a plain indexed
// equality query instead of a full-table scan.
export function hashStoreApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateStoreApiKey(): { rawKey: string; hashedKey: string } {
  const rawKey = `sk_store_${randomBytes(20).toString('hex')}`;
  return { rawKey, hashedKey: hashStoreApiKey(rawKey) };
}

export async function getStoreByApiKey(rawKey: string) {
  return prisma.store.findUnique({ where: { apiKey: hashStoreApiKey(rawKey) } });
}
