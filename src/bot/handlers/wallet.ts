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
 */

const TOPUP_STARS = 100;

/** Human-readable transaction label: emoji + localized type + legacy description. */
const TX_LABEL_KEYS: Readonly<Record<string, string>> = {
  purchase: 'tx_purchase',
  sale: 'tx_sale',
  topup_manual: 'tx_topup_manual',
  topup_stars: 'tx_topup_stars',
  referral_bonus: 'tx_referral_bonus',
  quest_reward: 'tx_quest_reward',
  bonus: 'tx_bonus',
  withdraw: 'tx_withdraw',
  refund: 'tx_refund',
  transfer_in: 'tx_transfer_in',
  transfer_out: 'tx_transfer_out',
  commission: 'tx_commission',
  ai_usage: 'tx_ai_usage',
  adjustment: 'tx_adjustment',
};

interface TxMeta {
  legacyType?: string;
  description?: string;
}

function txLine(lang: string, tx: { amount: number; currency: string; type: string; meta: string | null; createdAt: Date }): string {
  const when = tx.createdAt.toISOString().slice(5, 16).replace('T', ' ');
  const currency = tx.currency === 'stars' ? '⭐' : '💎';
  const amount = `${tx.amount >= 0 ? '+' : ''}${tx.amount}${currency}`;
  const key = TX_LABEL_KEYS[tx.type];
  const label = key ? t(lang, key) : `${t(lang, 'tx_other')} ${tx.type}`;
  let meta: TxMeta = {};
  try {
    meta = tx.meta ? (JSON.parse(tx.meta) as TxMeta) : {};
  } catch {
    meta = {};
  }
  const desc = (meta.description ?? '').trim().slice(0, 40);
  return `${when} · ${amount} · ${label}${desc ? ` — ${desc}` : ''}`;
}

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
    .text(t(lang, 'menu_transfer'), 'transfer')
    .row()
    .text(t(lang, 'menu_withdraw'), 'withdraw')
    .text(t(lang, 'menu_history'), 'history')
    .row()
    .text(t(lang, 'back'), 'menu:root');

  await editOrReply(ctx, text, kb);
}

export async function showHistory(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const res = await getHistory(ctx.user.id, 10);
  const lines = res.items.map((tx) => txLine(lang, tx));
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
    await ctx.reply(t(lang, 'withdraw_prompt'));
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
  // Two-step confirmation — a typo in username or amount must be recoverable.
  ctx.session.wizard = {
    name: 'transfer',
    step: 1,
    data: { targetId: target.id, targetName: target.firstName || target.username || target.telegramId, amount: String(amount) },
  };
  const kb = new InlineKeyboard()
    .text(t(lang, 'confirm_yes'), 'trcf:yes')
    .text(t(lang, 'confirm_no'), 'trcf:no');
  await ctx.reply(t(lang, 'transfer_confirm', { amount, user: target.firstName || target.username || target.telegramId }), { reply_markup: kb });
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
        await ctx.reply(t(ctx.user.language, 'withdraw_prompt'));
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
      await ctx.reply(t(ctx.user.language, 'withdraw_prompt'));
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

  // Transfer confirmation buttons (wizard step 1 — data lives in the session).
  bot.callbackQuery(/^trcf:(yes|no)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const lang = ctx.user.language;
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== 'transfer' || wizard.step !== 1) {
      await ctx.reply(t(lang, 'transfer_cancelled'));
      return;
    }
    if (ctx.match[1] === 'no') {
      ctx.session.wizard = undefined;
      await ctx.reply(t(lang, 'transfer_cancelled'));
      return;
    }
    const targetId = wizard.data?.targetId;
    const amount = Number(wizard.data?.amount);
    ctx.session.wizard = undefined;
    if (typeof targetId !== 'string' || !Number.isInteger(amount) || amount <= 0) {
      await ctx.reply(t(lang, 'error_generic'));
      return;
    }
    try {
      await transferCredits(ctx.user.id, targetId, amount);
      await ctx.reply(t(lang, 'transfer_sent', { amount, user: wizard.data?.targetName ?? targetId }));
    } catch (err) {
      logger.warn({ err }, '⛔ transfer confirm failed');
      await ctx.reply(walletErrorText(lang, err)).catch(() => undefined);
    }
  });
}
