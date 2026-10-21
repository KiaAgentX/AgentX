import type { Bot } from 'grammy';
import type { Express } from 'express';
import type { Server } from 'http';
import { config } from './config';
import { logger } from './core/logger';
import { connectDb, disconnectDb, db } from './core/db';
import { createBot, startBot } from './bot';
import { createWebServer, startWebServer } from './web/server';
import { startCron } from './cron';
import { registerMcpApprovalHook } from './mcp/approval-hook';
import { seedMissingQuests } from './services/quest.service';

/**
 * XDrop (KIA DropAgentX) — entrypoint.
 * Boot order: DB → boot-seeds → MCP hooks → Web (always) → Cron → Bot (optional).
 * Without BOT_TOKEN the platform runs in WEB-ONLY mode (dashboard + API).
 */

/** Loud warning for the classic silent-empty-DB boot trap (SQLite auto-creates). */
async function warnIfDbEmpty(): Promise<void> {
  try {
    const users = await db.user.count();
    if (users === 0) {
      logger.warn(
        '⚠️  DATABASE IS EMPTY: Prisma auto-created a blank SQLite file. If you expected your restored data, check DATABASE_URL (it must point to your db/custom.db) — see README "Restore your data".'
      );
    }
  } catch (err) {
    logger.warn({ err }, '⚠️ could not verify DB emptiness at boot');
  }
}

async function main(): Promise<void> {
  logger.info('🚀 XDrop (KIA DropAgentX) booting…');
  logger.info(
    {
      mode: config.bot.token ? 'FULL (bot+web)' : 'WEB-ONLY (no BOT_TOKEN)',
      features: config.features,
      ai: config.ai.apiKey ? `enabled (${config.ai.model})` : 'disabled (rule-based fallbacks active)',
    },
    '🧩 Runtime configuration'
  );

  await connectDb();
  await warnIfDbEmpty();
  // Boot-time, create-only seeding — never overwrites the owner's customizations.
  await seedMissingQuests().catch((err) => logger.warn({ err }, 'quest boot-seed skipped (non-fatal)'));
  registerMcpApprovalHook();

  // Web server always boots — it also serves the Telegram webhook endpoint.
  let bot: Bot | null = null;
  if (config.bot.token) {
    bot = await createBot();
  }
  const app: Express = createWebServer(bot);
  const server: Server = await startWebServer(app);

  const stopCron = startCron(bot);

  if (bot) {
    await startBot(bot);
  } else {
    logger.warn('🤖 BOT_TOKEN missing — running WEB-ONLY mode. The dashboard and API are live; add BOT_TOKEN to enable the bot.');
  }

  // ── Graceful shutdown (re-entrancy safe, cron stopped, awaits in-flight) ──
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, '🛑 Graceful shutdown…');
    const force = setTimeout(() => {
      logger.warn('🛑 shutdown timeout — forcing exit');
      process.exit(1);
    }, 8_000);
    void (async () => {
      stopCron();
      if (bot) {
        await bot.stop().catch((err) => logger.warn({ err }, '🤖 bot.stop() failed during shutdown'));
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await disconnectDb();
      clearTimeout(force);
      process.exit(0);
    })();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '💥 Unhandled promise rejection');
  });
  // Fail-closed philosophy: an unknown corrupt state must not keep serving.
  process.on('uncaughtException', (err) => {
    logger.error({ err }, '💥 Uncaught exception — exiting (supervisor will restart)');
    shutdown('uncaughtException');
    setTimeout(() => process.exit(1), 3_000).unref();
  });
}

main().catch((err) => {
  logger.error({ err }, '💥 Fatal boot error');
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
