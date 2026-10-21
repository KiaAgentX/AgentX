/**
 * Shared domain types for KIA DropAgentX.
 * Keep this file minimal and stable — every module depends on it.
 */

export type Role = 'user' | 'vip' | 'admin' | 'owner';

export type Currency = 'credits' | 'stars';

export type Source = 'bot' | 'web' | 'a2a' | 'agent' | 'system';

/** The minimal identity every tool/agent call carries. */
export interface CallContext {
  /** Internal User.id (Prisma) — null for anonymous/system calls. */
  userId?: string | null;
  telegramId?: string | null;
  role: Role;
  language: string;
  source: Source;
  /** e.g. "receptionist" when an agent triggers the call. */
  agentName?: string;
  ip?: string | null;
  /**
   * Optional L12 tool token (HMAC, tool-scoped, 5-min TTL). When present it
   * is VERIFIED against the tool being called — a mismatch fails closed.
   * Internal agent calls omit it; external A2A callers must present it.
   */
  toolToken?: string | null;
}

export type ToolVisibility = 'public' | 'user' | 'owner' | 'hitl';

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  /** Human-friendly message (already localized upstream when possible). */
  message?: string;
  /** Set when the tool was gated behind an owner approval. */
  pendingApprovalId?: string;
  error?: string;
}

export interface AgentReply {
  text: string;
  /** Hint for the bot layer about which keyboard to attach. */
  keyboardHint?: 'main_menu' | 'market' | 'wallet' | 'quests' | 'owner' | null;
  parseMode?: 'HTML' | 'Markdown';
  pendingApproval?: boolean;
  meta?: Record<string, unknown>;
}

export interface PendingApprovalView {
  id: string;
  type: string;
  summary: string;
  riskLevel: string;
  toolName?: string | null;
  expiresAt: string;
  createdAt: string;
}

/** In-memory session shape used by the bot layer. */
export interface UserSession {
  lastMenu?: string;
  cartProductId?: string;
  salesStep?: string;
  salesData?: Record<string, string>;
  wizard?: { name: string; step: number; data: Record<string, string> };
  lastBotMessageAt?: number;
}
