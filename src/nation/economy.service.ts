/**
 * Economy service — the nation's monetary indicators, READ-ONLY.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reconstructs the Closed Economy service (v1.5.0 line, commit 7326ad6).
 * Every query here is an aggregate; this service never mutates money.
 * The only writer of money remains wallet.service (atomic, integer-only).
 */
import { db } from '../core/db';
import {
  checkInvariant,
  DINAR,
  HITL_THRESHOLD_DINAR,
  MINT_DAILY_CAPS,
  TAX_DEFAULT_PERCENT,
  TAX_MAX_PERCENT,
  type InvariantReport,
} from './charter';

export interface EconomyIndicators {
  currency: typeof DINAR;
  citizens: number;
  /** Σ Wallet.credits — the official dinar supply (Article 1). */
  supplyDinar: number;
  ledgerRows: number;
  /** Σ signed credit-ledger rows (positive + negative). */
  ledgerSumDinar: number;
  /** Σ documented adjustments (itemized in the genesis audit). */
  documentedAdjustmentsDinar: number;
  purchases: number;
  products: number;
  starsInReserve: number;
  taxPercent: number;
  taxMaxPercent: number;
  mintCaps: typeof MINT_DAILY_CAPS;
  hitlThreshold: number;
  generatedAt: string;
}

/**
 * Documented adjustments from the genesis audit of the heritage ledger
 * (see scripts/nation/nation-genesis-proof.py and worklog Task 5):
 *   Σ balances 187,672.8 vs Σ ledger 187,735.8 → gap −63.0 Đ, itemized 100%:
 *   −450 = nine 50-Đ purchases recorded in purchases but lacking ledger rows
 *   (+387 manual owner credit recorded on the owner balance without a row).
 * The heritage DB itself must be re-attached by the owner to re-run the
 * forensic script; until then these are the recorded, published figures.
 */
export const GENESIS_AUDIT = {
  balances: 187_672.8,
  ledger: 187_735.8,
  gap: -63.0,
  itemization: [
    { reason: 'heritage purchases without ledger rows (9 × 50 Đ)', dinar: -450 },
    { reason: 'manual owner credit without a ledger row', dinar: 387 },
  ],
  citizens: 466,
  purchases: 108,
  source: 'marketplace-20260924-0400.db (heritage backup)',
} as const;

/** Live indicators for GET /api/v1/nation/economy (public, read-only). */
export async function getEconomyIndicators(): Promise<EconomyIndicators> {
  const [walletAgg, txAgg, purchaseCount, productCount, starsAgg] = await Promise.all([
    db.wallet.aggregate({ _sum: { credits: true }, _count: true }),
    db.transaction.aggregate({
      where: { currency: 'credits' },
      _sum: { amount: true },
      _count: true,
    }),
    db.order.count(),
    db.product.count(),
    db.wallet.aggregate({ _sum: { stars: true } }),
  ]);

  return {
    currency: DINAR,
    citizens: walletAgg._count,
    supplyDinar: walletAgg._sum.credits ?? 0,
    ledgerRows: txAgg._count,
    ledgerSumDinar: txAgg._sum.amount ?? 0,
    documentedAdjustmentsDinar: 0, // live books must be exact; heritage gap is archived
    purchases: purchaseCount,
    products: productCount,
    starsInReserve: starsAgg._sum.stars ?? 0,
    taxPercent: TAX_DEFAULT_PERCENT,
    taxMaxPercent: TAX_MAX_PERCENT,
    mintCaps: MINT_DAILY_CAPS,
    hitlThreshold: HITL_THRESHOLD_DINAR,
    generatedAt: new Date().toISOString(),
  };
}

/** Sacred-invariant check over the LIVE books (Article 7). */
export async function verifySacredInvariant(): Promise<InvariantReport> {
  const [walletAgg, txAgg] = await Promise.all([
    db.wallet.aggregate({ _sum: { credits: true } }),
    db.transaction.aggregate({
      where: { currency: 'credits' },
      _sum: { amount: true },
    }),
  ]);
  return checkInvariant(
    walletAgg._sum.credits ?? 0,
    txAgg._sum.amount ?? 0,
    0,
  );
}

/** The archived genesis audit — public transparency about the heritage gap. */
export function getGenesisAudit(): typeof GENESIS_AUDIT {
  return GENESIS_AUDIT;
}
