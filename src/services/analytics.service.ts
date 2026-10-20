import { db } from '../core/db';
import { logger } from '../core/logger';

/**
 * Owner-facing analytics. "Today" = last 24h UTC (simple + timezone-free).
 * All numbers are integers.
 */

export interface Snapshot {
  usersTotal: number;
  usersNewToday: number;
  ordersToday: number;
  revenueStarsToday: number;
  revenueCreditsToday: number;
  productsActive: number;
  approvalsPending: number;
  aiCallsToday: number;
  topProduct: { title: string; salesCount: number } | null;
}

const PAID_STATUSES = ['paid', 'delivered'] as const;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function todaySnapshot(): Promise<Snapshot> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const now = new Date();

  const [usersTotal, usersNewToday, ordersToday, revenue, productsActive, approvalsPending, aiCallsToday, topProduct] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: since } } }),
      db.order.count({ where: { createdAt: { gte: since } } }),
      db.order.aggregate({
        where: { createdAt: { gte: since }, status: { in: [...PAID_STATUSES] } },
        _sum: { totalStars: true, totalCredits: true },
      }),
      db.product.count({ where: { status: 'active' } }),
      db.approval.count({ where: { status: 'pending', expiresAt: { gt: now } } }),
      db.aiUsage.count({ where: { createdAt: { gte: since } } }),
      db.product.findFirst({
        where: { salesCount: { gt: 0 } },
        orderBy: { salesCount: 'desc' },
        select: { title: true, salesCount: true },
      }),
    ]);

  return {
    usersTotal,
    usersNewToday,
    ordersToday,
    revenueStarsToday: revenue._sum.totalStars ?? 0,
    revenueCreditsToday: revenue._sum.totalCredits ?? 0,
    productsActive,
    approvalsPending,
    aiCallsToday,
    topProduct: topProduct ? { title: topProduct.title, salesCount: topProduct.salesCount } : null,
  };
}

/**
 * The i18n module is owned by another agent and may not exist in every build
 * stage — resolve it lazily at runtime and fail soft to the EN header.
 */
interface I18nModule {
  t?: (lang: string, key: string, params?: Record<string, unknown>) => string;
}

function loadI18n(): I18nModule | null {
  try {
    const modulePath = '../i18n';
    // Non-literal require → not statically resolved by TS, resolved at runtime.
    const mod = require(modulePath) as I18nModule;
    return mod && typeof mod.t === 'function' ? mod : null;
  } catch {
    return null;
  }
}

function reportTitle(lang: string): string {
  try {
    const i18n = loadI18n();
    const title = i18n?.t ? i18n.t(lang, 'daily_report_title') : null;
    if (title) return title;
  } catch (err) {
    logger.debug({ err }, '🌍 i18n daily_report_title unavailable — using EN fallback');
  }
  return '📊 KIA DropAgentX — Daily Report';
}

export async function dailyReportText(lang = 'en'): Promise<string> {
  const s = await todaySnapshot();
  const lines: string[] = [
    reportTitle(lang),
    '',
    `👥 Users: ${s.usersTotal} (+${s.usersNewToday} in 24h)`,
    `🛒 Orders (24h): ${s.ordersToday}`,
    `💰 Revenue (24h): ${s.revenueStarsToday} ⭐ / ${s.revenueCreditsToday} credits`,
    `📦 Active products: ${s.productsActive}`,
    `🟡 Pending approvals: ${s.approvalsPending}`,
    `🤖 AI calls (24h): ${s.aiCallsToday}`,
    s.topProduct
      ? `🏆 Top product: ${s.topProduct.title} (${s.topProduct.salesCount} sales)`
      : '🏆 Top product: —',
  ];
  return lines.join('\n');
}

/** Last N days (UTC calendar days, oldest → newest) of orders/revenue. */
export async function rangeSnapshot(days = 7): Promise<Array<{ day: string; orders: number; revenueStars: number }>> {
  const n = Math.min(Math.max(Math.floor(days) || 7, 1), 90);
  const start = utcMidnight(new Date(Date.now() - (n - 1) * 24 * 3600 * 1000));

  const orders = await db.order.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true, totalStars: true, status: true },
  });

  const buckets = new Map<string, { orders: number; revenueStars: number }>();
  for (let i = 0; i < n; i++) {
    buckets.set(ymd(new Date(start.getTime() + i * 24 * 3600 * 1000)), { orders: 0, revenueStars: 0 });
  }
  for (const o of orders) {
    const bucket = buckets.get(ymd(o.createdAt));
    if (!bucket) continue;
    bucket.orders += 1;
    if (o.status === 'paid' || o.status === 'delivered') bucket.revenueStars += o.totalStars;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, orders: v.orders, revenueStars: v.revenueStars }));
}

export async function topProducts(
  limit = 5
): Promise<Array<{ title: string; salesCount: number; revenueCredits: number }>> {
  const take = Math.min(Math.max(Math.floor(limit) || 5, 1), 50);
  const products = await db.product.findMany({
    where: { salesCount: { gt: 0 } },
    orderBy: { salesCount: 'desc' },
    take,
    select: { title: true, salesCount: true, priceCredits: true },
  });
  return products.map((p) => ({
    title: p.title,
    salesCount: p.salesCount,
    revenueCredits: p.priceCredits * p.salesCount,
  }));
}
