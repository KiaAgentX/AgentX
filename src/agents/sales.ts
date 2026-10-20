import { AGENTS, agentContext, makeSystemPrompt, traceOf } from './base';
import type { AgentDef, AgentRunInput, AgentRunOutput, AgentToolTrace } from './base';
import { executeTool } from '../mcp/execute';
import { redact } from '../security';
import { aiEnabled, chatComplete } from '../ai/provider';
import type { Product } from '@prisma/client';
import type { CallContext, ToolResult } from '../types';
import { logger } from '../core/logger';

/**
 * Sales 💼 — deterministic in-memory qualification state machine:
 *   need → budget → timeline → close
 * Buying signals jump straight to close. AI (when enabled) only wraps the questions
 * with the sales persona; the state machine itself never depends on the AI.
 */

export type SalesStep = 'need' | 'budget' | 'timeline' | 'close';

export interface SalesFlowState {
  step: SalesStep;
  data: Record<string, string>;
}

/** Module-level qualification state, keyed by internal user id. */
export const salesFlows: Map<string, SalesFlowState> = new Map();

/** Reset a user's sales qualification flow (for tests / staff commands). */
export function resetSalesFlow(userId: string): void {
  salesFlows.delete(userId);
}

const BUY_SIGNAL_RE =
  /\b(?:buy|purchase|order it|take it|checkout|invoice me)\b|خرید|میخرم|میخرم|купить|покупка|購入/i;

const QUESTIONS: Record<Exclude<SalesStep, 'close'>, string> = {
  need: '🛍️ Great — what kind of product or service are you looking for?',
  budget: '💰 Nice. What budget range do you have in mind (credits or Stars)?',
  timeline: '⏱️ When do you need it — right away, this week, or later?',
};

async function askWithPersona(
  def: AgentDef,
  input: AgentRunInput,
  state: SalesFlowState,
  fallback: string
): Promise<string> {
  if (!aiEnabled()) return fallback;
  try {
    const system = `${makeSystemPrompt(def, '', input.user.language)}\n\nSALES FLOW — current step "${state.step}". Known so far: ${JSON.stringify(state.data)}. Ask exactly ONE short qualification question for this step. Output only the question.`;
    const { text } = await chatComplete(
      [{ role: 'system', content: system }, { role: 'user', content: input.text || '…' }],
      { agent: 'sales', userId: input.user.id, maxTokens: 120, temperature: 0.7 }
    );
    return redact(text.trim()) || fallback;
  } catch {
    return fallback;
  }
}

async function closeFlow(
  input: AgentRunInput,
  ctx: CallContext,
  state: SalesFlowState,
  traces: AgentToolTrace[],
  def: AgentDef
): Promise<string> {
  const need = state.data.need ?? input.text;

  let productLines = '';
  const search = await executeTool('product_search', { search: need.slice(0, 120), limit: 3 }, ctx);
  traces.push(traceOf('product_search', search, 'product recommendations fetched'));
  if (search.ok && Array.isArray(search.data)) {
    const items = search.data as Product[];
    productLines = items
      .map(
        (p, i) =>
          `${i + 1}. ${p.title} — ${p.priceStars}⭐${p.priceCredits > 0 ? ` (${p.priceCredits}cr)` : ''}`
      )
      .join('\n');
  }

  const lead = `🤝 Sales lead (qualified): tg:${input.user.telegramId}${input.user.username ? ` @${input.user.username}` : ''} — need: "${state.data.need ?? '-'}" | budget: ${state.data.budget ?? 'n/a'} | timeline: ${state.data.timeline ?? 'n/a'}`;
  const notify = await executeTool('owner_notify', { text: lead.slice(0, 2000) }, ctx);
  traces.push(traceOf('owner_notify', notify, 'owner notified about the lead'));

  const fallbackText = productLines
    ? `🎯 Based on "${need}", here are my top picks:\n${productLines}\n\nWant me to start an order, or answer questions about any of these?`
    : `🎯 Thanks! I noted your need ("${need}"), budget (${state.data.budget ?? 'flexible'}) and timeline (${state.data.timeline ?? 'asap'}). The team has been notified and will follow up with the best options shortly.`;

  if (aiEnabled()) {
    try {
      const system = `${makeSystemPrompt(def, '', input.user.language)}\n\nThe lead just reached the CLOSE step. Write a short closing message: recommend the products (if any), propose ONE concrete next step (order / reservation / intro call). Under 120 words.`;
      const { text } = await chatComplete(
        [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ need, budget: state.data.budget ?? null, timeline: state.data.timeline ?? null, recommendations: productLines || 'none found' }) },
        ],
        { agent: 'sales', userId: input.user.id, maxTokens: 250, temperature: 0.6 }
      );
      if (text.trim()) return redact(text.trim());
    } catch {
      // keep deterministic close text
    }
  }
  return redact(fallbackText);
}

export async function runSales(input: AgentRunInput): Promise<AgentRunOutput> {
  const traces: AgentToolTrace[] = [];
  const def = AGENTS.sales;
  const ctx = agentContext(input, 'sales');
  try {
    const text = (input.text ?? '').trim();
    const buySignal = BUY_SIGNAL_RE.test(text);

    let state = salesFlows.get(input.user.id);
    if (!state) {
      state = { step: 'need', data: {} };
      salesFlows.set(input.user.id, state);
      if (buySignal || text.split(/\s+/).length > 2) state.data.need = text.slice(0, 300);
      state.step = buySignal ? 'close' : state.data.need ? 'budget' : 'need';
    } else if (buySignal) {
      if (!state.data.need) state.data.need = text.slice(0, 300);
      state.step = 'close';
    } else if (state.step === 'need') {
      state.data.need = text.slice(0, 300);
      state.step = 'budget';
    } else if (state.step === 'budget') {
      state.data.budget = text.slice(0, 120);
      state.step = 'timeline';
    } else if (state.step === 'timeline') {
      state.data.timeline = text.slice(0, 120);
      state.step = 'close';
    } else if (state.step === 'close' && text) {
      state.data.need = `${state.data.need} ${text}`.slice(0, 300);
    }

    if (state.step !== 'close') {
      const question = await askWithPersona(def, input, state, QUESTIONS[state.step]);
      return { text: question, agent: def.name, toolResults: traces, pendingApproval: false };
    }

    const closeText = await closeFlow(input, ctx, state, traces, def);
    return { text: closeText, agent: def.name, toolResults: traces, pendingApproval: false };
  } catch (err) {
    logger.warn({ err }, 'sales run failed');
    return {
      text: '🛍️ I can help you find the right product — tell me what you need!',
      agent: def.name,
      toolResults: traces,
      pendingApproval: false,
    };
  }
}
