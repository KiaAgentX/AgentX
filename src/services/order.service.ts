import { Approval, Order, Prisma, Product } from '@prisma/client';
import { db } from '../core/db';
import { BUS_EVENTS, emitBus } from '../core/bus';
import { fromJson, toJson } from '../core/json';
import { logger } from '../core/logger';
import { InsufficientFundsError, NotFoundError, PermissionDeniedError, ValidationError } from '../core/errors';
import { getCommissionPercent } from './settings.service';
import { createApproval } from './hitl.service';
import { creditWallet, debitWallet } from './wallet.service';
import { validateCoupon } from './coupon.service';
import { progressQuest } from './quest.service';
import { rewardOnFirstPurchase } from './referral.service';
import { isStaffUser } from './marketplace.service';
import { notifyUser, sse } from './notification.service';
import { t } from '../i18n';

/**
 * Order engine — checkout, Stars invoices, delivery, cancellations, refunds.
 *
 * Stock model: stock is RESERVED at order creation (both payment paths) and
 * released on cancellation — this is what makes cancelOrder's restock correct
 * and prevents overselling. salesCount increments only on successful payment.
 * Seller proceeds are always paid in credits: totalCredits - commission.
 */

export type OrderCreateResult =
  | { order: Order; payment: { method: 'credits' } }
  | { order: Order; payment: { method: 'stars_invoice'; amountStars: number; title: string; description: string; payload: string } };

function clampPage(page: number | undefined): number {
  return Math.max(Math.floor(page ?? 1) || 1, 1);
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(Math.max(Math.floor(perPage ?? 10) || 10, 1), 50);
}

/** Atomically reserve stock for limited products (-1 = unlimited). */
async function reserveStock(productId: string, quantity: number): Promise<void> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { stock: true } });
  if (!product) throw new NotFoundError('Product');
  if (product.stock < 0) return; // unlimited
  if (product.stock < quantity) throw new ValidationError('Not enough stock available');
  const res = await db.product.updateMany({
    where: { id: productId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  if (res.count !== 1) throw new ValidationError('Not enough stock available');
}

/** Release a reservation (cancel / refund). */
async function releaseStock(productId: string, quantity: number): Promise<void> {
  try {
    const product = await db.product.findUnique({ where: { id: productId }, select: { stock: true } });
    if (product && product.stock >= 0) {
      await db.product.update({ where: { id: productId }, data: { stock: { increment: quantity } } });
    }
  } catch (err) {
    logger.error({ err, productId, quantity }, '📦 stock release failed (non-fatal)');
  }
}

async function bumpSalesCount(productId: string, quantity: number): Promise<void> {
  try {
    await db.product.update({ where: { id: productId }, data: { salesCount: { increment: quantity } } });
  } catch (err) {
    logger.error({ err, productId }, '📦 salesCount increment failed (non-fatal)');
  }
}

/**
 * Reserve one coupon use ATOMICALLY (max-uses safe). Called inside the
 * checkout transaction — a full coupon over-usage rolls the whole order back.
 * `maxUses = -1` means unlimited.
 */
function claimCouponInTx(tx: Prisma.TransactionClient, code: string, maxUses: number): Promise<void> {
  return (async () => {
    const claimed =
      maxUses < 0
        ? await tx.coupon.updateMany({ where: { code }, data: { usedCount: { increment: 1 } } })
        : await tx.coupon.updateMany({
            where: { code, usedCount: { lt: maxUses } },
            data: { usedCount: { increment: 1 } },
          });
    if (claimed.count !== 1) throw new ValidationError('Coupon usage limit reached');
  })();
}

/** Release a coupon reservation (order cancelled / swept before payment). */
function releaseCouponInTx(tx: Prisma.TransactionClient, code: string): Promise<void> {
  return (async () => {
    await tx.coupon.updateMany({
      where: { code, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  })();
}

function emitOrderNew(order: Order): void {
  emitBus(BUS_EVENTS.ORDER_NEW, {
    orderId: order.id,
    buyerId: order.buyerId,
    productId: order.productId,
    totalStars: order.totalStars,
    totalCredits: order.totalCredits,
    currency: order.currency,
  });
  sse('order_new', { id: order.id, buyerId: order.buyerId, productId: order.productId, totalCredits: order.totalCredits });
}

function emitOrderPaid(order: Order): void {
  emitBus(BUS_EVENTS.ORDER_PAID, {
    orderId: order.id,
    buyerId: order.buyerId,
    productId: order.productId,
    totalStars: order.totalStars,
    totalCredits: order.totalCredits,
    status: order.status,
  });
  sse('order_paid', { id: order.id, buyerId: order.buyerId, productId: order.productId, status: order.status });
}

/** Quest hooks — every one wrapped so it can never break checkout. */
async function runQuestHooks(buyerId: string): Promise<void> {
  try {
    await progressQuest(buyerId, 'daily_purchase');
  } catch (err) {
    logger.warn({ err, buyerId }, '🎯 daily_purchase hook failed (non-fatal)');
  }
  try {
    await progressQuest(buyerId, 'first_purchase');
  } catch (err) {
    logger.warn({ err, buyerId }, '🎯 first_purchase hook failed (non-fatal)');
  }
}

/** Referral first-purchase bonus (idempotent inside referral.service). */
async function maybeRewardReferral(buyerId: string, orderId: string): Promise<void> {
  try {
    const prior = await db.order.count({
      where: { buyerId, status: { in: ['paid', 'delivered'] }, id: { not: orderId } },
    });
    if (prior === 0) await rewardOnFirstPurchase(buyerId);
  } catch (err) {
    logger.warn({ err, buyerId, orderId }, '🤝 referral first-purchase hook failed (non-fatal)');
  }
}

async function notifyBuyer(buyerId: string, text: string): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: buyerId }, select: { telegramId: true } });
    if (user) notifyUser(user.telegramId, text);
  } catch (err) {
    logger.warn({ err, buyerId }, '📨 buyer notification failed (non-fatal)');
  }
}

