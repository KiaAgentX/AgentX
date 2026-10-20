import { Quest } from '@prisma/client';
import { db } from '../core/db';
import { BUS_EVENTS, emitBus } from '../core/bus';
import { logger } from '../core/logger';
import { NotFoundError } from '../core/errors';
import { creditWallet } from './wallet.service';
import { notifyUser, sse } from './notification.service';

/**
 * Quests & XP engine.
 * XP is granted the moment a quest completes; credits are granted on claim.
 * progressQuest() is hook-safe: unknown/inactive quests are skipped silently.
 */

export interface QuestDefinition {
  code: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'onetime';
  xpReward: number;
  creditReward: number;
  target: number;
}

export const DEFAULT_QUESTS: QuestDefinition[] = [
  { code: 'daily_login', title: 'Daily Login', description: 'Check in every day to keep your streak alive', type: 'daily', xpReward: 10, creditReward: 0, target: 1 },
  { code: 'daily_purchase', title: 'Shopaholic', description: 'Complete 1 purchase today', type: 'daily', xpReward: 40, creditReward: 50, target: 1 },
  { code: 'daily_review', title: 'Critic', description: 'Leave 1 product review today', type: 'daily', xpReward: 15, creditReward: 20, target: 1 },
  { code: 'first_purchase', title: 'First Blood', description: 'Complete your very first purchase', type: 'onetime', xpReward: 100, creditReward: 200, target: 1 },
  { code: 'referrer_1', title: 'Recruiter', description: 'Invite your first friend via your referral link', type: 'onetime', xpReward: 150, creditReward: 500, target: 1 },
  { code: 'ai_explorer', title: 'AI Explorer', description: 'Try any AI agent once', type: 'onetime', xpReward: 30, creditReward: 30, target: 1 },
];

/** Level curve: level = 1 + floor(sqrt(max(xp,0)) / 10). */
export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(xp, 0)) / 10);
}

function isoWeek(date: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7; // Mon = 0
  t.setUTCDate(t.getUTCDate() - dayNum + 3); // Thursday of this ISO week
  const isoYear = t.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: isoYear, week };
}

