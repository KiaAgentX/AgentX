import { db } from '../core/db';
import { logger } from '../core/logger';
import { config } from '../config';

/**
 * Daily spend quota — counts today's (UTC) purchase + transfer_out volume
 * against config.security.dailySpendLimit. Staff/owner are unlimited.
 * Unknown users fail closed.
 */

export interface SpendQuotaResult {
  allowed: boolean;
  spentToday: number;
  limit: number;
}

/** Sum of abs(amount) for today's spend-type transactions of the user's wallet. */
async function spentTodayFor(walletId: string | null): Promise<number> {
  if (!walletId) return 0;
  const rows = await db.transaction.findMany({
    where: {
      walletId,
      type: { in: ['purchase', 'transfer_out'] },
      createdAt: { gte: utcStartOfDay() },
      // failed transactions never consumed money; pending still counts (conservative)
      status: { not: 'failed' },
    },
    select: { amount: true },
  });
  return rows.reduce((sum, row) => sum + Math.abs(row.amount), 0);
}

function utcStartOfDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function checkSpendQuota(userId: string, amountCredits: number): Promise<SpendQuotaResult> {
  const limit = config.security.dailySpendLimit;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, wallet: { select: { id: true } } },
    });
    if (!user) return { allowed: false, spentToday: 0, limit };

    const spentToday = await spentTodayFor(user.wallet?.id ?? null);

    if (user.role === 'admin' || user.role === 'owner') {
      return { allowed: true, spentToday, limit }; // staff/owner unlimited
    }

    const spend = Math.floor(Math.max(0, amountCredits)); // money = integers
    if (spend === 0) return { allowed: true, spentToday, limit };

    return { allowed: spentToday + spend <= limit, spentToday, limit };
  } catch (err) {
    logger.error({ err, userId }, '💰 spend-quota check failed — failing closed');
    return { allowed: false, spentToday: 0, limit };
  }
}