/** Localized buyer notification — resolves the user's language first. */
async function notifyBuyerLocalized(
  buyerId: string,
  key: string,
  params: Record<string, string | number>
): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: buyerId }, select: { telegramId: true, language: true } });
    if (user) notifyUser(user.telegramId, t(user.language, key, params));
  } catch (err) {
    logger.warn({ err, buyerId }, '📨 buyer notification failed (non-fatal)');
  }
}

/** Tell the seller there is a paid order waiting for manual delivery. */
async function notifySellerManualOrder(productId: string, buyerName: string): Promise<void> {
  try {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { title: true, seller: { select: { telegramId: true, language: true } } },
    });
    if (!product) return;
    notifyUser(
      product.seller.telegramId,
      t(product.seller.language, 'notify_seller_new_paid', { title: product.title.slice(0, 120), buyer: buyerName })
    );
  } catch (err) {
    logger.warn({ err, productId }, '📨 seller notification failed (non-fatal)');
  }
}

export async function createOrder(
  buyerId: string,
  productId: string,
  opts: { quantity?: number; couponCode?: string; payWith: 'credits' | 'stars' }
): Promise<OrderCreateResult> {
  const quantity = opts.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) throw new ValidationError('Quantity must be an integer >= 1');

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Product');
  if (product.status !== 'active') throw new ValidationError('Product is not available for purchase');
  if (product.stock >= 0 && product.stock < quantity) throw new ValidationError('Not enough stock available');

  const totalStarsRaw = product.priceStars * quantity;
  const totalCreditsRaw = product.priceCredits * quantity;

  // Coupon → discount on both currencies, proportionally.
  let discountStars = 0;
  let discountCredits = 0;
  let couponCode: string | null = null;
  let couponMaxUses = -1;
  if (opts.couponCode && opts.couponCode.trim()) {
    const res = await validateCoupon(opts.couponCode, totalStarsRaw);
    if (!res.ok || !res.coupon) throw new ValidationError(res.reason ?? 'Invalid coupon');
    discountStars = res.discountStars;
    discountCredits =
      totalStarsRaw > 0
        ? Math.floor((totalCreditsRaw * discountStars) / totalStarsRaw)
        : Math.floor((totalCreditsRaw * res.coupon.percentOff) / 100);
    couponCode = res.coupon.code;
    couponMaxUses = res.coupon.maxUses;
  }

  const totalStars = Math.max(0, totalStarsRaw - discountStars);
  const totalCredits = Math.max(0, totalCreditsRaw - discountCredits);
  const commissionPercent = await getCommissionPercent();
  const commission = Math.min(Math.max(Math.round((totalCredits * commissionPercent) / 100), 0), totalCredits);

  // ── Stars path: reserve stock + create a pending order atomically, then
  // return the invoice info. The coupon use is reserved here too and released
  // automatically if the order is cancelled or swept.
  if (opts.payWith === 'stars') {
    const order = await db.$transaction(async (tx) => {
      if (product.stock >= 0) {
        const res = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (res.count !== 1) throw new ValidationError('Not enough stock available');
      }
      const created = await tx.order.create({
        data: {
          buyerId,
          productId: product.id,
          quantity,
          totalStars,
          totalCredits,
          currency: 'stars',
          status: 'pending',
          couponCode,
          discount: discountStars,
          commission,
        },
      });
      if (couponCode) await claimCouponInTx(tx, couponCode, couponMaxUses);
      return created;
    });
    emitOrderNew(order);
    return {
      order,
      payment: {
        method: 'stars_invoice' as const,
        amountStars: totalStars,
        title: product.title.slice(0, 32),
        description: (product.description || product.title).slice(0, 255),
        payload: `order:${order.id}`,
      },
    };
  }

  // ── Credits path: ONE atomic transaction — reserve stock, create the order,
  // debit the buyer, credit the seller, reserve the coupon and finalize.
  // SQLite's single-writer model makes this the safest money seam in the app:
  // a crash can no longer leave the buyer debited with a pending order.
  const order = await db.$transaction(async (tx) => {
    if (product.stock >= 0) {
      const res = await tx.product.updateMany({
        where: { id: product.id, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (res.count !== 1) throw new ValidationError('Not enough stock available');
    }

    const created = await tx.order.create({
      data: {
        buyerId,
        productId: product.id,
        quantity,
        totalStars,
        totalCredits,
        currency: 'credits',
        status: 'pending',
        couponCode,
        discount: discountStars,
        commission,
      },
    });

    if (totalCredits > 0) {
      const wallet = await tx.wallet.findUnique({ where: { userId: buyerId } });
      if (!wallet) throw new NotFoundError('Wallet');
      const available = wallet.credits;
      const decremented = await tx.wallet.updateMany({
        where: { id: wallet.id, credits: { gte: totalCredits } },
        data: { credits: { decrement: totalCredits } },
      });
      if (decremented.count !== 1) throw new InsufficientFundsError(totalCredits, available, 'credits');
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'purchase',
          amount: -totalCredits,
          currency: 'credits',
          status: 'completed',
          reference: created.id,
          meta: toJson({ productId: product.id, quantity }),
        },
      });
    }

    const sellerNet = Math.max(0, totalCredits - commission);
    if (sellerNet > 0) {
      const sellerWallet = await tx.wallet.upsert({
        where: { userId: product.sellerId },
        update: {},
        create: { userId: product.sellerId },
      });
      await tx.wallet.update({ where: { id: sellerWallet.id }, data: { credits: { increment: sellerNet } } });
      await tx.transaction.create({
        data: {
          walletId: sellerWallet.id,
          type: 'sale',
          amount: sellerNet,
          currency: 'credits',
          status: 'completed',
          reference: created.id,
          meta: toJson({ productId: product.id, quantity, method: 'credits' }),
        },
      });
    }

    if (couponCode) await claimCouponInTx(tx, couponCode, couponMaxUses);

    const delivered = product.delivery === 'auto' && !!product.deliveryPayload;
    return tx.order.update({
      where: { id: created.id },
      data: {
        status: delivered ? 'delivered' : 'paid',
        ...(delivered ? { deliveryPayload: product.deliveryPayload } : {}),
      },
    });
  });

  await bumpSalesCount(product.id, quantity);
  emitOrderPaid(order);
  await runQuestHooks(buyerId);
  await maybeRewardReferral(buyerId, order.id);

  const delivered = order.status === 'delivered';
  if (delivered) {
    await notifyBuyerLocalized(buyerId, 'notify_order_delivered', { payload: (product.deliveryPayload ?? '').slice(0, 1500) });
  } else {
    await notifyBuyerLocalized(buyerId, 'notify_order_paid_manual', { title: product.title.slice(0, 120) });
    await notifySellerManualOrder(product.id, await buyerLabel(buyerId));
  }

  return { order, payment: { method: 'credits' } };
}

