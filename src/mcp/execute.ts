import { lookup } from 'node:dns/promises';
import { TextDecoder } from 'util';
import type { CallContext, Role, ToolResult } from '../types';
import { db } from '../core/db';
import { logger } from '../core/logger';
import { AppError } from '../core/errors';
import { createApproval } from '../services/hitl.service';
import { runSecurityPipeline } from '../security';
import { verifyToolToken } from '../security/mcp-token';
import * as marketplace from '../services/marketplace.service';
import * as walletService from '../services/wallet.service';
import * as orderService from '../services/order.service';
import * as couponService from '../services/coupon.service';
import * as questService from '../services/quest.service';
import * as leaderboardService from '../services/leaderboard.service';
import * as referralService from '../services/referral.service';
import * as analyticsService from '../services/analytics.service';
import * as bookingService from '../services/booking.service';
import { notifyOwner } from '../services/notification.service';
import { deleteKnowledge, searchKnowledge, upsertKnowledge } from '../rag/knowledge.service';

/**
 * MCP tool execution boundary.
 *
 * Every tool call — from AI agents (bot), the web layer or A2A clients — goes
 * through executeTool(): the 15-layer security pipeline runs FIRST (fail-closed,
 * L15 audit always writes), then the tool dispatch table runs with light runtime
 * argument checks. Money is always integer. HITL tools (withdraw / refund /
 * broadcast) never execute inline — they file an Approval and return its id.
 */

// ── small runtime validators (light checks, services re-validate) ────────────

function asStr(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return null;
}

function asInt(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function intOr(v: unknown, fallback: number): number {
  const n = asInt(v);
  return n === null ? fallback : n;
}

function isStaffRole(role: Role): boolean {
  return role === 'admin' || role === 'owner';
}

function errOf(err: unknown): ToolResult {
  if (err instanceof AppError) {
    return { ok: false, error: err.code.toLowerCase(), message: err.message };
  }
  logger.error({ err }, '🔧 tool execution failed');
  return { ok: false, error: 'tool_failed' };
}

function noUser(): ToolResult {
  return { ok: false, error: 'unauthorized', message: 'user context required for this tool' };
}

function invalidArgs(message: string): ToolResult {
  return { ok: false, error: 'invalid_args', message };
}

// ── SSRF-safe HTTP fetch (shared with the cron radar job) ────────────────────

const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const UA = 'KIA-DropAgentX/1.0 (+https://github.com/kia-dropagentx)';

function isPrivateIpLiteral(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) {
    const h = ip.toLowerCase();
    return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true; // loopback / this-network / private
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === 'metadata.google.internal') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIpLiteral(h);
  return false;
}

export interface SafeFetchResult {
  ok: boolean;
  url?: string;
  status?: number;
  body?: string;
  error?: string;
}

/**
 * Fail-closed HTTP GET: http(s) only, private/loopback hosts blocked (literal
 * AND resolved IPs), 8s timeout, response size capped. Used by web_fetch and
 * the hourly radar cron job.
 */
export async function safeFetchText(rawUrl: string, maxBytes = DEFAULT_MAX_BYTES): Promise<SafeFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: 'bad_protocol' };
  if (isPrivateHost(parsed.hostname)) return { ok: false, error: 'private_host_blocked' };

  try {
    const addrs = await lookup(parsed.hostname, { all: true });
    for (const a of addrs) {
      if (isPrivateIpLiteral(a.address)) return { ok: false, error: 'private_host_blocked' };
    }
  } catch {
    return { ok: false, error: 'dns_failed' };
  }

  try {
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5' },
    });
    // Re-check after redirects — a public URL must not bounce into a private net.
    const finalHost = new URL(res.url).hostname;
    if (isPrivateHost(finalHost)) return { ok: false, error: 'private_host_blocked' };
    if (!res.ok) return { ok: false, url: res.url, status: res.status, error: `http_${res.status}` };

    const reader = res.body?.getReader();
    if (!reader) return { ok: true, url: res.url, status: res.status, body: '' };
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let body = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (body.length >= maxBytes) {
        void reader.cancel().catch(() => undefined);
        body = body.slice(0, maxBytes);
        break;
      }
    }
    body += decoder.decode();
    return { ok: true, url: res.url, status: res.status, body };
  } catch (err) {
    logger.debug({ err, url: parsed.toString() }, '🌐 safeFetchText failed');
    return { ok: false, error: 'fetch_failed' };
  }
}

