import type { MiddlewareFn } from 'grammy';
import { config, isOwnerTelegramId, isStaffTelegramId } from '../../config';
import { db } from '../../core/db';
import { logger } from '../../core/logger';
import { newId } from '../../core/ids';
import { detectLocale, t } from '../../i18n';
import type { Role } from '../../types';
import type { BotContext, BotUser } from '../context';

/**
 * Auth middleware: upserts the User (+ Wallet) keyed by the unique telegramId,
 * computes the effective role (env-configured staff wins over stored role),
 * resolves the language and attaches `ctx.user`.
 *
 * Fail-safe: any DB problem replies `error_generic` and STOPS the chain —
 * downstream handlers can rely on `ctx.user` being set.
 *
 * SCHEMA GAP (documented in worklog Task 2-b): the User model has NO whitelist
 * field. Per spec, a missing field is treated as "not whitelisted", so when
 * `WHITELIST_ONLY=true` every non-staff user is rejected (fail-closed). Do NOT
 * silently relax this — the owner must either add a whitelist column or keep
 * WHITELIST_ONLY=false.
 */

const VALID_ROLES: ReadonlySet<string> = new Set(['user', 'vip', 'admin', 'owner']);

function asRole(raw: string | null | undefined): Role {
  return raw && VALID_ROLES.has(raw) ? (raw as Role) : 'user';
}

export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return; // no identity → nothing to authenticate

  const telegramId = String(from.id);
  const fallbackLang = detectLocale(from.language_code);

  try {
    const staffRole: 'owner' | 'admin' | null = isOwnerTelegramId(telegramId)
      ? 'owner'
      : isStaffTelegramId(telegramId)
        ? 'admin'
        : null;

    const existing = await db.user.findUnique({ where: { telegramId } });
    const language = existing?.language?.trim() || fallbackLang;
    const role: Role = staffRole ?? asRole(existing?.role);

    const user = await db.user.upsert({
      where: { telegramId },
      update: {
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        language,
        role,
        lastSeenAt: new Date(),
      },
      create: {
        telegramId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        language,
        role,
        status: 'active',
        // User.referralCode is required+unique — generate a collision-safe code.
        referralCode: `kia_${newId().slice(0, 12)}`,
      },
    });

    // Whitelist-only mode: without a whitelist column we fail closed (staff only).
    if (config.access.whitelistOnly && !staffRole) {
      await ctx.reply(t(language, 'not_whitelisted'));
      return;
    }
    if (user.status === 'blocked') {
      await ctx.reply(t(language, 'not_whitelisted'));
      return;
    }

    ctx.user = {
      id: user.id,
      telegramId: user.telegramId,
      name: user.firstName || user.username || user.telegramId,
      username: user.username,
      role: asRole(user.role),
      language: user.language,
    } satisfies BotUser;

    await next();
  } catch (err) {
    logger.warn({ err, telegramId }, '⛔ auth middleware failed');
    await ctx.reply(t(fallbackLang, 'error_generic')).catch(() => undefined);
  }
};
