import { AGENTS, agentContext, makeSystemPrompt, traceFromResult } from './base';
import type { AgentRunInput, AgentRunOutput, AgentToolTrace } from './base';
import { executeTool } from '../mcp/execute';
import { redact } from '../security';
import { aiEnabled, chatComplete } from '../ai/provider';
import { t } from '../i18n';
import { logger } from '../core/logger';

/**
 * Analyst 📊 — staff-only (admin/owner) business intelligence:
 * pulls analytics_report (1 or 7 days) + XP leaderboard via MCP tools, then
 * summarizes with the AI persona when enabled or a deterministic text report.
 * Internal numbers are never shown to regular users.
 */

const WEEK_RE = /\bweek\b|\bweekly\b|\b7\b|\b7\s*day|تاریخ|هفته/i;

interface LeaderRowLike {
  displayName?: string;
  name?: string;
  username?: string;
  value?: unknown;
  xp?: unknown;
}

function isStaffRole(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function humanizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
}

/** Flatten arbitrary JSON data into readable bullet lines (bounded). */
function flattenEntries(value: unknown, prefix: string, out: string[], depth: number): void {
  if (out.length >= 18 || depth > 4) return;
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.slice(0, 6).forEach((item, idx) => flattenEntries(item, `${prefix} #${idx + 1}`, out, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const label = prefix ? `${prefix} — ${humanizeKey(key)}` : humanizeKey(key);
      flattenEntries(child, label, out, depth + 1);
    }
    return;
  }
  out.push(`• ${prefix}: ${String(value)}`);
}

function formatLeaderboard(data: unknown): string {
  const raw = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown } | null)?.items)
      ? (data as { items: unknown[] }).items
      : [];
  if (raw.length === 0) return '• (leaderboard is empty — no XP earned yet)';
  const lines = (raw as LeaderRowLike[]).slice(0, 5).map((row, idx) => {
    const name = row?.displayName ?? row?.name ?? row?.username ?? 'anon';
    const xp = row?.value ?? row?.xp ?? 0;
    return `${idx + 1}. ${String(name)} — ${String(xp)} XP`;
  });
  return lines.join('\n');
}

/** Deterministic multi-line report (used when the AI is offline). */
function buildTextReport(
  lang: string,
  days: number,
  analyticsOk: boolean,
  analytics: unknown,
  leaderboard: unknown
): string {
  const localizedTitle = t(lang, 'stats_title');
  const title =
    localizedTitle !== 'stats_title'
      ? `${localizedTitle} (last ${days} day${days === 1 ? '' : 's'})`
      : `📊 Business snapshot — last ${days} day${days === 1 ? '' : 's'}`;

  const bullets: string[] = [];
  if (analyticsOk) {
    flattenEntries(analytics, '', bullets, 0);
  } else {
    bullets.push('• (analytics data unavailable right now)');
  }

  return `${title}\n${bullets.join('\n')}\n\n🏆 XP leaderboard (top 5):\n${formatLeaderboard(leaderboard)}`;
}

export async function runAnalyst(input: AgentRunInput): Promise<AgentRunOutput> {
  const traces: AgentToolTrace[] = [];
  const def = AGENTS.analyst;
  const ctx = agentContext(input, 'analyst');

  // Staff-only gate — never disclose internal numbers to regular users.
  if (!isStaffRole(input.user.role)) {
    const localized = t(input.user.language, 'owner_only');
    const refusal =
      localized !== 'owner_only'
        ? localized
        : '⛔ The analyst agent is staff-only (owner/admin). Please ask the owner for access.';
    logger.warn({ telegramId: input.user.telegramId }, 'analyst access denied to non-staff user');
    return {
      text: redact(refusal),
      agent: def.name,
      toolResults: traces,
      pendingApproval: false,
    };
  }

  try {
    const text = (input.text ?? '').trim();
    const days = WEEK_RE.test(text) ? 7 : 1;

    const analytics = await executeTool('analytics_report', { days }, ctx);
    const analyticsPending = traceFromResult(traces, 'analytics_report', analytics, `analytics snapshot (${days}d)`);

    const leaderboard = await executeTool('leaderboard_get', { board: 'xp', limit: 5 }, ctx);
    const leaderboardPending = traceFromResult(traces, 'leaderboard_get', leaderboard, 'XP leaderboard (top 5)');

    const analyticsData = analytics.ok ? analytics.data : null;
    const leaderboardData = leaderboard.ok ? leaderboard.data : null;
    const payload = { days, analytics: analyticsData, leaderboard: leaderboardData };

    let reply: string;
    if (aiEnabled()) {
      try {
        const system =
          `${makeSystemPrompt(def, '', input.user.language)}\n\n` +
          `LIVE DATA (from analytics_report and leaderboard_get — use ONLY these numbers, never invent data):\n` +
          `${JSON.stringify(payload)}\n\n` +
          'Write a crisp staff briefing: lead with the single most important number, then 3-6 short bullets, ' +
          'then one actionable insight. Money stays integer (Stars/credits). Under 180 words.';
        const { text: aiText } = await chatComplete(
          [
            { role: 'system', content: system },
            { role: 'user', content: text || `Give me the ${days}-day business snapshot.` },
          ],
          { agent: def.name, userId: input.user.id, maxTokens: 500 }
        );
        reply = aiText.trim().length > 0 ? aiText.trim() : buildTextReport(input.user.language, days, analytics.ok, analyticsData, leaderboardData);
      } catch {
        reply = buildTextReport(input.user.language, days, analytics.ok, analyticsData, leaderboardData);
      }
    } else {
      reply = buildTextReport(input.user.language, days, analytics.ok, analyticsData, leaderboardData);
    }

    return {
      text: redact(reply),
      agent: def.name,
      toolResults: traces,
      pendingApproval: analyticsPending || leaderboardPending,
    };
  } catch (err) {
    logger.warn({ err }, 'analyst run failed');
    return {
      text: redact('📊 I could not assemble the business report right now — please try again in a moment.'),
      agent: def.name,
      toolResults: traces,
      pendingApproval: false,
    };
  }
}
