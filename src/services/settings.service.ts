import { Setting } from '@prisma/client';
import { db } from '../core/db';
import { config } from '../config';

/**
 * Key-value settings with typed defaults.
 * Used by commission math, credit rates, working hours, radar queries, etc.
 * Always read through this service — never query the Setting table directly.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  commission_percent: '10',
  credits_per_star: '100',
  working_hours: '09-18',
  referral_reward_credits: '500',
  welcome_bonus_credits: '200',
  radar_queries: '',
  refund_auto_limit: '0',
  bot_announcement: '',
  support_telegram: '',
  // White-label overrides (empty → falls back to config.brand from env)
  brand_name: '',
  brand_tagline: '',
  brand_footer: '',
};

export async function getSetting(key: string, fallback?: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } });
  if (row) return row.value;
  return fallback ?? SETTING_DEFAULTS[key] ?? '';
}

export async function getSettingNumber(key: string, fallback?: number): Promise<number> {
  const raw = await getSetting(key);
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const def = fallback ?? Number(SETTING_DEFAULTS[key]);
  return Number.isFinite(def) ? def : 0;
}

export async function setSetting(key: string, value: string): Promise<Setting> {
  return db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/** Conveniences used by pricing math. */
export async function getCreditsPerStar(): Promise<number> {
  const v = await getSettingNumber('credits_per_star');
  return v > 0 ? Math.floor(v) : 100;
}

export async function getCommissionPercent(): Promise<number> {
  const v = await getSettingNumber('commission_percent');
  return Math.min(Math.max(v, 0), 90);
}

/* ── White-label brand ────────────────────────────────────────────────────────
 * Priority: DB setting (brand_*) → env (BRAND_*) → built-in default.
 * Lets the owner rebrand the whole instance live, without a redeploy.
 */
export interface BrandInfo {
  name: string;
  tagline: string;
  footer: string;
}

export async function getBrand(): Promise<BrandInfo> {
  const [name, tagline, footer] = await Promise.all([
    getSetting('brand_name'),
    getSetting('brand_tagline'),
    getSetting('brand_footer'),
  ]);
  return {
    name: name.trim() || config.brand.name,
    tagline: tagline.trim() || config.brand.tagline,
    footer: footer.trim() || config.brand.footer,
  };
}
