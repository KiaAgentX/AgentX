import * as fs from 'fs';
import * as path from 'path';

/**
 * KIA DropAgentX — i18n engine.
 * Flat JSON dictionaries at <projectRoot>/locales/<code>.json.
 * `t()` is SYNCHRONOUS: en + fa are preloaded at module init (best-effort),
 * every other locale is lazy-loaded synchronously on first access and cached.
 * Fallback chain: lang → en → key.
 */

export const LOCALES: readonly string[] = [
  'en', 'fa', 'ar', 'ru', 'zh', 'es', 'fr', 'de', 'tr', 'hi',
  'pt', 'id', 'ja', 'ko', 'it', 'uk', 'pl', 'nl', 'vi', 'th',
  'ur', 'he', 'bn', 'sw', 'el',
];

export const LOCALE_META: Record<string, { name: string; flag: string }> = {
  en: { name: 'English', flag: '🇬🇧' },
  fa: { name: 'فارسی', flag: '🇮🇷' },
  ar: { name: 'العربية', flag: '🇸🇦' },
  ru: { name: 'Русский', flag: '🇷🇺' },
  zh: { name: '中文', flag: '🇨🇳' },
  es: { name: 'Español', flag: '🇪🇸' },
  fr: { name: 'Français', flag: '🇫🇷' },
  de: { name: 'Deutsch', flag: '🇩🇪' },
  tr: { name: 'Türkçe', flag: '🇹🇷' },
  hi: { name: 'हिन्दी', flag: '🇮🇳' },
  pt: { name: 'Português', flag: '🇵🇹' },
  id: { name: 'Bahasa Indonesia', flag: '🇮🇩' },
  ja: { name: '日本語', flag: '🇯🇵' },
  ko: { name: '한국어', flag: '🇰🇷' },
  it: { name: 'Italiano', flag: '🇮🇹' },
  uk: { name: 'Українська', flag: '🇺🇦' },
  pl: { name: 'Polski', flag: '🇵🇱' },
  nl: { name: 'Nederlands', flag: '🇳🇱' },
  vi: { name: 'Tiếng Việt', flag: '🇻🇳' },
  th: { name: 'ไทย', flag: '🇹🇭' },
  ur: { name: 'اردو', flag: '🇵🇰' },
  he: { name: 'עברית', flag: '🇮🇱' },
  bn: { name: 'বাংলা', flag: '🇧🇩' },
  sw: { name: 'Kiswahili', flag: '🇰🇪' },
  el: { name: 'Ελληνικά', flag: '🇬🇷' },
};

/** The 100 canonical keys defined by the English dictionary. */
export const CANONICAL_KEYS: readonly string[] = [
  'app_name', 'tagline', 'welcome', 'choose_language', 'language_selected',
  'main_menu', 'back', 'cancel', 'cancelled', 'error_generic',
  'panic_mode', 'not_whitelisted', 'rate_limited', 'help_title', 'help_body',
  'market_title', 'market_empty', 'market_search_hint', 'product_price_stars', 'product_price_credits',
  'product_stock', 'product_seller', 'product_rating', 'product_buy', 'buy_with_credits',
  'buy_with_stars', 'purchase_confirm', 'purchase_success', 'purchase_pending_stars', 'insufficient_funds',
  'orders_title', 'no_orders', 'order_status_pending', 'order_status_paid', 'order_status_delivered',
  'order_status_refunded', 'order_status_cancelled', 'review_prompt', 'review_thanks', 'wallet_title',
  'balance_credits', 'balance_stars', 'topup', 'topup_stars_hint', 'topup_success',
  'history_title', 'transfer_hint', 'transfer_sent', 'withdraw_requested', 'quests_title',
  'quest_progress', 'quest_claim', 'quest_claimed', 'quest_not_ready', 'leaderboard_title',
  'lb_xp', 'lb_sales', 'lb_ref', 'your_rank', 'referral_title',
  'your_link', 'referrals_count', 'referral_earned', 'referral_joined', 'ai_thinking',
  'ai_placeholder', 'ai_disabled', 'booking_title', 'booking_pick_service', 'booking_pick_slot',
  'booking_confirmed', 'booking_cancelled', 'booking_none', 'owner_panel', 'owner_only',
  'approvals_title', 'no_approvals', 'approve', 'reject', 'approval_done',
  'approval_expired', 'broadcast_hint', 'broadcast_queued', 'broadcast_progress', 'broadcast_done',
  'add_product', 'product_wizard_title', 'product_wizard_price', 'product_wizard_desc', 'product_added',
  'stats_title', 'settings_title', 'kill_switch_on', 'kill_switch_off', 'daily_report_title',
  'approval_created', 'booking_reminder', 'welcome_bonus', 'id_cmd', 'min_panel_hint',
];

const cache = new Map<string, Record<string, string>>();

/** Candidate directories for locale files (first hit wins). */
function localeDirs(): string[] {
  return [
    path.resolve(process.cwd(), 'locales'),
    path.resolve(__dirname, '../../../locales'), // dist/i18n → project root (per contract)
    path.resolve(__dirname, '../../locales'), // dist/i18n → project root (alt depth)
    path.resolve(__dirname, '../locales'), // src/i18n (ts-node style runs)
  ];
}

function readLocaleFile(lang: string): Record<string, string> | null {
  for (const dir of localeDirs()) {
    const file = path.join(dir, `${lang}.json`);
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    } catch {
      continue; // unreadable / invalid in this dir — try next candidate
    }
  }
  return null;
}

function getDictSync(lang: string): Record<string, string> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const data = readLocaleFile(lang);
  if (data) {
    cache.set(lang, data);
    return data;
  }
  return {}; // missing file — do not cache, EN fallback kicks in
}

/** Async loader (also warms the sync cache). Missing file → {}. */
export async function loadLocale(lang: string): Promise<Record<string, string>> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const data = readLocaleFile(lang) ?? {};
  cache.set(lang, data);
  return data;
}

// Best-effort preload of the two primary locales at module init.
try {
  const en = readLocaleFile('en');
  if (en) cache.set('en', en);
} catch {
  /* best-effort */
}
try {
  const fa = readLocaleFile('fa');
  if (fa) cache.set('fa', fa);
} catch {
  /* best-effort */
}

/** Translate `key` for `lang` with {param} interpolation. Synchronous. */
export function t(lang: string, key: string, params?: Record<string, string | number>): string {
  let value = getDictSync(lang)[key];
  if (value === undefined && lang !== 'en') value = getDictSync('en')[key];
  if (value === undefined) return key;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

/** Locale catalog for the language picker. complete = >= 80 canonical keys present. */
export function availableLocales(): Array<{ code: string; name: string; flag: string; complete: boolean }> {
  return LOCALES.map((code) => {
    const meta = LOCALE_META[code] ?? { name: code, flag: '🌐' };
    const dict = getDictSync(code);
    let hits = 0;
    for (const k of CANONICAL_KEYS) {
      if (dict[k] !== undefined) hits++;
    }
    return { code, name: meta.name, flag: meta.flag, complete: hits >= 80 };
  });
}

/** Map a Telegram language_code onto a supported locale (exact → prefix → 'en'). */
export function detectLocale(telegramLang?: string | null): string {
  if (!telegramLang) return 'en';
  const raw = String(telegramLang).trim().toLowerCase();
  if (!raw) return 'en';
  if ((LOCALES as readonly string[]).includes(raw)) return raw;
  const base = raw.split(/[-_]/)[0];
  if (base && (LOCALES as readonly string[]).includes(base)) return base;
  return 'en';
}
