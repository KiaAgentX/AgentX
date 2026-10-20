import { AGENTS, agentContext, kbGroundedAnswer, traceFromResult } from './base';
import type { AgentRunInput, AgentRunOutput, AgentToolTrace } from './base';
import { executeTool } from '../mcp/execute';
import { redact } from '../security';
import { BOOKING_SERVICES } from '../services/booking.service';
import type { ToolResult } from '../types';
import { logger } from '../core/logger';

/**
 * Receptionist 🛎️ — rule layer first (works with AI disabled):
 * 1. booking intent → parse service/time → booking_create, otherwise booking_list + guidance
 * 2. FAQ / general Q&A → knowledge-grounded answer (AI when enabled, KB top-match fallback)
 */

const BOOKING_RE =
  /\bbook(?:ings?|ing)?\b|\bappointment\b|\brendez[- ]?vous\b|نوبت|رزرو|запис|予約|\bcita\b|\bcitar\b/i;

const FAQ_RE =
  /\bfaq\b|\bquestions?\b|سوال|پرسش|вопрос|質問|\bpreguntas?\b|\bdomandas?\b/i;

const SERVICE_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/consult|مشاوره/i, 'consult'],
  [/demo|نمایش/i, 'demo'],
  [/meeting|جلسه/i, 'meeting'],
  [/\bcall\b|تماس|مکالمه/i, 'call'],
  [/interview|مصاحبه/i, 'interview'],
  [/check[- ]?in|چک این/i, 'check'],
];

function parseService(text: string): string | null {
  const lower = text.toLowerCase();
  for (const service of BOOKING_SERVICES) {
    if (service && lower.includes(service.toLowerCase())) return service;
  }
  for (const [re, keyword] of SERVICE_ALIASES) {
    if (!re.test(text)) continue;
    const hit = BOOKING_SERVICES.find((s) => s.toLowerCase().includes(keyword));
    if (hit) return hit;
  }
  return null;
}

function fmtDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function parseSlotISO(text: string): string | null {
  const now = new Date();
  let dayOffset = 0;
  if (/\btomorrow\b|فردا|завтра|明日|mañana|manana/i.test(text)) dayOffset = 1;

  let hour: number | null = null;
  let minute = 0;
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i);
  const hm = text.match(/(\d{1,2})\s*[:h.]\s*(\d{2})/);
  const atTime = text.match(/(?:\bat\b|ساعت)\s+(\d{1,2})(?:\s*[:.]\s*(\d{2}))?(?!\d)/i);

  if (ampm) {
    hour = Number(ampm[1]);
    minute = ampm[2] ? Number(ampm[2]) : 0;
    if (/^p/i.test(ampm[3]) && hour < 12) hour += 12;
    if (/^a/i.test(ampm[3]) && hour === 12) hour = 0;
  } else if (hm) {
    hour = Number(hm[1]);
    minute = Number(hm[2]);
  } else if (atTime) {
    hour = Number(atTime[1]);
    minute = atTime[2] ? Number(atTime[2]) : 0;
  }

  if (hour === null || !Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  const slot = new Date(now);
  slot.setDate(slot.getDate() + dayOffset);
  slot.setHours(hour, minute, 0, 0);
  if (slot.getTime() <= now.getTime()) slot.setDate(slot.getDate() + 1);
  return slot.toISOString();
}

function bookingResultText(result: ToolResult, service: string, slotISO: string): string {
  if (result.ok && !result.pendingApprovalId) {
    const data = result.data as { booking?: { service?: string; slotAt?: string | Date } } | undefined;
    const when = data?.booking?.slotAt ? fmtDate(data.booking.slotAt) : fmtDate(slotISO);
    const name = data?.booking?.service ?? service;
    return `✅ Booked: ${name} — ${when}. You'll get a reminder before the slot. See you there!`;
  }
  if (result.ok && result.pendingApprovalId) {
    return `🕓 Booking request sent for owner confirmation (ticket #${String(result.pendingApprovalId).slice(0, 8)}). I'll confirm the slot shortly.`;
  }
  return `⚠️ I couldn't complete the booking (${result.error ?? 'unknown error'}). Please check the service name and time, then try again — e.g. "book ${BOOKING_SERVICES[0] ?? 'consultation'} tomorrow 15:00".`;
}

function formatBookings(result: ToolResult): string {
  if (!result.ok) return '📅 I could not load your bookings right now.';
  const items = Array.isArray(result.data)
    ? (result.data as Array<{ service: string; slotAt: string | Date; status: string }>)
    : [];
  if (items.length === 0) return '📅 You have no upcoming bookings yet.';
  const lines = items.slice(0, 8).map((b) => `• ${b.service} — ${fmtDate(b.slotAt)} (${b.status})`);
  return `📅 Your bookings:\n${lines.join('\n')}`;
}

export async function runReceptionist(input: AgentRunInput): Promise<AgentRunOutput> {
  const traces: AgentToolTrace[] = [];
  const def = AGENTS.receptionist;
  const ctx = agentContext(input, 'receptionist');
  try {
    const text = input.text ?? '';

    if (BOOKING_RE.test(text)) {
      const service = parseService(text);
      const slotISO = parseSlotISO(text);

      if (service && slotISO) {
        const result = await executeTool(
          'booking_create',
          { service, slotISO, notes: input.user.username ? `tg:@${input.user.username}` : undefined },
          ctx
        );
        const pending = traceFromResult(traces, 'booking_create', result, 'booking created');
        return {
          text: redact(bookingResultText(result, service, slotISO)),
          agent: def.name,
          toolResults: traces,
          pendingApproval: pending,
        };
      }

      const listResult = await executeTool('booking_list', {}, ctx);
      const pending = traceFromResult(traces, 'booking_list', listResult, 'bookings listed');
      const hint = BOOKING_SERVICES.length > 0 ? `Services: ${BOOKING_SERVICES.slice(0, 6).join(', ')}.` : '';
      return {
        text: redact(
          `${formatBookings(listResult)}\n\nTo book, tell me the service and the time — e.g. "book ${BOOKING_SERVICES[0] ?? 'consultation'} tomorrow 15:00". ${hint}`
        ),
        agent: def.name,
        toolResults: traces,
        pendingApproval: pending,
      };
    }

    const instruction = FAQ_RE.test(text)
      ? 'The user is asking a frequently-asked question — answer strictly from the KNOWLEDGE CONTEXT in under 120 words.'
      : 'Answer the general question using the KNOWLEDGE CONTEXT when possible; be honest about gaps.';
    const answer = await kbGroundedAnswer(def, input, { instruction });
    return {
      text: answer.text,
      agent: def.name,
      toolResults: [...traces, ...answer.traces],
      pendingApproval: false,
    };
  } catch (err) {
    logger.warn({ err }, 'receptionist run failed');
    return {
      text: '🙌 Welcome to KIA DropAgentX! How can I help — a booking, a product, or a question?',
      agent: def.name,
      toolResults: traces,
      pendingApproval: false,
    };
  }
}
