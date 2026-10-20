import { AGENTS, agentContext, kbGroundedAnswer, traceFromResult } from './base';
import type { AgentRunInput, AgentRunOutput, AgentToolTrace } from './base';
import { executeTool } from '../mcp/execute';
import { redact } from '../security';
import { logger } from '../core/logger';

/**
 * Support 🛟 — deterministic rule layer first (works with AI disabled):
 * 1. refund intent + order id → order_refund (creates a HITL approval, never refunds directly)
 * 2. refund intent without order id → refund policy from the knowledge base + /orders pointer
 * 3. bug / complaint → owner_notify escalation + reassurance
 * 4. everything else → knowledge-grounded support answer
 * Every reply is redacted; the function never throws.
 */

const REFUND_RE =
  /\brefund\b|\bmoney\s*back\b|بازگشت\s*پول|پس\s*دادن|возврат|طلب\s*استرداد|استرداد/i;

const BUG_RE =
  /\bbugs?\b|\bcomplaints?\b|\bbroken\b|\bissues?\b|\bproblems?\b|\berror\b|\bcrash(?:ed|ing)?\b|\bnot\s+working\b|مشکل|خرابی|شکایت|خطا|баг|жалоб|ошибк|не\s+работает/i;

/**
 * Order-id-like token: 6+ alphanumeric chars appearing right after
 * "order" (with optional separators) or after "#". Tokens containing a
 * digit are preferred over pure words to reduce false positives.
 */
function extractOrderId(text: string): string | null {
  const re = /(?:\border\b|#)[\s:#_-]*([a-zA-Z0-9][a-zA-Z0-9_-]{5,})/gi;
  const candidates: string[] = [];
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    candidates.push(match[1]);
    if (candidates.length >= 10) break;
    match = re.exec(text);
  }
  if (candidates.length === 0) return null;
  return candidates.find((token) => /\d/.test(token)) ?? candidates[0];
}

function refundFiledText(orderId: string, pendingApprovalId: string | undefined): string {
  const ticket = pendingApprovalId ? ` (ticket #${String(pendingApprovalId).slice(0, 8)})` : '';
  return (
    `🛟 Your refund request for order ${orderId} has been filed for owner approval${ticket}. ` +
    'I know waiting is no fun — you will be notified as soon as it is reviewed. ' +
    'You can check the status anytime via /orders.'
  );
}

export async function runSupport(input: AgentRunInput): Promise<AgentRunOutput> {
  const traces: AgentToolTrace[] = [];
  const def = AGENTS.support;
  const ctx = agentContext(input, 'support');
  try {
    const text = (input.text ?? '').trim();

    // 1) Refund intent
    if (REFUND_RE.test(text)) {
      const orderId = extractOrderId(text);

      if (orderId) {
        const result = await executeTool(
          'order_refund',
          { orderId, reason: text.slice(0, 300) },
          ctx
        );
        const pending = traceFromResult(traces, 'order_refund', result, 'refund request filed for owner approval');
        const reply = result.ok
          ? refundFiledText(orderId, result.pendingApprovalId)
          : `⚠️ I could not file the refund request for order ${orderId} (${
              result.error ?? 'unknown reason'
            }). Please double-check the order id in /orders — or tell me what happened and I will escalate it to the owner.`;
        return {
          text: redact(reply),
          agent: def.name,
          toolResults: traces,
          pendingApproval: pending,
        };
      }

      const policy = await kbGroundedAnswer(def, input, {
        knowledgeQuery: `refund policy ${text.slice(0, 120)}`,
        instruction:
          'The user is asking about a refund WITHOUT providing an order id. ' +
          'Explain the refund policy strictly from the KNOWLEDGE CONTEXT and point them to /orders ' +
          'so they can find and share the order id. Never promise the refund yourself.',
      });
      return {
        text: policy.text,
        agent: def.name,
        toolResults: [...traces, ...policy.traces],
        pendingApproval: false,
      };
    }

    // 2) Bug / complaint escalation
    if (BUG_RE.test(text)) {
      const summary =
        `🛟 Support escalation from tg:${input.user.telegramId}` +
        `${input.user.username ? ` @${input.user.username}` : ''}: ${text.slice(0, 500)}`;
      const notify = await executeTool('owner_notify', { text: summary }, ctx);
      const pending = traceFromResult(traces, 'owner_notify', notify, 'owner notified about the issue');
      const reply =
        '🛟 I am really sorry you ran into this — I have escalated your report to the owner right away ' +
        'and someone will follow up shortly. If you have an order id (see /orders) or a screenshot, ' +
        'sharing it will help us fix things faster.';
      return {
        text: redact(reply),
        agent: def.name,
        toolResults: traces,
        pendingApproval: pending,
      };
    }

    // 3) Default — knowledge-grounded support answer
    const answer = await kbGroundedAnswer(def, input);
    return {
      text: answer.text,
      agent: def.name,
      toolResults: [...traces, ...answer.traces],
      pendingApproval: false,
    };
  } catch (err) {
    logger.warn({ err }, 'support run failed');
    return {
      text: redact(
        '🛟 I am here to help with refunds, orders and any issues — tell me what happened and I will take care of it. You can also try /help for quick links.'
      ),
      agent: def.name,
      toolResults: traces,
      pendingApproval: false,
    };
  }
}
