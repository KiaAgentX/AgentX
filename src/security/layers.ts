import { db } from '../core/db';
import { logger } from '../core/logger';
import { config } from '../config';
import { toJson } from '../core/json';
import { getSetting } from '../services/settings.service';
import type { Role, Source } from '../types';
import { globalUserLimiter } from './rate-limiter';
import { detectPromptInjection } from './prompt-guard';
import { checkSpendQuota } from './quota';
import { seenBefore } from './idempotency';

/**
 * The KIA DropAgentX 15-layer security pipeline (Zenovix pattern).
 * Layers run in order 1..14 and stop at the FIRST block; L15 (Audit Trail)
 * always runs — logging must never be blocked. Any unexpected exception
 * inside a layer fails closed (block with reason `layer_error:<name>`).
 */

export interface LayerContext {
  telegramId?: string | null;
  userId?: string | null;
  role: Role;
  source: Source;
  /** e.g. 'bot.message', 'web.api:market', 'mcp.tool:order_create', 'a2a.tool.call' */
  action: string;
  /** User-provided text if any (sanitized in place by L05 when dirty). */
  text?: string;
  ip?: string | null;
  /** e.g. { amountCredits } for spend actions, { initData }, { nonce }, { idempotencyKey }. */
  meta?: Record<string, unknown>;
}

export interface LayerResult {
  layer: number;
  name: string;
  pass: boolean;
  action: 'allow' | 'block' | 'flag' | 'hitl';
  reason?: string;
}

export interface PipelineResult {
  allowed: boolean;
  results: LayerResult[];
  blockReason?: string;
  flagged: boolean;
}

export const SECURITY_LAYERS: ReadonlyArray<{ id: number; name: string; description: string }> = [
  { id: 1, name: 'L01 Whitelist Gate', description: 'When whitelist-only mode is on, non-staff must be known active users in the DB; everyone else is blocked.' },
  { id: 2, name: 'L02 Kill Switch', description: 'Panic mode (settings key panic_mode=true) locks the bot for everyone except owner/admin roles.' },
  { id: 3, name: 'L03 Rate Limit', description: 'Global sliding-window limiter keyed by telegramId ?? ip ?? anon; blocks floods with a retry-after hint.' },
  { id: 4, name: 'L04 RBAC', description: 'Action-to-role map: admin.* and sensitive mcp.tool:* require admin/owner; a2a.* passes but flags missing IP.' },
  { id: 5, name: 'L05 Input Sanitize', description: 'Rejects text over 4000 chars or containing null bytes; strips control chars (keeps \\n and \\t) in place.' },
  { id: 6, name: 'L06 Prompt Injection', description: 'Weighted injection heuristics: score >= 70 blocks non-staff, 40..69 flags for monitoring.' },
  { id: 7, name: 'L07 Schema Validation', description: 'Declarative marker layer — zod schemas are enforced at tool/API boundaries; records schema_enforced.' },
  { id: 8, name: 'L08 Webhook Signature', description: 'Bot webhook and A2A secrets are verified at the HTTP boundary; unverified A2A calls are flagged.' },
  { id: 9, name: 'L09 Anti-Replay', description: 'meta.nonce is claimed via the nonce store; duplicates are rejected as replays.' },
  { id: 10, name: 'L10 Spend Quota', description: 'Spend actions (meta.amountCredits) are checked against the per-user daily spend limit; staff unlimited.' },
  { id: 11, name: 'L11 HITL Gate', description: 'Dangerous actions (broadcast, withdraw, refund) require a human approval before execution.' },
  { id: 12, name: 'L12 Fail-Closed Tool Token', description: 'A2A/agent tool calls must carry an HMAC tool token verified at the MCP boundary (verified_at_boundary).' },
  { id: 13, name: 'L13 Output Redaction', description: 'Marker layer — agent/tool outputs pass through redact() before leaving the process.' },
  { id: 14, name: 'L14 Idempotency', description: 'meta.idempotencyKey is claimed once; duplicate keys are blocked to prevent double execution.' },
  { id: 15, name: 'L15 Audit Trail', description: 'Writes the final verdict to the AuditLog. Always passes — logging must never be blocked.' },
];

