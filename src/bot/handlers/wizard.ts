import type { Bot } from 'grammy';
import { db } from '../../core/db';
import { InsufficientFundsError, ValidationError } from '../../core/errors';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import { BOOKING_SERVICES, createBooking } from '../../services/booking.service';
import { createProduct } from '../../services/marketplace.service';
import { requestWithdrawal, transferCredits } from '../../services/wallet.service';
import type { UserSession } from '../../types';
import { insufficientFundsReply } from '../keyboards';
import type { BotContext } from '../context';

/**
 * Shared wizard router — ONE early `message:text` handler that intercepts
 * any message while `ctx.session.wizard` is set. Registered BEFORE commands,
 * so:
 *   • plain text while a wizard is active → routed to the wizard step (chain stops)
 *   • `/cancel` → clears the wizard, replies `cancelled` (chain stops)
 *   • any other command → clears the wizard and falls through to the commands
 *
 * Wizards set `session.wizard` from callbacks/commands in wallet.ts, bookings.ts
 * and owner.ts; the step logic lives HERE so there is a single router.
 */

type Wizard = NonNullable<UserSession['wizard']>;

/**
 * DEVIATION (i18n gap): locales/en.json has no keys for the withdraw amount
 * prompt, the product stock prompt or a few micro-labels. English literals are
 * used for exactly those strings — see worklog Task 2-b.
 */
export const WITHDRAW_PROMPT = '🏧 Send the amount in credits to withdraw (number):';
export const STOCK_PROMPT = '📦 Stock (integer, -1 = unlimited):';

/** Normalize a display slot: 'YYYY-MM-DD HH:mmZ'. */
export function fmtSlot(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

/**
 * Lenient slot parser — ALWAYS UTC (booking.service enforces UTC working
 * hours): 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm', full ISO with Z/offset,
 * 'today HH:mm', 'tomorrow HH:mm' or bare 'HH:mm'. Returns an ISO string or null.
 */
export function parseSlot(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // Plain calendar forms → interpreted as UTC.
  const cal = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(text);
  if (cal) {
    const [, y, mo, d, hRaw, minRaw] = cal;
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hRaw ?? 0), Number(minRaw ?? 0)));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Full ISO with explicit zone → let the engine parse it.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const rel = /^(today|tomorrow)\s+(\d{1,2}):(\d{2})$/i.exec(text);
  if (rel) {
    const base = new Date();
    if (rel[1].toLowerCase() === 'tomorrow') base.setUTCDate(base.getUTCDate() + 1);
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(rel[2]), Number(rel[3])));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const hm = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (hm) {
    const base = new Date();
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(hm[1]), Number(hm[2])));
    return d.toISOString();
  }
  return null;
}

/** Resolve a transfer target by @username or numeric telegram id. */
function resolveTarget(raw: string): Promise<{ id: string; firstName: string | null; username: string | null; telegramId: string } | null> {
  const clean = raw.replace(/^@/, '').trim();
  if (/^\d+$/.test(clean)) {
    return db.user.findUnique({ where: { telegramId: clean } });
  }
  return db.user.findFirst({ where: { username: clean } });
}

async function transferStep(ctx: BotContext, wizard: Wizard, text: string): Promise<void> {
  const lang = ctx.user.language;
  // Command-style one-shot: "<@username|telegramId> <amount>" (matches transfer_hint).
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    await ctx.reply(t(lang, 'transfer_hint'));
    return;
  }
  const amount = Math.floor(Number(parts[1]));
  if (!Number.isInteger(amount) || amount <= 0) {
    ctx.session.wizard = undefined;
    await ctx.reply(t(lang, 'transfer_hint'));
    return;
  }
  const target = await resolveTarget(parts[0]);
  if (!target || target.id === ctx.user.id) {
    ctx.session.wizard = undefined;
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }
  ctx.session.wizard = undefined;
  await transferCredits(ctx.user.id, target.id, amount);
  await ctx.reply(t(lang, 'transfer_sent', { amount, user: target.firstName || target.username || target.telegramId }));
}

async function withdrawStep(ctx: BotContext, wizard: Wizard, text: string): Promise<void> {
  const lang = ctx.user.language;
  const amount = Math.floor(Number(text.replace(/\s/g, '')));
  if (!Number.isInteger(amount) || amount <= 0) {
    await ctx.reply(WITHDRAW_PROMPT);
    return;
  }
  ctx.session.wizard = undefined;
  await requestWithdrawal(ctx.user.id, amount);
  await ctx.reply(t(lang, 'withdraw_requested'));
}

