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
import { registerSales } from './handlers/sales';
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

/** Panic-mode gate: when Setting `kill_switch` is 'true', only staff pass. Fail-closed. */
async function panicGate(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  const telegramId = ctx.from ? String(ctx.from.id) : '';
  if (isStaffTelegramId(telegramId)) {
    await next();
    return;
  }
  try {
    if ((await getSetting('kill_switch')) === 'true') {
      await ctx.reply(t(ctx.user.language, 'panic_mode'));
      return;
    }
  } catch (err) {
    // Fail-closed: if we cannot read the kill switch, block non-staff traffic.
    logger.warn({ err }, '🚨 panic gate check failed (fail-closed)');
    await ctx.reply(t(ctx.user?.language ?? 'en', 'error_generic')).catch(() => undefined);
    return;
  }
  await next();
}

/** Deliver service-emitted bus events to Telegram. Subscribed once per bot. */
function wireBus(bot: Bot<BotContext>): void {
  /**
   * Delivery with bounded retry — a single dropped sendMessage must not
   * silently swallow "your order was paid / your withdrawal was approved".
   */
  const sendWithRetry = async (
    chatId: string,
    text: string,
    extra: SendMessageExtra | undefined,
    label: string,
    labelId: string | number
  ): Promise<void> => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await bot.api.sendMessage(chatId, text, extra);
        return;
      } catch (err) {
        if (attempt === 3) {
          logger.warn({ err, [label]: labelId, attempts: 3 }, '📨 notify delivery failed after retries');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  };

  onBus<NotifyUserPayload>(BUS_EVENTS.NOTIFY_USER, ({ telegramId, text, keyboard }) => {
    const extra: SendMessageExtra | undefined =
      keyboard === undefined ? undefined : ({ reply_markup: keyboard } as unknown as SendMessageExtra);
    void sendWithRetry(telegramId, text, extra, 'telegramId', telegramId);
  });

  onBus<NotifyOwnerPayload>(BUS_EVENTS.NOTIFY_OWNER, ({ text, keyboard }) => {
    const extra: SendMessageExtra | undefined =
      keyboard === undefined ? undefined : ({ reply_markup: keyboard } as unknown as SendMessageExtra);
    for (const ownerId of config.access.ownerIds) {
      void sendWithRetry(String(ownerId), text, extra, 'ownerId', ownerId);
    }
  });

  onBus<ApprovalEventPayload>(BUS_EVENTS.APPROVAL_CREATED, (payload) => {
    const text = `${t('en', 'approval_created')}\n\n#${payload.type} · ${payload.riskLevel}\n${payload.summary}`;
    const markup = approvalKeyboard(payload.approvalId, 'en');
    for (const ownerId of config.access.ownerIds) {
      void sendWithRetry(String(ownerId), text, { reply_markup: markup } as unknown as SendMessageExtra, 'ownerId', ownerId);
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
  registerSales(bot);
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

  /**
   * Long polling with capped exponential backoff: a network blip or a 409
   * conflict no longer leaves a silently dead bot — it reconnects (max 5
   * attempts, then escalates to the owner through every alive channel).
   */
  let polling = true;
  const runPolling = async (): Promise<void> => {
    for (let attempt = 1; polling && attempt <= 5; attempt++) {
      try {
        await bot.start({ drop_pending_updates: attempt === 1, onStart: (me) => logger.info(`🤖 @${me.username} is up (long polling)`) });
        return; // clean stop() — do not restart
      } catch (err) {
        if (!polling) return;
        const delayMs = Math.min(30_000, 2 ** attempt * 1_000);
        logger.error({ err, attempt, retryInMs: delayMs }, '🤖 long polling crashed — restarting with backoff');
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (polling) {
      logger.error('🤖 long polling gave up after 5 attempts — bot is DOWN');
      for (const ownerId of config.access.ownerIds) {
        try {
          await bot.api.sendMessage(String(ownerId), '🚨 BOT DOWN: long polling failed 5 times — the process keeps serving the dashboard, but the bot is offline. Restart the process.');
        } catch {
          // cannot reach the owner — nothing else we can do
        }
      }
    }
  };
  void runPolling();

  // Graceful stop on SIGTERM/SIGINT (the main entrypoint exits afterwards).
  const stop = (): void => {
    polling = false;
    void bot.stop().catch((err) => logger.warn({ err }, '🤖 bot.stop() failed'));
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
