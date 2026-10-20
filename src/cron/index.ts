import type { Bot } from 'grammy';
import { config } from '../config';
import { logger } from '../core/logger';
import { db } from '../core/db';
import { BUS_EVENTS, emitBus } from '../core/bus';
import { expireOverdue } from '../services/hitl.service';
import { getSetting } from '../services/settings.service';
import { notifyOwner } from '../services/notification.service';
import * as bookingService from '../services/booking.service';
import * as analyticsService from '../services/analytics.service';
import { decodeEntities, htmlToText, safeFetchText } from '../mcp/execute';

/**
 * Cron layer — node-cron jobs, each wrapped in try/catch + logger (never crash
 * the process). All human-facing output goes through the bus (notifyOwner /
 * NOTIFY_USER), so cron works identically with or without the bot.
 *
 * Jobs:
 *  a) every 5 min  — HITL approval expiry sweeper (fail-closed)
 *  b) every 10 min — booking reminders inside the next 60h
 *  c) daily 09:00  — owner analytics report (feature flag ENABLE_AUTO_REPORTS)
 *  d) hourly       — price radar (feature flag ENABLE_RADAR, setting radar_urls)
 */

// node-cron@3 ships no TypeScript declarations — structural interface via require.
interface CronScheduledTask {
  start(): void;
  stop(): void;
}
interface CronModule {
  validate(expression: string): boolean;
  schedule(expression: string, func: () => void): CronScheduledTask;
}
const cron = require('node-cron') as CronModule;

const RADAR_MAX_URLS = 20;
const RADAR_MAX_BYTES = 256 * 1024;

// ── job bodies ───────────────────────────────────────────────────────────────

async function runApprovalSweeper(): Promise<void> {
  const n = await expireOverdue();
  if (n > 0) {
    notifyOwner(`⌛ ${n} approval(s) expired (fail-closed) — request them again if still needed.`);
  }
}

async function runBookingReminders(): Promise<void> {
  const upcoming = await bookingService.listUpcoming(60);
  if (upcoming.length === 0) return;
  for (const b of upcoming) {
    const slotLocal = b.slotAt.toISOString().slice(0, 16).replace('T', ' ');
    if (b.user.telegramId) {
      emitBus(BUS_EVENTS.NOTIFY_USER, {
        telegramId: b.user.telegramId,
        text: `⏰ Reminder: your "${b.service}" booking is scheduled for ${slotLocal} UTC.`,
      });
    }
    await bookingService.markReminded(b.id);
  }
  logger.info({ count: upcoming.length }, '📅 booking reminders sent');
}

async function runDailyReport(): Promise<void> {
  if (!config.features.autoReports) return;
  const text = await analyticsService.dailyReportText('en');
  notifyOwner(text);
}

async function runRadar(): Promise<void> {
  if (!config.features.radar) return;

  // Task contract names the setting 'radar_urls'; SETTING_DEFAULTS also ships
  // 'radar_queries' — accept both (radar_urls wins).
  let raw = await getSetting('radar_urls', '');
  if (!raw.trim()) raw = await getSetting('radar_queries', '');

  const urls = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, RADAR_MAX_URLS);
  if (urls.length === 0) return;

  const findings: string[] = [];
  for (const url of urls) {
    try {
      const r = await safeFetchText(url, RADAR_MAX_BYTES);
      if (!r.ok) {
        logger.warn({ url, error: r.error }, '📡 radar fetch failed');
        continue;
      }
      const body = r.body ?? '';
      const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? url)
        .replace(/<[^>]*>/g, '')
        .trim();
      const pageTitle = decodeEntities(title).slice(0, 200) || url;
      const priceMatch = /(?:\$|€|£)\s?\d[\d,.]*/.exec(body.replace(/<[^>]*>/g, ' '));
      const price = priceMatch ? priceMatch[0].trim() : null;
      const snippet = `price=${price ?? 'n/a'} | ${htmlToText(body).slice(0, 300)}`.slice(0, 500);

      // Skip unchanged pages so the owner only hears about NEW findings.
      const previous = await db.radarFinding.findFirst({
        where: { url },
        orderBy: { createdAt: 'desc' },
        select: { snippet: true },
      });
      if (previous && previous.snippet === snippet) continue;

      // RadarFinding schema: {query, title, url, snippet, score, createdAt}.
      await db.radarFinding.create({
        data: { query: url, title: pageTitle, url, snippet, score: price ? 1 : 0 },
      });
      findings.push(`${pageTitle}${price ? ` — ${price}` : ''}`);
    } catch (err) {
      logger.warn({ err, url }, '📡 radar url scan failed');
    }
  }

  if (findings.length > 0) {
    notifyOwner(`📡 Radar found ${findings.length} new finding(s):\n- ${findings.slice(0, 10).join('\n- ')}`);
  }
}

// ── scheduler ────────────────────────────────────────────────────────────────

interface CronJob {
  name: string;
  expr: string;
  run: () => Promise<void>;
}

const JOBS: CronJob[] = [
  { name: 'approval-expiry-sweeper', expr: '*/5 * * * *', run: runApprovalSweeper },
  { name: 'booking-reminders', expr: '*/10 * * * *', run: runBookingReminders },
  { name: 'daily-report', expr: '0 9 * * *', run: runDailyReport },
  { name: 'radar-scan', expr: '0 * * * *', run: runRadar },
];

export function startCron(bot: Bot | null): void {
  // The bot is intentionally unused here: all delivery flows through the bus,
  // so cron behaves identically in bot and web-only modes.
  void bot;

  for (const job of JOBS) {
    if (!cron.validate(job.expr)) {
      logger.error({ job: job.name, expr: job.expr }, '⏰ invalid cron expression — job skipped');
      continue;
    }
    const task = cron.schedule(job.expr, () => {
      job.run().catch((err) => {
        logger.error({ err, job: job.name }, '⏰ cron job failed');
      });
    });
    task.start();
    logger.info({ job: job.name, expr: job.expr }, '⏰ cron job scheduled');
  }
}