async function bookingStep(ctx: BotContext, wizard: Wizard, text: string): Promise<void> {
  const lang = ctx.user.language;
  let service = wizard.data.service;
  if (!service) {
    if (BOOKING_SERVICES.includes(text)) {
      service = text;
      wizard.data.service = text;
    } else {
      await ctx.reply(t(lang, 'booking_pick_service'));
      return;
    }
  }

  const slot = parseSlot(text);
  if (!slot) {
    await ctx.reply(t(lang, 'booking_pick_slot'));
    return;
  }

  ctx.session.wizard = undefined;
  try {
    const booking = await createBooking(ctx.user.id, service, slot);
    await ctx.reply(t(lang, 'booking_confirmed', { service: booking.service, slot: fmtSlot(booking.slotAt) }));
  } catch (err) {
    if (err instanceof ValidationError) {
      // Service messages are short, human-safe validation strings
      // (e.g. "This slot is already booked") — pass them through.
      await ctx.reply(`⚠️ ${err.message}`);
      return;
    }
    throw err;
  }
}

async function addProductStep(ctx: BotContext, wizard: Wizard, text: string): Promise<void> {
  const lang = ctx.user.language;
  switch (wizard.step) {
    case 0: {
      const title = text === '/skip' ? '' : text.trim();
      if (title.length < 3) {
        await ctx.reply(t(lang, 'product_wizard_title'));
        return;
      }
      wizard.data.title = title.slice(0, 120);
      wizard.step = 1;
      await ctx.reply(t(lang, 'product_wizard_price'));
      return;
    }
    case 1: {
      const price = Math.floor(Number(text.replace(/\s/g, '')));
      if (!Number.isInteger(price) || price <= 0) {
        await ctx.reply(t(lang, 'product_wizard_price'));
        return;
      }
      wizard.data.priceStars = String(price);
      wizard.step = 2;
      await ctx.reply(STOCK_PROMPT);
      return;
    }
    case 2: {
      const stock = Math.floor(Number(text.replace(/\s/g, '')));
      if (!Number.isInteger(stock) || stock < -1) {
        await ctx.reply(STOCK_PROMPT);
        return;
      }
      wizard.data.stock = String(stock);
      wizard.step = 3;
      await ctx.reply(t(lang, 'product_wizard_desc'));
      return;
    }
    default: {
      const description = text === '/skip' ? '' : text.slice(0, 800);
      const product = await createProduct(ctx.user.id, {
        title: wizard.data.title ?? '',
        priceStars: Number(wizard.data.priceStars ?? 0),
        stock: Number(wizard.data.stock ?? -1),
        description,
      });
      ctx.session.wizard = undefined;
      await ctx.reply(`${t(lang, 'product_added')}\n🛍 ${product.title}`);
    }
  }
}

/** Register the wizard router — MUST be attached before commands and the AI fallback. */
export function handleWizardText(bot: Bot<BotContext>): void {
  bot.command('cancel', async (ctx, next) => {
    if (!ctx.session?.wizard) return next(); // nothing to cancel → let others handle
    ctx.session.wizard = undefined;
    await ctx.reply(t(ctx.user.language, 'cancelled'));
  });

  bot.on('message:text', async (ctx, next) => {
    const wizard = ctx.session?.wizard;
    if (!wizard) return next();

    const text = ctx.message.text.trim();
    if (text.startsWith('/') && text !== '/skip') {
      // Any other command aborts the wizard and falls through to the commands.
      if (text !== '/cancel') ctx.session.wizard = undefined;
      return next();
    }

    try {
      switch (wizard.name) {
        case 'transfer':
          await transferStep(ctx, wizard, text);
          return;
        case 'withdraw':
          await withdrawStep(ctx, wizard, text);
          return;
        case 'booking':
          await bookingStep(ctx, wizard, text);
          return;
        case 'addproduct':
          await addProductStep(ctx, wizard, text);
          return;
        default:
          ctx.session.wizard = undefined;
          await ctx.reply(t(ctx.user.language, 'error_generic'));
          return;
      }
    } catch (err) {
      ctx.session.wizard = undefined;
      if (err instanceof InsufficientFundsError) {
        await ctx.reply(insufficientFundsReply(ctx.user.language, err)).catch(() => undefined);
        return;
      }
      logger.warn({ err, wizard: wizard.name }, '⛔ wizard step failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });
}
