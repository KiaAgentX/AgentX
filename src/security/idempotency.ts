import { Prisma } from '@prisma/client';
import { db } from '../core/db';
import { logger } from '../core/logger';

/**
 * Idempotency / anti-replay helper.
 * Checks a fast in-memory map first, then the durable Nonce table.
 * Creates the row to claim the key — a unique violation means "seen before".
 * Fail-closed: unexpected DB errors are THROWN so callers (security layers)
 * can treat them as a block.
 */

const memory = new Map<string, number>(); // key -> expiresAt (ms)
const DEFAULT_TTL_SEC = 3600;
const PRUNE_CHANCE = 0.01; // 1% per call

function pruneMemory(now: number): void {
  for (const [key, expiresAt] of memory) {
    if (expiresAt <= now) memory.delete(key);
  }
}

function maybePrune(now: number): void {
  if (Math.random() >= PRUNE_CHANCE) return;
  pruneMemory(now);
  db.nonce
    .deleteMany({ where: { expiresAt: { lte: new Date(now) } } })
    .catch((err) => logger.warn({ err }, '🧹 nonce table prune failed'));
}

export async function seenBefore(key: string, ttlSec?: number): Promise<boolean> {
  const ttl = ttlSec && ttlSec > 0 ? Math.floor(ttlSec) : DEFAULT_TTL_SEC;
  const now = Date.now();
  maybePrune(now);

  // 1) Memory map first.
  const memExpires = memory.get(key);
  if (memExpires !== undefined) {
    if (memExpires > now) return true;
    memory.delete(key);
  }

  // 2) Durable Nonce table.
  try {
    const existing = await db.nonce.findUnique({ where: { key } });
    if (existing) {
      if (existing.expiresAt.getTime() > now) {
        memory.set(key, existing.expiresAt.getTime());
        return true;
      }
      // Expired row — clear it and re-claim below.
      await db.nonce.delete({ where: { key } }).catch(() => undefined);
    }

    const expiresAt = new Date(now + ttl * 1000);
    await db.nonce.create({ data: { key, expiresAt } });
    memory.set(key, expiresAt.getTime());
    return false;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Unique violation — someone claimed this key concurrently: seen before.
      memory.set(key, now + ttl * 1000);
      return true;
    }
    logger.error({ err, key }, '⚠️ seenBefore DB error — propagating (fail-closed)');
    throw err;
  }
}
