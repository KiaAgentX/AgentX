import { Bot } from 'grammy';
import type { Api } from 'grammy';
import { config, isStaffTelegramId } from '../config';
import { logger } from '../core/logger';
import { BUS_EVENTS, onBus } from '../core/bus';
import type { ApprovalEventPayload, NotifyOwnerPayload, NotifyUserPayload } from '../core/bus';
import { getSetting } from '../services/settings.service';
import { t } from '../i18n';
import type { BotContext } from './context';
import { attachSession } from './middlewares/session';
import { authMiddleware } from './middlewares/auth';
import { approvalKeyboard } from './keyboards';
import { handleWizardText } from './handlers/wizard';
import { registerStart } from './handlers/start';
import { registerMarket } from './handlers/market';
import { registerWallet } from './handlers/wallet';
import { registerOrders } from './handlers/orders';
import { registerQuests } from './handlers/quests';
import { registerBookings } from './handlers/bookings';
import { registerOwner } from './handlers/owner';
import { registerCrm } from './handlers/crm';
import { registerAiFallback } from './handlers/ai';

/**
 * Bot layer entrypoint.
 *
 * createBot()  — builds and wires the grammY bot (middlewares, handlers, bus).
 * startBot()   — webhook mode when PUBLIC_URL + TELEGRAM_WEBHOOK_SECRET are set,
 *                otherwise long polling (NOT awaited — it blocks until stop).
 *
 * The web layer (Task 2-c) mounts POST /webhook/telegram and calls
 * bot.handleUpdate; that is why createBot() always initializes the bot
 * (`await bot.init()`), even in webhook mode.
 */

type SendMessageExtra = Parameters<Api['sendMessage']>[2];

/** Panic-mode gate: when Setting `kill_switch` is 'true', only staff pass. */
async function panicGate(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  try {
    const telegramId = ctx.from ? String(ctx.from.id) : '';
    if (!isStaffTelegramId(telegramId) && (await getSetting('kill_switch')) === 'true') {
      await ctx.reply(t(ctx.user.language, 'panic_mode'));
      return;
    }
  } catch (err) {
    // Never let the gate break the bot — fail open; the security pipeline
    // re-checks panic mode for AI messages anyway.
    logger.warn({ err }, '🚨 panic gate check failed (fail-open)');
  }
  await next();
}

/** Deliver service-emitted bus events to Telegram. Subscribed once per bot. */
function wireBus(bot: Bot<BotContext>): void {
  onBus<NotifyUserPayload>(BUS_EVENTS.NOTIFY_USER, ({ telegramId, text, keyboard }) => {
    const extra: SendMessageExtra | undefined =
      keyboard === undefined ? undefined : ({ reply_markup: keyboard } as unknown as SendMessageExtra);
    void bot.api
      .sendMessage(telegramId, text, extra)
      .catch((err) => logger.warn({ err, telegramId }, '📨 notify:user delivery failed'));
  });

  onBus<NotifyOwnerPayload>(BUS_EVENTS.NOTIFY_OWNER, ({ text, keyboard }) => {
    const extra: SendMessageExtra | undefined =
      keyboard === undefined ? undefined : ({ reply_markup: keyboard } as unknown as SendMessageExtra);
    for (const ownerId of config.access.ownerIds) {
      void bot.api
        .sendMessage(String(ownerId), text, extra)
        .catch((err) => logger.warn({ err, ownerId }, '📨 notify:owner delivery failed'));
    }
  });

  onBus<ApprovalEventPayload>(BUS_EVENTS.APPROVAL_CREATED, (payload) => {
    const text = `${t('en', 'approval_created')}\n\n#${payload.type} · ${payload.riskLevel}\n${payload.summary}`;
    const markup = approvalKeyboard(payload.approvalId, 'en');
    for (const ownerId of config.access.ownerIds) {
      void bot.api
        .sendMessage(String(ownerId), text, { reply_markup: markup })
        .catch((err) => logger.warn({ err, ownerId }, '📨 approval notification failed'));
    }
  });
}

/**
 * Build and wire the bot (middlewares, handlers, bus subscriptions).
 *
 * Returns the plain `Bot` type (grammY's `Bot<C>` is invariant, and the app
 * entrypoint stores it as `Bot`). Internally every handler runs with the rich
 * `BotContext` — `ctx.user`/`ctx.session` are attached by the first middlewares.
 */
export async function createBot(): Promise<Bot> {
  if (!config.bot.token) {
    throw new Error('BOT_TOKEN is missing — cannot create the bot');
  }
  const bot = new Bot<BotContext>(config.bot.token);

  // Log (never crash on) handler errors — grammY stops polling otherwise.
  bot.catch((err) => {
    logger.error({ err: err.error, updateId: err.ctx?.update?.update_id }, '🤖 bot handler error');
  });

  bot.use(attachSession, authMiddleware, panicGate);

  // Registration ORDER matters:
  //   1) wizard router (guards on ctx.session.wizard, intercepts plain text)
  //   2) start/menu/help/lang  3) market + payments  4) wallet
  //   5) orders  6) quests/leaderboard/ref  7) bookings
  //   8) owner commands  9) AI fallback (LAST)
  handleWizardText(bot);
  registerStart(bot);
  registerMarket(bot);
  registerWallet(bot);
  registerOrders(bot);
  registerQuests(bot);
  registerBookings(bot);
  registerOwner(bot);
  registerCrm(bot);
  registerAiFallback(bot);

  wireBus(bot);

  // The web layer calls bot.handleUpdate() for webhook updates — it requires
  // botInfo to be loaded, so initialize eagerly (also validates the token).
  await bot.init();
  logger.info(`🤖 bot initialized as @${bot.botInfo.username}`);

  return bot as unknown as Bot;
}

/**
 * Start delivery: webhook when PUBLIC_URL + TELEGRAM_WEBHOOK_SECRET exist,
 * long polling otherwise. Resolves as soon as delivery is configured —
 * the polling promise itself is intentionally NOT awaited (it blocks until stop).
 */
export async function startBot(bot: Bot): Promise<void> {
  if (config.bot.publicUrl && config.bot.webhookSecret) {
    await bot.api.setWebhook(`${config.bot.publicUrl}/webhook/telegram`, {
      secret_token: config.bot.webhookSecret,
      drop_pending_updates: true,
    });
    logger.info(`✅ webhook registered → ${config.bot.publicUrl}/webhook/telegram`);
    return;
  }

  logger.info('🤖 long-polling mode (no PUBLIC_URL/TELEGRAM_WEBHOOK_SECRET configured)');
  void bot
    .start({ drop_pending_updates: true, onStart: (me) => logger.info(`🤖 @${me.username} is up (long polling)`) })
    .catch((err) => logger.error({ err }, '🤖 long polling stopped with an error'));

  // Graceful stop on SIGTERM/SIGINT (the main entrypoint exits afterwards).
  const stop = (): void => {
    void bot.stop().catch((err) => logger.warn({ err }, '🤖 bot.stop() failed'));
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