// ── HTML helpers (shared with cron) ──────────────────────────────────────────

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Strip scripts/styles/tags and collapse whitespace into readable text. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim();
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1].replace(/<[^>]*>/g, '')).trim().slice(0, 300) : '';
}

// ── tool handlers ────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs, ctx: CallContext) => Promise<ToolResult>;

async function hProductCreate(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!isStaffRole(ctx.role)) return { ok: false, error: 'forbidden', message: 'product_create is staff-only' };
  if (!ctx.userId) return noUser();
  const title = asStr(args.title);
  const priceStars = asInt(args.priceStars);
  if (!title) return invalidArgs('title (string) is required');
  if (priceStars === null || priceStars <= 0) return invalidArgs('priceStars must be a positive integer');
  const priceCredits = asInt(args.priceCredits);
  const stock = asInt(args.stock);
  if (priceCredits !== null && priceCredits <= 0) return invalidArgs('priceCredits must be a positive integer');
  const product = await marketplace.createProduct(ctx.userId, {
    title,
    description: asStr(args.description) ?? undefined,
    category: asStr(args.category) ?? undefined,
    priceStars,
    priceCredits: priceCredits ?? undefined,
    stock: stock ?? undefined,
    aiGenerated: args.aiGenerated === true,
  });
  return { ok: true, data: product, message: `product created: ${product.title}` };
}

async function hProductList(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  const result = await marketplace.listProducts({
    perPage: Math.min(intOr(args.limit, 10), 50),
    includeAll: args.includeAll === true && isStaffRole(ctx.role),
  });
  return { ok: true, data: result, message: `${result.items.length} products` };
}

async function hProductSearch(args: ToolArgs): Promise<ToolResult> {
  const search = asStr(args.search) ?? asStr(args.query);
  if (!search) return invalidArgs('search (string) is required');
  const result = await marketplace.listProducts({ search, perPage: Math.min(intOr(args.limit, 10), 50) });
  return { ok: true, data: result, message: `${result.total} matches for "${search}"` };
}

async function hCouponCreate(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!isStaffRole(ctx.role)) return { ok: false, error: 'forbidden', message: 'coupon_create is staff-only' };
  const percentOff = asInt(args.percentOff);
  if (percentOff === null || percentOff < 1 || percentOff > 90) {
    return invalidArgs('percentOff must be an integer between 1 and 90');
  }
  const maxUses = asInt(args.maxUses);
  const coupon = await couponService.createCoupon({
    percentOff,
    maxUses: maxUses ?? undefined,
    code: asStr(args.code) ?? undefined,
    createdBy: ctx.userId ?? null,
  });
  return { ok: true, data: coupon, message: `coupon ${coupon.code} created (-${coupon.percentOff}%)` };
}

async function hOrderCreate(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const productId = asStr(args.productId) ?? asStr(args.listingId);
  if (!productId) return invalidArgs('productId (or listingId) is required');
  const qty = asInt(args.qty) ?? asInt(args.quantity) ?? 1;
  if (qty < 1) return invalidArgs('qty must be an integer >= 1');
  const result = await orderService.createOrder(ctx.userId, productId, {
    quantity: qty,
    couponCode: asStr(args.couponCode) ?? undefined,
    payWith: args.payWith === 'stars' ? 'stars' : 'credits',
  });
  const order = result.order;
  if (result.payment.method === 'stars_invoice') {
    return {
      ok: true,
      data: result,
      message: `order ${order.id} created — stars invoice for ${result.payment.amountStars}⭐`,
    };
  }
  return { ok: true, data: result, message: `order ${order.id} ${order.status} (paid with credits)` };
}

