import { InlineKeyboard } from 'grammy';
import type { Product } from '@prisma/client';
import { availableLocales, t } from '../i18n';
import type { BotContext } from './context';

/**
 * Inline keyboard + callback-data helpers for the bot layer.
 *
 * Callback data prefixes (contract):
 *   prod:<productId>            — open product card
 *   buy:<productId>:<credits|stars> — checkout
 *   page:<marketOffset>         — market pagination (offset = (page-1)*5)
 *   ord:<orderId>               — order detail
 *   review:<orderId>:<1-5>      — rate a delivered order
 *   appr:<approvalId>:<1|0>     — HITL approve/reject
 *   lang:<code>                 — language switch
 *   menu[:<key>]                — main-menu navigation
 *   quest:<questId>             — claim quest reward
 *   bk:<service> / bkx:<bookingId> — booking service pick / cancel
 *   topup | transfer | withdraw | history — wallet shortcuts
 *   owner:<key>                 — owner panel shortcuts
 */

/**
 * NOTE: a handful of short button labels have no dedicated i18n key in
 * locales/en.json (e.g. a compact "Market" label — `market_title` carries a
 * {page}/{pages} placeholder and cannot be reused). They are kept as literal
 * emoji labels and documented as a deviation in worklog Task 2-b.
 */

/** Main menu: market/wallet/orders · quests/leaderboard/ref · book/help/lang (+ owner panel row for staff). */
export function mainMenuKeyboard(lang: string, isStaff: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('🛍 Market', 'menu:market')
    .text(t(lang, 'wallet_title'), 'menu:wallet')
    .text(t(lang, 'orders_title'), 'menu:orders')
    .row()
    .text(t(lang, 'quests_title'), 'menu:quests')
    .text(t(lang, 'leaderboard_title'), 'menu:leaderboard')
    .text(t(lang, 'referral_title'), 'menu:ref')
    .row()
    .text(t(lang, 'booking_title'), 'menu:book')
    .text(t(lang, 'help_title'), 'menu:help')
    .text('🌐 Lang', 'menu:lang');
  if (isStaff) kb.row().text(t(lang, 'owner_panel'), 'menu:owner');
  return kb;
}

/** Product card: buy-credits (if priced) / buy-stars (if priced) / back. */
export function productKeyboard(product: Product, lang: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (product.priceCredits > 0) kb.text(t(lang, 'buy_with_credits'), `buy:${product.id}:credits`).row();
  if (product.priceStars > 0) kb.text(t(lang, 'buy_with_stars'), `buy:${product.id}:stars`).row();
  kb.text(t(lang, 'back'), 'menu:market');
  return kb;
}

const ORDER_EMOJI: Readonly<Record<string, string>> = {
  pending: '⏳',
  paid: '💳',
  delivered: '✅',
  refunded: '↩️',
  cancelled: '❌',
};

export function orderStatusEmoji(status: string): string {
  return ORDER_EMOJI[status] ?? '•';
}

/** Localized status label — keys `order_status_<status>` exist for all 5 statuses. */
export function orderStatusLabel(lang: string, status: string): string {
  return t(lang, `order_status_${status}`);
}

/** Order list: one tappable row per order + back. */
export function ordersKeyboard(
  orders: ReadonlyArray<{ id: string; status: string; title: string }>,
  lang: string
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of orders) {
    kb.text(`${orderStatusEmoji(o.status)} ${o.title.slice(0, 24)}`, `ord:${o.id}`).row();
  }
  kb.text(t(lang, 'back'), 'menu:root');
  return kb;
}

/** HITL decision keyboard: ✅/❌ with data `appr:<id>:<1|0>`. */
export function approvalKeyboard(approvalId: string, lang: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, 'approve'), `appr:${approvalId}:1`)
    .text(t(lang, 'reject'), `appr:${approvalId}:0`);
}

/** Language picker grid (2 per row) from availableLocales() with `lang:<code>` callbacks. */
export function languageKeyboard(lang = 'en'): InlineKeyboard {
  const kb = new InlineKeyboard();
  const locales = availableLocales();
  locales.forEach((l, i) => {
    kb.text(`${l.flag} ${l.name}`, `lang:${l.code}`);
    if (i % 2 === 1) kb.row();
  });
  if (locales.length % 2 === 1) kb.row();
  kb.text(t(lang, 'back'), 'menu:root');
  return kb;
}

/** Single "back to main menu" button. */
export function backButton(lang: string): InlineKeyboard {
  return new InlineKeyboard().text(t(lang, 'back'), 'menu:root');
}

/**
 * Edit the message that carried the callback query, or reply fresh when the
 * callback has no editable message (too old / command context).
 */
export async function editOrReply(ctx: BotContext, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const extra = keyboard ? { reply_markup: keyboard } : undefined;
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, extra);
      return;
    } catch {
      // message unmodifiable (identical text / too old) → fall through to reply
    }
  }
  await ctx.reply(text, extra);
}

/**
 * Map an InsufficientFundsError to the localized `insufficient_funds` message.
 * The error message carries "need N, available M" — parse it; anything else
 * degrades to `error_generic`.
 */
export function insufficientFundsReply(lang: string, err: unknown): string {
  const match = err instanceof Error ? /need (\d+), available (\d+)/.exec(err.message) : null;
  if (!match) return t(lang, 'error_generic');
  return t(lang, 'insufficient_funds', { balance: Number(match[2]), needed: Number(match[1]) });
}
