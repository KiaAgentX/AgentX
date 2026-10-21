/**
 * Nation Charter — the monetary law of the Digital Nation, as code.
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, integer-exact, side-effect-free. The economy service and any future
 * parliament resolutions consume THESE functions; nobody else does money math.
 *
 * Faithful reconstruction (v1.5.1) of the charter first ratified in the
 * Closed Economy step (v1.5.0 line, commit 7326ad6 — lost to a workspace
 * reset, specs preserved verbatim in the empire worklog/skill).
 *
 * Invariants (see docs/economy-charter.md):
 *  A1 — the national currency is the Digital Dinar (Đ / DNX); credits are
 *       renamed 1:1 — never devalued, never re-based.
 *  A2 — Telegram Stars are the foreign reserve; Đ is internal only.
 *  A3 — the treasury collects commission before any seller payout.
 *  A4 — default tax = 10% (matches the REAL commission default in
 *       order.service: commission_percent='10'), legal cap 90%.
 *  A5 — minting (quest/referral rewards) has daily caps.
 *  A6 — burning happens only on documented cancellation paths.
 *  A7 — the sacred invariant: Σ balances ≡ Σ ledger + itemized adjustments.
 *  A8 — mint caps: quest ≤ 10,000 Đ/day · referral ≤ 5,000 Đ/day
 *       (set ABOVE the real rewards 500/200 so law never hostage business).
 *  A9 — single money actions ≥ 50,000 Đ require a human decision (HITL).
 *  A10 — the nation's money API is read-only and public.
 */

/** National currency unit — Digital Dinar (1 Đ = 1 credit, 1:1, forever). */
export const DINAR = { symbol: 'Đ', code: 'DNX', name: 'Digital Dinar' } as const;

/** Article 4 — tax law: default 10% (real code default), legal cap 90%. */
export const TAX_DEFAULT_PERCENT = 10;
export const TAX_MAX_PERCENT = 90;

/** Article 8 — daily mint caps (per issuing kind). */
export const MINT_DAILY_CAPS = {
  quest: 10_000,
  referral: 5_000,
} as const;

export type MintKind = keyof typeof MINT_DAILY_CAPS;

/** Article 9 — above this many Đ, a single money action needs a human (HITL). */
export const HITL_THRESHOLD_DINAR = 50_000;

export interface TaxSplit {
  /** Gross amount the buyer paid (integer Đ). */
  gross: number;
  /** Percent actually applied (integer, 0..90 after clamping). */
  percent: number;
  /** Treasury share (Article 3): floor(gross × percent / 100). */
  treasury: number;
  /** Seller share: gross − treasury. Always ≥ 0. */
  seller: number;
}

/**
 * Article 3+4 — split a gross Đ payment between treasury and seller.
 * Integer-exact: treasury takes the FLOOR, the seller keeps the remainder,
 * so no đinar is ever created or destroyed by rounding.
 */
export function splitTax(gross: number, percent: number = TAX_DEFAULT_PERCENT): TaxSplit {
  validateDinarAmount(gross);
  const p = clampTaxPercent(percent);
  const treasury = Math.floor((gross * p) / 100);
  const seller = gross - treasury;
  return { gross, percent: p, treasury, seller };
}

/** Clamp a proposed tax percent into the legal range [0, TAX_MAX_PERCENT]. */
export function clampTaxPercent(percent: number): number {
  if (!Number.isInteger(percent)) {
    throw new RangeError('tax percent must be an integer');
  }
  return Math.min(Math.max(percent, 0), TAX_MAX_PERCENT);
}

/**
 * Validate a Đ amount: a positive integer. Credits are integers — floats,
 * NaN, negatives and zero gross amounts are rejected fail-closed.
 */
export function validateDinarAmount(n: number): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`invalid dinar amount: ${n} — money is integer and positive`);
  }
}

/**
 * Article 8 — assert a mint (reward) stays inside its daily cap.
 * `mintedToday` is the running total already minted for this kind today.
 */
export function assertWithinMintCap(kind: MintKind, amount: number, mintedToday: number): void {
  validateDinarAmount(amount);
  const cap = MINT_DAILY_CAPS[kind];
  if (mintedToday + amount > cap) {
    throw new RangeError(
      `mint cap exceeded for ${kind}: ${mintedToday}+${amount} > ${cap} Đ/day (Article 8)`,
    );
  }
}

/** Article 9 — does this single action require a human approval (HITL)? */
export function requiresHitl(amount: number): boolean {
  return Math.abs(amount) >= HITL_THRESHOLD_DINAR;
}

export interface InvariantReport {
  ok: boolean;
  /** Σ wallet balances (Đ). */
  balances: number;
  /** Σ signed ledger rows (Đ). */
  ledger: number;
  /** Σ documented, itemized adjustments (Đ). */
  adjustments: number;
  /** balances − ledger − adjustments; MUST be 0 when ok. */
  gap: number;
  /** Human-readable itemization when ok is false. */
  detail?: string;
}

/**
 * Article 7 — the Sacred Invariant:
 *   Σ balances ≡ Σ ledger + Σ documented adjustments.
 * A gap that cannot be itemized is an audit failure — fail-closed, always.
 */
export function checkInvariant(balances: number, ledger: number, adjustments: number): InvariantReport {
  const gap = balances - ledger - adjustments;
  return {
    ok: gap === 0,
    balances,
    ledger,
    adjustments,
    gap,
    detail:
      gap === 0
        ? 'sacred invariant holds: every Đ is accounted for'
        : `invariant broken: ${gap} Đ unaccounted — audit failed (Article 7)`,
  };
}
