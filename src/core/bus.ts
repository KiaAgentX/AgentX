import { EventEmitter } from 'events';

/**
 * Internal event bus — decouples services from delivery layers.
 * Services NEVER call Telegram directly; they emit events and the bot/web
 * layers subscribe. This keeps the core testable and web-only mode possible.
 */
export const BUS_EVENTS = {
  NOTIFY_USER: 'notify:user',
  NOTIFY_OWNER: 'notify:owner',
  APPROVAL_CREATED: 'approval:created',
  APPROVAL_RESOLVED: 'approval:resolved',
  SSE: 'sse',
  WALLET_TX: 'wallet:tx',
  ORDER_NEW: 'order:new',
  ORDER_PAID: 'order:paid',
  QUEST_DONE: 'quest:done',
  AI_USAGE: 'ai:usage',
} as const;

export interface NotifyUserPayload {
  telegramId: string;
  text: string;
  keyboard?: unknown;
}

export interface NotifyOwnerPayload {
  text: string;
  keyboard?: unknown;
}

export interface SsePayload {
  type: string;
  payload: unknown;
}

export interface ApprovalEventPayload {
  approvalId: string;
  type: string;
  summary: string;
  riskLevel: string;
  status: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(64);

export function emitBus(event: string, payload: unknown): void {
  bus.emit(event, payload);
}

export function onBus<T = unknown>(event: string, listener: (payload: T) => void): () => void {
  const wrapped = (p: unknown): void => listener(p as T);
  bus.on(event, wrapped);
  return () => bus.off(event, wrapped);
}
