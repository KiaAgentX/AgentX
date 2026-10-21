import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { isStaffTelegramId } from '../../config';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import { listSales } from '../../services/order.service';
import type { BotContext } from '../context';
import { backButton, editOrReply, orderStatusEmoji } from '../keyboards';

/**
 * /sales — seller surface: orders awaiting manual delivery + recent sales.
 * `sdel:<orderId>` starts the delivery wizard (step logic in wizard.ts).
 * Staff also reach this view from the owner panel (`owner:sales`).
 */

const LIST_LIMIT = 10;

export async function showSales(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const res = await listSales(ctx.user.id, 1);
  const items = res.items.slice(0, LIST_LIMIT);
  const pending = items.filter((o) => o.status === 'paid');
  const rest = items.filter((o) => o.status !== 'paid');

  if (items.length === 0) {
    await editOrReply(ctx, `${t(lang, 'sales_title')}\n\n${t(lang, 'sales_empty')}`, backButton(lang));
    return;
  }

  const lines: string[] = [t(lang, 'sales_title')];
  // Redundancy net for missed notifications — the seller can never claim they
  // were not told: the count of paid-but-undelivered orders is always shown.
  if (pending.length > 0) lines.push(`⏳ ${t(lang, 'sales_awaiting', { count: pending.length })}`);
  lines.push('');
  const kb = new InlineKeyboard();

  if (pending.length > 0) {
    lines.push(t(lang, 'sales_pending_head'));
    for (const o of pending) {
      const total = o.currency === 'stars' ? `${o.totalStars}⭐` : `${o.totalCredits}💎`;
      lines.push(`💳 ${o.product.title} · ${total} · 👤 ${o.buyer.firstName || o.buyer.username || '—'}`);
      kb.text(t(lang, 'deliver_btn'), `sdel:${o.id}`).row();
    }
    lines.push('');
  }

  if (rest.length > 0) {
    lines.push(t(lang, 'sales_history_head'));
    for (const o of rest) {
      const total = o.currency === 'stars' ? `${o.totalStars}⭐` : `${o.totalCredits}💎`;
      lines.push(`${orderStatusEmoji(o.status)} ${o.product.title.slice(0, 28)} · ${total}`);
      kb.text(`${orderStatusEmoji(o.status)} ${o.product.title.slice(0, 20)}`, `ord:${o.id}`).row();
    }
  }

  kb.text(t(lang, 'back'), 'menu:root');
  await editOrReply(ctx, lines.join('\n'), kb);
}

export function registerSales(bot: Bot<BotContext>): void {
  bot.command('sales', async (ctx) => {
    await showSales(ctx);
  });

  bot.callbackQuery(/^sdel:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!ctx.from) return;
    // Staff may deliver any order; sellers only their own (checked again in deliverOrder).
    const isStaff = isStaffTelegramId(String(ctx.from.id));
    ctx.session.wizard = { name: 'deliver', step: 0, data: { orderId: ctx.match[1], staff: isStaff ? '1' : '0' } };
    try {
      await ctx.reply(t(ctx.user.language, 'deliver_prompt'));
    } catch (err) {
      logger.warn({ err }, '⛔ sdel wizard start failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });
}