/** Best-effort buyer display name for seller notifications. */
async function buyerLabel(buyerId: string): Promise<string> {
  try {
    const buyer = await db.user.findUnique({
      where: { id: buyerId },
      select: { firstName: true, username: true },
    });
    return buyer?.firstName || buyer?.username || '—';
  } catch {
    return '—';
  }
}

/**
 * Telegram Stars pre-checkout / successful-payment hook.
 * Idempotent: only a 'pending' order can transition; replays return the
 * current order. The paid claim, seller credit and finalize all run in ONE
 * transaction — the buyer's Stars can never be accepted without the seller
 * being credited in the same atomic step (if anything throws, the caller in
 * market.ts reverses the Stars charge and escalates to the owner).
 */
export async function markPaidWithStars(orderId: string, paymentRef: string): Promise<Order> {
  if (!paymentRef || !paymentRef.trim()) throw new ValidationError('paymentRef is required');

  const existing = await db.order.findUnique({ where: { id: orderId }, include: { product: true } });
  if (!existing) throw new NotFoundError('Order');
  if (existing.status === 'paid' || existing.status === 'delivered') return existing; // idempotent replay
  if (existing.status !== 'pending') {
    throw new ValidationError(`Order is ${existing.status}; cannot mark paid`);
  }

  const finalOrder = await db.$transaction(async (tx) => {
    // Atomic claim inside the tx: pending → paid (exactly once).
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'paid', paymentRef },
    });
    if (claimed.count !== 1) {
      throw new ValidationError('Order is no longer pending; cannot mark paid');
    }

    const sellerNet = Math.max(0, existing.totalCredits - existing.commission);
    if (sellerNet > 0) {
      const sellerWallet = await tx.wallet.upsert({
        where: { userId: existing.product.sellerId },
        update: {},
        create: { userId: existing.product.sellerId },
      });
      await tx.wallet.update({ where: { id: sellerWallet.id }, data: { credits: { increment: sellerNet } } });
      await tx.transaction.create({
        data: {
          walletId: sellerWallet.id,
          type: 'sale',
          amount: sellerNet,
          currency: 'credits',
          status: 'completed',
          reference: orderId,
          meta: toJson({
            productId: existing.product.id,
            quantity: existing.quantity,
            method: 'stars',
            starsPaid: existing.totalStars,
            paymentRef,
          }),
        },
      });
    }

    const delivered = existing.product.delivery === 'auto' && !!existing.product.deliveryPayload;
    return tx.order.update({
      where: { id: orderId },
      data: {
        ...(delivered ? { status: 'delivered', deliveryPayload: existing.product.deliveryPayload } : {}),
      },
    });
  });

  await bumpSalesCount(existing.product.id, existing.quantity);
  emitOrderPaid(finalOrder);
  await runQuestHooks(existing.buyerId);
  await maybeRewardReferral(existing.buyerId, orderId);

  if (finalOrder.status === 'delivered') {
    await notifyBuyerLocalized(existing.buyerId, 'notify_order_delivered', { payload: (existing.product.deliveryPayload ?? '').slice(0, 1500) });
  } else {
    await notifyBuyerLocalized(existing.buyerId, 'notify_order_paid_manual', { title: existing.product.title.slice(0, 120) });
    await notifySellerManualOrder(existing.product.id, await buyerLabel(existing.buyerId));
  }

  logger.info({ orderId, paymentRef }, '⭐ order paid with Stars');
  return finalOrder;
}

