import type { Bot } from 'grammy';
import { isStaffTelegramId } from '../../config';
import { db } from '../../core/db';
import { logger } from '../../core/logger';
import { LOCALES, t } from '../../i18n';
import { getBrand, getSettingNumber } from '../../services/settings.service';
import { creditWallet, getOrCreateWallet } from '../../services/wallet.service';
import { applyReferral } from '../../services/referral.service';
import { touchDailyLogin } from '../../services/quest.service';
import type { BotContext } from '../context';
import { editOrReply, languageKeyboard, mainMenuKeyboard } from '../keyboards';
import { showMarket } from './market';
import { showWallet } from './wallet';
import { showOrders } from './orders';
import { showLeaderboard, showQuests, showReferral } from './quests';
import { showBookingServices } from './bookings';
import { showOwnerPanel } from './owner';

/**
 * /start · /menu · /help · /lang + the `menu:*` and `lang:<code>` callbacks.
 *
 * DEVIATION (welcome bonus): wallet.service exposes no bonus helper and the
 * Transaction type list in the schema has no 'bonus' row type. The bonus is
 * implemented locally with creditWallet(type 'bonus', reference
 * 'welcome_bonus') and made ONCE-per-wallet idempotent by checking that
 * reference first. See worklog Task 2-b.
 */

const WELCOME_BONUS_REF = 'welcome_bonus';

/** Grant the one-time welcome bonus (settings-driven amount). Returns credits granted (0 = none). */
async function grantWelcomeBonusOnce(userId: string): Promise<number> {
  const amount = Math.max(0, Math.floor(await getSettingNumber('welcome_bonus_credits')));
  if (amount <= 0) return 0;
  const wallet = await getOrCreateWallet(userId);
  const existing = await db.transaction.findFirst({
    where: { walletId: wallet.id, type: 'bonus', reference: WELCOME_BONUS_REF },
    select: { id: true },
  });
  if (existing) return 0;
  // Durable one-time claim — concurrent /start replays can never double-grant.
  try {
    await db.nonce.create({
      data: { key: `welcome:${userId}`, expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000) },
    });
  } catch {
    return 0;
  }
  await creditWallet(userId, amount, 'credits', 'bonus', WELCOME_BONUS_REF, { reason: 'welcome' });
  return amount;
}

/** Show (or refresh) the main menu. */
export async function showMainMenu(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  await editOrReply(ctx, t(lang, 'main_menu'), mainMenuKeyboard(lang, isStaffTelegramId(ctx.user.telegramId)));
}

function showHelp(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  return editOrReply(ctx, `${t(lang, 'help_title')}\n\n${t(lang, 'help_body')}`);
}

function showLanguage(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  return editOrReply(ctx, t(lang, 'choose_language'), languageKeyboard(lang));
}

export function registerStart(bot: Bot<BotContext>): void {
  bot.command('start', async (ctx) => {
    const { user } = ctx;
    const lang = user.language;

    // Referral binding (fail-safe inside the service; no-op for bad/used payloads).
    try {
      await applyReferral(user.id, (ctx.match ?? '').trim() || null);
    } catch (err) {
      logger.warn({ err, userId: user.id }, '🤝 /start applyReferral failed (non-fatal)');
    }

    // Daily check-in (streak + daily_login quest) — non-fatal.
    try {
      await touchDailyLogin(user.id);
    } catch (err) {
      logger.debug({ err, userId: user.id }, '🎯 touchDailyLogin failed (non-fatal)');
    }

    await ctx.reply(t(lang, 'welcome', { name: user.name, brand: (await getBrand()).name }), {
      reply_markup: mainMenuKeyboard(lang, isStaffTelegramId(user.telegramId)),
    });

    // Welcome bonus — ONCE per wallet.
    try {
      const credits = await grantWelcomeBonusOnce(user.id);
      if (credits > 0) await ctx.reply(t(lang, 'welcome_bonus', { credits }));
    } catch (err) {
      logger.warn({ err, userId: user.id }, '🎁 welcome bonus failed (non-fatal)');
    }

    // Seller redundancy net: surface paid-but-undelivered orders on every
    // /start — a missed push can never leave a paid order invisible.
    if (isStaffTelegramId(user.telegramId) || user.role === 'owner' || user.role === 'admin') {
      try {
        const awaiting = await db.order.count({
          where: { status: 'paid', product: { sellerId: user.id } },
        });
        if (awaiting > 0) {
          await ctx.reply(`⏳ ${t(lang, 'sales_awaiting', { count: awaiting })} → /sales`);
        }
      } catch (err) {
        logger.debug({ err }, 'seller awaiting banner skipped (non-fatal)');
      }
    }
  });

  bot.command('menu', async (ctx) => {
    await showMainMenu(ctx);
  });

  bot.command('help', async (ctx) => {
    await showHelp(ctx);
  });

  bot.command('lang', async (ctx) => {
    await showLanguage(ctx);
  });

  bot.callbackQuery(/^menu(?:$|:([a-z]+)$)/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const key = ctx.match[1] ?? 'root';
    try {
      switch (key) {
        case 'market':
          await showMarket(ctx);
          return;
        case 'wallet':
          await showWallet(ctx);
          return;
        case 'orders':
          await showOrders(ctx);
          return;
        case 'quests':
          await showQuests(ctx);
          return;
        case 'leaderboard':
          await showLeaderboard(ctx);
          return;
        case 'ref':
          await showReferral(ctx);
          return;
        case 'book':
          await showBookingServices(ctx);
          return;
        case 'help':
          await showHelp(ctx);
          return;
        case 'lang':
          await showLanguage(ctx);
          return;
        case 'owner':
          await showOwnerPanel(ctx);
          return;
        default:
          await showMainMenu(ctx);
      }
    } catch (err) {
      logger.warn({ err, menuKey: key }, '⛔ menu callback failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^lang:([a-z]{2})$/, async (ctx) => {
    const code = ctx.match[1];
    try {
      if (!LOCALES.includes(code)) {
        await ctx.answerCallbackQuery().catch(() => undefined);
        return;
      }
      await db.user.update({ where: { id: ctx.user.id }, data: { language: code } });
      ctx.user.language = code;
      await ctx.answerCallbackQuery().catch(() => undefined);
      await editOrReply(
        ctx,
        t(code, 'language_selected'),
        mainMenuKeyboard(code, isStaffTelegramId(ctx.user.telegramId))
      );
    } catch (err) {
      logger.warn({ err, code }, '⛔ language switch failed');
      await ctx.answerCallbackQuery().catch(() => undefined);
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });
}
