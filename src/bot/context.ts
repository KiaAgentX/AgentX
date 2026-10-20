import type { Context } from 'grammy';
import type { UserSession } from '../types';

/**
 * Bot-layer context & user view.
 *
 * grammY has no built-in session in this setup: `attachSession` (middlewares/session)
 * assigns `ctx.session`, and `authMiddleware` (middlewares/auth) assigns `ctx.user`
 * before any handler runs. Both are required on the type so handlers can rely on them.
 */

/** The authenticated Telegram user as seen by the bot layer. */
export interface BotUser {
  /** Internal Prisma User.id. */
  id: string;
  telegramId: string;
  /** Display name: firstName || username || telegramId. */
  name: string;
  username?: string | null;
  role: 'user' | 'vip' | 'admin' | 'owner';
  language: string;
}

/** grammY context enriched with the authenticated user and an in-memory session. */
export type BotContext = Context & {
  user: BotUser;
  session: UserSession;
};
