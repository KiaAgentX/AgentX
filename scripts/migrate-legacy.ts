/**
 * Legacy marketplace DB → KIA DropAgentX migration.
 * Source: /home/z/my-project/upload/extracted/marketplace-20260924-0400.db (old Hermes Marketplace)
 * Target: DropAgentX Prisma/SQLite (file:/home/z/my-project/db/custom.db)
 *
 * Idempotent-ish: wipes dynamic tables first, then imports legacy data.
 * Settings table (defaults/brand) is preserved.
 */
import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

const LEGACY_DB = '/home/z/my-project/upload/extracted/marketplace-20260924-0400.db';
const OWNER_TG = '8198598635';

const db = new PrismaClient();
const legacy = new DatabaseSync(LEGACY_DB, { readOnly: true });

const round = (n: number | null | undefined): number => Math.round(Number(n ?? 0));
const dt = (sec: number | null | undefined, fallback = new Date()): Date =>
  sec && Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000) : fallback;
const clip = (s: string | null | undefined, n = 400): string =>
  (s ?? '').toString().slice(0, n);

/** Map legacy tx_type → DropAgentX transaction type. */
function mapTxType(t: string): string {
  switch (t) {
    case 'deposit':
    case 'admin_grant':
      return 'topup_manual';
    case 'purchase':
      return 'purchase';
    case 'sale':
      return 'sale';
    case 'ref_bonus':
    case 'ref_commission':
    case 'ref_mystery':
    case 'ref_milestone':
      return 'referral_bonus';
    case 'quest_reward':
    case 'task_completion':
    case 'daily_bonus':
    case 'bonus':
    case 'launch_bonus':
    case 'giveaway':
      return 'quest_reward';
    case 'withdraw':
      return 'withdraw';
    default:
      return t; // ai_usage, custom_bot, task_creation … kept as-is
  }
}

function mapProductStatus(s: string): string {
  if (s === 'approved') return 'active';
  if (s === 'pending') return 'draft';
  return 'archived'; // rejected → archived
}

