import { config } from '../config';
import { db } from '../core/db';
import { logger } from '../core/logger';
import { BUS_EVENTS, emitBus } from '../core/bus';
import { AiUnavailableError } from '../core/errors';

/**
 * OpenAI-compatible chat provider.
 * - Never throws at import/when the key is missing: aiEnabled() lets callers branch.
 * - chatComplete() throws AiUnavailableError('AI not configured') when the key is absent.
 * - 60s AbortController timeout, up to 2 retries on 429/5xx/network (linear backoff 1.5s).
 * - Every successful call is logged to the AiUsage table and emitted on the bus.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  agent?: string;
  userId?: string | null;
}

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1_500;

interface ChatApiChoice {
  message?: { content?: string };
}
interface ChatApiResponse {
  choices?: ChatApiChoice[];
}

type StatusedError = AiUnavailableError & { status?: number };

export function aiEnabled(): boolean {
  return typeof config.ai.apiKey === 'string' && config.ai.apiKey.length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        temperature: opts.temperature ?? config.ai.temperature,
        max_tokens: opts.maxTokens ?? config.ai.maxTokens,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      const err: StatusedError = new AiUnavailableError(`AI HTTP ${res.status}: ${detail}`) as StatusedError;
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as ChatApiResponse;
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

async function logUsage(
  agent: string,
  model: string,
  promptChars: number,
  completionChars: number,
  latencyMs: number,
  userId: string | null
): Promise<void> {
  try {
    await db.aiUsage.create({
      data: { userId, agent, model, promptChars, completionChars, latencyMs },
    });
  } catch (err) {
    logger.warn({ err }, 'AiUsage logging failed');
  }
  emitBus(BUS_EVENTS.AI_USAGE, { agent, model, promptChars, completionChars, latencyMs, userId });
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<{ text: string; latencyMs: number }> {
  if (!aiEnabled()) throw new AiUnavailableError('AI not configured');

  const started = Date.now();
  const agent = opts.agent ?? 'unknown';
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const text = await requestOnce(messages, opts);
      const latencyMs = Date.now() - started;
      await logUsage(agent, config.ai.model, promptChars, text.length, latencyMs, opts.userId ?? null);
      return { text, latencyMs };
    } catch (err) {
      lastError = err;
      const status = (err as StatusedError).status;
      const retryable =
        status === undefined /* network error / timeout / abort */ ||
        status === 429 ||
        (typeof status === 'number' && status >= 500);
      if (!retryable || attempt >= MAX_RETRIES) break;
      await sleep(BACKOFF_BASE_MS * (attempt + 1));
    }
  }

  logger.warn(
    { agent, err: lastError instanceof Error ? lastError.message : String(lastError) },
    'AI chatComplete failed after retries'
  );
  if (lastError instanceof AiUnavailableError) throw lastError;
  throw new AiUnavailableError(lastError instanceof Error ? lastError.message : 'AI provider unavailable');
}
