import { Approval, Prisma, Transaction, Wallet } from '@prisma/client';
import { db } from '../core/db';
import { BUS_EVENTS, emitBus } from '../core/bus';
import { fromJson, toJson } from '../core/json';
import { logger } from '../core/logger';
import { InsufficientFundsError, NotFoundError, ValidationError } from '../core/errors';
import { getCreditsPerStar } from './settings.service';
import { createApproval } from './hitl.service';
import { notifyUser, sse } from './notification.service';
import { t } from '../i18n';
import { Currency } from '../types';

/**
 * Wallet engine — every credit/star movement goes through here.
 * Atomic, integer-only, fail-closed. Each movement emits WALLET_TX + SSE.
 */

function emitWalletTx(tx: Transaction): void {
  emitBus(BUS_EVENTS.WALLET_TX, {
    transactionId: tx.id,
    walletId: tx.walletId,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    reference: tx.reference,
  });
  sse('wallet_tx', {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    reference: tx.reference,
  });
}

/** Ensure the user exists, then return (or lazily create) their wallet. */
export async function getOrCreateWallet(userId: string): Promise<Wallet> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('User');
  return db.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function getBalance(userId: string): Promise<{ credits: number; stars: number }> {
  const wallet = await getOrCreateWallet(userId);
  return { credits: wallet.credits, stars: wallet.stars };
}

/** Add funds. `amount` must be a positive integer; stored as a positive row. */
export async function creditWallet(
  userId: string,
  amount: number,
  currency: Currency,
  type: string,
  reference?: string,
  meta?: unknown
): Promise<Transaction> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('Credit amount must be a positive integer');
  }
  const data: Prisma.WalletUpdateInput =
    currency === 'stars' ? { stars: { increment: amount } } : { credits: { increment: amount } };

  const txRow = await db.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError('Wallet');
    await tx.wallet.update({ where: { id: wallet.id }, data });
    return tx.transaction.create({
      data: {
        walletId: wallet.id,
        type,
        amount,
        currency,
        status: 'completed',
        reference: reference ?? null,
        meta: meta === undefined ? null : toJson(meta),
      },
    });
  });

  emitWalletTx(txRow);
  logger.debug({ userId, amount, currency, type }, '💰 wallet credit');
  return txRow;
}

/**
 * Remove funds. Atomic: the balance is re-checked inside the transaction and
 * the guarded UPDATE (credits >= amount) makes the debit race-free.
 * Throws InsufficientFundsError(needed, available, currency) — nothing moves.
 */
export async function debitWallet(
  userId: string,
  amount: number,
  currency: Currency,
  type: string,
  reference?: string,
  meta?: unknown
): Promise<Transaction> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('Debit amount must be a positive integer');
  }

  const txRow = await db.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundError('Wallet');
    const available = currency === 'stars' ? wallet.stars : wallet.credits;
    if (available < amount) throw new InsufficientFundsError(amount, available, currency);

    const decremented =
      currency === 'stars'
        ? await tx.wallet.updateMany({ where: { id: wallet.id, stars: { gte: amount } }, data: { stars: { decrement: amount } } })
        : await tx.wallet.updateMany({ where: { id: wallet.id, credits: { gte: amount } }, data: { credits: { decrement: amount } } });
    if (decremented.count !== 1) throw new InsufficientFundsError(amount, available, currency);

    return tx.transaction.create({
      data: {
        walletId: wallet.id,
        type,
        amount: -amount,
        currency,
        status: 'completed',
        reference: reference ?? null,
        meta: meta === undefined ? null : toJson(meta),
      },
    });
  });

  emitWalletTx(txRow);
  logger.debug({ userId, amount, currency, type }, '💸 wallet debit');
  return txRow;
}