async function main(): Promise<void> {
  console.log('🚚 legacy migration starting…');

  // ── 0. Safety counts from legacy ───────────────────────────────────────────
  const counts = {
    users: legacy.prepare('SELECT COUNT(*) c FROM users').get()!.c as number,
    txs: legacy.prepare('SELECT COUNT(*) c FROM transactions').get()!.c as number,
    products: legacy.prepare('SELECT COUNT(*) c FROM products').get()!.c as number,
    purchases: legacy.prepare('SELECT COUNT(*) c FROM purchases').get()!.c as number,
    reviews: legacy.prepare('SELECT COUNT(*) c FROM reviews').get()!.c as number,
    quests: legacy.prepare('SELECT COUNT(*) c FROM quests').get()!.c as number,
    claims: legacy.prepare('SELECT COUNT(*) c FROM quest_claims').get()!.c as number,
    referrals: legacy.prepare('SELECT COUNT(*) c FROM users WHERE referred_by IS NOT NULL').get()!.c as number,
  };
  console.log('📊 legacy counts:', counts);

  // ── 1. Wipe current dynamic data (Settings preserved) ─────────────────────
  console.log('🧹 wiping current dynamic data…');
  await db.transaction.deleteMany();
  await db.userQuest.deleteMany();
  await db.referral.deleteMany();
  await db.review.deleteMany();
  await db.order.deleteMany();
  await db.product.deleteMany();
  await db.quest.deleteMany();
  await db.wallet.deleteMany();
  await db.knowledgeItem.deleteMany();
  await db.user.deleteMany();

  // ── 2. Users + Wallets ─────────────────────────────────────────────────────
  console.log('👥 migrating users + wallets…');
  const oldUsers = legacy
    .prepare('SELECT user_id, username, first_name, credits, daily_streak, referred_by, created_at, last_seen, is_banned, role FROM users ORDER BY created_at ASC')
    .all() as Array<{
    user_id: number; username: string | null; first_name: string | null; credits: number;
    daily_streak: number | null; referred_by: number | null; created_at: number | null;
    last_seen: number | null; is_banned: number; role: string;
  }>;

  const oldToNewId = new Map<number, string>();
  let walletCreditsTotal = 0;

  for (const u of oldUsers) {
    const tg = String(u.user_id);
    const created = await db.user.create({
      data: {
        telegramId: tg,
        username: u.username ?? null,
        firstName: u.first_name ?? null,
        language: 'fa',
        role: tg === OWNER_TG ? 'owner' : 'user',
        status: u.is_banned === 1 ? 'blocked' : 'active',
        streak: u.daily_streak ?? 0,
        lastSeenAt: dt(u.last_seen, dt(u.created_at)),
        referralCode: `KIA-${tg}`,
        createdAt: dt(u.created_at),
      },
    });
    oldToNewId.set(u.user_id, created.id);

    const credits = round(u.credits);
    walletCreditsTotal += credits;
    await db.wallet.create({
      data: { userId: created.id, credits, stars: 0, frozen: 0 },
    });
  }
  console.log(`  users: ${oldToNewId.size}, wallet credits sum: ${walletCreditsTotal}`);

  // ── 3. Referrals (from users.referred_by) ─────────────────────────────────
  console.log('🔗 migrating referral links…');
  let refCount = 0;
  for (const u of oldUsers) {
    if (u.referred_by == null) continue;
    const referrerNew = oldToNewId.get(u.referred_by);
    const refereeNew = oldToNewId.get(u.user_id);
    if (!referrerNew || !refereeNew || referrerNew === refereeNew) continue;
    await db.referral.create({
      data: { referrerId: referrerNew, refereeId: refereeNew, rewardCredits: 0, status: 'credited' },
    });
    await db.user.update({ where: { id: refereeNew }, data: { referredById: referrerNew } });
    refCount++;
  }
  console.log(`  referrals: ${refCount}`);

  // ── 4. Transactions ───────────────────────────────────────────────────────
  console.log('💰 migrating transactions…');
  const oldTxs = legacy
    .prepare('SELECT id, user_id, amount, tx_type, description, created_at FROM transactions ORDER BY created_at ASC')
    .all() as Array<{ id: number; user_id: number; amount: number; tx_type: string; description: string | null; created_at: number | null }>;
  let txCount = 0, txSkipped = 0;
  for (const t of oldTxs) {
    const wallet = await db.wallet.findUnique({ where: { userId: oldToNewId.get(t.user_id) ?? '' }, select: { id: true } });
    if (!wallet) { txSkipped++; continue; }
    await db.transaction.create({
      data: {
        walletId: wallet.id,
        type: mapTxType(t.tx_type),
        amount: round(t.amount),
        currency: 'credits',
        status: 'completed',
        reference: `legacy:${t.id}`,
        meta: JSON.stringify({ legacyType: t.tx_type, description: clip(t.description, 200) }),
        createdAt: dt(t.created_at),
      },
    });
    txCount++;
  }
  console.log(`  transactions: ${txCount} (skipped: ${txSkipped})`);

  // ── 5. Products ───────────────────────────────────────────────────────────
  console.log('📦 migrating products…');
  const oldProducts = legacy
    .prepare('SELECT id, creator_id, title, description, price_credits, category, tags, sales_count, is_active, is_featured, status, link, created_at FROM products ORDER BY created_at ASC')
    .all() as Array<{
    id: number; creator_id: number; title: string; description: string | null; price_credits: number;
    category: string | null; tags: string | null; sales_count: number | null; is_active: number;
    is_featured: number; status: string; link: string | null; created_at: number | null;
  }>;
  const oldToNewProduct = new Map<number, string>();
  let prodCount = 0;
  for (const p of oldProducts) {
    const seller = oldToNewId.get(p.creator_id);
    if (!seller) continue;
    const hasLink = !!p.link && p.link.trim().length > 0;
    const created = await db.product.create({
      data: {
        sellerId: seller,
        title: clip(p.title, 200),
        description: clip(p.description ?? '', 2000),
        category: p.category === 'template' ? 'templates' : (p.category ?? 'general'),
        priceStars: Math.max(1, round(p.price_credits / 100)),
        priceCredits: round(p.price_credits),
        stock: -1,
        status: mapProductStatus(p.status),
        featured: p.is_featured === 1,
        delivery: hasLink ? 'auto' : 'manual',
        deliveryPayload: hasLink ? p.link!.trim() : null,
        salesCount: p.sales_count ?? 0,
        createdAt: dt(p.created_at),
      },
    });
    oldToNewProduct.set(p.id, created.id);
    prodCount++;
  }
  console.log(`  products: ${prodCount}`);

  // ── 6. Orders (legacy purchases → delivered orders) ───────────────────────
  console.log('🧾 migrating orders…');
  const oldPurchases = legacy
    .prepare('SELECT id, buyer_id, product_id, price_credits, purchased_at, created_at FROM purchases ORDER BY created_at ASC')
    .all() as Array<{ id: number; buyer_id: number; product_id: number; price_credits: number; purchased_at: number | null; created_at: number | null }>;
  let ordCount = 0, ordSkipped = 0;
  for (const o of oldPurchases) {
    const buyer = oldToNewId.get(o.buyer_id);
    const product = oldToNewProduct.get(o.product_id);
    if (!buyer || !product) { ordSkipped++; continue; }
    const credits = round(o.price_credits);
    await db.order.create({
      data: {
        buyerId: buyer,
        productId: product,
        quantity: 1,
        totalStars: Math.max(1, round(credits / 100)),
        totalCredits: credits,
        currency: 'credits',
        status: 'delivered',
        paymentRef: `legacy_purchase:${o.id}`,
        createdAt: dt(o.purchased_at ?? o.created_at),
      },
    });
    ordCount++;
  }
  console.log(`  orders: ${ordCount} (skipped: ${ordSkipped})`);

  // ── 7. Reviews + product rating aggregates ────────────────────────────────
  console.log('⭐ migrating reviews…');
  const oldReviews = legacy
    .prepare('SELECT id, product_id, buyer_id, stars, created_at FROM reviews ORDER BY created_at ASC')
    .all() as Array<{ id: number; product_id: number; buyer_id: number; stars: number; created_at: number | null }>;
  let revCount = 0;
  const ratingAgg = new Map<string, { sum: number; count: number }>();
  for (const r of oldReviews) {
    const product = oldToNewProduct.get(r.product_id);
    const user = oldToNewId.get(r.buyer_id);
    if (!product || !user) continue;
    const rating = Math.min(5, Math.max(1, round(r.stars)));
    await db.review.create({
      data: { productId: product, userId: user, rating, comment: '', createdAt: dt(r.created_at) },
    }).catch(() => null); // unique(productId,userId) — legacy dups fail soft
    revCount++;
    const agg = ratingAgg.get(product) ?? { sum: 0, count: 0 };
    agg.sum += rating; agg.count += 1;
    ratingAgg.set(product, agg);
  }
  for (const [productId, agg] of ratingAgg) {
    await db.product.update({
      where: { id: productId },
      data: { ratingAvg: Math.round((agg.sum / agg.count) * 100) / 100, ratingCount: agg.count },
    });
  }
  console.log(`  reviews: ${revCount}`);

  // ── 8. Quests + claims ────────────────────────────────────────────────────
  console.log('🎯 migrating quests…');
  const oldQuests = legacy
    .prepare('SELECT id, title, quest_type, target, reward_credits, active FROM quests')
    .all() as Array<{ id: number; title: string; quest_type: string; target: number; reward_credits: number; active: number }>;
  const oldToNewQuest = new Map<number, string>();
  for (const q of oldQuests) {
    const created = await db.quest.create({
      data: {
        code: `legacy_${q.quest_type}`,
        title: q.title,
        description: `کوئست منتقل‌شده از مارکت‌پلیس قبلی (${q.quest_type})`,
        type: 'onetime',
        xpReward: 10,
        creditReward: round(q.reward_credits),
        target: q.target ?? 1,
        active: q.active === 1,
      },
    });
    oldToNewQuest.set(q.id, created.id);
  }
  const oldClaims = legacy
    .prepare('SELECT quest_id, user_id, claimed_at FROM quest_claims')
    .all() as Array<{ quest_id: number; user_id: number; claimed_at: number | null }>;
  let claimCount = 0;
  for (const c of oldClaims) {
    const user = oldToNewId.get(c.user_id);
    const quest = oldToNewQuest.get(c.quest_id);
    if (!user || !quest) continue;
    await db.userQuest.create({
      data: {
        userId: user, questId: quest, progress: 1,
        completedAt: dt(c.claimed_at), rewardClaimed: true, periodKey: 'forever',
      },
    }).catch(() => null);
    claimCount++;
  }
  console.log(`  quests: ${oldQuests.length}, claims: ${claimCount}`);

  // ── 9. Knowledge base (content_pages + kb_notes) ──────────────────────────
  console.log('📚 migrating knowledge base…');
  let kbCount = 0;
  const pages = legacy.prepare('SELECT key, title, body FROM content_pages').all() as Array<{ key: string; title: string; body: string }>;
  for (const p of pages) {
    await db.knowledgeItem.create({
      data: { title: p.title || p.key, content: p.body, tags: 'legacy,page', source: 'import' },
    });
    kbCount++;
  }
  const notes = legacy.prepare('SELECT topic, content, source, created_at FROM kb_notes').all() as Array<{ topic: string; content: string; source: string | null; created_at: number | null }>;
  for (const n of notes) {
    await db.knowledgeItem.create({
      data: { title: n.topic, content: n.content, tags: 'legacy,kb', source: 'import', createdAt: dt(n.created_at) },
    });
    kbCount++;
  }
  console.log(`  knowledge items: ${kbCount}`);

  // ── 10. Verification ──────────────────────────────────────────────────────
  const [nu, nw, nt, np, no, nr, nrf, nq, nuq, nkb] = await Promise.all([
    db.user.count(), db.wallet.count(), db.transaction.count(), db.product.count(),
    db.order.count(), db.review.count(), db.referral.count(), db.quest.count(),
    db.userQuest.count(), db.knowledgeItem.count(),
  ]);
  const walletSum = await db.wallet.aggregate({ _sum: { credits: true } });
  const owner = await db.user.findUnique({ where: { telegramId: OWNER_TG }, include: { wallet: true } });

  console.log('\n══════════ MIGRATION REPORT ══════════');
  console.log(`users:          ${nu}  (legacy ${counts.users})`);
  console.log(`wallets:        ${nw}  | credits sum: ${walletSum._sum.credits ?? 0}  (legacy ${walletCreditsTotal})`);
  console.log(`transactions:   ${nt}  (legacy ${counts.txs})`);
  console.log(`products:       ${np}  (legacy ${counts.products})`);
  console.log(`orders:         ${no}  (legacy ${counts.purchases})`);
  console.log(`reviews:        ${nr}  (legacy ${counts.reviews})`);
  console.log(`referrals:      ${nrf}  (legacy ${counts.referrals})`);
  console.log(`quests:         ${nq} + claims ${nuq}`);
  console.log(`knowledge:      ${nkb}`);
  console.log(`owner ${OWNER_TG}: role=${owner?.role} credits=${owner?.wallet?.credits ?? '?'}`);
  const mismatch = (walletSum._sum.credits ?? 0) !== walletCreditsTotal;
  console.log(mismatch ? '⚠️  WALLET SUM MISMATCH!' : '✅ wallet credits match legacy total');
  console.log('═══════════════════════════════════════');
}

main()
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('❌ migration FAILED:', err);
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
