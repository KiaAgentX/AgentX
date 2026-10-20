import { AGENTS, agentContext, makeSystemPrompt, parseLooseJson, traceFromResult } from './base';
import type { AgentRunInput, AgentRunOutput, AgentToolTrace } from './base';
import { executeTool } from '../mcp/execute';
import { redact } from '../security';
import { aiEnabled, chatComplete } from '../ai/provider';
import { t } from '../i18n';
import { logger } from '../core/logger';

/**
 * Content Studio ✍️ — turns rough ideas ("title | price in Stars | description",
 * tolerated across separators, prefixes and languages) into polished product
 * listings. AI (when enabled) only polishes {title, description, category};
 * creation itself goes through the product_create MCP tool (RBAC enforced there).
 */

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 4000;
const MAX_CATEGORY = 60;
const MAX_PRICE = 1_000_000_000;

interface ParsedProduct {
  title: string;
  priceStars: number;
  description: string;
}

interface PolishedProduct {
  title?: unknown;
  description?: unknown;
  category?: unknown;
}

/** Strip common create-product prefixes (EN + FA), keeping the payload. */
function stripCreatePrefix(text: string): string {
  return text
    .replace(/^\s*(?:\/add\b)?\s*(?:create|add|new)\s+(?:a\s+|an\s+|the\s+)?product\s*[:：]?\s*/i, '')
    .replace(/^\s*محصول\s*(?:بساز|جدید|اضافه|ایجاد)?\s*[:：]?\s*/u, '')
    .replace(/^\s*(?:ایجاد|اضافه)\s+(?:کردن\s+)?محصول\s*[:：]?\s*/u, '')
    .trim();
}

function toValidPrice(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PRICE) return null;
  return n;
}

/** First standalone integer 1..1e9 inside the chunk (null when none). */
function firstPriceIn(chunk: string): number | null {
  const matches = chunk.match(/\d{1,10}/g) ?? [];
  for (const raw of matches) {
    const price = toValidPrice(raw);
    if (price !== null) return price;
  }
  return null;
}

