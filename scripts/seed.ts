import 'dotenv/config'; // MUST be first — loads .env before config.ts parses process.env
import { config } from '../src/config';
import { db } from '../src/core/db';
import { logger } from '../src/core/logger';
import { newId } from '../src/core/ids';
import { SETTING_DEFAULTS, setSetting } from '../src/services/settings.service';
import { ensureDefaultQuests } from '../src/services/quest.service';
import { creditWallet, getOrCreateWallet } from '../src/services/wallet.service';
import { createProduct, type CreateProductInput } from '../src/services/marketplace.service';
import { createOrder } from '../src/services/order.service';
import { upsertKnowledge } from '../src/rag/knowledge.service';

/**
 * Idempotent seed script — safe to run repeatedly.
 * Creates: owner user + wallet, default settings, default quests, 6 demo
 * products, 8 knowledge-base items, 2 demo users with wallets, funded
 * balances and 2 paid orders (so the dashboard is not empty).
 * NEVER creates Approval rows. NEVER touches production-like secrets.
 */

const DEMO_PRODUCTS: CreateProductInput[] = [
  {
    title: 'Telegram Mini App Starter Kit',
    description: 'Production-ready Telegram Mini App boilerplate: session handling, Stars payments, quests and an admin dashboard.',
    category: 'template',
    priceStars: 450,
    stock: -1,
    delivery: 'auto',
    deliveryPayload: 'https://example.com/downloads/mini-app-starter.zip',
  },
  {
    title: 'Custom AI Cover Artwork',
    description: 'Hand-tuned generative artwork for your brand — three variants with full commercial license.',
    category: 'art',
    priceStars: 250,
    stock: 50,
    delivery: 'manual',
  },
  {
    title: '1:1 Growth Strategy Call (60 min)',
    description: 'Live video consultation on growth funnels, Telegram distribution and retention loops.',
    category: 'service',
    priceStars: 1500,
    stock: 20,
    delivery: 'manual',
  },
  {
    title: 'Lo-Fi Beat Pack Vol. 2',
    description: 'Ten royalty-free lo-fi loops for streams and videos (WAV + MP3).',
    category: 'music',
    priceStars: 300,
    stock: -1,
    delivery: 'auto',
    deliveryPayload: 'https://example.com/downloads/lofi-vol2.zip',
  },
  {
    title: 'Ebook: Dropshipping on Telegram',
    description: 'A 120-page playbook covering sourcing, bots, Stars payments and retention.',
    category: 'ebook',
    priceStars: 150,
    stock: -1,
    delivery: 'auto',
    deliveryPayload: 'https://example.com/downloads/dropshipping-ebook.pdf',
  },
  {
    title: 'Digital Loyalty Card Template',
    description: 'Editable Figma + code template for a Telegram loyalty mini app with streak rewards.',
    category: 'digital',
    priceStars: 100,
    stock: 100,
    delivery: 'auto',
    deliveryPayload: 'https://example.com/downloads/loyalty-template.zip',
  },
];

