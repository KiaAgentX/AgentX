import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../../config';
import { db } from '../../core/db';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import { claimReward, listQuestsForUser } from '../../services/quest.service';
import { topByReferrals, topBySales, topByXp } from '../../services/leaderboard.service';
import { getReferralStats } from '../../services/referral.service';
import type { BotContext } from '../context';
import { backButton, editOrReply } from '../keyboards';

/**
 * /quests (+ `quest:<id>` claim) · /leaderboard · /ref (and /referral alias).
 */

export async function showQuests(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  if (!config.features.quests) {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }

  const views = await listQuestsForUser(ctx.user.id);
  const lines: string[] = [];
  const kb = new InlineKeyboard();

  for (const v of views) {
    const reward = v.quest.creditReward > 0 ? ` · +${v.quest.creditReward}💎` : '';
    lines.push(
      `${v.completed ? '✅' : v.claimable ? '🎁' : '🎯'} ${v.quest.title}\n    ${t(lang, 'quest_progress', {
        progress: v.progress,
        target: v.quest.target,
      })} · +${v.quest.xpReward} XP${reward}`
    );
    if (v.claimable) kb.text(`${t(lang, 'quest_claim')} · ${v.quest.title.slice(0, 18)}`, `quest:${v.quest.id}`).row();
  }

  const text = `${t(lang, 'quests_title')}\n\n${lines.length > 0 ? lines.join('\n') : '—'}`;
  const hasClaimable = views.some((v) => v.claimable);
  if (hasClaimable) kb.text(t(lang, 'back'), 'menu:root');
  await editOrReply(ctx, text, hasClaimable ? kb : backButton(lang));
}

export async function showLeaderboard(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  const [xp, sales, refs] = await Promise.all([topByXp(5), topBySales(5), topByReferrals(5)]);

  const section = (title: string, rows: Array<{ displayName: string; value: number }>): string =>
    `\n${title}\n${rows.length > 0 ? rows.map((r, i) => `${i + 1}. ${r.displayName} — ${r.value}`).join('\n') : '—'}`;

  const text = [
    t(lang, 'leaderboard_title'),
    section(t(lang, 'lb_xp'), xp),
    section(t(lang, 'lb_sales'), sales),
    section(t(lang, 'lb_ref'), refs),
  ].join('\n');

  await editOrReply(ctx, text, backButton(lang));
}

export async function showReferral(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  if (!config.features.referral) {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }

  const stats = await getReferralStats(ctx.user.id);
  const lines = [t(lang, 'referral_title'), ''];
  if (stats.link) lines.push(t(lang, 'your_link'), stats.link, '');
  lines.push(t(lang, 'referrals_count', { count: stats.count }));
  lines.push(t(lang, 'referral_earned', { credits: stats.totalEarned }));

  await editOrReply(ctx, lines.join('\n'), backButton(lang));
}

export function registerQuests(bot: Bot<BotContext>): void {
  bot.command('quests', async (ctx) => {
    await showQuests(ctx);
  });

  bot.command('leaderboard', async (ctx) => {
    await showLeaderboard(ctx);
  });

  bot.command('ref', async (ctx) => {
    await showReferral(ctx);
  });

  bot.command('referral', async (ctx) => {
    await showReferral(ctx);
  });

  bot.callbackQuery(/^quest:(.+)$/, async (ctx) => {
    const questId = ctx.match[1];
    const lang = ctx.user.language;
    try {
      const result = await claimReward(ctx.user.id, questId);
      if (result.ok) {
        await ctx.answerCallbackQuery({ text: t(lang, 'quest_claimed', { xp: result.xp ?? 0, credits: result.credits ?? 0 }) }).catch(() => undefined);
      } else {
        const quest = await db.quest.findUnique({ where: { id: questId }, select: { target: true } });
        await ctx.answerCallbackQuery({ text: t(lang, 'quest_not_ready', { target: quest?.target ?? 1 }) }).catch(() => undefined);
      }
      await showQuests(ctx); // refresh the quest list in place
    } catch (err) {
      logger.warn({ err, questId }, '⛔ quest claim failed');
      await ctx.answerCallbackQuery().catch(() => undefined);
      await ctx.reply(t(lang, 'error_generic')).catch(() => undefined);
    }
  });
}
