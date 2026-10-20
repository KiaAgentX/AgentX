import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { isStaffTelegramId } from '../../config';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import {
  assertCanDecide,
  createApproval,
  listPending,
  resolveApproval,
} from '../../services/hitl.service';
import { getSetting, setSetting } from '../../services/settings.service';
import { todaySnapshot } from '../../services/analytics.service';
import { editOrReply, approvalKeyboard } from '../keyboards';
import type { BotContext } from '../context';

/**
 * Staff-only surface: /panel (alias /owner) · /stats · /approvals · /broadcast ·
 * /addproduct · /kill · /id + `owner:*` shortcuts + `appr:<id>:<1|0>` decisions.
 *
 * IMPORTANT: resolving an approval here ONLY records the decision — execution
 * side-effects (withdrawals, refunds, broadcasts) run via the MCP approval hook
 * subscribed to BUS_EVENTS.APPROVAL_RESOLVED. Never execute them in the bot.
 *
 * NOTE: the panel reads pending-approval count from analytics.todaySnapshot()
 * (same number as hitl.listPending(50).length without a second query);
 * /approvals uses hitl.listPending(10) directly.
 */

function isStaffCtx(ctx: BotContext): boolean {
  return !!ctx.from && isStaffTelegramId(ctx.from.id);
}

async function guard(ctx: BotContext): Promise<boolean> {
  if (isStaffCtx(ctx)) return true;
  await ctx.reply(t(ctx.user.language, 'owner_only'));
  return false;
}

function ownerKeyboard(lang: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, 'approve'), 'owner:approvals')
    .text(t(lang, 'add_product'), 'owner:addproduct')
    .row()
    .text('🚨 Panic', 'owner:kill')
    .text(t(lang, 'stats_title'), 'owner:stats')
    .row()
    .text('📣 Broadcast', 'owner:broadcast');
}

async function panelText(lang: string): Promise<string> {
  const s = await todaySnapshot();
  const kill = (await getSetting('kill_switch')) === 'true';
  return [
    t(lang, 'owner_panel'),
    '',
    `👥 ${s.usersTotal} (+${s.usersNewToday} / 24h)`,
    `🛒 ${s.ordersToday} / 24h`,
    `💰 ${s.revenueStarsToday}⭐ / ${s.revenueCreditsToday}💎`,
    `📦 ${s.productsActive}`,
    t(lang, 'approvals_title', { count: s.approvalsPending }),
    `🤖 ${s.aiCallsToday} / 24h`,
    s.topProduct ? `🏆 ${s.topProduct.title} (${s.topProduct.salesCount})` : '🏆 —',
    kill ? t(lang, 'kill_switch_on') : t(lang, 'kill_switch_off'),
  ].join('\n');
}

/** Owner panel (also reachable from the staff main-menu row). */
export async function showOwnerPanel(ctx: BotContext): Promise<void> {
  if (!isStaffCtx(ctx)) {
    await ctx.reply(t(ctx.user.language, 'owner_only'));
    return;
  }
  await editOrReply(ctx, await panelText(ctx.user.language), ownerKeyboard(ctx.user.language));
}

async function showApprovals(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const pending = await listPending(10);
  if (pending.length === 0) {
    await editOrReply(ctx, t(lang, 'no_approvals'));
    return;
  }
  await ctx.reply(t(lang, 'approvals_title', { count: pending.length }));
  for (const a of pending) {
    const text = [
      `#${a.type} · ${a.riskLevel}`,
      a.summary,
      `⌛ ${a.expiresAt.toISOString().slice(0, 16).replace('T', ' ')}Z`,
    ].join('\n');
    await ctx.reply(text, { reply_markup: approvalKeyboard(a.id, lang) }).catch((err) =>
      logger.warn({ err, approvalId: a.id }, '⛔ approval card delivery failed')
    );
  }
}

async function onApprovalDecision(ctx: BotContext, approvalId: string, approve: boolean): Promise<void> {
  const lang = ctx.user.language;
  try {
    assertCanDecide(ctx.user.telegramId);
  } catch {
    await ctx.reply(t(lang, 'owner_only'));
    return;
  }
  try {
    const res = await resolveApproval(approvalId, approve ? 'approved' : 'rejected', ctx.user.telegramId);
    await ctx.reply(res ? t(lang, 'approval_done', { decision: res.status }) : t(lang, 'approval_expired'));
    await ctx.editMessageReplyMarkup().catch(() => undefined);
  } catch (err) {
    logger.warn({ err, approvalId }, '⛔ approval decision failed');
    await ctx.reply(t(lang, 'error_generic')).catch(() => undefined);
  }
}

