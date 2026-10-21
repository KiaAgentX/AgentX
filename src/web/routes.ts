import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Approval } from '@prisma/client';
import { config } from '../config';
import { db } from '../core/db';
import { logger } from '../core/logger';
import { AppError, NotFoundError, ValidationError } from '../core/errors';
import { safeEqualString } from '../core/crypto';
import { createApproval, listPending, resolveApproval } from '../services/hitl.service';
import { getAllSettings, setSetting } from '../services/settings.service';
import * as marketplace from '../services/marketplace.service';
import * as orderService from '../services/order.service';
import * as questService from '../services/quest.service';
import * as leaderboardService from '../services/leaderboard.service';
import * as crm from '../services/crm.service';
import { getBrand } from '../services/settings.service';
import { SECURITY_LAYERS_DOC } from '../security';
import { mintStreamToken } from '../security/stream-token';
import { SlidingWindowRateLimiter } from '../security/rate-limiter';
import type { PendingApprovalView } from '../types';

/**
 * /api/v1 REST API — implements docs/API.md exactly.
 * Responses: {ok:true, data} | {ok:false, error:"code"}. 🔒 endpoints require
 * the X-KIA-Key header (config.web.dashboardKey). Unknown params are ignored;
 * errors are mapped from typed AppErrors to HTTP codes.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown): void {
  res.json({ ok: true, data });
}

function fail(res: Response, code: string, status: number): void {
  res.status(status).json({ ok: false, error: code });
}

/** Brute-force budget: 15 failed auth attempts per IP per minute → 429. */
const authFailLimiter = new SlidingWindowRateLimiter(15, 60_000);

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Timing-safe dashboard key check + per-IP lockout on repeated failures. */
function requireKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('X-KIA-Key') ?? '';
  if (!key || !safeEqualString(key, config.web.dashboardKey)) {
    const gate = authFailLimiter.hit(`auth:${clientIp(req)}`);
    if (!gate.allowed) {
      res.set('Retry-After', String(gate.retryAfterSec));
      fail(res, 'rate_limited', 429);
      return;
    }
    fail(res, 'unauthorized', 401);
    return;
  }
  // A correct key clears the failure history for this IP.
  authFailLimiter.resetKey(`auth:${clientIp(req)}`);
  next();
}

/** Express 5 types route params as `string | string[]` (repeated/regex segments) — take the first. */
const param1 = (v: string | string[]): string => (Array.isArray(v) ? (v[0] ?? '') : v);

/** Async handler wrapper → typed error → HTTP mapping (fail-closed 500). */
function wrap(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, _next) => {
    handler(req, res).catch((err) => {
      if (err instanceof AppError) {
        fail(res, err.code.toLowerCase(), err.httpStatus);
        return;
      }
      logger.error({ err, path: req.path, method: req.method }, '💥 api handler failed');
      fail(res, 'internal', 500);
    });
  };
}

function qStr(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim().length > 0) return v[0].trim();
  return null;
}

