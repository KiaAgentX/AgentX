/**
 * Post-fix data repair:
 *  1) Restore default quests (daily_login etc. — wiped by legacy migration)
 *  2) Backfill XP/level from real legacy activity (leaderboard revive)
 *  3) Set sensible support/brand settings
 */
import 'dotenv/config';
import { db } from '../src/core/db';
import { levelForXp, ensureDefaultQuests } from '../src/services/quest.service';
import { setSetting } from '../src/services/settings.service';

async function main(): Promise<void> {
  console.log('🛠  data-fix starting…');

  // 1) Default quests (upsert — safe)
  const quests = await ensureDefaultQuests();
  console.log(`🎯 default quests ensured: ${quests.length}`);

  // 2) XP backfill from legacy activity
  const users = await db.user.findMany({ select: { id: true, xp: true, level: true, telegramId: true } });
  let updated = 0;
  let totalXp = 0;
  for (const u of users) {
    const [purchases, sales, reviews, referrals, claims] = await Promise.all([
      db.order.count({ where: { buyerId: u.id } }),
      db.product.count({ where: { sellerId: u.id, salesCount: { gt: 0 } } })
        .then(async (flagged) => {
          if (flagged === 0) return 0;
          const prods = await db.product.findMany({ where: { sellerId: u.id }, select: { salesCount: true } });
          return prods.reduce((acc, p) => acc + p.salesCount, 0);
        }),
      db.review.count({ where: { userId: u.id } }),
      db.referral.count({ where: { referrerId: u.id } }),
      db.userQuest.count({ where: { userId: u.id, rewardClaimed: true } }),
    ]);
    const xp = purchases * 15 + sales * 10 + reviews * 10 + referrals * 5 + claims * 20;
    totalXp += xp;
    if (xp > u.xp) {
      await db.user.update({ where: { id: u.id }, data: { xp, level: levelForXp(xp) } });
      updated += 1;
    }
  }
  console.log(`💎 XP backfilled for ${updated}/${users.length} users (total xp ${totalXp})`);

  // 3) Settings: support + brand
  await setSetting('support_telegram', '@ImXforevr');
  await setSetting('brand_name', 'XDrop Marketplace');
  await setSetting('brand_tagline', 'بازار دیجیتال شما، روی اتوپایلوت');
  await setSetting('brand_footer', 'Powered by XDrop');
  console.log('🏷  brand/support settings set');

  // Report
  const top = await db.user.findMany({ orderBy: { xp: 'desc' }, take: 5, select: { firstName: true, xp: true, level: true } });
  console.log('🏆 top XP:', top.map((u) => `${u.firstName}: ${u.xp}xp L${u.level}`).join(' | '));
  const q = await db.quest.count();
  console.log(`🎯 quests total now: ${q}`);
}

main()
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('❌ data-fix FAILED:', err);
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
