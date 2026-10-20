import { config } from '../config';
import { hmacSha256Hex, safeEqualHex } from '../core/crypto';
import type { Role, Source } from '../types';

/**
 * Stateless HMAC-signed tool tokens for MCP / A2A calls.
 * Format: base64url(JSON payload) + "." + hmacSha256Hex(mcpTokenSecret, payloadB64)
 */

export interface ToolTokenPayload {
  tool: string;
  userId: string | null;
  telegramId: string | null;
  role: Role;
  source: Source;
  iat: number; // unix seconds
  exp: number; // unix seconds
}

export interface MintToolTokenInput {
  tool: string;
  userId?: string | null;
  telegramId?: string | null;
  role: Role;
  source: Source;
  ttlSec?: number;
}

export type ToolTokenFailureReason = 'malformed' | 'bad_signature' | 'expired' | 'tool_mismatch';

export interface VerifyToolTokenResult {
  ok: boolean;
  payload?: ToolTokenPayload;
  reason?: ToolTokenFailureReason;
}

const DEFAULT_TTL_SEC = 300;
const MAX_TTL_SEC = 24 * 60 * 60;

export function mintToolToken(input: MintToolTokenInput): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSec && input.ttlSec > 0 ? Math.min(Math.floor(input.ttlSec), MAX_TTL_SEC) : DEFAULT_TTL_SEC;
  const payload: ToolTokenPayload = {
    tool: input.tool,
    userId: input.userId ?? null,
    telegramId: input.telegramId ?? null,
    role: input.role,
    source: input.source,
    iat: now,
    exp: now + ttl,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = hmacSha256Hex(config.security.mcpTokenSecret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyToolToken(token: string, expectedTool: string): VerifyToolTokenResult {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [payloadB64, sig] = parts;

  // Signature first — never trust the payload before it is authenticated.
  const expectedSig = hmacSha256Hex(config.security.mcpTokenSecret, payloadB64);
  if (!safeEqualHex(expectedSig, sig.toLowerCase())) return { ok: false, reason: 'bad_signature' };

  let payload: ToolTokenPayload;
  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as ToolTokenPayload;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.tool !== 'string' ||
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number' ||
      typeof parsed.role !== 'string' ||
      typeof parsed.source !== 'string'
    ) {
      return { ok: false, reason: 'malformed' };
    }
    payload = parsed;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return { ok: false, reason: 'expired' };
  if (payload.tool !== expectedTool) return { ok: false, reason: 'tool_mismatch' };

  return { ok: true, payload };
}