function layerName(id: number): string {
  return SECURITY_LAYERS[id - 1]?.name ?? `L${id}`;
}

function isStaff(role: Role): boolean {
  return role === 'admin' || role === 'owner';
}

// ── HITL policy ──────────────────────────────────────────────────────────────

const HITL_ACTIONS: ReadonlySet<string> = new Set([
  'mcp.tool:broadcast_request',
  'mcp.tool:withdraw_request',
  'mcp.tool:order_refund',
  'wallet.withdraw',
  'order.refund',
  'broadcast.send',
]);

/** Actions that ALWAYS require a human approval (HITL) before execution. */
export function requiresHitl(action: string): boolean {
  return HITL_ACTIONS.has(action);
}

// ── RBAC policy ──────────────────────────────────────────────────────────────

const MCP_STAFF_TOOLS: ReadonlySet<string> = new Set([
  'broadcast_request',
  'coupon_create',
  'analytics_report',
  'kb_upsert',
  'kb_delete',
  'owner_notify',
]);

// ── Audit ────────────────────────────────────────────────────────────────────

export async function writeAudit(
  actor: string,
  action: string,
  status: 'ok' | 'denied' | 'error',
  opts?: { target?: string; ip?: string | null; meta?: unknown }
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actor: actor.slice(0, 120),
        action: action.slice(0, 200),
        target: opts?.target != null ? String(opts.target).slice(0, 200) : null,
        status,
        ip: opts?.ip ?? null,
        meta: opts?.meta === undefined ? null : toJson(opts.meta),
      },
    });
  } catch (err) {
    // Audit failures must NEVER break the caller — log and move on.
    logger.error({ err, actor, action, status }, '📝 audit write failed (non-blocking)');
  }
}

// ── Layer implementations ────────────────────────────────────────────────────

function allow(id: number, reason: string): LayerResult {
  return { layer: id, name: layerName(id), pass: true, action: 'allow', reason };
}

function block(id: number, reason: string): LayerResult {
  return { layer: id, name: layerName(id), pass: false, action: 'block', reason };
}

function flag(id: number, reason: string): LayerResult {
  return { layer: id, name: layerName(id), pass: true, action: 'flag', reason };
}

async function l01WhitelistGate(ctx: LayerContext): Promise<LayerResult> {
  const id = 1;
  if (!config.access.whitelistOnly) return allow(id, 'whitelist_disabled');
  if (isStaff(ctx.role)) return allow(id, 'staff');
  if (ctx.source === 'system') return allow(id, 'internal_system');

  if (!ctx.telegramId && !ctx.userId) return block(id, 'no_identity');

  const user = ctx.userId
    ? await db.user.findUnique({ where: { id: ctx.userId }, select: { status: true } })
    : await db.user.findUnique({ where: { telegramId: String(ctx.telegramId) }, select: { status: true } });

  if (user && user.status === 'active') return allow(id, 'known_active_user');
  return block(id, 'not_whitelisted');
}

async function l02KillSwitch(ctx: LayerContext): Promise<LayerResult> {
  const id = 2;
  const panic = await getSetting('panic_mode', 'false');
  if (panic !== 'true') return allow(id, 'panic_off');
  if (isStaff(ctx.role)) return allow(id, 'panic_staff_bypass');
  return block(id, 'panic_mode_active');
}

function l03RateLimit(ctx: LayerContext): LayerResult {
  const id = 3;
  const key = ctx.telegramId ?? ctx.ip ?? 'anon';
  const decision = globalUserLimiter.hit(key);
  if (!decision.allowed) return block(id, `rate_limited:retry_after_${decision.retryAfterSec}s`);
  return allow(id, `within_limit:${key}`);
}