/** P2P credit transfer — self-transfer blocked, debit+credit atomic. */
export async function transferCredits(
  fromUserId: string,
  toUserId: string,
  amount: number,
  note?: string
): Promise<{ from: Transaction; to: Transaction }> {
  if (fromUserId === toUserId) throw new ValidationError('Cannot transfer credits to yourself');
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('Transfer amount must be a positive integer');
  }

  const { from, to } = await db.$transaction(async (tx) => {
    const fromWallet = await tx.wallet.findUnique({ where: { userId: fromUserId } });
    if (!fromWallet) throw new NotFoundError('Wallet');

    const toUser = await tx.user.findUnique({ where: { id: toUserId }, select: { id: true } });
    if (!toUser) throw new NotFoundError('User');
    const toWallet = await tx.wallet.upsert({ where: { userId: toUserId }, update: {}, create: { userId: toUserId } });

    const debited = await tx.wallet.updateMany({
      where: { id: fromWallet.id, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    if (debited.count !== 1) throw new InsufficientFundsError(amount, fromWallet.credits, 'credits');
    await tx.wallet.update({ where: { id: toWallet.id }, data: { credits: { increment: amount } } });

    const fromTx = await tx.transaction.create({
      data: {
        walletId: fromWallet.id,
        type: 'transfer_out',
        amount: -amount,
        currency: 'credits',
        status: 'completed',
        reference: note ?? null,
        meta: toJson({ toUserId }),
      },
    });
    const toTx = await tx.transaction.create({
      data: {
        walletId: toWallet.id,
        type: 'transfer_in',
        amount,
        currency: 'credits',
        status: 'completed',
        reference: note ?? null,
        meta: toJson({ fromUserId }),
      },
    });
    return { from: fromTx, to: toTx };
  });

  emitWalletTx(from);
  emitWalletTx(to);
  return { from, to };
}

/**
 * Telegram Stars top-up → credits. Idempotent by paymentRef: a durable Nonce
 * claim (`topup:<paymentRef>`) plus the existing-tx lookup make concurrent
 * replays (Telegram redelivery, double polling) impossible to double-credit.
 */
export async function topupWithStars(
  userId: string,
  starsPaid: number,
  paymentRef: string
): Promise<{ transaction: Transaction; creditsAdded: number }> {
  if (!Number.isInteger(starsPaid) || starsPaid <= 0) {
    throw new ValidationError('starsPaid must be a positive integer');
  }
  if (!paymentRef || paymentRef.trim().length === 0) {
    throw new ValidationError('paymentRef is required');
  }

  // Idempotency guard — audit trail first.
  const existing = await db.transaction.findFirst({
    where: { type: 'topup_stars', reference: paymentRef, status: 'completed' },
    include: { wallet: { select: { userId: true } } },
  });
  if (existing) {
    if (existing.wallet.userId !== userId) {
      throw new ValidationError('Payment reference already used by another wallet');
    }
    logger.info({ paymentRef, userId }, '⭐ Stars top-up replay — returning existing transaction');
    const { wallet: _wallet, ...txOnly } = existing;
    return { transaction: txOnly, creditsAdded: txOnly.amount };
  }

  // Atomic one-time claim — unique violation means a concurrent replay.
  try {
    await db.nonce.create({
      data: { key: `topup:${paymentRef}`, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    });
  } catch {
    const replayed = await db.transaction.findFirst({
      where: { type: 'topup_stars', reference: paymentRef, status: 'completed' },
    });
    if (replayed) {
      logger.info({ paymentRef, userId }, '⭐ Stars top-up replay (nonce) — returning existing transaction');
      return { transaction: replayed, creditsAdded: replayed.amount };
    }
    // Claimed but not yet written (concurrent in-flight) — treat as replay.
    throw new ValidationError('Payment is already being processed');
  }

  const creditsPerStar = await getCreditsPerStar();
  const creditsAdded = starsPaid * creditsPerStar;

  const txRow = await db.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
    await tx.wallet.update({ where: { id: wallet.id }, data: { credits: { increment: creditsAdded } } });
    return tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'topup_stars',
        amount: creditsAdded,
        currency: 'credits',
        status: 'completed',
        reference: paymentRef,
        meta: toJson({ starsPaid, creditsPerStar }),
      },
    });
  });

  emitWalletTx(txRow);
  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true, language: true } });
  if (user) {
    notifyUser(user.telegramId, t(user.language, 'notify_topup_confirmed', { stars: starsPaid, credits: creditsAdded }));
  }
  logger.info({ userId, starsPaid, creditsAdded }, '⭐ Stars top-up credited');
  return { transaction: txRow, creditsAdded };
}