async function hOrderRefund(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const orderId = asStr(args.orderId);
  if (!orderId) return invalidArgs('orderId (string) is required');
  const reason = asStr(args.reason) ?? '';
  const res = await orderService.requestRefund(orderId, ctx.userId, reason);
  return {
    ok: true,
    data: res,
    pendingApprovalId: res.approvalId,
    message: 'refund filed for approval',
  };
}

async function hWalletGet(_args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const balance = await walletService.getBalance(ctx.userId);
  const history = await walletService.getHistory(ctx.userId, 10);
  return {
    ok: true,
    data: { balance, history: history.items, total: history.total },
    message: `balance: ${balance.credits} credits / ${balance.stars} stars`,
  };
}

async function hWalletTransfer(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const amount = asInt(args.amount);
  if (amount === null || amount <= 0) return invalidArgs('amount must be a positive integer');
  const toTelegramId = asStr(args.toTelegramId);
  const toUsername = asStr(args.toUsername);
  const target = toTelegramId
    ? await db.user.findUnique({ where: { telegramId: toTelegramId }, select: { id: true } })
    : toUsername
      ? await db.user.findFirst({ where: { username: toUsername.replace(/^@/, '') }, select: { id: true } })
      : null;
  if (!target) return { ok: false, error: 'not_found', message: 'recipient user not found' };
  const res = await walletService.transferCredits(ctx.userId, target.id, amount, asStr(args.note) ?? undefined);
  return { ok: true, data: res, message: `transferred ${amount} credits` };
}

async function hWithdrawRequest(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const amount = asInt(args.amount);
  if (amount === null || amount <= 0) return invalidArgs('amount must be a positive integer');
  const res = await walletService.requestWithdrawal(ctx.userId, amount);
  return {
    ok: true,
    data: res,
    pendingApprovalId: res.approvalId,
    message: 'withdrawal filed for owner approval',
  };
}

async function hKbSearch(args: ToolArgs): Promise<ToolResult> {
  const query = asStr(args.query) ?? asStr(args.q);
  if (!query) return invalidArgs('query (string) is required');
  const hits = await searchKnowledge(query, Math.min(intOr(args.limit, 5), 25));
  return {
    ok: true,
    data: hits.map(({ item, score }) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags: item.tags,
      score,
    })),
    message: `${hits.length} knowledge hits`,
  };
}

async function hKbUpsert(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!isStaffRole(ctx.role)) {
    return { ok: false, error: 'forbidden', message: 'kb_upsert is staff-only (governance data)' };
  }
  const title = asStr(args.title);
  const content = asStr(args.content);
  if (!title || !content) return invalidArgs('title and content (strings) are required');
  const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)) : undefined;
  const item = await upsertKnowledge({ title, content, tags, source: 'manual' });
  return { ok: true, data: item, message: `knowledge item "${item.title}" saved` };
}

async function hKbDelete(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!isStaffRole(ctx.role)) {
    return { ok: false, error: 'forbidden', message: 'kb_delete is staff-only (governance data)' };
  }
  const id = asStr(args.id);
  if (!id) return invalidArgs('id (string) is required');
  await deleteKnowledge(id);
  return { ok: true, data: { id, deleted: true }, message: 'knowledge item deleted' };
}

async function hQuestList(_args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (ctx.userId) {
    const views = await questService.listQuestsForUser(ctx.userId);
    return {
      ok: true,
      data: views.map((v) => ({
        id: v.quest.id,
        code: v.quest.code,
        title: v.quest.title,
        description: v.quest.description,
        type: v.quest.type,
        xpReward: v.quest.xpReward,
        creditReward: v.quest.creditReward,
        progress: v.progress,
        completed: v.completed,
        claimable: v.claimable,
      })),
      message: `${views.length} quests`,
    };
  }
  await questService.ensureDefaultQuests();
  const quests = await db.quest.findMany({ where: { active: true }, orderBy: [{ type: 'asc' }, { code: 'asc' }] });
  return { ok: true, data: quests, message: `${quests.length} quests` };
}