function l04Rbac(ctx: LayerContext): LayerResult {
  const id = 4;
  const action = ctx.action ?? '';

  if (action.startsWith('admin.') && !isStaff(ctx.role)) {
    return block(id, 'rbac_admin_required');
  }

  if (action.startsWith('mcp.tool:')) {
    const tool = action.slice('mcp.tool:'.length);
    if (MCP_STAFF_TOOLS.has(tool) && !isStaff(ctx.role)) {
      return block(id, `rbac_staff_tool_required:${tool}`);
    }
  }

  if (action.startsWith('a2a.')) {
    // The A2A shared secret itself is verified at the HTTP endpoint; here we
    // merely flag calls that arrive without any IP context for forensics.
    if (!ctx.ip) return flag(id, 'a2a_missing_ip');
    return allow(id, 'a2a_secret_checked_at_endpoint');
  }

  return allow(id, 'rbac_ok');
}

function l05InputSanitize(ctx: LayerContext): LayerResult {
  const id = 5;
  if (ctx.text == null || ctx.text.length === 0) return allow(id, 'no_text');

  if (ctx.text.length > 4000) return block(id, 'input_too_long');
  if (ctx.text.includes('\u0000')) return block(id, 'null_byte_rejected');

  // Strip control chars except \n (0x0A) and \t (0x09); also DEL (0x7F).
  // Sanitized text is written back onto the context so callers consume it.
  const cleaned = ctx.text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
  if (cleaned !== ctx.text) {
    ctx.text = cleaned;
    return allow(id, 'sanitized_control_chars_stripped');
  }
  return allow(id, 'text_clean');
}

function l06PromptInjection(ctx: LayerContext): LayerResult {
  const id = 6;
  if (!ctx.text) return allow(id, 'no_text');

  const verdict = detectPromptInjection(ctx.text);
  if (verdict.score >= 70 && !isStaff(ctx.role)) {
    return block(id, `prompt_injection_score_${verdict.score}:${verdict.matched.join('|')}`);
  }
  if (verdict.flagged) {
    return flag(id, `prompt_injection_score_${verdict.score}:${verdict.matched.join('|')}`);
  }
  return allow(id, 'clean_text');
}

function l07SchemaValidation(_ctx: LayerContext): LayerResult {
  // Zod validation happens at tool/API boundaries with concrete schemas;
  // this declarative layer records that the policy is enforced there.
  return allow(7, 'schema_enforced_at_boundaries');
}

function l08WebhookSignature(ctx: LayerContext): LayerResult {
  const id = 8;
  if (ctx.source === 'bot') return allow(id, 'verified_at_http_boundary');
  if (ctx.source === 'a2a') {
    if (ctx.meta?.secretVerified === true) return allow(id, 'a2a_secret_verified');
    return flag(id, 'a2a_secret_unverified');
  }
  return allow(id, 'not_applicable');
}

async function l09AntiReplay(ctx: LayerContext): Promise<LayerResult> {
  const id = 9;
  const nonce = ctx.meta?.nonce;
  if (typeof nonce === 'string' && nonce.length > 0) {
    const seen = await seenBefore(`replay:${nonce}`);
    if (seen) return block(id, 'replay_detected');
    return allow(id, 'nonce_claimed');
  }
  return allow(id, 'no_nonce');
}

async function l10SpendQuota(ctx: LayerContext): Promise<LayerResult> {
  const id = 10;
  const amount = ctx.meta?.amountCredits;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return allow(id, 'no_spend');

  if (!ctx.userId) return block(id, 'spend_without_user_identity');

  const quota = await checkSpendQuota(ctx.userId, amount);
  if (!quota.allowed) {
    return block(id, `daily_spend_limit_exceeded:${quota.spentToday}/${quota.limit}`);
  }
  return allow(id, `quota_ok:${quota.spentToday}/${quota.limit}`);
}

