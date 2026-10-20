import type { Bot } from 'grammy';
import { handleUserMessage } from '../../agents/orchestrator';
import { aiEnabled } from '../../ai/provider';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import type { BotContext } from '../context';

/**
 * AI fallback — the LAST `message:text` handler (registered after the wizard
 * router and all commands):
 *   • text starting with '/' → unknown command (`error_generic`)
 *   • anything else → orchestrator.handleUserMessage() and a plain-text reply
 *     (no parse_mode: agent output is arbitrary text, never risk parse errors).
 *
 * Rate limiting / panic mode / prompt-injection screening happen inside the
 * orchestrator's security pipeline — its reply text is forwarded as-is.
 */
export function registerAiFallback(bot: Bot<BotContext>): void {
  bot.on('message:text', async (ctx) => {
    const lang = ctx.user.language;
    const text = ctx.message.text;
    try {
      if (text.startsWith('/')) {
        // '/cancel' without an active wizard is a no-op, everything else unknown.
        if (text.trim() !== '/cancel') await ctx.reply(t(lang, 'error_generic'));
        return;
      }

      // Thinking indicator only when the AI can actually answer.
      if (aiEnabled()) await ctx.reply(t(lang, 'ai_thinking'));

      const reply = await handleUserMessage({
        text,
        user: {
          id: ctx.user.id,
          telegramId: ctx.user.telegramId,
          username: ctx.user.username,
          firstName: ctx.user.name,
          role: ctx.user.role,
          language: lang,
        },
        source: 'bot',
      });

      const out = reply.pendingApproval ? `${reply.text}\n\n${t(lang, 'approval_created')}` : reply.text;
      await ctx.reply(out);
    } catch (err) {
      logger.warn({ err }, '⛔ ai fallback failed');
      await ctx.reply(t(lang, 'error_generic')).catch(() => undefined);
    }
  });
}
