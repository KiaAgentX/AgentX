import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';

/**
 * Short-lived signed tokens for the SSE live stream.
 *
 * EventSource cannot set custom headers, so the browser first exchanges the
 * dashboard key (POST /api/v1/stream-token, X-KIA-Key protected) for a token
 * that is valid for a few minutes, then opens /api/v1/stream?token=... .
 * Tokens are HMAC-SHA256(dashboardKey, "stream:<issuedAtSec>") — they grant
 * NOTHING beyond reading the event stream and expire quickly.
 */

export const STREAM_TOKEN_TTL_SEC = 300;

function sign(issuedAtSec: number): string {
  return createHmac('sha256', config.web.dashboardKey).update(`stream:${issuedAtSec}`).digest('hex');
}

export function mintStreamToken(): { token: string; ttlSec: number } {
  const issuedAtSec = Math.floor(Date.now() / 1000);
  return { token: `${issuedAtSec}.${sign(issuedAtSec)}`, ttlSec: STREAM_TOKEN_TTL_SEC };
}

/** Constant-time verification with a hard TTL. Fail-closed on any oddity. */
export function verifyStreamToken(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return false;
  const tsStr = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!/^\d{1,12}$/.test(tsStr)) return false;
  const issuedAtSec = Number(tsStr);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - issuedAtSec) > STREAM_TOKEN_TTL_SEC) return false;
  const expected = sign(issuedAtSec);
  try {
    return timingSafeEqual(Buffer.from(mac, 'utf8'), Buffer.from(expected, 'utf8')) && mac.length === expected.length;
  } catch {
    return false;
  }
}