function l11HitlGate(ctx: LayerContext): LayerResult {
  const id = 11;
  if (requiresHitl(ctx.action)) {
    // Pipeline stays allowed; the caller MUST create an Approval (HITL) and
    // only execute the action after it is approved. Fail-closed at execution.
    return {
      layer: id,
      name: layerName(id),
      pass: true,
      action: 'hitl',
      reason: 'human_approval_required_before_execution',
    };
  }
  return allow(id, 'no_hitl_required');
}

function l12ToolToken(ctx: LayerContext): LayerResult {
  const id = 12;
  if (ctx.source === 'a2a' || ctx.source === 'agent') {
    // Actual token verification happens in mcp/execute via verifyToolToken();
    // this layer records the fail-closed contract marker.
    return allow(id, 'verified_at_boundary');
  }
  return allow(id, 'not_applicable');
}

function l13OutputRedaction(_ctx: LayerContext): LayerResult {
  // redact() from ./redaction is applied to every agent/tool output by the
  // agent layer before it is sent to Telegram / web / other agents.
  return allow(13, 'redaction_applied_by_agent_layer');
}

async function l14Idempotency(ctx: LayerContext): Promise<LayerResult> {
  const id = 14;
  const key = ctx.meta?.idempotencyKey;
  if (typeof key === 'string' && key.length > 0) {
    const seen = await seenBefore(`idem:${key}`);
    if (seen) return block(id, 'duplicate_idempotency_key');
    return allow(id, 'idempotency_key_claimed');
  }
  return allow(id, 'no_idempotency_key');
}

async function runLayer(id: number, ctx: LayerContext): Promise<LayerResult> {
  switch (id) {
    case 1: return l01WhitelistGate(ctx);
    case 2: return l02KillSwitch(ctx);
    case 3: return l03RateLimit(ctx);
    case 4: return l04Rbac(ctx);
    case 5: return l05InputSanitize(ctx);
    case 6: return l06PromptInjection(ctx);
    case 7: return l07SchemaValidation(ctx);
    case 8: return l08WebhookSignature(ctx);
    case 9: return l09AntiReplay(ctx);
    case 10: return l10SpendQuota(ctx);
    case 11: return l11HitlGate(ctx);
    case 12: return l12ToolToken(ctx);
    case 13: return l13OutputRedaction(ctx);
    case 14: return l14Idempotency(ctx);
    default: return block(id, 'unknown_layer');
  }
}

// ── Pipeline entry point ─────────────────────────────────────────────────────

export async function runSecurityPipeline(ctx: LayerContext): Promise<PipelineResult> {
  const results: LayerResult[] = [];
  let allowed = true;
  let blockReason: string | undefined;
  let flagged = false;

  for (let id = 1; id <= 14; id++) {
    if (!allowed) break; // stop at the first block
    let result: LayerResult;
    try {
      result = await runLayer(id, ctx);
    } catch (err) {
      logger.error({ err, layer: id, action: ctx.action }, '🛡 security layer threw — failing closed');
      result = block(id, `layer_error:${layerName(id)}`);
    }
    results.push(result);
    if (result.action === 'block') {
      allowed = false;
      blockReason = result.reason ?? `blocked_at_${result.name}`;
    } else if (result.action === 'flag') {
      flagged = true;
    }
  }

  // L15 — Audit Trail: always runs, even after a block; never blocks itself.
  const actor = ctx.telegramId ?? ctx.userId ?? ctx.source;
  await writeAudit(actor, ctx.action, allowed ? 'ok' : 'denied', {
    target: ctx.action,
    ip: ctx.ip,
    meta: { flagged, blockReason: blockReason ?? null, source: ctx.source, role: ctx.role },
  });
  results.push({ layer: 15, name: layerName(15), pass: true, action: 'allow', reason: allowed ? 'audit_written' : 'audit_written_denied' });

  return { allowed, results, blockReason, flagged };
}
