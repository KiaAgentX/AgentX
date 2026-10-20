import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../../config';
import { db } from '../../core/db';
import { ValidationError } from '../../core/errors';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import { createOrder, getOrder, markPaidWithStars } from '../../services/order.service';
import { getBalance, topupWithStars } from '../../services/wallet.service';
import { listProducts } from '../../services/marketplace.service';
import type { BotContext } from '../context';
import { editOrReply, insufficientFundsReply, productKeyboard } from '../keyboards';

/**
 * /market + `page:<offset>` / `prod:<id>` / `buy:<id>:<credits|stars>` callbacks,
 * plus the Telegram Stars payment hooks (pre_checkout_query + successful_payment)
 * for BOTH order invoices and wallet top-up invoices.
 */

const PER_PAGE = 5;

/** Feature flag → generic error (never expose internals). */
async function featureOff(ctx: BotContext): Promise<void> {
  await ctx.reply(t(ctx.user.language, 'error_generic'));
}

/** Market list page (offset-based: offset = (page-1) * PER_PAGE). */
export async function showMarket(ctx: BotContext, offset = 0): Promise<void> {
  const lang = ctx.user.language;
  if (!config.features.marketplace) {
    await featureOff(ctx);
    return;
  }

  const page = Math.floor(Math.max(offset, 0) / PER_PAGE) + 1;
  const res = await listProducts({ page, perPage: PER_PAGE });

  let text: string;
  const kb = new InlineKeyboard();

  if (res.items.length === 0) {
    text = t(lang, 'market_empty');
  } else {
    const lines = res.items.map(
      (p, i) =>
        `${i + 1}. ${p.title}\n    ${t(lang, 'product_price_stars', { stars: p.priceStars })} · ${t(
          lang,
          'product_price_credits',
          { credits: p.priceCredits }
        )}`
    );
    text = `${t(lang, 'market_title', { page: res.page, pages: res.pages })}\n\n${lines.join('\n')}\n\n${t(
      lang,
      'market_search_hint'
    )}`;
    res.items.forEach((p, i) => kb.text(String(i + 1), `prod:${p.id}`));
    kb.row();
    const hasPrev = res.page > 1;
    const hasNext = res.page < res.pages;
    if (hasPrev) kb.text('⬅️', `page:${(res.page - 2) * PER_PAGE}`);
    if (hasNext) kb.text('➡️', `page:${res.page * PER_PAGE}`);
    if (hasPrev || hasNext) kb.row();
  }
  kb.text(t(lang, 'back'), 'menu:root');

  await editOrReply(ctx, text, kb);
}

/** Product card. */
export async function showProduct(ctx: BotContext, productId: string): Promise<void> {
  const lang = ctx.user.language;
  // NOTE: marketplace.getProduct() is typed Product | null (no seller in its
  // return type), so the seller select is done here for full typing.
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { seller: { select: { firstName: true, username: true } } },
  });
  if (!product || product.status !== 'active') {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }

  const description = product.description ? `\n\n${product.description.slice(0, 300)}` : '';
  const stock = product.stock < 0 ? '∞' : String(product.stock);
  const seller = product.seller.firstName || product.seller.username || '—';
  const lines = [
    `🛍 ${product.title}`,
    description,
    t(lang, 'product_price_stars', { stars: product.priceStars }),
    t(lang, 'product_price_credits', { credits: product.priceCredits }),
    t(lang, 'product_stock', { stock }),
    t(lang, 'product_seller', { seller }),
    t(lang, 'product_rating', { rating: product.ratingAvg.toFixed(2), count: product.ratingCount }),
  ].filter((l) => l.length > 0);

  await editOrReply(ctx, lines.join('\n'), productKeyboard(product, lang));
}