/**
 * User requests a withdrawal → creates a HIGH-risk HITL approval.
 * Funds are NOT moved here; executeApprovedWithdrawal does that after the
 * owner taps approve (fail-closed).
 */
export async function requestWithdrawal(userId: string, amountCredits: number): Promise<{ approvalId: string }> {
  if (!Number.isInteger(amountCredits) || amountCredits <= 0) {
    throw new ValidationError('Withdrawal amount must be a positive integer');
  }
  const wallet = await getOrCreateWallet(userId);
  if (wallet.credits < amountCredits) {
    throw new InsufficientFundsError(amountCredits, wallet.credits, 'credits');
  }

  const approval = await createApproval({
    type: 'withdraw',
    summary: `Withdrawal request: ${amountCredits} credits (user ${userId})`,
    payload: { userId, amountCredits },
    requestedById: userId,
    riskLevel: 'high',
  });

  logger.info({ userId, amountCredits, approvalId: approval.id }, '💸 Withdrawal requested (HITL)');
  return { approvalId: approval.id };
}

/** HITL hook: runs only after the owner approved the withdrawal. */
export async function executeApprovedWithdrawal(approval: Approval): Promise<{ ok: boolean; note: string }> {
  const payload = fromJson<{ userId?: string; amountCredits?: number }>(approval.payload, {});
  const { userId, amountCredits } = payload;
  if (!userId || typeof amountCredits !== 'number' || !Number.isInteger(amountCredits) || amountCredits <= 0) {
    return { ok: false, note: 'Invalid withdrawal payload — failed closed, no funds moved' };
  }

  // Defense in depth: execution nonce — even a replayed APPROVAL_RESOLVED
  // event can never debit twice (the approval claim in hitl.service is the
  // first guard, this is the second).
  try {
    await db.nonce.create({
      data: { key: `withdraw_exec:${approval.id}`, expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000) },
    });
  } catch {
    logger.warn({ approvalId: approval.id }, '💸 withdrawal execution replay blocked by nonce');
    return { ok: false, note: 'Withdrawal already executed for this approval' };
  }

  try {
    const tx = await debitWallet(userId, amountCredits, 'credits', 'withdraw', approval.id, { approvalId: approval.id });
    const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true, language: true } });
    if (user) {
      notifyUser(
        user.telegramId,
        t(user.language, 'notify_withdraw_approved', { credits: amountCredits, ref: approval.id.slice(0, 8) })
      );
    }
    logger.info({ approvalId: approval.id, userId, amountCredits, txId: tx.id }, '💸 Withdrawal executed');
    return { ok: true, note: `Withdrawn ${amountCredits} credits (tx ${tx.id})` };
  } catch (err) {
    const note = err instanceof Error ? err.message : 'unknown error';
    logger.warn({ err, approvalId: approval.id }, '💸 Withdrawal execution failed — funds untouched (fail-closed)');
    return { ok: false, note: `Withdrawal failed: ${note}` };
  }
}

export async function getHistory(
  userId: string,
  limit = 20,
  page = 1
): Promise<{ items: Transaction[]; total: number; page: number; pages: number }> {
  const wallet = await getOrCreateWallet(userId);
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 20, 1), 100);
  const safePage = Math.max(Math.floor(page) || 1, 1);

  const where = { walletId: wallet.id };
  const [items, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    db.transaction.count({ where }),
  ]);

  return { items, total, page: safePage, pages: Math.max(Math.ceil(total / safeLimit), 1) };
}
