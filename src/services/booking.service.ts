import { Booking, User } from '@prisma/client';
import { db } from '../core/db';
import { logger } from '../core/logger';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../core/errors';
import { getSetting } from './settings.service';

/**
 * Booking engine — hourly slots in UTC, working hours from the
 * `working_hours` setting (format '09-18'). One booking per service+slot.
 */

export const BOOKING_SERVICES: string[] = ['consulting', 'demo', 'support_call'];

function parseWorkingHours(raw: string): { start: number; end: number } {
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec((raw ?? '').trim());
  if (!match) return { start: 9, end: 18 };
  const start = Math.min(Math.max(parseInt(match[1], 10), 0), 23);
  const end = Math.min(Math.max(parseInt(match[2], 10), 1), 24);
  return end > start ? { start, end } : { start: 9, end: 18 };
}

export async function createBooking(userId: string, service: string, slotISO: string, notes?: string): Promise<Booking> {
  if (!BOOKING_SERVICES.includes(service)) {
    throw new ValidationError(`Unknown service "${service}". Available: ${BOOKING_SERVICES.join(', ')}`);
  }
  const slot = new Date(slotISO);
  if (Number.isNaN(slot.getTime())) throw new ValidationError('Invalid slot datetime');
  if (slot.getTime() <= Date.now()) throw new ValidationError('Slot must be in the future');

  const hours = parseWorkingHours(await getSetting('working_hours'));
  const hour = slot.getUTCHours();
  if (hour < hours.start || hour >= hours.end) {
    throw new ValidationError(`Bookings are only available between ${hours.start}:00 and ${hours.end}:00 UTC`);
  }

  // No double-booking: same service + exact slot, still confirmed.
  const clash = await db.booking.findFirst({
    where: { service, slotAt: slot, status: 'confirmed' },
    select: { id: true },
  });
  if (clash) throw new ValidationError('This slot is already booked');

  return db.booking.create({
    data: { userId, service, slotAt: slot, notes: notes ?? '' },
  });
}

export async function cancelBooking(userId: string, bookingId: string): Promise<Booking> {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError('Booking');
  if (booking.userId !== userId) throw new PermissionDeniedError('You can only cancel your own bookings');
  if (booking.status !== 'confirmed') {
    throw new ValidationError(`Booking is ${booking.status}; only confirmed bookings can be cancelled`);
  }
  return db.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
}

/** User's bookings: upcoming first (soonest first), then past (newest first). */
export async function listUserBookings(userId: string): Promise<Booking[]> {
  const rows = await db.booking.findMany({
    where: { userId },
    orderBy: { slotAt: 'asc' },
  });
  const now = Date.now();
  const future = rows.filter((b) => b.slotAt.getTime() >= now);
  const past = rows.filter((b) => b.slotAt.getTime() < now).reverse();
  return [...future, ...past];
}

/** Confirmed bookings inside the reminder window, not yet reminded. */
export async function listUpcoming(withinHours = 24): Promise<Array<Booking & { user: User }>> {
  const until = new Date(Date.now() + Math.max(withinHours, 0) * 3600 * 1000);
  return db.booking.findMany({
    where: { status: 'confirmed', slotAt: { lte: until }, remindedAt: null },
    orderBy: { slotAt: 'asc' },
    include: { user: true },
  });
}

/**
 * Hourly slots for a date (UTC) between working hours.
 * A slot is `taken` when a confirmed booking exists OR the slot is already in
 * the past (createBooking would reject it anyway — never advertise dead slots).
 */
export async function availableSlots(service: string, dateISO: string): Promise<Array<{ slot: string; taken: boolean }>> {
  const date = new Date(`${dateISO}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ValidationError('Invalid date (expected YYYY-MM-DD)');

  const hours = parseWorkingHours(await getSetting('working_hours'));
  const dayEnd = new Date(date.getTime() + 24 * 3600 * 1000);
  const bookings = await db.booking.findMany({
    where: { service, status: 'confirmed', slotAt: { gte: date, lt: dayEnd } },
    select: { slotAt: true },
  });
  const takenSet = new Set(bookings.map((b) => b.slotAt.getTime()));
  const now = Date.now();

  const out: Array<{ slot: string; taken: boolean }> = [];
  for (let h = hours.start; h < hours.end; h++) {
    const slotAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, 0, 0, 0));
    out.push({ slot: slotAt.toISOString(), taken: takenSet.has(slotAt.getTime()) || slotAt.getTime() <= now });
  }
  return out;
}

/** Mark a booking as reminded (idempotent — only the first write wins). */
export async function markReminded(bookingId: string): Promise<void> {
  try {
    await db.booking.updateMany({
      where: { id: bookingId, remindedAt: null },
      data: { remindedAt: new Date() },
    });
  } catch (err) {
    logger.warn({ err, bookingId }, '📅 markReminded failed (non-fatal)');
  }
}