/**
 * Mark a paid order as delivered (staff or the seller).
 * `actorUserId` is optional for contract compatibility: when provided the
 * permission is verified here; when omitted the caller must have checked.
 */
export async function deliverOrder(orderId: string, payload?: string, actorUserId?: string): Promise<Order> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { product: { select: { sellerId: true, deliveryPayload: true } } },
  });
  if (!order) throw new NotFoundError('Order');
  if (actorUserId !== undefined) {
    if (actorUserId !== order.product.sellerId && !(await isStaffUser(actorUserId))) {
      throw new PermissionDeniedError('Only the seller or staff can deliver this order');
    }
  }
  if (order.status !== 'paid') {
    throw new ValidationError(`Order is ${order.status}; only paid orders can be delivered`);
  }
  const finalPayload = payload ?? order.product.deliveryPayload ?? order.deliveryPayload ?? null;
  const updated = await db.order.update({
    where: { id: orderId },
    data: { status: 'delivered', deliveryPayload: finalPayload },
  });
  sse('order_delivered', { id: orderId, buyerId: order.buyerId });
  await notifyBuyerLocalized(order.buyerId, 'notify_order_delivered', { payload: (finalPayload ?? '').slice(0, 1500) });
  return updated;
}

export async function getOrder(
  orderId: string
): Promise<(Order & { product: Product; buyer: { firstName: string | null; username: string | null; telegramId: string } }) | null> {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      product: true,
      buyer: { select: { firstName: true, username: true, telegramId: true } },
    },
  });
}