async function hLeaderboardGet(args: ToolArgs): Promise<ToolResult> {
  const board = asStr(args.board) ?? 'xp';
  const limit = Math.min(intOr(args.limit, 10), 100);
  const rows =
    board === 'sales'
      ? await leaderboardService.topBySales(limit)
      : board === 'ref'
        ? await leaderboardService.topByReferrals(limit)
        : await leaderboardService.topByXp(limit);
  return { ok: true, data: rows, message: `leaderboard ${board}: ${rows.length} rows` };
}

async function hReferralStats(_args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const stats = await referralService.getReferralStats(ctx.userId);
  return {
    ok: true,
    data: stats,
    message: `${stats.count} referrals — ${stats.totalEarned} credits earned`,
  };
}

async function hBroadcastRequest(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!isStaffRole(ctx.role)) return { ok: false, error: 'forbidden', message: 'broadcast_request is staff-only' };
  const text = asStr(args.text);
  if (!text) return invalidArgs('text (string) is required');
  const approval = await createApproval({
    type: 'broadcast',
    summary: `Broadcast: ${text.slice(0, 80)}`,
    riskLevel: 'high',
    toolName: 'broadcast_request',
    payload: { text, requestedBy: ctx.userId ?? null },
    requestedById: ctx.userId ?? null,
    requestedByTelegramId: ctx.telegramId ?? null,
  });
  return {
    ok: true,
    data: approval,
    pendingApprovalId: approval.id,
    message: 'broadcast queued for owner approval',
  };
}

async function hOwnerNotify(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!isStaffRole(ctx.role)) return { ok: false, error: 'forbidden', message: 'owner_notify is staff-only' };
  const text = asStr(args.text);
  if (!text) return invalidArgs('text (string) is required');
  notifyOwner(text.slice(0, 2000));
  return { ok: true, data: { sent: true }, message: 'owner notified' };
}

async function hBookingCreate(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const service = asStr(args.service);
  if (!service) return invalidArgs('service (string) is required');
  // Agents pass slotISO; the web/tools may pass slotAt or date+time — accept all.
  let slotISO = asStr(args.slotISO) ?? asStr(args.slotAt) ?? asStr(args.slot);
  if (!slotISO) {
    const date = asStr(args.date);
    const time = asStr(args.time);
    if (date && time) slotISO = `${date}T${time.trim()}Z`;
    else if (date) slotISO = `${date}T09:00:00.000Z`;
  }
  if (!slotISO) return invalidArgs('slotISO (or slotAt, or date+time) is required');
  const booking = await bookingService.createBooking(ctx.userId, service, slotISO, asStr(args.notes) ?? undefined);
  return {
    ok: true,
    data: booking,
    message: `booking confirmed: ${booking.service} at ${booking.slotAt.toISOString()}`,
  };
}

async function hBookingList(_args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!ctx.userId) return noUser();
  const items = await bookingService.listUserBookings(ctx.userId);
  return { ok: true, data: items, message: `${items.length} bookings` };
}

async function hWebFetch(args: ToolArgs): Promise<ToolResult> {
  const url = asStr(args.url);
  if (!url) return invalidArgs('url (string) is required');
  const r = await safeFetchText(url);
  if (!r.ok) {
    return { ok: false, error: 'fetch_failed', message: `web_fetch blocked or failed: ${r.error ?? 'unknown'}` };
  }
  const text = htmlToText(r.body ?? '');
  return {
    ok: true,
    data: { url: r.url, title: extractTitle(r.body ?? ''), text: text.slice(0, 2000), bytes: (r.body ?? '').length },
    message: 'fetched',
  };
}

