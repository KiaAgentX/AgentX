import { createHmac } from 'crypto';
import { config } from '../config';
import { safeEqualHex, safeEqualString } from '../core/crypto';

/**
 * Boundary-layer verification for Telegram webhooks and Mini App initData.
 * Both checks fail CLOSED: any missing input → false / ok:false.
 */

/** Validate the X-Telegram-Bot-Api-Secret-Token header against config.bot.webhookSecret. */
export function verifyTelegramSecret(headers: Record<string, string | string[] | undefined>): boolean {
  const secret = config.bot.webhookSecret;
  if (!secret) return false;

  let provided: string | undefined;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'x-telegram-bot-api-secret-token') {
      provided = Array.isArray(value) ? value[0] : value;
      break;
    }
  }
  if (!provided) return false;
  return safeEqualString(provided, secret);
}

export interface InitDataUser {
  id: number;
  username?: string;
  first_name?: string;
  language_code?: string;
  photo_url?: string;
}

export interface InitDataResult {
  ok: boolean;
  user?: InitDataUser;
  reason?: string;
}

const MAX_AUTH_DATE_AGE_SEC = 24 * 60 * 60; // 24h

/**
 * Telegram Mini App initData validation — EXACTLY per the official spec:
 *   1. Parse the URL-encoded params; extract `hash`.
 *   2. data_check_string = all params except `hash` and `signature`,
 *      as `key=value` pairs, sorted by key, joined with "\n".
 *   3. secret_key = HMAC_SHA256(key="WebAppData", data=botToken)  → raw bytes.
 *   4. computed   = HMAC_SHA256(key=secret_key, data=data_check_string) → hex.
 *   5. Constant-time compare + auth_date must be no older than 24h.
 */
export function verifyInitData(initData: string): InitDataResult {
  if (!config.bot.token) return { ok: false, reason: 'no_bot_token' };
  if (!initData || typeof initData !== 'string') return { ok: false, reason: 'missing_init_data' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed_init_data' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'missing_hash' };

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash' && key !== 'signature') pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  // secret_key is the HMAC DIGEST (raw bytes), not a hex string.
  const secretKey = createHmac('sha256', 'WebAppData').update(config.bot.token).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!safeEqualHex(computed, hash.toLowerCase())) return { ok: false, reason: 'bad_signature' };

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) return { ok: false, reason: 'missing_auth_date' };
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'bad_auth_date' };
  if (Date.now() / 1000 - authDate > MAX_AUTH_DATE_AGE_SEC) return { ok: false, reason: 'expired_auth_date' };

  let user: InitDataUser | undefined;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw) as InitDataUser;
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'number') user = parsed;
    } catch {
      // user payload optional — ignore parse errors
    }
  }

  return { ok: true, user };
}