/** Credits checkout (with a friendly pre-check so balances show real numbers). */
async function buyWithCredits(ctx: BotContext, productId: string): Promise<void> {
  const lang = ctx.user.language;
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true, priceCredits: true },
  });
  if (!product || product.status !== 'active') {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }
  const balance = await getBalance(ctx.user.id);
  if (product.priceCredits > balance.credits) {
    await ctx.reply(t(lang, 'insufficient_funds', { balance: balance.credits, needed: product.priceCredits }));
    return;
  }
  const res = await createOrder(ctx.user.id, productId, { payWith: 'credits' });
  if (res.payment.method !== 'credits') {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }
  await ctx.reply(t(lang, 'purchase_success', { payload: (res.order.deliveryPayload ?? '—').slice(0, 1500) }));
}

/** Stars checkout → send the XTR invoice returned by order.service. */
async function buyWithStars(ctx: BotContext, productId: string): Promise<void> {
  const lang = ctx.user.language;
  if (!ctx.chat) return;
  const res = await createOrder(ctx.user.id, productId, { payWith: 'stars' });
  if (res.payment.method !== 'stars_invoice') {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }
  const inv = res.payment;
  await ctx.api.sendInvoice(
    ctx.chat.id,
    inv.title,
    inv.description,
    inv.payload,
    'XTR',
    [{ label: inv.title, amount: inv.amountStars }]
  );
  await ctx.reply(t(lang, 'purchase_pending_stars'));
}

/** successful_payment router: 'order:<id>' → mark paid · 'topup:<n>' → credits. */
async function onSuccessfulPayment(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const payment = ctx.message?.successful_payment;
  if (!payment) return;
  const payload = payment.invoice_payload;
  const chargeId = payment.telegram_payment_charge_id;

  if (payload.startsWith('order:')) {
    const orderId = payload.slice('order:'.length);
    // Cheap ownership guard before touching money state.
    const order = await getOrder(orderId);
    if (!order || order.buyerId !== ctx.user.id) {
      await ctx.reply(t(lang, 'error_generic'));
      return;
    }
    const paid = await markPaidWithStars(orderId, chargeId);
    await ctx.reply(t(lang, 'purchase_success', { payload: (paid.deliveryPayload ?? '—').slice(0, 1500) }));
    return;
  }

  if (payload.startsWith('topup:')) {
    const stars = Math.floor(Number(payload.slice('topup:'.length)));
    if (!Number.isInteger(stars) || stars <= 0) {
      await ctx.reply(t(lang, 'error_generic'));
      return;
    }
    const res = await topupWithStars(ctx.user.id, stars, chargeId);
    await ctx.reply(t(lang, 'topup_success', { credits: res.creditsAdded }));
    return;
  }

  logger.warn({ payload }, '⭐ successful_payment with unknown payload');
  await ctx.reply(t(lang, 'error_generic'));
}

export function registerMarket(bot: Bot<BotContext>): void {
  bot.command('market', async (ctx) => {
    await showMarket(ctx);
  });

  bot.callbackQuery(/^page:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await showMarket(ctx, Number(ctx.match[1]));
    } catch (err) {
      logger.warn({ err }, '⛔ market page callback failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^prod:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await showProduct(ctx, ctx.match[1]);
    } catch (err) {
      logger.warn({ err }, '⛔ product callback failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^buy:(.+):(credits|stars)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!config.features.marketplace) {
      await featureOff(ctx);
      return;
    }
    const [, productId, currency] = ctx.match;
    try {
      if (currency === 'credits') await buyWithCredits(ctx, productId);
      else await buyWithStars(ctx, productId);
    } catch (err) {
      if (err instanceof ValidationError) {
        // e.g. "Not enough stock available" — service message is user-safe.
        await ctx.reply(`⚠️ ${err.message}`);
        return;
      }
      try {
        await ctx.reply(insufficientFundsReply(ctx.user.language, err));
      } catch (replyErr) {
        logger.warn({ err: replyErr }, '⛔ buy callback failed');
      }
    }
  });

  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
      logger.warn({ err }, '⭐ pre_checkout_query answer failed');
    }
  });

  bot.on('message:successful_payment', async (ctx) => {
    try {
      await onSuccessfulPayment(ctx);
    } catch (err) {
      logger.warn({ err }, '⭐ successful_payment handling failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });
}