function removePriceToken(chunk: string, price: number): string {
  const re = new RegExp(`(^|\\s)${price}(?=\\s|$)`);
  return chunk.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Tolerant parser: split on "|" or newlines; price = first integer 1..1e9 found
 * (scanning after the title chunk first, then the title chunk itself);
 * title = first chunk trimmed to 120 chars; description = the remainder.
 */
export function parseProductRequest(text: string): ParsedProduct | null {
  const body = stripCreatePrefix(text ?? '');
  if (body.length === 0) return null;

  const chunks = body
    .split(/\||\r?\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  if (chunks.length === 0) return null;

  let priceStars: number | null = null;
  for (let i = 1; i < chunks.length && priceStars === null; i += 1) {
    priceStars = firstPriceIn(chunks[i]);
  }

  let titleChunk = chunks[0];
  if (priceStars === null) {
    priceStars = firstPriceIn(chunks[0]);
    if (priceStars !== null) titleChunk = removePriceToken(chunks[0], priceStars);
  }
  if (priceStars === null) return null;

  const title = titleChunk.replace(/^[-•*\s]+/, '').trim().slice(0, MAX_TITLE);
  if (title.length === 0) return null;

  const description = chunks.slice(2).join(' | ').slice(0, MAX_DESCRIPTION);
  return { title, priceStars, description };
}

function polishPrompt(language: string): string {
  return (
    `${makeSystemPrompt(AGENTS.content, '', language)}\n\n` +
    'Polish the rough product idea below. Reply with ONLY a JSON object of shape ' +
    '{"title": string, "description": string, "category": string} where title is max 120 chars, ' +
    "description is benefit-driven (max ~800 chars) and category is 1-2 words. " +
    'Keep the seller\'s language, never change or invent the price, never add guarantees.'
  );
}

function clampPolished(polished: PolishedProduct, parsed: ParsedProduct): { title: string; description: string; category: string } {
  const title =
    typeof polished.title === 'string' && polished.title.trim().length > 0
      ? polished.title.trim().slice(0, MAX_TITLE)
      : parsed.title;
  const description =
    typeof polished.description === 'string' && polished.description.trim().length > 0
      ? polished.description.trim().slice(0, MAX_DESCRIPTION)
      : parsed.description;
  const category =
    typeof polished.category === 'string' && polished.category.trim().length > 0
      ? polished.category.trim().slice(0, MAX_CATEGORY)
      : '';
  return { title, description, category };
}

export async function runContent(input: AgentRunInput): Promise<AgentRunOutput> {
  const traces: AgentToolTrace[] = [];
  const def = AGENTS.content;
  const ctx = agentContext(input, 'content');
  try {
    const parsed = parseProductRequest(input.text ?? '');

    // Not parseable → ask for the canonical "title | price | description" template.
    if (!parsed) {
      const localized = t(input.user.language, 'product_wizard_title');
      const header =
        localized !== 'product_wizard_title'
          ? `✍️ ${localized}`
          : '✍️ Happy to create that listing — send it in this format:';
      const reply =
        `${header}\n` +
        'title | price in Stars | short description\n' +
        'Example: "Neon Hoodie | 250 | warm, glowy, limited batch of 10"';
      return {
        text: redact(reply),
        agent: def.name,
        toolResults: traces,
        pendingApproval: false,
      };
    }

    // Optional AI polish of {title, description, category} — price never changes.
    let title = parsed.title;
    let description = parsed.description;
    let category = '';
    if (aiEnabled()) {
      try {
        const { text: aiText } = await chatComplete(
          [
            { role: 'system', content: polishPrompt(input.user.language) },
            {
              role: 'user',
              content: JSON.stringify({
                title: parsed.title,
                description: parsed.description,
                priceStars: parsed.priceStars,
              }),
            },
          ],
          { agent: def.name, userId: input.user.id, json: true, maxTokens: 400 }
        );
        const polished = parseLooseJson<PolishedProduct>(aiText);
        if (polished) {
          const clamped = clampPolished(polished, parsed);
          title = clamped.title;
          description = clamped.description;
          category = clamped.category;
        }
      } catch {
        // AI offline — keep the raw parsed fields, creation must still work.
      }
    }

    const result = await executeTool(
      'product_create',
      {
        title,
        description: description.length > 0 ? description : title,
        category: category.length > 0 ? category : 'general',
        priceStars: parsed.priceStars,
        aiGenerated: true,
      },
      ctx
    );
    const pending = traceFromResult(traces, 'product_create', result, 'product created');

    let reply: string;
    if (result.ok && !result.pendingApprovalId) {
      reply =
        `✅ Product created: "${title}" — ${parsed.priceStars} ⭐ (Stars)` +
        `${category ? ` · category: ${category}` : ''}. ` +
        'Note: you can edit, feature or archive it anytime from the marketplace panel.';
    } else if (result.ok && result.pendingApprovalId) {
      reply =
        `🕓 Your product "${title}" (${parsed.priceStars} ⭐) was queued for owner approval ` +
        `(ticket #${String(result.pendingApprovalId).slice(0, 8)}) — I will confirm once it is approved.`;
    } else {
      reply =
        `⚠️ I could not create the product (${result.error ?? 'unknown error'}). ` +
        'Please check the title/price and try again — format: title | price in Stars | description.';
    }
    return {
      text: redact(reply),
      agent: def.name,
      toolResults: traces,
      pendingApproval: pending,
    };
  } catch (err) {
    logger.warn({ err }, 'content run failed');
    return {
      text: redact(
        '✍️ I could not prepare the listing right now. Try again with: title | price in Stars | short description.'
      ),
      agent: def.name,
      toolResults: traces,
      pendingApproval: false,
    };
  }
}