async function hWebSearch(args: ToolArgs): Promise<ToolResult> {
  const query = asStr(args.query) ?? asStr(args.q);
  if (!query) return invalidArgs('query (string) is required');
  try {
    const r = await safeFetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    if (!r.ok) throw new Error(r.error ?? 'fetch failed');
    const results: Array<{ title: string; url: string }> = [];
    const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(r.body ?? '')) !== null && results.length < 5) {
      let href = m[1];
      const uddg = /[?&]uddg=([^&]+)/.exec(href);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (href.startsWith('//')) href = `https:${href}`;
      const title = decodeEntities(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
      if (title && href.startsWith('http')) results.push({ title, url: href });
    }
    if (results.length === 0) return { ok: false, error: 'web_search_unavailable' };
    return { ok: true, data: { query, results }, message: `${results.length} results` };
  } catch (err) {
    logger.debug({ err }, '🔍 web_search failed');
    return { ok: false, error: 'web_search_unavailable' };
  }
}

async function hAnalyticsReport(args: ToolArgs, ctx: CallContext): Promise<ToolResult> {
  if (!isStaffRole(ctx.role)) return { ok: false, error: 'forbidden', message: 'analytics_report is staff-only' };
  const days = Math.min(intOr(args.days, 7), 90);
  const [today, range] = await Promise.all([
    analyticsService.todaySnapshot(),
    analyticsService.rangeSnapshot(days),
  ]);
  return { ok: true, data: { days, today, range }, message: `snapshot (today + ${days}d range)` };
}

const HANDLERS: Record<string, ToolHandler> = {
  product_create: hProductCreate,
  product_list: hProductList,
  product_search: hProductSearch,
  coupon_create: hCouponCreate,
  order_create: hOrderCreate,
  order_refund: hOrderRefund,
  wallet_get: hWalletGet,
  wallet_transfer: hWalletTransfer,
  withdraw_request: hWithdrawRequest,
  kb_search: hKbSearch,
  kb_upsert: hKbUpsert,
  kb_delete: hKbDelete,
  quest_list: hQuestList,
  leaderboard_get: hLeaderboardGet,
  referral_stats: hReferralStats,
  broadcast_request: hBroadcastRequest,
  owner_notify: hOwnerNotify,
  booking_create: hBookingCreate,
  booking_list: hBookingList,
  web_fetch: hWebFetch,
  web_search: hWebSearch,
  analytics_report: hAnalyticsReport,
};

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Execute an MCP tool with the full security pipeline in front of it.
 * Unknown tools fail closed (L12). All money stays integer. HITL tools return
 * `pendingApprovalId` instead of executing.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: CallContext
): Promise<ToolResult> {
  try {
    // L12 — tool-token verification is REAL at this boundary: when a call
    // carries a token (external/A2A callers), it must be valid, unexpired and
    // scoped to THIS tool — otherwise fail closed.
    if (ctx.toolToken !== undefined && ctx.toolToken !== null) {
      const verdict = verifyToolToken(ctx.toolToken, toolName);
      if (!verdict.ok) {
        logger.warn({ toolName, reason: verdict.reason }, '🔐 L12 tool token rejected — fail closed');
        return { ok: false, error: 'unauthorized', message: `tool token rejected: ${verdict.reason}` };
      }
    }

    const pipeline = await runSecurityPipeline({
      telegramId: ctx.telegramId ?? null,
      userId: ctx.userId ?? null,
      role: ctx.role,
      source: ctx.source,
      // Layer context format expected by L04 RBAC + L11 HITL matchers (layers.ts).
      action: `mcp.tool:${toolName}`,
      text: JSON.stringify(args ?? {}).slice(0, 500),
      ip: ctx.ip ?? null,
    });
    if (!pipeline.allowed) {
      return { ok: false, error: 'blocked', message: `blocked by security pipeline: ${pipeline.blockReason}` };
    }

    const handler = HANDLERS[toolName];
    if (!handler) return { ok: false, error: 'unknown_tool', message: `unknown tool "${toolName}"` };

    return await handler(args ?? {}, ctx);
  } catch (err) {
    return errOf(err);
  }
}

/** Tool names exposed over MCP (mirrors src/agents/base.ts ALL_TOOLS). */
export const MCP_TOOLS: readonly string[] = Object.keys(HANDLERS);
