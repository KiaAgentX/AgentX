import type { MiddlewareFn } from 'grammy';
import type { UserSession } from '../../types';
import type { BotContext } from '../context';

/**
 * In-memory session store keyed by Telegram user id.
 *
 * grammY's official `session()` plugin needs an adapter/storage — the project
 * contract asked for the simplest in-memory Map instead. Sessions are per
 * process (lost on restart) which is fine: they only hold lightweight wizard
 * state (see UserSession in src/types.ts).
 */

const MAX_SESSIONS = 10_000;

const sessions = new Map<string, UserSession>();

/** Get (or lazily create) the session for a Telegram id. */
export function getSession(telegramId: string): UserSession {
  const existing = sessions.get(telegramId);
  if (existing) return existing;
  // Crude leak guard: single-process bot, sessions are tiny; wiping the oldest
  // map wholesale beats an unbounded Map if the bot ever grows huge.
  if (sessions.size >= MAX_SESSIONS) sessions.clear();
  const fresh: UserSession = {};
  sessions.set(telegramId, fresh);
  return fresh;
}

/** Drop a user's session (used on wizard completion/cancel in some flows). */
export function resetSession(telegramId: string): void {
  sessions.delete(telegramId);
}

/** Current number of tracked sessions (diagnostics). */
export function sessionCount(): number {
  return sessions.size;
}

/**
 * Middleware: attaches `ctx.session` (always) for every update that has a
 * `from` user; non-user updates get an ephemeral empty session object.
 */
export const attachSession: MiddlewareFn<BotContext> = (ctx, next) => {
  if (ctx.from) {
    ctx.session = getSession(String(ctx.from.id));
  } else {
    ctx.session = {};
  }
  return next();
};
