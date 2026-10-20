import { Prisma, Product, Review } from '@prisma/client';
import { db } from '../core/db';
import { logger } from '../core/logger';
import { NotFoundError, PermissionDeniedError, ValidationError } from '../core/errors';
import { getCreditsPerStar } from './settings.service';
import { progressQuest } from './quest.service';

/**
 * Marketplace catalog: products, reviews, categories, featuring.
 * Staff = role 'admin' | 'owner'. Everyone else is bound to their own rows.
 */

export interface CreateProductInput {
  title: string;
  description?: string;
  category?: string;
  priceStars: number;
  priceCredits?: number;
  /** -1 = unlimited. */
  stock?: number;
  delivery?: 'auto' | 'manual';
  deliveryPayload?: string | null;
  aiGenerated?: boolean;
}

export interface ListProductsOpts {
  page?: number;
  perPage?: number;
  category?: string;
  search?: string;
  sellerId?: string;
  featuredOnly?: boolean;
  /** Staff view: include drafts/archived/flagged products. */
  includeAll?: boolean;
}

const PRODUCT_STATUSES = ['draft', 'active', 'archived', 'flagged'] as const;
const DELIVERY_MODES = ['auto', 'manual'] as const;

/** True when the user id belongs to an admin/owner account. */
export async function isStaffUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return !!user && (user.role === 'admin' || user.role === 'owner');
}

export async function createProduct(sellerId: string, input: CreateProductInput): Promise<Product> {
  const title = (input.title ?? '').trim();
  if (!title) throw new ValidationError('Product title is required');
  if (!Number.isInteger(input.priceStars) || input.priceStars <= 0) {
    throw new ValidationError('priceStars must be a positive integer');
  }

  const creditsPerStar = await getCreditsPerStar();
  const priceCredits = input.priceCredits ?? input.priceStars * creditsPerStar;
  if (!Number.isInteger(priceCredits) || priceCredits <= 0) {
    throw new ValidationError('priceCredits must be a positive integer');
  }
  const stock = input.stock ?? -1;
  if (!Number.isInteger(stock) || stock < -1) {
    throw new ValidationError('stock must be an integer >= -1 (-1 = unlimited)');
  }
  const delivery = input.delivery ?? 'auto';
  if (!DELIVERY_MODES.includes(delivery)) {
    throw new ValidationError('delivery must be "auto" or "manual"');
  }

  const product = await db.product.create({
    data: {
      sellerId,
      title,
      description: input.description ?? '',
      category: input.category?.trim() || 'general',
      priceStars: input.priceStars,
      priceCredits,
      stock,
      status: 'active',
      delivery,
      deliveryPayload: input.deliveryPayload ?? null,
      aiGenerated: input.aiGenerated ?? false,
    },
  });
  logger.info({ productId: product.id, sellerId }, '🛍️ product created');
  return product;
}

export async function updateProduct(
  productId: string,
  actorUserId: string,
  patch: Partial<CreateProductInput> & { status?: string }
): Promise<Product> {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Product');
  if (actorUserId !== product.sellerId && !(await isStaffUser(actorUserId))) {
    throw new PermissionDeniedError('Only the seller or staff can update this product');
  }

  const data: Prisma.ProductUpdateInput = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new ValidationError('Product title cannot be empty');
    data.title = title;
  }
  if (patch.description !== undefined) data.description = patch.description ?? '';
  if (patch.category !== undefined) data.category = patch.category.trim() || 'general';
  if (patch.priceStars !== undefined) {
    if (!Number.isInteger(patch.priceStars) || patch.priceStars <= 0) {
      throw new ValidationError('priceStars must be a positive integer');
    }
    data.priceStars = patch.priceStars;
  }
  if (patch.priceCredits !== undefined) {
    if (!Number.isInteger(patch.priceCredits) || patch.priceCredits <= 0) {
      throw new ValidationError('priceCredits must be a positive integer');
    }
    data.priceCredits = patch.priceCredits;
  }
  if (patch.stock !== undefined) {
    if (!Number.isInteger(patch.stock) || patch.stock < -1) {
      throw new ValidationError('stock must be an integer >= -1');
    }
    data.stock = patch.stock;
  }
  if (patch.delivery !== undefined) {
    if (!DELIVERY_MODES.includes(patch.delivery)) {
      throw new ValidationError('delivery must be "auto" or "manual"');
    }
    data.delivery = patch.delivery;
  }
  if (patch.deliveryPayload !== undefined) data.deliveryPayload = patch.deliveryPayload ?? null;
  if (patch.aiGenerated !== undefined) data.aiGenerated = patch.aiGenerated;
  if (patch.status !== undefined) {
    if (!PRODUCT_STATUSES.includes(patch.status as (typeof PRODUCT_STATUSES)[number])) {
      throw new ValidationError(`status must be one of: ${PRODUCT_STATUSES.join(', ')}`);
    }
    data.status = patch.status;
  }

  return db.product.update({ where: { id: productId }, data });
}

