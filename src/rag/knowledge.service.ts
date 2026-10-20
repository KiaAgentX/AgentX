import type { KnowledgeItem } from '@prisma/client';
import { db } from '../core/db';
import { ValidationError } from '../core/errors';

/**
 * Retrieval-Augmented Generation knowledge base (SQLite-backed).
 * Keyword scoring — no external embedding service required:
 *   score = Σ queryToken × (titleTf×3 + contentTf×1 + tagsTf×2) + 2.0 phrase bonus
 */

const MAX_SCAN_ITEMS = 500;
const MAX_CHUNK_CHARS = 800;

/** Basic English + Persian stopwords stripped before scoring. */
const STOPWORDS: ReadonlySet<string> = new Set<string>([
  // English basics
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in', 'on', 'at', 'by', 'for',
  'with', 'from', 'into', 'about', 'as', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do',
  'does', 'did', 'have', 'has', 'had', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'what',
  'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'can', 'could', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'not', 'no', 'yes', 'so', 'than', 'too', 'very', 'just', 'now',
  'also', 'please', 'hi', 'hello', 'hey', 'thanks', 'thank', 'there', 'here', 'up', 'down', 'out',
  'over', 'under', 'again', 'more', 'most', 'some', 'any', 'all', 'both', 'each', 'few', 'other',
  'such', 'only', 'own', 'same',
  // Persian basics
  'و', 'در', 'به', 'از', 'که', 'این', 'آن', 'با', 'برای', 'است', 'هست', 'را', 'بر', 'تا', 'یا', 'هم',
  'می', 'اگر', 'چه', 'چگونه', 'چطور', 'کجا', 'چرا', 'من', 'تو', 'ما', 'شما', 'او', 'آنها', 'ایشان',
  'یک', 'های', 'بود', 'شد', 'شود', 'باشد', 'باشند', 'لطفا', 'سلام', 'چیه', 'چیست', 'روی', 'یعنی',
  'خیلی', 'بین', 'هر', 'همه', 'بدون', 'درباره', 'بعد', 'قبل', 'الان', 'حالا', 'بله', 'خیر', 'نه',
]);

function tokenize(text: string): string[] {
  const raw = (text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function normalizeTags(tags?: string[]): string {
  return (tags ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .join(',');
}

async function findByTitleCI(title: string): Promise<KnowledgeItem | null> {
  // SQLite via Prisma has no case-insensitive unique filter — compare in JS.
  const rows = await db.knowledgeItem.findMany({ select: { id: true, title: true }, take: 5000 });
  const needle = title.trim().toLowerCase();
  const hit = rows.find((r) => r.title.trim().toLowerCase() === needle);
  return hit ? db.knowledgeItem.findUnique({ where: { id: hit.id } }) : null;
}

/** Idempotent on title (case-insensitive): update when present, otherwise create. */
export async function upsertKnowledge(input: {
  title: string;
  content: string;
  tags?: string[];
  source?: string;
}): Promise<KnowledgeItem> {
  const title = String(input.title ?? '').trim();
  const content = String(input.content ?? '').trim();
  if (!title || !content) throw new ValidationError('Knowledge item requires a non-empty title and content');
  const tags = normalizeTags(input.tags);
  const source = String(input.source ?? '').trim() || 'manual';

  const existing = await findByTitleCI(title);
  if (existing) {
    return db.knowledgeItem.update({
      where: { id: existing.id },
      data: { title, content, tags, source, active: true },
    });
  }
  return db.knowledgeItem.create({ data: { title, content, tags, source } });
}

export async function deleteKnowledge(id: string): Promise<void> {
  await db.knowledgeItem.deleteMany({ where: { id } });
}

export async function listKnowledge(limit: number = 100): Promise<KnowledgeItem[]> {
  const take = Math.min(Math.max(Math.floor(limit) || 100, 1), 500);
  return db.knowledgeItem.findMany({
    where: { active: true },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

/** Keyword search: term-frequency overlap vs title(×3)/content(×1)/tags(×2) + full-phrase bonus. */
export async function searchKnowledge(
  query: string,
  topK: number = 5
): Promise<Array<{ item: KnowledgeItem; score: number }>> {
  const k = Math.min(Math.max(Math.floor(topK) || 5, 1), 25);
  const qTokens = tokenize(query);
  const phrase = String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (qTokens.length === 0 && !phrase) return [];

  const items = await db.knowledgeItem.findMany({ where: { active: true }, take: MAX_SCAN_ITEMS });

  const scored = items
    .map((item) => {
      const titleTf = termFrequencies(tokenize(item.title));
      const contentTf = termFrequencies(tokenize(item.content));
      const tagTf = termFrequencies(tokenize(item.tags.replace(/,/g, ' ')));
      let score = 0;
      for (const tok of new Set(qTokens)) {
        score += (titleTf.get(tok) ?? 0) * 3 + (contentTf.get(tok) ?? 0) * 1 + (tagTf.get(tok) ?? 0) * 2;
      }
      if (phrase && item.content.toLowerCase().includes(phrase)) score += 2.0;
      return { item, score };
    })
    .filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** Split text into paragraph chunks of ≤800 chars (sentence-aware hard wrap for long paragraphs). */
function chunkParagraphs(text: string, maxLen: number): string[] {
  const paragraphs = (text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLen) {
      chunks.push(paragraph);
      continue;
    }
    let buffer = '';
    const sentences = paragraph.split(/(?<=[.!?。！？…])\s+/);
    for (const sentence of sentences) {
      if (!buffer) {
        if (sentence.length > maxLen) {
          for (let j = 0; j < sentence.length; j += maxLen) {
            chunks.push(sentence.slice(j, j + maxLen).trim());
          }
        } else {
          buffer = sentence;
        }
        continue;
      }
      if (`${buffer} ${sentence}`.length > maxLen) {
        chunks.push(buffer.trim());
        buffer = sentence.length > maxLen ? '' : sentence;
        if (sentence.length > maxLen) {
          for (let j = 0; j < sentence.length; j += maxLen) {
            chunks.push(sentence.slice(j, j + maxLen).trim());
          }
        }
      } else {
        buffer = `${buffer} ${sentence}`;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
  }
  return chunks;
}

/** Split a document into ≤800-char chunks and upsert each as `${title} — part N`. Returns chunk count. */
export async function ingestDocument(
  title: string,
  text: string,
  source?: string,
  tags?: string[]
): Promise<number> {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle) throw new ValidationError('ingestDocument requires a title');
  const chunks = chunkParagraphs(String(text ?? ''), MAX_CHUNK_CHARS);
  for (let i = 0; i < chunks.length; i += 1) {
    await upsertKnowledge({
      title: `${cleanTitle} — part ${i + 1}`,
      content: chunks[i],
      tags,
      source: source ?? 'import',
    });
  }
  return chunks.length;
}

/** searchKnowledge → formatted "### title [tags]\ncontent" blocks, truncated to maxChars. '' when no hits. */
export async function buildKnowledgeContext(query: string, maxChars: number = 3000): Promise<string> {
  try {
    const hits = await searchKnowledge(query, 5);
    if (hits.length === 0) return '';
    const blocks = hits.map(({ item }) => {
      const tags = item.tags ? ` [${item.tags}]` : '';
      return `### ${item.title}${tags}\n${item.content}`;
    });
    return blocks.join('\n\n').slice(0, Math.max(200, Math.floor(maxChars) || 3000));
  } catch {
    return '';
  }
}