export async function listMyOrders(
  userId: string,
  page = 1
): Promise<{ items: (Order & { product: Product })[]; total: number; page: number; pages: number }> {
  const perPage = clampPerPage(10);
  const safePage = clampPage(page);
  const where: Prisma.OrderWhereInput = { buyerId: userId };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * perPage,
      take: perPage,
      include: { product: true },
    }),
    db.order.count({ where }),
  ]);
  return { items, total, page: safePage, pages: Math.max(Math.ceil(total / perPage), 1) };
}

export async function listSales(
  sellerId: string,
  page = 1
): Promise<{
  items: (Order & { product: Product; buyer: { firstName: string | null; username: string | null } })[];
  total: number;
  page: number;
  pages: number;
}> {
  const perPage = clampPerPage(10);
  const safePage = clampPage(page);
  const where: Prisma.OrderWhereInput = { product: { sellerId } };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * perPage,
      take: perPage,
      include: {
        product: true,
        buyer: { select: { firstName: true, username: true } },
      },
    }),
    db.order.count({ where }),
  ]);
  return { items, total, page: safePage, pages: Math.max(Math.ceil(total / perPage), 1) };
}

/**
 * Auto-cancel PENDING orders older than `hours` (Stars invoices the buyer
 * abandoned). Releases reserved stock, releases coupon reservations and
 * notifies each buyer (localized).
 *
 * Crash-recovery: a pending order that ALREADY carries a completed `purchase`
 * transaction (process died mid-checkout in a pre-atomic build) is completed
 * instead of cancelled — the buyer is not charged twice nor silently refunded.
 * Returns the number of cancelled orders.
 */
