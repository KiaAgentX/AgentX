import { Lead } from '@prisma/client';
import { z } from 'zod';
import { db } from '../core/db';
import { logger } from '../core/logger';
import { ValidationError, NotFoundError } from '../core/errors';
import { BUS_EVENTS, emitBus } from '../core/bus';

/**
 * Lead CRM service — import → dedupe → qualify → close.
 *
 * Pure helpers (normalizeContact, canLeadTransition) are exported for the
 * test suite; every DB-touching function validates its inputs first so the
 * service can be called from the bot, the dashboard API or an MCP tool.
 */

export const LEAD_STAGES = ['new', 'warm', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Allowed pipeline transitions (lost → warm = revival). Anything else fails closed. */
const STAGE_TRANSITIONS: Record<LeadStage, readonly LeadStage[]> = {
  new: ['warm', 'won', 'lost'],
  warm: ['won', 'lost'],
  won: [],
  lost: ['warm'],
};

export function canLeadTransition(from: string, to: string): boolean {
  if (!isLeadStage(from) || !isLeadStage(to)) return false;
  return STAGE_TRANSITIONS[from].includes(to);
}

export function isLeadStage(v: string): v is LeadStage {
  return (LEAD_STAGES as readonly string[]).includes(v);
}

/**
 * Normalize a contact into the dedupe key:
 *  - emails → lowercased
 *  - phones → keep leading +, strip every other non-digit
 *  - @usernames → lowercased, leading @ preserved
 */
export function normalizeContact(raw: string): string {
  const s = String(raw ?? '').trim();
  if (s.includes('@') && !s.startsWith('@') && s.includes('.')) return s.toLowerCase(); // email
  if (s.startsWith('@')) return '@' + s.slice(1).replace(/^@+/, '').toLowerCase(); // telegram handle
  if (/^\+?[0-9][0-9\s\-()]{4,}$/.test(s)) return '+' + s.replace(/[^0-9]/g, ''); // phone
  return s.toLowerCase();
}

export function isValidContact(normalized: string): boolean {
  // '@' allowed inside (emails); leading + (phone) / @ (handle) allowed too.
  return /^[+@]?[a-z0-9][a-z0-9.@_\-+]{3,118}$/.test(normalized);
}

const LEAD_ROW_SCHEMA = z.object({
  contact: z.string().min(3).max(140),
  name: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  stage: z.string().optional(),
  score: z.number().int().min(0).max(100).optional(),
  tags: z.union([z.string().max(200), z.array(z.string().max(50)).max(10)]).optional(),
  notes: z.string().max(2000).optional(),
});

export type LeadRowInput = z.infer<typeof LEAD_ROW_SCHEMA>;

function tagsToString(tags: LeadRowInput['tags']): string {
  if (Array.isArray(tags)) return tags.map((t) => t.trim()).filter(Boolean).join(',');
  return (tags ?? '').trim();
}

/** Create (or skip) a single lead. Returns created=false when the contact already exists. */
export async function addLead(
  input: LeadRowInput,
  source: string = 'manual'
): Promise<{ lead: Lead; created: boolean }> {
  const row = LEAD_ROW_SCHEMA.parse(input);
  const contact = normalizeContact(row.contact);
  if (!isValidContact(contact)) {
    throw new ValidationError(`invalid contact: "${row.contact}"`);
  }
  const stage = row.stage && isLeadStage(row.stage) ? row.stage : 'new';
  const existing = await db.lead.findUnique({ where: { contact } });
  if (existing) return { lead: existing, created: false };

  const lead = await db.lead.create({
    data: {
      contact,
      name: row.name?.trim() || null,
      company: row.company?.trim() || null,
      stage,
      score: row.score ?? 0,
      source: source.slice(0, 40),
      tags: tagsToString(row.tags),
      notes: row.notes?.trim() || null,
    },
  });
  emitBus(BUS_EVENTS.SSE, { type: 'lead_new', payload: { id: lead.id, contact: lead.contact, stage: lead.stage } });
  return { lead, created: true };
}

export interface ImportReport {
  imported: number;
  skipped: number;
  invalid: Array<{ index: number; error: string }>;
  source: string;
}

/** Bulk import (dashboard JSON / bot document). Bad rows are reported, never fatal. */
export async function importLeads(rows: unknown, source = 'import'): Promise<ImportReport> {
  if (!Array.isArray(rows)) {
    rows = rows != null && typeof rows === 'object' ? [rows] : [];
  }
  const report: ImportReport = { imported: 0, skipped: 0, invalid: [], source };
  for (let i = 0; i < (rows as unknown[]).length && i < 2000; i += 1) {
    const raw = (rows as unknown[])[i];
    const parsed = LEAD_ROW_SCHEMA.safeParse(raw);
    if (!parsed.success) {
      report.invalid.push({ index: i, error: parsed.error.issues[0]?.message ?? 'invalid row' });
      continue;
    }
    try {
      const { created } = await addLead(parsed.data, source);
      if (created) report.imported += 1;
      else report.skipped += 1;
    } catch (err) {
      if (err instanceof ValidationError) report.invalid.push({ index: i, error: err.message });
      else {
        logger.warn({ err, index: i }, '📥 lead import row failed');
        report.invalid.push({ index: i, error: 'internal' });
      }
    }
  }
  logger.info({ imported: report.imported, skipped: report.skipped, invalid: report.invalid.length, source }, '📥 lead import finished');
  return report;
}

/** Move a lead through the pipeline (validated transitions only). */
export async function moveStage(id: string, to: string, note?: string): Promise<Lead> {
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError('Lead');
  if (!isLeadStage(to)) throw new ValidationError(`stage must be one of: ${LEAD_STAGES.join(', ')}`);
  if (!canLeadTransition(lead.stage, to)) {
    throw new ValidationError(`cannot move lead from "${lead.stage}" to "${to}"`);
  }
  const updated = await db.lead.update({
    where: { id },
    data: { stage: to, lastTouchedAt: new Date(), notes: note?.trim() ? note.trim().slice(0, 2000) : lead.notes },
  });
  emitBus(BUS_EVENTS.SSE, { type: 'lead_stage', payload: { id: updated.id, contact: updated.contact, from: lead.stage, to } });
  return updated;
}

export interface ListLeadsOpts {
  stage?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listLeads(opts: ListLeadsOpts = {}): Promise<{ items: Lead[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where: Record<string, unknown> = {};
  if (opts.stage && isLeadStage(opts.stage)) where.stage = opts.stage;
  if (opts.q) {
    const like = opts.q.slice(0, 80);
    where.OR = [
      { contact: { contains: like } },
      { name: { contains: like } },
      { company: { contains: like } },
    ];
  }
  const [items, total] = await Promise.all([
    db.lead.findMany({ where, orderBy: { lastTouchedAt: 'desc' }, skip: offset, take: limit }),
    db.lead.count({ where }),
  ]);
  return { items, total };
}

export async function leadStats(): Promise<{
  total: number;
  byStage: Record<LeadStage, number>;
  wonRate: number;
  fresh24h: number;
}> {
  const [total, groups, won, fresh24h] = await Promise.all([
    db.lead.count(),
    db.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
    db.lead.count({ where: { stage: 'won' } }),
    db.lead.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
  ]);
  const byStage: Record<LeadStage, number> = { new: 0, warm: 0, won: 0, lost: 0 };
  for (const g of groups) {
    if (isLeadStage(g.stage)) byStage[g.stage] = g._count._all;
  }
  return { total, byStage, wonRate: total > 0 ? Math.round((won / total) * 100) : 0, fresh24h };
}

/** Owner-facing one-liner used by the bot /crm command and daily reports. */
export function formatStatsLine(stats: Awaited<ReturnType<typeof leadStats>>): string {
  return `CRM: ${stats.total} leads — new ${stats.byStage.new} · warm ${stats.byStage.warm} · won ${stats.byStage.won} · lost ${stats.byStage.lost} (${stats.wonRate}% won)`;
}
