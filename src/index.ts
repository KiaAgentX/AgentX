import type { Bot } from 'grammy';
import type { Express } from 'express';
import type { Server } from 'http';
import { config } from './config';
import { logger } from './core/logger';
import { connectDb, disconnectDb } from './core/db';
import { createBot, startBot } from './bot';
import { createWebServer, startWebServer } from './web/server';
import { startCron } from './cron';
import { registerMcpApprovalHook } from './mcp/approval-hook';

/**
 * KIA DropAgentX — entrypoint.
 * Boot order: DB → MCP hooks → Web (always) → Cron → Bot (optional).
 * Without BOT_TOKEN the platform runs in WEB-ONLY mode (dashboard + API).
 */
async function main(): Promise<void> {
  logger.info('🚀 KIA DropAgentX booting…');
  logger.info(
    {
      mode: config.bot.token ? 'FULL (bot+web)' : 'WEB-ONLY (no BOT_TOKEN)',
      features: config.features,
      ai: config.ai.apiKey ? `enabled (${config.ai.model})` : 'disabled (rule-based fallbacks active)',
    },
    '🧩 Runtime configuration'
  );

  await connectDb();
  registerMcpApprovalHook();

  // Web server always boots — it also serves the Telegram webhook endpoint.
  let bot: Bot | null = null;
  if (config.bot.token) {
    bot = await createBot();
  }
  const app: Express = createWebServer(bot);
  const server: Server = await startWebServer(app);

  startCron(bot);

  if (bot) {
    await startBot(bot);
  } else {
    logger.warn('🤖 BOT_TOKEN missing — running WEB-ONLY mode. The dashboard and API are live; add BOT_TOKEN to enable the bot.');
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, '🛑 Graceful shutdown…');
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '💥 Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, '💥 Uncaught exception');
  });
}

main().catch((err) => {
  logger.error({ err }, '💥 Fatal boot error');
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
