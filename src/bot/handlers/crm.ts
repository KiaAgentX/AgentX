import type { Bot } from 'grammy';
import { config, isStaffTelegramId } from '../../config';
import { logger } from '../../core/logger';
import { db } from '../../core/db';
import * as crm from '../../services/crm.service';
import type { BotContext } from '../context';

/**
 * Owner CRM commands (staff-gated):
 *   /crm                 — pipeline stats + freshest leads
 *   /lead <contact> [name] — quick-add a lead
 *   JSON document upload  — bulk import (array of rows, ≤ 200 KB)
 *
 * Owner-facing strings are intentionally plain English: this is an
 * operator tool, not a customer surface (documented in docs/API.md).
 */

const MAX_IMPORT_BYTES = 200 * 1024;

function stageBar(): string {
  return 'new → warm → won  (lost → warm = revive)';
}

async function replyStats(ctx: BotContext): Promise<void> {
  const stats = await crm.leadStats();
  const fresh = await db.lead.findMany({ orderBy: { lastTouchedAt: 'desc' }, take: 5 });
  const lines = [
    `🎯 ${crm.formatStatsLine(stats)}`,
    `📈 last 24h: +${stats.fresh24h} new leads`,
    '',
    ...fresh.map(
      (l) =>
        `• ${l.contact}${l.name ? ` (${l.name})` : ''} — ${l.stage}${l.score ? ` · score ${l.score}` : ''}${l.source !== 'manual' ? ` · via ${l.source}` : ''}`
    ),
    '',
    stageBar(),
    'Import: send a .json file with an array of {contact, name?, company?, stage?, score?, tags?}',
  ];
  await ctx.reply(lines.join('\n'));
}

export function registerCrm(bot: Bot<BotContext>): void {
  bot.command('crm', async (ctx) => {
    if (!ctx.user || !isStaffTelegramId(ctx.user.telegramId)) return;
    try {
      await replyStats(ctx);
    } catch (err) {
      logger.warn({ err }, '📊 /crm failed');
      await ctx.reply('CRM stats unavailable — check the logs.').catch(() => undefined);
    }
  });

  bot.command('lead', async (ctx) => {
    if (!ctx.user || !isStaffTelegramId(ctx.user.telegramId)) return;
    const args = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
    const contact = args[0];
    const name = args.slice(1).join(' ') || undefined;
    if (!contact) {
      await ctx.reply(`Usage: /lead <contact> [name]\ncontact = email · +phone · @username\n\n${stageBar()}`);
      return;
    }
    try {
      const { lead, created } = await crm.addLead({ contact, name }, 'bot');
      await ctx.reply(
        created
          ? `✅ Lead saved: ${lead.contact}${lead.name ? ` (${lead.name})` : ''} — stage ${lead.stage}`
          : `ℹ️ Already in CRM: ${lead.contact} — stage ${lead.stage} (last touch ${lead.lastTouchedAt.toISOString().slice(0, 10)})`
      );
    } catch (err) {
      await ctx.reply(`❌ Could not save lead: ${err instanceof Error ? err.message : 'invalid input'}`);
    }
  });

  // Bulk import: staff sends a .json document → parse → importLeads.
  bot.on('message:document', async (ctx) => {
    if (!ctx.user || !isStaffTelegramId(ctx.user.telegramId)) return;
    const doc = ctx.message.document;
    const isJson =
      doc.mime_type === 'application/json' ||
      (doc.file_name ?? '').toLowerCase().endsWith('.json');
    if (!isJson) return; // other documents are handled elsewhere / ignored

    if ((doc.file_size ?? 0) > MAX_IMPORT_BYTES) {
      await ctx.reply(`❌ File too large (max ${Math.round(MAX_IMPORT_BYTES / 1024)} KB).`);
      return;
    }
    try {
      const file = await ctx.api.getFile(doc.file_id);
      const url = `https://api.telegram.org/file/bot${config.bot.token}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        await ctx.reply('❌ Not valid JSON. Expected an array of lead objects.');
        return;
      }
      const rows = Array.isArray(parsed) ? parsed : (parsed as { leads?: unknown[] }).leads ?? [parsed];
      const report = await crm.importLeads(rows, 'bot');
      const parts = [`📥 Import finished (${report.source}):`, `✅ imported: ${report.imported}`, `⏭ skipped (duplicates): ${report.skipped}`];
      if (report.invalid.length > 0) {
        parts.push(`⚠️ invalid: ${report.invalid.length}`);
        for (const bad of report.invalid.slice(0, 5)) parts.push(`   · row ${bad.index}: ${bad.error}`);
      }
      await ctx.reply(parts.join('\n'));
    } catch (err) {
      logger.warn({ err }, '📥 lead import via bot failed');
      await ctx.reply('❌ Import failed — check the logs.');
    }
  });
}
