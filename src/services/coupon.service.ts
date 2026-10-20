import { Coupon } from '@prisma/client';
import { db } from '../core/db';
import { logger } from '../core/logger';
import { NotFoundError, ValidationError } from '../core/errors';
import { newId } from '../core/ids';

/**
 * Discount coupons — percent-based, usable on both stars and credits prices.
 * Codes are unique and stored uppercase.
 */

export interface CreateCouponInput {
  code?: string;
  /** 1..90 — enforced. */
  percentOff: number;
  /** -1 = unlimited uses. */
  maxUses?: number;
  activeUntil?: Date | null;
  createdBy?: string | null;
}

export interface ValidateCouponResult {
  ok: boolean;
  discountStars: number;
  coupon?: Coupon;
  reason?: string;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function generateCode(): string {
  return `KIA-${newId().slice(0, 6).toUpperCase()}`;
}

export async function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  const percentOff = input.percentOff;
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90) {
    throw new ValidationError('percentOff must be an integer between 1 and 90');
  }
  const maxUses = input.maxUses ?? -1;
  if (!Number.isInteger(maxUses) || maxUses < -1) {
    throw new ValidationError('maxUses must be an integer >= -1 (-1 = unlimited)');
  }

  // User-supplied code: strict (no silent overwrite). Auto code: retry on the
  // (astronomically unlikely) unique collision.
  if (input.code && input.code.trim().length > 0) {
    const code = normalizeCode(input.code);
    const existing = await db.coupon.findUnique({ where: { code } });
    if (existing) throw new ValidationError(`Coupon code "${code}" already exists`);
    return db.coupon.create({
      data: {
        code,
        percentOff,
        maxUses,
        activeUntil: input.activeUntil ?? null,
        createdBy: input.createdBy ?? null,
        active: true,
      },
    });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.coupon.create({
        data: {
          code: generateCode(),
          percentOff,
          maxUses,
          activeUntil: input.activeUntil ?? null,
          createdBy: input.createdBy ?? null,
          active: true,
        },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002' && attempt < 4) continue; // code collision → retry
      throw err;
    }
  }
  throw new ValidationError('Could not generate a unique coupon code');
}

export async function validateCoupon(code: string, priceStars: number): Promise<ValidateCouponResult> {
  const normalized = normalizeCode(code ?? '');
  if (!normalized) return { ok: false, discountStars: 0, reason: 'Coupon code is required' };

  const coupon = await db.coupon.findUnique({ where: { code: normalized } });
  if (!coupon) return { ok: false, discountStars: 0, reason: 'Coupon not found' };
  if (!coupon.active) return { ok: false, discountStars: 0, reason: 'Coupon is inactive' };

  const now = Date.now();
  if (coupon.activeFrom && coupon.activeFrom.getTime() > now) {
    return { ok: false, discountStars: 0, reason: 'Coupon is not active yet' };
  }
  if (coupon.activeUntil && coupon.activeUntil.getTime() < now) {
    return { ok: false, discountStars: 0, reason: 'Coupon has expired' };
  }
  if (coupon.maxUses >= 0 && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, discountStars: 0, reason: 'Coupon usage limit reached' };
  }

  const discountStars = Math.max(0, Math.floor((priceStars * coupon.percentOff) / 100));
  return { ok: true, discountStars, coupon };
}

export async function deactivateCoupon(code: string): Promise<Coupon> {
  const normalized = normalizeCode(code ?? '');
  const coupon = await db.coupon.findUnique({ where: { code: normalized } });
  if (!coupon) throw new NotFoundError('Coupon');
  return db.coupon.update({ where: { id: coupon.id }, data: { active: false } });
}

/** Fire-and-forget redemption counter — never throws. */
export async function incrementCouponUse(couponId: string): Promise<void> {
  try {
    await db.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
  } catch (err) {
    logger.warn({ err, couponId }, '🎟️ incrementCouponUse failed (non-fatal)');
  }
}

export async function couponStats(): Promise<{ total: number; active: number; redemptions: number }> {
  const now = new Date();
  const [total, active, agg] = await Promise.all([
    db.coupon.count(),
    db.coupon.count({
      where: {
        active: true,
        OR: [{ activeUntil: null }, { activeUntil: { gt: now } }],
      },
    }),
    db.coupon.aggregate({ _sum: { usedCount: true } }),
  ]);
  return { total, active, redemptions: agg._sum.usedCount ?? 0 };
}