export async function archiveProduct(productId: string, actorUserId: string): Promise<Product> {
  return updateProduct(productId, actorUserId, { status: 'archived' });
}

export async function getProduct(productId: string): Promise<Product | null> {
  return db.product.findUnique({
    where: { id: productId },
    include: { seller: { select: { firstName: true, username: true } } },
  });
}

export async function listProducts(
  opts: ListProductsOpts
): Promise<{ items: Product[]; total: number; page: number; pages: number }> {
  const perPage = Math.min(Math.max(Math.floor(opts.perPage ?? 10) || 10, 1), 50);
  const page = Math.max(Math.floor(opts.page ?? 1) || 1, 1);

  const where: Prisma.ProductWhereInput = {};
  // Staff includeAll → see every status; public view only sees active products.
  if (!opts.includeAll) where.status = 'active';
  if (opts.category) where.category = opts.category;
  if (opts.sellerId) where.sellerId = opts.sellerId;
  if (opts.featuredOnly) where.featured = true;
  // NOTE: Prisma `contains` compiles to SQLite LIKE which is case-insensitive
  // for ASCII — satisfying the case-insensitive search requirement.
  if (opts.search && opts.search.trim()) {
    const q = opts.search.trim();
    where.OR = [{ title: { contains: q } }, { description: { contains: q } }];
  }

  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { salesCount: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.product.count({ where }),
  ]);

  return { items, total, page, pages: Math.max(Math.ceil(total / perPage), 1) };
}

export async function addReview(
  userId: string,
  productId: string,
  rating: number,
  comment?: string
): Promise<Review> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be an integer between 1 and 5');
  }
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new NotFoundError('Product');

  // Only buyers with a paid/delivered order (or staff) may review — fail-closed.
  const purchases = await db.order.count({
    where: { buyerId: userId, productId, status: { in: ['paid', 'delivered'] } },
  });
  if (purchases === 0 && !(await isStaffUser(userId))) {
    throw new PermissionDeniedError('Only buyers of this product can leave a review');
  }

  const review = await db.review.upsert({
    where: { productId_userId: { productId, userId } },
    update: { rating, comment: comment ?? '' },
    create: { productId, userId, rating, comment: comment ?? '' },
  });

  // Recompute aggregate rating from scratch (SQLite-safe, small scale).
  const agg = await db.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await db.product.update({
    where: { id: productId },
    data: {
      ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      ratingCount: agg._count._all,
    },
  });

  // Quest hook — never breaks the review flow.
  try {
    await progressQuest(userId, 'daily_review');
  } catch (err) {
    logger.warn({ err, userId }, '🎯 daily_review quest hook failed (non-fatal)');
  }

  return review;
}

export async function getProductReviews(
  productId: string,
  limit = 20
): Promise<Array<Review & { user: { firstName: string | null; username: string | null } }>> {
  const take = Math.min(Math.max(Math.floor(limit) || 20, 1), 100);
  return db.review.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { user: { select: { firstName: true, username: true } } },
  });
}

export async function listCategories(): Promise<Array<{ category: string; count: number }>> {
  const groups = await db.product.groupBy({
    by: ['category'],
    where: { status: 'active' },
    _count: { _all: true },
  });
  return groups
    .map((g) => ({ category: g.category, count: g._count._all }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Feature/unfeature a product — staff only.
 * `actorUserId` is optional for contract compatibility: when provided the
 * staff role is verified here (fail-closed); when omitted the caller layer
 * must have checked permissions.
 */
export async function toggleFeatured(productId: string, featured: boolean, actorUserId?: string): Promise<Product> {
  if (actorUserId !== undefined && !(await isStaffUser(actorUserId))) {
    throw new PermissionDeniedError('Only staff can feature products');
  }
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new NotFoundError('Product');
  return db.product.update({ where: { id: productId }, data: { featured } });
}
