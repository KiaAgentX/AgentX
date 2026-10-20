import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated configuration.
 * Every module reads settings from here — never from process.env directly.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('file:../db/kia.db'),

  // Telegram
  BOT_TOKEN: z.string().optional(),
  BOT_USERNAME: z.string().optional(),
  PUBLIC_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Access control
  OWNER_IDS: z.string().default(''),
  ADMIN_IDS: z.string().default(''),
  WHITELIST_ONLY: z.enum(['true', 'false']).default('false'),

  // Security
  MCP_TOKEN_SECRET: z.string().default('kia-dev-secret-change-me'),
  A2A_SECRET: z.string().optional(),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  DAILY_SPEND_LIMIT: z.coerce.number().int().nonnegative().default(500000),
  APPROVAL_TTL_MIN: z.coerce.number().int().positive().default(60),

  // AI provider (OpenAI-compatible)
  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(800),

  // Feature flags
  ENABLE_MARKETPLACE: z.enum(['true', 'false']).default('true'),
  ENABLE_QUESTS: z.enum(['true', 'false']).default('true'),
  ENABLE_REFERRAL: z.enum(['true', 'false']).default('true'),
  ENABLE_BOOKINGS: z.enum(['true', 'false']).default('true'),
  ENABLE_RADAR: z.enum(['true', 'false']).default('false'),
  ENABLE_AUTO_REPORTS: z.enum(['true', 'false']).default('true'),
  REPORT_TZ: z.string().default('UTC'),

  // Web
  WEB_CORS_ORIGINS: z.string().default('*'),
  // Shared secret for the Web-dashboard owner API (falls back to MCP_TOKEN_SECRET)
  DASHBOARD_KEY: z.string().optional(),

  // White-label branding (one env var rebrands the whole instance)
  BRAND_NAME: z.string().default('KIA DropAgentX'),
  BRAND_TAGLINE: z.string().default('Command center'),
  BRAND_FOOTER: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration — check your .env file');
}

const env = parsed.data;

function parseIds(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,

  bot: {
    /** Missing token → web-only mode (dashboard runs, bot disabled). */
    token: env.BOT_TOKEN && env.BOT_TOKEN.trim().length > 10 ? env.BOT_TOKEN.trim() : null,
    username: env.BOT_USERNAME?.replace(/^@/, '').trim() || null,
    publicUrl: env.PUBLIC_URL?.trim().replace(/\/+$/, '') || null,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
  },

  access: {
    ownerIds: parseIds(env.OWNER_IDS),
    adminIds: parseIds(env.ADMIN_IDS),
    whitelistOnly: env.WHITELIST_ONLY === 'true',
  },

  security: {
    mcpTokenSecret: env.MCP_TOKEN_SECRET,
    a2aSecret: env.A2A_SECRET?.trim() || null,
    rateLimitPerMin: env.RATE_LIMIT_PER_MIN,
    dailySpendLimit: env.DAILY_SPEND_LIMIT,
    approvalTtlMin: env.APPROVAL_TTL_MIN,
  },

  ai: {
    baseUrl: env.AI_BASE_URL.replace(/\/+$/, ''),
    apiKey: env.AI_API_KEY?.trim() || null,
    model: env.AI_MODEL,
    temperature: env.AI_TEMPERATURE,
    maxTokens: env.AI_MAX_TOKENS,
  },

  features: {
    marketplace: env.ENABLE_MARKETPLACE === 'true',
    quests: env.ENABLE_QUESTS === 'true',
    referral: env.ENABLE_REFERRAL === 'true',
    bookings: env.ENABLE_BOOKINGS === 'true',
    radar: env.ENABLE_RADAR === 'true',
    autoReports: env.ENABLE_AUTO_REPORTS === 'true',
    reportTz: env.REPORT_TZ,
  },

  web: {
    corsOrigins: env.WEB_CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    /** Owner-level API key for the web dashboard (header: X-KIA-Key). */
    dashboardKey: env.DASHBOARD_KEY?.trim() || env.MCP_TOKEN_SECRET,
  },

  /** White-label identity. DB settings (brand_*) override these at runtime. */
  brand: {
    name: env.BRAND_NAME.trim() || 'KIA DropAgentX',
    tagline: env.BRAND_TAGLINE.trim(),
    footer: env.BRAND_FOOTER.trim(),
  },
} as const;

export type AppConfig = typeof config;

/** True if the given Telegram ID is an owner (super-admin). */
export function isOwnerTelegramId(telegramId: string | number): boolean {
  return config.access.ownerIds.includes(Number(telegramId));
}

/** True if the given Telegram ID is an admin or owner. */
export function isStaffTelegramId(telegramId: string | number): boolean {
  return config.access.ownerIds.includes(Number(telegramId)) || config.access.adminIds.includes(Number(telegramId));
}
