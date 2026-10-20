import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { db } from '../../core/db';
import { InsufficientFundsError, ValidationError } from '../../core/errors';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import { getCreditsPerStar } from '../../services/settings.service';
import { getBalance, getHistory, requestWithdrawal, transferCredits } from '../../services/wallet.service';
import type { BotContext } from '../context';
import { editOrReply, insufficientFundsReply } from '../keyboards';
import { WITHDRAW_PROMPT } from './wizard';

/**
 * /wallet · /transfer · /withdraw · /history + `topup` / `transfer` /
 * `withdraw` / `history` callbacks.
 *
 * The topup invoice payload is 'topup:100' (100 ⭐) — the payment itself is
 * handled by the shared successful_payment hook in market.ts.
 *
 * Transfer uses a command-style wizard: `session.wizard = { name: 'transfer' }`
 * makes the next "<target> <amount>" text message complete the transfer
 * (step logic lives in wizard.ts). Prompts reuse t('transfer_hint').
 *
 * DEVIATION: EN.json has no short button labels for Transfer / Withdraw /
 * History (and no withdraw prompt) — literal emoji labels + WITHDRAW_PROMPT
 * from wizard.ts are used. See worklog Task 2-b.
 */

const TRANSFER_LABEL = '💸 Transfer';
const WITHDRAW_LABEL = '🏧 Withdraw';
const HISTORY_LABEL = '🧾 History';
const TOPUP_STARS = 100;

export async function showWallet(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const balance = await getBalance(ctx.user.id);
  const text = [
    t(lang, 'wallet_title'),
    '',
    t(lang, 'balance_credits', { credits: balance.credits }),
    t(lang, 'balance_stars', { stars: balance.stars }),
  ].join('\n');

  const kb = new InlineKeyboard()
    .text(t(lang, 'topup'), 'topup')
    .text(TRANSFER_LABEL, 'transfer')
    .row()
    .text(WITHDRAW_LABEL, 'withdraw')
    .text(HISTORY_LABEL, 'history')
    .row()
    .text(t(lang, 'back'), 'menu:root');

  await editOrReply(ctx, text, kb);
}

export async function showHistory(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const res = await getHistory(ctx.user.id, 10);
  const lines = res.items.map(
    (tx) =>
      `${tx.createdAt.toISOString().slice(0, 16).replace('T', ' ')}Z · ${
        tx.amount >= 0 ? '+' : ''
      }${tx.amount} ${tx.currency === 'stars' ? '⭐' : '💎'} (${tx.type})`
  );
  const text = `${t(lang, 'history_title')}\n\n${lines.length > 0 ? lines.join('\n') : '—'}`;
  const kb = new InlineKeyboard().text(t(lang, 'back'), 'menu:wallet');
  await editOrReply(ctx, text, kb);
}

async function sendTopupInvoice(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  if (!ctx.chat) return;
  const rate = await getCreditsPerStar();
  const title = t(lang, 'topup').slice(0, 32);
  const description = t(lang, 'topup_stars_hint', { rate }).slice(0, 255);
  await ctx.api.sendInvoice(ctx.chat.id, title, description, `topup:${TOPUP_STARS}`, 'XTR', [
    { label: title, amount: TOPUP_STARS },
  ]);
}

async function startTransferWizard(ctx: BotContext): Promise<void> {
  ctx.session.wizard = { name: 'transfer', step: 0, data: {} };
  await ctx.reply(t(ctx.user.language, 'transfer_hint'));
}

async function doWithdraw(ctx: BotContext, amountRaw: string): Promise<void> {
  const lang = ctx.user.language;
  const amount = Math.floor(Number(amountRaw.trim()));
  if (!Number.isInteger(amount) || amount <= 0) {
    await ctx.reply(WITHDRAW_PROMPT);
    return;
  }
  await requestWithdrawal(ctx.user.id, amount);
  await ctx.reply(t(lang, 'withdraw_requested'));
}

async function doTransfer(ctx: BotContext, targetRaw: string, amountRaw: string): Promise<void> {
  const lang = ctx.user.language;
  const amount = Math.floor(Number(amountRaw.trim()));
  if (!Number.isInteger(amount) || amount <= 0) {
    await ctx.reply(t(lang, 'transfer_hint'));
    return;
  }
  const clean = targetRaw.replace(/^@/, '').trim();
  const target = /^\d+$/.test(clean)
    ? await db.user.findUnique({ where: { telegramId: clean } })
    : await db.user.findFirst({ where: { username: clean } });
  if (!target || target.id === ctx.user.id) {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }
  await transferCredits(ctx.user.id, target.id, amount);
  await ctx.reply(t(lang, 'transfer_sent', { amount, user: target.firstName || target.username || target.telegramId }));
}

/** Unified error mapping for wallet money-flows. */
function walletErrorText(lang: string, err: unknown): string {
  if (err instanceof InsufficientFundsError) return insufficientFundsReply(lang, err);
  if (err instanceof ValidationError) return `⚠️ ${err.message}`;
  return t(lang, 'error_generic');
}

export function registerWallet(bot: Bot<BotContext>): void {
  bot.command('wallet', async (ctx) => {
    await showWallet(ctx);
  });

  bot.command('transfer', async (ctx) => {
    try {
      const parts = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await startTransferWizard(ctx);
        return;
      }
      await doTransfer(ctx, parts[0], parts[1]);
    } catch (err) {
      logger.warn({ err }, '⛔ /transfer failed');
      await ctx.reply(walletErrorText(ctx.user.language, err)).catch(() => undefined);
    }
  });

  bot.command('withdraw', async (ctx) => {
    try {
      const arg = (ctx.match ?? '').trim();
      if (!arg) {
        ctx.session.wizard = { name: 'withdraw', step: 0, data: {} };
        await ctx.reply(WITHDRAW_PROMPT);
        return;
      }
      await doWithdraw(ctx, arg);
    } catch (err) {
      logger.warn({ err }, '⛔ /withdraw failed');
      await ctx.reply(walletErrorText(ctx.user.language, err)).catch(() => undefined);
    }
  });

  bot.command('history', async (ctx) => {
    await showHistory(ctx);
  });

  bot.callbackQuery('topup', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await sendTopupInvoice(ctx);
    } catch (err) {
      logger.warn({ err }, '⛔ topup invoice failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery('transfer', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await startTransferWizard(ctx);
    } catch (err) {
      logger.warn({ err }, '⛔ transfer wizard start failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery('withdraw', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      ctx.session.wizard = { name: 'withdraw', step: 0, data: {} };
      await ctx.reply(WITHDRAW_PROMPT);
    } catch (err) {
      logger.warn({ err }, '⛔ withdraw wizard start failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery('history', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await showHistory(ctx);
    } catch (err) {
      logger.warn({ err }, '⛔ history callback failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });
}