const DEMO_KNOWLEDGE: Array<{ title: string; content: string; tags: string[] }> = [
  {
    title: 'Welcome to KIA DropAgentX',
    content:
      'KIA DropAgentX is a Telegram super-app: an AI-powered marketplace, wallet, quests and bookings in one bot. Start with /start, browse the market and top up your wallet with Telegram Stars. Our AI agents answer questions 24/7 and escalate anything sensitive to a human owner.',
    tags: ['welcome', 'basics'],
  },
  {
    title: 'Refund Policy',
    content:
      'Refunds are available for paid orders that were not delivered as described. Requests go through a human approval step: file the request with the order id and the owner reviews it, usually within 24 hours. Approved refunds are credited back to your wallet automatically; cash refunds to cards are not supported.',
    tags: ['refunds', 'policy'],
  },
  {
    title: 'Delivery Policy',
    content:
      'Digital products marked "auto" are delivered instantly after payment — check your order page or wallet messages. Products marked "manual" are delivered by the seller, normally within 12 hours. If an auto-delivery failed, contact support with the order id and we will re-send it.',
    tags: ['delivery', 'policy'],
  },
  {
    title: 'FAQ: Pricing and Currencies',
    content:
      'Prices are shown in Telegram Stars; every product also has an equivalent credits price for wallet payments. Top-ups convert Stars to credits at the rate set by the store (default 100 credits per Star). All prices are integers — there are no hidden fees; marketplace commission is paid by the seller.',
    tags: ['faq', 'pricing'],
  },
  {
    title: 'FAQ: Support and Contact',
    content:
      'The support agent handles order issues, refunds and bug reports around the clock. If something needs a human, it is escalated straight to the store owner with your context attached. You can also request a support call from the bookings section during working hours.',
    tags: ['faq', 'support'],
  },
  {
    title: 'Bookings Guide',
    content:
      'Book consultations, demos and support calls directly in the bot. Slots are hourly, in UTC, within the store working hours (default 09:00-18:00 UTC); a slot disappears once someone books it. You get a reminder before every booking and can cancel any of your own bookings up to start time.',
    tags: ['bookings', 'guide'],
  },
  {
    title: 'Referral Program',
    content:
      'Every user gets a personal referral link — find it in the wallet menu. When a friend joins through your link and makes their first purchase, you both earn a credits bonus (default 500 credits for you). There is no limit on referrals; leaderboards reset never.',
    tags: ['referrals', 'rewards'],
  },
  {
    title: 'Security Overview',
    content:
      'Your balance is protected by atomic transactions and every risky action — withdrawals, refunds, broadcasts — waits for an explicit human approval. The platform runs a 15-layer security pipeline: rate limiting, role checks, input sanitization, anti-replay and full audit trails. We never ask for your Telegram password or payment credentials in chat.',
    tags: ['security', 'trust'],
  },
];

const DEMO_TOPUP_CREDITS = 500_000;

async function seedOwner(): Promise<{ id: string; telegramId: string }> {
  const ownerTelegramId = config.access.ownerIds.length > 0 ? String(config.access.ownerIds[0]) : '900000000';
  if (config.access.ownerIds.length === 0) {
    logger.warn('OWNER_IDS empty — using placeholder owner telegramId 900000000');
  }

  const owner = await db.user.upsert({
    where: { telegramId: ownerTelegramId },
    update: { role: 'owner', status: 'active' },
    create: {
      telegramId: ownerTelegramId,
      firstName: 'Owner',
      role: 'owner',
      language: 'en',
      status: 'active',
      referralCode: `KIA-OWN-${newId().slice(0, 8).toUpperCase()}`,
    },
  });
  await getOrCreateWallet(owner.id);
  return { id: owner.id, telegramId: owner.telegramId };
}

async function seedSettings(): Promise<number> {
  let created = 0;
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    const exists = await db.setting.findUnique({ where: { key }, select: { key: true } });
    if (!exists) {
      await setSetting(key, value);
      created += 1;
    }
  }
  return created;
}

async function seedProducts(ownerId: string): Promise<number> {
  let created = 0;
  for (const input of DEMO_PRODUCTS) {
    const existing = await db.product.findFirst({ where: { sellerId: ownerId, title: input.title }, select: { id: true } });
    if (existing) continue;
    await createProduct(ownerId, input);
    created += 1;
  }
  return created;
}

async function seedKnowledge(): Promise<number> {
  let created = 0;
  for (const item of DEMO_KNOWLEDGE) {
    const existing = await db.knowledgeItem.findFirst({ where: { title: item.title }, select: { id: true } });
    if (existing) continue;
    await upsertKnowledge({ title: item.title, content: item.content, tags: item.tags });
    created += 1;
  }
  return created;
}

