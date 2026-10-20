import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../../config';
import { ValidationError } from '../../core/errors';
import { logger } from '../../core/logger';
import { t } from '../../i18n';
import { BOOKING_SERVICES, cancelBooking, createBooking, listUserBookings } from '../../services/booking.service';
import type { BotContext } from '../context';
import { backButton, editOrReply } from '../keyboards';
import { fmtSlot, parseSlot } from './wizard';

/**
 * /book (+ `bk:<service>` pick) · /bookings (+ `bkx:<id>` cancel).
 *
 * Two flows, per spec:
 *   1. /book <YYYY-MM-DD HH:mm> <serviceKey>  (direct)
 *   2. /book → pick service (callback) → wizard → next text is parsed as a slot
 *      (slot parsing lives in wizard.ts: ISO, 'YYYY-MM-DD HH:mm', 'today HH:mm',
 *      'tomorrow HH:mm', 'HH:mm' — all UTC).
 */

function bookingErrorText(lang: string, err: unknown): string {
  if (err instanceof ValidationError) {
    // Service validation messages are short, human-safe strings
    // (e.g. "This slot is already booked") — pass them through (documented deviation).
    return `⚠️ ${err.message}`;
  }
  return t(lang, 'error_generic');
}

export async function showBookingServices(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  if (!config.features.bookings) {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }

  const kb = new InlineKeyboard();
  for (const service of BOOKING_SERVICES) kb.text(service, `bk:${service}`).row();
  kb.text(t(lang, 'back'), 'menu:root');

  await editOrReply(ctx, `${t(lang, 'booking_title')}\n\n${t(lang, 'booking_pick_service')}`, kb);
}

async function createBookingNow(ctx: BotContext, service: string, slotRaw: string): Promise<void> {
  const lang = ctx.user.language;
  if (!BOOKING_SERVICES.includes(service)) {
    await ctx.reply(t(lang, 'booking_pick_service'));
    return;
  }
  const slot = parseSlot(slotRaw);
  if (!slot) {
    await ctx.reply(t(lang, 'booking_pick_slot'));
    return;
  }
  try {
    const booking = await createBooking(ctx.user.id, service, slot);
    await ctx.reply(t(lang, 'booking_confirmed', { service: booking.service, slot: fmtSlot(booking.slotAt) }));
  } catch (err) {
    await ctx.reply(bookingErrorText(lang, err));
  }
}

export async function showMyBookings(ctx: BotContext): Promise<void> {
  const lang = ctx.user.language;
  if (!config.features.bookings) {
    await ctx.reply(t(lang, 'error_generic'));
    return;
  }

  const rows = await listUserBookings(ctx.user.id);
  const now = Date.now();
  const active = rows.filter((b) => b.status === 'confirmed' && b.slotAt.getTime() >= now);
  const past = rows.filter((b) => !active.includes(b));

  if (rows.length === 0) {
    await editOrReply(ctx, t(lang, 'booking_none'), backButton(lang));
    return;
  }

  const kb = new InlineKeyboard();
  const lines: string[] = [];
  for (const b of [...active, ...past]) {
    const mark = b.status !== 'confirmed' ? ` (${b.status})` : '';
    lines.push(`📅 ${fmtSlot(b.slotAt)} · ${b.service}${mark}`);
    if (b.status === 'confirmed' && b.slotAt.getTime() >= now) {
      kb.text(`❌ ${b.service} · ${fmtSlot(b.slotAt)}`, `bkx:${b.id}`).row();
    }
  }
  kb.text(t(lang, 'back'), 'menu:root');

  await editOrReply(ctx, `${t(lang, 'booking_title')}\n\n${lines.join('\n')}`, kb);
}

export function registerBookings(bot: Bot<BotContext>): void {
  bot.command('book', async (ctx) => {
    try {
      if (!config.features.bookings) {
        await ctx.reply(t(ctx.user.language, 'error_generic'));
        return;
      }
      const args = (ctx.match ?? '').trim();
      if (!args) {
        await showBookingServices(ctx);
        return;
      }
      const cut = args.lastIndexOf(' ');
      if (cut <= 0) {
        await ctx.reply(t(ctx.user.language, 'booking_pick_slot'));
        return;
      }
      const service = args.slice(cut + 1).trim();
      const slotRaw = args.slice(0, cut).trim();
      await createBookingNow(ctx, service, slotRaw);
    } catch (err) {
      logger.warn({ err }, '⛔ /book failed');
      await ctx.reply(bookingErrorText(ctx.user.language, err)).catch(() => undefined);
    }
  });

  bot.command('bookings', async (ctx) => {
    try {
      await showMyBookings(ctx);
    } catch (err) {
      logger.warn({ err }, '⛔ /bookings failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^bk:([a-z_]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      if (!config.features.bookings) {
        await ctx.reply(t(ctx.user.language, 'error_generic'));
        return;
      }
      const service = ctx.match[1];
      if (!BOOKING_SERVICES.includes(service)) {
        await ctx.reply(t(ctx.user.language, 'booking_pick_service'));
        return;
      }
      ctx.session.wizard = { name: 'booking', step: 0, data: { service } };
      await ctx.reply(t(ctx.user.language, 'booking_pick_slot'));
    } catch (err) {
      logger.warn({ err }, '⛔ booking service pick failed');
      await ctx.reply(t(ctx.user.language, 'error_generic')).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^bkx:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await cancelBooking(ctx.user.id, ctx.match[1]);
      await ctx.reply(t(ctx.user.language, 'booking_cancelled'));
      await ctx.editMessageReplyMarkup().catch(() => undefined);
    } catch (err) {
      logger.warn({ err }, '⛔ booking cancel failed');
      await ctx.reply(bookingErrorText(ctx.user.language, err)).catch(() => undefined);
    }
  });
}
