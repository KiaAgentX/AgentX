import { BUS_EVENTS, emitBus } from '../core/bus';

/**
 * Notification facade — the ONLY channel services use to reach humans.
 * Services never import grammY / call Telegram directly: they emit bus
 * events and the bot + web layers subscribe and deliver.
 */

/** Send (or queue) a text message to a specific Telegram user. */
export function notifyUser(telegramId: string, text: string, keyboard?: unknown): void {
  emitBus(BUS_EVENTS.NOTIFY_USER, { telegramId, text, keyboard });
}

/** Notify the owner (super-admin) — also mirrored to the live dashboard. */
export function notifyOwner(text: string, keyboard?: unknown): void {
  emitBus(BUS_EVENTS.NOTIFY_OWNER, { text, keyboard });
  emitBus(BUS_EVENTS.SSE, { type: 'notify_owner', payload: { text } });
}

/** Push a live event to all connected dashboard (SSE) clients. */
export function sse(type: string, payload: unknown): void {
  emitBus(BUS_EVENTS.SSE, { type, payload });
}
