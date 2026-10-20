import { aiEnabled, chatComplete } from '../ai/provider';
import { runSecurityPipeline } from '../security';
import type { PipelineResult } from '../security';
import { parseLooseJson } from './base';
import type { AgentRunInput, AgentRunOutput } from './base';
import { runReceptionist } from './receptionist';
import { runSales } from './sales';
import { runSupport } from './support';
import { runAnalyst } from './analyst';
import { runContent } from './content';
import { t } from '../i18n';
import type { AgentReply } from '../types';
import { logger } from '../core/logger';

/**
 * Orchestrator 🧠 — security gate first, then intent routing, then dispatch:
 *   runSecurityPipeline → routeIntent (AI classifier with keyword fallback) →
 *   specialist agent → AgentReply.
 * The orchestrator never answers domain questions itself and never throws.
 */

const CLASSIFIER_SYSTEM_PROMPT =
  'You are an intent classifier for the KIA DropAgentX Telegram marketplace. ' +
  'Classify the user message into exactly ONE agent: ' +
  '"receptionist" (greetings, bookings, appointments, FAQs, general chat), ' +
  '"sales" (buying, prices, selling, product questions), ' +
  '"support" (refunds, money back, problems, broken things, complaints), ' +
  '"analyst" (reports, stats, analytics, leaderboards), ' +
  '"content" (create/write a product listing or post). ' +
  'Reply ONLY with JSON: {"agent":"receptionist|sales|support|analyst|content"}.';

const VALID_AGENTS: ReadonlySet<string> = new Set(['receptionist', 'sales', 'support', 'analyst', 'content']);

/** Keyword rules (multi-language). Content markers are checked before the
 *  generic "product" keyword so "create product: …" reaches the content agent. */
const KEYWORD_ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bbook(?:ing|ings|s)?\b|\bappointment\b|نوبت|رزرو/i, 'receptionist'],
  [/\bcreate\b|\bwrite\b|\bpost\b|محصول بساز|بنویس/i, 'content'],
  [/\bbuy\b|\bprice\b|\bsell\b|\bproduct\b|خرید|قیمت|купить/i, 'sales'],
  [/\brefund\b|\bproblem\b|\bbroken\b|\bissue\b|مشکل|بازگشت/i, 'support'],
  [/\breport\b|\bstats\b|\banalytics\b|گزارش|آمار/i, 'analyst'],
];

function isStaffRole(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function keywordRoute(text: string): string {
  const lower = (text ?? '').toLowerCase();
  for (const [re, agent] of KEYWORD_ROUTES) {
    if (re.test(lower)) return agent;
  }
  return 'receptionist';
}

/** Classify intent: AI classifier when available, deterministic keywords otherwise. */
export async function routeIntent(text: string, ctx: { language: string }): Promise<{ agent: string; reason: string }> {
  const raw = (text ?? '').trim();
  if (aiEnabled() && raw.length > 0) {
    try {
      const { text: reply } = await chatComplete(
        [
          { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: raw.slice(0, 500) },
        ],
        { json: true, maxTokens: 60, agent: 'orchestrator' }
      );
      const parsed = parseLooseJson<{ agent?: unknown }>(reply);
      const agent = typeof parsed?.agent === 'string' ? parsed.agent.trim().toLowerCase() : '';
      if (VALID_AGENTS.has(agent)) return { agent, reason: 'ai' };
    } catch {
      // AI offline or bad output — fall through to keyword rules.
    }
  }
  const agent = keywordRoute(raw);
  return { agent, reason: 'keywords' };
}

function blockedReply(pipeline: PipelineResult, language: string): AgentReply {
  const blocked = pipeline.results.find((r) => r.action === 'block');
  const haystack = `${pipeline.blockReason ?? ''} ${blocked?.reason ?? ''} ${blocked?.name ?? ''}`.toLowerCase();
  if (haystack.includes('rate_limited')) {
    return { text: t(language, 'rate_limited', { seconds: 60 }), keyboardHint: null };
  }
  if (haystack.includes('panic')) {
    return { text: t(language, 'panic_mode'), keyboardHint: null };
  }
  if (haystack.includes('whitelist') || haystack.includes('no_identity')) {
    return { text: t(language, 'not_whitelisted'), keyboardHint: null };
  }
  return { text: t(language, 'error_generic'), keyboardHint: null };
}

async function dispatch(agent: string, input: AgentRunInput): Promise<AgentRunOutput> {
  switch (agent) {
    case 'sales':
      return runSales(input);
    case 'support':
      return runSupport(input);
    case 'analyst':
      return runAnalyst(input);
    case 'content':
      return runContent(input);
    case 'receptionist':
    default:
      return runReceptionist(input);
  }
}

/** Security-gated entry point used by the bot/web layers. Never throws. */
export async function handleUserMessage(input: AgentRunInput): Promise<AgentReply> {
  const language = input.user.language || 'en';
  try {
    // 1) Security pipeline (15 layers, fail-closed).
    const pipeline = await runSecurityPipeline({
      telegramId: input.user.telegramId,
      userId: input.user.id,
      role: input.user.role,
      source: input.source,
      action: 'agent.message',
      text: input.text,
    });
    if (!pipeline.allowed) return blockedReply(pipeline, language);

    // 2) Intent routing + dispatch (analyst downgrades to receptionist for non-staff).
    const route = await routeIntent(input.text ?? '', { language });
    const agent = route.agent === 'analyst' && !isStaffRole(input.user.role) ? 'receptionist' : route.agent;

    let out: AgentRunOutput;
    try {
      out = await dispatch(agent, input);
    } catch (err) {
      logger.warn({ err, agent, routedReason: route.reason }, 'agent dispatch failed');
      return { text: t(language, 'error_generic'), keyboardHint: null };
    }

    // 3) Map AgentRunOutput → AgentReply.
    return {
      text: out.text,
      keyboardHint: null,
      pendingApproval: out.pendingApproval,
      meta: { agent: out.agent, toolResults: out.toolResults },
    };
  } catch (err) {
    logger.warn({ err }, 'handleUserMessage failed');
    return { text: t(language, 'error_generic'), keyboardHint: null };
  }
}