async function fundDemoUser(userId: string, key: string): Promise<void> {
  await getOrCreateWallet(userId);
  const existing = await db.transaction.findFirst({ where: { type: 'topup_manual', reference: key }, select: { id: true } });
  if (existing) return;
  await creditWallet(userId, DEMO_TOPUP_CREDITS, 'credits', 'topup_manual', key, { seeded: true });
}

async function seedDemoUsersAndOrders(ownerId: string): Promise<{ users: number; orders: number }> {
  const demoUsers = [
    { telegramId: '900000001', firstName: 'Alina', username: 'alina_demo' },
    { telegramId: '900000002', firstName: 'Marco', username: 'marco_demo' },
  ];

  const ids: string[] = [];
  for (const u of demoUsers) {
    const user = await db.user.upsert({
      where: { telegramId: u.telegramId },
      update: {},
      create: {
        telegramId: u.telegramId,
        firstName: u.firstName,
        username: u.username,
        role: 'user',
        language: 'en',
        status: 'active',
        referralCode: `KIA-DEMO-${newId().slice(0, 8).toUpperCase()}`,
      },
    });
    ids.push(user.id);
    await fundDemoUser(user.id, `seed:topup:${u.telegramId}`);
  }
  const [alinaId] = ids;

  // Two paid orders for Alina (one auto-delivered product, one manual) so the
  // dashboard has revenue + transactions + orders from first boot.
  let ordersCreated = 0;
  const existingOrders = await db.order.count({ where: { buyerId: alinaId } });
  if (existingOrders === 0) {
    const targets = await db.product.findMany({
      where: { sellerId: ownerId, title: { in: ['Telegram Mini App Starter Kit', '1:1 Growth Strategy Call (60 min)'] } },
      select: { id: true },
    });
    for (const product of targets) {
      await createOrder(alinaId, product.id, { payWith: 'credits' });
      ordersCreated += 1;
    }
  }

  return { users: ids.length, orders: ordersCreated };
}

async function main(): Promise<void> {
  // ── Restored-data guard ────────────────────────────────────────────────────
  // The seed script is idempotent per-item, but it is meant for FRESH installs:
  // running it on a restored production database would inject demo users,
  // demo products and 1,000,000 credits of demo funding into your economy.
  const existingUsers = await db.user.count();
  if (existingUsers > 10 && !process.argv.includes('--force')) {
    logger.error(
      { existingUsers },
      '🛑 This database already contains users — refusing to seed demo data. Run with --force to override.'
    );
    // eslint-disable-next-line no-console
    console.error(
      `⚠️  Database has ${existingUsers} users — this looks like RESTORED data.\n` +
      '   Seeding demo artifacts into it would corrupt your economy.\n' +
      '   If you REALLY want demo data on top: npm run seed -- --force'
    );
    process.exit(1);
  }

  logger.info('🌱 seeding KIA DropAgentX…');

  const owner = await seedOwner();
  const settingsCreated = await seedSettings();
  await ensureDefaultQuests();
  const productsCreated = await seedProducts(owner.id);
  const knowledgeCreated = await seedKnowledge();
  const demo = await seedDemoUsersAndOrders(owner.id);

  const [usersTotal, productsTotal, ordersTotal, knowledgeTotal] = await Promise.all([
    db.user.count(),
    db.product.count(),
    db.order.count(),
    db.knowledgeItem.count(),
  ]);

  logger.info(
    {
      ownerTelegramId: owner.telegramId,
      settingsCreated,
      productsCreated,
      knowledgeCreated,
      demoUsers: demo.users,
      demoOrders: demo.orders,
      totals: { users: usersTotal, products: productsTotal, orders: ordersTotal, knowledge: knowledgeTotal },
    },
    '🌱 seed complete'
  );

  if (config.web.dashboardKey === config.security.mcpTokenSecret) {
    logger.warn('🔑 DASHBOARD_KEY falls back to MCP_TOKEN_SECRET — you can use MCP_TOKEN_SECRET as DASHBOARD_KEY (set an explicit DASHBOARD_KEY for production).');
  }
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, '🌱 seed FAILED');
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
