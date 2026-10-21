import { db } from '../core/db';
import { config } from '../config';
import { logger } from '../core/logger';
import { NotFoundError } from '../core/errors';
import { getSettingNumber } from './settings.service';
import { creditWallet } from './wallet.service';
import { progressQuest } from './quest.service';
import { notifyUser } from './notification.service';
import { t } from '../i18n';

/**
 * Referral engine.
 * Link: https://t.me/<bot>?start=ref_<referralCode>
 * Referrer gets `referral_reward_credits` on signup; half of that again when
 * the referee completes their FIRST paid order (strictly idempotent).
 */

function clampLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(Math.floor(limit ?? fallback) || fallback, 1), 100);
}

export async function getReferralLink(userId: string): Promise<string | null> {
  const username = config.bot.username;
  if (!username) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (!user) throw new NotFoundError('User');
  return `https://t.me/${username}?start=ref_${user.referralCode}`;
}

/**
 * Bind a new user to a referrer via /start payload 'ref_<code>'.
 * Returns { ok: false } (never throws) for every non-qualifying case:
 * disabled feature, bad payload, unknown code, self-referral, already referred.
 */
export async function applyReferral(
  newUserId: string,
  startPayload: string | null | undefined
): Promise<{ ok: boolean; referrerId?: string }> {
  try {
    if (!config.features.referral) return { ok: false };
    if (!startPayload || !startPayload.startsWith('ref_')) return { ok: false };
    const code = startPayload.slice(4).trim();
    if (!code) return { ok: false };

    const referrer = await db.user.findUnique({ where: { referralCode: code } });
    if (!referrer) return { ok: false };
    if (referrer.id === newUserId) return { ok: false }; // self-referral blocked

    const rewardCredits = Math.max(0, Math.floor(await getSettingNumber('referral_reward_credits')));

    // Atomic bind: only succeeds if the user has no referrer yet.
    const bound = await db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: newUserId, referredById: null },
        data: { referredById: referrer.id },
      });
      if (updated.count !== 1) return false;
      await tx.referral.create({
        data: { referrerId: referrer.id, refereeId: newUserId, rewardCredits, status: 'credited' },
      });
      return true;
    });
    if (!bound) return { ok: false };

    if (rewardCredits > 0) {
      try {
        await creditWallet(referrer.id, rewardCredits, 'credits', 'referral_bonus', `referral:${newUserId}`);
      } catch (err) {
        logger.error({ err, referrerId: referrer.id }, '🤝 referral bonus credit failed (bind kept)');
      }
    }

    // Quest hook — never breaks onboarding.
    try {
      await progressQuest(referrer.id, 'referrer_1');
    } catch (err) {
      logger.warn({ err, referrerId: referrer.id }, '🎯 referrer_1 quest hook failed (non-fatal)');
    }

    const referrerFull = await db.user.findUnique({
      where: { id: referrer.id },
      select: { telegramId: true, language: true },
    });
    if (referrerFull) {
      notifyUser(
        referrerFull.telegramId,
        t(referrerFull.language, 'notify_referral_joined', { credits: rewardCredits })
      );
    }
    logger.info({ referrerId: referrer.id, newUserId, rewardCredits }, '🤝 referral applied');
    return { ok: true, referrerId: referrer.id };
  } catch (err) {
    logger.error({ err, newUserId }, '🤝 applyReferral failed (swallowed, fail-closed)');
    return { ok: false };
  }
}

/**
 * First-purchase bonus for the referrer. Strictly idempotent:
 * 1. atomic Nonce claim (`referral_fp:<buyerId>`) via unique constraint,
 * 2. completed Transaction with reference `first_purchase:<buyerId>`.
 */
export async function rewardOnFirstPurchase(buyerId: string): Promise<void> {
  try {
    const buyer = await db.user.findUnique({ where: { id: buyerId }, select: { referredById: true } });
    if (!buyer || !buyer.referredById) return;

    // Defense in depth #1 — audit trail check.
    const existingTx = await db.transaction.findFirst({
      where: { type: 'referral_bonus', reference: `first_purchase:${buyerId}` },
      select: { id: true },
    });
    if (existingTx) return;

    // Defense in depth #2 — atomic one-time claim.
    try {
      await db.nonce.create({
        data: { key: `referral_fp:${buyerId}`, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
      });
    } catch {
      return; // nonce already claimed → bonus already granted/underway
    }

    const fullReward = Math.max(0, Math.floor(await getSettingNumber('referral_reward_credits')));
    const amount = Math.floor(fullReward / 2); // min 0
    if (amount <= 0) return;

    await creditWallet(buyer.referredById, amount, 'credits', 'referral_bonus', `first_purchase:${buyerId}`);

    const referrer = await db.user.findUnique({
      where: { id: buyer.referredById },
      select: { telegramId: true, language: true },
    });
    if (referrer) {
      notifyUser(referrer.telegramId, t(referrer.language, 'notify_referral_first_purchase', { credits: amount }));
    }
    logger.info({ referrerId: buyer.referredById, buyerId, amount }, '🤝 first-purchase referral bonus paid');
  } catch (err) {
    // Called from order flows — must never break them.
    logger.error({ err, buyerId }, '🤝 rewardOnFirstPurchase failed (swallowed)');
  }
}

export async function getReferralStats(userId: string): Promise<{ count: number; totalEarned: number; link: string | null }> {
  const count = await db.referral.count({ where: { referrerId: userId } });

  let totalEarned = 0;
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (wallet) {
    const agg = await db.transaction.aggregate({
      where: { walletId: wallet.id, type: 'referral_bonus' },
      _sum: { amount: true },
    });
    totalEarned = Math.max(0, agg._sum.amount ?? 0);
  }

  const link = await getReferralLink(userId);
  return { count, totalEarned, link };
}

export async function listMyReferrals(
  userId: string,
  limit = 20
): Promise<Array<{ firstName: string | null; username: string | null; createdAt: Date }>> {
  const rows = await db.referral.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: 'desc' },
    take: clampLimit(limit, 20),
    select: { refereeId: true, createdAt: true },
  });
  if (rows.length === 0) return [];

  // Referral has no FK relation to User — resolve names manually.
  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.refereeId) } },
    select: { id: true, firstName: true, username: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return rows.map((r) => {
    const u = byId.get(r.refereeId);
    return { firstName: u?.firstName ?? null, username: u?.username ?? null, createdAt: r.createdAt };
  });
}