/** daily → 'YYYY-MM-DD', weekly → 'YYYY-Www', onetime → 'forever' (UTC). */
export async function periodKey(type: string, date: Date = new Date()): Promise<string> {
  if (type === 'onetime') return 'forever';
  if (type === 'weekly') {
    const { year, week } = isoWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Seed/upsert the default quest catalog (used by seed script + first boot). */
export async function ensureDefaultQuests(): Promise<Quest[]> {
  const out: Quest[] = [];
  for (const def of DEFAULT_QUESTS) {
    const quest = await db.quest.upsert({
      where: { code: def.code },
      update: {
        title: def.title,
        description: def.description,
        type: def.type,
        xpReward: def.xpReward,
        creditReward: def.creditReward,
        target: def.target,
      },
      create: { ...def, active: true },
    });
    out.push(quest);
  }
  logger.debug({ count: out.length }, '🎯 default quests ensured');
  return out;
}

export interface QuestView {
  quest: Quest;
  progress: number;
  completed: boolean;
  claimable: boolean;
}

/** All active quests with the user's progress in their CURRENT period. */
export async function listQuestsForUser(userId: string): Promise<QuestView[]> {
  const quests = await db.quest.findMany({
    where: { active: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });
  if (quests.length === 0) return [];

  const keys = Array.from(new Set(await Promise.all(quests.map((q) => periodKey(q.type)))));
  const rows = await db.userQuest.findMany({
    where: { userId, periodKey: { in: keys } },
  });
  const byQuest = new Map(rows.map((r) => [r.questId, r]));

  return quests.map((quest) => {
    const row = byQuest.get(quest.id);
    return {
      quest,
      progress: row?.progress ?? 0,
      completed: !!row?.completedAt,
      claimable: !!row?.completedAt && !row.rewardClaimed,
    };
  });
}

/**
 * Advance a quest by `delta`. Unknown/inactive quests are skipped silently.
 * On reaching target: completedAt is set, XP is granted immediately, the user
 * is notified; credits remain claimable via claimReward().
 */
export async function progressQuest(userId: string, code: string, delta = 1): Promise<void> {
  try {
    const quest = await db.quest.findUnique({ where: { code } });
    if (!quest || !quest.active) return;

    const step = Number.isFinite(delta) && delta > 0 ? Math.floor(delta) : 1;
    const pk = await periodKey(quest.type);

    const row = await db.userQuest.upsert({
      where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey: pk } },
      update: { progress: { increment: step } },
      create: { userId, questId: quest.id, periodKey: pk, progress: step },
    });

    sse('quest_progress', { userId, code, progress: row.progress, target: quest.target });

    if (!row.completedAt && row.progress >= quest.target) {
      const claimedCompletion = await db.userQuest.updateMany({
        where: { id: row.id, completedAt: null },
        data: { completedAt: new Date() },
      });
      if (claimedCompletion.count !== 1) return; // completed concurrently

      try {
        await addXp(userId, quest.xpReward);
      } catch (err) {
        logger.error({ err, userId, code }, '🎯 quest XP grant failed');
      }

      const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
      if (user) {
        const creditNote = quest.creditReward > 0 ? ` — ${quest.creditReward} credits ready to claim 🎁` : '';
        notifyUser(user.telegramId, `🏆 Quest complete: ${quest.title} (+${quest.xpReward} XP${creditNote})`);
      }
      sse('quest_completed', { userId, code, title: quest.title });
      logger.info({ userId, code }, '🎯 quest completed');
    }
  } catch (err) {
    // Quest progress must NEVER break the main business flow.
    logger.error({ err, userId, code }, '🎯 progressQuest failed (swallowed)');
  }
}

export interface ClaimResult {
  ok: boolean;
  xp?: number;
  credits?: number;
  message?: string;
}

/** Claim the credit reward of a completed quest (XP was already granted). */
export async function claimReward(userId: string, questId: string): Promise<ClaimResult> {
  const quest = await db.quest.findUnique({ where: { id: questId } });
  if (!quest) return { ok: false, message: 'Quest not found' };

  const pk = await periodKey(quest.type);
  const row = await db.userQuest.findUnique({
    where: { userId_questId_periodKey: { userId, questId, periodKey: pk } },
  });
  if (!row || !row.completedAt) return { ok: false, message: 'Quest not completed yet' };
  if (row.rewardClaimed) return { ok: false, message: 'Reward already claimed' };

  // Atomic claim guard — prevents double-claim under concurrency.
  const claimed = await db.userQuest.updateMany({
    where: { id: row.id, rewardClaimed: false },
    data: { rewardClaimed: true },
  });
  if (claimed.count !== 1) return { ok: false, message: 'Reward already claimed' };

  let credits = 0;
  if (quest.creditReward > 0) {
    await creditWallet(userId, quest.creditReward, 'credits', 'quest_reward', `quest:${quest.code}`);
    credits = quest.creditReward;
  }

  emitBus(BUS_EVENTS.QUEST_DONE, { userId, questId, code: quest.code, credits, xp: quest.xpReward });
  sse('quest_claimed', { userId, code: quest.code, credits });

  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  if (user && credits > 0) {
    notifyUser(user.telegramId, `🎁 Quest reward claimed: +${credits} credits (${quest.title})`);
  }
  return { ok: true, xp: quest.xpReward, credits };
}

/** Grant XP and handle level-ups (notifies the user on level up). */
export async function addXp(userId: string, amount: number): Promise<{ xp: number; level: number; levelUp: boolean }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('User');

  const inc = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
  if (inc === 0) {
    const current = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true, level: true } });
    return { xp: current.xp, level: current.level, levelUp: false };
  }

  const updated = await db.user.update({ where: { id: userId }, data: { xp: { increment: inc } } });
  const level = levelForXp(updated.xp);
  if (level > updated.level) {
    await db.user.update({ where: { id: userId }, data: { level } });
    notifyUser(updated.telegramId, `🌟 Level up! You reached level ${level}`);
    sse('level_up', { userId, level, xp: updated.xp });
    logger.info({ userId, level, xp: updated.xp }, '🌟 level up');
    return { xp: updated.xp, level, levelUp: true };
  }
  return { xp: updated.xp, level: updated.level, levelUp: false };
}

/**
 * Daily check-in. First touch of the day → progressQuest('daily_login') and
 * streak update (consecutive days; reset on gap). Same-day repeats are a noop.
 */
export async function touchDailyLogin(userId: string): Promise<{ streak: number }> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const quest = await db.quest.findUnique({ where: { code: 'daily_login' } });
  if (!quest || !quest.active) return { streak: user.streak };

  const todayPk = await periodKey('daily');
  const yesterdayPk = await periodKey('daily', new Date(Date.now() - 86_400_000));

  const latest = await db.userQuest.findFirst({
    where: { userId, questId: quest.id },
    orderBy: { periodKey: 'desc' },
  });

  // Already checked in today → welcome-noop.
  if (latest && latest.periodKey === todayPk) {
    return { streak: Math.max(user.streak, 1) };
  }

  const streak = latest && latest.periodKey === yesterdayPk ? user.streak + 1 : 1;
  await db.user.update({ where: { id: userId }, data: { streak } });
  await progressQuest(userId, 'daily_login');
  return { streak };
}

export async function getUserLevel(userId: string): Promise<{ xp: number; level: number }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { xp: true, level: true } });
  if (!user) throw new NotFoundError('User');
  return { xp: user.xp, level: user.level };
}