async function startAddProduct(ctx: BotContext): Promise<void> {
  ctx.session.wizard = { name: 'addproduct', step: 0, data: {} };
  await ctx.reply(t(ctx.user.language, 'product_wizard_title'));
}

export function registerOwner(bot: Bot<BotContext>): void {
  bot.command('panel', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.reply(await panelText(ctx.user.language), { reply_markup: ownerKeyboard(ctx.user.language) });
  });

  bot.command('owner', async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.reply(await panelText(ctx.user.language), { reply_markup: ownerKeyboard(ctx.user.language) });
  });

  bot.command('stats', async (ctx) => {
    if (!(await guard(ctx))) return;
    const lang = ctx.user.language;
    const s = await todaySnapshot();
    const lines = [
      t(lang, 'stats_title'),
      '',
      `👥 ${s.usersTotal} (+${s.usersNewToday} / 24h)`,
      `🛒 ${s.ordersToday} / 24h`,
      `💰 ${s.revenueStarsToday}⭐ / ${s.revenueCreditsToday}💎`,
      `📦 ${s.productsActive}`,
      t(lang, 'approvals_title', { count: s.approvalsPending }),
      `🤖 ${s.aiCallsToday} / 24h`,
    ];
    await ctx.reply(lines.join('\n'));
  });

  bot.command('approvals', async (ctx) => {
    if (!(await guard(ctx))) return;
    await showApprovals(ctx);
  });

  bot.command('broadcast', async (ctx) => {
    if (!(await guard(ctx))) return;
    try {
      const text = (ctx.match ?? '').trim();
      if (!text) {
        await ctx.reply(t(ctx.user.language, 'broadcast_hint'));
        return;
      }
      await createApproval({
        type: 'broadcast',
        summary: `📣 Broadcast: ${text.slice(0, 180)}`,
        payload: { text, requestedBy: ctx.user.telegramId },
        requestedByTelegramId: ctx.user.telegramId,
        riskLevel: 'high',
        toolName: 'broadcast_request',
      });
      await ctx.reply(t(ctx.user.language, 'broadcast_queued'));
    } catch (err) {
      logger.warn({ err }, '⛔ /broadcast failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.command('addproduct', async (ctx) => {
    if (!(await guard(ctx))) return;
    await startAddProduct(ctx);
  });

  bot.command('kill', async (ctx) => {
    if (!(await guard(ctx))) return;
    try {
      const lang = ctx.user.language;
      const arg = (ctx.match ?? '').trim().toLowerCase();
      if (arg === 'on' || arg === 'off') {
        await setSetting('kill_switch', arg === 'on' ? 'true' : 'false');
        await ctx.reply(t(lang, arg === 'on' ? 'kill_switch_on' : 'kill_switch_off'));
        return;
      }
      const current = (await getSetting('kill_switch')) === 'true';
      await ctx.reply(`${t(lang, current ? 'kill_switch_on' : 'kill_switch_off')}\n/kill on|off`);
    } catch (err) {
      logger.warn({ err }, '⛔ /kill failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  // /id is safe for everyone — it only reveals the caller's own ids
  // (useful when the owner whitelists users manually; see auth.ts schema gap).
  bot.command('id', async (ctx) => {
    await ctx.reply(`${t(ctx.user.language, 'id_cmd', { id: ctx.user.id })}\n🆔 TG: ${ctx.user.telegramId}`);
  });

  bot.callbackQuery(/^owner:([a-z]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!isStaffCtx(ctx)) {
      await ctx.reply(t(ctx.user.language, 'owner_only'));
      return;
    }
    const key = ctx.match[1];
    try {
      switch (key) {
        case 'approvals':
          await showApprovals(ctx);
          return;
        case 'addproduct':
          await startAddProduct(ctx);
          return;
        case 'stats':
          await ctx.reply(await panelText(ctx.user.language));
          return;
        case 'broadcast':
          await ctx.reply(t(ctx.user.language, 'broadcast_hint'));
          return;
        case 'kill': {
          const lang = ctx.user.language;
          const next = (await getSetting('kill_switch')) === 'true' ? 'false' : 'true';
          await setSetting('kill_switch', next);
          await ctx.reply(t(lang, next === 'true' ? 'kill_switch_on' : 'kill_switch_off'));
          return;
        }
        default:
          await showOwnerPanel(ctx);
      }
    } catch (err) {
      logger.warn({ err, ownerKey: key }, '⛔ owner callback failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^appr:(.+):([01])$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await onApprovalDecision(ctx, ctx.match[1], ctx.match[2] === '1');
  });
}
