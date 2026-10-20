import { db } from '../core/db';

/**
 * Leaderboards — XP, sales (credits per seller), referrals.
 * Display names fall back to username, then a short id stub.
 */

export interface LeaderRow {
  userId: string;
  displayName: string;
  value: number;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(Math.floor(limit ?? fallback) || fallback, 1), 100);
}

interface NameParts {
  id: string;
  firstName: string | null;
  username: string | null;
}

function displayNameOf(u: NameParts): string {
  return u.firstName || u.username || `user-${u.id.slice(0, 6)}`;
}

export async function topByXp(limit = 10): Promise<LeaderRow[]> {
  const take = clampLimit(limit, 10);
  const users = await db.user.findMany({
    where: { status: 'active' },
    orderBy: [{ xp: 'desc' }, { createdAt: 'asc' }],
    take,
    select: { id: true, firstName: true, username: true, xp: true },
  });
  return users.map((u) => ({ userId: u.id, displayName: displayNameOf(u), value: u.xp }));
}

/** Sum of paid/delivered order totals (credits) grouped per seller. */
async function salesSums(): Promise<Map<string, number>> {
  const orders = await db.order.findMany({
    where: { status: { in: ['paid', 'delivered'] } },
    select: { totalCredits: true, product: { select: { sellerId: true } } },
  });
  const sums = new Map<string, number>();
  for (const o of orders) {
    sums.set(o.product.sellerId, (sums.get(o.product.sellerId) ?? 0) + o.totalCredits);
  }
  return sums;
}

export async function topBySales(limit = 10): Promise<LeaderRow[]> {
  const take = clampLimit(limit, 10);
  const sums = await salesSums();
  const top = Array.from(sums.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, take);
  if (top.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: { id: true, firstName: true, username: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return top.map(([id, value]) => {
    const u = byId.get(id);
    return { userId: id, displayName: u ? displayNameOf(u) : `user-${id.slice(0, 6)}`, value };
  });
}

export async function topByReferrals(limit = 10): Promise<LeaderRow[]> {
  const take = clampLimit(limit, 10);
  const groups = await db.referral.groupBy({
    by: ['referrerId'],
    _count: { _all: true },
    orderBy: { _count: { referrerId: 'desc' } },
    take,
  });
  if (groups.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: groups.map((g) => g.referrerId) } },
    select: { id: true, firstName: true, username: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return groups.map((g) => {
    const u = byId.get(g.referrerId);
    return { userId: g.referrerId, displayName: u ? displayNameOf(u) : `user-${g.referrerId.slice(0, 6)}`, value: g._count._all };
  });
}

export async function getUserRanks(userId: string): Promise<{ xp: number | null; sales: number | null; referrals: number | null }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, xp: true } });
  if (!user) return { xp: null, sales: null, referrals: null };

  // XP rank: 1 + number of active users strictly ahead.
  const xpHigher = await db.user.count({
    where: { status: 'active', xp: { gt: user.xp } },
  });
  const xp = xpHigher + 1;

  // Sales rank: only ranked when the user actually sold something.
  let sales: number | null = null;
  const sums = await salesSums();
  const mySales = sums.get(userId);
  if (mySales !== undefined) {
    const higher = Array.from(sums.values()).filter((v) => v > mySales).length;
    sales = higher + 1;
  }

  // Referral rank: only ranked with at least one referral.
  let referrals: number | null = null;
  const myRefCount = await db.referral.count({ where: { referrerId: userId } });
  if (myRefCount > 0) {
    const groups = await db.referral.groupBy({ by: ['referrerId'], _count: { _all: true } });
    const higher = groups.filter((g) => g._count._all > myRefCount).length;
    referrals = higher + 1;
  }

  return { xp, sales, referrals };
}
