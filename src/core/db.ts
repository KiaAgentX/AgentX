import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from './logger';

/**
 * Prisma singleton — survives hot-reload in dev and is reused across modules.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isProd ? ['error', 'warn'] : ['error', 'warn'],
  });

if (!config.isProd) {
  globalForPrisma.prisma = db;
}

export async function connectDb(): Promise<void> {
  try {
    await db.$queryRaw`SELECT 1`;
    logger.info('📦 Database connection OK');
  } catch (err) {
    logger.error({ err }, '📦 Database connection FAILED — did you run `npm run db:push`?');
    throw err;
  }
}

export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
}
