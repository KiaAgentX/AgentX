import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import { addReview } from '../../services/marketplace.service';
import { getOrder, listMyOrders } from '../../services/order.service';
import type { BotContext } from '../context';
import { editOrReply, orderStatusLabel, ordersKeyboard } from '../keyboards';

/**
 * /orders + `ord:<id>` detail + `review:<orderId>:<1-5>` rating callbacks.
 *
 * NOTE: order.service.listMyOrders has a fixed perPage of 10 — the spec asked
 * for 8, so the list is sliced to 8 client-side (deviation in worklog Task 2-b).
 */

const LIST_LIMIT = 8;

function totalLabel(lang: string, order: { currency: string; totalStars: number; totalCredits: number }): string {
  return order.currency === 'stars'
    ? t(lang, 'product_price_stars', { stars: order.totalStars })
    : t(lang, 'product_price_credits', { credits: order.totalCredits });
}

export async function showOrders(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const res = await listMyOrders(ctx.user.id, 1);
  const shown = res.items.slice(0, LIST_LIMIT);

  if (shown.length === 0) {
    await editOrReply(ctx, `${t(lang, 'orders_title')}\n\n${t(lang, 'no_orders')}`);
    return;
  }

  const lines = shown.map(
    (o) => `${o.product.title}\n    ${orderStatusLabel(lang, o.status)} · ${totalLabel(lang, o)}`
  );
  await editOrReply(
    ctx,
    `${t(lang, 'orders_title')}\n\n${lines.join('\n')}`,
    ordersKeyboard(
      shown.map((o) => ({ id: o.id, status: o.status, title: o.product.title })),
      lang
    )
  );
}

async function showOrderDetail(ctx: BotContext, orderId: string): Promise<void> {
  const lang = ctx.user.language;
  const order = await getOrder(orderId);
  if (!order || order.buyerId !== ctx.user.id) {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }

  const lines = [
    `🧾 #${order.id.slice(0, 8)}`,
    `🛍 ${order.product.title}`,
    orderStatusLabel(lang, order.status),
    totalLabel(lang, order),
    `🕒 ${order.createdAt.toISOString().slice(0, 16).replace('T', ' ')}Z`,
  ];
  if (order.deliveryPayload) lines.push(`📦 ${order.deliveryPayload.slice(0, 500)}`);

  const kb = new InlineKeyboard();
  if (order.status === 'delivered') {
    for (let n = 1; n <= 5; n++) kb.text(`${n}⭐`, `review:${order.id}:${n}`);
    kb.row();
  }
  kb.text(t(lang, 'back'), 'menu:orders');

  await editOrReply(ctx, lines.join('\n'), kb);
}

export function registerOrders(bot: Bot<BotContext>): void {
  bot.command('orders', async (ctx) => {
    await showOrders(ctx);
  });

  bot.callbackQuery(/^ord:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await showOrderDetail(ctx, ctx.match[1]);
    } catch (err) {
      logger.warn({ err }, '⛔ order detail callback failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^review:(.+):([1-5])$/, async (ctx) => {
    const [, orderId, ratingRaw] = ctx.match;
    try {
      const order = await getOrder(orderId);
      if (!order || order.buyerId !== ctx.user.id) {
        await ctx.answerCallbackQuery().catch(() => undefined);
        return;
      }
      await addReview(ctx.user.id, order.productId, Number(ratingRaw));
      await ctx.answerCallbackQuery({ text: t(ctx.user.language, 'review_thanks') }).catch(() => undefined);
      // Drop the review buttons once rated.
      await ctx.editMessageReplyMarkup().catch(() => undefined);
    } catch (err) {
      logger.warn({ err, orderId }, '⛔ review callback failed');
      await ctx.answerCallbackQuery().catch(() => undefined);
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });
}