function qInt(v: unknown, fallback: number, min: number, max: number): number {
  const raw = qStr(v);
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function bodyObj(req: Request): Record<string, unknown> {
  return typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
}

function bStr(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function bInt(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isInteger(Number(v))) return Number(v);
  return null;
}

function toApprovalView(a: Approval): PendingApprovalView {
  return {
    id: a.id,
    type: a.type,
    summary: a.summary,
    riskLevel: a.riskLevel,
    toolName: a.toolName,
    expiresAt: a.expiresAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * The dashboard key carries no user identity; product writes need a seller.
 * Resolve the first owner (fallback: first admin) as the acting staff user.
 */
async function staffActorId(): Promise<string> {
  const owner = await db.user.findFirst({ where: { role: 'owner' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (owner) return owner.id;
  const admin = await db.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (admin) return admin.id;
  throw new NotFoundError('Staff user (create the owner first — run scripts/seed.ts)');
}

/**
 * Public product projection — delivery payloads are PAID SECRET CONTENT and
 * must never leave the server through a public endpoint. Only whitelisted
 * columns are exposed (also hides sellerId / aiGenerated internals).
 */
function toPublicProduct(p: {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priceStars: number;
  priceCredits: number;
  stock: number;
  salesCount: number;
  featured: boolean;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    priceStars: p.priceStars,
    priceCredits: p.priceCredits,
    stock: p.stock,
    salesCount: p.salesCount,
    featured: p.featured,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    createdAt: p.createdAt.toISOString(),
  };
}

const PRODUCT_STATUSES = ['draft', 'active', 'archived', 'flagged'];
const PAID_STATUSES = ['paid', 'delivered', 'completed'];

// ── router ───────────────────────────────────────────────────────────────────

export function createApiRouter(): Router {
  const router = Router();

  // ── White-label brand (public — the PWA rebrands itself from this) ──────
  router.get(
    '/brand',
    wrap(async (_req, res) => {
      ok(res, await getBrand());
    })
  );

  // ── System: overview (owner data — revenue, buyers, approvals) ──────────────
  router.get(
    '/overview',
    requireKey,
    wrap(async (_req, res) => {
      const since24h = new Date(Date.now() - 24 * 3600 * 1000);
      const since14d = new Date(Date.now() - 13 * 24 * 3600 * 1000);
      const start14 = new Date(Date.UTC(since14d.getUTCFullYear(), since14d.getUTCMonth(), since14d.getUTCDate()));

      const [users, products, orders, revenue, pendingApprovals, aiCalls, orderRows, productPage, recent] =
        await Promise.all([
          db.user.count(),
          db.product.count({ where: { status: 'active' } }),
          db.order.count(),
          db.order.aggregate({ where: { status: { in: ['paid', 'delivered'] } }, _sum: { totalStars: true, totalCredits: true } }),
          listPending(50),
          db.aiUsage
            .count({ where: { createdAt: { gte: since24h } } })
            .catch(() => 0),
          db.order.findMany({ where: { createdAt: { gte: start14 } }, select: { createdAt: true, totalStars: true, status: true } }),
          marketplace.listProducts({ perPage: 50 }),
          db.order.findMany({
            orderBy: { createdAt: 'desc' },
            take: 8,
            include: { product: { select: { title: true } }, buyer: { select: { firstName: true, username: true } } },
          }),
        ]);

      // 14 UTC-day buckets, oldest → newest.
      const buckets = new Map<string, { orders: number; revenue: number }>();
      for (let i = 0; i < 14; i += 1) {
        const day = new Date(start14.getTime() + i * 24 * 3600 * 1000).toISOString().slice(0, 10);
        buckets.set(day, { orders: 0, revenue: 0 });
      }
      for (const o of orderRows) {
        const bucket = buckets.get(o.createdAt.toISOString().slice(0, 10));
        if (!bucket) continue;
        if (PAID_STATUSES.includes(o.status)) {
          bucket.orders += 1;
          bucket.revenue += o.totalStars;
        }
      }

      const topProducts = [...productPage.items]
        .sort((a, b) => b.salesCount - a.salesCount)
        .slice(0, 5)
        .map((p) => ({ id: p.id, title: p.title, salesCount: p.salesCount }));

      const recentOrders = recent.map((o) => ({
        id: o.id,
        title: o.product.title,
        totalStars: o.totalStars,
        totalCredits: o.totalCredits,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        buyer: o.buyer.firstName || o.buyer.username || null,
      }));

      ok(res, {
        brand: await getBrand(),
        users,
        products,
        orders,
        revenueStars: revenue._sum.totalStars ?? 0,
        revenueCredits: revenue._sum.totalCredits ?? 0,
        pendingApprovals: pendingApprovals.length,
        aiCalls,
        series: Array.from(buckets.entries()).map(([date, v]) => ({ date, orders: v.orders, revenue: v.revenue })),
        topProducts,
        recentOrders,
      });
    })
  );

  // ── Marketplace ────────────────────────────────────────────────────────────
  router.get(
    '/products',
    wrap(async (req, res) => {
      const limit = qInt(req.query.limit, 10, 1, 50);
      const offset = qInt(req.query.offset, 0, 0, 100_000);
      const page = Math.floor(offset / limit) + 1;
      const result = await marketplace.listProducts({
        page,
        perPage: limit,
        search: qStr(req.query.q) ?? undefined,
        category: qStr(req.query.category) ?? undefined,
      });
      ok(res, { items: result.items.map(toPublicProduct), total: result.total });
    })
  );

  // ── SSE stream token (X-KIA-Key protected; EventSource cannot send headers)
  router.post(
    '/stream-token',
    requireKey,
    wrap(async (_req, res) => {
      ok(res, mintStreamToken());
    })
  );

  router.post(
    '/products',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const title = bStr(body, 'title');
      const priceStars = bInt(body, 'priceStars');
      if (!title) throw new ValidationError('title is required');
      if (priceStars === null || priceStars <= 0) throw new ValidationError('priceStars must be a positive integer');
      const stock = bInt(body, 'stock');
      const priceCredits = bInt(body, 'priceCredits');
      if (priceCredits !== null && priceCredits <= 0) throw new ValidationError('priceCredits must be a positive integer');

      const actor = await staffActorId();
      const item = await marketplace.createProduct(actor, {
        title,
        description: bStr(body, 'description') ?? undefined,
        category: bStr(body, 'category') ?? undefined,
        priceStars,
        priceCredits: priceCredits ?? undefined,
        stock: stock ?? undefined,
      });
      if (body.featured === true) {
        await marketplace.toggleFeatured(item.id, true);
      }
      ok(res, { item });
    })
  );

  router.patch(
    '/products/:id',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const patch: Parameters<typeof marketplace.updateProduct>[2] = {};
      if (bStr(body, 'title') !== null) patch.title = bStr(body, 'title') as string;
      if (body.description !== undefined) patch.description = bStr(body, 'description') ?? '';
      if (bStr(body, 'category') !== null) patch.category = bStr(body, 'category') as string;
      const priceStars = bInt(body, 'priceStars');
      if (priceStars !== null) patch.priceStars = priceStars;
      const priceCredits = bInt(body, 'priceCredits');
      if (priceCredits !== null) patch.priceCredits = priceCredits;
      const stock = bInt(body, 'stock');
      if (stock !== null) patch.stock = stock;
      const status = bStr(body, 'status');
      if (status !== null) {
        if (!PRODUCT_STATUSES.includes(status)) throw new ValidationError(`status must be one of: ${PRODUCT_STATUSES.join(', ')}`);
        patch.status = status;
      }
      if (body.active !== undefined) {
        patch.status = body.active === true ? 'active' : 'archived';
      }

      const actor = await staffActorId();
      const item = await marketplace.updateProduct(param1(req.params.id), actor, patch);
      ok(res, { item });
    })
  );

  router.delete(
    '/products/:id',
    requireKey,
    wrap(async (req, res) => {
      const actor = await staffActorId();
      const item = await marketplace.archiveProduct(param1(req.params.id), actor);
      ok(res, { item });
    })
  );

  // ── Orders ─────────────────────────────────────────────────────────────────
  router.get(
    '/orders',
    requireKey,
    wrap(async (req, res) => {
      const limit = qInt(req.query.limit, 20, 1, 100);
      const offset = qInt(req.query.offset, 0, 0, 1_000_000);
      const status = qStr(req.query.status);
      const where = status ? { status } : {};
      const [items, total] = await Promise.all([
        db.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            product: { select: { id: true, title: true, sellerId: true } },
            buyer: { select: { id: true, firstName: true, username: true } },
          },
        }),
        db.order.count({ where }),
      ]);
      ok(res, { items, total });
    })
  );

  router.post(
    '/orders/:id/status',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const action = bStr(body, 'action');
      if (action !== 'deliver' && action !== 'cancel' && action !== 'refund') {
        throw new ValidationError('action must be "deliver", "cancel" or "refund"');
      }
      const orderId = param1(req.params.id);
      const staffId = await staffActorId();

      if (action === 'deliver') {
        const item = await orderService.deliverOrder(orderId, undefined, staffId);
        ok(res, { item });
        return;
      }
      if (action === 'cancel') {
        const item = await orderService.cancelOrder(orderId, staffId);
        ok(res, { item });
        return;
      }

      // refund → HITL: file an approval on behalf of the buyer (fail-closed).
      const order = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true } });
      if (!order) throw new NotFoundError('Order');
      const reason = bStr(body, 'reason') ?? bStr(body, 'note') ?? 'dashboard refund request';
      const filed = await orderService.requestRefund(orderId, order.buyerId, reason);
      ok(res, { item: { id: orderId, status: 'pending', pendingApprovalId: filed.approvalId }, pendingApprovalId: filed.approvalId });
    })
  );

  // ── Wallets & Users ────────────────────────────────────────────────────────
  router.get(
    '/wallets',
    requireKey,
    wrap(async (req, res) => {
      const limit = qInt(req.query.limit, 20, 1, 100);
      const rows = await db.wallet.findMany({
        take: limit,
        orderBy: { credits: 'desc' },
        include: { user: { select: { firstName: true, username: true, role: true } } },
      });
      ok(res, {
        items: rows.map((w) => ({
          userId: w.userId,
          name: w.user.firstName,
          username: w.user.username,
          role: w.user.role,
          balance: w.credits,
          locked: w.frozen,
          credits: w.credits,
          stars: w.stars,
        })),
      });
    })
  );

  router.get(
    '/users',
    requireKey,
    wrap(async (req, res) => {
      const limit = qInt(req.query.limit, 50, 1, 200);
      const rows = await db.user.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, username: true, role: true, language: true, createdAt: true },
      });
      ok(res, {
        items: rows.map((u) => ({
          id: u.id,
          name: u.firstName,
          username: u.username,
          role: u.role,
          language: u.language,
          createdAt: u.createdAt.toISOString(),
        })),
      });
    })
  );

  // ── Engagement ─────────────────────────────────────────────────────────────
  router.get(
    '/quests',
    wrap(async (_req, res) => {
      // Read-only: defaults are seeded once at boot (src/index.ts) — writing on
      // every GET caused latency, write-amplification and reset custom titles.
      const quests = await db.quest.findMany({ where: { active: true }, orderBy: [{ type: 'asc' }, { code: 'asc' }] });
      ok(res, {
        items: quests.map((q) => ({
          id: q.id,
          code: q.code,
          title: q.title,
          description: q.description,
          reward: q.creditReward,
          xpReward: q.xpReward,
          type: q.type,
          active: q.active,
        })),
      });
    })
  );

  router.get(
    '/leaderboard',
    wrap(async (req, res) => {
      const type = qStr(req.query.type);
      const board = type === 'sales' || type === 'ref' ? type : 'xp';
      const limit = qInt(req.query.limit, 10, 1, 100);
      const rows =
        board === 'sales'
          ? await leaderboardService.topBySales(limit)
          : board === 'ref'
            ? await leaderboardService.topByReferrals(limit)
            : await leaderboardService.topByXp(limit);
      const valueKey = board === 'xp' ? 'xp' : board === 'sales' ? 'sales' : 'refs';
      ok(res, {
        items: rows.map((r, i) => ({ rank: i + 1, name: r.displayName, value: r.value, [valueKey]: r.value })),
      });
    })
  );

  router.get(
    '/bookings',
    requireKey,
    wrap(async (req, res) => {
      const limit = qInt(req.query.limit, 50, 1, 200);
      const items = await db.booking.findMany({
        orderBy: { slotAt: 'asc' },
        take: limit,
        include: { user: { select: { id: true, firstName: true, username: true, telegramId: true } } },
      });
      ok(res, { items });
    })
  );

  router.get(
    '/radar',
    requireKey,
    wrap(async (_req, res) => {
      const items = await db.radarFinding.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
      ok(res, { items });
    })
  );

  // ── Lead CRM (owner) ────────────────────────────────────────────────────────
  router.get(
    '/leads',
    requireKey,
    wrap(async (req, res) => {
      const limit = qInt(req.query.limit, 25, 1, 100);
      const offset = qInt(req.query.offset, 0, 0, 100_000);
      const result = await crm.listLeads({
        stage: qStr(req.query.stage) ?? undefined,
        q: qStr(req.query.q) ?? undefined,
        limit,
        offset,
      });
      ok(res, { items: result.items, total: result.total });
    })
  );

  router.get(
    '/leads/stats',
    requireKey,
    wrap(async (_req, res) => {
      ok(res, await crm.leadStats());
    })
  );

  router.post(
    '/leads',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      if (bStr(body, 'contact') === null) throw new ValidationError('contact is required');
      const input = {
        contact: bStr(body, 'contact') as string,
        name: bStr(body, 'name') ?? undefined,
        company: bStr(body, 'company') ?? undefined,
        stage: bStr(body, 'stage') ?? undefined,
        score: bInt(body, 'score') ?? undefined,
        notes: bStr(body, 'notes') ?? undefined,
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : bStr(body, 'tags') ?? undefined,
      };
      const { lead, created } = await crm.addLead(input, 'dashboard');
      ok(res, { item: lead, created });
    })
  );

  router.post(
    '/leads/import',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const source = bStr(body, 'source') ?? 'dashboard';
      ok(res, await crm.importLeads(body.rows ?? body.leads ?? body, source));
    })
  );

  router.post(
    '/leads/:id/stage',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const stage = bStr(body, 'stage');
      if (stage === null) throw new ValidationError('stage is required');
      ok(res, { item: await crm.moveStage(param1(req.params.id), stage, bStr(body, 'note') ?? undefined) });
    })
  );

  // ── Owner: governance & ops ────────────────────────────────────────────────
  router.get(
    '/approvals',
    requireKey,
    wrap(async (req, res) => {
      const status = qStr(req.query.status) ?? 'pending';
      if (status === 'pending') {
        const rows = await listPending(50);
        ok(res, { items: rows.map(toApprovalView) });
        return;
      }
      const rows = await db.approval.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 50 });
      ok(res, { items: rows.map(toApprovalView) });
    })
  );

  router.post(
    '/approvals/:id/decide',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const approve = body.approve === true || body.approve === 'true';
      const reject = body.approve === false || body.approve === 'false';
      if (!approve && !reject) throw new ValidationError('approve (boolean) is required');

      // resolveApproval signature is (id, decision, deciderTelegramId) — the
      // dashboard has no telegram id, so it decides as "dashboard".
      const updated = await resolveApproval(param1(req.params.id), approve ? 'approved' : 'rejected', 'dashboard');
      if (!updated) {
        fail(res, 'already_resolved', 409);
        return;
      }
      const note = bStr(body, 'note');
      if (note) {
        try {
          await db.approval.update({ where: { id: updated.id }, data: { resultNote: note.slice(0, 300) } });
        } catch (err) {
          logger.warn({ err, approvalId: updated.id }, '📝 approval resultNote write failed (non-fatal)');
        }
      }
      ok(res, { item: toApprovalView(updated) });
    })
  );

  router.get(
    '/settings',
    requireKey,
    wrap(async (_req, res) => {
      const all = await getAllSettings();
      ok(res, { items: Object.entries(all).map(([key, value]) => ({ key, value })) });
    })
  );

  router.put(
    '/settings',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const key = bStr(body, 'key');
      const value = body.value;
      if (!key) throw new ValidationError('key is required');
      if (value === undefined || value === null || typeof value === 'object') {
        throw new ValidationError('value (string) is required');
      }
      const item = await setSetting(key, String(value));
      ok(res, { item });
    })
  );

  router.post(
    '/broadcast',
    requireKey,
    wrap(async (req, res) => {
      const body = bodyObj(req);
      const text = bStr(body, 'text');
      if (!text) throw new ValidationError('text is required');
      const item = await createApproval({
        type: 'broadcast',
        // Full text in the card (400-char summary limit) — the owner must be
        // able to see exactly what they are approving.
        summary: `📣 Broadcast: ${text.slice(0, 360)}${text.length > 360 ? '…' : ''}`,
        riskLevel: 'high',
        toolName: 'broadcast_request',
        payload: { text, requestedBy: 'dashboard' },
        requestedById: null,
        requestedByTelegramId: null,
      });
      ok(res, { item: toApprovalView(item) });
    })
  );

  router.get(
    '/security',
    requireKey,
    wrap(async (_req, res) => {
      const audit = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
      ok(res, { layers: SECURITY_LAYERS_DOC, audit });
    })
  );

  return router;
}
