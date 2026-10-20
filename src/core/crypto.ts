import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';
import { logger } from './logger';

/**
 * HMAC-SHA256 helpers used across webhook verification, MCP tool tokens,
 * signed callback data and A2A authentication. Constant-time compares only.
 */
export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
      const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Sign an arbitrary string with the MCP token secret.
 * Format: <hex-signature>
 */
export function signWithSecret(data: string, secret?: string): string {
  return hmacSha256Hex(secret ?? config.security.mcpTokenSecret, data);
}

export function verifySignature(data: string, signature: string, secret?: string): boolean {
  return safeEqualHex(signature.toLowerCase(), signWithSecret(data, secret));
}

/** Warn loudly in dev if secrets are left at defaults. */
if (config.isProd && config.security.mcpTokenSecret === 'kia-dev-secret-change-me') {
  logger.warn('⚠️ MCP_TOKEN_SECRET is still the default value — CHANGE IT in production!');
}