export async function cancelStalePendingOrders(hours = 2): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const stale = await db.order.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    select: { id: true, buyerId: true, quantity: true, totalCredits: true, commission: true, couponCode: true, product: { select: { id: true, title: true, stock: true, sellerId: true, delivery: true, deliveryPayload: true } } },
    take: 100,
  });
  let n = 0;
  for (const order of stale) {
    // Crash-recovery check: was the buyer already debited for this order?
    const paidTx = await db.transaction.findFirst({
      where: { type: 'purchase', reference: order.id, status: 'completed' },
      select: { id: true },
    });
    if (paidTx) {
      // Money already left the buyer's wallet — finish the purchase instead of
      // cancelling it: claim paid → credit seller → finalize.
      const claimed = await db.order.updateMany({ where: { id: order.id, status: 'pending' }, data: { status: 'paid' } });
      if (claimed.count === 1) {
        const sellerNet = Math.max(0, order.totalCredits - order.commission);
        if (sellerNet > 0) {
          await creditWallet(order.product.sellerId, sellerNet, 'credits', 'sale', order.id, {
            productId: order.product.id,
            quantity: order.quantity,
            method: 'credits',
            recoveredBy: 'pending-sweeper',
          }).catch((err) =>
            logger.error({ err, orderId: order.id }, '💰 sweeper recovery: seller credit failed — manual review needed')
          );
        }
        const delivered = order.product.delivery === 'auto' && !!order.product.deliveryPayload;
        await db.order
          .update({
            where: { id: order.id },
            data: { ...(delivered ? { status: 'delivered', deliveryPayload: order.product.deliveryPayload } : {}) },
          })
          .catch(() => undefined);
        await bumpSalesCount(order.product.id, order.quantity);
        logger.warn({ orderId: order.id }, '🧹 stale pending order had a completed purchase tx — recovered as paid');
        await notifyBuyerLocalized(order.buyerId, 'notify_order_paid_manual', { title: order.product.title.slice(0, 120) });
      }
      continue;
    }

    const res = await db.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({ where: { id: order.id, status: 'pending' }, data: { status: 'cancelled' } });
      if (claim.count !== 1) return false;
      if (order.couponCode) await releaseCouponInTx(tx, order.couponCode);
      return true;
    });
    if (!res) continue;
    n += 1;
    if (order.product.stock >= 0) {
      await db.product.update({ where: { id: order.product.id }, data: { stock: { increment: order.quantity } } }).catch(() => undefined);
    }
    await notifyBuyerLocalized(order.buyerId, 'notify_order_cancelled', { title: order.product.title.slice(0, 120) });
  }
  if (n > 0) logger.info({ cancelled: n }, '🧹 stale pending orders cancelled');
  return n;
}

/** Cancel a PENDING order (buyer or staff) and release the stock reservation. */
export async function cancelOrder(orderId: string, actorUserId: string): Promise<Order> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { product: { select: { id: true, stock: true } } },
  });
  if (!order) throw new NotFoundError('Order');
  if (actorUserId !== order.buyerId && !(await isStaffUser(actorUserId))) {
    throw new PermissionDeniedError('Only the buyer or staff can cancel this order');
  }

  const cancelled = await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (res.count !== 1) throw new ValidationError('Order is no longer pending');
    if (order.couponCode) await releaseCouponInTx(tx, order.couponCode);
    return tx.order.findUnique({ where: { id: order.id } }) as Promise<Order>;
  });

  // Pending orders never reached payment, but their stock WAS reserved at
  // creation → release it.
  await releaseStock(order.product.id, order.quantity);
  sse('order_cancelled', { id: orderId, buyerId: order.buyerId });
  logger.info({ orderId, actorUserId }, '🚫 order cancelled');
  return cancelled;
}

/** Buyer requests a refund → HIGH-risk HITL approval (fail-closed). */
export async function requestRefund(orderId: string, buyerId: string, reason: string): Promise<{ approvalId: string }> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order');
  if (order.buyerId !== buyerId) {
    throw new PermissionDeniedError('You can only request refunds for your own orders');
  }
  if (order.status !== 'paid' && order.status !== 'delivered') {
    throw new ValidationError(`Order is ${order.status}; only paid orders can be refunded`);
  }

  const approval = await createApproval({
    type: 'refund',
    summary: `Refund request for order ${orderId} — ${order.totalCredits} credits (${(reason || 'no reason').slice(0, 120)})`,
    payload: { orderId, buyerId, reason: reason ?? '' },
    requestedById: buyerId,
    riskLevel: 'high',
  });
  logger.info({ orderId, buyerId, approvalId: approval.id }, '↩️ refund requested (HITL)');
  return { approvalId: approval.id };
}

/**
 * HITL hook: runs after the owner approved the refund.
 * Order of operations (fail-closed): claim status → debit seller → credit
 * buyer → restock. Any failure rolls the previous step back where possible.
 */
export async function executeApprovedRefund(approval: Approval): Promise<{ ok: boolean; note: string }> {
  const payload = fromJson<{ orderId?: string; buyerId?: string; reason?: string }>(approval.payload, {});
  if (!payload.orderId) {
    return { ok: false, note: 'Invalid refund payload — failed closed, no funds moved' };
  }

  try {
    const order = await db.order.findUnique({
      where: { id: payload.orderId },
      include: { product: { select: { id: true, stock: true, sellerId: true } } },
    });
    if (!order) return { ok: false, note: 'Order not found' };
    if (order.status === 'refunded') return { ok: false, note: 'Order already refunded' };
    if (order.status !== 'paid' && order.status !== 'delivered') {
      return { ok: false, note: `Order is ${order.status}; cannot refund` };
    }

    // 1) Atomic claim — prevents double refund under concurrency.
    const claimed = await db.order.updateMany({
      where: { id: order.id, status: { in: ['paid', 'delivered'] } },
      data: { status: 'refunded' },
    });
    if (claimed.count !== 1) return { ok: false, note: 'Order status changed — refund aborted' };

    const buyerCredit = order.totalCredits;
    const sellerDebit = Math.max(0, order.totalCredits - order.commission);

    // 2) Debit the seller first (fail-closed: abort + revert if impossible).
    if (sellerDebit > 0) {
      try {
        await debitWallet(order.product.sellerId, sellerDebit, 'credits', 'refund', order.id, {
          approvalId: approval.id,
        });
      } catch (err) {
        await db.order.updateMany({ where: { id: order.id, status: 'refunded' }, data: { status: order.status } });
        const note = err instanceof Error ? err.message : 'unknown error';
        logger.warn({ err, orderId: order.id }, '↩️ refund aborted — seller debit failed');
        return { ok: false, note: `Refund aborted — seller debit failed: ${note}` };
      }
    }

    // 3) Credit the buyer. If this fails, compensate the seller back.
    if (buyerCredit > 0) {
      try {
        await creditWallet(order.buyerId, buyerCredit, 'credits', 'refund', order.id, {
          approvalId: approval.id,
          originalCurrency: order.currency,
          totalStars: order.currency === 'stars' ? order.totalStars : undefined,
        });
      } catch (err) {
        if (sellerDebit > 0) {
          try {
            await creditWallet(order.product.sellerId, sellerDebit, 'credits', 'sale', order.id, {
              compensationFor: approval.id,
            });
          } catch (compErr) {
            logger.error({ err: compErr, orderId: order.id }, '↩️ refund compensation FAILED — manual review needed');
          }
        }
        await db.order.updateMany({ where: { id: order.id, status: 'refunded' }, data: { status: order.status } });
        logger.error({ err, orderId: order.id }, '↩️ refund buyer credit failed — reverted');
        return { ok: false, note: 'Refund failed while crediting the buyer — all funds restored' };
      }
    }

    // 4) Restock (non-fatal).
    await releaseStock(order.product.id, order.quantity);

    // Notify the buyer in THEIR language. Stars-paid orders are refunded in
    // credits at the rate frozen at purchase time — disclose that policy.
    const user = await db.user.findUnique({ where: { id: order.buyerId }, select: { telegramId: true, language: true } });
    if (user) {
      const key = order.currency === 'stars' ? 'notify_refund_approved_stars' : 'notify_refund_approved';
      notifyUser(
        user.telegramId,
        t(user.language, key, {
          credits: buyerCredit,
          stars: order.currency === 'stars' ? order.totalStars : 0,
          ref: approval.id.slice(0, 8),
        })
      );
    }
    logger.info({ orderId: order.id, approvalId: approval.id, buyerCredit }, '↩️ refund executed');
    return { ok: true, note: `Refunded ${buyerCredit} credits to buyer for order ${order.id}` };
  } catch (err) {
    const note = err instanceof Error ? err.message : 'unknown error';
    logger.error({ err, approvalId: approval.id }, '↩️ refund execution failed');
    return { ok: false, note: `Refund failed: ${note}` };
  }
}
